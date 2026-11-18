"use client";

// Home: find an album, see what you've logged lately, and what everyone else is listening to.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search, Loader2, ListOrdered } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlbumTile, Cover, StarsDisplay } from "./bits";
import { useMe } from "./me";
import { SignInButtons } from "./sign-in";
import { InstallBanner } from "./install-app";

interface Hit { mbid: string; title: string; artist: string; year: number | null; type: string | null; secondary: string[] }
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
          <div className="relative">
            <Search className="absolute left-3.5 top-3 w-5 h-5 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search albums — “rubber soul”, “blonde frank ocean”"
              enterKeyHint="search"
              className="w-full pl-11 pr-10 py-2.5 text-base sm:text-sm rounded-full border border-input bg-card placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {searching && <Loader2 className="absolute right-3.5 top-3 w-5 h-5 animate-spin text-muted-foreground" />}
          </div>
          {searchError && <p className="text-sm text-destructive">{searchError}</p>}
          {hits && (
            <ul className="divide-y rounded-xl border bg-card overflow-hidden">
              {hits.length === 0 && <li className="p-4 text-sm text-muted-foreground">Nothing by that name.</li>}
              {hits.map((h) => (
                <li key={h.mbid}>
                  <Link href={`/album/${h.mbid}`} className="flex items-center gap-3 p-2.5 hover:bg-accent">
                    <Cover mbid={h.mbid} className="w-12 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{h.title}</span>
                      <span className="block text-xs text-muted-foreground truncate">
                        {[h.artist, h.year, [h.type, ...h.secondary].filter(Boolean).join(" · ")].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
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
                {a.raw && a.scale === "stars5" && <div className="mt-0.5"><StarsDisplay value={Number(a.raw)} className="w-3 h-3" /></div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {!hits && (
        <section className="space-y-2">
          <h2 className="font-display text-xl font-semibold">Happening now</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody has logged anything yet — be the first.</p>
          ) : (
            <ul className="divide-y rounded-xl border bg-card overflow-hidden">
              {activity.map((a) => (
                <li key={`${a.handle}-${a.mbid}`} className="flex items-center gap-3 p-2.5">
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
