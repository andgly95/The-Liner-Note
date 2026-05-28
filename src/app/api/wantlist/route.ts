import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";
import { discogsClient } from "@/lib/discogs";
import {
  optimizeWantlistForLLM,
  wantlistToString,
} from "@/lib/optimize-collection";
import type { DiscogsSession } from "@/types/discogs";

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("discogs_session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const session: DiscogsSession = JSON.parse(sessionCookie);
    const { user, tokens } = session;

    // Allow fetching another user's public wantlist via query param
    const requestedUsername = request.nextUrl.searchParams.get("username");
    const targetUsername = requestedUsername || user.username;
    const isOwnWantlist = targetUsername === user.username;

    // Fetch full wantlist (uses authenticated user's tokens to access any public wantlist)
    const wantlistItems = await discogsClient.getFullWantlist(
      targetUsername,
      tokens
    );

    // Optimize for LLM consumption
    const optimized = optimizeWantlistForLLM(wantlistItems, targetUsername);
    const wantlistString = wantlistToString(optimized);

    return NextResponse.json({
      username: targetUsername,
      isOwnWantlist,
      totalItems: wantlistItems.length,
      optimized,
      wantlistString,
      raw: wantlistItems.slice(0, 50),
    });
  } catch (error) {
    console.error("Wantlist fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch wantlist" },
      { status: 500 }
    );
  }
}
