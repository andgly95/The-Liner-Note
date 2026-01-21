import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { DiscogsSession } from "@/types/discogs";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    console.log("All cookies:", allCookies.map(c => c.name));
    const sessionCookie = cookieStore.get("discogs_session")?.value;
    console.log("Session cookie exists:", !!sessionCookie);

    if (!sessionCookie) {
      return NextResponse.json({ authenticated: false });
    }

    const session: DiscogsSession = JSON.parse(sessionCookie);

    return NextResponse.json({
      authenticated: true,
      user: session.user,
    });
  } catch (error) {
    console.error("Session error:", error);
    return NextResponse.json({ authenticated: false });
  }
}
