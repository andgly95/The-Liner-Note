import { albumView } from "@/lib/library";
import { MBID } from "@/lib/musicbrainz";
import { currentUser } from "@/lib/auth/session";
import { json } from "@/lib/auth/respond";
import { ownedCopy } from "@/lib/owned";

export const dynamic = "force-dynamic";

// Public: an album page can be shared with someone who hasn't signed up.
export async function GET(_req: Request, { params }: { params: { mbid: string } }) {
  if (!MBID.test(params.mbid)) return json({ error: "Not found" }, 404);
  try {
    const user = await currentUser();
    const view = await albumView(params.mbid, user);
    // Your copy, when this album is in your Discogs collection.
    const owned = user ? ownedCopy(user.id, view.album) : null;
    return json({ ...view, owned });
  } catch (e) {
    console.error("Album failed:", e);
    return json({ error: "Couldn't load that album" }, 502);
  }
}
