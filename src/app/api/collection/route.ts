import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";
import { discogsClient } from "@/lib/discogs";
import {
  optimizeCollectionForLLM,
  collectionToString,
} from "@/lib/optimize-collection";
import { currentUser } from "@/lib/auth/session";
import { clearProgress, copyFor, saveCopy, setProgress, tokensAreUsers, yearsFor } from "@/lib/collection-copy";
import type { DiscogsCollectionItem, DiscogsSession } from "@/types/discogs";

// Raw items power the in-app collection browser (with cover art). Cap the payload
// so a pathologically huge collection doesn't ship megabytes of JSON.
const MAX_BROWSER_ITEMS = 2000;

function shape(items: DiscogsCollectionItem[], username: string, isOwnCollection: boolean) {
  const { years, pending } = yearsFor(items.map((i) => i.basic_information.master_id));
  const optimized = optimizeCollectionForLLM(items, username, { years });
  return {
    username,
    isOwnCollection,
    totalItems: items.length,
    optimized,
    collectionString: collectionToString(optimized),
    raw: items.slice(0, MAX_BROWSER_ITEMS),
    years,
    pending,
  };
}

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

    // ?cached=1 — your own collection from the server's copy, at once, with no
    // Discogs call. 404 when there's no copy yet (the first load).
    if (request.nextUrl.searchParams.get("cached") && isOwnCollection) {
      const me = await currentUser();
      const copy = me && copyFor(me.id);
      if (!copy || copy.username.toLowerCase() !== user.username.toLowerCase()) {
        return NextResponse.json({ error: "No copy yet" }, { status: 404 });
      }
      const { pending, ...body } = shape(copy.items, user.username, true);
      return NextResponse.json({ ...body, yearsPending: pending, syncedAt: copy.syncedAt, cached: true });
    }

    // Fetch full collection (uses authenticated user's tokens to access any public collection)
    const collectionItems = await discogsClient.getFullCollection(
      targetUsername,
      tokens,
      isOwnCollection ? (current, total) => setProgress(user.username, current, total) : undefined
    ).finally(() => isOwnCollection && clearProgress(user.username));

    // Your own collection: keep the server's copy of it up to date (and its
    // original years fetching) — only once Discogs confirms these tokens are
    // the signed-in person's linked account.
    let mine = false;
    if (isOwnCollection) {
      const me = await currentUser();
      const account = me && (await tokensAreUsers(me.id, tokens));
      if (me && account) {
        saveCopy(me.id, account.username, collectionItems, tokens);
        mine = true;
      }
    }
    // Original release years (the master's): whatever the server knows. Only
    // your own collection's missing ones are being fetched, so only yours is
    // "pending" — a friend's falls back to pressing years where unknown.
    const { pending, ...body } = shape(collectionItems, targetUsername, isOwnCollection);
    return NextResponse.json({ ...body, yearsPending: mine ? pending : 0, syncedAt: Date.now() });
  } catch (error) {
    console.error("Collection fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch collection" },
      { status: 500 }
    );
  }
}
