import { cookies } from "next/headers";
import type { DiscogsSession } from "@/types/discogs";

// The signed-in person, or null. Every pressing route acts as THIS person —
// never as a username the request body names, so "add to collection" can only
// ever write to your own collection (also while you are browsing a friend's).
export async function sessionOrNull(): Promise<DiscogsSession | null> {
  const raw = (await cookies()).get("discogs_session")?.value;
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as DiscogsSession;
    return s?.tokens?.accessToken && s.user?.username ? s : null;
  } catch {
    return null;
  }
}

export const unauthorized = () => Response.json({ error: "Not authenticated" }, { status: 401 });
