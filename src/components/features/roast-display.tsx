"use client";

import { experimental_useObject as useObject } from "ai/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Flame, Loader2, RefreshCw, AlertCircle, Square } from "lucide-react";
import { roastResultSchema, type RoastResult } from "@/lib/analysis-schemas";
import { useAnalysisCache } from "@/hooks/use-analysis-cache";

interface RoastDisplayProps {
  collectionString: string;
  username?: string;
  isReady: boolean;
}

export function RoastDisplay({ collectionString, username, isReady }: RoastDisplayProps) {
  const { cached, setCached } = useAnalysisCache<RoastResult>("roast", username);

  const { submit, isLoading, error, stop } = useObject({
    api: "/api/analyze",
    schema: roastResultSchema,
    onFinish: ({ object }) => {
      if (object) setCached(object);
    },
  });

  const handleAnalyze = () => {
    setCached(null);
    submit({ type: "roast", collection: collectionString });
  };

  if (!isReady) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-destructive" />
            The Roast
          </CardTitle>
          <CardDescription>
            Loading your collection before we can roast it...
          </CardDescription>
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
          <Flame className="w-5 h-5 text-destructive" />
          The Roast
        </CardTitle>
        <CardDescription>
          Let AI analyze your collection and deliver a personalized, humorous roast of your taste.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!cached && !isLoading && !error && (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              Ready to see what your collection says about you?
            </p>
            <Button onClick={handleAnalyze} size="lg">
              <Flame className="w-4 h-4 mr-2" />
              Roast My Collection
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="vinyl-record w-16 h-16 animate-spin-slow" />
            <p className="text-muted-foreground">Analyzing your taste...</p>
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
              <div className="bg-gradient-to-r from-destructive/10 to-orange-500/10 rounded-lg p-6 text-center">
                <p className="text-sm text-muted-foreground uppercase tracking-wider mb-2">
                  Your Collector Archetype
                </p>
                <h3 className="text-2xl font-bold text-destructive mb-2">
                  {cached.archetype.title}
                </h3>
                <p className="text-muted-foreground">{cached.archetype.description}</p>
              </div>

              <div>
                <h4 className="font-semibold mb-3">The Roast</h4>
                <div className="prose-roast text-foreground whitespace-pre-wrap">
                  {cached.roast}
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold mb-3">Taste Patterns Detected</h4>
                <ul className="space-y-2">
                  {cached.tastePatterns.map((pattern, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-destructive">•</span>
                      <span className="text-muted-foreground">{pattern}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold mb-3">Cliche Alert</h4>
                <ul className="space-y-2">
                  {cached.clicheAlbums.map((album, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-orange-500">•</span>
                      <span className="text-muted-foreground">{album}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold mb-3">Collection Balance</h4>
                <p className="text-muted-foreground mb-2">{cached.valueDistribution.summary}</p>
                <ul className="space-y-1">
                  {cached.valueDistribution.highlights.map((highlight, i) => (
                    <li key={i} className="text-sm text-muted-foreground">
                      • {highlight}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-4">
                <Button onClick={handleAnalyze} variant="outline" className="w-full">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Get Another Roast
                </Button>
              </div>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
