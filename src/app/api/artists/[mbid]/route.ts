import { getDiscography, MBID } from "@/lib/musicbrainz";
import { currentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { json } from "@/lib/auth/respond";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { mbid: string } }) {
  if (!MBID.test(params.mbid)) return json({ error: "Not found" }, 404);
  try {
    const d = await getDiscography(params.mbid);
    const viewer = await currentUser();
    // Your own marks on the discography: heard, and your rating.
    let mine: Record<string, { raw: string | null; scale: string | null }> = {};
    if (viewer && d.albums.length) {
      const rows = getDb()
        .prepare(
          `SELECT l.album_mbid, r.raw, r.scale FROM listens l
             LEFT JOIN ratings r ON r.user_id = l.user_id AND r.album_mbid = l.album_mbid
            WHERE l.user_id = ? AND l.album_mbid IN (${d.albums.map(() => "?").join(",")})`
        )
        .all(viewer.id, ...d.albums.map((a) => a.mbid)) as { album_mbid: string; raw: string | null; scale: string | null }[];
      mine = Object.fromEntries(rows.map((r) => [r.album_mbid, { raw: r.raw, scale: r.scale }]));
    }
    return json({ ...d, mine });
  } catch (e) {
    console.error("Discography failed:", e);
    return json({ error: "Couldn't load that artist" }, 502);
  }
}
