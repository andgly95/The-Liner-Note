import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { discogsClient } from "@/lib/discogs";
import {
  optimizeCollectionForLLM,
  collectionToString,
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

    // Fetch full collection
    const collectionItems = await discogsClient.getFullCollection(
      user.username,
      tokens
    );

    // Optimize for LLM consumption
    const optimized = optimizeCollectionForLLM(
      collectionItems,
      user.username
    );
    const collectionString = collectionToString(optimized);

    return NextResponse.json({
      username: user.username,
      totalItems: collectionItems.length,
      optimized,
      collectionString,
      raw: collectionItems.slice(0, 50), // Return first 50 raw items for display
    });
  } catch (error) {
    console.error("Collection fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch collection" },
      { status: 500 }
    );
  }
}
