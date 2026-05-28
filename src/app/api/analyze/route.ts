import { anthropic } from "@/lib/anthropic-client";
import { streamObject } from "ai";
import type { z } from "zod";
import { cookies } from "next/headers";
import type { AnalysisType } from "@/types/analysis";
import {
  ROAST_SYSTEM_PROMPT,
  GAP_FILLER_SYSTEM_PROMPT,
  ORACLE_SYSTEM_PROMPT,
  MOOD_SYSTEM_PROMPT,
  OBSCURENESS_SYSTEM_PROMPT,
  buildRoastPrompt,
  buildGapFillerPrompt,
  buildOraclePrompt,
  buildMoodPrompt,
  buildObscurenessPrompt,
} from "@/lib/prompts";
import {
  roastResultSchema,
  gapFillerResultSchema,
  oracleResultSchema,
  moodResultSchema,
  obscurenessResultSchema,
} from "@/lib/analysis-schemas";

export const maxDuration = 60;

// Defaults to Haiku for cost. Override with ANTHROPIC_MODEL.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-3-5-20241022";

const ephemeralCache = {
  providerOptions: {
    anthropic: { cacheControl: { type: "ephemeral" as const } },
  },
};

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    if (!cookieStore.has("discogs_session")) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const {
      type,
      collection,
      wantlist,
      gapFillerResults,
      mood,
      count,
    }: {
      type: AnalysisType;
      collection: string;
      wantlist?: string;
      gapFillerResults?: string;
      mood?: string;
      count?: number;
    } = await req.json();

    if (!type || !collection) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    let systemPrompt: string;
    let userPrompt: string;
    let schema: z.ZodSchema;

    switch (type) {
      case "roast":
        systemPrompt = ROAST_SYSTEM_PROMPT;
        userPrompt = buildRoastPrompt(collection);
        schema = roastResultSchema;
        break;
      case "gap_filler":
        systemPrompt = GAP_FILLER_SYSTEM_PROMPT;
        userPrompt = buildGapFillerPrompt(collection);
        schema = gapFillerResultSchema;
        break;
      case "oracle":
        systemPrompt = ORACLE_SYSTEM_PROMPT;
        userPrompt = buildOraclePrompt(collection, wantlist, gapFillerResults);
        schema = oracleResultSchema;
        break;
      case "mood": {
        if (!mood || typeof mood !== "string" || !mood.trim()) {
          return Response.json({ error: "Missing 'mood' field" }, { status: 400 });
        }
        const pickCount = Math.min(10, Math.max(1, Math.round(typeof count === "number" ? count : 3)));
        systemPrompt = MOOD_SYSTEM_PROMPT;
        userPrompt = buildMoodPrompt(collection, mood.trim(), pickCount);
        schema = moodResultSchema;
        break;
      }
      case "obscureness":
        systemPrompt = OBSCURENESS_SYSTEM_PROMPT;
        userPrompt = buildObscurenessPrompt(collection);
        schema = obscurenessResultSchema;
        break;
      default:
        return Response.json({ error: "Invalid analysis type" }, { status: 400 });
    }

    // Two cache breakpoints:
    //   1) static system prompt — reusable across all users for this analysis type
    //   2) collection (in user message) — reusable for this user across re-analyses
    const result = streamObject({
      model: anthropic(MODEL),
      schema,
      messages: [
        { role: "system", content: systemPrompt, ...ephemeralCache },
        { role: "user", content: userPrompt, ...ephemeralCache },
      ],
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Analysis error:", error);
    return Response.json({ error: "Analysis failed" }, { status: 500 });
  }
}
