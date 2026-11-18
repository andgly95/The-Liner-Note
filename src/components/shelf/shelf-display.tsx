"use client";

// The shelf display: a record collection as a dark gallery wall, made for a
// tablet propped by the records. Guests browse covers, search, filter by genre
// and open a record (sleeve, disc sliding out, tracklist by side, flip to the
// back), or browse by artist — every artist on the shelf, then all of theirs.
// Left alone it becomes a slow slideshow and resets itself for the next
// person. Read-only: there is nothing here that can change anything.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X, ChevronLeft, ChevronRight, Shuffle, Maximize, RotateCw } from "lucide-react";
import type { ShelfItem, ShelfRelease } from "@/lib/shelf";

const IDLE_MS = 90_000;          // untouched this long → slideshow
const SLIDE_MS = 11_000;         // one record per slide
const POLL_MS = 30 * 60_000;     // re-read the shelf
const RELOAD_AFTER_MS = 12 * 3600_000; // fresh code + memory, but only while idle

type Sort = "added" | "artist" | "year" | "artists";
const SORTS: { id: Sort; label: string }[] = [
  { id: "added", label: "Recent" },
  { id: "artist", label: "A–Z" },
  { id: "year", label: "Year" },
  { id: "artists", label: "Artists" },
];

/* ── ordering ───────────────────────────────────────────────────────────── */

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const artistKey = (a: string) => fold(a).replace(/^the\s+/, "").trim();
const letterOf = (a: string) => {
  const c = artistKey(a)[0]?.toUpperCase() ?? "#";
  return c >= "A" && c <= "Z" ? c : "#";
};
/** When the music came out: the album's original release, else this pressing. */
const yearOf = (i: ShelfItem) => i.original ?? i.year;
const decadeOf = (y: number | null) => (y ? `${Math.floor(y / 10) * 10}s` : "Undated");

interface Section { key: string; label: string; items: ShelfItem[] }

function arrange(items: ShelfItem[], sort: Sort): Section[] {
  const byArtist = (a: ShelfItem, b: ShelfItem) =>
    artistKey(a.artist).localeCompare(artistKey(b.artist)) || (yearOf(a) ?? 9999) - (yearOf(b) ?? 9999) || a.title.localeCompare(b.title);
  if (sort === "added") {
    return [{ key: "all", label: "", items: [...items].sort((a, b) => b.added.localeCompare(a.added)) }];
  }
  const byName = sort === "artist" || sort === "artists";
  const sorted = [...items].sort(
    byName ? byArtist : (a, b) => (yearOf(a) ?? 9999) - (yearOf(b) ?? 9999) || byArtist(a, b)
  );
  const sections: Section[] = [];
  for (const it of sorted) {
    const key = byName ? letterOf(it.artist) : decadeOf(yearOf(it));
    let s = sections[sections.length - 1];
    if (!s || s.key !== key) sections.push((s = { key, label: key, items: [] }));
    s.items.push(it);
  }
  // "#" (numbers, symbols) reads better at the end than before A.
  if (byName) sections.sort((a, b) => (a.key === "#" ? 1 : b.key === "#" ? -1 : 0));
  return sections;
}

interface Artist { name: string; items: ShelfItem[]; cover: ShelfItem | undefined }

/** Records (already in artist order) → one entry per artist, oldest record first. */
function groupArtists(items: ShelfItem[]): Artist[] {
  const out: Artist[] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && last.name === it.artist) last.items.push(it);
    else out.push({ name: it.artist, items: [it], cover: undefined });
  }
  for (const a of out) a.cover = a.items.find((i) => i.cover) ?? a.items[0];
  return out;
}

const plural = (n: number, w: string) => `${n.toLocaleString()} ${w}${n === 1 ? "" : "s"}`;

const sinceLine = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

/* ── the display ────────────────────────────────────────────────────────── */

export function ShelfDisplay({
  token,
  title,
  initial,
  kiosk = true,
}: {
  token: string;
  title: string;
  initial: { items: ShelfItem[]; at: number } | null;
  /** The tablet on the shelf. Off for the link sent to a friend's phone. */
  kiosk?: boolean;
}) {
  const [items, setItems] = useState<ShelfItem[] | null>(initial?.items ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("added");
  const [genre, setGenre] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  // One artist's page: all of their records on the shelf.
  const [artist, setArtist] = useState<string | null>(null);
  const scrollBeforeArtist = useRef(0);
  const [idle, setIdle] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const loadedAt = useRef(Date.now());
  // The tap that wakes the slideshow must not also open the record under it.
  const swallowUntil = useRef(0);
  useShelfLook();

  /* data */
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/shelf/${token}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't read the shelf");
      setItems(body.items);
      setLoadError(null);
    } catch (e) {
      // Keep showing what we have; only an empty wall needs to say so.
      setLoadError(e instanceof Error ? e.message : "Couldn't read the shelf");
    }
  }, [token]);
  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  /* keep the screen on while the wall is showing */
  useEffect(() => {
    if (!kiosk) return;
    type Sentinel = { release: () => Promise<void> };
    let lock: Sentinel | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
    const take = () => {
      if (document.visibilityState === "visible" && nav.wakeLock) {
        nav.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
      }
    };
    take();
    document.addEventListener("visibilitychange", take);
    return () => {
      document.removeEventListener("visibilitychange", take);
      lock?.release().catch(() => {});
    };
  }, [kiosk]);

  /* idle → slideshow, and a clean wall for the next person */
  const lastTouch = useRef(Date.now());
  useEffect(() => {
    if (!kiosk) return;
    const touch = () => { lastTouch.current = Date.now(); };
    const evs = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const t = setInterval(() => {
      if (Date.now() - lastTouch.current < IDLE_MS) return;
      setIdle((was) => {
        if (!was && Date.now() - loadedAt.current > RELOAD_AFTER_MS) window.location.reload();
        return true;
      });
      setOpenId(null);
      setQuery("");
      setGenre(null);
      setSort("added");
      setArtist(null);
      (document.activeElement as HTMLElement | null)?.blur?.();
      scroller.current?.scrollTo({ top: 0 });
    }, 5000);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, touch));
      clearInterval(t);
    };
  }, [kiosk]);

  /* the wall */
  const genres = useMemo(() => {
    const n = new Map<string, number>();
    for (const it of items ?? []) for (const g of it.genres) n.set(g, (n.get(g) ?? 0) + 1);
    return Array.from(n.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([g]) => g);
  }, [items]);

  const sections = useMemo(() => {
    if (artist) {
      const theirs = (items ?? []).filter((it) => it.artist === artist);
      return [{ key: "artist", label: "", items: theirs.sort((a, b) => (yearOf(a) ?? 9999) - (yearOf(b) ?? 9999) || a.title.localeCompare(b.title)) }];
    }
    const words = fold(query).split(/\s+/).filter(Boolean);
    const shown = (items ?? []).filter((it) => {
      if (genre && !it.genres.includes(genre)) return false;
      if (!words.length) return true;
      const hay = fold(`${it.artist} ${it.title} ${it.label ?? ""} ${it.catno ?? ""} ${it.year ?? ""} ${it.original ?? ""} ${it.genres.join(" ")} ${it.styles.join(" ")}`);
      return words.every((w) => hay.includes(w));
    });
    return arrange(shown, sort);
  }, [items, query, genre, sort, artist]);
  const ordered = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const count = ordered.length;

  const openArtist = (name: string) => {
    if (!artist) scrollBeforeArtist.current = scroller.current?.scrollTop ?? 0;
    setOpenId(null);
    setArtist(name);
    scroller.current?.scrollTo({ top: 0 });
  };
  const closeArtist = () => {
    setArtist(null);
    // Back where you were in the wall or the artist list.
    requestAnimationFrame(() => scroller.current?.scrollTo({ top: scrollBeforeArtist.current }));
  };

  const changeView = (fn: () => void) => {
    fn();
    setArtist(null);
    scroller.current?.scrollTo({ top: 0 });
  };

  const surprise = () => {
    const pool = ordered.length ? ordered : items ?? [];
    if (pool.length) setOpenId(pool[Math.floor(Math.random() * pool.length)].id);
  };

  /* full screen (Android/Fire browsers; an installed app already is) */
  const [canFullscreen, setCanFullscreen] = useState(false);
  useEffect(() => {
    const check = () =>
      setCanFullscreen(
        !!document.fullscreenEnabled && !document.fullscreenElement && !window.matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches
      );
    check();
    document.addEventListener("fullscreenchange", check);
    return () => document.removeEventListener("fullscreenchange", check);
  }, []);

  if (!items) {
    return (
      <Stage>
        <div className="h-full flex flex-col items-center justify-center gap-6 text-center px-6">
          {loadError ? (
            <>
              <p className="font-display text-3xl">{loadError}</p>
              <button onClick={load} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-white/80">
                <RotateCw className="w-4 h-4" /> Try again
              </button>
            </>
          ) : (
            <>
              <div className="w-24 h-24 rounded-full shelf-disc animate-[spin_3s_linear_infinite]" />
              <p className="text-white/55 text-lg">Pulling records off the shelf…</p>
            </>
          )}
        </div>
      </Stage>
    );
  }

  const openIndex = openId === null ? -1 : ordered.findIndex((i) => i.id === openId);
  const opened = openIndex >= 0 ? ordered[openIndex] : openId !== null ? items.find((i) => i.id === openId) ?? null : null;

  return (
    <Stage swallowUntil={swallowUntil}>
      <div ref={scroller} className="relative h-full overflow-y-auto overscroll-contain shelf-scroll">
        {/* title — scrolls away; the controls below stay */}
        <div className="px-4 sm:px-6 lg:px-10 pt-5 sm:pt-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)" }}>
          <h1 className="font-display text-[2rem] sm:text-3xl lg:text-[2.6rem] leading-none font-semibold tracking-tight truncate">{title}</h1>
          <p className="mt-1.5 text-sm text-white/45 tabular-nums">
            {count === items.length || artist ? plural(items.length, "record") : `${count.toLocaleString()} of ${plural(items.length, "record")}`}
            {sort === "artists" && !artist && ` · ${plural(new Set(ordered.map((i) => i.artist)).size, "artist")}`}
          </p>
        </div>

        {/* controls — sticky, under the status bar */}
        <header
          className="sticky z-20 mt-3 bg-[#0b0b0c]/80 backdrop-blur-2xl backdrop-saturate-150"
          style={{ top: "env(safe-area-inset-top)" }}
        >
          <div className="px-4 sm:px-6 lg:px-10 pt-2 pb-2.5 flex items-center gap-2 sm:gap-2.5">
            <label className="relative flex items-center flex-1 min-w-0 sm:flex-initial">
              <Search className="absolute left-3.5 w-4 h-4 text-white/40 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => changeView(() => setQuery(e.target.value))}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                placeholder="Search the shelf"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="search"
                className="w-full sm:w-64 lg:w-72 h-11 rounded-full bg-white/[0.07] pl-10 pr-10 text-[16px] sm:text-[15px] text-white placeholder:text-white/35 outline-none ring-1 ring-white/[0.06] focus:ring-white/25 focus:bg-white/[0.1] transition"
              />
              {query && (
                <button onClick={() => changeView(() => setQuery(""))} aria-label="Clear search" className="absolute right-2 p-1.5 rounded-full text-white/50 active:bg-white/10">
                  <X className="w-4 h-4" />
                </button>
              )}
            </label>
            <div className="hidden sm:block"><SortSwitch sort={sort} onChange={(v) => changeView(() => setSort(v))} /></div>
            <GlassButton onClick={surprise} label="Surprise me"><Shuffle className="w-[18px] h-[18px]" /></GlassButton>
            {kiosk && canFullscreen && (
              <GlassButton onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} label="Full screen">
                <Maximize className="w-[18px] h-[18px]" />
              </GlassButton>
            )}
          </div>
          {/* phones: order + genres share one swipeable strip */}
          <div className="px-4 sm:px-6 lg:px-10 pb-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <div className="sm:hidden shrink-0"><SortSwitch sort={sort} onChange={(v) => changeView(() => setSort(v))} small /></div>
            {genres.length > 1 && (
              <>
                <span className="sm:hidden shrink-0 w-px h-5 bg-white/15 mx-0.5" />
                {[null, ...genres].map((g) => (
                  <button
                    key={g ?? "all"}
                    onClick={() => changeView(() => setGenre(g))}
                    className={`shrink-0 h-9 px-4 rounded-full text-sm transition-colors ${genre === g ? "bg-white text-black font-medium" : "bg-white/[0.06] text-white/65 active:bg-white/15"}`}
                  >
                    {g ?? "All"}
                  </button>
                ))}
              </>
            )}
          </div>
          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </header>

        {/* covers */}
        <main className={`pl-4 sm:pl-6 lg:pl-10 pt-6 pb-24 ${sections.length > 1 ? "pr-9 sm:pr-12 lg:pr-14" : "pr-4 sm:pr-6 lg:pr-10"}`} style={{ paddingBottom: "max(6rem, env(safe-area-inset-bottom))" }}>
          {artist ? (
            <section>
              <button
                onClick={closeArtist}
                className="-ml-1.5 mb-4 inline-flex items-center gap-1 rounded-full py-1.5 pl-1.5 pr-3 text-sm text-white/60 active:bg-white/10"
              >
                <ChevronLeft className="w-4 h-4" /> {sort === "artists" ? "All artists" : "Back"}
              </button>
              <div className="flex items-center gap-4 sm:gap-6 mb-8">
                <ArtistPortrait artist={{ name: artist, items: ordered, cover: ordered.find((i) => i.cover) }} className="w-20 h-20 sm:w-28 sm:h-28" />
                <div className="min-w-0">
                  <h2 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.05] line-clamp-2 pb-[0.06em]">{artist}</h2>
                  <p className="mt-1.5 text-sm text-white/45">
                    {plural(count, "record")}
                    {(() => {
                      const first = ordered[0] && yearOf(ordered[0]);
                      const last = ordered[count - 1] && yearOf(ordered[count - 1]);
                      return first && last && first !== last ? ` · ${first}–${last}` : "";
                    })()}
                  </p>
                </div>
              </div>
              <div className="grid gap-x-4 sm:gap-x-5 gap-y-6 sm:gap-y-7 mb-10 grid-cols-[repeat(auto-fill,minmax(132px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(158px,1fr))]">
                {ordered.map((it) => (
                  <Tile key={it.id} item={it} onOpen={() => setOpenId(it.id)} sub={yearOf(it) ? String(yearOf(it)) : it.format} />
                ))}
              </div>
            </section>
          ) : count === 0 ? (
            <p className="py-32 text-center text-white/45 text-lg">
              Nothing on the shelf matches {query ? <>“{query}”</> : "that"}.
            </p>
          ) : (
            sections.map((s) => (
              <section key={s.key} id={`shelf-sec-${s.key}`} className="scroll-mt-40">
                {s.label && (
                  <h2 className="font-display text-2xl font-semibold text-white/85 mb-4 mt-2 first:mt-0">{s.label}</h2>
                )}
                {sort === "artists" ? (
                  <div className="grid gap-x-4 sm:gap-x-5 gap-y-6 sm:gap-y-8 mb-10 grid-cols-[repeat(auto-fill,minmax(112px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
                    {groupArtists(s.items).map((a) => (
                      <ArtistTile key={a.name} artist={a} onOpen={() => openArtist(a.name)} />
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-x-4 sm:gap-x-5 gap-y-6 sm:gap-y-7 mb-10 grid-cols-[repeat(auto-fill,minmax(132px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(158px,1fr))]">
                    {s.items.map((it) => (
                      <Tile key={it.id} item={it} onOpen={() => setOpenId(it.id)} />
                    ))}
                  </div>
                )}
              </section>
            ))
          )}
        </main>
      </div>

      {/* the status bar, when the page runs under it (installed on iOS) */}
      <div className="absolute inset-x-0 top-0 z-20 bg-[#0b0b0c]/80 backdrop-blur-2xl" style={{ height: "env(safe-area-inset-top)" }} />

      {sections.length > 1 && <IndexRail sections={sections} scroller={scroller} />}

      {opened && (
        <RecordView
          key={opened.id}
          token={token}
          item={opened}
          onClose={() => setOpenId(null)}
          prev={openIndex > 0 ? () => setOpenId(ordered[openIndex - 1].id) : undefined}
          next={openIndex >= 0 && openIndex < ordered.length - 1 ? () => setOpenId(ordered[openIndex + 1].id) : undefined}
          upNext={openIndex >= 0 ? ordered[openIndex + 1] : undefined}
          onArtist={artist === opened.artist ? undefined : () => openArtist(opened.artist)}
        />
      )}

      {idle && (
        <Slideshow
          items={items}
          title={title}
          onWake={() => { lastTouch.current = Date.now(); swallowUntil.current = Date.now() + 600; setIdle(false); }}
        />
      )}
    </Stage>
  );
}

/** The shelf has its own look: set aside the app theme chosen on this device. */
export function useShelfLook() {
  useEffect(() => {
    const html = document.documentElement;
    const saved = html.dataset.theme;
    delete html.dataset.theme;
    return () => { if (saved) html.dataset.theme = saved; };
  }, []);
}

/* ── pieces ─────────────────────────────────────────────────────────────── */

function Stage({ children, swallowUntil }: { children: React.ReactNode; swallowUntil?: React.MutableRefObject<number> }) {
  return (
    <div
      className="fixed inset-0 bg-[#0b0b0c] text-white overflow-hidden select-none shelf-root"
      onContextMenu={(e) => e.preventDefault()}
      onClickCapture={(e) => {
        if (swallowUntil && Date.now() < swallowUntil.current) { e.stopPropagation(); e.preventDefault(); }
      }}
    >
      {children}
    </div>
  );
}

function SortSwitch({ sort, onChange, small = false }: { sort: Sort; onChange: (s: Sort) => void; small?: boolean }) {
  return (
    <div className={`flex rounded-full bg-white/[0.07] p-1 ring-1 ring-white/[0.06] ${small ? "h-9" : "h-11"}`} role="tablist" aria-label="Order">
      {SORTS.map((s) => (
        <button
          key={s.id}
          role="tab"
          aria-selected={sort === s.id}
          onClick={() => onChange(s.id)}
          className={`rounded-full text-sm font-medium transition-colors ${small ? "px-3" : "px-4"} ${sort === s.id ? "bg-white text-black" : "text-white/60"}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function GlassButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-full bg-white/[0.07] ring-1 ring-white/[0.06] text-white/75 active:bg-white/20 transition-colors"
    >
      {children}
    </button>
  );
}

/** A cover that fades in when it has loaded, and a typeset stand-in when there is none. */
function Cover({ item, className = "", eager = false }: { item: ShelfItem; className?: string; eager?: boolean }) {
  const [state, setState] = useState<"loading" | "ok" | "failed">(item.cover ? "loading" : "failed");
  // Discogs' image server answers bursts with 429: try again, three times,
  // further apart each time (the stand-in shows meanwhile).
  const [attempt, setAttempt] = useState(0);
  const failed = () => {
    setState("failed");
    if (attempt < 3) setTimeout(() => { setAttempt((a) => a + 1); setState("loading"); }, [2000, 5000, 12000][attempt] + Math.random() * 1500);
  };
  // The first screen of covers is in the server's HTML, and from the Pi they
  // can finish before React hydrates — their load event is then never seen and
  // they'd stay invisible. Ask the image itself once we're running.
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // (Only success: a lazy image not fetched yet can also read as complete
    // with no width in some browsers, and must not be marked failed.)
    const el = img.current;
    if (el?.complete && el.naturalWidth > 0) setState("ok");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per image
  }, [attempt]);
  return (
    <div className={`relative overflow-hidden bg-white/[0.05] ${className}`}>
      {state !== "failed" && item.cover && (
        // eslint-disable-next-line @next/next/no-img-element -- hundreds of remote covers; the Pi shouldn't resize them
        <img
          ref={img}
          key={attempt}
          src={attempt ? `${item.cover}${item.cover.includes("?") ? "&" : "?"}r=${attempt}` : item.cover}
          alt=""
          draggable={false}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setState("ok")}
          onError={failed}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${state === "ok" ? "opacity-100" : "opacity-0"}`}
        />
      )}
      {state === "failed" && (
        <div className="absolute inset-0 p-[9%] flex flex-col justify-between bg-gradient-to-br from-[#2a2622] to-[#121110]">
          <span className="font-display text-[clamp(0.8rem,1.6vw,1.2rem)] leading-tight text-white/85 line-clamp-4">{item.title}</span>
          <span className="text-[clamp(0.6rem,1vw,0.8rem)] uppercase tracking-widest text-white/45 line-clamp-2">{item.artist}</span>
        </div>
      )}
    </div>
  );
}

/** An artist: their first record's cover, in a circle. */
function ArtistPortrait({ artist, className = "" }: { artist: Artist; className?: string }) {
  const c = artist.cover;
  return (
    <div className={`shrink-0 rounded-full shadow-[0_14px_30px_-12px_rgba(0,0,0,0.9)] ${className}`}>
      {c ? (
        <Cover item={c} className="w-full h-full rounded-full ring-1 ring-white/[0.08]" />
      ) : (
        <div className="w-full h-full rounded-full bg-white/[0.06]" />
      )}
    </div>
  );
}

function ArtistTile({ artist, onOpen }: { artist: Artist; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group text-center outline-none"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 200px" }}
    >
      <ArtistPortrait artist={artist} className="w-full aspect-square transition-transform duration-200 group-active:scale-[0.96]" />
      <div className="mt-2.5 px-0.5">
        <div className="text-[13.5px] leading-snug font-medium text-white/90 line-clamp-2">{artist.name}</div>
        <div className="text-[12.5px] leading-snug text-white/45">{plural(artist.items.length, "record")}</div>
      </div>
    </button>
  );
}

function Tile({ item, onOpen, sub }: { item: ShelfItem; onOpen: () => void; sub?: string }) {
  return (
    <button
      onClick={onOpen}
      className="group text-left outline-none"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 220px" }}
    >
      <Cover
        item={item}
        className="aspect-square rounded-[6px] shadow-[0_14px_30px_-12px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.06] transition-transform duration-200 group-active:scale-[0.96]"
      />
      <div className="mt-2.5 px-0.5">
        <div className="text-[13.5px] leading-snug font-medium text-white/90 truncate">{item.title}</div>
        <div className="text-[12.5px] leading-snug text-white/45 truncate">{sub ?? item.artist}</div>
      </div>
    </button>
  );
}

/** Letters (or decades) down the right edge: touch and slide to jump. */
function IndexRail({ sections, scroller }: { sections: Section[]; scroller: React.RefObject<HTMLDivElement> }) {
  const rail = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);

  // Sit below the controls wherever they are: under the title at the top of
  // the page, under the status bar once they've stuck.
  useEffect(() => {
    const sc = scroller.current;
    const el = rail.current;
    if (!sc || !el) return;
    let raf = 0;
    const place = () => {
      raf = 0;
      const head = sc.querySelector("header");
      if (!head) return;
      el.style.top = `${head.getBoundingClientRect().bottom - sc.getBoundingClientRect().top + 8}px`;
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(place); };
    place();
    sc.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      sc.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      cancelAnimationFrame(raf);
    };
  }, [scroller]);

  const jump = (clientY: number) => {
    const r = rail.current?.getBoundingClientRect();
    if (!r) return;
    const i = Math.min(sections.length - 1, Math.max(0, Math.floor(((clientY - r.top) / r.height) * sections.length)));
    const key = sections[i].key;
    setActive(key);
    const el = document.getElementById(`shelf-sec-${key}`);
    const sc = scroller.current;
    const head = sc?.querySelector("header")?.offsetHeight ?? 140;
    if (el && sc) sc.scrollTo({ top: el.offsetTop - head - 12 });
  };
  return (
    <>
      <div
        ref={rail}
        className="absolute right-0 z-10 w-8 sm:w-10 flex flex-col items-center justify-center touch-none"
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); jump(e.clientY); }}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") jump(e.clientY); }}
        onPointerUp={() => setTimeout(() => setActive(null), 500)}
        onPointerCancel={() => setActive(null)}
      >
        <div className="flex flex-col items-center justify-evenly w-full h-full max-h-[36rem]">
          {sections.map((s) => (
            <span key={s.key} className="text-[11px] sm:text-xs leading-none font-semibold text-white/50 tabular-nums">
              {s.key === "Undated" ? "–" : s.key.replace(/^(\d\d)(\d\d)s$/, "’$2")}
            </span>
          ))}
        </div>
      </div>
      {active && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="min-w-[7rem] h-28 px-6 rounded-3xl bg-black/60 backdrop-blur-xl flex items-center justify-center font-display text-6xl font-semibold">
            {active}
          </div>
        </div>
      )}
    </>
  );
}

/* ── one record ─────────────────────────────────────────────────────────── */

const releaseCache = new Map<number, ShelfRelease | "failed">();

function useRelease(token: string, id: number | undefined) {
  const [rel, setRel] = useState<ShelfRelease | "failed" | null>(id ? releaseCache.get(id) ?? null : null);
  useEffect(() => {
    if (!id) return;
    const hit = releaseCache.get(id);
    if (hit) return setRel(hit);
    let live = true;
    fetch(`/api/shelf/${token}/release/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((r: ShelfRelease) => { releaseCache.set(id, r); if (live) setRel(r); })
      .catch(() => { if (live) setRel("failed"); });
    return () => { live = false; };
  }, [token, id]);
  return rel;
}

function RecordView({
  token, item, onClose, prev, next, upNext, onArtist,
}: {
  token: string;
  item: ShelfItem;
  onClose: () => void;
  prev?: () => void;
  next?: () => void;
  upNext?: ShelfItem;
  /** Open this artist's page; absent when it's the page underneath. */
  onArtist?: () => void;
}) {
  const rel = useRelease(token, item.id);
  const [flipped, setFlipped] = useState(false);
  const back = rel && rel !== "failed" ? rel.images[1] : undefined;

  // Warm the next record's page so swiping on feels instant.
  useEffect(() => {
    if (!upNext || releaseCache.has(upNext.id) || !rel) return;
    const t = setTimeout(() => {
      fetch(`/api/shelf/${token}/release/${upNext.id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((r) => r && releaseCache.set(upNext.id, r))
        .catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [upNext, rel, token]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev?.();
      if (e.key === "ArrowRight") next?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prev, next]);

  // Swipe sideways for the neighbours, down (outside the tracklist) to close.
  const start = useRef<{ x: number; y: number; scroll: boolean } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, scroll: !!(e.target as HTMLElement).closest("[data-scroll]") };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.4) (dx < 0 ? next : prev)?.();
    else if (!s.scroll && dy > 110 && dy > Math.abs(dx) * 1.4) onClose();
  };

  const sides = useMemo(() => {
    if (!rel || rel === "failed") return [];
    const groups: { side: string; tracks: ShelfRelease["tracks"] }[] = [];
    for (const t of rel.tracks) {
      const side = t.position.match(/^([A-Z])/)?.[1] ?? (t.position.match(/^(\d+)-/)?.[1] ? `Disc ${t.position.split("-")[0]}` : "");
      let g = groups[groups.length - 1];
      if (!g || g.side !== side) groups.push((g = { side, tracks: [] }));
      g.tracks.push(t);
    }
    return groups;
  }, [rel]);

  // The album's year first; this copy's pressing year beside it when different.
  const pressed = rel && rel !== "failed" && rel.released ? Number(rel.released.slice(0, 4)) || item.year : item.year;
  const original = yearOf(item);
  const meta = [
    original,
    pressed && original && pressed !== original ? `Pressed ${pressed}` : null,
    rel && rel !== "failed" ? rel.country : null,
    [item.label, item.catno].filter(Boolean).join(" · "),
    item.format,
  ].filter(Boolean);
  const since = sinceLine(item.added);

  return (
    <div
      className="fixed inset-0 z-40 overflow-hidden animate-[shelf-fade_.35s_ease_both]"
      role="dialog"
      aria-label={`${item.title} by ${item.artist}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* the cover, blown up and blurred, is the room's light */}
      <div className="absolute inset-0 bg-[#0b0b0c]" onClick={onClose} />
      {item.cover && (
        <div
          className="absolute -inset-[15%] bg-center bg-cover opacity-70 pointer-events-none"
          style={{ backgroundImage: `url("${item.cover}")`, filter: "blur(70px) saturate(1.5) brightness(0.55)" }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/70 pointer-events-none" />

      <div
        className="relative h-full flex flex-col landscape:flex-row items-center gap-8 landscape:gap-14 px-6 lg:px-14 pb-8 landscape:pb-10 pointer-events-none"
        style={{ paddingTop: "max(4.5rem, calc(env(safe-area-inset-top) + 3.5rem))" }}
      >
        {/* sleeve + disc */}
        <div className="shrink-0 flex items-center justify-center pointer-events-auto">
          <div className="relative [--s:min(58vh,35vw)] portrait:[--s:min(64vw,36vh)]">
            <div className="relative" style={{ width: "calc(var(--s) * 1.32)", height: "var(--s)" }}>
              <Disc cover={item.cover} />
              <button
                onClick={() => back && setFlipped((f) => !f)}
                className="absolute left-0 top-0 [perspective:1600px] outline-none"
                style={{ width: "var(--s)", height: "var(--s)" }}
                aria-label={back ? (flipped ? "Show the front" : "Show the back") : undefined}
              >
                <div
                  className="relative w-full h-full transition-transform duration-700 [transform-style:preserve-3d]"
                  style={{ transform: flipped ? "rotateY(180deg)" : "none" }}
                >
                  <div className="absolute inset-0 [backface-visibility:hidden]">
                    <Cover item={item} eager className="w-full h-full rounded-[4px] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.85)]" />
                  </div>
                  {back && (
                    <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-[4px] overflow-hidden bg-[#111] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.85)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={back} alt="" draggable={false} className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </button>
            </div>
            {back && (
              <p className="mt-4 text-center text-xs uppercase tracking-[0.2em] text-white/40" style={{ width: "var(--s)" }}>
                Tap the sleeve to flip it
              </p>
            )}
          </div>
        </div>

        {/* words */}
        <div className="min-h-0 flex-1 landscape:flex-initial landscape:max-h-full w-full max-w-2xl flex flex-col pointer-events-auto animate-[shelf-rise_.6s_.1s_ease_both]">
          {onArtist ? (
            <button
              onClick={onArtist}
              className="shrink-0 self-start max-w-full inline-flex items-center gap-1 text-sm uppercase tracking-[0.22em] text-white/60 active:text-white truncate"
            >
              <span className="truncate">{item.artist}</span>
              <ChevronRight className="w-4 h-4 shrink-0 opacity-60" />
            </button>
          ) : (
            <p className="shrink-0 text-sm uppercase tracking-[0.22em] text-white/60 truncate">{item.artist}</p>
          )}
          <h2 className="shrink-0 mt-2 pb-[0.06em] font-display text-[2rem] sm:text-4xl lg:text-[3.4rem] leading-[1.04] font-semibold tracking-tight line-clamp-3">{item.title}</h2>
          <p className="shrink-0 mt-4 text-[15px] text-white/60 leading-relaxed">{meta.join("  ·  ")}</p>
          {(item.styles.length > 0 || item.genres.length > 0) && (
            <div className="shrink-0 mt-4 flex flex-wrap gap-1.5">
              {(item.styles.length ? item.styles : item.genres).slice(0, 6).map((g) => (
                <span key={g} className="px-3 py-1 rounded-full bg-white/10 text-[13px] text-white/75">{g}</span>
              ))}
            </div>
          )}

          <div data-scroll className="mt-6 min-h-0 overflow-y-auto overscroll-contain shelf-scroll pr-2 -mr-2">
            {rel === null && (
              <div className="space-y-3 pt-1">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="h-4 rounded bg-white/[0.07] animate-pulse" style={{ width: `${70 - i * 6}%` }} />
                ))}
              </div>
            )}
            {rel === "failed" && <p className="text-white/45">The tracklist couldn&apos;t be loaded right now.</p>}
            {sides.length > 0 && (
              <div className={`grid gap-x-10 gap-y-6 ${sides.length > 1 ? "lg:grid-cols-2" : ""}`}>
                {sides.map((g, gi) => (
                  <div key={gi}>
                    {g.side && <p className="text-xs uppercase tracking-[0.22em] text-white/40 mb-2">{g.side.length === 1 ? `Side ${g.side}` : g.side}</p>}
                    <ol className="space-y-0.5">
                      {g.tracks.map((t, i) => (
                        <li key={i} className="flex items-baseline gap-3 py-1.5 border-b border-white/[0.06]">
                          <span className="w-7 shrink-0 text-[13px] text-white/35 tabular-nums">{t.position}</span>
                          <span className="flex-1 text-[15px] text-white/90 leading-snug">{t.title}</span>
                          {t.duration && <span className="text-[13px] text-white/35 tabular-nums">{t.duration}</span>}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
            {since && <p className="mt-8 text-sm text-white/35">On the shelf since {since}{item.copies > 1 ? ` · ${item.copies} copies` : ""}</p>}
          </div>
        </div>
      </div>

      {/* chrome */}
      <div className="absolute right-5 z-10" style={{ top: "max(1.25rem, env(safe-area-inset-top))" }}>
        <GlassButton onClick={onClose} label="Close"><X className="w-5 h-5" /></GlassButton>
      </div>
      {prev && (
        <button onClick={prev} aria-label="Previous record" className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-10 h-12 w-12 items-center justify-center rounded-full bg-white/[0.08] backdrop-blur text-white/70 active:bg-white/20">
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {next && (
        <button onClick={next} aria-label="Next record" className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-10 h-12 w-12 items-center justify-center rounded-full bg-white/[0.08] backdrop-blur text-white/70 active:bg-white/20">
          <ChevronRight className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}

/** The record half out of its sleeve, turning; its label is the cover art. */
function Disc({ cover, spin = true }: { cover: string | null; spin?: boolean }) {
  return (
    <div
      className="absolute top-[3%] left-0 animate-[shelf-disc-out_1.1s_.15s_cubic-bezier(.2,.8,.2,1)_both]"
      style={{ width: "calc(var(--s) * 0.94)", height: "calc(var(--s) * 0.94)", ["--out" as string]: "calc(var(--s) * 0.36)" } as React.CSSProperties}
    >
      <div className={`absolute inset-0 rounded-full shelf-disc ${spin ? "animate-[spin_7s_linear_infinite]" : ""}`}>
        <div
          className="absolute inset-[32%] rounded-full bg-center bg-cover bg-[#3a3a3a]"
          style={cover ? { backgroundImage: `url("${cover}")` } : undefined}
        />
        <div className="absolute inset-[48.6%] rounded-full bg-[#0b0b0c]" />
      </div>
      {/* the light on the vinyl doesn't turn with it */}
      <div className="absolute inset-0 rounded-full shelf-disc-sheen pointer-events-none" />
    </div>
  );
}

/* ── the slideshow ──────────────────────────────────────────────────────── */

function Slideshow({ items, title, onWake }: { items: ShelfItem[]; title: string; onWake: () => void }) {
  const deck = useMemo(() => {
    const withCovers = items.filter((i) => i.cover);
    const a = [...(withCovers.length ? withCovers : items)];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }, [items]);
  const [i, setI] = useState(0);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setI((n) => n + 1), SLIDE_MS);
    const c = setInterval(() => setNow(new Date()), 10_000);
    return () => { clearInterval(t); clearInterval(c); };
  }, []);
  // Have the next cover in hand before its turn.
  useEffect(() => {
    const nxt = deck[(i + 1) % deck.length];
    if (nxt?.cover) new Image().src = nxt.cover;
  }, [i, deck]);

  if (!deck.length) return null;
  const cur = deck[i % deck.length];
  const prev = i > 0 ? deck[(i - 1) % deck.length] : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black cursor-pointer animate-[shelf-fade_1.2s_ease_both]"
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onWake(); }}
    >
      {prev && <Slide key={`p${i}`} item={prev} leaving />}
      <Slide key={`c${i}`} item={cur} />

      <div className="absolute left-8 lg:left-12 z-10" style={{ top: "max(2rem, env(safe-area-inset-top))" }}>
        <div className="font-display text-6xl lg:text-7xl font-light tabular-nums tracking-tight text-white/90">
          {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, "")}
        </div>
        <div className="mt-1 text-white/50 text-sm uppercase tracking-[0.25em]">
          {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between px-8 lg:px-12" style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}>
        <span className="font-display text-xl text-white/70">{title}</span>
        <span className="flex items-center gap-2.5 text-sm text-white/50 uppercase tracking-[0.2em]">
          <span className="w-2 h-2 rounded-full bg-white/70 animate-pulse" /> Touch to browse
        </span>
      </div>
    </div>
  );
}

function Slide({ item, leaving = false }: { item: ShelfItem; leaving?: boolean }) {
  return (
    <div className={`absolute inset-0 ${leaving ? "animate-[shelf-fade-out_1.8s_ease_both]" : "animate-[shelf-fade_1.8s_ease_both]"}`}>
      {item.cover && (
        <div
          className="absolute -inset-[15%] bg-center bg-cover"
          style={{ backgroundImage: `url("${item.cover}")`, filter: "blur(80px) saturate(1.6) brightness(0.5)" }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
      <div className="relative h-full flex flex-col items-center justify-center gap-8">
        <div className="relative" style={{ ["--s" as string]: "min(52vh, 40vw)", width: "calc(var(--s) * 1.32)", height: "var(--s)" } as React.CSSProperties}>
          <Disc cover={item.cover} />
          <div className="absolute left-0 top-0 animate-[shelf-drift_11s_ease-out_both]" style={{ width: "var(--s)", height: "var(--s)" }}>
            <Cover item={item} eager className="w-full h-full rounded-[4px] shadow-[0_50px_100px_-25px_rgba(0,0,0,0.9)]" />
          </div>
        </div>
        <div className="text-center px-8 max-w-3xl">
          <div className="font-display text-4xl lg:text-5xl font-semibold tracking-tight leading-tight line-clamp-2">{item.title}</div>
          <div className="mt-2 text-lg text-white/60">
            {item.artist}{yearOf(item) ? ` · ${yearOf(item)}` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
