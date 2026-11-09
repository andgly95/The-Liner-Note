import { albumView } from "@/lib/library";
import { MBID } from "@/lib/musicbrainz";
import { currentUser } from "@/lib/auth/session";
import { json } from "@/lib/auth/respond";

export const dynamic = "force-dynamic";

// Public: an album page can be shared with someone who hasn't signed up.
export async function GET(_req: Request, { params }: { params: { mbid: string } }) {
  if (!MBID.test(params.mbid)) return json({ error: "Not found" }, 404);
  try {
    return json(await albumView(params.mbid, await currentUser()));
  } catch (e) {
    console.error("Album failed:", e);
    return json({ error: "Couldn't load that album" }, 502);
  }
}
