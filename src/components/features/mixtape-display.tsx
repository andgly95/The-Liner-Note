"use client";

import { useMemo, useState } from "react";
import { experimental_useObject as useObject } from "ai/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ListMusic,
  Loader2,
  RefreshCw,
  AlertCircle,
  Square,
  Music,
  Download,
} from "lucide-react";
import { mixtapeResultSchema, type MixtapeResult } from "@/lib/analysis-schemas";
import type { DiscogsCollectionItem } from "@/types/discogs";

interface MixtapeDisplayProps {
  items?: DiscogsCollectionItem[];
  isReady: boolean;
}

const COUNT_OPTIONS = [8, 10, 12] as const;

const QUICK_THEMES = [
  "Side A for a rainy Sunday",
  "Late-night driving",
  "House party warm-up",
  "Dinner party, friends arriving",
  "Heartbreak, slow burn to acceptance",
  "Cooking on a weekend afternoon",
];

function downloadTxt(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function mixtapeToText(m: MixtapeResult): string {
  const lines: string[] = [];
  lines.push(`# ${m.title}`);
  lines.push("");
  lines.push(m.premise);
  lines.push("");
  lines.push("## Side A");
  lines.push("");
  for (const t of m.sideA) {
    lines.push(`${t.position}. ${t.artist} — "${t.track}" (${t.album})`);
    lines.push(`   ${t.transition}`);
    lines.push("");
  }
  lines.push("## Side break");
  lines.push("");
  lines.push(m.sideBreak);
  lines.push("");
  lines.push("## Side B");
  lines.push("");
  for (const t of m.sideB) {
    lines.push(`${t.position}. ${t.artist} — "${t.track}" (${t.album})`);
    lines.push(`   ${t.transition}`);
    lines.push("");
  }
  lines.push("## Closing");
  lines.push("");
  lines.push(m.closing);
  return lines.join("\n");
}

export function MixtapeDisplay({ items, isReady }: MixtapeDisplayProps) {
  const [moodInput, setMoodInput] = useState("");
  const [count, setCount] = useState<number>(8);
  const [lastTheme, setLastTheme] = useState<string | null>(null);
  const [result, setResult] = useState<MixtapeResult | null>(null);
  // Schema-validation errors from useObject's onFinish aren't surfaced via its
  // own `error` field — they're delivered as a parameter to onFinish. We track
  // them ourselves so the user sees feedback instead of a silent reset.
  const [validationError, setValidationError] = useState<string | null>(null);

  // Minimal payload — server only needs id/artist/album/year/genre to do stage 1.
  const minimalItems = useMemo(() => {
    if (!items) return [];
    return items.map((it) => ({
      id: it.id,
      artist: it.basic_information.artists.map((a) => a.name).join(", "),
      album: it.basic_information.title,
      year: it.basic_information.year ?? null,
      genre: it.basic_information.genres?.[0] ?? null,
    }));
  }, [items]);

  const { submit, isLoading, error, stop } = useObject({
    api: "/api/mixtape",
    schema: mixtapeResultSchema,
    onFinish: ({ object, error: validationErr }) => {
      if (object) {
        setResult(object);
        setValidationError(null);
      } else if (validationErr) {
        console.error("Mixtape schema validation failed:", validationErr);
        setValidationError(
          validationErr.message || "The mixtape didn't match the expected shape. Try again."
        );
      }
    },
    onError: (err) => {
      console.error("Mixtape request error:", err);
    },
  });

  // useObject wraps fetch errors with the raw response body as the message —
  // which arrives as `{"error":"..."}` JSON. Unwrap so the user sees the
  // human-readable message (e.g. "Your credit balance is too low...").
  const unwrap = (msg?: string) => {
    if (!msg) return undefined;
    try {
      const parsed = JSON.parse(msg);
      if (parsed && typeof parsed.error === "string") return parsed.error;
    } catch {
      // not JSON — return as-is
    }
    return msg;
  };
  const displayedError = unwrap(error?.message) || validationError;

  const runMixtape = (theme: string) => {
    const trimmed = theme.trim();
    if (!trimmed || minimalItems.length === 0) return;
    setLastTheme(trimmed);
    setResult(null);
    setValidationError(null);
    submit({ mood: trimmed, trackCount: count, items: minimalItems });
  };

  const reset = () => {
    setResult(null);
    setMoodInput("");
    setLastTheme(null);
    setValidationError(null);
  };

  if (!isReady) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListMusic className="w-5 h-5 text-primary" />
            The Mixtape
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
          <ListMusic className="w-5 h-5 text-primary" />
          The Mixtape
        </CardTitle>
        <CardDescription>
          Sequenced Side A / Side B mixtapes from your collection, with explained transitions. Powered by Opus 4.7.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!result && !isLoading && !displayedError && (
          <div className="space-y-6 py-2">
            <div>
              <label className="text-sm font-medium mb-2 block">How many tracks?</label>
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
              <label className="text-sm font-medium mb-2 block">Themes to try</label>
              <div className="flex flex-wrap gap-2">
                {QUICK_THEMES.map((q) => (
                  <Button
                    key={q}
                    variant="outline"
                    size="sm"
                    onClick={() => runMixtape(q)}
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
                      runMixtape(moodInput);
                    }
                  }}
                  placeholder="e.g. summer night, drinks on the balcony, slow descent into honest conversation"
                  className="flex-1 px-3 py-2 text-sm rounded-md border border-input bg-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button onClick={() => runMixtape(moodInput)} disabled={!moodInput.trim()}>
                  Build mixtape
                </Button>
              </div>
            </div>

            <div className="text-xs text-muted-foreground border-t pt-3">
              First run takes ~30-60 seconds: we have to pull tracklists from Discogs for the
              candidate albums (cached after first use, so subsequent runs are faster).
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="vinyl-record w-16 h-16 animate-spin-slow" />
            <p className="text-muted-foreground text-center max-w-md">
              {lastTheme ? (
                <>
                  Sequencing for <span className="italic">&ldquo;{lastTheme}&rdquo;</span>...
                </>
              ) : (
                "Sequencing..."
              )}
              <br />
              <span className="text-xs">Narrowing → pulling tracklists → letting Opus sequence.</span>
            </p>
            <Button variant="outline" size="sm" onClick={stop}>
              <Square className="w-4 h-4 mr-2" />
              Stop
            </Button>
          </div>
        )}

        {displayedError && !isLoading && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <AlertCircle className="w-12 h-12 text-destructive" />
            <p className="text-destructive text-center max-w-md">{displayedError}</p>
            <p className="text-xs text-muted-foreground text-center max-w-md">
              Check the browser console for details if this keeps happening.
            </p>
            <Button onClick={reset} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        )}

        {result && !isLoading && (
          <ScrollArea className="h-[600px]">
            <div className="space-y-6">
              {/* Header */}
              <div className="bg-gradient-to-br from-primary/10 via-purple-500/10 to-orange-500/10 rounded-lg p-6">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  For: {lastTheme}
                </div>
                <h3 className="text-2xl font-bold mb-3">{result.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{result.premise}</p>
              </div>

              {/* Side A */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    A
                  </div>
                  <h4 className="font-semibold">Side A</h4>
                </div>
                <div className="space-y-3">
                  {result.sideA.map((t) => (
                    <div key={t.position} className="border rounded-lg p-4">
                      <div className="flex items-baseline gap-3 mb-1.5">
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-6">
                          {t.position}.
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{t.artist}</div>
                          <div className="text-sm">
                            <span className="text-primary">&ldquo;{t.track}&rdquo;</span>
                            <span className="text-muted-foreground"> · {t.album}</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground pl-9">{t.transition}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Side break */}
              <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-center">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  Side break — flip the tape
                </div>
                <p className="text-sm italic">{result.sideBreak}</p>
              </div>

              {/* Side B */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">
                    B
                  </div>
                  <h4 className="font-semibold">Side B</h4>
                </div>
                <div className="space-y-3">
                  {result.sideB.map((t) => (
                    <div key={t.position} className="border rounded-lg p-4">
                      <div className="flex items-baseline gap-3 mb-1.5">
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-6">
                          {t.position}.
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{t.artist}</div>
                          <div className="text-sm">
                            <span className="text-purple-600 dark:text-purple-400">
                              &ldquo;{t.track}&rdquo;
                            </span>
                            <span className="text-muted-foreground"> · {t.album}</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground pl-9">{t.transition}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Closing */}
              <div className="bg-muted/40 rounded-lg p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  <Music className="w-3 h-3" />
                  And we&apos;re out
                </div>
                <p className="text-sm">{result.closing}</p>
              </div>

              <Separator />

              <div className="flex gap-2">
                <Button onClick={reset} variant="outline" className="flex-1">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  New mixtape
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const safe = result.title.replace(/[^a-z0-9-_ ]/gi, "").trim().slice(0, 60) || "mixtape";
                    downloadTxt(`${safe}.txt`, mixtapeToText(result));
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
