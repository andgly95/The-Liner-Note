import { cookies } from "next/headers";
import { verifyGoogleIdToken, googleClientId } from "@/lib/auth/google";
import { currentUser, signSession, cookieOptions, SESSION_COOKIE } from "@/lib/auth/session";
import { userForClaim } from "@/lib/auth/users";
import { json } from "@/lib/auth/respond";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!googleClientId()) return json({ error: "Google sign-in is not configured" }, 503);
  const { credential } = await req.json().catch(() => ({}));
  if (typeof credential !== "string" || credential.length > 4096) return json({ error: "Missing credential" }, 400);
  let claim;
  try {
    claim = await verifyGoogleIdToken(credential);
  } catch (e) {
    console.warn("Google token rejected:", e instanceof Error ? e.message : e);
    return json({ error: "That sign-in didn't check out" }, 401);
  }
  if (!claim) return json({ error: "Google didn't confirm that email address" }, 401);

  const user = userForClaim({ provider: "google", ...claim }, await currentUser());
  if (!user) return json({ error: "That Google account is already linked to a different Liner Note account" }, 409);
  (await cookies()).set(SESSION_COOKIE, await signSession(user.id), cookieOptions());
  return json({ ok: true, handle: user.handle });
}
