import { setRating } from "@/lib/library";
import { getAlbum, MBID } from "@/lib/musicbrainz";
import { currentUser } from "@/lib/auth/session";
import { json, needSignIn, libraryError } from "@/lib/auth/respond";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: { mbid: string } }) {
  const user = await currentUser();
  if (!user) return needSignIn();
  if (!MBID.test(params.mbid)) return json({ error: "Not found" }, 404);
  const { scale, raw } = await req.json().catch(() => ({}));
  try {
    await getAlbum(params.mbid);
    return json({ ok: true, rating: setRating(user, params.mbid, String(scale || "stars5"), raw === null || raw === undefined ? null : String(raw)) });
  } catch (e) {
    return libraryError(e);
  }
}
