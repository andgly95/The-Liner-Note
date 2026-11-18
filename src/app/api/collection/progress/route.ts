import { cookies } from "next/headers";
import { progressFor } from "@/lib/collection-copy";
import type { DiscogsSession } from "@/types/discogs";

export const dynamic = "force-dynamic";

// How far the first read of YOUR collection has got: { current, total } records.
export async function GET() {
  const raw = (await cookies()).get("discogs_session")?.value;
  if (!raw) return Response.json({ current: 0, total: 0 });
  try {
    const { user } = JSON.parse(raw) as DiscogsSession;
    return Response.json(progressFor(user.username) ?? { current: 0, total: 0 });
  } catch {
    return Response.json({ current: 0, total: 0 });
  }
}
