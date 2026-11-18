// Which albums you own: the bridge between the two halves of the app. Albums
// here are MusicBrainz release groups; your records are Discogs releases.
//
// Exact first: many release groups link to their Discogs master, so each
// master in your collection copy is looked up once (shared, `master_groups`).
// Fallback: normalised artist + title, for records whose master has no link.
// The index is rebuilt only when your copy is re-synced.
import { getDb, now } from "@/lib/db";
import { releaseGroupForDiscogsMaster } from "@/lib/musicbrainz";
import { mastersOf } from "@/lib/master-years";
import { copyFor } from "@/lib/collection-copy";
import { formatLine, artistLine } from "@/lib/shelf";
import type { DiscogsCollectionItem } from "@/types/discogs";

export interface OwnedCopy {
  releaseId: number;
  format: string;     // "LP, Album, Reissue"
  added: string;      // ISO date it went into your collection
  copies: number;
  title: string;
  artist: string;
  year: number | null;
}

/** Lowercase, no accents, no "the", no Discogs "(2)"/"*", no punctuation. */
export function nameKey(artist: string, title: string) {
  const n = (s: string) =>
    s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/\s\(\d+\)/g, "").replace(/\*/g, "").replace(/&/g, " and ")
      .replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
  return `${n(artist)}|${n(title)}`;
}

function groupsFor(masterIds: number[]): Map<number, string | null> {
  const out = new Map<number, string | null>();
  if (!masterIds.length) return out;
  const rows = getDb()
    .prepare("SELECT master_id, rg_mbid FROM master_groups WHERE master_id IN (SELECT value FROM json_each(?))")
    .all(JSON.stringify(masterIds)) as { master_id: number; rg_mbid: string | null }[];
  for (const r of rows) out.set(r.master_id, r.rg_mbid);
  return out;
}

/* ── the lookups, in the background after a sync ─────────────────────────── */

const linking = new Set<number>();

export function warmMasterGroups(userId: number, items: DiscogsCollectionItem[]) {
  if (linking.has(userId)) return;
  linking.add(userId);
  (async () => {
    const masters = mastersOf(items.map((i) => i.basic_information.master_id));
    const known = groupsFor(masters);
    let n = 0, fails = 0;
    for (const m of masters) {
      if (known.has(m)) continue;
      if (fails >= 5) { console.error(`Owned matching ${userId}: stopping after 5 failures in a row`); break; }
      try {
        const rg = await releaseGroupForDiscogsMaster(m);
        getDb().prepare("INSERT OR REPLACE INTO master_groups (master_id, rg_mbid, checked_at) VALUES (?, ?, ?)").run(m, rg, now());
        n++; fails = 0;
      } catch (e) {
        fails++;
        console.error(`Owned matching ${userId}: master ${m}:`, e instanceof Error ? e.message : e);
      }
    }
    if (n) console.log(`Owned matching: ${n} masters looked up for user ${userId}`);
    built.delete(userId);
  })().finally(() => linking.delete(userId));
}

/* ── the index ───────────────────────────────────────────────────────────── */

interface Index {
  syncedAt: number;
  byGroup: Map<string, OwnedCopy>;
  byName: Map<string, OwnedCopy>;
  /** Release groups that are linked and owned (for "Put one on"). */
  groups: string[];
}
const built = new Map<number, Index>();

function index(userId: number): Index | null {
  const copy = copyFor(userId);
  if (!copy) return null;
  const hit = built.get(userId);
  if (hit && hit.syncedAt === copy.syncedAt) return hit;
  const groups = groupsFor(mastersOf(copy.items.map((i) => i.basic_information.master_id)));
  const byGroup = new Map<string, OwnedCopy>();
  const byName = new Map<string, OwnedCopy>();
  for (const it of copy.items) {
    const b = it.basic_information;
    const artist = artistLine(b.artists);
    const owned: OwnedCopy = {
      releaseId: b.id, format: formatLine(b.formats), added: it.date_added, copies: 1,
      title: b.title, artist, year: b.year || null,
    };
    const rg = b.master_id ? groups.get(b.master_id) : undefined;
    if (rg) {
      const seen = byGroup.get(rg);
      if (seen) seen.copies++;
      else byGroup.set(rg, owned);
    } else if (rg === undefined || rg === null) {
      // No link (or not looked up yet): match by name instead.
      const k = nameKey(artist, b.title);
      const seen = byName.get(k);
      if (seen) seen.copies++;
      else byName.set(k, owned);
    }
  }
  const idx = { syncedAt: copy.syncedAt, byGroup, byName, groups: Array.from(byGroup.keys()) };
  built.set(userId, idx);
  return idx;
}

/** Your copy of this album, or null. */
export function ownedCopy(userId: number, album: { mbid: string; artist: string; title: string }): OwnedCopy | null {
  const idx = index(userId);
  if (!idx) return null;
  return idx.byGroup.get(album.mbid) ?? idx.byName.get(nameKey(album.artist, album.title)) ?? null;
}

/** Albums you own (linked exactly) that you haven't logged a listen for. */
export function ownedUnlogged(userId: number): { mbid: string; title: string; artist: string }[] {
  const idx = index(userId);
  if (!idx || !idx.groups.length) return [];
  const logged = new Set(
    (getDb()
      .prepare("SELECT album_mbid FROM listens WHERE user_id = ? AND album_mbid IN (SELECT value FROM json_each(?))")
      .all(userId, JSON.stringify(idx.groups)) as { album_mbid: string }[]).map((r) => r.album_mbid)
  );
  return idx.groups
    .filter((g) => !logged.has(g))
    .map((g) => ({ mbid: g, title: idx.byGroup.get(g)!.title, artist: idx.byGroup.get(g)!.artist }));
}
