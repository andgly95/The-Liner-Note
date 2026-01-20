import type {
  DiscogsCollectionItem,
  DiscogsWantlistItem,
  CompressedRelease,
  CompressedCollection,
} from "@/types/discogs";

// Approximate tokens per character ratio (conservative estimate)
const CHARS_PER_TOKEN = 4;

// Maximum tokens we want to use for collection data
// Leaving room for system prompt and response
const MAX_COLLECTION_TOKENS = 60000;
const MAX_COLLECTION_CHARS = MAX_COLLECTION_TOKENS * CHARS_PER_TOKEN;

interface OptimizeOptions {
  maxTokens?: number;
  prioritizeRecent?: boolean;
  prioritizeHighRated?: boolean;
  includeStyles?: boolean;
}

/**
 * Compresses a single release into the token-efficient format:
 * "{Artist} - {Album} ({Year}) [{Genre}]"
 */
export function compressRelease(
  item: DiscogsCollectionItem | DiscogsWantlistItem
): CompressedRelease {
  const basic = item.basic_information;
  const artist = basic.artists.map((a) => a.name).join(", ");
  const format = basic.formats?.[0]?.name || "Unknown";

  return {
    artist,
    album: basic.title,
    year: basic.year || 0,
    genres: basic.genres || [],
    styles: basic.styles || [],
    format,
    dateAdded: item.date_added,
    rating: item.rating,
  };
}

/**
 * Converts a compressed release to the string format for LLM consumption
 */
export function releaseToString(
  release: CompressedRelease,
  includeStyles = false
): string {
  const genreStr =
    release.genres.length > 0 ? release.genres.slice(0, 2).join("/") : "Unknown";

  let str = `${release.artist} - ${release.album} (${release.year || "????"}) [${genreStr}]`;

  if (includeStyles && release.styles.length > 0) {
    str += ` {${release.styles.slice(0, 2).join(", ")}}`;
  }

  return str;
}

/**
 * Scores a release for prioritization
 * Higher score = more likely to be included when truncating
 */
function scoreRelease(release: CompressedRelease): number {
  let score = 0;

  // Recent additions get priority (within last 2 years)
  if (release.dateAdded) {
    const addedDate = new Date(release.dateAdded);
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    if (addedDate > twoYearsAgo) {
      const daysSinceAdded = Math.floor(
        (Date.now() - addedDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      score += Math.max(0, 100 - daysSinceAdded / 7); // More recent = higher score
    }
  }

  // High-rated items get priority
  if (release.rating && release.rating > 0) {
    score += release.rating * 10;
  }

  // Vinyl format gets slight priority (collectors often value these more)
  if (release.format === "Vinyl") {
    score += 5;
  }

  return score;
}

/**
 * Main optimization function that takes a Discogs collection
 * and returns a token-efficient compressed format
 */
export function optimizeCollectionForLLM(
  items: DiscogsCollectionItem[],
  username: string,
  options: OptimizeOptions = {}
): CompressedCollection {
  const {
    maxTokens = MAX_COLLECTION_TOKENS,
    prioritizeRecent = true,
    prioritizeHighRated = true,
    includeStyles = false,
  } = options;

  const maxChars = maxTokens * CHARS_PER_TOKEN;

  // Convert all items to compressed format
  let releases = items.map(compressRelease);

  // Sort by score if prioritization is enabled
  if (prioritizeRecent || prioritizeHighRated) {
    releases = releases
      .map((r) => ({ release: r, score: scoreRelease(r) }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.release);
  }

  // Build the output string, tracking character count
  const includedReleases: CompressedRelease[] = [];
  let currentLength = 0;
  let truncated = false;

  // Account for header overhead
  const headerOverhead = 100; // Rough estimate for metadata
  const availableChars = maxChars - headerOverhead;

  for (const release of releases) {
    const releaseStr = releaseToString(release, includeStyles);
    const lineLength = releaseStr.length + 1; // +1 for newline

    if (currentLength + lineLength > availableChars) {
      truncated = true;
      break;
    }

    includedReleases.push(release);
    currentLength += lineLength;
  }

  return {
    username,
    totalItems: items.length,
    releases: includedReleases,
    truncated,
    truncatedAt: truncated ? includedReleases.length : undefined,
  };
}

/**
 * Converts a compressed collection to a single string for LLM consumption
 */
export function collectionToString(
  collection: CompressedCollection,
  includeStyles = false
): string {
  const lines = collection.releases.map((r) =>
    releaseToString(r, includeStyles)
  );

  let header = `Collection for ${collection.username} (${collection.totalItems} items)`;
  if (collection.truncated) {
    header += ` [Showing top ${collection.truncatedAt} prioritized items]`;
  }

  return `${header}\n\n${lines.join("\n")}`;
}

/**
 * Optimizes a wantlist for LLM consumption
 */
export function optimizeWantlistForLLM(
  items: DiscogsWantlistItem[],
  username: string,
  options: OptimizeOptions = {}
): CompressedCollection {
  const { maxTokens = 10000, includeStyles = false } = options;

  const maxChars = maxTokens * CHARS_PER_TOKEN;

  const releases = items.map(compressRelease);
  const includedReleases: CompressedRelease[] = [];
  let currentLength = 0;
  let truncated = false;

  const headerOverhead = 100;
  const availableChars = maxChars - headerOverhead;

  for (const release of releases) {
    const releaseStr = releaseToString(release, includeStyles);
    const lineLength = releaseStr.length + 1;

    if (currentLength + lineLength > availableChars) {
      truncated = true;
      break;
    }

    includedReleases.push(release);
    currentLength += lineLength;
  }

  return {
    username,
    totalItems: items.length,
    releases: includedReleases,
    truncated,
    truncatedAt: truncated ? includedReleases.length : undefined,
  };
}

/**
 * Converts a wantlist to string format
 */
export function wantlistToString(
  wantlist: CompressedCollection,
  includeStyles = false
): string {
  const lines = wantlist.releases.map((r) => releaseToString(r, includeStyles));

  let header = `Wantlist for ${wantlist.username} (${wantlist.totalItems} items)`;
  if (wantlist.truncated) {
    header += ` [Showing ${wantlist.truncatedAt} items]`;
  }

  return `${header}\n\n${lines.join("\n")}`;
}

/**
 * Analyzes collection to find core artists (by volume)
 */
export function findCoreArtists(
  collection: CompressedCollection,
  topN = 5
): Map<string, CompressedRelease[]> {
  const artistMap = new Map<string, CompressedRelease[]>();

  for (const release of collection.releases) {
    const existing = artistMap.get(release.artist) || [];
    existing.push(release);
    artistMap.set(release.artist, existing);
  }

  // Sort by count and take top N
  const sorted = Array.from(artistMap.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, topN);

  return new Map(sorted);
}

/**
 * Gets statistics about a collection for analysis
 */
export function getCollectionStats(collection: CompressedCollection): {
  genreBreakdown: Record<string, number>;
  decadeBreakdown: Record<string, number>;
  formatBreakdown: Record<string, number>;
  topArtists: Array<{ artist: string; count: number }>;
} {
  const genreBreakdown: Record<string, number> = {};
  const decadeBreakdown: Record<string, number> = {};
  const formatBreakdown: Record<string, number> = {};
  const artistCount: Record<string, number> = {};

  for (const release of collection.releases) {
    // Genre breakdown
    for (const genre of release.genres) {
      genreBreakdown[genre] = (genreBreakdown[genre] || 0) + 1;
    }

    // Decade breakdown
    if (release.year && release.year > 0) {
      const decade = `${Math.floor(release.year / 10) * 10}s`;
      decadeBreakdown[decade] = (decadeBreakdown[decade] || 0) + 1;
    }

    // Format breakdown
    formatBreakdown[release.format] =
      (formatBreakdown[release.format] || 0) + 1;

    // Artist count
    artistCount[release.artist] = (artistCount[release.artist] || 0) + 1;
  }

  const topArtists = Object.entries(artistCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([artist, count]) => ({ artist, count }));

  return {
    genreBreakdown,
    decadeBreakdown,
    formatBreakdown,
    topArtists,
  };
}
