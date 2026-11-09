import { profileView } from "@/lib/library";
import { json } from "@/lib/auth/respond";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { handle: string } }) {
  const p = /^[A-Za-z0-9_]{1,30}$/.test(params.handle) ? profileView(params.handle) : null;
  return p ? json(p) : json({ error: "No one by that name" }, 404);
}
