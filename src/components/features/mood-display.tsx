"use client";

// Mood: say how you feel, get 3, 5 or 10 records from your own shelves. Asked
// fresh every time, so nothing is kept.
import { useState } from "react";
import { Headphones, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MoodResult } from "@/types/analysis";
import { AlbumPick, Failed, Running, ToolHeader, useAnalysis } from "./tool-frame";

interface Props {
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

export function MoodDisplay({ collectionString, isReady }: Props) {
  const [moodInput, setMoodInput] = useState("");
  const [count, setCount] = useState<number>(3);
  const [asked, setAsked] = useState<{ mood: string; count: number } | null>(null);
  const a = useAnalysis<MoodResult>("mood", undefined, false);

  const runMood = (mood: string) => {
    const m = mood.trim();
    if (!m || !isReady) return;
    setAsked({ mood: m, count });
    a.run({ collection: collectionString, mood: m, count });
  };
  const reset = () => {
    a.setResult(null);
    setAsked(null);
  };

  return (
    <div className="space-y-6">
      <ToolHeader icon={<Headphones className="w-5 h-5 text-primary" />} title="The mood">
        Tell me how you&apos;re feeling and I&apos;ll pick records from your shelves.
      </ToolHeader>

      {a.running ? (
        <Running
          label={<>Finding {asked?.count} for <span className="italic">&ldquo;{asked?.mood}&rdquo;</span>…</>}
          onStop={a.stop}
        />
      ) : a.error ? (
        <Failed message={a.error} onRetry={() => asked && runMood(asked.mood)} />
      ) : a.result && asked ? (
        <>
          <p className="text-sm text-muted-foreground">
            For <span className="text-foreground italic">&ldquo;{asked.mood}&rdquo;</span>
          </p>
          <ul className="divide-y border-y">
            {a.result.picks.map((p) => (
              <AlbumPick key={`${p.artist}|${p.album}`} artist={p.artist} album={p.album}>
                {p.reason}
              </AlbumPick>
            ))}
          </ul>
          <Button variant="outline" className="h-10 rounded-full w-full" onClick={reset}>
            <RefreshCw className="w-4 h-4 mr-2" /> A different mood
          </Button>
        </>
      ) : (
        <div className="space-y-6">
          <div>
            <h3 className="section-label mb-2">How many records</h3>
            <div className="inline-flex rounded-full bg-muted p-1">
              {COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={cn(
                    "h-9 px-5 rounded-full text-sm font-medium transition-colors",
                    count === n ? "bg-background shadow-sm" : "text-muted-foreground"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="section-label mb-2">Quick picks</h3>
            <div className="flex flex-wrap gap-2">
              {QUICK_MOODS.map((q) => (
                <Button key={q} variant="outline" className="h-9 rounded-full" disabled={!isReady} onClick={() => runMood(q)}>
                  {q}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="section-label mb-2">Or say it your way</h3>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                runMood(moodInput);
              }}
            >
              <input
                value={moodInput}
                onChange={(e) => setMoodInput(e.target.value)}
                placeholder="Wallowing about an ex on a Tuesday afternoon"
                enterKeyHint="go"
                className="flex-1 min-w-0 h-11 px-4 text-base sm:text-sm rounded-full border border-input bg-card placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[1.5px] focus-visible:ring-primary"
              />
              <Button type="submit" className="h-11 rounded-full" disabled={!moodInput.trim() || !isReady}>
                Pick {count}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
