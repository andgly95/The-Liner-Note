"use client";

import { useState } from "react";
import { useCompletion } from "ai/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sparkles, Loader2, RefreshCw, AlertCircle, ShoppingCart, Lightbulb } from "lucide-react";
import type { GapFillerResult, OracleResult } from "@/types/analysis";

interface OracleDisplayProps {
  collectionString: string;
  wantlistString?: string;
  gapFillerResults?: GapFillerResult | null;
  isReady: boolean;
}

export function OracleDisplay({
  collectionString,
  wantlistString,
  gapFillerResults,
  isReady,
}: OracleDisplayProps) {
  const [result, setResult] = useState<OracleResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const gapFillerString = gapFillerResults
    ? JSON.stringify(gapFillerResults, null, 2)
    : undefined;

  const { complete, isLoading, error } = useCompletion({
    api: "/api/analyze",
    body: {
      type: "oracle",
      collection: collectionString,
      wantlist: wantlistString,
      gapFillerResults: gapFillerString,
    },
    onFinish: (_, completion) => {
      try {
        const jsonMatch = completion.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as OracleResult;
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
            <Sparkles className="w-5 h-5 text-purple-500" />
            The Oracle
          </CardTitle>
          <CardDescription>
            Loading your collection to predict the future...
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

  const hasPrerequisites = gapFillerResults || wantlistString;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-500" />
          The Oracle
        </CardTitle>
        <CardDescription>
          Predict your next purchases and discover albums you don&apos;t know you want yet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasPrerequisites && !result && !isLoading && (
          <div className="bg-muted/50 rounded-lg p-6 text-center">
            <Lightbulb className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h4 className="font-medium mb-2">Pro Tip</h4>
            <p className="text-sm text-muted-foreground mb-4">
              For the best predictions, run the Gap Filler analysis first. The Oracle uses those
              results along with your wantlist to make smarter recommendations.
            </p>
            <Button onClick={handleAnalyze} variant="outline">
              <Sparkles className="w-4 h-4 mr-2" />
              Run Oracle Anyway
            </Button>
          </div>
        )}

        {hasPrerequisites && !result && !isLoading && !error && (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              Ready to see what&apos;s in your future.
              {gapFillerResults && " Gap Filler results loaded."}
              {wantlistString && " Wantlist loaded."}
            </p>
            <Button onClick={handleAnalyze} size="lg">
              <Sparkles className="w-4 h-4 mr-2" />
              Consult The Oracle
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="vinyl-record w-16 h-16 animate-spin-slow" />
            <p className="text-muted-foreground">Predicting your vinyl destiny...</p>
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
              {/* Likely Purchases */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <ShoppingCart className="w-5 h-5 text-green-500" />
                  <h4 className="font-semibold">Predicted Next Purchases</h4>
                </div>
                <div className="space-y-3">
                  {result.likelyPurchases.map((purchase, i) => (
                    <div
                      key={i}
                      className="border border-green-500/20 bg-green-500/5 rounded-lg p-4"
                    >
                      <div className="flex items-baseline gap-2 flex-wrap mb-2">
                        <span className="text-lg font-medium">{purchase.artist}</span>
                        <span className="text-muted-foreground">—</span>
                        <span className="text-green-600 dark:text-green-400">
                          {purchase.album}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{purchase.reason}</p>
                      <span className="inline-block mt-2 text-xs px-2 py-1 bg-green-500/10 text-green-600 dark:text-green-400 rounded">
                        {purchase.source === "wantlist" ? "From Wantlist" : "Gap Filler"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Suggested Additions */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="w-5 h-5 text-purple-500" />
                  <h4 className="font-semibold">Albums You Don&apos;t Know You Want</h4>
                </div>
                <div className="space-y-3">
                  {result.suggestedAdds.map((suggestion, i) => (
                    <div
                      key={i}
                      className="border border-purple-500/20 bg-purple-500/5 rounded-lg p-4"
                    >
                      <div className="flex items-baseline gap-2 flex-wrap mb-2">
                        <span className="text-lg font-medium">{suggestion.artist}</span>
                        <span className="text-muted-foreground">—</span>
                        <span className="text-purple-600 dark:text-purple-400">
                          {suggestion.album}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
                      <span className="inline-block mt-2 text-xs px-2 py-1 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded capitalize">
                        {suggestion.logic.replace("_", " ")} Logic
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Try Again */}
              <div className="pt-4">
                <Button onClick={handleAnalyze} variant="outline" className="w-full">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Get New Predictions
                </Button>
              </div>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
