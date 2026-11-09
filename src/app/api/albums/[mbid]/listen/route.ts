import { setListened } from "@/lib/library";
import { getAlbum, MBID } from "@/lib/musicbrainz";
import { currentUser } from "@/lib/auth/session";
import { json, needSignIn, libraryError } from "@/lib/auth/respond";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { mbid: string } }) {
  const user = await currentUser();
  if (!user) return needSignIn();
  if (!MBID.test(params.mbid)) return json({ error: "Not found" }, 404);
  const { listened } = await req.json().catch(() => ({}));
  try {
    await getAlbum(params.mbid); // make sure the album row exists
    setListened(user, params.mbid, listened !== false);
    return json({ ok: true });
  } catch (e) {
    return libraryError(e);
  }
}
