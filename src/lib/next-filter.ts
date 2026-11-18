// "What to get next" must never suggest a record you own or already want —
// the model is told so, and this makes sure. It reads the same lines the model
// was given ("Artist - Album (Year) [Genre]"), so it works for a friend's
// collection too.
import { nameKey } from "./owned";
import type { NextResult } from "./analysis-schemas";

const LINE = /^(.*?) - (.*) \((?:\d{4}|\?{4})\) \[[^\]]*\]$/;

/** An album's keys: the whole title, and the title before " - ", " / " or " (",
 *  so "'Four' & More - Recorded Live In Concert" also answers to "Four & More". */
function keys(artist: string, title: string): string[] {
  const short = title.split(/ - | \/ | \(/)[0];
  const artists = [artist, artist.split(", ")[0]];
  const out = new Set<string>();
  for (const a of artists) for (const t of [title, short]) out.add(nameKey(a, t));
  return Array.from(out);
}

export function shelfKeys(listing: string | undefined): Set<string> {
  const out = new Set<string>();
  for (const line of (listing ?? "").split("\n")) {
    const m = LINE.exec(line.trim());
    if (m) for (const k of keys(m[1], m[2])) out.add(k);
  }
  return out;
}

const hit = (set: Set<string>, artist: string, album: string) => keys(artist, album).some((k) => set.has(k));

export function filterNext(r: NextResult, collection: string, wantlist?: string): NextResult {
  const owned = shelfKeys(collection);
  const wanted = shelfKeys(wantlist);
  const fresh = (p: { artist: string; album: string }) => !hit(owned, p.artist, p.album) && !hit(wanted, p.artist, p.album);
  return {
    ...r,
    finishTheRun: r.finishTheRun.filter(fresh),
    // Only what's really on the wantlist, and not already bought.
    fromWantlist: wantlist ? r.fromWantlist.filter((p) => hit(wanted, p.artist, p.album) && !hit(owned, p.artist, p.album)) : [],
    discoveries: r.discoveries.filter(fresh),
  };
}
