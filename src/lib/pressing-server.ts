// Server-side half of the pressing finder: one in-process cache of release
// details, and one queue that spaces Discogs calls so a 60-pressing load does
// not trip the 60-requests-a-minute limit (shared with everything else that
// happens to be calling Discogs at the same time).
import { discogsClient, type DiscogsReleaseFull } from "@/lib/discogs";
import type { DiscogsOAuthTokens } from "@/types/discogs";
import type { PressingDetail } from "@/lib/pressing";

const DAY = 24 * 60 * 60 * 1000;
const cache = new Map<number, { at: number; detail: PressingDetail }>();

// Release pages DO get edited — someone adds a runout, corrects a note — so
// entries expire after a day rather than living forever like tracklists.
function cached(id: number): PressingDetail | undefined {
  const hit = cache.get(id);
  if (!hit) return undefined;
  if (Date.now() - hit.at > DAY) {
    cache.delete(id);
    return undefined;
  }
  return hit.detail;
}

const SPACING_MS = 1100;
let nextSlot = 0;
async function paced<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + SPACING_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
  return fn();
}

export function compact(r: DiscogsReleaseFull): PressingDetail {
  const ids = r.identifiers ?? [];
  return {
    id: r.id,
    title: r.title,
    year: r.year,
    released: r.released,
    country: r.country,
    labels: (r.labels ?? []).map((l) => `${l.name} ${l.catno}`.trim()),
    formats: (r.formats ?? []).map((f) =>
      [`${f.qty && f.qty !== "1" ? `${f.qty}×` : ""}${f.name}`, ...(f.descriptions ?? []), f.text]
        .filter(Boolean)
        .join(", ")
    ),
    runouts: ids
      .filter((i) => /matrix|runout/i.test(i.type))
      .map((i) => ({ value: i.value, side: i.description || undefined })),
    otherIds: ids
      .filter((i) => !/matrix|runout/i.test(i.type))
      .map((i) => ({ type: i.type, value: i.value, description: i.description || undefined })),
    companies: (r.companies ?? []).map((c) => `${c.entity_type_name}: ${c.name}`),
    notes: (r.notes ?? "").trim().slice(0, 2500),
    thumb: r.images?.[0]?.uri150 || r.images?.[0]?.uri,
    have: r.community?.have,
    want: r.community?.want,
  };
}

/** Details for these releases, from cache where possible, paced otherwise. */
export async function pressingDetails(
  ids: number[],
  tokens: DiscogsOAuthTokens
): Promise<{ details: PressingDetail[]; failed: number[] }> {
  const details: PressingDetail[] = [];
  const failed: number[] = [];
  for (const id of ids) {
    const hit = cached(id);
    if (hit) {
      details.push(hit);
      continue;
    }
    try {
      const full = await paced(() => discogsClient.getReleaseFull(id, tokens));
      const detail = compact(full);
      cache.set(id, { at: Date.now(), detail });
      details.push(detail);
    } catch (e) {
      console.error(`Pressing detail ${id} failed:`, e instanceof Error ? e.message : e);
      failed.push(id);
    }
  }
  return { details, failed };
}

export { paced };
