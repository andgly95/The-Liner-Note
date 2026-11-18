import { currentUser } from "@/lib/auth/session";
import { copyFor, yearsFor } from "@/lib/collection-copy";

export const dynamic = "force-dynamic";

// Original release years for YOUR collection copy, while the server is still
// fetching them: Browse asks again until nothing is pending.
export async function GET() {
  const me = await currentUser();
  if (!me) return Response.json({ error: "Sign in" }, { status: 401 });
  const copy = copyFor(me.id);
  if (!copy) return Response.json({ years: {}, pending: 0 });
  return Response.json(yearsFor(copy.items.map((i) => i.master)));
}
