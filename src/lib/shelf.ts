// The shelf display: one person's Discogs collection, readable by anyone with
// the shelf's link, for a tablet propped on the record shelf.
//
// The collection is snapshotted into SQLite (a big collection takes a second
// per 100 records to read from Discogs — far too slow to do per visit) and
// re-read in the background once the snapshot is older than REFRESH_AFTER.
// Everything a record shows is kept on the Pi: release pages (tracklist,
// images) in SQLite, cover and back-cover images as files beside the DB. A
// background warmer fills both after each snapshot, one Discogs call at a
// time, so the wall and every record open from the Pi — not from Discogs,
// whose image server answers a wall of covers loading at once with 429s.
// Only releases IN the snapshot are served: the link is not a Discogs proxy.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, getDb, now } from "@/lib/db";
import { discogsClient, type DiscogsReleaseFull } from "@/lib/discogs";
import { paced } from "@/lib/pressing-server";
import type { DiscogsCollectionItem, DiscogsOAuthTokens, DiscogsFormat, DiscogsArtist } from "@/types/discogs";

const REFRESH_AFTER = 6 * 3600 * 1000;
const DETAIL_TTL = 30 * 24 * 3600 * 1000; // tracklists hardly change
const IMAGE_DIR = path.join(DATA_DIR, "shelf-images");

export interface ShelfRow {
  user_id: number;
  token: string;        // the tablet's code
  share_token: string | null; // the link sent to friends
  title: string;
  discogs_username: string;
  access_token: string;
  access_secret: string;
  snapshot: string | null;
  snapshot_at: number | null;
  created_at: number;
}

/** One record on the shelf — what the grid needs, nothing personal. */
export interface ShelfItem {
  id: number;          // Discogs release id
  artist: string;
  title: string;
  year: number | null;      // this pressing's year
  master: number | null;    // Discogs master id (absent in snapshots from before it was kept)
  /** The album's original release year (the master's), filled in on the way
   *  to the client; falls back to the pressing's year. */
  original?: number | null;
  cover: string | null;
  label: string | null;
  catno: string | null;
  format: string;      // "2×LP, Album, Reissue"
  genres: string[];
  styles: string[];
  added: string;       // ISO date it went into the collection
  copies: number;
}

export interface ShelfTrack { position: string; title: string; duration: string | null }
export interface ShelfRelease {
  id: number;
  released: string | null;
  country: string | null;
  tracks: ShelfTrack[];
  images: string[];    // primary first; [1] is usually the back cover
}

/* ── tokens ─────────────────────────────────────────────────────────────── */

// Ten characters someone can read off a phone and type on a tablet: no 0/O,
// 1/l/i. 31^10 ≈ 8×10^14 — not guessable.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function newShelfToken(): string {
  const bytes = crypto.randomBytes(10);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
export const formatToken = (t: string) => `${t.slice(0, 5)}-${t.slice(5)}`;
/** Accepts the token typed with or without the dash, any case. */
export const normalizeToken = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");

/* ── rows ───────────────────────────────────────────────────────────────── */

export function shelfForUser(userId: number): ShelfRow | null {
  return (getDb().prepare("SELECT * FROM shelves WHERE user_id = ?").get(userId) as ShelfRow | undefined) ?? null;
}

/** The shelf either token opens — the tablet's code or the friends' link. */
export function shelfForToken(token: string): ShelfRow | null {
  const t = normalizeToken(token);
  if (t.length !== 10) return null;
  return (
    (getDb().prepare("SELECT * FROM shelves WHERE token = ? OR share_token = ?").get(t, t) as ShelfRow | undefined) ?? null
  );
}

/** Opened with the friends' link rather than the tablet's code. */
export const isShareToken = (shelf: ShelfRow, token: string) => shelf.share_token === normalizeToken(token);

/** The friends' link, made on first ask for shelves from before it existed. */
export function ensureShareToken(userId: number): ShelfRow | null {
  getDb().prepare("UPDATE shelves SET share_token = ? WHERE user_id = ? AND share_token IS NULL").run(newShelfToken(), userId);
  return shelfForUser(userId);
}

export function upsertShelf(userId: number, title: string, discogsUsername: string, tokens: DiscogsOAuthTokens): ShelfRow {
  const existing = shelfForUser(userId);
  if (existing) {
    getDb()
      .prepare("UPDATE shelves SET title = ?, discogs_username = ?, access_token = ?, access_secret = ? WHERE user_id = ?")
      .run(title, discogsUsername, tokens.accessToken, tokens.accessTokenSecret, userId);
  } else {
    getDb()
      .prepare(
        `INSERT INTO shelves (user_id, token, share_token, title, discogs_username, access_token, access_secret, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(userId, newShelfToken(), newShelfToken(), title, discogsUsername, tokens.accessToken, tokens.accessTokenSecret, now());
  }
  return shelfForUser(userId)!;
}

export function renameShelf(userId: number, title: string) {
  getDb().prepare("UPDATE shelves SET title = ? WHERE user_id = ?").run(title, userId);
}

export function rotateShelfToken(userId: number) {
  getDb().prepare("UPDATE shelves SET token = ? WHERE user_id = ?").run(newShelfToken(), userId);
}

export function rotateShareToken(userId: number) {
  getDb().prepare("UPDATE shelves SET share_token = ? WHERE user_id = ?").run(newShelfToken(), userId);
}

export function deleteShelf(userId: number) {
  getDb().prepare("DELETE FROM shelves WHERE user_id = ?").run(userId);
}

/* ── the snapshot ───────────────────────────────────────────────────────── */

const cleanArtist = (name: string) => name.replace(/\s\(\d+\)$/, "").replace(/\*$/, "");

export function artistLine(artists: Pick<DiscogsArtist, "name" | "join">[] | undefined): string {
  if (!artists?.length) return "Unknown artist";
  return artists
    .map((a, i) => cleanArtist(a.name) + (i < artists.length - 1 ? (a.join ? ` ${a.join.trim()} ` : ", ") : ""))
    .join("")
    .replace(/\s+,/g, ",");
}

export function formatLine(formats: DiscogsFormat[] | undefined): string {
  const f = formats?.[0];
  if (!f) return "";
  const qty = Number(f.qty) > 1 ? `${f.qty}×` : "";
  const parts = f.name === "Vinyl" ? f.descriptions ?? ["Vinyl"] : [f.name, ...(f.descriptions ?? [])];
  return qty + parts.join(", ");
}

function toItems(raw: DiscogsCollectionItem[]): ShelfItem[] {
  const byId = new Map<number, ShelfItem>();
  for (const r of raw) {
    const b = r.basic_information;
    const seen = byId.get(b.id);
    if (seen) {
      seen.copies++;
      if (r.date_added > seen.added) seen.added = r.date_added;
      continue;
    }
    const cover = b.cover_image && !b.cover_image.includes("spacer.gif") ? b.cover_image : null;
    byId.set(b.id, {
      id: b.id,
      artist: artistLine(b.artists),
      title: b.title,
      year: b.year || null,
      master: b.master_id || null,
      cover,
      label: b.labels?.[0]?.name ? cleanArtist(b.labels[0].name) : null,
      catno: b.labels?.[0]?.catno && b.labels[0].catno !== "none" ? b.labels[0].catno : null,
      format: formatLine(b.formats),
      genres: b.genres ?? [],
      styles: b.styles ?? [],
      added: r.date_added,
      copies: 1,
    });
  }
  return Array.from(byId.values());
}

const tokensOf = (s: ShelfRow): DiscogsOAuthTokens => ({ accessToken: s.access_token, accessTokenSecret: s.access_secret });

// One refresh per shelf at a time, however many tablets ask.
const refreshing = new Map<number, Promise<ShelfItem[]>>();

export function refreshShelf(shelf: ShelfRow): Promise<ShelfItem[]> {
  const running = refreshing.get(shelf.user_id);
  if (running) return running;
  const job = (async () => {
    const raw = await discogsClient.getFullCollection(shelf.discogs_username, tokensOf(shelf));
    const items = toItems(raw);
    getDb()
      .prepare("UPDATE shelves SET snapshot = ?, snapshot_at = ? WHERE user_id = ?")
      .run(JSON.stringify(items), now(), shelf.user_id);
    const fresh = shelfForUser(shelf.user_id);
    if (fresh) warmShelf(fresh);
    return items;
  })().finally(() => refreshing.delete(shelf.user_id));
  refreshing.set(shelf.user_id, job);
  return job;
}

/** The shelf's records: from the snapshot, refreshed in the background when
 *  stale; read from Discogs (and awaited) only when there is no snapshot yet. */
const warmedThisRun = new Set<number>();

export async function shelfItems(shelf: ShelfRow): Promise<{ items: ShelfItem[]; at: number }> {
  if (shelf.snapshot && shelf.snapshot_at) {
    if (!warmedThisRun.has(shelf.user_id)) {
      warmedThisRun.add(shelf.user_id);
      // Snapshots from before master ids were kept: read the collection again
      // (a few requests), which warms afterwards; otherwise just warm.
      const old = (JSON.parse(shelf.snapshot) as ShelfItem[]).some((i) => !("master" in i));
      if (old) refreshShelf(shelf).catch((e) => console.error("Shelf refresh failed:", e instanceof Error ? e.message : e));
      else warmShelf(shelf);
    }
    if (now() - shelf.snapshot_at > REFRESH_AFTER) {
      refreshShelf(shelf).catch((e) => console.error("Shelf refresh failed:", e instanceof Error ? e.message : e));
    }
    return { items: JSON.parse(shelf.snapshot) as ShelfItem[], at: shelf.snapshot_at };
  }
  const items = await refreshShelf(shelf);
  return { items, at: now() };
}

/* ── one release ───────────────────────────────────────────────────────── */

type ReleaseWithTracks = DiscogsReleaseFull & {
  tracklist?: { position: string; title: string; duration?: string; type_?: string }[];
};

const snapshotItems = (shelf: ShelfRow): ShelfItem[] => (shelf.snapshot ? JSON.parse(shelf.snapshot) : []);

function storedRelease(id: number): { release: ShelfRelease; at: number } | null {
  const row = getDb().prepare("SELECT data, fetched_at FROM release_cache WHERE id = ?").get(id) as
    | { data: string; fetched_at: number }
    | undefined;
  return row ? { release: JSON.parse(row.data), at: row.fetched_at } : null;
}

const fetchingRelease = new Map<number, Promise<ShelfRelease>>();

async function fetchRelease(shelf: ShelfRow, id: number): Promise<ShelfRelease> {
  const running = fetchingRelease.get(id);
  if (running) return running;
  const job = (async () => {
    const r = (await paced(() => discogsClient.getReleaseFull(id, tokensOf(shelf)))) as ReleaseWithTracks;
    const images = [...(r.images ?? [])].sort((a, b) => (a.type === "primary" ? -1 : b.type === "primary" ? 1 : 0));
    const release: ShelfRelease = {
      id: r.id,
      released: r.released || (r.year ? String(r.year) : null),
      country: r.country || null,
      tracks: (r.tracklist ?? [])
        .filter((t) => !t.type_ || t.type_ === "track")
        .map((t) => ({ position: t.position, title: t.title, duration: t.duration || null })),
      images: images.map((i) => i.uri).filter(Boolean).slice(0, 8),
    };
    getDb()
      .prepare("INSERT OR REPLACE INTO release_cache (id, data, fetched_at) VALUES (?, ?, ?)")
      .run(id, JSON.stringify(release), now());
    return release;
  })().finally(() => fetchingRelease.delete(id));
  fetchingRelease.set(id, job);
  return job;
}

/** A release on this shelf, from the Pi when it has it. Discogs URLs inside —
 *  `forClient` swaps them for the Pi's. */
export async function shelfRelease(shelf: ShelfRow, releaseId: number): Promise<ShelfRelease | null> {
  if (!snapshotItems(shelf).some((i) => i.id === releaseId)) return null;
  const hit = storedRelease(releaseId);
  if (hit && now() - hit.at < DETAIL_TTL) return hit.release;
  try {
    return await fetchRelease(shelf, releaseId);
  } catch (e) {
    if (hit) return hit.release; // stale beats nothing
    throw e;
  }
}

/* ── images, on the Pi ──────────────────────────────────────────────────── */

// Discogs' image server rate-limits bursts. Three at a time, with backoff on
// 429, is what it takes; the files then never need asking for again.
const IMAGE_CONCURRENCY = 3;
let imageSlots = IMAGE_CONCURRENCY;
const imageWaiters: (() => void)[] = [];
async function imageQueue<T>(fn: () => Promise<T>): Promise<T> {
  if (imageSlots === 0) await new Promise<void>((r) => imageWaiters.push(r));
  else imageSlots--;
  try {
    return await fn();
  } finally {
    const next = imageWaiters.shift();
    if (next) next();
    else imageSlots++;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const imageFile = (url: string) => path.join(IMAGE_DIR, crypto.createHash("sha1").update(url).digest("hex").slice(0, 24));
const fetchingImage = new Map<string, Promise<Buffer>>();

async function storedImage(url: string): Promise<Buffer> {
  const file = imageFile(url);
  try {
    return await fs.promises.readFile(file);
  } catch {}
  const running = fetchingImage.get(file);
  if (running) return running;
  const job = imageQueue(async () => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { headers: { "User-Agent": "TheLinerNote/1.0 (shelf display)" } });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        await fs.promises.mkdir(IMAGE_DIR, { recursive: true });
        await fs.promises.writeFile(`${file}.tmp`, buf);
        await fs.promises.rename(`${file}.tmp`, file);
        return buf;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        await sleep([1500, 4000, 9000, 20000][attempt]);
        continue;
      }
      throw new Error(`Image ${res.status}`);
    }
  }).finally(() => fetchingImage.delete(file));
  fetchingImage.set(file, job);
  return job;
}

export function imageType(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.subarray(0, 3).toString() === "GIF") return "image/gif";
  return "image/jpeg";
}

/** Image `n` of a record on this shelf: 0 is the wall's cover, 1+ the release
 *  page's images (1 is usually the back). Null when there's no such image. */
export async function shelfImage(shelf: ShelfRow, releaseId: number, n: number): Promise<Buffer | null> {
  const item = snapshotItems(shelf).find((i) => i.id === releaseId);
  if (!item) return null;
  const url = n === 0 ? item.cover : (await shelfRelease(shelf, releaseId))?.images[n];
  if (!url || !/^https:\/\/([^/]+\.)?(discogs\.com|coverartarchive\.org|archive\.org)\//.test(url)) return null;
  return storedImage(url);
}

/* ── original release years ─────────────────────────────────────────────── */

function masterYears(ids: number[]): Map<number, number | null> {
  const out = new Map<number, number | null>();
  if (!ids.length) return out;
  const rows = getDb()
    .prepare("SELECT id, year FROM master_years WHERE id IN (SELECT value FROM json_each(?))")
    .all(JSON.stringify(ids)) as { id: number; year: number | null }[];
  for (const r of rows) out.set(r.id, r.year);
  return out;
}

async function fetchMasterYear(shelf: ShelfRow, masterId: number): Promise<number | null> {
  const m = await paced(() => discogsClient.getMaster(masterId, tokensOf(shelf)));
  const year = m.year && m.year > 0 ? m.year : null;
  getDb().prepare("INSERT OR REPLACE INTO master_years (id, year, fetched_at) VALUES (?, ?, ?)").run(masterId, year, now());
  return year;
}

/** What leaves the Pi: image URLs pointing at the Pi, not at Discogs, and
 *  each record's original release year. */
export function itemsForClient(items: ShelfItem[], token: string): ShelfItem[] {
  const years = masterYears(Array.from(new Set(items.map((i) => i.master).filter((m): m is number => !!m))));
  return items.map((i) => ({
    ...i,
    original: (i.master ? years.get(i.master) : null) ?? i.year,
    cover: i.cover ? `/api/shelf/${token}/img/${i.id}/0` : null,
  }));
}
export function releaseForClient(r: ShelfRelease, token: string): ShelfRelease {
  return { ...r, images: r.images.map((_, n) => `/api/shelf/${token}/img/${r.id}/${n === 0 ? 0 : n}`) };
}

/* ── the warmer ─────────────────────────────────────────────────────────── */

// After a snapshot (and once per process start), fetch every record's page and
// images that the Pi doesn't have yet — newest additions first. One release
// call at a time through the shared Discogs queue, so it never crowds out
// someone using the pressing finder: it only ever holds one slot.
const warming = new Set<number>();

// Discogs' 60-a-minute limit is shared with everything else using these
// tokens (the collection read, the dashboard), so the paced queue alone can
// still meet a 429. That's "wait", not "failed": pause a minute, try again.
const rateLimited = (e: unknown) => e instanceof Error && /\b429\b/.test(e.message);
async function patiently<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!rateLimited(e) || i >= 5) throw e;
      await sleep(60_000);
    }
  }
}

export function warmShelf(shelf: ShelfRow) {
  if (warming.has(shelf.user_id)) return;
  warming.add(shelf.user_id);
  (async () => {
    const items = [...snapshotItems(shelf)].sort((a, b) => b.added.localeCompare(a.added));
    // Original years first: they're what the Year order needs, and quick
    // (one call per album, not per pressing).
    const masters = Array.from(new Set(items.map((i) => i.master).filter((m): m is number => !!m)));
    const known = masterYears(masters);
    let masterFails = 0;
    for (const m of masters) {
      if (known.has(m) || masterFails >= 5) continue;
      if (!shelfForUser(shelf.user_id)) return;
      try {
        await patiently(() => fetchMasterYear(shelf, m));
        masterFails = 0;
      } catch (e) {
        masterFails++;
        console.error(`Shelf warm: master ${m}:`, e instanceof Error ? e.message : e);
      }
    }
    let fetched = 0;
    let failures = 0;
    for (const it of items) {
      if (failures >= 5) {
        console.error(`Shelf warm: stopping for shelf ${shelf.user_id} after 5 failures in a row; next refresh tries again`);
        return;
      }
      if (!shelfForUser(shelf.user_id)) return; // turned off: stop
      try {
        if (it.cover) await storedImage(it.cover);
        const hit = storedRelease(it.id);
        const rel = hit && now() - hit.at < DETAIL_TTL ? hit.release : (fetched++, await patiently(() => fetchRelease(shelf, it.id)));
        if (rel.images[1]) await storedImage(rel.images[1]);
        failures = 0;
      } catch (e) {
        failures++;
        console.error(`Shelf warm: release ${it.id}:`, e instanceof Error ? e.message : e);
      }
    }
    if (fetched) console.log(`Shelf warm: ${fetched} release pages saved for shelf ${shelf.user_id}`);
  })().finally(() => warming.delete(shelf.user_id));
}

/** How many of the shelf's records the Pi has fully (page saved). */
export function savedCount(shelf: ShelfRow): number {
  const ids = snapshotItems(shelf).map((i) => i.id);
  if (!ids.length) return 0;
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM release_cache WHERE id IN (SELECT value FROM json_each(?))")
    .get(JSON.stringify(ids)) as { n: number };
  return row.n;
}
