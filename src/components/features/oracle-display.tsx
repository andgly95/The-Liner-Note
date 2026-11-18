"use client";

import { experimental_useObject as useObject } from "ai/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles,
  Loader2,
  RefreshCw,
  AlertCircle,
  ShoppingCart,
  Lightbulb,
  Square,
} from "lucide-react";
import { oracleResultSchema, type OracleResult, type GapFillerResult } from "@/lib/analysis-schemas";
import { useAnalysisCache } from "@/hooks/use-analysis-cache";

interface OracleDisplayProps {
  collectionString: string;
  username?: string;
  wantlistString?: string;
  gapFillerResults?: GapFillerResult | null;
  isReady: boolean;
}

export function OracleDisplay({
  collectionString,
  username,
  wantlistString,
  gapFillerResults,
  isReady,
}: OracleDisplayProps) {
  const { cached, setCached } = useAnalysisCache<OracleResult>("oracle", username);

  const { submit, isLoading, error, stop } = useObject({
    api: "/api/analyze",
    schema: oracleResultSchema,
    onFinish: ({ object }) => {
      if (object) setCached(object);
    },
  });

  const gapFillerString = gapFillerResults
    ? JSON.stringify(gapFillerResults, null, 2)
    : undefined;

  const handleAnalyze = () => {
    setCached(null);
    submit({
      type: "oracle",
      collection: collectionString,
      wantlist: wantlistString,
      gapFillerResults: gapFillerString,
    });
  };

  if (!isReady) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-chart-2" />
            The oracle
          </CardTitle>
          <CardDescription>Loading your collection to predict the future...</CardDescription>
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
          <Sparkles className="w-5 h-5 text-chart-2" />
          The oracle
        </CardTitle>
        <CardDescription>
          Predict your next purchases and discover albums you don&apos;t know you want yet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasPrerequisites && !cached && !isLoading && (
          <div className="bg-muted/50 rounded-lg p-6 text-center">
            <Lightbulb className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h4 className="font-medium mb-2">Tip</h4>
            <p className="text-sm text-muted-foreground mb-4">
              For the best predictions, run the Gap filler analysis first. The Oracle uses those
              results along with your wantlist to make smarter recommendations.
            </p>
            <Button onClick={handleAnalyze} variant="outline">
              <Sparkles className="w-4 h-4 mr-2" />
              Run the oracle anyway
            </Button>
          </div>
        )}

        {hasPrerequisites && !cached && !isLoading && !error && (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              Ready to see what&apos;s in your future.
              {gapFillerResults && " Gap filler results loaded."}
              {wantlistString && " Wantlist loaded."}
            </p>
            <Button onClick={handleAnalyze} size="lg">
              <Sparkles className="w-4 h-4 mr-2" />
              Consult the oracle
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="vinyl-record w-16 h-16 animate-spin-slow" />
            <p className="text-muted-foreground">Predicting your vinyl destiny...</p>
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
              Try again
            </Button>
          </div>
        )}

        {cached && !isLoading && (
          <ScrollArea className="h-[500px]">
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <ShoppingCart className="w-5 h-5 text-chart-4" />
                  <h4 className="font-semibold">Predicted next purchases</h4>
                </div>
                <div className="space-y-3">
                  {cached.likelyPurchases.map((purchase, i) => (
                    <div
                      key={i}
                      className="border border-chart-4/20 bg-chart-4/5 rounded-lg p-4"
                    >
                      <div className="flex items-baseline gap-2 flex-wrap mb-2">
                        <span className="text-lg font-medium">{purchase.artist}</span>
                        <span className="text-muted-foreground">—</span>
                        <span className="text-chart-4 dark:text-chart-4">{purchase.album}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{purchase.reason}</p>
                      <span className="inline-block mt-2 text-xs px-2 py-1 bg-chart-4/10 text-chart-4 dark:text-chart-4 rounded">
                        {purchase.source === "wantlist" ? "From your wantlist" : "Gap filler"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="w-5 h-5 text-chart-2" />
                  <h4 className="font-semibold">Albums You Don&apos;t Know You Want</h4>
                </div>
                <div className="space-y-3">
                  {cached.suggestedAdds.map((suggestion, i) => (
                    <div
                      key={i}
                      className="border border-chart-2/20 bg-chart-2/5 rounded-lg p-4"
                    >
                      <div className="flex items-baseline gap-2 flex-wrap mb-2">
                        <span className="text-lg font-medium">{suggestion.artist}</span>
                        <span className="text-muted-foreground">—</span>
                        <span className="text-chart-2 dark:text-chart-2">{suggestion.album}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
                      <span className="inline-block mt-2 text-xs px-2 py-1 bg-chart-2/10 text-chart-2 dark:text-chart-2 rounded capitalize">
                        {suggestion.logic.replace("_", " ")} Logic
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4">
                <Button onClick={handleAnalyze} variant="outline" className="w-full">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Get new predictions
                </Button>
              </div>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
