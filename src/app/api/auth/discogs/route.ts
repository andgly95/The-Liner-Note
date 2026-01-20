import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { discogsClient } from "@/lib/discogs";

export async function GET() {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const callbackUrl = `${appUrl}/api/auth/discogs/callback`;

    const { requestToken, requestTokenSecret, authorizeUrl } =
      await discogsClient.getRequestToken(callbackUrl);

    // Store request token secret in cookie for callback
    const cookieStore = await cookies();
    cookieStore.set("discogs_request_token", requestToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10, // 10 minutes
    });
    cookieStore.set("discogs_request_token_secret", requestTokenSecret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10,
    });

    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    console.error("OAuth initiation error:", error);
    return NextResponse.redirect(
      new URL("/?error=oauth_failed", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
    );
  }
}
