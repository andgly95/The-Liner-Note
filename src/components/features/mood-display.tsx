"use client";

import { useState } from "react";
import { experimental_useObject as useObject } from "ai/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Headphones, Loader2, RefreshCw, AlertCircle, Square, Disc3 } from "lucide-react";
import { moodResultSchema, type MoodResult } from "@/lib/analysis-schemas";

interface MoodDisplayProps {
  collectionString: string;
  isReady: boolean;
}

const QUICK_MOODS = [
  "Rainy day melancholy",
  "Sunday morning coffee",
  "Late night focus",
  "High energy workout",
  "Long drive at sunset",
  "Dinner party background",
];

const COUNT_OPTIONS = [3, 5, 10] as const;

export function MoodDisplay({ collectionString, isReady }: MoodDisplayProps) {
  const [moodInput, setMoodInput] = useState("");
  const [count, setCount] = useState<number>(3);
  const [lastMood, setLastMood] = useState<string | null>(null);
  const [lastCount, setLastCount] = useState<number>(3);
  const [result, setResult] = useState<MoodResult | null>(null);

  const { submit, isLoading, error, stop } = useObject({
    api: "/api/analyze",
    schema: moodResultSchema,
    onFinish: ({ object }) => {
      if (object) setResult(object);
    },
  });

  const runMood = (mood: string) => {
    const trimmed = mood.trim();
    if (!trimmed) return;
    setLastMood(trimmed);
    setLastCount(count);
    setResult(null);
    submit({ type: "mood", collection: collectionString, mood: trimmed, count });
  };

  const resetToInput = () => {
    setResult(null);
    setMoodInput("");
    setLastMood(null);
  };

  if (!isReady) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Headphones className="w-5 h-5 text-primary" />
            The Mood
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
          <Headphones className="w-5 h-5 text-primary" />
          The Mood
        </CardTitle>
        <CardDescription>
          Tell me how you&apos;re feeling and I&apos;ll pick 3 records from your shelf.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!result && !isLoading && !error && (
          <div className="space-y-6 py-2">
            <div>
              <label className="text-sm font-medium mb-2 block">How many records?</label>
              <div className="inline-flex rounded-md border border-input overflow-hidden">
                {COUNT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCount(n)}
                    className={`px-4 py-1.5 text-sm transition-colors ${
                      count === n
                        ? "bg-primary text-primary-foreground"
                        : "bg-background hover:bg-muted"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Quick picks</label>
              <div className="flex flex-wrap gap-2">
                {QUICK_MOODS.map((q) => (
                  <Button
                    key={q}
                    variant="outline"
                    size="sm"
                    onClick={() => runMood(q)}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Or describe your own</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={moodInput}
                  onChange={(e) => setMoodInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      runMood(moodInput);
                    }
                  }}
                  placeholder="e.g. wallowing about an ex on a Tuesday afternoon"
                  className="flex-1 px-3 py-2 text-sm rounded-md border border-input bg-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button onClick={() => runMood(moodInput)} disabled={!moodInput.trim()}>
                  Pick {count}
                </Button>
              </div>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="vinyl-record w-16 h-16 animate-spin-slow" />
            <p className="text-muted-foreground text-center">
              {lastMood ? (
                <>
                  Finding {lastCount} pick{lastCount === 1 ? "" : "s"} for{" "}
                  <span className="italic">&ldquo;{lastMood}&rdquo;</span>...
                </>
              ) : (
                "Picking..."
              )}
            </p>
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
            <Button onClick={resetToInput} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        )}

        {result && !isLoading && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              For: <span className="text-foreground italic">&ldquo;{lastMood}&rdquo;</span>
            </div>
            <div className="grid gap-3">
              {result.picks.map((pick, i) => (
                <div key={i} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <Disc3 className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <h5 className="font-medium">{pick.artist}</h5>
                        <span className="text-muted-foreground">—</span>
                        <span className="text-primary">{pick.album}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{pick.reason}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Button onClick={resetToInput} variant="outline" className="w-full">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try a different mood
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
