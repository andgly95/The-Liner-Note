import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { discogsClient } from "@/lib/discogs";
import { currentUser } from "@/lib/auth/session";
import { json, needSignIn } from "@/lib/auth/respond";
import {
  deleteShelf, ensureShareToken, savedCount, formatToken, refreshShelf, renameShelf, rotateShareToken, rotateShelfToken, shelfForUser, upsertShelf, type ShelfRow,
} from "@/lib/shelf";
import type { DiscogsSession } from "@/types/discogs";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Your shelf display: whether it's on, its two links (the tablet's code and
// the one you send friends), and the switches. Only ever
// acts on the SIGNED-IN user's shelf.
function status(s: ShelfRow | null) {
  if (!s) return { enabled: false };
  const count = s.snapshot ? (JSON.parse(s.snapshot) as unknown[]).length : null;
  const shareToken = s.share_token ?? ensureShareToken(s.user_id)?.share_token;
  return { enabled: true, token: s.token, code: formatToken(s.token), shareToken, title: s.title, count, saved: savedCount(s), snapshotAt: s.snapshot_at };
}

export async function GET() {
  const user = await currentUser();
  if (!user) return needSignIn();
  return json(status(shelfForUser(user.id)));
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return needSignIn();
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 60) : "";

  if (action === "enable") {
    // The discogs_session cookie is unsigned: ask Discogs whose tokens these
    // are, and accept them only if that Discogs account is linked to YOU.
    const raw = (await cookies()).get("discogs_session")?.value;
    if (!raw) return json({ error: "Sign in with Discogs on this device first", discogs: false }, 400);
    let session: DiscogsSession;
    let who: { id: number; username: string };
    try {
      session = JSON.parse(raw) as DiscogsSession;
      who = await discogsClient.getIdentity(session.tokens);
    } catch {
      return json({ error: "Your Discogs sign-in has expired — sign in with Discogs again", discogs: false }, 400);
    }
    const owner = getDb()
      .prepare("SELECT user_id FROM identities WHERE provider = 'discogs' AND subject = ?")
      .get(String(who.id)) as { user_id: number } | undefined;
    if (owner?.user_id !== user.id) return json({ error: "That Discogs account isn't linked to you" }, 403);
    const shelf = upsertShelf(user.id, title || `${user.name.split(" ")[0]}'s records`, who.username, session.tokens);
    try {
      await refreshShelf(shelf);
    } catch (e) {
      console.error("Shelf first read failed:", e instanceof Error ? e.message : e);
    }
    return json(status(shelfForUser(user.id)));
  }

  const shelf = shelfForUser(user.id);
  if (!shelf) return json({ error: "Your shelf display is off" }, 404);
  if (action === "rename" && title) renameShelf(user.id, title);
  else if (action === "rotate") rotateShelfToken(user.id);
  else if (action === "rotate-share") rotateShareToken(user.id);
  else if (action === "refresh") {
    try {
      await refreshShelf(shelf);
    } catch {
      return json({ error: "Discogs didn't answer — try again in a minute" }, 502);
    }
  } else return json({ error: "Unknown action" }, 400);
  return json(status(shelfForUser(user.id)));
}

/** Turn it off: the link stops working and the stored Discogs tokens are deleted. */
export async function DELETE() {
  const user = await currentUser();
  if (!user) return needSignIn();
  deleteShelf(user.id);
  return json({ enabled: false });
}
