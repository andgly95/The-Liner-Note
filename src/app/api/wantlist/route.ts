import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { discogsClient } from "@/lib/discogs";
import {
  optimizeWantlistForLLM,
  wantlistToString,
} from "@/lib/optimize-collection";
import type { DiscogsSession } from "@/types/discogs";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("discogs_session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const session: DiscogsSession = JSON.parse(sessionCookie);
    const { user, tokens } = session;

    // Fetch full wantlist
    const wantlistItems = await discogsClient.getFullWantlist(
      user.username,
      tokens
    );

    // Optimize for LLM consumption
    const optimized = optimizeWantlistForLLM(wantlistItems, user.username);
    const wantlistString = wantlistToString(optimized);

    return NextResponse.json({
      username: user.username,
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
