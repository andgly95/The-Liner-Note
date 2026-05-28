import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";
import { discogsClient } from "@/lib/discogs";
import {
  optimizeCollectionForLLM,
  collectionToString,
} from "@/lib/optimize-collection";
import type { DiscogsSession } from "@/types/discogs";

// Raw items power the in-app collection browser (with cover art). Cap the payload
// so a pathologically huge collection doesn't ship megabytes of JSON.
const MAX_BROWSER_ITEMS = 2000;

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("discogs_session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const session: DiscogsSession = JSON.parse(sessionCookie);
    const { user, tokens } = session;

    // Allow fetching another user's public collection via query param
    const requestedUsername = request.nextUrl.searchParams.get("username");
    const targetUsername = requestedUsername || user.username;
    const isOwnCollection = targetUsername === user.username;

    // Fetch full collection (uses authenticated user's tokens to access any public collection)
    const collectionItems = await discogsClient.getFullCollection(
      targetUsername,
      tokens
    );

    // Optimize for LLM consumption
    const optimized = optimizeCollectionForLLM(
      collectionItems,
      targetUsername
    );
    const collectionString = collectionToString(optimized);

    return NextResponse.json({
      username: targetUsername,
      isOwnCollection,
      totalItems: collectionItems.length,
      optimized,
      collectionString,
      raw: collectionItems.slice(0, MAX_BROWSER_ITEMS),
    });
  } catch (error) {
    console.error("Collection fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch collection" },
      { status: 500 }
    );
  }
}
