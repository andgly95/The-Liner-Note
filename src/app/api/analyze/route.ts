import { anthropic } from "@/lib/anthropic-client";
import { generateObject } from "ai";
import type { z } from "zod";
import type { AnalysisType } from "@/types/analysis";
import {
  ROAST_SYSTEM_PROMPT,
  NEXT_SYSTEM_PROMPT,
  MOOD_SYSTEM_PROMPT,
  OBSCURENESS_SYSTEM_PROMPT,
  buildRoastPrompt,
  buildNextPrompt,
  buildMoodPrompt,
  buildObscurenessPrompt,
} from "@/lib/prompts";
import {
  roastResultSchema,
  nextResultSchema,
  moodResultSchema,
  obscurenessResultSchema,
  type NextResult,
} from "@/lib/analysis-schemas";
import { aiUser } from "@/lib/auth/ai-gate";
import { saveAnalysis, savedAnalysis } from "@/lib/analyses";
import { filterNext } from "@/lib/next-filter";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Override with ANTHROPIC_MODEL.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

// Kept per person and collection; Mood is asked fresh each time.
const SAVED = new Set<AnalysisType>(["roast", "next", "obscureness"]);

const ephemeralCache = {
  providerOptions: {
    anthropic: { cacheControl: { type: "ephemeral" as const } },
  },
};

/** GET ?type=next&subject=andgly95 → the last saved run, or {result: null}. */
export async function GET(req: Request) {
  const gate = await aiUser();
  if (gate instanceof Response) return gate;
  const url = new URL(req.url);
  const type = url.searchParams.get("type") as AnalysisType | null;
  const subject = url.searchParams.get("subject");
  if (!type || !SAVED.has(type) || !subject) return Response.json({ error: "Missing type or subject" }, { status: 400 });
  const saved = savedAnalysis(gate.id, subject, type);
  return Response.json(saved ?? { result: null, createdAt: null });
}

export async function POST(req: Request) {
  const gate = await aiUser();
  if (gate instanceof Response) return gate;
  try {
    const {
      type,
      subject,
      collection,
      wantlist,
      mood,
      count,
    }: {
      type: AnalysisType;
      subject?: string;
      collection: string;
      wantlist?: string;
      mood?: string;
      count?: number;
    } = await req.json();

    if (!type || typeof collection !== "string" || !collection.trim()) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }
    // Bigger than any real collection string (60k tokens' worth) means abuse.
    if (collection.length > 300_000 || (wantlist && wantlist.length > 60_000)) {
      return Response.json({ error: "That collection is too large" }, { status: 413 });
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
      case "next":
        systemPrompt = NEXT_SYSTEM_PROMPT;
        userPrompt = buildNextPrompt(collection, wantlist);
        schema = nextResultSchema;
        break;
      case "mood": {
        if (!mood || typeof mood !== "string" || !mood.trim()) {
          return Response.json({ error: "Missing 'mood' field" }, { status: 400 });
        }
        const pickCount = Math.min(10, Math.max(1, Math.round(typeof count === "number" ? count : 3)));
        systemPrompt = MOOD_SYSTEM_PROMPT;
        userPrompt = buildMoodPrompt(collection, mood.trim().slice(0, 300), pickCount);
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
    // Not streamed: every screen waits for the whole answer anyway, and the
    // server has to check (and keep) it before anyone sees it.
    const { object } = await generateObject({
      model: anthropic(MODEL),
      schema,
      abortSignal: req.signal,
      messages: [
        { role: "system", content: systemPrompt, ...ephemeralCache },
        { role: "user", content: userPrompt, ...ephemeralCache },
      ],
    });

    const result = type === "next" ? filterNext(object as NextResult, collection, wantlist) : object;
    const createdAt = SAVED.has(type) && subject ? saveAnalysis(gate.id, subject, type, result) : Date.now();
    return Response.json({ result, createdAt });
  } catch (error) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    console.error("Analysis error:", error);
    return Response.json({ error: "The analysis didn't come back. Try again in a moment." }, { status: 502 });
  }
}
