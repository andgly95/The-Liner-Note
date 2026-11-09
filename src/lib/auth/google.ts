// Verifying a Google Sign-In ID token: signature against Google's published
// keys, the right audience (our client id), a Google issuer, not expired — and
// a VERIFIED email, or the address is just something we were told.
import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export function googleClientId(): string | null {
  return process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || null;
}

export async function verifyGoogleIdToken(idToken: string) {
  const aud = googleClientId();
  if (!aud) throw new Error("GOOGLE_CLIENT_ID is not configured");
  const { payload: p } = await jwtVerify(idToken, JWKS, {
    audience: aud,
    issuer: ["https://accounts.google.com", "accounts.google.com"],
  });
  if (!p.sub || typeof p.email !== "string" || p.email_verified !== true) return null;
  return {
    subject: String(p.sub),
    email: p.email.toLowerCase(),
    name: String(p.name || p.email).slice(0, 60),
    avatarUrl: typeof p.picture === "string" ? p.picture.slice(0, 300) : null,
  };
}
