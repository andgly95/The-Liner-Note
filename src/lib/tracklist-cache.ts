// In-memory cache for Discogs tracklists, shared across requests in a single
// server process. Tracklists are immutable, so there's no expiry — entries just
// accumulate until restart. The Mixtape Architect's hit rate is the only thing
// that determines real Discogs API load over time.

export interface CachedTrack {
  position: string;
  title: string;
  duration?: string;
}

export interface CachedTracklist {
  artist: string;
  album: string;
  year?: number;
  tracks: CachedTrack[];
}

const cache = new Map<number, CachedTracklist>();

export function getCachedTracklist(releaseId: number): CachedTracklist | undefined {
  return cache.get(releaseId);
}

export function setCachedTracklist(releaseId: number, entry: CachedTracklist): void {
  cache.set(releaseId, entry);
}

export function cacheSize(): number {
  return cache.size;
}
