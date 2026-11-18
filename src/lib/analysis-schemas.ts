import { z } from "zod";

export const collectorArchetypeSchema = z.object({
  title: z
    .string()
    .describe("Creative archetype title (e.g., 'The Vinyl Hermit', 'The Crate Digger Who Googled Once')"),
  description: z.string().describe("One sentence description of this archetype"),
});

export const roastResultSchema = z.object({
  roast: z.string().describe("The main roast text, 2-3 paragraphs"),
  archetype: collectorArchetypeSchema,
  tastePatterns: z
    .array(z.string())
    .describe("3-5 patterns observed in the collection (genre fixations, era preferences, label loyalties, etc.)"),
  clicheAlbums: z
    .array(z.string())
    .describe("Cliché albums and a brief note on why they are cliché. Format: 'Album - reason'"),
  valueDistribution: z.object({
    summary: z.string().describe("Overall assessment of the collection's balance"),
    highlights: z.array(z.string()).describe("2-4 specific observations about value distribution"),
  }),
});

export const nextResultSchema = z.object({
  coreArtists: z
    .array(z.object({ name: z.string(), owned: z.number().int().nonnegative() }))
    .describe("The 3-5 artists they own the most albums by"),
  finishTheRun: z
    .array(
      z.object({
        artist: z.string(),
        album: z.string(),
        year: z.number().int().nullable(),
        reason: z.string().describe("Which owned records it sits between or answers"),
      })
    )
    .describe("6-10 studio albums that complete the core artists' runs"),
  fromWantlist: z
    .array(z.object({ artist: z.string(), album: z.string(), reason: z.string() }))
    .describe("Up to 5 records from the wantlist to get first; empty without a wantlist"),
  discoveries: z
    .array(
      z.object({
        artist: z.string(),
        album: z.string(),
        year: z.number().int().nullable(),
        reason: z.string(),
        logic: z.enum(["sideman", "scene", "deep_cut"]),
      })
    )
    .describe("5-6 albums they don't know they want yet"),
});

export const moodPickSchema = z.object({
  artist: z.string(),
  album: z.string(),
  reason: z.string().describe("Specific musical reason this album fits the requested mood"),
});

export const moodResultSchema = z.object({
  picks: z
    .array(moodPickSchema)
    .min(1)
    .max(12)
    .describe("Albums from the user's collection that fit the mood — count is set per request (3, 5, or 10); bounds are lenient for resilience"),
});

export const obscurenessItemSchema = z.object({
  artist: z.string(),
  album: z.string(),
  score: z.number().min(1).max(10).describe("1=very mainstream, 10=extremely obscure"),
  why: z.string().describe("One-sentence justification for the score"),
});

export const obscurenessResultSchema = z.object({
  overallScore: z
    .number()
    .min(1)
    .max(10)
    .describe("Overall obscureness of the collection. 1=top-40 only, 10=all private-press"),
  archetype: z
    .string()
    .describe("Short title for this collector's obscureness profile (e.g., 'The FM Radio Loyalist', 'The Crate Digger Lifer')"),
  summary: z.string().describe("2-3 sentence character summary"),
  mostMainstream: z.array(obscurenessItemSchema).max(5).describe("Up to 5 most mainstream records"),
  mostObscure: z.array(obscurenessItemSchema).max(5).describe("Up to 5 most obscure records"),
  spread: z
    .object({
      household: z.object({ count: z.number().int().nonnegative(), examples: z.array(z.string()).max(3) }).describe("Scores 1-2"),
      canon: z.object({ count: z.number().int().nonnegative(), examples: z.array(z.string()).max(3) }).describe("Scores 3-4"),
      genre: z.object({ count: z.number().int().nonnegative(), examples: z.array(z.string()).max(3) }).describe("Scores 5-6"),
      cult: z.object({ count: z.number().int().nonnegative(), examples: z.array(z.string()).max(3) }).describe("Scores 7-8"),
      deep: z.object({ count: z.number().int().nonnegative(), examples: z.array(z.string()).max(3) }).describe("Scores 9-10"),
    })
    .describe("Every record counted into one band; counts add up to the records listed"),
});

export const listeningGuideTrackSchema = z.object({
  position: z.string().describe("Track position EXACTLY as it appears in the provided tracklist (e.g. '1', 'A1', 'B3')"),
  title: z.string().describe("Track title EXACTLY as it appears in the tracklist"),
  commentary: z
    .string()
    .describe(
      "2-4 sentences on what to listen for: specific musical details, performances, production touches, structural pivots, lyrical references — never fluff"
    ),
});

export const listeningGuideSchema = z.object({
  albumIntro: z
    .string()
    .describe("2-3 paragraphs of context: when/where recorded, personnel, the scene, what makes the album notable"),
  trackGuides: z
    .array(listeningGuideTrackSchema)
    .min(1)
    .describe("One entry per track in the tracklist, in order"),
  closing: z
    .string()
    .describe("1-2 paragraphs on legacy / what the album leaves you with / its place in the artist's catalog"),
});

export type ListeningGuideTrack = z.infer<typeof listeningGuideTrackSchema>;
export type ListeningGuideResult = z.infer<typeof listeningGuideSchema>;

export type CollectorArchetype = z.infer<typeof collectorArchetypeSchema>;
export type RoastResult = z.infer<typeof roastResultSchema>;
export type NextResult = z.infer<typeof nextResultSchema>;
export type MoodPick = z.infer<typeof moodPickSchema>;
export type MoodResult = z.infer<typeof moodResultSchema>;
export type ObscurenessItem = z.infer<typeof obscurenessItemSchema>;
export type ObscurenessResult = z.infer<typeof obscurenessResultSchema>;
