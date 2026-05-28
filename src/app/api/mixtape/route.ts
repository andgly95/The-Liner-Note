import { anthropic } from "@/lib/anthropic-client";
import { generateObject, streamObject } from "ai";
import { cookies } from "next/headers";
import { discogsClient } from "@/lib/discogs";
import {
  mixtapeCandidatesSchema,
  mixtapeResultSchema,
} from "@/lib/analysis-schemas";
import {
  MIXTAPE_NARROW_SYSTEM_PROMPT,
  MIXTAPE_SEQUENCE_SYSTEM_PROMPT,
  buildMixtapeNarrowPrompt,
  buildMixtapeSequencePrompt,
} from "@/lib/prompts";
import {
  getCachedTracklist,
  setCachedTracklist,
  type CachedTracklist,
} from "@/lib/tracklist-cache";
import type { DiscogsSession } from "@/types/discogs";

// Two LLM calls + up to ~15 rate-limited Discogs fetches. Worst case ~75s.
export const maxDuration = 120;

const NARROW_MODEL = process.env.MIXTAPE_NARROW_MODEL || "claude-sonnet-4-6";
const SEQUENCE_MODEL = process.env.MIXTAPE_SEQUENCE_MODEL || "claude-opus-4-7";

// Cap on items we feed into stage 1. The narrowing LLM only needs enough variety
// to pick candidates; a 2000-record indexed string blows the context budget and
// adds little signal.
const MAX_INDEXED_ITEMS = 600;

// 1 second between Discogs release fetches keeps us under the authenticated
// 60-req/min rate limit even with a hot user hitting refresh.
const DISCOGS_RATE_LIMIT_MS = 1000;

const ephemeralCache = {
  providerOptions: {
    anthropic: { cacheControl: { type: "ephemeral" as const } },
  },
};

interface InboundItem {
  id: number;
  artist: string;
  album: string;
  year?: number | null;
  genre?: string | null;
}

function buildIndexedCollection(items: InboundItem[]): string {
  return items
    .map((it) => {
      const year = it.year && it.year > 0 ? it.year : "????";
      const genre = it.genre && it.genre.length > 0 ? it.genre : "Unknown";
      return `[id:${it.id}] ${it.artist} - ${it.album} (${year}) [${genre}]`;
    })
    .join("\n");
}

function formatTracklistForLLM(tl: CachedTracklist): string {
  const tracks = tl.tracks
    // Filter out chapter/section headings — real tracks have a numeric position
    // (or letter+number for vinyl, e.g. "A1", "B3").
    .filter((t) => /^[A-Z]?\d+/i.test(t.position?.trim() || ""))
    .map((t) => {
      const dur = t.duration ? ` [${t.duration}]` : "";
      return `  ${t.position}. ${t.title}${dur}`;
    })
    .join("\n");
  const year = tl.year ? ` (${tl.year})` : "";
  return `### ${tl.artist} — ${tl.album}${year}\n${tracks}`;
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("discogs_session")?.value;
    if (!sessionCookie) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    const session: DiscogsSession = JSON.parse(sessionCookie);

    const {
      mood,
      trackCount = 8,
      items,
    }: {
      mood: string;
      trackCount?: number;
      items: InboundItem[];
    } = await req.json();

    if (!mood || typeof mood !== "string" || !mood.trim()) {
      return Response.json({ error: "Missing 'mood' field" }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return Response.json({ error: "Missing collection items" }, { status: 400 });
    }

    const tracks = Math.min(12, Math.max(4, Math.round(trackCount)));
    const idIndex = new Map(items.map((it) => [it.id, it]));

    // ── Stage 1: narrow ──────────────────────────────────────────────────────
    const indexedItems = items.slice(0, MAX_INDEXED_ITEMS);
    const indexedString = buildIndexedCollection(indexedItems);

    const narrowResult = await generateObject({
      model: anthropic(NARROW_MODEL),
      schema: mixtapeCandidatesSchema,
      messages: [
        {
          role: "system",
          content: MIXTAPE_NARROW_SYSTEM_PROMPT,
          ...ephemeralCache,
        },
        {
          role: "user",
          content: buildMixtapeNarrowPrompt(indexedString, mood.trim(), tracks),
          ...ephemeralCache,
        },
      ],
    });

    // Filter to candidates whose IDs actually exist in the user's collection.
    // Defensive: the LLM occasionally invents IDs.
    const validCandidates = narrowResult.object.candidates.filter((c) =>
      idIndex.has(c.releaseId)
    );

    if (validCandidates.length < 4) {
      return Response.json(
        {
          error:
            "Couldn't narrow enough valid candidates from your collection. Try a different mood.",
        },
        { status: 422 }
      );
    }

    // ── Stage 2 prep: fetch tracklists, using cache where possible ──────────
    const tracklists: CachedTracklist[] = [];
    let fetchedFromDiscogs = 0;
    for (const c of validCandidates) {
      const cached = getCachedTracklist(c.releaseId);
      if (cached) {
        tracklists.push(cached);
        continue;
      }
      try {
        // Rate-limit only between *fetches* (cache hits are free)
        if (fetchedFromDiscogs > 0) {
          await new Promise((r) => setTimeout(r, DISCOGS_RATE_LIMIT_MS));
        }
        const detail = await discogsClient.getReleaseDetail(c.releaseId, session.tokens);
        fetchedFromDiscogs++;

        const entry: CachedTracklist = {
          artist: detail.artists?.map((a) => a.name).join(", ") || c.artist,
          album: detail.title || c.album,
          year: detail.year,
          tracks: (detail.tracklist || []).map((t) => ({
            position: t.position,
            title: t.title,
            duration: t.duration,
          })),
        };
        setCachedTracklist(c.releaseId, entry);
        tracklists.push(entry);
      } catch (e) {
        console.warn(`Mixtape: failed to fetch tracklist for release ${c.releaseId}`, e);
      }
    }

    if (tracklists.length < 4) {
      return Response.json(
        { error: "Couldn't fetch enough tracklists from Discogs. Try again in a moment." },
        { status: 502 }
      );
    }

    const candidatesText = tracklists.map(formatTracklistForLLM).join("\n\n");

    // ── Stage 2: sequence (Opus 4.7, streamed) ──────────────────────────────
    console.log(
      `Mixtape: stage 2 starting — ${tracklists.length} candidates, ` +
        `${fetchedFromDiscogs} fetched / ${tracklists.length - fetchedFromDiscogs} cached`
    );
    const result = streamObject({
      model: anthropic(SEQUENCE_MODEL),
      schema: mixtapeResultSchema,
      messages: [
        {
          role: "system",
          content: MIXTAPE_SEQUENCE_SYSTEM_PROMPT,
          ...ephemeralCache,
        },
        {
          role: "user",
          content: buildMixtapeSequencePrompt(candidatesText, mood.trim(), tracks),
          ...ephemeralCache,
        },
      ],
      onFinish: ({ object, error: validationErr, usage }) => {
        if (validationErr) {
          // The streamed JSON didn't fit mixtapeResultSchema. Log the offending
          // object so we can see exactly which field tripped it.
          console.error("Mixtape: stage 2 schema validation failed.", {
            error: validationErr,
            objectPreview: JSON.stringify(object).slice(0, 800),
          });
        } else {
          console.log("Mixtape: stage 2 done.", {
            usage,
            sideALen: object?.sideA?.length,
            sideBLen: object?.sideB?.length,
          });
        }
      },
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Mixtape error:", error);
    // Forward upstream messages (e.g. "Your credit balance is too low...",
    // rate-limit hits, auth issues) so the user can act on them instead of
    // staring at a generic 500.
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Mixtape generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
