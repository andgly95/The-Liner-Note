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
  /** Every photo on the release page — labels, sleeve, runouts — in Discogs' order. */
  images: { full: string; thumb: string; w?: number; h?: number }[];
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

// A barcode as scanned or typed: digits only. UPC-A is 12 digits and is very
// often read as EAN-13 with a leading 0, and Discogs pages carry either.
export function barcodeDigits(s: string): string {
  return s.replace(/\D+/g, "");
}

/** Is this what somebody would type for a barcode (rather than a master id)? */
export function looksLikeBarcode(s: string): boolean {
  const t = s.trim();
  return /^[\d\s-]+$/.test(t) && barcodeDigits(t).length >= 8 && barcodeDigits(t).length <= 14;
}

/** The same code, with and without the leading 0 that turns UPC-A into EAN-13. */
export function barcodeVariants(code: string): string[] {
  const d = barcodeDigits(code);
  const out = new Set([d]);
  if (d.length === 13 && d.startsWith("0")) out.add(d.slice(1));
  if (d.length === 12) out.add("0" + d);
  return Array.from(out);
}
