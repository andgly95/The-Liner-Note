"use client";

// What the AI tools share (redesign): a plain header instead of a card, the
// last saved run loaded from the server ("Last run 3 days ago · Run again"),
// a running state with Stop, and album rows you can tap through.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, ExternalLink, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AnalysisType } from "@/types/analysis";

/** The tool's last run for this collection (kept on the server), and a way to
 *  run it again. `subject` is the Discogs username whose collection it reads. */
export function useAnalysis<T>(type: AnalysisType, subject: string | undefined, saved = true) {
  const [result, setResult] = useState<T | null>(null);
  const [createdAt, setCreatedAt] = useState<number | null>(null);
  const [loadingSaved, setLoadingSaved] = useState(saved);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    setResult(null);
    setCreatedAt(null);
    setError(null);
    if (!saved || !subject) { setLoadingSaved(false); return; }
    let live = true;
    setLoadingSaved(true);
    fetch(`/api/analyze?type=${type}&subject=${encodeURIComponent(subject)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!live || !b?.result) return;
        setResult(b.result as T);
        setCreatedAt(b.createdAt);
      })
      .catch(() => {})
      .finally(() => live && setLoadingSaved(false));
    return () => { live = false; abort.current?.abort(); };
  }, [type, subject, saved]);

  const run = useCallback(
    async (body: Record<string, unknown>) => {
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;
      setRunning(true);
      setError(null);
      try {
        const r = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type, subject, ...body }),
          signal: ctl.signal,
        });
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error || "Something went wrong. Try again.");
        setResult(b.result as T);
        setCreatedAt(b.createdAt);
      } catch (e) {
        if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      } finally {
        if (abort.current === ctl) setRunning(false);
      }
    },
    [type, subject]
  );

  const stop = useCallback(() => {
    abort.current?.abort();
    setRunning(false);
  }, []);

  return { result, setResult, createdAt, loadingSaved, running, error, run, stop };
}

export function ToolHeader({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <header className="space-y-1">
      <h2 className="font-display text-2xl font-semibold flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {children && <p className="text-sm text-muted-foreground">{children}</p>}
    </header>
  );
}

export function Running({ label, hint, onStop }: { label: ReactNode; hint?: string; onStop: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
      <div className="vinyl-record w-16 h-16 animate-spin-slow" />
      <div>
        <p className="text-muted-foreground">{label}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </div>
      <Button variant="outline" className="h-10 rounded-full" onClick={onStop}>
        <Square className="w-4 h-4 mr-2" /> Stop
      </Button>
    </div>
  );
}

export function Failed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
      <AlertCircle className="w-10 h-10 text-destructive" />
      <p className="text-destructive max-w-sm">{message}</p>
      <Button variant="outline" className="h-10 rounded-full" onClick={onRetry}>
        <RefreshCw className="w-4 h-4 mr-2" /> Try again
      </Button>
    </div>
  );
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
};

/** "Last run 3 days ago" + Run again. */
export function RunAgain({ createdAt, label = "Run again", onRun }: { createdAt: number | null; label?: string; onRun: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t pt-4">
      <span className="text-sm text-muted-foreground">{createdAt ? `Last run ${ago(createdAt)}` : ""}</span>
      <Button variant="outline" className="h-10 rounded-full shrink-0" onClick={onRun}>
        <RefreshCw className="w-4 h-4 mr-2" /> {label}
      </Button>
    </div>
  );
}

const discogsSearch = (artist: string, album: string) =>
  `https://www.discogs.com/search/?type=master&q=${encodeURIComponent(`${artist} ${album}`)}`;

/** One album the AI named: tap → its album page (found on MusicBrainz when
 *  tapped); the Discogs icon searches Discogs for it. */
export function AlbumPick({
  artist,
  album,
  year,
  children,
  tag,
}: {
  artist: string;
  album: string;
  year?: number | null;
  children?: ReactNode;
  tag?: ReactNode;
}) {
  const href = `/album/find?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(album)}`;
  return (
    <li className="flex items-start gap-2 py-3">
      <Link href={href} prefetch={false} className="min-w-0 flex-1 group">
        <span className="block font-medium group-hover:underline underline-offset-2">{album}</span>
        <span className="block text-sm text-muted-foreground">
          {artist}
          {year ? ` · ${year}` : ""}
        </span>
        {children && <span className="block text-sm text-muted-foreground mt-1.5 leading-relaxed">{children}</span>}
        {tag && <span className="mt-2 inline-flex">{tag}</span>}
      </Link>
      <a
        href={discogsSearch(artist, album)}
        target="_blank"
        rel="noreferrer"
        aria-label={`Find ${album} on Discogs`}
        className="w-10 h-10 -mr-2 shrink-0 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
      >
        <ExternalLink className="w-4 h-4" />
      </a>
    </li>
  );
}

export function Chip({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "primary" | "yours" }) {
  const cls =
    tone === "primary" ? "bg-primary/10 text-primary" : tone === "yours" ? "bg-yours/[0.12] text-yours" : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}
