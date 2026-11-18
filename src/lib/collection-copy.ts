// Each Discogs-linked person's collection, on the server — separate from the
// shelf (which only exists while they share, and keeps their tokens). This
// copy is written whenever they load their OWN collection with their own
// session, and its master years are fetched right then with those tokens,
// which are used and dropped, never stored.
import { getDb, now } from "@/lib/db";
import { discogsClient } from "@/lib/discogs";
import { toItems, type ShelfItem } from "@/lib/shelf";
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
  const items = toItems(raw);
  getDb()
    .prepare(
      `INSERT INTO collection_copies (user_id, discogs_username, items, synced_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET discogs_username = excluded.discogs_username, items = excluded.items, synced_at = excluded.synced_at`
    )
    .run(userId, username, JSON.stringify(items), now());
  if (warming.has(userId)) return;
  warming.add(userId);
  warmMasterYears(mastersOf(items.map((i) => i.master)), tokens, { label: `Collection years ${userId}` })
    .then((n) => n && console.log(`Collection years: ${n} saved for user ${userId}`))
    .catch(() => {})
    .finally(() => warming.delete(userId));
}

export function copyFor(userId: number): { items: ShelfItem[]; syncedAt: number } | null {
  const row = getDb().prepare("SELECT items, synced_at FROM collection_copies WHERE user_id = ?").get(userId) as
    | { items: string; synced_at: number }
    | undefined;
  return row ? { items: JSON.parse(row.items), syncedAt: row.synced_at } : null;
}

/** Original years for these masters: what's known, and how many aren't yet. */
export function yearsFor(masterIds: (number | null | undefined)[]): { years: Record<number, number>; pending: number } {
  const ids = mastersOf(masterIds);
  const known = masterYears(ids);
  const years: Record<number, number> = {};
  known.forEach((y, id) => { if (y) years[id] = y; });
  return { years, pending: ids.length - known.size };
}
