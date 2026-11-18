import { imageType, shelfForToken, shelfImage } from "@/lib/shelf";

export const dynamic = "force-dynamic";

// Public: a cover or back-cover of a record on this shelf, from the Pi's disk
// (fetched from Discogs once, the first time anyone asks or the warmer gets to it).
export async function GET(_req: Request, { params }: { params: { token: string; id: string; n: string } }) {
  const shelf = shelfForToken(params.token);
  if (!shelf) return new Response("Not found", { status: 404 });
  const id = Number(params.id);
  const n = Number(params.n);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(n) || n < 0 || n > 7) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const buf = await shelfImage(shelf, id, n);
    if (!buf) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": imageType(buf), "Cache-Control": "public, max-age=604800" },
    });
  } catch {
    return new Response("Discogs didn't answer", { status: 502 });
  }
}
