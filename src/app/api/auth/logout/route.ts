import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// POST-only — a GET handler would let any third-party `<img src>` log the user out (CSRF).
export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete("discogs_session");

  return NextResponse.json({ success: true });
}
