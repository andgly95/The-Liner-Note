"use client";

import { experimental_useObject as useObject } from "ai/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Telescope,
  Loader2,
  RefreshCw,
  AlertCircle,
  Square,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { obscurenessResultSchema, type ObscurenessResult } from "@/lib/analysis-schemas";
import { useAnalysisCache } from "@/hooks/use-analysis-cache";

interface ObscurenessDisplayProps {
  collectionString: string;
  username?: string;
  isReady: boolean;
}

interface ItemRowProps {
  artist: string;
  album: string;
  score: number;
  why: string;
}

function ItemRow({ artist, album, score, why }: ItemRowProps) {
  return (
    <div className="border rounded-md p-3">
      <div className="flex justify-between items-baseline gap-2 mb-1">
        <div className="text-sm min-w-0">
          <span className="font-medium">{artist}</span>
          <span className="text-muted-foreground"> — </span>
          <span>{album}</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {score}/10
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{why}</p>
    </div>
  );
}

export function ObscurenessDisplay({ collectionString, username, isReady }: ObscurenessDisplayProps) {
  const { cached, setCached } = useAnalysisCache<ObscurenessResult>("obscureness", username);

  const { submit, isLoading, error, stop } = useObject({
    api: "/api/analyze",
    schema: obscurenessResultSchema,
    onFinish: ({ object }) => {
      if (object) setCached(object);
    },
  });

  const handleAnalyze = () => {
    setCached(null);
    submit({ type: "obscureness", collection: collectionString });
  };

  if (!isReady) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Telescope className="w-5 h-5 text-primary" />
            Obscureness
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
          <Telescope className="w-5 h-5 text-primary" />
          Obscureness
        </CardTitle>
        <CardDescription>
          How deep does the rabbit hole go? Score your collection&apos;s mainstream-to-obscure spread.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!cached && !isLoading && !error && (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              Are you a casual listener or a crate-digger lifer?
            </p>
            <Button onClick={handleAnalyze} size="lg">
              <Telescope className="w-4 h-4 mr-2" />
              Analyze Obscureness
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="vinyl-record w-16 h-16 animate-spin-slow" />
            <p className="text-muted-foreground">Measuring how deep you&apos;ve gone...</p>
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
              {/* Score */}
              <div className="bg-gradient-to-r from-primary/10 to-purple-500/10 rounded-lg p-6 text-center">
                <p className="text-sm text-muted-foreground uppercase tracking-wider mb-2">
                  Your Obscureness Score
                </p>
                <div className="text-5xl font-bold mb-2">
                  {cached.overallScore.toFixed(1)}
                  <span className="text-xl text-muted-foreground"> / 10</span>
                </div>
                <div className="text-lg font-medium text-primary mb-3">{cached.archetype}</div>
                <p className="text-sm text-muted-foreground">{cached.summary}</p>
                {/* Visual scale */}
                <div className="mt-4 relative h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="absolute top-0 h-full w-2 bg-primary -translate-x-1/2"
                    style={{ left: `${(cached.overallScore / 10) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Mainstream</span>
                  <span>Obscure</span>
                </div>
              </div>

              <Separator />

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingDown className="w-4 h-4 text-green-500" />
                    <h4 className="font-semibold">Most Mainstream</h4>
                  </div>
                  <div className="space-y-2">
                    {cached.mostMainstream.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        Nothing mainstream here.
                      </p>
                    ) : (
                      cached.mostMainstream.map((item, i) => (
                        <ItemRow key={i} {...item} />
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-purple-500" />
                    <h4 className="font-semibold">Most Obscure</h4>
                  </div>
                  <div className="space-y-2">
                    {cached.mostObscure.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        Nothing obscure here.
                      </p>
                    ) : (
                      cached.mostObscure.map((item, i) => (
                        <ItemRow key={i} {...item} />
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <Button onClick={handleAnalyze} variant="outline" className="w-full">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Re-analyze
                </Button>
              </div>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
