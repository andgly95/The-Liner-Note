// Result types are derived from Zod schemas in src/lib/analysis-schemas.ts so that
// the runtime validation and the compile-time types stay in sync automatically.

export type {
  CollectorArchetype,
  RoastResult,
  NextResult,
  MoodPick,
  MoodResult,
  ObscurenessItem,
  ObscurenessResult,
} from "@/lib/analysis-schemas";

export type AnalysisType = "roast" | "next" | "mood" | "obscureness";
