"use client";

// One album: what it is, what you thought of it, and what everyone thinks.
// Logging and rating come first, then your liner note (design/redesign 03/04).
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Headphones, Check, Lock, ListOrdered, Users, Loader2, Pencil, Share, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Cover, StarsDisplay, StarsInput, coverUrl } from "./bits";
import { RankEditor, fmtLength } from "./rank-editor";
import { useMe } from "./me";
import { HeaderActions, useSignInPrompt } from "./shell";
import { RANK_MODES } from "@/lib/scales";

interface Track { key: string; idx: number; disc: number; number: string; title: string; length_ms: number | null }
interface View {
  album: { mbid: string; title: string; artist: string; artist_mbid: string | null; year: number | null; type: string | null; secondary: string | null; tracks: Track[] };
  stats: { listeners: number; ratings: number; avgScore: number | null };
  community: { voters: number; tracks: { key: string; avgPosition: number; topPicks: number }[] };
  mine: {
    listened: boolean;
    listenedAt: number | null;
    note: string | null;
    rating: { score: number; scale: string; raw: string } | null;
    ranking: { mode: string; order: string[] } | null;
  } | null;
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
  const band = useCoverTint(mbid);

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

  const unlisten = () => {
    const loses = [mine?.rating && "your rating", mine?.ranking && "your ranking", mine?.note && "your liner note"].filter(Boolean);
    const msg = loses.length
      ? `Remove your listen? ${loses.join(", ").replace(/, ([^,]*)$/, " and $1")} go${loses.length === 1 ? "es" : ""} with it.`
      : "Remove your listen?";
    if (confirm(msg.charAt(0).toUpperCase() + msg.slice(1))) send("listen", "POST", { listened: false });
  };
  const byKey = new Map(album.tracks.map((t) => [t.key, t]));
  const myStars = mine?.rating?.scale === "stars5" ? Number(mine.rating.raw) : mine?.rating ? Math.round(mine.rating.score / 10) / 2 : null;
  const multiDisc = new Set(album.tracks.map((t) => t.disc)).size > 1;
  const totalMs = album.tracks.reduce((n, t) => n + (t.length_ms ?? 0), 0);
  const orders = ([
    ["album", "Album order", true],
    ["mine", "Your ranking", !!mine?.ranking],
    ["community", `Everyone${community.voters ? ` · ${community.voters}` : ""}`, community.voters > 0],
  ] as [Tab, string, boolean][]).filter(([, , show]) => show);

  const orderFor = (t: Tab): Track[] =>
    t === "mine" && mine?.ranking
      ? mine.ranking.order.map((k) => byKey.get(k)!).filter(Boolean)
      : t === "community"
        ? community.tracks.map((c) => byKey.get(c.key)!).filter(Boolean)
        : album.tracks;

  const share = async () => {
    const url = window.location.href;
    const title = `${album.title} by ${album.artist}`;
    try {
      if (navigator.share) return await navigator.share({ title, url });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied" });
    } catch {
      toast({ title: "Here's the link", description: url });
    }
  };

  return (
    <div className="space-y-5">
      <HeaderActions>
        <button onClick={share} aria-label="Share this album" className="w-11 h-11 inline-flex items-center justify-center rounded-full hover:bg-accent">
          <Share className="w-5 h-5" />
        </button>
      </HeaderActions>

      {/* The album: a band tinted with the cover, running up under the header */}
      <section
        className="-mx-4 -mt-4 px-4 pt-2 pb-6 flex flex-col items-center text-center transition-colors duration-500"
        style={{ background: band ?? "hsl(var(--secondary))" }}
      >
        <Cover mbid={album.mbid} size={500} className="w-[210px] shadow-xl" alt={`${album.title} cover`} />
        <div className="mt-4 section-label">{[[album.type, album.secondary].filter(Boolean).join(", ") || "Album", album.year].filter(Boolean).join(" · ")}</div>
        <h1 className="mt-1 font-display text-3xl font-semibold leading-tight text-balance">{album.title}</h1>
        <div className="mt-1 text-base">
          {album.artist_mbid ? (
            <Link href={`/artist/${album.artist_mbid}`} className="font-medium hover:underline">{album.artist}</Link>
          ) : (
            <span className="font-medium">{album.artist}</span>
          )}
        </div>
        {/* Only what there is: no "No ratings yet", no "0 listeners". */}
        {(stats.avgScore !== null || stats.listeners > 0) && (
          <div className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground flex-wrap">
            {stats.avgScore !== null && (
              <>
                <StarsDisplay value={Math.round(stats.avgScore / 10) / 2} />
                <span className="tabular-nums">{(stats.avgScore / 20).toFixed(1)}</span>
                <span>· {stats.ratings} {stats.ratings === 1 ? "rating" : "ratings"}</span>
              </>
            )}
            {stats.listeners > 0 && (
              <span>{stats.avgScore !== null && "· "}{stats.listeners} {stats.listeners === 1 ? "listener" : "listeners"}</span>
            )}
          </div>
        )}
      </section>

      {/* You: log, rate, write — the first thing on the page */}
      <section className="rounded-2xl border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          {mine?.listened ? (
            <button
              disabled={busy}
              onClick={unlisten}
              className="h-11 px-5 rounded-full bg-done text-white font-medium inline-flex items-center gap-2 disabled:opacity-60"
              title="Tap to remove your listen"
            >
              <Check className="w-4 h-4" /> {listenedLabel(mine.listenedAt)}
            </button>
          ) : (
            <Button className="h-11 px-5 rounded-full" disabled={busy} onClick={() => send("listen", "POST", { listened: true })}>
              <Headphones className="w-4 h-4 mr-2" /> Log a listen
            </Button>
          )}
          <span className="text-sm text-muted-foreground">{myStars ? `${myStars} out of 5` : "Tap to rate"}</span>
        </div>
        <StarsInput
          value={myStars}
          disabled={busy}
          size="w-[34px] h-[34px]"
          className="w-full justify-between px-1"
          onChange={(v) => send("rating", "PUT", { scale: "stars5", raw: v === null ? null : String(v) })}
        />
        <LinerNote note={mine?.note ?? null} busy={busy} onSave={(body) => send("note", "PUT", { body })} signedIn={!!me} onSignIn={prompt.open} />
      </section>

      {/* Tracks */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-2xl font-semibold leading-tight">Tracks</h2>
            {album.tracks.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {album.tracks.length} {album.tracks.length === 1 ? "track" : "tracks"}
                {totalMs > 0 && ` · ${Math.round(totalMs / 60000)} min`}
              </p>
            )}
          </div>
          {!editing && album.tracks.length > 1 && (
            <Button variant="outline" className="h-11 rounded-full" onClick={() => (me ? setEditing(true) : prompt.open())}>
              {mine?.ranking ? <Pencil className="w-3.5 h-3.5 mr-1.5" /> : <ListOrdered className="w-4 h-4 mr-1.5" />}
              {mine?.ranking ? "Edit ranking" : "Rank them"}
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
            {/* A choice only once there's a ranking to switch to */}
            {orders.length > 1 && (
              <div role="tablist" aria-label="Order" className="grid rounded-full bg-secondary p-1" style={{ gridTemplateColumns: `repeat(${orders.length}, minmax(0, 1fr))` }}>
                {orders.map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={`h-9 rounded-full text-sm font-medium truncate px-2 ${tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <ol className="divide-y border-y">
              {orderFor(tab).map((t, i) => {
                const c = tab === "community" ? community.tracks[i] : null;
                const ranked = tab !== "album";
                const prevDisc = i > 0 ? orderFor(tab)[i - 1].disc : null;
                return (
                  <li key={t.key}>
                    {tab === "album" && multiDisc && t.disc !== prevDisc && (
                      <div className="px-1 pt-3 pb-1 section-label">Disc {t.disc}</div>
                    )}
                    <div className="flex items-center gap-3 px-1 py-2.5">
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
          <ul className="divide-y border-y">
            {view.recent.map((r) => (
              <li key={r.handle}>
                <Link href={`/u/${r.handle}`} className="flex items-center gap-3 px-1 py-2.5 hover:bg-accent">
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

/** "Listened today", "Listened yesterday", "Listened Nov 3". */
function listenedLabel(at: number | null) {
  if (!at) return "Listened";
  const d = new Date(at);
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return "Listened today";
  if (days === 1) return "Listened yesterday";
  return `Listened ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" })}`;
}

/** The cover's average colour, softened into the page — for the top band and
 *  the header above it. Null until it's known (or when the cover can't be read). */
function useCoverTint(mbid: string): string | null {
  const [tint, setTint] = useState<string | null>(null);
  useEffect(() => {
    let gone = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 12;
        const g = c.getContext("2d", { willReadFrequently: true });
        if (!g) return;
        g.drawImage(img, 0, 0, 12, 12);
        const px = g.getImageData(0, 0, 12, 12).data;
        let r = 0, gr = 0, b = 0;
        for (let i = 0; i < px.length; i += 4) { r += px[i]; gr += px[i + 1]; b += px[i + 2]; }
        const n = px.length / 4;
        if (!gone) setTint(`color-mix(in srgb, rgb(${Math.round(r / n)} ${Math.round(gr / n)} ${Math.round(b / n)}) 22%, hsl(var(--background)))`);
      } catch {} // a cover without CORS: keep the plain band
    };
    img.src = coverUrl(mbid, 250);
    return () => { gone = true; };
  }, [mbid]);
  // The header above runs into the band.
  useEffect(() => {
    const root = document.documentElement;
    if (tint) root.style.setProperty("--inner-header-bg", tint);
    return () => { root.style.removeProperty("--inner-header-bg"); };
  }, [tint]);
  return tint;
}

/** Your liner note: a field that grows, then the note in the display face
 *  with Edit. Private to you. */
function LinerNote({
  note, busy, onSave, signedIn, onSignIn,
}: {
  note: string | null;
  busy: boolean;
  onSave: (body: string) => Promise<boolean>;
  signedIn: boolean;
  onSignIn: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? "");
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (!editing) setDraft(note ?? ""); }, [note, editing]);
  const grow = () => {
    const el = box.current;
    if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
  };
  useEffect(grow, [draft, editing]);

  if (note && !editing) {
    return (
      <div className="border-t pt-4">
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <h3 className="section-label">Your liner note</h3>
          <button onClick={() => { setEditing(true); requestAnimationFrame(() => box.current?.focus()); }} className="h-9 -mr-1 px-2 text-sm font-medium text-primary">
            Edit
          </button>
        </div>
        <p className="font-display text-lg leading-relaxed whitespace-pre-line break-words">{note}</p>
      </div>
    );
  }

  const dirty = draft.trim() !== (note ?? "").trim();
  return (
    <div className="space-y-2">
      <div className="relative">
        <PenLine className="absolute left-3.5 top-3.5 w-4 h-4 text-muted-foreground pointer-events-none" />
        <textarea
          ref={box}
          value={draft}
          rows={2}
          maxLength={2000}
          onFocus={() => { if (!signedIn) { box.current?.blur(); onSignIn(); } else setEditing(true); }}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a liner note…"
          className="w-full resize-none overflow-hidden rounded-xl bg-secondary pl-10 pr-3 py-3 text-base sm:text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[1.5px] focus-visible:ring-primary"
        />
      </div>
      {editing && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            Only you see it{draft.length > 1600 ? ` · ${2000 - draft.length} left` : ""}
          </span>
          <div className="flex gap-1.5">
            <Button variant="ghost" className="h-10 rounded-full" onClick={() => { setDraft(note ?? ""); setEditing(false); }}>
              Cancel
            </Button>
            <Button
              className="h-10 rounded-full"
              disabled={busy || !dirty}
              onClick={async () => { if (await onSave(draft)) setEditing(false); }}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
