import { currentUser } from "@/lib/auth/session";
import { json, needSignIn } from "@/lib/auth/respond";
import { ownedUnlogged } from "@/lib/owned";

export const dynamic = "force-dynamic";

// "Put one on": three records you own but haven't logged, at random.
// ?skip=mbid,mbid leaves out the ones just shown, so "Another three" changes.
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return needSignIn();
  const skip = new Set((new URL(req.url).searchParams.get("skip") || "").split(",").filter(Boolean));
  const all = ownedUnlogged(user.id);
  let pool = all.filter((a) => !skip.has(a.mbid));
  if (pool.length < 3) pool = all; // wrapped around
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return json({ picks: pool.slice(0, 3), total: all.length });
}
