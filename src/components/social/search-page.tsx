"use client";

// The search screen (design/redesign 02): a back button, the field with a
// clear button, and results grouped under Albums and EPs — the ones you own
// marked in plum. The query lives in the URL, so Back from an album returns
// to these results.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Loader2, X } from "lucide-react";
import { Cover } from "./bits";
import { useMe } from "./me";
import { BackButton } from "./shell";
import { SignInButtons } from "./sign-in";

interface Hit { mbid: string; title: string; artist: string; year: number | null; type: string | null; secondary: string[]; owned?: boolean }

export function SearchPage() {
  const { me, loading } = useMe();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const seq = useRef(0);
  const field = useRef<HTMLInputElement>(null);

  // Arriving with nothing typed: straight into the field.
  useEffect(() => {
    if (!params.get("q")) field.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on arrival only
  }, []);

  // Search as you type, but only once you pause — every search is a
  // MusicBrainz request and they allow one a second for the whole app.
  useEffect(() => {
    const term = q.trim();
    // The URL follows the field (no navigation), so Back returns to these results.
    window.history.replaceState(window.history.state, "", term ? `/search?q=${encodeURIComponent(term)}` : "/search");
    if (term.length < 2 || !me) { setHits(null); return; }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const r = await fetch(`/api/albums/search?q=${encodeURIComponent(term)}`);
        const b = await r.json();
        if (n !== seq.current) return;
        if (!r.ok) throw new Error(b.error);
        setHits(b.results);
      } catch (e) {
        if (n === seq.current) setSearchError(e instanceof Error && e.message ? e.message : "Search failed");
      } finally {
        if (n === seq.current) setSearching(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [q, me]);

  return (
    <div className="space-y-4">
      <div
        className="sticky z-20 -mx-4 -mt-4 px-4 py-2 flex items-center gap-1.5 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85"
        style={{ top: "calc(var(--app-header, 0px) + env(safe-area-inset-top, 0px))", paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))" }}
      >
        <BackButton />
        <label className="relative flex-1 flex items-center">
          <Search className="absolute left-4 w-5 h-5 text-muted-foreground pointer-events-none" />
          <input
            ref={field}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search albums"
            enterKeyHint="search"
            className="w-full h-[50px] pl-12 pr-20 text-base sm:text-sm rounded-full border border-input bg-card placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[1.5px] focus-visible:ring-primary"
          />
          <span className="absolute right-1.5 flex items-center">
            {searching && <Loader2 className="w-5 h-5 mr-1 animate-spin text-muted-foreground" />}
            {q && (
              <button onClick={() => { setQ(""); field.current?.focus(); }} aria-label="Clear search" className="w-10 h-10 inline-flex items-center justify-center rounded-full text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </span>
        </label>
      </div>

      {!loading && !me && (
        <div className="rounded-2xl border bg-card p-5 text-center space-y-3">
          <p className="text-sm text-muted-foreground">Sign in to search albums.</p>
          <SignInButtons />
        </div>
      )}

      {searchError && <p className="text-sm text-destructive">{searchError}</p>}
      {hits && hits.length === 0 && <p className="py-4 px-1 text-sm text-muted-foreground">Nothing by that name.</p>}
      {hits && hits.length > 0 &&
        ([["Albums", hits.filter((h) => h.type !== "EP")], ["EPs", hits.filter((h) => h.type === "EP")]] as [string, Hit[]][])
          .filter(([, list]) => list.length)
          .map(([label, list]) => (
            <div key={label}>
              <h2 className="section-label px-1 mb-1">{label}</h2>
              <ul className="divide-y border-y">
                {list.map((h) => (
                  <li key={h.mbid}>
                    <Link href={`/album/${h.mbid}`} className="flex items-center gap-3 py-2.5 px-1 hover:bg-accent">
                      <Cover mbid={h.mbid} className="w-14 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium truncate">{h.title}</span>
                        <span className="block text-xs text-muted-foreground truncate">
                          {[h.artist, h.year, h.secondary.join(" · ")].filter(Boolean).join(" · ")}
                        </span>
                        {h.owned && (
                          <span className="mt-1 inline-flex items-center rounded-full bg-yours/[0.12] text-yours px-2 py-0.5 text-[11px] font-semibold">
                            In your collection
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
    </div>
  );
}
