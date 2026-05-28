"use client";

import { useEffect } from "react";
import { experimental_useObject as useObject } from "ai/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Search, Loader2, RefreshCw, AlertCircle, Disc3, Square } from "lucide-react";
import { gapFillerResultSchema, type GapFillerResult } from "@/lib/analysis-schemas";
import { useAnalysisCache } from "@/hooks/use-analysis-cache";

interface GapFillerDisplayProps {
  collectionString: string;
  username?: string;
  isReady: boolean;
  onResultsReceived?: (results: GapFillerResult) => void;
}

export function GapFillerDisplay({
  collectionString,
  username,
  isReady,
  onResultsReceived,
}: GapFillerDisplayProps) {
  const { cached, setCached } = useAnalysisCache<GapFillerResult>("gap_filler", username);

  const { submit, isLoading, error, stop } = useObject({
    api: "/api/analyze",
    schema: gapFillerResultSchema,
    onFinish: ({ object }) => {
      if (object) {
        setCached(object);
        onResultsReceived?.(object);
      }
    },
  });

  // Surface cached results to the parent (Oracle uses them) when the cache loads
  // or the user revisits this tab.
  useEffect(() => {
    if (cached) onResultsReceived?.(cached);
  }, [cached, onResultsReceived]);

  const handleAnalyze = () => {
    setCached(null);
    submit({ type: "gap_filler", collection: collectionString });
  };

  if (!isReady) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" />
            Gap Filler
          </CardTitle>
          <CardDescription>Loading your collection to find missing gems...</CardDescription>
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
          <Search className="w-5 h-5 text-primary" />
          Gap Filler
        </CardTitle>
        <CardDescription>
          Identify your core artists and discover essential studio albums missing from your collection.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!cached && !isLoading && !error && (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">Let&apos;s find the gaps in your discographies.</p>
            <Button onClick={handleAnalyze} size="lg">
              <Search className="w-4 h-4 mr-2" />
              Find Missing Albums
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="vinyl-record w-16 h-16 animate-spin-slow" />
            <p className="text-muted-foreground">Analyzing discographies...</p>
            <Button variant="outline" size="sm" onClick={stop}>
              <Square className="w-4 h-4 mr-2" />
              Stop
            </Button>
          </div>
        )}

        {error && !isLoading && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <AlertCircle className="w-12 h-12 text-destructive" />
            <p className="text-destructive text-center">
              {error.message || "Something went wrong. Please try again."}
            </p>
            <Button onClick={handleAnalyze} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        )}

        {cached && !isLoading && (
          <ScrollArea className="h-[500px]">
            <div className="space-y-6">
              <div>
                <h4 className="font-semibold mb-4">Your Core Artists</h4>
                <div className="grid gap-4">
                  {cached.coreArtists.map((artist, i) => (
                    <div key={i} className="bg-muted/50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-medium">{artist.name}</h5>
                        <span className="text-sm text-muted-foreground">
                          {artist.albumCount} albums owned
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {artist.albums.slice(0, 5).map((album, j) => (
                          <span key={j} className="text-xs bg-background px-2 py-1 rounded">
                            {album}
                          </span>
                        ))}
                        {artist.albums.length > 5 && (
                          <span className="text-xs text-muted-foreground px-2 py-1">
                            +{artist.albums.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold mb-4">Critical Missing Albums</h4>
                <div className="space-y-4">
                  {cached.missingAlbums.map((album, i) => (
                    <div key={i} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                          <Disc3 className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <h5 className="font-medium">{album.artist}</h5>
                            <span className="text-muted-foreground">—</span>
                            <span className="text-primary">{album.album}</span>
                            <span className="text-sm text-muted-foreground">({album.year})</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{album.reason}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4">
                <Button onClick={handleAnalyze} variant="outline" className="w-full">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Re-analyze Gaps
                </Button>
              </div>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
