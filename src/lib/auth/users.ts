// Finding or creating the person behind a sign-in.
//
// An identity (provider + subject) belongs to exactly one user. Signing in with
// a NEW identity while already signed in links it to you (e.g. adding Discogs
// to a Google account); signing in with one we've never seen, signed out,
// makes a new person. Accounts are never merged by email: two providers telling
// us the same address is not proof they are the same person.
import { getDb, now } from "@/lib/db";
import type { User } from "./session";

export interface Claim {
  provider: "google" | "discogs";
  subject: string;
  name: string;
  email?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
}

function baseHandle(c: Claim): string {
  const from = c.username || c.name || (c.email ? c.email.split("@")[0] : "") || "listener";
  const h = from
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "")
    .slice(0, 20);
  return h.length >= 3 ? h : `listener${h}`;
}

function freeHandle(base: string): string {
  const db = getDb();
  const taken = (h: string) => !!db.prepare("SELECT 1 FROM users WHERE handle = ?").get(h);
  if (!taken(base)) return base;
  for (let i = 2; i < 10000; i++) if (!taken(`${base}${i}`)) return `${base}${i}`;
  return `${base}${Date.now().toString(36)}`;
}

/**
 * The user this sign-in belongs to. `linkTo` is the currently signed-in user,
 * if any: a new identity attaches to them instead of creating someone new.
 * Returns null if the identity already belongs to a DIFFERENT user than linkTo —
 * that is a conflict for the person to resolve, not something to merge silently.
 */
export function userForClaim(c: Claim, linkTo: User | null): User | null {
  const db = getDb();
  return db.transaction((): User | null => {
    const existing = db
      .prepare("SELECT user_id FROM identities WHERE provider = ? AND subject = ?")
      .get(c.provider, c.subject) as { user_id: number } | undefined;

    if (existing) {
      if (linkTo && linkTo.id !== existing.user_id) return null;
      db.prepare("UPDATE identities SET email = ?, username = ? WHERE provider = ? AND subject = ?")
        .run(c.email ?? null, c.username ?? null, c.provider, c.subject);
      if (c.avatarUrl) {
        db.prepare("UPDATE users SET avatar_url = COALESCE(avatar_url, ?) WHERE id = ?").run(c.avatarUrl, existing.user_id);
      }
      return db.prepare("SELECT * FROM users WHERE id = ?").get(existing.user_id) as User;
    }

    let userId: number;
    if (linkTo) {
      userId = linkTo.id;
    } else {
      const info = db
        .prepare("INSERT INTO users (handle, name, avatar_url, created_at) VALUES (?, ?, ?, ?)")
        .run(freeHandle(baseHandle(c)), (c.name || c.username || "Listener").slice(0, 60), c.avatarUrl ?? null, now());
      userId = Number(info.lastInsertRowid);
    }
    db.prepare(
      "INSERT INTO identities (provider, subject, user_id, email, username, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(c.provider, c.subject, userId, c.email ?? null, c.username ?? null, now());
    return db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as User;
  })();
}
