"use client";

import { useState } from "react";
import { useCompletion } from "ai/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Flame, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import type { RoastResult } from "@/types/analysis";

interface RoastDisplayProps {
  collectionString: string;
  isReady: boolean;
}

export function RoastDisplay({ collectionString, isReady }: RoastDisplayProps) {
  const [result, setResult] = useState<RoastResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const { complete, isLoading, error } = useCompletion({
    api: "/api/analyze",
    body: {
      type: "roast",
      collection: collectionString,
    },
    onFinish: (_, completion) => {
      try {
        // Try to extract JSON from the response
        const jsonMatch = completion.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as RoastResult;
          setResult(parsed);
          setParseError(null);
        } else {
          setParseError("Could not parse response");
        }
      } catch (e) {
        console.error("Parse error:", e);
        setParseError("Failed to parse analysis result");
      }
    },
  });

  const handleAnalyze = () => {
    setResult(null);
    setParseError(null);
    complete("");
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
        {!result && !isLoading && !error && (
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
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <AlertCircle className="w-12 h-12 text-destructive" />
            <p className="text-destructive">Something went wrong. Please try again.</p>
            <Button onClick={handleAnalyze} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        )}

        {parseError && !isLoading && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <AlertCircle className="w-12 h-12 text-destructive" />
            <p className="text-destructive">{parseError}</p>
            <Button onClick={handleAnalyze} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        )}

        {result && (
          <ScrollArea className="h-[500px]">
            <div className="space-y-6">
              {/* Archetype Badge */}
              <div className="bg-gradient-to-r from-destructive/10 to-orange-500/10 rounded-lg p-6 text-center">
                <p className="text-sm text-muted-foreground uppercase tracking-wider mb-2">
                  Your Collector Archetype
                </p>
                <h3 className="text-2xl font-bold text-destructive mb-2">
                  {result.archetype.title}
                </h3>
                <p className="text-muted-foreground">{result.archetype.description}</p>
              </div>

              {/* Main Roast */}
              <div>
                <h4 className="font-semibold mb-3">The Roast</h4>
                <div className="prose-roast text-foreground whitespace-pre-wrap">
                  {result.roast}
                </div>
              </div>

              <Separator />

              {/* Taste Patterns */}
              <div>
                <h4 className="font-semibold mb-3">Taste Patterns Detected</h4>
                <ul className="space-y-2">
                  {result.tastePatterns.map((pattern, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-destructive">•</span>
                      <span className="text-muted-foreground">{pattern}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Separator />

              {/* Cliche Albums */}
              <div>
                <h4 className="font-semibold mb-3">Cliche Alert</h4>
                <ul className="space-y-2">
                  {result.clicheAlbums.map((album, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-orange-500">•</span>
                      <span className="text-muted-foreground">{album}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Separator />

              {/* Value Distribution */}
              <div>
                <h4 className="font-semibold mb-3">Collection Balance</h4>
                <p className="text-muted-foreground mb-2">{result.valueDistribution.summary}</p>
                <ul className="space-y-1">
                  {result.valueDistribution.highlights.map((highlight, i) => (
                    <li key={i} className="text-sm text-muted-foreground">
                      • {highlight}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Try Again */}
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
