// Shared by the pressing-finder routes and the browser. No server imports here.
//
// What one pressing looks like once we have its full detail — kept small,
// because up to 60 of these go to the browser and up to 40 go to Claude.

export interface PressingDetail {
  id: number;
  title: string;
  year?: number;
  released?: string;
  country?: string;
  labels: string[];       // "Parlophone PMC 1267"
  formats: string[];      // "2×Vinyl LP, Album, Numbered, Mono"
  runouts: { value: string; side?: string }[];
  otherIds: { type: string; value: string; description?: string }[];
  companies: string[];    // "Pressed By: EMI Hayes"
  notes: string;
  thumb?: string;
  have?: number;
  want?: number;
}

// A runout as people actually type it: "XEX 709-1", "xex709 1", "709-1".
// Spacing, dashes and case are how hand-etched matrices vary on Discogs as much
// as on the vinyl itself, so all of them are ignored when matching.
export function normalizeRunout(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\-–—_.·/\\]+/g, "")
    .replace(/[“”"']/g, "");
}

/** Does any runout of this pressing contain what was typed? */
export function runoutMatches(p: PressingDetail, query: string): boolean {
  const q = normalizeRunout(query);
  if (!q) return true;
  return p.runouts.some((r) => normalizeRunout(r.value).includes(q));
}

export const MAX_DETAILS = 60;   // details loaded per narrowed set
export const MAX_IDENTIFY = 40;  // pressings sent to Claude in one guide
