import { normalizeToken, releaseForClient, shelfForToken, shelfRelease } from "@/lib/shelf";

export const dynamic = "force-dynamic";

// Public: one record's tracklist and photos, for a record on this shelf only.
export async function GET(_req: Request, { params }: { params: { token: string; id: string } }) {
  const shelf = shelfForToken(params.token);
  if (!shelf) return Response.json({ error: "This shelf isn't on display" }, { status: 404 });
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Not a record" }, { status: 400 });
  try {
    const release = await shelfRelease(shelf, id);
    if (!release) return Response.json({ error: "Not on this shelf" }, { status: 404 });
    return Response.json(releaseForClient(release, normalizeToken(params.token)), { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch {
    return Response.json({ error: "Discogs didn't answer" }, { status: 502 });
  }
}
