import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { cookies } from "next/headers";
import type { DiscogsSession } from "@/types/discogs";
import {
  RECORD_SHOP_SYSTEM_PROMPT,
  buildRecordShopPrompt,
} from "@/lib/prompts";

export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-5-20251101";

export async function POST(req: Request) {
  try {
    // Verify authentication
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("discogs_session")?.value;

    if (!sessionCookie) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const _session: DiscogsSession = JSON.parse(sessionCookie);

    // Parse request body
    const body = await req.json();
    const { messages, collection, wantlist } = body;

    if (!messages || !collection) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Build system prompt with collection context
    const collectionContext = buildRecordShopPrompt(collection, wantlist);
    const systemPrompt = `${RECORD_SHOP_SYSTEM_PROMPT}

${collectionContext}`;

    // Stream the response from Claude
    const result = streamText({
      model: anthropic(MODEL),
      system: systemPrompt,
      messages,
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(JSON.stringify({ error: "Chat failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
