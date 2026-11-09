// Listening, rating and ranking — and what everyone's together adds up to.
// Server only. Every write takes the user from the session, never the request.
import { getDb, now } from "@/lib/db";
import { getAlbum, type Album } from "@/lib/musicbrainz";
import { scaleById, rankModeById, SCALES } from "@/lib/scales";
import type { User } from "@/lib/auth/session";

export class PremiumRequired extends Error {
  constructor(what: string) { super(`${what} is a premium feature`); }
}

/* ── writes ──────────────────────────────────────────────────────────────── */

export function setListened(user: User, mbid: string, listened: boolean) {
  const db = getDb();
  if (listened) {
    db.prepare("INSERT OR IGNORE INTO listens (user_id, album_mbid, created_at) VALUES (?, ?, ?)").run(user.id, mbid, now());
  } else {
    // Un-listening takes your rating and ranking with it: they were claims about
    // an album you are now saying you haven't heard.
    db.transaction(() => {
      db.prepare("DELETE FROM listens WHERE user_id = ? AND album_mbid = ?").run(user.id, mbid);
      db.prepare("DELETE FROM ratings WHERE user_id = ? AND album_mbid = ?").run(user.id, mbid);
      db.prepare("DELETE FROM rankings WHERE user_id = ? AND album_mbid = ?").run(user.id, mbid);
    })();
  }
}

export function setRating(user: User, mbid: string, scaleId: string, raw: string | null) {
  const db = getDb();
  if (raw === null) {
    db.prepare("DELETE FROM ratings WHERE user_id = ? AND album_mbid = ?").run(user.id, mbid);
    return null;
  }
  const scale = scaleById(scaleId);
  if (!scale) throw new RangeError("Unknown scale");
  if (scale.premium && !user.premium) throw new PremiumRequired(`The ${scale.label} scale`);
  const score = scale.toScore(String(raw));
  if (score === null) throw new RangeError("Not a value on that scale");
  db.transaction(() => {
    db.prepare("INSERT OR IGNORE INTO listens (user_id, album_mbid, created_at) VALUES (?, ?, ?)").run(user.id, mbid, now());
    db.prepare(
      `INSERT INTO ratings (user_id, album_mbid, score, scale, raw, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, album_mbid) DO UPDATE SET score = excluded.score, scale = excluded.scale, raw = excluded.raw, updated_at = excluded.updated_at`
    ).run(user.id, mbid, score, scale.id, String(raw), now());
  })();
  return { score, scale: scale.id, raw: String(raw) };
}

export async function setRanking(user: User, mbid: string, modeId: string, order: unknown, payload: unknown) {
  const mode = rankModeById(modeId);
  if (!mode) throw new RangeError("Unknown ranking mode");
  if (mode.premium && !user.premium) throw new PremiumRequired(`${mode.label} ranking`);
  const album = await getAlbum(mbid);
  const keys = new Set(album.tracks.map((t) => t.key));
  // The order must be every track exactly once — a ranking with a track missing
  // or invented would quietly skew the community ranking.
  if (!Array.isArray(order) || order.length !== keys.size || new Set(order).size !== keys.size || !order.every((k) => keys.has(k))) {
    throw new RangeError("The order must list every track on the album exactly once");
  }
  const body = payload === undefined || payload === null ? null : JSON.stringify(payload).slice(0, 20000);
  const db = getDb();
  db.transaction(() => {
    db.prepare("INSERT OR IGNORE INTO listens (user_id, album_mbid, created_at) VALUES (?, ?, ?)").run(user.id, mbid, now());
    db.prepare(
      `INSERT INTO rankings (user_id, album_mbid, mode, track_order, payload, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, album_mbid) DO UPDATE SET mode = excluded.mode, track_order = excluded.track_order, payload = excluded.payload, updated_at = excluded.updated_at`
    ).run(user.id, mbid, mode.id, JSON.stringify(order), body, now());
  })();
}

export function clearRanking(user: User, mbid: string) {
  getDb().prepare("DELETE FROM rankings WHERE user_id = ? AND album_mbid = ?").run(user.id, mbid);
}

/* ── reads ───────────────────────────────────────────────────────────────── */

export interface CommunityTrack { key: string; avgPosition: number; topPicks: number }

/**
 * Everyone's rankings of this album, combined. Each ranking places a track at a
 * fraction of the way down (0 = best, 1 = worst), so albums ranked by many and
 * by few contribute on the same footing; tracks are ordered by the average.
 */
function communityRanking(album: Album): { voters: number; tracks: CommunityTrack[] } {
  const rows = getDb().prepare("SELECT track_order FROM rankings WHERE album_mbid = ?").all(album.mbid) as { track_order: string }[];
  const keys = album.tracks.map((t) => t.key);
  const sum = new Map(keys.map((k) => [k, 0]));
  const top = new Map(keys.map((k) => [k, 0]));
  let voters = 0;
  for (const r of rows) {
    const order: string[] = JSON.parse(r.track_order);
    if (order.length < 2) continue;
    voters++;
    order.forEach((k, i) => { if (sum.has(k)) sum.set(k, sum.get(k)! + i / (order.length - 1)); });
    if (top.has(order[0])) top.set(order[0], top.get(order[0])! + 1);
  }
  if (!voters) return { voters: 0, tracks: [] };
  const tracks = keys
    .map((k) => ({ key: k, avgPosition: sum.get(k)! / voters, topPicks: top.get(k)! }))
    .sort((a, b) => a.avgPosition - b.avgPosition);
  return { voters, tracks };
}

export async function albumView(mbid: string, viewer: User | null) {
  const album = await getAlbum(mbid);
  const db = getDb();
  const stats = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM listens WHERE album_mbid = ?) AS listeners,
              (SELECT COUNT(*) FROM ratings WHERE album_mbid = ?) AS ratings,
              (SELECT AVG(score) FROM ratings WHERE album_mbid = ?) AS avg`
    )
    .get(mbid, mbid, mbid) as { listeners: number; ratings: number; avg: number | null };

  let mine = null;
  if (viewer) {
    const listened = !!db.prepare("SELECT 1 FROM listens WHERE user_id = ? AND album_mbid = ?").get(viewer.id, mbid);
    const rating = db.prepare("SELECT score, scale, raw FROM ratings WHERE user_id = ? AND album_mbid = ?").get(viewer.id, mbid) as
      | { score: number; scale: string; raw: string } | undefined;
    const ranking = db.prepare("SELECT mode, track_order, payload FROM rankings WHERE user_id = ? AND album_mbid = ?").get(viewer.id, mbid) as
      | { mode: string; track_order: string; payload: string | null } | undefined;
    mine = {
      listened,
      rating: rating ?? null,
      ranking: ranking ? { mode: ranking.mode, order: JSON.parse(ranking.track_order) as string[], payload: ranking.payload ? JSON.parse(ranking.payload) : null } : null,
    };
  }

  // Who else has been here — newest first, a handful.
  const recent = db
    .prepare(
      `SELECT u.handle, u.name, u.avatar_url, r.raw, r.scale, l.created_at,
              EXISTS(SELECT 1 FROM rankings k WHERE k.user_id = u.id AND k.album_mbid = l.album_mbid) AS ranked
         FROM listens l JOIN users u ON u.id = l.user_id
         LEFT JOIN ratings r ON r.user_id = l.user_id AND r.album_mbid = l.album_mbid
        WHERE l.album_mbid = ?
        ORDER BY COALESCE(r.updated_at, l.created_at) DESC LIMIT 12`
    )
    .all(mbid);

  return {
    album,
    stats: { listeners: stats.listeners, ratings: stats.ratings, avgScore: stats.avg === null ? null : Math.round(stats.avg * 10) / 10 },
    community: communityRanking(album),
    mine,
    recent,
    viewer: viewer ? { handle: viewer.handle, premium: !!viewer.premium } : null,
    scales: SCALES.map((s) => ({ id: s.id, label: s.label, premium: s.premium, steps: s.steps })),
  };
}

export function profileView(handle: string) {
  const db = getDb();
  const user = db.prepare("SELECT id, handle, name, avatar_url, bio, created_at FROM users WHERE handle = ?").get(handle) as
    | { id: number; handle: string; name: string; avatar_url: string | null; bio: string | null; created_at: number } | undefined;
  if (!user) return null;
  const albums = db
    .prepare(
      `SELECT a.mbid, a.title, a.artist, a.year, r.raw, r.scale, r.score, l.created_at,
              EXISTS(SELECT 1 FROM rankings k WHERE k.user_id = l.user_id AND k.album_mbid = l.album_mbid) AS ranked
         FROM listens l JOIN albums a ON a.mbid = l.album_mbid
         LEFT JOIN ratings r ON r.user_id = l.user_id AND r.album_mbid = l.album_mbid
        WHERE l.user_id = ?
        ORDER BY l.created_at DESC LIMIT 500`
    )
    .all(user.id);
  const counts = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM listens WHERE user_id = ?) AS listened,
              (SELECT COUNT(*) FROM ratings WHERE user_id = ?) AS rated,
              (SELECT COUNT(*) FROM rankings WHERE user_id = ?) AS ranked`
    )
    .get(user.id, user.id, user.id);
  const { id: _id, ...pub } = user;
  void _id;
  return { user: pub, counts, albums };
}

/** What people have been doing, newest first. Everyone, until there is a follow graph. */
export function recentActivity(limit = 30) {
  return getDb()
    .prepare(
      `SELECT u.handle, u.name, u.avatar_url, a.mbid, a.title, a.artist, a.year, r.raw, r.scale,
              EXISTS(SELECT 1 FROM rankings k WHERE k.user_id = l.user_id AND k.album_mbid = l.album_mbid) AS ranked,
              MAX(l.created_at, COALESCE(r.updated_at, 0), COALESCE((SELECT updated_at FROM rankings k WHERE k.user_id = l.user_id AND k.album_mbid = l.album_mbid), 0)) AS at
         FROM listens l JOIN users u ON u.id = l.user_id JOIN albums a ON a.mbid = l.album_mbid
         LEFT JOIN ratings r ON r.user_id = l.user_id AND r.album_mbid = l.album_mbid
        ORDER BY at DESC LIMIT ?`
    )
    .all(limit);
}
