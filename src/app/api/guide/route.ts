import { generateText } from "ai";
import { anthropic } from "@/lib/anthropic-client";
import { cookies } from "next/headers";
import { discogsClient } from "@/lib/discogs";
import { listeningGuideSchema } from "@/lib/analysis-schemas";
import {
  LISTENING_GUIDE_SYSTEM_PROMPT,
  buildListeningGuidePrompt,
} from "@/lib/prompts";
import {
  getCachedTracklist,
  setCachedTracklist,
  type CachedTracklist,
} from "@/lib/tracklist-cache";
import type { DiscogsSession } from "@/types/discogs";

export const maxDuration = 120;

const MODEL = process.env.GUIDE_MODEL || "claude-opus-4-7";

const ephemeralCache = {
  providerOptions: {
    anthropic: { cacheControl: { type: "ephemeral" as const } },
  },
};

// We use `generateText` + manual JSON parsing instead of `generateObject` because:
//  - `ai@4.x`'s default tool-call structured-output mode makes Opus 4.7 return
//    `{value: "<stringified JSON>"}` instead of the actual schema shape.
//  - `mode: "json"` is rejected by `@ai-sdk/anthropic@1.2.12` ("json-mode object
//    generation not supported").
// So we ask the model for JSON in prose, parse it ourselves, and validate with Zod.
const JSON_INSTRUCTION = `

CRITICAL OUTPUT FORMAT: Respond with ONLY a single JSON object. No markdown code fences, no preamble, no commentary before or after. The JSON must have exactly these top-level fields:

{
  "albumIntro": "string — 2-3 paragraphs of context",
  "trackGuides": [
    { "position": "string — exact position from tracklist", "title": "string — exact title from tracklist", "commentary": "string — 2-4 sentences" }
  ],
  "closing": "string — 1-2 paragraphs"
}

Include one trackGuides entry per track in the tracklist, in order, using positions and titles EXACTLY as given. Output nothing except the JSON object.`;

function formatTrackListing(tl: CachedTracklist): string {
  return tl.tracks
    .filter((t) => /^[A-Z]?\d+/i.test(t.position?.trim() || ""))
    .map((t) => {
      const dur = t.duration ? ` [${t.duration}]` : "";
      return `${t.position}. ${t.title}${dur}`;
    })
    .join("\n");
}

function extractJsonObject(text: string): string {
  // Find the first '{' and the matching last '}'. Resilient to stray prose
  // or markdown fences the model might emit despite instructions.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Model response did not contain a JSON object");
  }
  return text.slice(start, end + 1);
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("discogs_session")?.value;
    if (!sessionCookie) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    const session: DiscogsSession = JSON.parse(sessionCookie);

    const { releaseId }: { releaseId: number } = await req.json();
    if (!releaseId || typeof releaseId !== "number") {
      return Response.json({ error: "Missing releaseId" }, { status: 400 });
    }

    // Tracklist — cached if previously fetched (by Mixtape or a prior guide call).
    let tracklist = getCachedTracklist(releaseId);
    if (!tracklist) {
      const detail = await discogsClient.getReleaseDetail(releaseId, session.tokens);
      tracklist = {
        artist: detail.artists?.map((a) => a.name).join(", ") || "Unknown",
        album: detail.title || "Untitled",
        year: detail.year,
        tracks: (detail.tracklist || []).map((t) => ({
          position: t.position,
          title: t.title,
          duration: t.duration,
        })),
      };
      setCachedTracklist(releaseId, tracklist);
    }

    const trackListing = formatTrackListing(tracklist);
    if (!trackListing) {
      return Response.json(
        { error: "Discogs returned no tracks for this release." },
        { status: 422 }
      );
    }

    const result = await generateText({
      model: anthropic(MODEL),
      messages: [
        {
          role: "system",
          content: LISTENING_GUIDE_SYSTEM_PROMPT + JSON_INSTRUCTION,
          ...ephemeralCache,
        },
        {
          role: "user",
          content: buildListeningGuidePrompt(
            tracklist.artist,
            tracklist.album,
            tracklist.year,
            trackListing
          ),
          ...ephemeralCache,
        },
      ],
    });

    let parsed: unknown;
    try {
      const jsonStr = extractJsonObject(result.text);
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      console.error(
        "Guide: failed to parse JSON from model output. First 500 chars:",
        result.text.slice(0, 500)
      );
      throw new Error(
        e instanceof Error
          ? `Model output wasn't valid JSON: ${e.message}`
          : "Model output wasn't valid JSON"
      );
    }

    const validation = listeningGuideSchema.safeParse(parsed);
    if (!validation.success) {
      console.error("Guide: schema validation failed.", {
        issues: validation.error.issues,
        preview: JSON.stringify(parsed).slice(0, 500),
      });
      throw new Error(
        `Guide didn't match expected shape: ${validation.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")} — ${i.message}`)
          .join("; ")}`
      );
    }

    console.log("Guide: done.", {
      releaseId,
      tracks: validation.data.trackGuides.length,
      usage: result.usage,
    });

    return Response.json(validation.data);
  } catch (error) {
    console.error("Guide error:", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Listening guide generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
