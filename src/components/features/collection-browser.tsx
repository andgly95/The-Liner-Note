"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Library, Search, Disc3, Star, Shuffle, X, Loader2 } from "lucide-react";
import type { DiscogsCollectionItem } from "@/types/discogs";

interface CollectionBrowserProps {
  items?: DiscogsCollectionItem[];
  totalItems: number;
  isReady: boolean;
}

type SortKey =
  | "added_desc"
  | "added_asc"
  | "year_desc"
  | "year_asc"
  | "artist_az"
  | "rating_desc";

const SORT_LABELS: Record<SortKey, string> = {
  added_desc: "Recently added",
  added_asc: "Oldest added",
  year_desc: "Newest releases",
  year_asc: "Oldest releases",
  artist_az: "Artist A→Z",
  rating_desc: "Highest rated",
};

const ALL = "__all__";
const SELECT_CLASS =
  "px-2 py-2 text-sm rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const artistName = (it: DiscogsCollectionItem) =>
  it.basic_information.artists.map((a) => a.name).join(", ");
const primaryGenre = (it: DiscogsCollectionItem) => it.basic_information.genres?.[0] ?? "Unknown";
const primaryFormat = (it: DiscogsCollectionItem) => it.basic_information.formats?.[0]?.name ?? "Unknown";
const decadeOf = (it: DiscogsCollectionItem): string | null => {
  const y = it.basic_information.year;
  if (!y || y <= 0) return null;
  return `${Math.floor(y / 10) * 10}s`;
};
const topN = (m: Map<string, number>, n: number) =>
  Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, n);

function SliceBars({
  title,
  entries,
  total,
  color,
}: {
  title: string;
  entries: [string, number][];
  total: number;
  color: string;
}) {
  if (entries.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
        {title}
      </h4>
      <div className="space-y-1.5">
        {entries.map(([label, count]) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={label} className="space-y-0.5">
              <div className="flex justify-between text-xs">
                <span className="truncate pr-2">{label}</span>
                <span className="text-muted-foreground tabular-nums shrink-0">{count}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CollectionBrowser({ items, totalItems, isReady }: CollectionBrowserProps) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState(ALL);
  const [decade, setDecade] = useState(ALL);
  const [format, setFormat] = useState(ALL);
  const [sort, setSort] = useState<SortKey>("added_desc");
  const [pick, setPick] = useState<DiscogsCollectionItem | null>(null);

  const allItems = useMemo(() => items ?? [], [items]);

  const filterOptions = useMemo(() => {
    const g = new Map<string, number>();
    const d = new Map<string, number>();
    const f = new Map<string, number>();
    for (const it of allItems) {
      for (const gn of it.basic_information.genres ?? []) g.set(gn, (g.get(gn) ?? 0) + 1);
      const dec = decadeOf(it);
      if (dec) d.set(dec, (d.get(dec) ?? 0) + 1);
      f.set(primaryFormat(it), (f.get(primaryFormat(it)) ?? 0) + 1);
    }
    return {
      genres: Array.from(g.entries()).sort((a, b) => b[1] - a[1]),
      decades: Array.from(d.entries()).sort((a, b) => a[0].localeCompare(b[0])),
      formats: Array.from(f.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [allItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = allItems.filter((it) => {
      if (genre !== ALL && !(it.basic_information.genres ?? []).includes(genre)) return false;
      if (decade !== ALL && decadeOf(it) !== decade) return false;
      if (format !== ALL && primaryFormat(it) !== format) return false;
      if (q && !`${artistName(it)} ${it.basic_information.title}`.toLowerCase().includes(q)) return false;
      return true;
    });
    switch (sort) {
      case "added_desc":
        return out;
      case "added_asc":
        return out.slice().reverse();
      case "year_desc":
        return out.slice().sort((a, b) => (b.basic_information.year || 0) - (a.basic_information.year || 0));
      case "year_asc":
        return out.slice().sort((a, b) => (a.basic_information.year || 99999) - (b.basic_information.year || 99999));
      case "artist_az":
        return out.slice().sort((a, b) => artistName(a).localeCompare(artistName(b)));
      case "rating_desc":
        return out.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }
  }, [allItems, query, genre, decade, format, sort]);

  const stats = useMemo(() => {
    const g = new Map<string, number>();
    const d = new Map<string, number>();
    const f = new Map<string, number>();
    const artists = new Map<string, number>();
    let ratedCount = 0;
    let ratingSum = 0;
    let minYear = Infinity;
    let maxYear = -Infinity;
    for (const it of filtered) {
      for (const gn of it.basic_information.genres ?? []) g.set(gn, (g.get(gn) ?? 0) + 1);
      const dec = decadeOf(it);
      if (dec) d.set(dec, (d.get(dec) ?? 0) + 1);
      f.set(primaryFormat(it), (f.get(primaryFormat(it)) ?? 0) + 1);
      const an = artistName(it);
      artists.set(an, (artists.get(an) ?? 0) + 1);
      if (it.rating && it.rating > 0) {
        ratedCount++;
        ratingSum += it.rating;
      }
      const y = it.basic_information.year;
      if (y && y > 0) {
        minYear = Math.min(minYear, y);
        maxYear = Math.max(maxYear, y);
      }
    }
    return {
      topGenres: topN(g, 5),
      topDecades: Array.from(d.entries()).sort((a, b) => a[0].localeCompare(b[0])),
      topFormats: topN(f, 4),
      topArtist: topN(artists, 1)[0] ?? null,
      avgRating: ratedCount > 0 ? ratingSum / ratedCount : null,
      ratedCount,
      yearRange: minYear <= maxYear ? ([minYear, maxYear] as const) : null,
    };
  }, [filtered]);

  const hasFilters = query.trim() !== "" || genre !== ALL || decade !== ALL || format !== ALL;
  const resetFilters = () => {
    setQuery("");
    setGenre(ALL);
    setDecade(ALL);
    setFormat(ALL);
    setSort("added_desc");
    setPick(null);
  };
  const surprise = () => {
    if (filtered.length === 0) return;
    setPick(filtered[Math.floor(Math.random() * filtered.length)]);
  };

  if (!isReady) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Library className="w-5 h-5 text-primary" />
            Browse Collection
          </CardTitle>
          <CardDescription>Loading your collection...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Library className="w-5 h-5 text-primary" />
          Browse Collection
        </CardTitle>
        <CardDescription>
          Search, filter, and sort {totalItems.toLocaleString()} records — the stats below recompute for whatever
          slice you&apos;re looking at.
          {allItems.length < totalItems && ` (browsing the first ${allItems.length.toLocaleString()})`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search artist or album..."
              className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <select value={genre} onChange={(e) => setGenre(e.target.value)} className={SELECT_CLASS}>
            <option value={ALL}>All genres</option>
            {filterOptions.genres.map(([g, c]) => (
              <option key={g} value={g}>
                {g} ({c})
              </option>
            ))}
          </select>
          <select value={decade} onChange={(e) => setDecade(e.target.value)} className={SELECT_CLASS}>
            <option value={ALL}>All decades</option>
            {filterOptions.decades.map(([d, c]) => (
              <option key={d} value={d}>
                {d} ({c})
              </option>
            ))}
          </select>
          <select value={format} onChange={(e) => setFormat(e.target.value)} className={SELECT_CLASS}>
            <option value={ALL}>All formats</option>
            {filterOptions.formats.map(([f, c]) => (
              <option key={f} value={f}>
                {f} ({c})
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={SELECT_CLASS}>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={surprise} disabled={filtered.length === 0}>
            <Shuffle className="w-4 h-4 mr-1" />
            Surprise me
          </Button>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Surprise pick */}
        {pick && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="w-12 h-12 relative bg-muted rounded overflow-hidden shrink-0">
              {pick.basic_information.thumb ? (
                <Image
                  src={pick.basic_information.thumb}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <Disc3 className="w-6 h-6 text-muted-foreground absolute inset-0 m-auto" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground">Spin this →</div>
              <div className="font-medium truncate">
                {artistName(pick)} — {pick.basic_information.title}
              </div>
              <div className="text-xs text-muted-foreground">
                {pick.basic_information.year || "????"} · {primaryGenre(pick)} · {primaryFormat(pick)}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={surprise}>
              Again
            </Button>
          </div>
        )}

        {/* Stats summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm rounded-lg border p-3 bg-muted/30">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Showing</div>
            <div className="font-semibold">
              {filtered.length.toLocaleString()}{" "}
              <span className="text-muted-foreground font-normal">of {allItems.length.toLocaleString()}</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Year range</div>
            <div className="font-semibold">
              {stats.yearRange ? `${stats.yearRange[0]}–${stats.yearRange[1]}` : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Avg rating</div>
            <div className="font-semibold">
              {stats.avgRating ? `${stats.avgRating.toFixed(1)} ★` : "—"}
              {stats.ratedCount > 0 && (
                <span className="text-muted-foreground font-normal text-xs"> ({stats.ratedCount})</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Top artist</div>
            <div className="font-semibold truncate">
              {stats.topArtist ? `${stats.topArtist[0]} (${stats.topArtist[1]})` : "—"}
            </div>
          </div>
        </div>

        {/* Breakdown bars for the current slice */}
        <div className="grid md:grid-cols-3 gap-4">
          <SliceBars title="Genres" entries={stats.topGenres} total={filtered.length} color="bg-primary" />
          <SliceBars title="Decades" entries={stats.topDecades} total={filtered.length} color="bg-purple-500" />
          <SliceBars title="Formats" entries={stats.topFormats} total={filtered.length} color="bg-orange-500" />
        </div>

        {/* Results */}
        <ScrollArea className="h-[440px]">
          {allItems.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              Collection data isn&apos;t available for browsing — try refreshing the collection.
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">No records match these filters.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 pr-3">
              {filtered.map((it) => {
                const thumb = it.basic_information.thumb || it.basic_information.cover_image;
                return (
                  <div key={it.instance_id} className="flex flex-col gap-1.5">
                    <div className="aspect-square relative bg-muted rounded-md overflow-hidden">
                      {thumb ? (
                        <Image
                          src={thumb}
                          alt={`${artistName(it)} — ${it.basic_information.title}`}
                          fill
                          sizes="(max-width:640px) 50vw, (max-width:1024px) 25vw, 20vw"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Disc3 className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                      {it.rating > 0 && (
                        <div className="absolute top-1 right-1 bg-black/60 text-white text-[10px] px-1 rounded flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5 fill-current" />
                          {it.rating}
                        </div>
                      )}
                    </div>
                    <div className="text-xs min-w-0">
                      <div className="font-medium truncate" title={artistName(it)}>
                        {artistName(it)}
                      </div>
                      <div className="text-muted-foreground truncate" title={it.basic_information.title}>
                        {it.basic_information.title}
                      </div>
                      <div className="text-muted-foreground/70 text-[11px]">
                        {it.basic_information.year || "????"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
