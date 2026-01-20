// Types for LLM analysis results

export interface CollectorArchetype {
  title: string;
  description: string;
}

export interface RoastResult {
  roast: string;
  archetype: CollectorArchetype;
  tastePatterns: string[];
  clicheAlbums: string[];
  valueDistribution: {
    summary: string;
    highlights: string[];
  };
}

export interface CoreArtist {
  name: string;
  albumCount: number;
  albums: string[];
}

export interface MissingAlbum {
  artist: string;
  album: string;
  year: number;
  reason: string;
}

export interface GapFillerResult {
  coreArtists: CoreArtist[];
  missingAlbums: MissingAlbum[];
}

export interface PredictedPurchase {
  artist: string;
  album: string;
  reason: string;
  source: 'wantlist' | 'gap_filler';
}

export interface SuggestedAddition {
  artist: string;
  album: string;
  reason: string;
  logic: 'sideman' | 'scene' | 'genre_deep_cut';
}

export interface OracleResult {
  likelyPurchases: PredictedPurchase[];
  suggestedAdds: SuggestedAddition[];
}

export type AnalysisType = 'roast' | 'gap_filler' | 'oracle';

export interface AnalysisRequest {
  type: AnalysisType;
  collection: string;
  wantlist?: string;
  gapFillerResults?: GapFillerResult;
}
