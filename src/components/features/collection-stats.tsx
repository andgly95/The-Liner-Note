"use client";

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { getCollectionStats } from "@/lib/optimize-collection";
import type { CompressedCollection } from "@/types/discogs";

interface CollectionStatsProps {
  collection: CompressedCollection;
}

interface BarRowProps {
  label: string;
  count: number;
  total: number;
  color: string;
}

function BarRow({ label, count, total, color }: BarRowProps) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium truncate pr-2">{label}</span>
        <span className="text-muted-foreground tabular-nums shrink-0">
          {count} · {pct}%
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function topEntries(record: Record<string, number>, n: number) {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

export function CollectionStats({ collection }: CollectionStatsProps) {
  const stats = useMemo(() => getCollectionStats(collection), [collection]);
  const total = collection.releases.length;

  const topGenres = topEntries(stats.genreBreakdown, 6);
  const topDecades = Object.entries(stats.decadeBreakdown).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  const topFormats = topEntries(stats.formatBreakdown, 5);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BarChart3 className="w-5 h-5" />
          Collection Breakdown
        </CardTitle>
        <CardDescription>
          Based on {total.toLocaleString()} prioritized item{total === 1 ? "" : "s"}
          {collection.truncated && collection.truncatedAt
            ? ` (top ${collection.truncatedAt.toLocaleString()} of ${collection.totalItems.toLocaleString()})`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid md:grid-cols-3 gap-6">
        <div>
          <h4 className="text-sm font-semibold mb-3">Top Genres</h4>
          <div className="space-y-2">
            {topGenres.length === 0 ? (
              <p className="text-xs text-muted-foreground">No genre data</p>
            ) : (
              topGenres.map(([genre, count]) => (
                <BarRow
                  key={genre}
                  label={genre}
                  count={count}
                  total={total}
                  color="bg-primary"
                />
              ))
            )}
          </div>
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-3">By Decade</h4>
          <div className="space-y-2">
            {topDecades.length === 0 ? (
              <p className="text-xs text-muted-foreground">No year data</p>
            ) : (
              topDecades.map(([decade, count]) => (
                <BarRow
                  key={decade}
                  label={decade}
                  count={count}
                  total={total}
                  color="bg-purple-500"
                />
              ))
            )}
          </div>
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-3">Format</h4>
          <div className="space-y-2">
            {topFormats.length === 0 ? (
              <p className="text-xs text-muted-foreground">No format data</p>
            ) : (
              topFormats.map(([format, count]) => (
                <BarRow
                  key={format}
                  label={format}
                  count={count}
                  total={total}
                  color="bg-orange-500"
                />
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
