// Compact, token-efficient formatting for collection/wantlist items, following
// the same "{Artist} - {Album} ({Year}) [{Genre}]" convention as the main app's
// src/lib/optimize-collection.ts. Each line leads with the release id so the
// model can chain into get_release / get_price_suggestions.

export interface BasicInformation {
  id: number;
  master_id?: number;
  title: string;
  year?: number;
  artists?: Array<{ name: string }>;
  formats?: Array<{ name: string; descriptions?: string[] }>;
  labels?: Array<{ name: string; catno?: string }>;
  genres?: string[];
  styles?: string[];
}

export interface CollectionItem {
  id: number;
  date_added?: string;
  rating?: number;
  basic_information: BasicInformation;
}

export interface Pagination {
  page: number;
  pages: number;
  per_page: number;
  items: number;
}

export function artistNames(artists?: Array<{ name: string }>): string {
  return artists?.map((a) => a.name).join(", ") || "Unknown Artist";
}

export function compactLine(item: CollectionItem): string {
  const b = item.basic_information;
  const genre = (b.genres ?? []).slice(0, 2).join("/") || "Unknown";
  const format = b.formats?.[0]?.name;

  let line = `${b.id} | ${artistNames(b.artists)} - ${b.title} (${b.year || "????"}) [${genre}]`;
  if (format) line += ` {${format}}`;
  if (item.rating) line += ` ★${item.rating}`;
  return line;
}

export function detailedItem(item: CollectionItem): Record<string, unknown> {
  const b = item.basic_information;
  return {
    release_id: b.id,
    master_id: b.master_id || undefined,
    artist: artistNames(b.artists),
    title: b.title,
    year: b.year || undefined,
    formats: b.formats?.map((f) =>
      [f.name, ...(f.descriptions ?? [])].join(" ")
    ),
    labels: b.labels?.slice(0, 3).map((l) =>
      l.catno ? `${l.name} (${l.catno})` : l.name
    ),
    genres: b.genres,
    styles: b.styles,
    rating: item.rating || undefined,
    date_added: item.date_added,
  };
}

export function paginationHeader(p: Pagination, label: string): string {
  return `${label}: ${p.items} total items — page ${p.page}/${p.pages} (${p.per_page} per page)`;
}

export interface CollectionStats {
  itemsAnalyzed: number;
  totalItems: number;
  genres: Record<string, number>;
  styles: Record<string, number>;
  decades: Record<string, number>;
  formats: Record<string, number>;
  topArtists: Array<{ artist: string; count: number }>;
}

export function computeStats(
  items: CollectionItem[],
  totalItems: number
): CollectionStats {
  const genres: Record<string, number> = {};
  const styles: Record<string, number> = {};
  const decades: Record<string, number> = {};
  const formats: Record<string, number> = {};
  const artists: Record<string, number> = {};

  for (const item of items) {
    const b = item.basic_information;
    for (const genre of b.genres ?? []) {
      genres[genre] = (genres[genre] || 0) + 1;
    }
    for (const style of b.styles ?? []) {
      styles[style] = (styles[style] || 0) + 1;
    }
    if (b.year) {
      const decade = `${Math.floor(b.year / 10) * 10}s`;
      decades[decade] = (decades[decade] || 0) + 1;
    }
    const format = b.formats?.[0]?.name || "Unknown";
    formats[format] = (formats[format] || 0) + 1;
    const artist = artistNames(b.artists);
    artists[artist] = (artists[artist] || 0) + 1;
  }

  const sortDesc = (record: Record<string, number>): Record<string, number> =>
    Object.fromEntries(Object.entries(record).sort((a, b) => b[1] - a[1]));

  return {
    itemsAnalyzed: items.length,
    totalItems,
    genres: sortDesc(genres),
    styles: Object.fromEntries(
      Object.entries(styles)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
    ),
    decades: sortDesc(decades),
    formats: sortDesc(formats),
    topArtists: Object.entries(artists)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([artist, count]) => ({ artist, count })),
  };
}

export function truncate(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
