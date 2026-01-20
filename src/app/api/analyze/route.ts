import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { cookies } from "next/headers";
import type { DiscogsSession } from "@/types/discogs";
import type { AnalysisType } from "@/types/analysis";
import {
  ROAST_SYSTEM_PROMPT,
  GAP_FILLER_SYSTEM_PROMPT,
  ORACLE_SYSTEM_PROMPT,
  buildRoastPrompt,
  buildGapFillerPrompt,
  buildOraclePrompt,
} from "@/lib/prompts";

export const maxDuration = 60;

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
    const {
      type,
      collection,
      wantlist,
      gapFillerResults,
    }: {
      type: AnalysisType;
      collection: string;
      wantlist?: string;
      gapFillerResults?: string;
    } = body;

    if (!type || !collection) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Select system prompt and build user prompt based on analysis type
    let systemPrompt: string;
    let userPrompt: string;

    switch (type) {
      case "roast":
        systemPrompt = ROAST_SYSTEM_PROMPT;
        userPrompt = buildRoastPrompt(collection);
        break;
      case "gap_filler":
        systemPrompt = GAP_FILLER_SYSTEM_PROMPT;
        userPrompt = buildGapFillerPrompt(collection);
        break;
      case "oracle":
        systemPrompt = ORACLE_SYSTEM_PROMPT;
        userPrompt = buildOraclePrompt(collection, wantlist, gapFillerResults);
        break;
      default:
        return new Response(
          JSON.stringify({ error: "Invalid analysis type" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
    }

    // Stream the response from Claude
    const result = streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: systemPrompt,
      prompt: userPrompt,
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("Analysis error:", error);
    return new Response(JSON.stringify({ error: "Analysis failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
