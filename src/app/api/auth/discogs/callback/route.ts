import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { discogsClient } from "@/lib/discogs";

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const isSecure = appUrl.startsWith("https://");

  try {
    const searchParams = request.nextUrl.searchParams;
    const oauthToken = searchParams.get("oauth_token");
    const oauthVerifier = searchParams.get("oauth_verifier");

    if (!oauthToken || !oauthVerifier) {
      console.error("Missing OAuth parameters");
      return NextResponse.redirect(new URL("/?error=missing_params", appUrl));
    }

    const cookieStore = await cookies();
    const requestToken = cookieStore.get("discogs_request_token")?.value;
    const requestTokenSecret = cookieStore.get(
      "discogs_request_token_secret"
    )?.value;

    if (!requestToken || !requestTokenSecret) {
      console.error("Missing request token cookies");
      return NextResponse.redirect(new URL("/?error=session_expired", appUrl));
    }

    // Verify tokens match
    if (oauthToken !== requestToken) {
      console.error("Token mismatch");
      return NextResponse.redirect(new URL("/?error=token_mismatch", appUrl));
    }

    // Exchange for access token
    const { accessToken, accessTokenSecret } =
      await discogsClient.getAccessToken(
        requestToken,
        requestTokenSecret,
        oauthVerifier
      );

    // Get user identity
    const user = await discogsClient.getIdentity({
      accessToken,
      accessTokenSecret,
    });

    // Clear request token cookies
    cookieStore.delete("discogs_request_token");
    cookieStore.delete("discogs_request_token_secret");

    // Store session in cookies
    const sessionData = JSON.stringify({
      user: {
        id: user.id,
        username: user.username,
        avatar_url: user.avatar_url,
      },
      tokens: {
        accessToken,
        accessTokenSecret,
      },
    });

    console.log("Setting session cookie, isSecure:", isSecure);
    console.log("User authenticated:", user.username);

    cookieStore.set("discogs_session", sessionData, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    console.log("Cookie set, redirecting to dashboard");
    return NextResponse.redirect(new URL("/dashboard", appUrl));
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(new URL("/?error=callback_failed", appUrl));
  }
}
