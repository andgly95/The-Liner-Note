import { anthropic } from "@/lib/anthropic-client";
import { streamText } from "ai";
import { aiUser } from "@/lib/auth/ai-gate";
import {
  RECORD_SHOP_SYSTEM_PROMPT,
  buildRecordShopPrompt,
} from "@/lib/prompts";

export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

const ephemeralCache = {
  providerOptions: {
    anthropic: { cacheControl: { type: "ephemeral" as const } },
  },
};

export async function POST(req: Request) {
  try {
    const gate = await aiUser();
    if (gate instanceof Response) return gate;

    const { messages, collection, wantlist } = await req.json();

    if (!messages || !collection) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const collectionContext = buildRecordShopPrompt(collection, wantlist);

    // Two cache breakpoints in the system block:
    //   1) static persona prompt — reusable across all users
    //   2) per-user collection context — reusable across this user's turns
    // Result: every turn after the first only pays for the new user message.
    const result = streamText({
      model: anthropic(MODEL),
      messages: [
        { role: "system", content: RECORD_SHOP_SYSTEM_PROMPT, ...ephemeralCache },
        { role: "system", content: collectionContext, ...ephemeralCache },
        ...messages,
      ],
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("Chat error:", error);
    return Response.json({ error: "Chat failed" }, { status: 500 });
  }
}
