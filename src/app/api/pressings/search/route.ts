import { discogsClient } from "@/lib/discogs";
import { sessionOrNull, unauthorized } from "../_session";

export const dynamic = "force-dynamic";

// A pasted Discogs link or a bare number goes straight to that master; a
// release link finds the master it belongs to. Anything else is a search.
const MASTER_URL = /discogs\.com\/(?:[a-z-]+\/)?master\/(?:view\/)?(\d+)/i;
const RELEASE_URL = /discogs\.com\/(?:[a-z-]+\/)?release\/(?:view\/)?(\d+)/i;

export async function GET(req: Request) {
  const session = await sessionOrNull();
  if (!session) return unauthorized();
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 200);
  if (!q) return Response.json({ results: [] });

  try {
    let masterId: number | null = null;
    const m = q.match(MASTER_URL);
    const r = q.match(RELEASE_URL);
    if (m) masterId = Number(m[1]);
    else if (/^\d{3,}$/.test(q)) masterId = Number(q);
    else if (r) {
      const rel = await discogsClient.getReleaseFull(Number(r[1]), session.tokens);
      if (!rel.master_id) return Response.json({ results: [], note: "That release has no master — it is the only version." });
      masterId = rel.master_id;
    }
    if (masterId) {
      const mst = await discogsClient.getMaster(masterId, session.tokens);
      return Response.json({
        results: [{
          id: mst.id,
          title: `${(mst.artists ?? []).map((a) => a.name).join(", ")} - ${mst.title}`,
          year: mst.year ? String(mst.year) : undefined,
          thumb: mst.images?.[0]?.uri150 || mst.images?.[0]?.uri,
        }],
      });
    }
    const res = await discogsClient.searchMasters(q, session.tokens);
    return Response.json({
      results: res.results.map((x) => ({ id: x.master_id || x.id, title: x.title, year: x.year, thumb: x.thumb || x.cover_image })),
    });
  } catch (e) {
    console.error("Pressing search failed:", e);
    return Response.json({ error: "Search failed" }, { status: 502 });
  }
}
