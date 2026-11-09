import { cookies } from "next/headers";
import { discogsClient } from "@/lib/discogs";
import { currentUser, providersOf, signSession, cookieOptions, SESSION_COOKIE } from "@/lib/auth/session";
import { userForClaim } from "@/lib/auth/users";
import { json } from "@/lib/auth/respond";
import type { DiscogsSession } from "@/types/discogs";

export const dynamic = "force-dynamic";

// Who you are. Also upgrades a Discogs-only session from before accounts
// existed: the discogs_session cookie is unsigned JSON, so its user id is NOT
// trusted — Discogs is asked who the tokens belong to, and that answer is used.
export async function GET() {
  let user = await currentUser();
  const jar = await cookies();
  const raw = jar.get("discogs_session")?.value;
  if (!user && raw) {
    try {
      const s = JSON.parse(raw) as DiscogsSession;
      const who = await discogsClient.getIdentity(s.tokens);
      user = userForClaim(
        { provider: "discogs", subject: String(who.id), name: who.username, username: who.username, avatarUrl: who.avatar_url },
        null
      );
      if (user) jar.set(SESSION_COOKIE, await signSession(user.id), cookieOptions());
    } catch {
      // A stale or forged Discogs cookie is simply not a session.
    }
  }
  if (!user) return json({ user: null, googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || null });
  return json({
    user: { handle: user.handle, name: user.name, avatarUrl: user.avatar_url, premium: !!user.premium },
    linked: providersOf(user.id).map((p) => p.provider),
    discogsSession: !!raw,
  });
}
