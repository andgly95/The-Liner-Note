// Who you are in The Liner Note itself — separate from the Discogs session,
// which only says you have linked a record collection.
//
// The cookie is a signed JWT carrying nothing but the user id. Unlike the older
// discogs_session cookie (plain JSON), it cannot be edited into somebody else.
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";

export const SESSION_COOKIE = "ln_session";
const MAX_AGE_S = 60 * 60 * 24 * 60; // 60 days

function key(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is not set (32+ chars)");
  return new TextEncoder().encode(s);
}

export async function signSession(userId: number): Promise<string> {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .setAudience("liner-note")
    .sign(key());
}

export async function readSession(token: string | undefined): Promise<number | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { audience: "liner-note", algorithms: ["HS256"] });
    return typeof payload.uid === "number" ? payload.uid : null;
  } catch {
    return null;
  }
}

export function cookieOptions() {
  const secure = (process.env.NEXT_PUBLIC_APP_URL || "").startsWith("https://");
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: MAX_AGE_S };
}

export interface User {
  id: number;
  handle: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  premium: number;
  created_at: number;
}

/** The signed-in user, or null. Safe to call from any route or server component. */
export async function currentUser(): Promise<User | null> {
  const uid = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!uid) return null;
  return (getDb().prepare("SELECT * FROM users WHERE id = ?").get(uid) as User | undefined) ?? null;
}

/** Which sign-in providers this user has linked. */
export function providersOf(userId: number): { provider: string; username: string | null }[] {
  return getDb()
    .prepare("SELECT provider, username FROM identities WHERE user_id = ? ORDER BY created_at")
    .all(userId) as { provider: string; username: string | null }[];
}
