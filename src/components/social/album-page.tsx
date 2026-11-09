"use client";

// One album: what it is, what you thought of it, and what everyone thinks.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Headphones, Check, Lock, ListOrdered, Users, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Cover, StarsDisplay, StarsInput } from "./bits";
import { RankEditor, fmtLength } from "./rank-editor";
import { useMe } from "./me";
import { useSignInPrompt } from "./shell";
import { RANK_MODES } from "@/lib/scales";

interface Track { key: string; idx: number; disc: number; number: string; title: string; length_ms: number | null }
interface View {
  album: { mbid: string; title: string; artist: string; artist_mbid: string | null; year: number | null; type: string | null; secondary: string | null; tracks: Track[] };
  stats: { listeners: number; ratings: number; avgScore: number | null };
  community: { voters: number; tracks: { key: string; avgPosition: number; topPicks: number }[] };
  mine: { listened: boolean; rating: { score: number; scale: string; raw: string } | null; ranking: { mode: string; order: string[] } | null } | null;
  recent: { handle: string; name: string; avatar_url: string | null; raw: string | null; scale: string | null; ranked: number }[];
}
type Tab = "album" | "mine" | "community";

export function AlbumPage({ mbid }: { mbid: string }) {
  const { me } = useMe();
  const { toast } = useToast();
  const prompt = useSignInPrompt();
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("album");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/albums/${mbid}`, { cache: "no-store" });
    const b = await r.json();
    if (!r.ok) return setError(b.error || "Couldn't load that album");
    setView(b);
    return b as View;
  }, [mbid]);

  useEffect(() => {
    load().then((v) => {
      if (v?.mine?.ranking) setTab("mine");
      else if (v && v.community.voters > 0) setTab("community");
    });
  }, [load, me?.handle]);

  const send = async (path: string, method: string, body: unknown) => {
    if (!me) { prompt.open(); return false; }
    setBusy(true);
    try {
      const r = await fetch(`/api/albums/${mbid}/${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await r.json().catch(() => ({}));
      if (r.status === 402) { toast({ title: "Premium", description: `${b.error}. Coming soon.` }); return false; }
      if (!r.ok) { toast({ title: "Didn't save", description: b.error || "Try again" }); return false; }
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="text-center text-muted-foreground py-16">{error}</p>;
  if (!view) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="text-sm">Fetching the tracklist…</span>
      </div>
    );
  }

  const { album, stats, community, mine } = view;
  const byKey = new Map(album.tracks.map((t) => [t.key, t]));
  const myStars = mine?.rating?.scale === "stars5" ? Number(mine.rating.raw) : mine?.rating ? Math.round(mine.rating.score / 10) / 2 : null;
  const multiDisc = new Set(album.tracks.map((t) => t.disc)).size > 1;

  const orderFor = (t: Tab): Track[] =>
    t === "mine" && mine?.ranking
      ? mine.ranking.order.map((k) => byKey.get(k)!).filter(Boolean)
      : t === "community"
        ? community.tracks.map((c) => byKey.get(c.key)!).filter(Boolean)
        : album.tracks;

  return (
    <div className="space-y-5">
      {/* The album */}
      <section className="flex gap-4 items-end">
        <Cover mbid={album.mbid} size={500} className="w-32 sm:w-44 shrink-0 shadow-md" alt={`${album.title} cover`} />
        <div className="min-w-0 pb-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{[album.type, album.secondary].filter(Boolean).join(" · ") || "Album"}</div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold leading-tight">{album.title}</h1>
          <div className="mt-1 text-sm">
            {album.artist_mbid ? (
              <Link href={`/artist/${album.artist_mbid}`} className="font-medium hover:underline">{album.artist}</Link>
            ) : (
              <span className="font-medium">{album.artist}</span>
            )}
            {album.year && <span className="text-muted-foreground"> · {album.year}</span>}
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
            {stats.avgScore !== null ? (
              <>
                <StarsDisplay value={Math.round(stats.avgScore / 10) / 2} />
                <span className="tabular-nums">{(stats.avgScore / 20).toFixed(1)}</span>
                <span>· {stats.ratings} {stats.ratings === 1 ? "rating" : "ratings"}</span>
              </>
            ) : (
              <span>No ratings yet</span>
            )}
            <span>· {stats.listeners} {stats.listeners === 1 ? "listener" : "listeners"}</span>
          </div>
        </div>
      </section>

      {/* You */}
      <section className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Button
            variant={mine?.listened ? "default" : "outline"}
            className="rounded-full"
            disabled={busy}
            onClick={() => send("listen", "POST", { listened: !mine?.listened })}
          >
            {mine?.listened ? <Check className="w-4 h-4 mr-1.5" /> : <Headphones className="w-4 h-4 mr-1.5" />}
            {mine?.listened ? "Listened" : "I've listened to this"}
          </Button>
          <div className="flex items-center gap-2">
            <StarsInput
              value={myStars}
              disabled={busy}
              onChange={(v) => send("rating", "PUT", { scale: "stars5", raw: v === null ? null : String(v) })}
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
          <span>Rate on:</span>
          <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">★ stars</span>
          {["1–10", "0–100", "Letter"].map((s) => (
            <button
              key={s}
              onClick={() => toast({ title: "Premium", description: `The ${s} scale is coming with Liner Note Premium.` })}
              className="rounded-full border px-2 py-0.5 inline-flex items-center gap-1"
            >
              <Lock className="w-3 h-3" /> {s}
            </button>
          ))}
        </div>
      </section>

      {/* Tracks */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-xl font-semibold">Tracks</h2>
          {!editing && album.tracks.length > 1 && (
            <Button size="sm" className="rounded-full" onClick={() => (me ? setEditing(true) : prompt.open())}>
              {mine?.ranking ? <Pencil className="w-3.5 h-3.5 mr-1.5" /> : <ListOrdered className="w-4 h-4 mr-1.5" />}
              {mine?.ranking ? "Edit ranking" : "Rank tracks"}
            </Button>
          )}
        </div>

        {editing ? (
          <>
            <div className="-mx-4 px-4 flex gap-1.5 overflow-x-auto no-scrollbar">
              {RANK_MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => m.premium && toast({ title: "Premium", description: `${m.label}: ${m.blurb} Coming with Liner Note Premium.` })}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm inline-flex items-center gap-1 ${
                    m.premium ? "border text-muted-foreground" : "bg-primary text-primary-foreground font-medium"
                  }`}
                >
                  {m.premium && <Lock className="w-3 h-3" />} {m.label}
                </button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">Best first. Drag the handle, or use the arrows.</p>
            <RankEditor
              tracks={album.tracks}
              initial={mine?.ranking?.order ?? album.tracks.map((t) => t.key)}
              saving={busy}
              onCancel={() => setEditing(false)}
              onSave={async (order) => {
                if (await send("ranking", "PUT", { mode: "list", order })) {
                  setEditing(false);
                  setTab("mine");
                  toast({ title: "Ranking saved" });
                }
              }}
            />
          </>
        ) : (
          <>
            <div className="flex gap-1.5">
              {([
                ["album", "Album order", true],
                ["mine", "Your ranking", !!mine?.ranking],
                ["community", `Everyone${community.voters ? ` · ${community.voters}` : ""}`, community.voters > 0],
              ] as [Tab, string, boolean][]).filter(([, , show]) => show).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`rounded-full px-3 py-1.5 text-sm ${tab === id ? "bg-foreground text-background font-medium" : "border text-muted-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <ol className="divide-y rounded-lg border bg-card">
              {orderFor(tab).map((t, i) => {
                const c = tab === "community" ? community.tracks[i] : null;
                const ranked = tab !== "album";
                const prevDisc = i > 0 ? orderFor(tab)[i - 1].disc : null;
                return (
                  <li key={t.key}>
                    {tab === "album" && multiDisc && t.disc !== prevDisc && (
                      <div className="px-3 pt-2.5 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Disc {t.disc}</div>
                    )}
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <span className={`w-7 shrink-0 text-right tabular-nums ${ranked ? `font-display text-lg ${i < 3 ? "text-primary font-semibold" : "text-muted-foreground"}` : "text-sm text-muted-foreground"}`}>
                        {ranked ? i + 1 : t.number}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium truncate">{t.title}</span>
                        {ranked && (
                          <span className="block text-xs text-muted-foreground">
                            Track {t.number}
                            {c && c.topPicks > 0 && ` · #1 for ${c.topPicks} ${c.topPicks === 1 ? "person" : "people"}`}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">{fmtLength(t.length_ms)}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
            {album.tracks.length === 0 && <p className="text-sm text-muted-foreground">MusicBrainz has no tracklist for this one yet.</p>}
          </>
        )}
      </section>

      {/* Who's been here */}
      {view.recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-xl font-semibold flex items-center gap-2"><Users className="w-4 h-4" /> Listeners</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {view.recent.map((r) => (
              <li key={r.handle}>
                <Link href={`/u/${r.handle}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={r.avatar_url ?? undefined} alt="" />
                    <AvatarFallback>{r.name[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">{r.name}</span> <span className="text-muted-foreground">@{r.handle}</span>
                    {r.ranked ? <span className="block text-xs text-muted-foreground">Ranked the tracks</span> : null}
                  </span>
                  {r.raw && r.scale === "stars5" && <StarsDisplay value={Number(r.raw)} />}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {prompt.sheet}
    </div>
  );
}
