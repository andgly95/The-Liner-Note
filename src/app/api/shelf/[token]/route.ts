import { itemsForClient, normalizeToken, shelfForToken, shelfItems } from "@/lib/shelf";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Public: everything the shelf display shows, for whoever holds the link.
// Nothing personal beyond the records themselves — no notes, no ratings.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const shelf = shelfForToken(params.token);
  if (!shelf) return Response.json({ error: "This shelf isn't on display" }, { status: 404 });
  try {
    const { items, at } = await shelfItems(shelf);
    return Response.json({ title: shelf.title, at, items: itemsForClient(items, normalizeToken(params.token)) });
  } catch (e) {
    console.error("Shelf read failed:", e instanceof Error ? e.message : e);
    return Response.json({ error: "Couldn't read the collection from Discogs" }, { status: 502 });
  }
}
