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

export const coreArtistSchema = z.object({
  name: z.string(),
  albumCount: z.number().int().nonnegative(),
  albums: z.array(z.string()).describe("Albums by this artist that the user owns"),
});

export const missingAlbumSchema = z.object({
  artist: z.string(),
  album: z.string(),
  year: z.number().int(),
  reason: z.string().describe("Why this album is essential and fits their collection"),
});

export const gapFillerResultSchema = z.object({
  coreArtists: z.array(coreArtistSchema).describe("Top 5 artists by number of albums owned"),
  missingAlbums: z
    .array(missingAlbumSchema)
    .describe("10-15 critical missing studio albums distributed across the core artists"),
});

export const predictedPurchaseSchema = z.object({
  artist: z.string(),
  album: z.string(),
  reason: z.string().describe("Why they will likely buy this next"),
  source: z.enum(["wantlist", "gap_filler"]),
});

export const suggestedAdditionSchema = z.object({
  artist: z.string(),
  album: z.string(),
  reason: z.string().describe("Why this connects to their collection"),
  logic: z.enum(["sideman", "scene", "genre_deep_cut"]),
});

export const oracleResultSchema = z.object({
  likelyPurchases: z.array(predictedPurchaseSchema).describe("5 albums the user is most likely to buy next"),
  suggestedAdds: z.array(suggestedAdditionSchema).describe("5 albums the user does not yet know they want"),
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
});

export const mixtapeCandidateSchema = z.object({
  releaseId: z.number().int().describe("Discogs release ID, exactly as provided in the indexed collection"),
  artist: z.string(),
  album: z.string(),
  why: z.string().describe("One sentence on why this album could contribute a track to the mixtape"),
});

export const mixtapeCandidatesSchema = z.object({
  candidates: z.array(mixtapeCandidateSchema).min(6).max(20),
});

export const mixtapeTrackSchema = z.object({
  position: z.number().int().min(1).describe("Track number from 1, counted across both sides"),
  artist: z.string(),
  album: z.string(),
  track: z.string().describe("Track title exactly as it appears in the tracklist"),
  transition: z
    .string()
    .describe("Why this track is here — what it does to the listener and how it leads into the next"),
});

export const mixtapeResultSchema = z.object({
  title: z.string().describe("Creative title for the mixtape (3-6 words)"),
  premise: z.string().describe("2-3 sentence opening setting up the arc / vibe"),
  // Lenient bounds: Opus' natural variance (asymmetric sides, edge cases) shouldn't
  // fail validation and silently wipe the result. Prompt enforces the actual target.
  sideA: z.array(mixtapeTrackSchema).min(1).max(8),
  sideBreak: z
    .string()
    .describe("One sentence on what the side flip does — an emotional pivot, a deliberate breath, a key change"),
  sideB: z.array(mixtapeTrackSchema).min(1).max(8),
  closing: z.string().describe("1-2 sentence outro on why this is the right place to end"),
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

export type MixtapeCandidate = z.infer<typeof mixtapeCandidateSchema>;
export type MixtapeCandidatesResult = z.infer<typeof mixtapeCandidatesSchema>;
export type MixtapeTrack = z.infer<typeof mixtapeTrackSchema>;
export type MixtapeResult = z.infer<typeof mixtapeResultSchema>;

export type CollectorArchetype = z.infer<typeof collectorArchetypeSchema>;
export type RoastResult = z.infer<typeof roastResultSchema>;
export type CoreArtist = z.infer<typeof coreArtistSchema>;
export type MissingAlbum = z.infer<typeof missingAlbumSchema>;
export type GapFillerResult = z.infer<typeof gapFillerResultSchema>;
export type PredictedPurchase = z.infer<typeof predictedPurchaseSchema>;
export type SuggestedAddition = z.infer<typeof suggestedAdditionSchema>;
export type OracleResult = z.infer<typeof oracleResultSchema>;
export type MoodPick = z.infer<typeof moodPickSchema>;
export type MoodResult = z.infer<typeof moodResultSchema>;
export type ObscurenessItem = z.infer<typeof obscurenessItemSchema>;
export type ObscurenessResult = z.infer<typeof obscurenessResultSchema>;
