// Each Discogs-linked person's collection, on the server — separate from the
// shelf (which only exists while they share, and keeps their tokens). This
// copy is written whenever they load their OWN collection with their own
// session, and its master years are fetched right then with those tokens,
// which are used and dropped, never stored. It holds the raw Discogs items,
// so the Collection screens can open from it instantly and sync behind.
import { getDb, now } from "@/lib/db";
import { discogsClient } from "@/lib/discogs";
import { mastersOf, masterYears, warmMasterYears } from "@/lib/master-years";
import type { DiscogsCollectionItem, DiscogsOAuthTokens } from "@/types/discogs";

// The discogs_session cookie is unsigned, so whose tokens these are is asked
// of Discogs (once per token per process) and checked against the signed-in
// person's linked Discogs account before anything is saved as theirs.
const verified = new Map<string, { id: number; username: string }>();

async function discogsAccount(tokens: DiscogsOAuthTokens) {
  const hit = verified.get(tokens.accessToken);
  if (hit) return hit;
  const who = await discogsClient.getIdentity(tokens);
  verified.set(tokens.accessToken, { id: who.id, username: who.username });
  return who;
}

/** True when these tokens belong to the Discogs account linked to `userId`. */
export async function tokensAreUsers(userId: number, tokens: DiscogsOAuthTokens): Promise<{ username: string } | null> {
  try {
    const who = await discogsAccount(tokens);
    const owner = getDb()
      .prepare("SELECT user_id FROM identities WHERE provider = 'discogs' AND subject = ?")
      .get(String(who.id)) as { user_id: number } | undefined;
    return owner?.user_id === userId ? { username: who.username } : null;
  } catch {
    return null;
  }
}

const warming = new Set<number>();

/** Save the person's copy and fetch the original years it's missing (in the background). */
export function saveCopy(userId: number, username: string, raw: DiscogsCollectionItem[], tokens: DiscogsOAuthTokens) {
  getDb()
    .prepare(
      `INSERT INTO collection_copies (user_id, discogs_username, items, synced_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET discogs_username = excluded.discogs_username, items = excluded.items, synced_at = excluded.synced_at`
    )
    .run(userId, username, JSON.stringify(raw), now());
  if (warming.has(userId)) return;
  warming.add(userId);
  warmMasterYears(mastersOf(raw.map((i) => i.basic_information.master_id)), tokens, { label: `Collection years ${userId}` })
    .then((n) => n && console.log(`Collection years: ${n} saved for user ${userId}`))
    .catch(() => {})
    .finally(() => warming.delete(userId));
}

export function copyFor(userId: number): { username: string; items: DiscogsCollectionItem[]; syncedAt: number } | null {
  const row = getDb().prepare("SELECT discogs_username, items, synced_at FROM collection_copies WHERE user_id = ?").get(userId) as
    | { discogs_username: string; items: string; synced_at: number }
    | undefined;
  if (!row) return null;
  const items = JSON.parse(row.items) as DiscogsCollectionItem[];
  // Copies saved before they held raw items aren't usable: treat as none.
  if (items.length && !items[0].basic_information) return null;
  return { username: row.discogs_username, items, syncedAt: row.synced_at };
}

/* ── first-load progress ─────────────────────────────────────────────────── */

// A first read is ~1 s per 100 records. While it runs, the page shows "2 of 4
// pages" from here.
const progress = new Map<string, { current: number; total: number; at: number }>();
export function setProgress(username: string, current: number, total: number) {
  progress.set(username.toLowerCase(), { current, total, at: now() });
}
export function clearProgress(username: string) {
  progress.delete(username.toLowerCase());
}
export function progressFor(username: string) {
  const p = progress.get(username.toLowerCase());
  return p && now() - p.at < 120_000 ? p : null;
}

/** Original years for these masters: what's known, and how many aren't yet. */
export function yearsFor(masterIds: (number | null | undefined)[]): { years: Record<number, number>; pending: number } {
  const ids = mastersOf(masterIds);
  const known = masterYears(ids);
  const years: Record<number, number> = {};
  known.forEach((y, id) => { if (y) years[id] = y; });
  return { years, pending: ids.length - known.size };
}
