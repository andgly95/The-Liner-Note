// Result types are derived from Zod schemas in src/lib/analysis-schemas.ts so that
// the runtime validation and the compile-time types stay in sync automatically.

export type {
  CollectorArchetype,
  RoastResult,
  CoreArtist,
  MissingAlbum,
  GapFillerResult,
  PredictedPurchase,
  SuggestedAddition,
  OracleResult,
  MoodPick,
  MoodResult,
  ObscurenessItem,
  ObscurenessResult,
} from "@/lib/analysis-schemas";

import type { GapFillerResult } from "@/lib/analysis-schemas";

export type AnalysisType = "roast" | "gap_filler" | "oracle" | "mood" | "obscureness";

export interface AnalysisRequest {
  type: AnalysisType;
  collection: string;
  wantlist?: string;
  gapFillerResults?: GapFillerResult;
}
