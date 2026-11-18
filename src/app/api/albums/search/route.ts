import { searchAlbums } from "@/lib/musicbrainz";
import { currentUser } from "@/lib/auth/session";
import { json, needSignIn } from "@/lib/auth/respond";
import { ownedCopy } from "@/lib/owned";

export const dynamic = "force-dynamic";

// Signed-in only: every search is a MusicBrainz request, and they allow one a
// second for the whole app.
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return needSignIn();
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 120);
  if (q.length < 2) return json({ results: [] });
  try {
    const results = await searchAlbums(q);
    return json({ results: results.map((h) => ({ ...h, owned: !!ownedCopy(user.id, h) })) });
  } catch (e) {
    console.error("Album search failed:", e);
    return json({ error: "Search is unavailable right now" }, 502);
  }
}
