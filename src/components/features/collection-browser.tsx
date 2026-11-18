"use client";

// Browse: the records first. A sticky search and a row of filter chips, one
// summary line, then a three-column grid of covers — the numbers live in a
// Stats sheet that describes exactly what the filters show
// (design/redesign/HANDOFF.md, 06 and 08). Years are ORIGINAL release years
// (the Discogs master's), not the pressing's.
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Search, Disc3, Star, Shuffle, X, Loader2, ChevronDown, BarChart3 } from "lucide-react";
import type { DiscogsCollectionItem } from "@/types/discogs";

interface CollectionBrowserProps {
  items?: DiscogsCollectionItem[];
  totalItems: number;
  isReady: boolean;
  /** Original release year by master id. */
  years?: Record<number, number>;
  /** Masters whose year is still being looked up. */
  yearsPending?: number;
  /** Buttons for the summary line (e.g. share). */
  actions?: React.ReactNode;
}

type SortKey = "added_desc" | "added_asc" | "year_asc" | "year_desc" | "artist_az" | "rating_desc";

const SORT_LABELS: Record<SortKey, string> = {
  added_desc: "Recently added",
  added_asc: "First added",
  year_asc: "Oldest releases",
  year_desc: "Newest releases",
  artist_az: "Artist A–Z",
  rating_desc: "Your rating",
};

const ALL = "";

const artistName = (it: DiscogsCollectionItem) =>
  it.basic_information.artists.map((a) => a.name.replace(/\s\(\d+\)$/, "").replace(/\*$/, "")).join(", ");
const artistKey = (it: DiscogsCollectionItem) => artistName(it).toLowerCase().replace(/^the\s+/, "");
const decadeLabel = (d: number) => `${d}s`;
const shortDecade = (d: number) => `’${String(d).slice(2)}s`;

export function CollectionBrowser({ items, totalItems, isReady, years, yearsPending = 0, actions }: CollectionBrowserProps) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState(ALL);
  const [decade, setDecade] = useState(ALL);
  const [sort, setSort] = useState<SortKey>("added_desc");
  const [pick, setPick] = useState<DiscogsCollectionItem | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);

  const allItems = useMemo(() => items ?? [], [items]);

  /** When the music came out: the master's year, else the pressing's. */
  const yearOf = useMemo(() => {
    return (it: DiscogsCollectionItem): number | null => {
      const m = it.basic_information.master_id;
      const y = (m && years?.[m]) || it.basic_information.year;
      return y && y > 0 ? y : null;
    };
  }, [years]);
  const decadeOf = useMemo(() => {
    return (it: DiscogsCollectionItem): number | null => {
      const y = yearOf(it);
      return y ? Math.floor(y / 10) * 10 : null;
    };
  }, [yearOf]);

  const options = useMemo(() => {
    const g = new Map<string, number>();
    const d = new Map<number, number>();
    for (const it of allItems) {
      for (const gn of it.basic_information.genres ?? []) g.set(gn, (g.get(gn) ?? 0) + 1);
      const dec = decadeOf(it);
      if (dec) d.set(dec, (d.get(dec) ?? 0) + 1);
    }
    return {
      genres: Array.from(g.entries()).sort((a, b) => b[1] - a[1]).map(([v, n]) => [v, `${v} · ${n}`] as [string, string]),
      decades: Array.from(d.entries()).sort((a, b) => a[0] - b[0]).map(([v, n]) => [String(v), `${decadeLabel(v)} · ${n}`] as [string, string]),
    };
  }, [allItems, decadeOf]);

  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const out = allItems.filter((it) => {
      if (genre && !(it.basic_information.genres ?? []).includes(genre)) return false;
      if (decade && String(decadeOf(it)) !== decade) return false;
      if (words.length) {
        const hay = `${artistName(it)} ${it.basic_information.title} ${yearOf(it) ?? ""}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    const byYear = (a: DiscogsCollectionItem, b: DiscogsCollectionItem, dir: 1 | -1) => {
      const ya = yearOf(a), yb = yearOf(b);
      if (ya === null) return yb === null ? 0 : 1; // undated last either way
      if (yb === null) return -1;
      return (ya - yb) * dir;
    };
    switch (sort) {
      case "added_desc": return out;
      case "added_asc": return out.slice().reverse();
      case "year_asc": return out.slice().sort((a, b) => byYear(a, b, 1));
      case "year_desc": return out.slice().sort((a, b) => byYear(a, b, -1));
      case "artist_az": return out.slice().sort((a, b) => artistKey(a).localeCompare(artistKey(b)) || byYear(a, b, 1));
      case "rating_desc": return out.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }
  }, [allItems, query, genre, decade, sort, yearOf, decadeOf]);

  const decadeSpan = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const it of filtered) {
      const d = decadeOf(it);
      if (d) { lo = Math.min(lo, d); hi = Math.max(hi, d); }
    }
    if (lo > hi) return null;
    return lo === hi ? decadeLabel(lo) : `${decadeLabel(lo)} to ${decadeLabel(hi)}`;
  }, [filtered, decadeOf]);

  const hasFilters = query.trim() !== "" || genre !== ALL || decade !== ALL;
  const clearFilters = () => { setQuery(""); setGenre(ALL); setDecade(ALL); setPick(null); };
  const surprise = () => {
    if (filtered.length) setPick(filtered[Math.floor(Math.random() * filtered.length)]);
  };

  if (!isReady) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="text-sm">Loading your collection…</span>
      </div>
    );
  }

  return (
    <section>
      {/* Toolbar — sticks under the section strip */}
      <div
        className="sticky z-10 -mx-4 px-4 pt-1 pb-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85"
        style={{ top: "calc(3.5rem + env(safe-area-inset-top, 0px) + var(--section-strip, 57px))" }}
      >
        <label className="relative flex items-center">
          <Search className="absolute left-4 w-[18px] h-[18px] text-muted-foreground pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${totalItems.toLocaleString()} records`}
            enterKeyHint="search"
            className="w-full h-11 pl-11 pr-11 rounded-full border border-input bg-card text-base sm:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[1.5px] focus-visible:ring-primary"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-1 w-10 h-10 inline-flex items-center justify-center rounded-full text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </label>
        <div className="-mx-4 px-4 mt-2.5 flex gap-2 overflow-x-auto no-scrollbar">
          <ChipSelect label="Genre" value={genre} options={options.genres} onChange={setGenre} />
          <ChipSelect label="Decade" value={decade} options={options.decades} onChange={setDecade} display={(v) => decadeLabel(Number(v))} />
          <ChipSelect
            label={SORT_LABELS[sort]}
            value={sort}
            options={(Object.keys(SORT_LABELS) as SortKey[]).map((k) => [k, SORT_LABELS[k]])}
            onChange={(v) => setSort(v as SortKey)}
            sort
          />
          <button
            onClick={surprise}
            disabled={!filtered.length}
            className="shrink-0 h-10 px-3.5 rounded-full border bg-card text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Shuffle className="w-4 h-4" /> Surprise me
          </button>
        </div>
      </div>

      {/* Summary — one line; the numbers are behind Stats */}
      <div className="flex items-center justify-between gap-3 mt-1 mb-3">
        <p className="text-sm text-muted-foreground min-w-0">
          {hasFilters ? `${filtered.length.toLocaleString()} of ${allItems.length.toLocaleString()}` : `${allItems.length.toLocaleString()} records`}
          {decadeSpan && ` · ${decadeSpan}`}
          {yearsPending > 0 && <span className="block text-xs">Looking up original years · {yearsPending} to go</span>}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          {actions}
          <button
            onClick={() => setStatsOpen(true)}
            disabled={!filtered.length}
            className="h-10 px-3.5 rounded-full bg-secondary text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <BarChart3 className="w-4 h-4" /> Stats
          </button>
        </div>
      </div>

      {pick && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border bg-card p-3">
          <div className="w-14 h-14 relative bg-muted rounded-md overflow-hidden shrink-0">
            {pick.basic_information.cover_image || pick.basic_information.thumb ? (
              <Image src={pick.basic_information.cover_image || pick.basic_information.thumb} alt="" fill sizes="56px" className="object-cover" unoptimized />
            ) : (
              <Disc3 className="w-6 h-6 text-muted-foreground absolute inset-0 m-auto" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground">Put this one on</div>
            <div className="font-medium truncate">{pick.basic_information.title}</div>
            <div className="text-xs text-muted-foreground truncate">{[artistName(pick), yearOf(pick)].filter(Boolean).join(" · ")}</div>
          </div>
          <button onClick={surprise} className="h-10 px-3 rounded-full text-sm font-medium text-primary">Another</button>
          <button onClick={() => setPick(null)} aria-label="Dismiss" className="w-10 h-10 -mr-1 inline-flex items-center justify-center rounded-full text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* The records */}
      {allItems.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">Collection data isn&apos;t available for browsing — try refreshing the collection.</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-muted-foreground">Nothing matches {query.trim() ? <>“{query.trim()}”</> : "these filters"}.</p>
          <button onClick={clearFilters} className="h-10 px-4 rounded-full border text-sm font-medium">Clear filters</button>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-3 gap-y-5">
          {filtered.map((it) => (
            <Tile key={it.instance_id} it={it} year={yearOf(it)} />
          ))}
        </div>
      )}

      {statsOpen && (
        <StatsSheet
          items={filtered}
          total={allItems.length}
          name={[genre || null, decade ? decadeLabel(Number(decade)) : null, query.trim() ? `“${query.trim()}”` : null].filter(Boolean).join(" · ") || "Your whole collection"}
          yearOf={yearOf}
          onClose={() => setStatsOpen(false)}
        />
      )}
    </section>
  );
}

function Tile({ it, year }: { it: DiscogsCollectionItem; year: number | null }) {
  const b = it.basic_information;
  const src = b.cover_image || b.thumb;
  return (
    <div className="min-w-0" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 190px" }}>
      <div className="aspect-square relative bg-muted rounded-md overflow-hidden ring-1 ring-black/5">
        {src && !src.includes("spacer.gif") ? (
          <Image src={src} alt={`${artistName(it)} — ${b.title}`} fill sizes="(max-width:640px) 33vw, 20vw" className="object-cover" unoptimized />
        ) : (
          <Disc3 className="w-1/3 h-1/3 text-muted-foreground absolute inset-0 m-auto" />
        )}
        {it.rating > 0 && (
          <div className="absolute top-1 right-1 bg-black/60 text-white text-[10px] px-1 rounded flex items-center gap-0.5">
            <Star className="w-2.5 h-2.5 fill-current" />
            {it.rating}
          </div>
        )}
      </div>
      <div className="mt-1.5 text-xs leading-snug">
        <div className="font-semibold truncate" title={b.title}>{b.title}</div>
        <div className="text-muted-foreground truncate" title={artistName(it)}>{artistName(it)}</div>
        {year && <div className="text-muted-foreground tabular-nums">{year}</div>}
      </div>
    </div>
  );
}

/** A filter as a chip: the native picker underneath (a wheel on iPhone), dark
 *  once something is chosen, with an × to clear it. */
function ChipSelect({
  label, value, options, onChange, display, sort = false,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
  display?: (v: string) => string;
  sort?: boolean;
}) {
  const on = !sort && value !== ALL;
  return (
    <div
      className={`relative shrink-0 h-10 rounded-full inline-flex items-center text-sm font-medium ${
        on ? "bg-foreground text-background" : "border bg-card"
      }`}
    >
      <span className={`pl-3.5 inline-flex items-center gap-1 whitespace-nowrap ${on ? "pr-1" : "pr-3"}`}>
        {on ? (display ? display(value) : value) : label}
        {!on && <ChevronDown className="w-4 h-4 opacity-60" />}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={sort ? "Order" : label}
        className="absolute inset-0 opacity-0 cursor-pointer w-full text-base"
      >
        {!sort && <option value={ALL}>All</option>}
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      {on && (
        <button
          onClick={() => onChange(ALL)}
          aria-label={`Clear ${label.toLowerCase()}`}
          className="relative z-10 w-9 h-10 -mr-0.5 inline-flex items-center justify-center rounded-full"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

/** 08 — the numbers for exactly what the filters show. */
function StatsSheet({
  items, total, name, yearOf, onClose,
}: {
  items: DiscogsCollectionItem[];
  total: number;
  name: string;
  yearOf: (it: DiscogsCollectionItem) => number | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", esc); };
  }, [onClose]);

  const s = useMemo(() => {
    const decades = new Map<number, number>();
    const artists = new Map<string, number>();
    let lo = Infinity, hi = -Infinity, rated = 0, sum = 0;
    for (const it of items) {
      const y = yearOf(it);
      if (y) {
        lo = Math.min(lo, y); hi = Math.max(hi, y);
        const d = Math.floor(y / 10) * 10;
        decades.set(d, (decades.get(d) ?? 0) + 1);
      }
      const a = artistName(it);
      artists.set(a, (artists.get(a) ?? 0) + 1);
      if (it.rating > 0) { rated++; sum += it.rating; }
    }
    const top = Array.from(artists.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5);
    return {
      range: lo <= hi ? (lo === hi ? String(lo) : `${lo}–${hi}`) : null,
      // Every decade from first to last, empty ones too: a gap is part of the shape.
      decades: decades.size
        ? Array.from({ length: (Math.max(...Array.from(decades.keys())) - Math.min(...Array.from(decades.keys()))) / 10 + 1 }, (_, i) => {
            const d = Math.min(...Array.from(decades.keys())) + i * 10;
            return [d, decades.get(d) ?? 0] as [number, number];
          })
        : [],
      // Only artists with more than one record say anything.
      artists: top.filter(([, n]) => n > 1),
      avg: rated ? sum / rated : null,
      rated,
    };
  }, [items, yearOf]);
  const peak = Math.max(1, ...s.decades.map(([, n]) => n));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Stats for ${name}`}
        className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto bg-card rounded-t-2xl sm:rounded-2xl shadow-xl pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card px-5 pt-3 pb-2">
          <div className="mx-auto w-10 h-1 rounded-full bg-border sm:hidden" />
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-semibold leading-tight">{name}</h2>
              <p className="text-sm text-muted-foreground">
                {items.length === total ? `${total.toLocaleString()} records` : `${items.length.toLocaleString()} of ${total.toLocaleString()}`}
                {s.range && ` · ${s.range}`}
              </p>
            </div>
            <button onClick={onClose} aria-label="Close" className="-mr-2 w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-full hover:bg-accent">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-5 pb-6 space-y-6">
          {s.decades.length > 0 && (
            <section>
              <h3 className="section-label mb-3">By decade</h3>
              <div className="flex items-end gap-1.5 h-36">
                {s.decades.map(([d, n]) => (
                  <div key={d} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1">
                    {n > 0 && <span className="text-[11px] tabular-nums text-muted-foreground">{n}</span>}
                    <div className={`w-full rounded-t ${n > 0 ? "bg-primary" : "bg-border h-px"}`} style={n > 0 ? { height: `${Math.max(3, (n / peak) * 100)}%` } : undefined} />
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5 mt-1.5">
                {s.decades.map(([d]) => (
                  <span key={d} className="flex-1 min-w-0 text-center text-[11px] font-medium text-muted-foreground">{shortDecade(d)}</span>
                ))}
              </div>
            </section>
          )}

          {s.artists.length > 0 && (
            <section>
              <h3 className="section-label mb-1">Most records</h3>
              <ul className="divide-y border-y">
                {s.artists.map(([a, n]) => (
                  <li key={a} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="truncate">{a}</span>
                    <span className="text-muted-foreground tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {s.avg !== null && (
            <p className="text-sm text-muted-foreground">
              Your rating, on average: <span className="text-foreground font-medium">{s.avg.toFixed(1)} ★</span> across {s.rated}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
