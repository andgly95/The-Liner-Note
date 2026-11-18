// When the music came out: a collection item's master year (the album's
// original release, from the server) or, failing that, its pressing's year.
import type { DiscogsCollectionItem } from "@/types/discogs";

export function originalYear(it: DiscogsCollectionItem, years?: Record<number, number>): number | null {
  const m = it.basic_information.master_id;
  const y = (m && years?.[m]) || it.basic_information.year;
  return y && y > 0 ? y : null;
}

export const decadeOfYear = (y: number | null) => (y ? Math.floor(y / 10) * 10 : null);
