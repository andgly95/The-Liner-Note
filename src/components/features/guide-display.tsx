"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  BookOpen,
  Loader2,
  RefreshCw,
  AlertCircle,
  Square,
  Search,
  Plus,
  Trash2,
  ChevronLeft,
  Disc3,
  Download,
} from "lucide-react";
import type { ListeningGuideResult } from "@/lib/analysis-schemas";
import type { DiscogsCollectionItem } from "@/types/discogs";

interface GuideDisplayProps {
  items?: DiscogsCollectionItem[];
  isReady: boolean;
}

interface SavedGuide {
  releaseId: number;
  artist: string;
  album: string;
  year?: number | null;
  coverImage?: string | null;
  guide: ListeningGuideResult;
  createdAt: number;
}

const STORAGE_KEY = "linernote-listening-guides";

const artistOf = (it: DiscogsCollectionItem) =>
  it.basic_information.artists.map((a) => a.name).join(", ");

function safeWrite(value: string) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch (e) {
    console.warn("Failed to save guides (storage quota?):", e);
  }
}


function guideToMarkdown(g: SavedGuide): string {
  const year = g.year ? ` (${g.year})` : "";
  const lines: string[] = [];
  lines.push(`# ${g.artist} — ${g.album}${year}`);
  lines.push("");
  lines.push(`_Listening guide generated ${new Date(g.createdAt).toLocaleString()}_`);
  lines.push("");
  lines.push("## Album");
  lines.push("");
  lines.push(g.guide.albumIntro);
  lines.push("");
  lines.push("## Track-by-track");
  lines.push("");
  for (const t of g.guide.trackGuides) {
    lines.push(`### ${t.position}. ${t.title}`);
    lines.push("");
    lines.push(t.commentary);
    lines.push("");
  }
  lines.push("## Closing");
  lines.push("");
  lines.push(g.guide.closing);
  return lines.join("\n");
}

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type Mode = "list" | "picker" | "viewing";

export function GuideDisplay({ items, isReady }: GuideDisplayProps) {
  const [guides, setGuides] = useState<SavedGuide[]>([]);
  const [mode, setMode] = useState<Mode>("list");
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [generatingFor, setGeneratingFor] = useState<DiscogsCollectionItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [displayedError, setDisplayedError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setGuides(JSON.parse(saved) as SavedGuide[]);
    } catch (e) {
      console.warn("Failed to read saved guides:", e);
    }
  }, []);

  const persist = useCallback((next: SavedGuide[]) => {
    setGuides(next);
    safeWrite(JSON.stringify(next));
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const generateGuide = useCallback(
    async (item: DiscogsCollectionItem) => {
      setDisplayedError(null);
      setGeneratingFor(item);
      setIsLoading(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/guide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ releaseId: item.id }),
          signal: controller.signal,
        });
        if (!res.ok) {
          let msg = `Request failed (${res.status})`;
          try {
            const body = await res.json();
            if (body?.error) msg = body.error;
          } catch {
            // body wasn't JSON
          }
          throw new Error(msg);
        }
        const guide = (await res.json()) as ListeningGuideResult;
        const newGuide: SavedGuide = {
          releaseId: item.id,
          artist: artistOf(item),
          album: item.basic_information.title,
          year: item.basic_information.year,
          coverImage:
            item.basic_information.thumb || item.basic_information.cover_image,
          guide,
          createdAt: Date.now(),
        };
        setGuides((prev) => {
          const next = [newGuide, ...prev.filter((g) => g.releaseId !== newGuide.releaseId)];
          safeWrite(JSON.stringify(next));
          return next;
        });
        setGeneratingFor(null);
        setMode("viewing");
        setViewingId(newGuide.releaseId);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          // User clicked Stop — silent.
        } else {
          console.error("Guide request error:", e);
          setDisplayedError(
            e instanceof Error ? e.message : "Guide generation failed."
          );
        }
        setGeneratingFor(null);
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    []
  );

  const handleGenerate = (item: DiscogsCollectionItem) => {
    // If we already have a guide for this release, open it instead of regenerating.
    const existing = guides.find((g) => g.releaseId === item.id);
    if (existing) {
      setMode("viewing");
      setViewingId(existing.releaseId);
      return;
    }
    generateGuide(item);
  };

  const deleteGuide = (releaseId: number) => {
    const next = guides.filter((g) => g.releaseId !== releaseId);
    persist(next);
    if (viewingId === releaseId) {
      setMode("list");
      setViewingId(null);
    }
  };

  const sortedGuides = useMemo(
    () => [...guides].sort((a, b) => b.createdAt - a.createdAt),
    [guides]
  );

  const filteredPickerItems = useMemo(() => {
    const all = items ?? [];
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return all.slice(0, 200);
    return all
      .filter((it) =>
        `${artistOf(it)} ${it.basic_information.title}`.toLowerCase().includes(q)
      )
      .slice(0, 200);
  }, [items, pickerQuery]);

  const viewing = useMemo(
    () => (viewingId != null ? guides.find((g) => g.releaseId === viewingId) ?? null : null),
    [viewingId, guides]
  );

  if (!isReady) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Listening Guides
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

  // ── Loading (generation in progress) ─────────────────────────────────────
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Listening Guides
          </CardTitle>
          <CardDescription>
            {generatingFor
              ? `Writing the guide for ${artistOf(generatingFor)} — ${generatingFor.basic_information.title}...`
              : "Writing the guide..."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="vinyl-record w-16 h-16 animate-spin-slow" />
            <p className="text-muted-foreground text-center text-sm max-w-md">
              Opus 4.7 is reading the tracklist and writing track-by-track. Usually 30-60 seconds.
              The result will be saved automatically — you&apos;ll never have to regenerate this one.
            </p>
            <Button variant="outline" size="sm" onClick={stop}>
              <Square className="w-4 h-4 mr-2" />
              Stop
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (displayedError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Listening Guides
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <AlertCircle className="w-12 h-12 text-destructive" />
            <p className="text-destructive text-center max-w-md">{displayedError}</p>
            <Button
              onClick={() => {
                setDisplayedError(null);
                setGeneratingFor(null);
                setMode("list");
              }}
              variant="outline"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Back to guides
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Viewing a saved guide ────────────────────────────────────────────────
  if (mode === "viewing" && viewing) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-3 min-w-0">
              <div className="w-16 h-16 relative bg-muted rounded overflow-hidden shrink-0">
                {viewing.coverImage ? (
                  <Image
                    src={viewing.coverImage}
                    alt=""
                    fill
                    sizes="64px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <Disc3 className="absolute inset-0 m-auto w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <CardTitle className="truncate">{viewing.album}</CardTitle>
                <CardDescription className="truncate">
                  {viewing.artist}
                  {viewing.year ? ` · ${viewing.year}` : ""}
                </CardDescription>
                <div className="text-xs text-muted-foreground mt-1">
                  Saved {new Date(viewing.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setMode("list")}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            <div className="space-y-6 pr-3">
              <div>
                <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  About the album
                </h4>
                <div className="text-sm whitespace-pre-wrap leading-relaxed">
                  {viewing.guide.albumIntro}
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                  Track-by-track
                </h4>
                <div className="space-y-4">
                  {viewing.guide.trackGuides.map((t, i) => (
                    <div key={i} className="border rounded-lg p-4">
                      <div className="flex items-baseline gap-3 mb-2">
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-10">
                          {t.position}.
                        </span>
                        <h5 className="font-medium text-primary">{t.title}</h5>
                      </div>
                      <p className="text-sm text-muted-foreground pl-[3.25rem] leading-relaxed">
                        {t.commentary}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Closing
                </h4>
                <div className="text-sm whitespace-pre-wrap leading-relaxed">
                  {viewing.guide.closing}
                </div>
              </div>

              <Separator />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    const safe =
                      `${viewing.artist}-${viewing.album}`
                        .replace(/[^a-z0-9-_ ]/gi, "")
                        .trim()
                        .slice(0, 80) || "listening-guide";
                    downloadMarkdown(`${safe}.md`, guideToMarkdown(viewing));
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export .md
                </Button>
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Delete the guide for "${viewing.album}"?`)) {
                      deleteGuide(viewing.releaseId);
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }

  // ── Picker mode (choosing an album to generate) ──────────────────────────
  if (mode === "picker") {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                Pick an album
              </CardTitle>
              <CardDescription>
                Choose any record from your collection. Opus 4.7 writes the guide once and saves it.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setMode("list")}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <input
              autoFocus
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="Search artist or album..."
              className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <ScrollArea className="h-[500px]">
            {filteredPickerItems.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                {items && items.length === 0
                  ? "Collection isn't loaded — try refreshing."
                  : "No matches."}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pr-3">
                {filteredPickerItems.map((it) => {
                  const has = guides.some((g) => g.releaseId === it.id);
                  const thumb = it.basic_information.thumb || it.basic_information.cover_image;
                  return (
                    <button
                      key={it.instance_id}
                      onClick={() => handleGenerate(it)}
                      className="flex items-center gap-3 p-2 rounded-md border hover:bg-muted/50 text-left transition-colors"
                    >
                      <div className="w-12 h-12 relative bg-muted rounded overflow-hidden shrink-0">
                        {thumb ? (
                          <Image
                            src={thumb}
                            alt=""
                            fill
                            sizes="48px"
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <Disc3 className="absolute inset-0 m-auto w-6 h-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 text-sm">
                        <div className="font-medium truncate">{artistOf(it)}</div>
                        <div className="text-muted-foreground truncate">
                          {it.basic_information.title}
                          {it.basic_information.year ? ` · ${it.basic_information.year}` : ""}
                        </div>
                      </div>
                      {has && (
                        <span className="text-[10px] uppercase tracking-wider text-primary shrink-0">
                          Saved
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }

  // ── Default: list of saved guides ────────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              Listening Guides
            </CardTitle>
            <CardDescription>
              Track-by-track guides from Opus 4.7. Generated once, saved forever (in this browser).
            </CardDescription>
          </div>
          <Button onClick={() => setMode("picker")}>
            <Plus className="w-4 h-4 mr-2" />
            New guide
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {sortedGuides.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="mb-4 text-sm">No guides yet.</p>
            <Button variant="outline" onClick={() => setMode("picker")}>
              <Plus className="w-4 h-4 mr-2" />
              Generate your first guide
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-[600px]">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pr-3">
              {sortedGuides.map((g) => (
                <button
                  key={g.releaseId}
                  onClick={() => {
                    setMode("viewing");
                    setViewingId(g.releaseId);
                  }}
                  className="flex flex-col text-left rounded-lg border hover:border-primary transition-colors overflow-hidden group"
                >
                  <div className="aspect-square relative bg-muted">
                    {g.coverImage ? (
                      <Image
                        src={g.coverImage}
                        alt=""
                        fill
                        sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <Disc3 className="absolute inset-0 m-auto w-12 h-12 text-muted-foreground" />
                    )}
                  </div>
                  <div className="p-3 text-sm">
                    <div className="font-medium truncate">{g.artist}</div>
                    <div className="text-muted-foreground truncate">
                      {g.album}
                      {g.year ? ` · ${g.year}` : ""}
                    </div>
                    <div className="text-[11px] text-muted-foreground/80 mt-1">
                      {g.guide.trackGuides.length} tracks · saved{" "}
                      {new Date(g.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
