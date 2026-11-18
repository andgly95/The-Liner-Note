// When each album first came out: the year of its Discogs master (one master
// covers every pressing). Collection items only carry the PRESSING's year, so a
// 2023 reissue of a 1961 record reads 2023. Masters are public, shared data:
// one row per master in `master_years`, fetched once, used by everyone — the
// shelf display and Browse.
import { getDb, now } from "@/lib/db";
import { discogsClient } from "@/lib/discogs";
import { paced } from "@/lib/pressing-server";
import type { DiscogsOAuthTokens } from "@/types/discogs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The years the Pi has for these masters (null = Discogs has none). */
export function masterYears(ids: number[]): Map<number, number | null> {
  const out = new Map<number, number | null>();
  if (!ids.length) return out;
  const rows = getDb()
    .prepare("SELECT id, year FROM master_years WHERE id IN (SELECT value FROM json_each(?))")
    .all(JSON.stringify(ids)) as { id: number; year: number | null }[];
  for (const r of rows) out.set(r.id, r.year);
  return out;
}

/** The masters of these items, once each. */
export const mastersOf = (masterIds: (number | null | undefined)[]): number[] =>
  Array.from(new Set(masterIds.filter((m): m is number => !!m && m > 0)));

// Discogs' 60-a-minute limit is shared with everything else using these
// tokens (the collection read, the dashboard), so the paced queue alone can
// still meet a 429. That's "wait", not "failed": pause a minute, try again.
const rateLimited = (e: unknown) => e instanceof Error && /\b429\b/.test(e.message);
export async function patiently<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!rateLimited(e) || i >= 5) throw e;
      await sleep(60_000);
    }
  }
}

// Two warmers (a shelf and its owner's Browse) can want the same master at once.
const inFlight = new Map<number, Promise<number | null>>();

function fetchMasterYear(masterId: number, tokens: DiscogsOAuthTokens): Promise<number | null> {
  const running = inFlight.get(masterId);
  if (running) return running;
  const job = (async () => {
    const m = await patiently(() => paced(() => discogsClient.getMaster(masterId, tokens)));
    const year = m.year && m.year > 0 ? m.year : null;
    getDb().prepare("INSERT OR REPLACE INTO master_years (id, year, fetched_at) VALUES (?, ?, ?)").run(masterId, year, now());
    return year;
  })().finally(() => inFlight.delete(masterId));
  inFlight.set(masterId, job);
  return job;
}

/**
 * Fetch the years the Pi doesn't have yet, one call at a time through the
 * shared Discogs queue (it holds one slot, so the pressing finder isn't
 * crowded out). Stops after 5 failures in a row, or as soon as `keepGoing`
 * says no. The tokens are only used, never stored.
 */
export async function warmMasterYears(
  ids: number[],
  tokens: DiscogsOAuthTokens,
  { label, keepGoing = () => true }: { label: string; keepGoing?: () => boolean }
): Promise<number> {
  const known = masterYears(ids);
  let fetched = 0;
  let fails = 0;
  for (const m of ids) {
    if (known.has(m)) continue;
    if (fails >= 5) {
      console.error(`${label}: stopping master years after 5 failures in a row`);
      break;
    }
    if (!keepGoing()) break;
    try {
      await fetchMasterYear(m, tokens);
      fetched++;
      fails = 0;
    } catch (e) {
      fails++;
      console.error(`${label}: master ${m}:`, e instanceof Error ? e.message : e);
    }
  }
  return fetched;
}
