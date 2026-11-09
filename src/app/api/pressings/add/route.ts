import { discogsClient } from "@/lib/discogs";
import { sessionOrNull, unauthorized } from "../_session";

export const dynamic = "force-dynamic";

// Writes to the signed-in person's own Discogs collection. The username comes
// from the session, never the request. Discogs happily holds several copies of
// one release, so a second add is refused here unless the caller confirms it.
export async function POST(req: Request) {
  const session = await sessionOrNull();
  if (!session) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const releaseId = Number(body.releaseId);
  if (!Number.isInteger(releaseId) || releaseId <= 0) {
    return Response.json({ error: "Missing releaseId" }, { status: 400 });
  }
  const username = session.user.username;
  try {
    if (!body.again) {
      const have = await discogsClient.collectionInstances(username, releaseId, session.tokens);
      if (have > 0) return Response.json({ already: have }, { status: 409 });
    }
    const added = await discogsClient.addToCollection(username, releaseId, session.tokens);
    return Response.json({ ok: true, instanceId: added.instance_id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Add to collection failed:", msg);
    // A 401/403 here means the Discogs token cannot write — say so rather than "failed".
    if (/Discogs API error: 40[13]/.test(msg)) {
      return Response.json({ error: "Discogs refused the write — try signing out and in again." }, { status: 403 });
    }
    return Response.json({ error: "Could not add it" }, { status: 502 });
  }
}
