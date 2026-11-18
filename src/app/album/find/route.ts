// /album/find?artist=…&title=… → that album's page. The AI tools name albums
// by artist and title; this finds the MusicBrainz release group only when one
// is tapped (one search, cached), and falls back to the search screen.
import { currentUser } from "@/lib/auth/session";
import { searchAlbums } from "@/lib/musicbrainz";
import { nameKey } from "@/lib/owned";

export const dynamic = "force-dynamic";

const found = new Map<string, string | null>();
const artistKey = (a: string) => nameKey(a, "").split("|")[0];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const artist = (url.searchParams.get("artist") || "").trim().slice(0, 200);
  const title = (url.searchParams.get("title") || "").trim().slice(0, 200);
  const q = `${artist} ${title}`.trim();
  // Relative Locations: behind the tunnel, req.url says localhost.
  const go = (path: string) => new Response(null, { status: 307, headers: { Location: path } });
  const toSearch = go(`/search?q=${encodeURIComponent(q)}`);
  if (!artist || !title) return toSearch;

  const key = nameKey(artist, title);
  let mbid = found.get(key);
  if (mbid === undefined) {
    // Searching is for signed-in people only (MusicBrainz allows 1/s for the app).
    if (!(await currentUser())) return toSearch;
    try {
      const hits = await searchAlbums(q);
      const want = artistKey(artist);
      const sameArtist = hits.filter((h) => artistKey(h.artist) === want || artistKey(h.artist).startsWith(want));
      mbid = (hits.find((h) => nameKey(h.artist, h.title) === key) ?? sameArtist.find((h) => nameKey(h.artist, h.title).split("|")[1].startsWith(key.split("|")[1])) ?? null)?.mbid ?? null;
      found.set(key, mbid);
    } catch {
      return toSearch;
    }
  }
  return mbid ? go(`/album/${mbid}`) : toSearch;
}
