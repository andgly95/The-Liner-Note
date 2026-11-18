// The album catalogue, from MusicBrainz — free, CC0 core data, with tracklists
// and the Cover Art Archive. An "album" here is a release GROUP (the work);
// its tracklist comes from one representative release of it.
//
// MusicBrainz asks for at most one request a second and a User-Agent with a
// contact; both are honoured below. Everything fetched is kept in SQLite, so an
// album costs MusicBrainz two requests the first time anybody opens it, ever.
import { getDb, now } from "@/lib/db";

const API = "https://musicbrainz.org/ws/2";
const UA = `TheLinerNote/0.2 ( ${process.env.NEXT_PUBLIC_APP_URL || "https://liner-note.guess-ai.app"} )`;
const ALBUM_TTL = 30 * 24 * 60 * 60 * 1000;
const DISCOG_TTL = 7 * 24 * 60 * 60 * 1000;

let nextSlot = 0;
async function mb<T>(path: string): Promise<T> {
  const t = Date.now();
  const at = Math.max(t, nextSlot);
  nextSlot = at + 1100;
  if (at > t) await new Promise((r) => setTimeout(r, at - t));
  const res = await fetch(`${API}${path}${path.includes("?") ? "&" : "?"}fmt=json`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 503) {
    // Their rate limiter. One polite retry, then give up.
    await new Promise((r) => setTimeout(r, 1500));
    return mb<T>(path);
  }
  if (!res.ok) throw new Error(`MusicBrainz ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

export const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const coverUrl = (mbid: string, size: 250 | 500 = 250) =>
  `https://coverartarchive.org/release-group/${mbid}/front-${size}`;

interface MBArtistCredit { name: string; joinphrase?: string; artist: { id: string; name: string; "sort-name"?: string; disambiguation?: string } }
interface MBReleaseGroup {
  id: string;
  title: string;
  score?: number;
  "primary-type"?: string;
  "secondary-types"?: string[];
  "first-release-date"?: string;
  "artist-credit"?: MBArtistCredit[];
  releases?: { id: string; status?: string; date?: string; country?: string }[];
}

const credit = (ac?: MBArtistCredit[]) => (ac ?? []).map((a) => a.name + (a.joinphrase ?? "")).join("").trim() || "Unknown artist";
const yearOf = (d?: string) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);

/* ── search ──────────────────────────────────────────────────────────────── */

export interface AlbumHit { mbid: string; title: string; artist: string; artistMbid: string | null; year: number | null; type: string | null; secondary: string[] }

const escapeLucene = (s: string) => s.replace(/([+\-!(){}[\]^"~*?:\\/]|&&|\|\|)/g, "\\$1");

/**
 * Albums and EPs matching free text ("rubber soul", "rubber soul beatles").
 * MusicBrainz scores a covers album titled "Rubber Soul" exactly as high as the
 * Beatles' own, so results are re-ranked by how many releases each has — the
 * one that has been pressed 121 times is the one people mean.
 */
export async function searchAlbums(q: string): Promise<AlbumHit[]> {
  const query = `(${escapeLucene(q)}) AND (primarytype:album OR primarytype:ep)`;
  const r = await mb<{ "release-groups": MBReleaseGroup[] }>(`/release-group?query=${encodeURIComponent(query)}&limit=40`);
  return (r["release-groups"] ?? [])
    .map((g) => {
      const releases = g.releases?.length ?? 0;
      const secondary = g["secondary-types"] ?? [];
      const rank = (g.score ?? 0) * (1 + Math.log10(1 + releases)) * (secondary.length ? 0.6 : 1);
      return { g, rank };
    })
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 20)
    .map(({ g }) => ({
      mbid: g.id,
      title: g.title,
      artist: credit(g["artist-credit"]),
      artistMbid: g["artist-credit"]?.[0]?.artist.id ?? null,
      year: yearOf(g["first-release-date"]),
      type: g["primary-type"] ?? null,
      secondary: g["secondary-types"] ?? [],
    }));
}

/* ── Discogs masters → release groups ──────────────────────────────────── */

/** The release group MusicBrainz links to this Discogs master, or null when
 *  none does (many masters have no link yet). Goes through the same 1/s queue. */
export async function releaseGroupForDiscogsMaster(masterId: number): Promise<string | null> {
  try {
    const r = await mb<{ relations?: { "target-type"?: string; "release_group"?: { id: string } }[] }>(
      `/url?resource=${encodeURIComponent(`https://www.discogs.com/master/${masterId}`)}&inc=release-group-rels`
    );
    return r.relations?.find((x) => x.release_group?.id)?.release_group?.id ?? null;
  } catch (e) {
    if (e instanceof Error && /MusicBrainz 404/.test(e.message)) return null; // no such URL known
    throw e;
  }
}

/* ── one album, with tracks ──────────────────────────────────────────────── */

export interface Track { key: string; idx: number; disc: number; number: string; title: string; length_ms: number | null }
export interface Album {
  mbid: string; title: string; artist: string; artist_mbid: string | null; year: number | null;
  type: string | null; secondary: string | null; tracks: Track[];
}

// The representative release: official, from the album's first release date
// (a bare "1965" from Canada otherwise sorts ahead of the UK "1965-12-03"),
// preferring worldwide/US/UK editions.
function pickRelease(g: MBReleaseGroup) {
  const first = g["first-release-date"] ?? "";
  const pref = ["XW", "US", "GB", "XE"];
  const official = (g.releases ?? []).filter((r) => (r.status ?? "Official") === "Official");
  const pool = official.length ? official : g.releases ?? [];
  return [...pool].sort((a, b) => {
    const exact = Number(b.date === first) - Number(a.date === first);
    if (exact) return exact;
    const da = a.date || "9999", dbb = b.date || "9999";
    if (da.slice(0, 4) !== dbb.slice(0, 4)) return da.localeCompare(dbb);
    const pa = pref.indexOf(a.country ?? ""), pb = pref.indexOf(b.country ?? "");
    return (pa === -1 ? 9 : pa) - (pb === -1 ? 9 : pb);
  })[0];
}

export function cachedAlbum(mbid: string): Album | null {
  const db = getDb();
  const a = db.prepare("SELECT * FROM albums WHERE mbid = ?").get(mbid) as (Album & { tracks_at: number | null }) | undefined;
  if (!a || !a.tracks_at || now() - a.tracks_at > ALBUM_TTL) return null;
  const tracks = db.prepare("SELECT key, idx, disc, number, title, length_ms FROM tracks WHERE album_mbid = ? ORDER BY idx").all(mbid) as Track[];
  return { mbid: a.mbid, title: a.title, artist: a.artist, artist_mbid: a.artist_mbid, year: a.year, type: a.type, secondary: a.secondary, tracks };
}

export async function getAlbum(mbid: string): Promise<Album> {
  if (!MBID.test(mbid)) throw new Error("Not an album id");
  const hit = cachedAlbum(mbid);
  if (hit) return hit;

  const g = await mb<MBReleaseGroup>(`/release-group/${mbid}?inc=releases+artist-credits`);
  const rel = pickRelease(g);
  const tracks: Track[] = [];
  if (rel) {
    const r = await mb<{ media?: { position: number; tracks?: { number: string; title: string; length?: number | null; recording: { id: string } }[] }[] }>(
      `/release/${rel.id}?inc=recordings`
    );
    const seen = new Set<string>();
    let idx = 0;
    for (const m of r.media ?? []) {
      for (const t of m.tracks ?? []) {
        // Keyed by RECORDING so a ranking survives a change of representative
        // release; a recording that appears twice gets a suffix.
        let key = t.recording.id;
        while (seen.has(key)) key = `${key}~`;
        seen.add(key);
        tracks.push({ key, idx: idx++, disc: m.position, number: t.number, title: t.title, length_ms: t.length ?? null });
      }
    }
  }
  const artist = g["artist-credit"]?.[0]?.artist;
  const album: Album = {
    mbid: g.id,
    title: g.title,
    artist: credit(g["artist-credit"]),
    artist_mbid: artist?.id ?? null,
    year: yearOf(g["first-release-date"]),
    type: g["primary-type"] ?? null,
    secondary: (g["secondary-types"] ?? []).join(", ") || null,
    tracks,
  };

  const db = getDb();
  db.transaction(() => {
    if (artist) {
      db.prepare(
        `INSERT INTO artists (mbid, name, sort_name, disambig, fetched_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(mbid) DO UPDATE SET name = excluded.name`
      ).run(artist.id, artist.name, artist["sort-name"] ?? null, artist.disambiguation ?? null, now());
    }
    db.prepare(
      `INSERT INTO albums (mbid, title, artist, artist_mbid, year, type, secondary, release_mbid, tracks_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(mbid) DO UPDATE SET title = excluded.title, artist = excluded.artist, artist_mbid = excluded.artist_mbid,
         year = excluded.year, type = excluded.type, secondary = excluded.secondary, release_mbid = excluded.release_mbid,
         tracks_at = excluded.tracks_at, fetched_at = excluded.fetched_at`
    ).run(album.mbid, album.title, album.artist, album.artist_mbid, album.year, album.type, album.secondary, rel?.id ?? null, now(), now());
    db.prepare("DELETE FROM tracks WHERE album_mbid = ?").run(album.mbid);
    const ins = db.prepare("INSERT INTO tracks (album_mbid, idx, key, disc, number, title, length_ms) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const t of tracks) ins.run(album.mbid, t.idx, t.key, t.disc, t.number, t.title, t.length_ms);
  })();
  return album;
}

/* ── an artist's discography ─────────────────────────────────────────────── */

export interface Discography {
  artist: { mbid: string; name: string; disambig: string | null };
  albums: { mbid: string; title: string; year: number | null; type: string | null; secondary: string | null }[];
}

export async function getDiscography(artistMbid: string): Promise<Discography> {
  if (!MBID.test(artistMbid)) throw new Error("Not an artist id");
  const db = getDb();
  const cached = db.prepare("SELECT album_mbids, fetched_at FROM artist_discogs WHERE artist_mbid = ?").get(artistMbid) as
    | { album_mbids: string; fetched_at: number }
    | undefined;
  const artistRow = db.prepare("SELECT mbid, name, disambig FROM artists WHERE mbid = ?").get(artistMbid) as
    | { mbid: string; name: string; disambig: string | null }
    | undefined;

  if (!cached || !artistRow || now() - cached.fetched_at > DISCOG_TTL) {
    const a = await mb<{ id: string; name: string; "sort-name"?: string; disambiguation?: string }>(`/artist/${artistMbid}`);
    const groups: MBReleaseGroup[] = [];
    for (let offset = 0; offset < 500; offset += 100) {
      const page = await mb<{ "release-groups": MBReleaseGroup[]; "release-group-count": number }>(
        // website-default drops release groups that only exist as bootlegs —
        // 705 Beatles groups become 187 — which is what a discography means.
        `/release-group?artist=${artistMbid}&type=album|ep&release-group-status=website-default&limit=100&offset=${offset}`
      );
      groups.push(...(page["release-groups"] ?? []));
      if (groups.length >= page["release-group-count"]) break;
    }
    db.transaction(() => {
      db.prepare(
        `INSERT INTO artists (mbid, name, sort_name, disambig, fetched_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(mbid) DO UPDATE SET name = excluded.name, sort_name = excluded.sort_name, disambig = excluded.disambig, fetched_at = excluded.fetched_at`
      ).run(a.id, a.name, a["sort-name"] ?? null, a.disambiguation || null, now());
      const up = db.prepare(
        `INSERT INTO albums (mbid, title, artist, artist_mbid, year, type, secondary, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(mbid) DO UPDATE SET title = excluded.title, year = excluded.year, type = excluded.type, secondary = excluded.secondary`
      );
      for (const g of groups) {
        up.run(g.id, g.title, a.name, a.id, yearOf(g["first-release-date"]), g["primary-type"] ?? null, (g["secondary-types"] ?? []).join(", ") || null, now());
      }
      db.prepare(
        `INSERT INTO artist_discogs (artist_mbid, album_mbids, fetched_at) VALUES (?, ?, ?)
         ON CONFLICT(artist_mbid) DO UPDATE SET album_mbids = excluded.album_mbids, fetched_at = excluded.fetched_at`
      ).run(a.id, JSON.stringify(groups.map((g) => g.id)), now());
    })();
  }

  const row = db.prepare("SELECT mbid, name, disambig FROM artists WHERE mbid = ?").get(artistMbid) as {
    mbid: string; name: string; disambig: string | null;
  };
  const ids: string[] = JSON.parse(
    (db.prepare("SELECT album_mbids FROM artist_discogs WHERE artist_mbid = ?").get(artistMbid) as { album_mbids: string }).album_mbids
  );
  const albums = ids.length
    ? (db
        .prepare(`SELECT mbid, title, year, type, secondary FROM albums WHERE mbid IN (${ids.map(() => "?").join(",")})`)
        .all(...ids) as Discography["albums"])
    : [];
  albums.sort((x, y) => (x.year ?? 9999) - (y.year ?? 9999) || x.title.localeCompare(y.title));
  return { artist: row, albums };
}
