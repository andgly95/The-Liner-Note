import { recentActivity } from "@/lib/library";
import { json } from "@/lib/auth/respond";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ items: recentActivity(40) });
}
