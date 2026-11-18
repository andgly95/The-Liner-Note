import { setNote } from "@/lib/library";
import { getAlbum, MBID } from "@/lib/musicbrainz";
import { currentUser } from "@/lib/auth/session";
import { json, needSignIn, libraryError } from "@/lib/auth/respond";

export const dynamic = "force-dynamic";

// Your liner note on this album: { body } — empty deletes it.
export async function PUT(req: Request, { params }: { params: { mbid: string } }) {
  const user = await currentUser();
  if (!user) return needSignIn();
  if (!MBID.test(params.mbid)) return json({ error: "Not found" }, 404);
  const { body } = await req.json().catch(() => ({}));
  if (typeof body !== "string") return json({ error: "A note is text" }, 400);
  try {
    await getAlbum(params.mbid); // make sure the album row exists
    return json({ note: setNote(user, params.mbid, body) });
  } catch (e) {
    return libraryError(e);
  }
}
