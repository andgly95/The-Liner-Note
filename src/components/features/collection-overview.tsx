"use client";

// Overview's "What it is" — the one breakdown of the collection
// (design/redesign 05): the top five genres with counts, records per decade by
// ORIGINAL release year, and the formats as a sentence.
import { useMemo } from "react";
import { DecadeChart } from "./decade-chart";
import { decadeOfYear, originalYear } from "@/lib/collection-years";
import type { DiscogsCollectionItem } from "@/types/discogs";

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const say = (n: number) => (n < 10 ? WORDS[n] : n.toLocaleString());

// How a format reads in a sentence: "309 on vinyl", "one box set".
const FORMAT_PHRASE: Record<string, (n: number) => string> = {
  Vinyl: (n) => `${say(n)} on vinyl`,
  CD: (n) => `${say(n)} on CD`,
  Cassette: (n) => `${say(n)} on cassette`,
  "Box Set": (n) => `${say(n)} box set${n === 1 ? "" : "s"}`,
  File: (n) => `${say(n)} digital`,
  Shellac: (n) => `${say(n)} on shellac`,
};

/** "309 on vinyl and one box set." — "All Media" is a Discogs descriptor, not
 *  a format, so each record counts under its first real one. */
export function formatSentence(items: DiscogsCollectionItem[]): string | null {
  const n = new Map<string, number>();
  for (const it of items) {
    const f = (it.basic_information.formats ?? []).find((x) => x.name && x.name !== "All Media")?.name;
    if (f) n.set(f, (n.get(f) ?? 0) + 1);
  }
  const parts = Array.from(n.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([f, c]) => (FORMAT_PHRASE[f] ?? ((k: number) => `${say(k)} ${f.toLowerCase()}`))(c));
  if (!parts.length) return null;
  const s = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${s[0].toUpperCase()}${s.slice(1)}.`;
}

export function WhatItIs({ items, years }: { items: DiscogsCollectionItem[]; years?: Record<number, number> }) {
  const s = useMemo(() => {
    const genres = new Map<string, number>();
    const decades = new Map<number, number>();
    for (const it of items) {
      for (const g of it.basic_information.genres ?? []) genres.set(g, (genres.get(g) ?? 0) + 1);
      const d = decadeOfYear(originalYear(it, years));
      if (d) decades.set(d, (decades.get(d) ?? 0) + 1);
    }
    return {
      genres: Array.from(genres.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5),
      decades,
      formats: formatSentence(items),
    };
  }, [items, years]);
  if (!items.length) return null;
  const top = Math.max(1, ...s.genres.map(([, n]) => n));

  return (
    <section aria-label="What it is" className="space-y-5">
      <h2 className="font-display text-xl font-semibold">What it is</h2>
      {s.genres.length > 0 && (
        <ul className="space-y-3">
          {s.genres.map(([g, n]) => (
            <li key={g}>
              <div className="flex justify-between text-sm mb-1.5">
                <span>{g}</span>
                <span className="text-muted-foreground tabular-nums">{n.toLocaleString()}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(n / top) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {s.decades.size > 0 && (
        <div>
          <h3 className="section-label mb-3">By decade</h3>
          <DecadeChart counts={s.decades} height="h-32" />
        </div>
      )}
      {s.formats && <p className="text-sm text-muted-foreground">{s.formats}</p>}
    </section>
  );
}
