"use client";

// Home: find an album, put on a record you own but haven't logged, see what
// you've logged lately, and what everyone else is listening to.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search, Loader2, ListOrdered, X, Shuffle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlbumTile, Cover, StarsDisplay } from "./bits";
import { useMe } from "./me";
import { SignInButtons } from "./sign-in";
import { InstallBanner } from "./install-app";

interface Hit { mbid: string; title: string; artist: string; year: number | null; type: string | null; secondary: string[]; owned?: boolean }
interface Pick { mbid: string; title: string; artist: string }
interface Activity { handle: string; name: string; avatar_url: string | null; mbid: string; title: string; artist: string; year: number | null; raw: string | null; scale: string | null; ranked: number; at: number }
interface MyAlbum { mbid: string; title: string; artist: string; year: number | null; raw: string | null; scale: string | null; ranked: number }

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
};

export function HomePage() {
  const { me, loading } = useMe();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [mine, setMine] = useState<MyAlbum[]>([]);
  const seq = useRef(0);
  const [picks, setPicks] = useState<{ picks: Pick[]; total: number } | null>(null);
  const loadPicks = (skip: string[] = []) =>
    fetch(`/api/me/put-one-on${skip.length ? `?skip=${skip.join(",")}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b && setPicks(b))
      .catch(() => {});
  useEffect(() => {
    if (me) loadPicks();
  }, [me]);

  useEffect(() => {
    fetch("/api/activity").then((r) => r.json()).then((b) => setActivity(b.items ?? [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (!me) return;
    fetch(`/api/users/${me.handle}`).then((r) => r.json()).then((b) => setMine((b.albums ?? []).slice(0, 12))).catch(() => {});
  }, [me]);

  // Search as you type, but only once you pause — every search is a
  // MusicBrainz request and they allow one a second for the whole app.
  useEffect(() => {
    const term = q.trim();
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

  // Your own listens are already in "Your latest"; this is for everyone else.
  const others = me ? activity.filter((a) => a.handle !== me.handle) : activity;

  return (
    <div className="space-y-6">
      {!loading && !me && (
        <section className="rounded-2xl border bg-card p-6 text-center space-y-4">
          <h1 className="font-display text-3xl font-semibold leading-tight">Rank every track of every album you love.</h1>
          <p className="text-muted-foreground">Log what you&apos;ve heard, rate it, and see how everyone else ranks the same record.</p>
          <SignInButtons />
          <p className="text-xs text-muted-foreground">
            Collectors: Discogs sign-in adds your record collection and the pressing finder. We read your collection
            and wantlist; the only thing we ever write is a record you choose to add.
          </p>
        </section>
      )}

      {me && <InstallBanner />}

      {me && (
        <section className="space-y-3">
          <div className="relative flex items-center">
            <Search className="absolute left-4 w-5 h-5 text-muted-foreground pointer-events-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search albums"
              enterKeyHint="search"
              className="w-full h-[50px] pl-12 pr-20 text-base sm:text-sm rounded-full border border-input bg-card placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[1.5px] focus-visible:ring-primary"
            />
            <span className="absolute right-1.5 flex items-center">
              {searching && <Loader2 className="w-5 h-5 mr-1 animate-spin text-muted-foreground" />}
              {q && (
                <button onClick={() => setQ("")} aria-label="Clear search" className="w-10 h-10 inline-flex items-center justify-center rounded-full text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </span>
          </div>
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
        </section>
      )}

      {me && !hits && picks && picks.picks.length > 0 && (
        <section className="space-y-2">
          <div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">Put one on</h2>
            {picks.total > 3 && (
              <button
                onClick={() => loadPicks(picks.picks.map((p) => p.mbid))}
                className="h-10 px-3 -mr-2 rounded-full text-sm font-medium text-primary inline-flex items-center gap-1.5 shrink-0"
              >
                <Shuffle className="w-4 h-4" /> Another three
              </button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">From your shelves, not logged yet</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {picks.picks.map((p) => (
              <AlbumTile key={p.mbid} mbid={p.mbid} title={p.title} artist={p.artist} />
            ))}
          </div>
        </section>
      )}

      {me && !hits && mine.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold">Your latest</h2>
            <Link href={`/u/${me.handle}`} className="text-sm text-primary font-medium">All</Link>
          </div>
          <div className="-mx-4 px-4 scroll-px-4 flex gap-3 overflow-x-auto snap-x no-scrollbar pb-1">
            {mine.map((a) => (
              <div key={a.mbid} className="w-28 shrink-0 snap-start">
                <AlbumTile mbid={a.mbid} title={a.title} artist={a.artist} badge={a.ranked ? <RankedBadge /> : null} />
                {a.raw && a.scale === "stars5" ? (
                  <div className="mt-0.5"><StarsDisplay value={Number(a.raw)} className="w-3 h-3" /></div>
                ) : !a.raw ? (
                  <Link href={`/album/${a.mbid}`} className="mt-1 inline-flex items-center h-6 px-2.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
                    Rate it
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      )}

      {!hits && (!me || others.length > 0) && (
        <section className="space-y-2">
          <h2 className="font-display text-xl font-semibold">Happening now</h2>
          {others.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody has logged anything yet — be the first.</p>
          ) : (
            <ul className="divide-y border-y">
              {others.map((a) => (
                <li key={`${a.handle}-${a.mbid}`} className="flex items-center gap-3 py-2.5 px-1">
                  <Link href={`/u/${a.handle}`} aria-label={a.name}>
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={a.avatar_url ?? undefined} alt="" />
                      <AvatarFallback>{a.name[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </Link>
                  <Link href={`/album/${a.mbid}`} className="min-w-0 flex-1 text-sm">
                    <span className="block truncate">
                      <span className="font-medium">@{a.handle}</span>{" "}
                      <span className="text-muted-foreground">{a.ranked ? "ranked" : a.raw ? "rated" : "listened to"}</span>{" "}
                      <span className="font-medium">{a.title}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {a.artist} · {ago(a.at)}
                      {a.raw && a.scale === "stars5" && <StarsDisplay value={Number(a.raw)} className="w-3 h-3" />}
                    </span>
                  </Link>
                  <Link href={`/album/${a.mbid}`} className="w-11 shrink-0"><Cover mbid={a.mbid} /></Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export function RankedBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold text-primary shadow-sm">
      <ListOrdered className="w-3 h-3" /> Ranked
    </span>
  );
}
