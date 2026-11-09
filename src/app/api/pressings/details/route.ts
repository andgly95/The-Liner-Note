import { pressingDetails } from "@/lib/pressing-server";
import { sessionOrNull, unauthorized } from "../_session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The browser asks in small batches so it can show progress; each uncached
// release costs ~1.1s of Discogs rate limit.
const BATCH = 12;

export async function POST(req: Request) {
  const session = await sessionOrNull();
  if (!session) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body.ids)
    ? body.ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0).slice(0, BATCH)
    : [];
  if (!ids.length) return Response.json({ error: "No releases" }, { status: 400 });
  return Response.json(await pressingDetails(ids, session.tokens));
}
