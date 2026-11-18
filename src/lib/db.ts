// The Liner Note's own database: people, the albums they've listened to, and
// how they rate and rank them. SQLite on the Pi for now (one file, WAL), with
// plain SQL so a move to Postgres later is a port, not a rewrite.
//
// Two shapes are deliberate and everything premium depends on them:
//   · a RATING is stored as score 0–100 plus the scale it was given on, so any
//     scale (5 stars, 10 points, 100, custom) averages with every other one;
//   · a TRACK RANKING is stored as an ordered list of tracks plus a mode-specific
//     payload (tier letters, positions on a line…), so every ranking mode feeds
//     the same community ranking.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const FILE = process.env.LINER_DB || path.join(process.cwd(), "data", "liner.db");
/** Where the database lives; other stored files (shelf covers) sit beside it. */
export const DATA_DIR = path.dirname(FILE);

// Each entry runs once, in order; PRAGMA user_version records how far we got.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id          INTEGER PRIMARY KEY,
    handle      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name        TEXT NOT NULL,
    avatar_url  TEXT,
    bio         TEXT,
    premium     INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );
  -- One person, several ways in (google, discogs). provider+subject is the
  -- identity the provider vouches for; never an email we were merely told.
  CREATE TABLE identities (
    provider    TEXT NOT NULL,
    subject     TEXT NOT NULL,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email       TEXT,
    username    TEXT,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (provider, subject)
  );
  CREATE INDEX identities_user ON identities(user_id);

  -- The catalogue, cached from MusicBrainz. An "album" is a MusicBrainz release
  -- group: the work, not any particular pressing of it.
  CREATE TABLE artists (
    mbid        TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    sort_name   TEXT,
    disambig    TEXT,
    fetched_at  INTEGER NOT NULL
  );
  CREATE TABLE albums (
    mbid        TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    artist      TEXT NOT NULL,
    artist_mbid TEXT,
    year        INTEGER,
    type        TEXT,
    secondary   TEXT,
    release_mbid TEXT,
    tracks_at   INTEGER,
    fetched_at  INTEGER NOT NULL
  );
  CREATE INDEX albums_artist ON albums(artist_mbid);
  CREATE TABLE tracks (
    album_mbid  TEXT NOT NULL REFERENCES albums(mbid) ON DELETE CASCADE,
    idx         INTEGER NOT NULL,
    key         TEXT NOT NULL,
    disc        INTEGER NOT NULL,
    number      TEXT NOT NULL,
    title       TEXT NOT NULL,
    length_ms   INTEGER,
    PRIMARY KEY (album_mbid, key)
  );
  -- An artist's discography is cached as a fetch time; its albums live above.
  CREATE TABLE artist_discogs (
    artist_mbid TEXT PRIMARY KEY,
    album_mbids TEXT NOT NULL,
    fetched_at  INTEGER NOT NULL
  );

  CREATE TABLE listens (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    album_mbid  TEXT NOT NULL REFERENCES albums(mbid),
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (user_id, album_mbid)
  );
  CREATE INDEX listens_album ON listens(album_mbid);
  CREATE INDEX listens_recent ON listens(created_at);

  CREATE TABLE ratings (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    album_mbid  TEXT NOT NULL REFERENCES albums(mbid),
    score       INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    scale       TEXT NOT NULL,
    raw         TEXT NOT NULL,
    updated_at  INTEGER NOT NULL,
    PRIMARY KEY (user_id, album_mbid)
  );
  CREATE INDEX ratings_album ON ratings(album_mbid);

  CREATE TABLE rankings (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    album_mbid  TEXT NOT NULL REFERENCES albums(mbid),
    mode        TEXT NOT NULL,
    track_order TEXT NOT NULL,
    payload     TEXT,
    updated_at  INTEGER NOT NULL,
    PRIMARY KEY (user_id, album_mbid)
  );
  CREATE INDEX rankings_album ON rankings(album_mbid);
  `,
  // 2 — the shelf display: a public, read-only view of one person's record
  // collection for a tablet on their shelf. The link's token is the only key;
  // the Discogs tokens let the server re-read the collection without the
  // tablet ever being signed in. Turning the shelf off deletes the row.
  `
  CREATE TABLE shelves (
    user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token            TEXT NOT NULL UNIQUE,
    title            TEXT NOT NULL,
    discogs_username TEXT NOT NULL,
    access_token     TEXT NOT NULL,
    access_secret    TEXT NOT NULL,
    snapshot         TEXT,
    snapshot_at      INTEGER,
    created_at       INTEGER NOT NULL
  );
  `,
  // 3 — a second link to the same shelf, for sending to friends: it opens the
  // collection to browse on their own phone (no kiosk), and can be changed
  // without re-coding the tablet. Filled in lazily for shelves made before it.
  `
  ALTER TABLE shelves ADD COLUMN share_token TEXT;
  CREATE UNIQUE INDEX shelves_share_token ON shelves(share_token);
  `,
  // 4 — Discogs release pages (tracklist, images) kept on the Pi for the shelf
  // display, so a record opens instantly and survives restarts. Public data,
  // shared by every shelf; re-read when a month old.
  `
  CREATE TABLE release_cache (
    id         INTEGER PRIMARY KEY,
    data       TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );
  `,
  // 5 — the year each Discogs master (the album, across all its pressings)
  // first came out, so the shelf can order records by when the music was
  // released rather than when that copy was pressed. year NULL = Discogs has none.
  `
  CREATE TABLE master_years (
    id         INTEGER PRIMARY KEY,
    year       INTEGER,
    fetched_at INTEGER NOT NULL
  );
  `,
  // 6 — every Discogs-linked person's collection, kept on the server whether
  // or not they share it, so Browse knows its records (and their original
  // years) without waiting on Discogs. Written whenever they load their own
  // collection; no Discogs tokens are kept for it (that stays a sharing thing).
  `
  CREATE TABLE collection_copies (
    user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    discogs_username TEXT NOT NULL,
    items            TEXT NOT NULL,
    synced_at        INTEGER NOT NULL
  );
  `,
  // 7 — the liner note: one plain-text note per album per person, kept with
  // their listen and rating. Private to its writer for now.
  `
  CREATE TABLE notes (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    album_mbid TEXT NOT NULL REFERENCES albums(mbid),
    body       TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, album_mbid)
  );
  `,
  // 8 — which MusicBrainz release group (an album here) each Discogs master
  // is, from MusicBrainz's own links. Shared data; rg_mbid NULL = no link, so
  // owned-matching falls back to artist and title for that record.
  `
  CREATE TABLE master_groups (
    master_id  INTEGER PRIMARY KEY,
    rg_mbid    TEXT,
    checked_at INTEGER NOT NULL
  );
  CREATE INDEX master_groups_rg ON master_groups(rg_mbid);
  `,
  // 9 — the AI tools' last result per person, per collection looked at
  // (yours or a friend's), per tool. An Opus run is worth keeping.
  `
  CREATE TABLE analyses (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject    TEXT NOT NULL,
    type       TEXT NOT NULL,
    result     TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, subject, type)
  );
  `,
];

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const d = new Database(FILE);
  d.pragma("journal_mode = WAL");
  d.pragma("foreign_keys = ON");
  d.pragma("busy_timeout = 3000");
  const have = d.pragma("user_version", { simple: true }) as number;
  for (let v = have; v < MIGRATIONS.length; v++) {
    d.transaction(() => {
      d.exec(MIGRATIONS[v]);
      d.pragma(`user_version = ${v + 1}`);
    })();
  }
  db = d;
  return d;
}

export const now = () => Date.now();
