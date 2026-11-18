// Who may spend Opus. Every AI route goes through here.
//
// The old check was "a cookie named discogs_session exists" — that cookie is
// unsigned JSON, so `discogs_session=x` was enough to run Opus on our key from
// anywhere. Now: a signed-in Liner Note account (the signed ln_session JWT)
// with a Discogs account linked, and a per-person hourly allowance.
import { currentUser, providersOf, type User } from "./session";

const PER_HOUR = Number(process.env.AI_REQUESTS_PER_HOUR) || 60;
const HOUR = 60 * 60 * 1000;
const recent = new Map<number, number[]>();

/** The person, or the Response to return instead (401 / 403 / 429). */
export async function aiUser(): Promise<User | Response> {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  if (!providersOf(user.id).some((p) => p.provider === "discogs")) {
    return Response.json({ error: "Link your Discogs account first" }, { status: 403 });
  }
  const now = Date.now();
  const times = (recent.get(user.id) ?? []).filter((t) => now - t < HOUR);
  if (times.length >= PER_HOUR) {
    recent.set(user.id, times);
    return Response.json({ error: "That's a lot of AI for one hour — try again a bit later." }, { status: 429 });
  }
  times.push(now);
  recent.set(user.id, times);
  return user;
}
