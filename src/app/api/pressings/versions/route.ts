import { discogsClient, VERSION_FILTER_KEYS, type DiscogsVersion, type VersionFilterKey } from "@/lib/discogs";
import { paced } from "@/lib/pressing-server";
import { ALWAYS_FORMAT, isFormatChip } from "@/lib/pressing";
import { sessionOrNull, unauthorized } from "../_session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Up to this many versions are listed. Past that the facet counts still show
// how many there are, and the chips are how you get under it.
const MAX_PAGES = 3;

function formatCounts(versions: DiscogsVersion[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of versions) {
    for (const f of Array.from(new Set((v.format || "").split(/,\s*/).map((x) => x.trim()).filter(Boolean)))) {
      if (isFormatChip(f)) out[f] = (out[f] ?? 0) + 1;
    }
  }
  return out;
}

export async function GET(req: Request) {
  const session = await sessionOrNull();
  if (!session) return unauthorized();
  const sp = new URL(req.url).searchParams;
  const masterId = Number(sp.get("master"));
  if (!Number.isInteger(masterId) || masterId <= 0) {
    return Response.json({ error: "Missing master" }, { status: 400 });
  }
  const filters: Partial<Record<VersionFilterKey, string[]>> = {};
  for (const k of VERSION_FILTER_KEYS) {
    const vals = sp.getAll(k).map((v) => v.slice(0, 120)).filter(Boolean).slice(0, 6);
    if (vals.length) filters[k] = vals;
  }
  filters.format = [ALWAYS_FORMAT, ...(filters.format ?? []).filter((v) => isFormatChip(v))];

  try {
    const first = await paced(() => discogsClient.getMasterVersions(masterId, filters, session.tokens, 1));
    const versions: DiscogsVersion[] = [...first.versions];
    const pages = Math.min(first.pagination.pages, MAX_PAGES);
    for (let page = 2; page <= pages; page++) {
      const next = await paced(() => discogsClient.getMasterVersions(masterId, filters, session.tokens, page));
      versions.push(...next.versions);
    }
    return Response.json({
      total: first.pagination.items,
      listed: versions.length,
      applied: first.filters?.applied ?? {},
      // Discogs sends no format facet once any format is filtered on — and
      // Vinyl always is. Its unfiltered facet would be every medium's (CD,
      // Cassette…), so the format chips come from the vinyl versions listed:
      // each reads like "LP, Album, Mono". Exact when everything is listed.
      available: { ...(first.filters?.available ?? {}), format: formatCounts(versions) },
      formatExact: versions.length >= first.pagination.items,
      versions: versions.map((v) => ({
        id: v.id,
        label: v.label,
        country: v.country,
        format: v.format,
        catno: v.catno,
        released: v.released,
        thumb: v.thumb,
        have: v.stats?.community?.in_collection,
      })),
    });
  } catch (e) {
    console.error("Versions failed:", e);
    return Response.json({ error: "Could not load versions" }, { status: 502 });
  }
}
