"use client";

// A person: what they've heard, how they rated it, what they've ranked.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, LogOut, Disc3 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AlbumTile, StarsDisplay } from "./bits";
import { RankedBadge } from "./home-page";
import { useMe } from "./me";
import { ThemePicker } from "./theme-picker";
import { InstallAction } from "./install-app";
import { ShelfSettings } from "./shelf-settings";
import { clearPersonalCache } from "@/lib/pwa";

interface Profile {
  user: { handle: string; name: string; avatar_url: string | null; bio: string | null; created_at: number };
  counts: { listened: number; rated: number; ranked: number };
  albums: { mbid: string; title: string; artist: string; year: number | null; raw: string | null; scale: string | null; score: number | null; ranked: number }[];
}

export function ProfilePage({ handle }: { handle: string }) {
  const { me, linked } = useMe();
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<"recent" | "top" | "ranked">("recent");

  useEffect(() => {
    fetch(`/api/users/${handle}`)
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error); setP(b); })
      .catch((e) => setError(e.message || "No one by that name"));
  }, [handle]);

  const albums = useMemo(() => {
    if (!p) return [];
    if (sort === "top") return [...p.albums].filter((a) => a.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    if (sort === "ranked") return p.albums.filter((a) => a.ranked);
    return p.albums;
  }, [p, sort]);

  if (error) return <p className="text-center text-muted-foreground py-16">{error}</p>;
  if (!p) return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const isMe = me?.handle.toLowerCase() === p.user.handle.toLowerCase();
  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    clearPersonalCache();
    window.location.href = "/";
  };

  return (
    <div className="space-y-5">
      <section className="flex items-center gap-4">
        <Avatar className="w-16 h-16">
          <AvatarImage src={p.user.avatar_url ?? undefined} alt="" />
          <AvatarFallback className="text-xl">{p.user.name[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold leading-tight truncate">{p.user.name}</h1>
          <div className="text-sm text-muted-foreground">@{p.user.handle}</div>
        </div>
      </section>

      <section className="grid grid-cols-3 rounded-xl border bg-card divide-x text-center">
        {([["Heard", p.counts.listened], ["Rated", p.counts.rated], ["Ranked", p.counts.ranked]] as const).map(([l, n]) => (
          <div key={l} className="py-3">
            <div className="font-display text-2xl font-semibold tabular-nums">{n}</div>
            <div className="text-xs text-muted-foreground">{l}</div>
          </div>
        ))}
      </section>

      {isMe && (
        <section className="flex gap-2 flex-wrap">
          {linked.includes("discogs") ? (
            <Button asChild variant="outline" size="sm" className="rounded-full"><Link href="/dashboard"><Disc3 className="w-4 h-4 mr-1.5" /> Your record collection</Link></Button>
          ) : (
            <Button asChild variant="outline" size="sm" className="rounded-full"><a href="/api/auth/discogs"><Disc3 className="w-4 h-4 mr-1.5" /> Link Discogs</a></Button>
          )}
          <Button variant="ghost" size="sm" className="rounded-full" onClick={signOut}><LogOut className="w-4 h-4 mr-1.5" /> Sign out</Button>
        </section>
      )}

      {isMe && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Theme</h2>
          <ThemePicker />
        </section>
      )}

      {isMe && linked.includes("discogs") && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Share your collection</h2>
          <ShelfSettings />
        </section>
      )}

      {isMe && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">App</h2>
          <InstallAction />
        </section>
      )}

      <section className="space-y-3">
        <div className="flex gap-1.5">
          {([["recent", "Recent"], ["top", "Top rated"], ["ranked", "Ranked"]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSort(id)}
              className={`rounded-full px-3 py-1.5 text-sm ${sort === id ? "bg-foreground text-background font-medium" : "border text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {albums.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {isMe ? <>Nothing here yet. <Link href="/home" className="text-primary font-medium">Find an album</Link> you&apos;ve heard.</> : "Nothing here yet."}
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {albums.map((a) => (
              <div key={a.mbid}>
                <AlbumTile mbid={a.mbid} title={a.title} artist={a.artist} badge={a.ranked ? <RankedBadge /> : null} />
                {a.raw && a.scale === "stars5" && <div className="mt-0.5"><StarsDisplay value={Number(a.raw)} className="w-3 h-3" /></div>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
