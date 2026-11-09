import { setRanking, clearRanking } from "@/lib/library";
import { MBID } from "@/lib/musicbrainz";
import { currentUser } from "@/lib/auth/session";
import { json, needSignIn, libraryError } from "@/lib/auth/respond";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: { mbid: string } }) {
  const user = await currentUser();
  if (!user) return needSignIn();
  if (!MBID.test(params.mbid)) return json({ error: "Not found" }, 404);
  const { mode, order, payload } = await req.json().catch(() => ({}));
  try {
    await setRanking(user, params.mbid, String(mode || "list"), order, payload);
    return json({ ok: true });
  } catch (e) {
    return libraryError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { mbid: string } }) {
  const user = await currentUser();
  if (!user) return needSignIn();
  if (!MBID.test(params.mbid)) return json({ error: "Not found" }, 404);
  clearRanking(user, params.mbid);
  return json({ ok: true });
}
