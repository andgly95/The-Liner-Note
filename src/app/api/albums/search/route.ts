import { searchAlbums } from "@/lib/musicbrainz";
import { currentUser } from "@/lib/auth/session";
import { json, needSignIn } from "@/lib/auth/respond";

export const dynamic = "force-dynamic";

// Signed-in only: every search is a MusicBrainz request, and they allow one a
// second for the whole app.
export async function GET(req: Request) {
  if (!(await currentUser())) return needSignIn();
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 120);
  if (q.length < 2) return json({ results: [] });
  try {
    return json({ results: await searchAlbums(q) });
  } catch (e) {
    console.error("Album search failed:", e);
    return json({ error: "Search is unavailable right now" }, 502);
  }
}
