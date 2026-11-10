"use client";

// The pressing finder: from "I'm holding a copy of Rubber Soul" to the exact
// Discogs release, in your collection, in a few taps.
//
//   1. Find the album (search, or paste a Discogs link).
//   2. Narrow with Discogs' own facets — format, year, country, label. These are
//      server-side filters and cost one request each, so they are instant.
//   3. Once few enough are left, load each pressing's runouts and notes (one
//      Discogs call apiece, paced) and match the runout you can read.
//   4. Ask Claude how to tell the rest apart; every pressing it names is a
//      button that adds it to your collection.
//
// Two shortcuts: scan the sleeve's barcode, which jumps straight to the few
// releases that carry it; and flick through every photo of what is left,
// ruling pressings out by eye ("that's not my label").

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Disc3,
  Search,
  Loader2,
  X,
  Plus,
  Check,
  ExternalLink,
  Sparkles,
  ScanLine,
  ChevronDown,
  Square,
  Camera,
  Images,
  Barcode,
  Ban,
} from "lucide-react";
import {
  MAX_DETAILS, MAX_IDENTIFY, normalizeRunout, runoutMatches, looksLikeBarcode, barcodeDigits, type PressingDetail,
} from "@/lib/pressing";
import { BarcodeScanner } from "./barcode-scanner";
import { PressingViewer } from "./pressing-viewer";

type FilterKey = "format" | "released" | "country" | "label";
const FILTER_KEYS: { key: FilterKey; label: string; limit: number; order: "count" | "value" }[] = [
  { key: "format", label: "Format", limit: 24, order: "count" },
  { key: "released", label: "Year", limit: 60, order: "value" },
  { key: "country", label: "Country", limit: 30, order: "count" },
  { key: "label", label: "Label", limit: 30, order: "count" },
];

interface MasterHit { id: number; title: string; year?: string; thumb?: string }
interface Version {
  id: number; label: string; country: string; format: string; catno: string; released: string; thumb?: string; have?: number;
}
interface VersionsData {
  total: number; listed: number;
  available: Record<string, Record<string, number>>;
  versions: Version[];
}
interface BarcodeMaster extends MasterHit { releases: Version[] }
interface BarcodeResult { code: string; masters: BarcodeMaster[]; loose: (Version & { title: string })[] }
type AddState = "adding" | "added" | { already: number } | "error";

interface PressingFinderProps {
  /** Release ids already in the signed-in user's collection (as far as we loaded it). */
  ownedReleaseIds?: Set<number>;
}

const emptyFilters = (): Record<FilterKey, string[]> => ({ format: [], released: [], country: [], label: [] });

export function PressingFinder({ ownedReleaseIds }: PressingFinderProps) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<MasterHit[] | null>(null);
  const [searchNote, setSearchNote] = useState<string | null>(null);

  const [master, setMaster] = useState<MasterHit | null>(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [data, setData] = useState<VersionsData | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [details, setDetails] = useState<Map<number, PressingDetail>>(new Map());
  const [loadingDetails, setLoadingDetails] = useState<{ done: number; of: number } | null>(null);
  const cancelDetails = useRef(false);
  const [runout, setRunout] = useState("");

  const [guide, setGuide] = useState("");
  const [guideLoading, setGuideLoading] = useState(false);
  const guideAbort = useRef<AbortController | null>(null);

  const [adds, setAdds] = useState<Record<number, AddState>>({});
  const [openNotes, setOpenNotes] = useState<Set<number>>(new Set());

  const [scanning, setScanning] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState<BarcodeResult | null>(null);
  // While set, the list is exactly the releases carrying this barcode.
  const [barcode, setBarcode] = useState<{ code: string; versions: Version[] } | null>(null);
  const [ruledOut, setRuledOut] = useState<Set<number>>(new Set());
  const [viewer, setViewer] = useState<{ id: number; image?: number } | null>(null);

  /* ── 1. find the album ──────────────────────────────────────────────── */

  const search = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    if (looksLikeBarcode(q)) return lookupBarcode(q);
    setSearching(true);
    setSearchNote(null);
    try {
      const res = await fetch(`/api/pressings/search?q=${encodeURIComponent(q)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Search failed");
      setHits(body.results);
      if (body.note) setSearchNote(body.note);
      // A pasted link resolves to exactly one master — go straight in.
      if (body.results.length === 1 && /discogs\.com|^\d+$/.test(q)) pickMaster(body.results[0]);
    } catch (e) {
      setSearchNote(e instanceof Error ? e.message : "Search failed");
      setHits([]);
    } finally {
      setSearching(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const lookupBarcode = useCallback(async (raw: string) => {
    const code = barcodeDigits(raw);
    setScanning(false);
    setQuery(code);
    setSearching(true);
    setSearchNote(null);
    setHits(null);
    setBarcodeResult(null);
    try {
      const res = await fetch(`/api/pressings/barcode?code=${code}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Barcode lookup failed");
      const r = body as BarcodeResult;
      if (!r.masters.length && !r.loose.length) {
        setSearchNote(`No release on Discogs lists the barcode ${code}. Records from before the 1980s rarely had one — try the artist and album instead.`);
        setHits([]);
        return;
      }
      // One album: straight in, already narrowed to the releases with this code.
      if (r.masters.length === 1 && !r.loose.length) return pickMaster(r.masters[0], { code, versions: r.masters[0].releases });
      setBarcodeResult(r);
    } catch (e) {
      setSearchNote(e instanceof Error ? e.message : "Barcode lookup failed");
      setHits([]);
    } finally {
      setSearching(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickMaster = (m: MasterHit, bc: { code: string; versions: Version[] } | null = null) => {
    setMaster(m);
    setBarcode(bc);
    setBarcodeResult(null);
    setRuledOut(new Set());
    setFilters(emptyFilters());
    setRunout("");
    setGuide("");
    setHits(null);
  };

  // Picking an album makes the page long; bring the finder to the top of the
  // screen so the filters are under your thumb rather than below the shelf.
  // Done once the first versions are in — before that the page is too short to
  // scroll that far, and the scroll stops partway.
  const scrollOnLoad = useRef(false);
  useEffect(() => {
    if (master) scrollOnLoad.current = true;
  }, [master]);

  /* ── 2. narrow with facets ─────────────────────────────────────────── */

  useEffect(() => {
    // Barcode mode narrows its own short list in the browser (below).
    if (!master || barcode) return;
    const ctrl = new AbortController();
    const qs = new URLSearchParams({ master: String(master.id) });
    for (const { key } of FILTER_KEYS) for (const v of filters[key]) qs.append(key, v);
    setLoadingVersions(true);
    setError(null);
    fetch(`/api/pressings/versions?${qs}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Could not load versions");
        setData(body);
        if (scrollOnLoad.current) {
          scrollOnLoad.current = false;
          requestAnimationFrame(() =>
            document.getElementById("pressing-finder")?.scrollIntoView({ behavior: "smooth", block: "start" })
          );
        }
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setError(e instanceof Error ? e.message : "Could not load versions");
      })
      .finally(() => setLoadingVersions(false));
    return () => ctrl.abort();
  }, [master, filters, barcode]);

  const toggleFilter = (key: FilterKey, value: string) => {
    setGuide("");
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));
  };

  // Formats are ordered by what tells pressings apart, not by count — sorted by
  // count, "Mono" sat thirteenth behind "Album" and "CD".
  const FORMAT_FIRST = ["Vinyl", "LP", "Mono", "Stereo", '7"', '10"', '12"', "Test Pressing", "Promo", "Reissue", "Repress", "Misprint"];
  const rank = (v: string) => {
    const i = FORMAT_FIRST.indexOf(v);
    return i === -1 ? FORMAT_FIRST.length : i;
  };

  // With a barcode the list is short and already in hand, so the same chips are
  // worked out here instead of asking Discogs. Values within one kind AND
  // together, as Discogs' own filters do.
  const valuesOf = (v: Version, key: FilterKey): string[] =>
    key === "format" ? v.format.split(/,\s*/).filter(Boolean)
      : key === "released" ? [v.released?.slice(0, 4)].filter(Boolean)
        : key === "country" ? [v.country].filter(Boolean)
          : [v.label].filter(Boolean);
  const barcodeMatches = useMemo(() => {
    if (!barcode) return [];
    return barcode.versions.filter((v) =>
      FILTER_KEYS.every(({ key }) => filters[key].every((want) => valuesOf(v, key).includes(want)))
    );
  }, [barcode, filters]);
  const available = useMemo(() => {
    if (!barcode) return data?.available ?? {};
    const out: Record<string, Record<string, number>> = {};
    for (const { key } of FILTER_KEYS) {
      out[key] = {};
      for (const v of barcodeMatches) for (const val of valuesOf(v, key)) out[key][val] = (out[key][val] ?? 0) + 1;
    }
    return out;
  }, [barcode, barcodeMatches, data]);

  const facetValues = (key: FilterKey, limit: number, order: "count" | "value") => {
    const avail = Object.entries(available[key] ?? {});
    const chosen = filters[key];
    const rest = avail
      .filter(([v]) => !chosen.includes(v))
      .sort((a, b) =>
        order === "value"
          ? a[0].localeCompare(b[0])
          : key === "format"
            ? rank(a[0]) - rank(b[0]) || b[1] - a[1]
            : b[1] - a[1]
      )
      .slice(0, limit);
    return { chosen, rest };
  };

  /* ── 3. runouts ────────────────────────────────────────────────────── */

  const versions = useMemo(() => (barcode ? barcodeMatches : data?.versions ?? []), [barcode, barcodeMatches, data]);
  const missing = versions.filter((v) => !details.has(v.id));
  const canLoadDetails =
    versions.length > 0 && versions.length <= MAX_DETAILS && (!!barcode || data?.total === versions.length);
  const allLoaded = versions.length > 0 && missing.length === 0;

  const loadDetails = async () => {
    const ids = missing.map((v) => v.id);
    if (!ids.length) return;
    cancelDetails.current = false;
    setLoadingDetails({ done: 0, of: ids.length });
    for (let i = 0; i < ids.length && !cancelDetails.current; i += 6) {
      const batch = ids.slice(i, i + 6);
      try {
        const res = await fetch("/api/pressings/details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: batch }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        setDetails((prev) => {
          const next = new Map(prev);
          for (const d of body.details as PressingDetail[]) next.set(d.id, d);
          return next;
        });
      } catch {
        setError("Discogs stopped answering partway — try loading the rest again in a minute.");
        break;
      }
      setLoadingDetails({ done: Math.min(i + batch.length, ids.length), of: ids.length });
    }
    setLoadingDetails(null);
  };

  const shown = useMemo(() => {
    const standing = versions.filter((v) => !ruledOut.has(v.id));
    if (!runout.trim()) return standing;
    return standing.filter((v) => {
      const d = details.get(v.id);
      return d ? runoutMatches(d, runout) : false;
    });
  }, [versions, details, runout, ruledOut]);

  // The photo viewer loads a pressing's detail as you reach it, so it works on
  // lists too long to load up front. One request in flight per release.
  const inFlight = useRef(new Set<number>());
  const need = useCallback((ids: number[]) => {
    const todo = ids.filter((id) => !inFlight.current.has(id));
    if (!todo.length) return;
    todo.forEach((id) => inFlight.current.add(id));
    fetch("/api/pressings/details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: todo }),
    })
      .then((r) => r.json())
      .then((body) => {
        if (!Array.isArray(body.details)) return;
        setDetails((prev) => {
          const next = new Map(prev);
          for (const d of body.details as PressingDetail[]) next.set(d.id, d);
          return next;
        });
      })
      .catch(() => {})
      .finally(() => todo.forEach((id) => inFlight.current.delete(id)));
  }, []);

  const setOut = useCallback((id: number, out: boolean) => {
    setGuide("");
    setRuledOut((s) => {
      const n = new Set(s);
      if (out) n.add(id);
      else n.delete(id);
      return n;
    });
  }, []);

  /* ── 4. the guide ──────────────────────────────────────────────────── */

  const filterSummary = [
    ...FILTER_KEYS.flatMap(({ key, label }) => (filters[key].length ? [`${label}: ${filters[key].join(" + ")}`] : [])),
    ...(barcode ? [`Barcode ${barcode.code}`] : []),
    ...(runout.trim() ? [`Runout contains "${runout.trim()}"`] : []),
    ...(ruledOut.size ? [`${ruledOut.size} ruled out from photos`] : []),
  ].join("; ");

  const identify = async () => {
    const ids = shown.map((v) => v.id).slice(0, MAX_IDENTIFY);
    if (ids.length < 2) return;
    guideAbort.current?.abort();
    const ctrl = new AbortController();
    guideAbort.current = ctrl;
    setGuide("");
    setGuideLoading(true);
    try {
      const res = await fetch("/api/pressings/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, master: master?.title, filters: filterSummary }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || "The guide failed");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        setGuide(text);
      }
      if (!text.trim()) setGuide("_Claude returned nothing — try again._");
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setGuide(`_${e instanceof Error ? e.message : "The guide failed"}_`);
    } finally {
      setGuideLoading(false);
    }
  };

  /* ── add to collection ─────────────────────────────────────────────── */

  const add = async (releaseId: number, again = false) => {
    setAdds((a) => ({ ...a, [releaseId]: "adding" }));
    try {
      const res = await fetch("/api/pressings/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId, again }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) return setAdds((a) => ({ ...a, [releaseId]: { already: body.already } }));
      if (!res.ok) throw new Error(body.error);
      setAdds((a) => ({ ...a, [releaseId]: "added" }));
    } catch {
      setAdds((a) => ({ ...a, [releaseId]: "error" }));
    }
  };

  const owned = (id: number) => adds[id] === "added" || ownedReleaseIds?.has(id);

  const AddButton = ({ id, compact = false }: { id: number; compact?: boolean }) => {
    const st = adds[id];
    if (owned(id) && st !== "adding" && typeof st !== "object") {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-chart-4">
          <Check className="w-3.5 h-3.5" /> In your collection
        </span>
      );
    }
    if (st && typeof st === "object") {
      return (
        <Button size="sm" variant="outline" className="h-8" onClick={() => add(id, true)}>
          You have {st.already} — add another?
        </Button>
      );
    }
    return (
      <Button size="sm" className={compact ? "h-7 px-2.5 text-xs" : "h-8"} onClick={() => add(id)} disabled={st === "adding"}>
        {st === "adding" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        <span className="ml-1">{st === "error" ? "Retry" : "Add"}</span>
      </Button>
    );
  };

  /* ── render ────────────────────────────────────────────────────────── */

  if (!master) {
    return (
      <Card id="pressing-finder" className="scroll-mt-16">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-primary" />
            Which pressing is this?
          </CardTitle>
          <CardDescription>
            Scan the barcode or find the album, narrow every version Discogs knows about down to yours — by
            format, year, country, label, runout and photos — and add the exact one to your collection.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Album, barcode, or a Discogs link"
                enterKeyHint="search"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-full border border-input bg-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <Button type="submit" disabled={searching || !query.trim()} className="rounded-full shrink-0">
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Find"}
            </Button>
          </form>
          <Button variant="outline" className="w-full rounded-full" onClick={() => setScanning(true)}>
            <Camera className="w-4 h-4 mr-2" /> Scan a barcode
          </Button>
          {barcodeResult && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Barcode <span className="font-mono text-foreground">{barcodeResult.code}</span> is on releases of{" "}
                {barcodeResult.masters.length + barcodeResult.loose.length === 1 ? "this" : "these"}:
              </p>
              <ul className="divide-y rounded-lg border">
                {barcodeResult.masters.map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => pickMaster(m, { code: barcodeResult.code, versions: m.releases })}
                      className="w-full flex items-center gap-3 p-2.5 text-left hover:bg-accent"
                    >
                      <Cover src={m.thumb} size={44} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium truncate">{m.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {m.releases.length} {m.releases.length === 1 ? "pressing carries" : "pressings carry"} it
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {barcodeResult.loose.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 p-2.5">
                    <Cover src={r.thumb} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{r.title}</span>
                      <span className="block text-xs text-muted-foreground truncate">
                        {r.country || "—"} · {r.released || "?"} · {r.label} {r.catno} — the only version
                      </span>
                    </span>
                    <AddButton id={r.id} compact />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {searchNote && <p className="text-sm text-muted-foreground">{searchNote}</p>}
          {hits && hits.length === 0 && !searchNote && (
            <p className="text-sm text-muted-foreground">Nothing on Discogs by that name.</p>
          )}
          {scanning && <BarcodeScanner onCode={lookupBarcode} onClose={() => setScanning(false)} />}
          {hits && hits.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {hits.map((h) => (
                <li key={h.id}>
                  <button onClick={() => pickMaster(h)} className="w-full flex items-center gap-3 p-2.5 text-left hover:bg-accent">
                    <Cover src={h.thumb} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{h.title}</span>
                      <span className="block text-xs text-muted-foreground">{h.year || "—"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }

  const remaining = barcode || runout.trim() || ruledOut.size ? shown.length : data?.total ?? 0;
  const withPhotos = shown.filter((v) => (details.get(v.id)?.images.length ?? 1) > 0);

  return (
    <div id="pressing-finder" className="space-y-4 scroll-mt-16">
      {/* The album */}
      <Card>
        <CardContent className="p-3 sm:p-4 flex items-center gap-3">
          <Cover src={master.thumb} size={56} />
          <div className="min-w-0 flex-1">
            <div className="font-display text-lg font-semibold leading-tight line-clamp-2">{master.title}</div>
            <div className="text-sm text-muted-foreground">
              {loadingVersions && !data ? "Loading versions…" : (
                <>
                  <span className="font-semibold text-foreground tabular-nums">{remaining.toLocaleString()}</span>{" "}
                  {remaining === 1 ? "pressing" : "pressings"} {filterSummary ? "left" : "on Discogs"}
                  {loadingVersions && <Loader2 className="inline w-3.5 h-3.5 ml-1.5 animate-spin" />}
                </>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setMaster(null); setData(null); setGuide(""); setBarcode(null); setRuledOut(new Set()); }}>
            Change
          </Button>
        </CardContent>
      </Card>

      {/* Narrowed by barcode: the facets would only offer what the code already decided */}
      {barcode && (
        <Card>
          <CardContent className="p-3 sm:p-4 flex items-center gap-3">
            <Barcode className="w-5 h-5 text-primary shrink-0" />
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-medium">
                {barcode.versions.length} {barcode.versions.length === 1 ? "release has" : "releases have"} barcode{" "}
                <span className="font-mono">{barcode.code}</span>
              </div>
              <div className="text-muted-foreground text-xs">Only the releases that print this code. Narrow further below.</div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setBarcode(null); setFilters(emptyFilters()); setRuledOut(new Set()); setGuide(""); }}>
              All versions
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Facets */}
      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          {FILTER_KEYS.map(({ key, label, limit, order }) => {
            const { chosen, rest } = facetValues(key, limit, order);
            if (!chosen.length && !rest.length) return null;
            return (
              <div key={key}>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{label}</div>
                <div className="-mx-3 px-3 sm:-mx-4 sm:px-4 scroll-px-3 flex gap-1.5 overflow-x-auto no-scrollbar">
                  {chosen.map((v) => (
                    <button
                      key={v}
                      onClick={() => toggleFilter(key, v)}
                      className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium"
                    >
                      {v}
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ))}
                  {rest.map(([v, n]) => (
                    <button
                      key={v}
                      onClick={() => toggleFilter(key, v)}
                      className="shrink-0 rounded-full border bg-background px-3 py-1.5 text-sm hover:bg-accent"
                    >
                      {v} <span className="text-muted-foreground tabular-nums">{n}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {filterSummary && (
            <button className="text-sm text-primary font-medium" onClick={() => { setFilters(emptyFilters()); setRunout(""); setGuide(""); }}>
              Clear all filters
            </button>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="px-4 py-3 rounded-md border border-destructive/40 bg-destructive/10 text-sm text-destructive">{error}</div>
      )}

      {/* Runouts */}
      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex items-start gap-2">
            <ScanLine className="w-4 h-4 mt-0.5 text-primary shrink-0" />
            <div className="text-sm">
              <div className="font-medium">Match the runout</div>
              <div className="text-muted-foreground">
                The characters etched in the dead wax between the last track and the label.
              </div>
            </div>
          </div>
          {!allLoaded ? (
            canLoadDetails ? (
              loadingDetails ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Reading {loadingDetails.done} of {loadingDetails.of} pressings…</span>
                    <Button variant="ghost" size="sm" onClick={() => (cancelDetails.current = true)}>
                      <Square className="w-3 h-3 mr-1" /> Stop
                    </Button>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${(loadingDetails.done / loadingDetails.of) * 100}%` }} />
                  </div>
                </div>
              ) : (
                <Button onClick={loadDetails} className="w-full sm:w-auto">
                  Load runouts &amp; notes for {missing.length} {missing.length === 1 ? "pressing" : "pressings"}
                  <span className="ml-1.5 opacity-75">· ~{Math.max(1, Math.round(missing.length * 1.1))}s</span>
                </Button>
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                Narrow to {MAX_DETAILS} or fewer with the filters above, then load their runouts — Discogs allows
                about one pressing a second.
              </p>
            )
          ) : (
            <input
              value={runout}
              onChange={(e) => { setRunout(e.target.value); setGuide(""); }}
              placeholder="e.g. XEX 709-1   (spacing and dashes don't matter)"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="w-full px-3 py-2 text-sm font-mono rounded-md border border-input bg-background placeholder:font-sans placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          )}
        </CardContent>
      </Card>

      {/* Tell them apart */}
      {allLoaded && shown.length >= 2 && (
        <Card className="border-primary/30">
          <CardContent className="p-3 sm:p-4 space-y-3">
            {!guide && !guideLoading && (
              <Button onClick={identify} className="w-full">
                <Sparkles className="w-4 h-4 mr-2" />
                How do I tell {shown.length > MAX_IDENTIFY ? `the first ${MAX_IDENTIFY}` : `these ${shown.length}`} apart?
              </Button>
            )}
            {(guide || guideLoading) && (
              <>
                <div className="flex items-center justify-between">
                  <div className="font-display text-lg font-semibold flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" /> Identification guide
                  </div>
                  {guideLoading ? (
                    <Button variant="ghost" size="sm" onClick={() => guideAbort.current?.abort()}>
                      <Square className="w-3 h-3 mr-1" /> Stop
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={identify}>Again</Button>
                  )}
                </div>
                {guideLoading && !guide && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Reading every runout and note…
                  </p>
                )}
                <div className="md-guide text-sm">
                  <ReactMarkdown
                    components={{
                      // [UK 1st](#r-123) → a chip that adds that pressing.
                      a: ({ href, children }) => {
                        const m = href?.match(/^#r-(\d+)$/);
                        if (!m) return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
                        const id = Number(m[1]);
                        return (
                          <span className="inline-flex items-center gap-1.5 align-baseline">
                            <button
                              className="font-medium text-primary underline decoration-primary/30 underline-offset-2"
                              onClick={() => document.getElementById(`pressing-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                            >
                              {children}
                            </button>
                            <AddButton id={id} compact />
                          </span>
                        );
                      },
                    }}
                  >
                    {guide}
                  </ReactMarkdown>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Look, don't read: every photo of what is left, one swipe apart */}
      {shown.length > 0 && (
        <Button variant="outline" className="w-full" onClick={() => setViewer({ id: withPhotos[0]?.id ?? shown[0].id })}>
          <Images className="w-4 h-4 mr-2" />
          Flick through the photos of {shown.length === 1 ? "this pressing" : `these ${shown.length}`}
        </Button>
      )}
      {ruledOut.size > 0 && (
        <p className="text-sm text-muted-foreground px-1 flex items-center gap-2">
          <Ban className="w-3.5 h-3.5" />
          {ruledOut.size} ruled out by eye
          <button className="text-primary font-medium" onClick={() => { setRuledOut(new Set()); setGuide(""); }}>
            Bring them back
          </button>
        </p>
      )}
      {viewer && (
        <PressingViewer
          pressings={shown}
          start={viewer}
          details={details}
          need={need}
          ruledOut={ruledOut}
          onRuleOut={setOut}
          renderAdd={(id) => <AddButton id={id} />}
          onClose={() => setViewer(null)}
        />
      )}

      {/* The pressings */}
      <div className="space-y-2">
        {!barcode && data && data.total > versions.length && (
          <p className="text-xs text-muted-foreground px-1">
            Showing {versions.length} of {data.total.toLocaleString()} — the filters above narrow it.
          </p>
        )}
        {runout.trim() && shown.length === 0 && (
          <p className="text-sm text-muted-foreground px-1">
            No pressing here has a runout containing “{runout.trim()}”. Try fewer characters, or clear a filter —
            not every Discogs page lists its runouts.
          </p>
        )}
        {shown.map((v) => {
          const d = details.get(v.id);
          const q = normalizeRunout(runout);
          const notesOpen = openNotes.has(v.id);
          return (
            <Card key={v.id} id={`pressing-${v.id}`} className="scroll-mt-20">
              <CardContent className="p-3 sm:p-4">
                <div className="flex gap-3">
                  <Cover src={d?.thumb || v.thumb} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-snug">
                      {v.country || "—"} · {v.released || "?"} · {v.label}{" "}
                      <span className="text-muted-foreground font-normal">{v.catno}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{d?.formats.join(" + ") || v.format}</div>
                    {typeof v.have === "number" && (
                      <div className="text-xs text-muted-foreground mt-0.5">{v.have.toLocaleString()} collectors have this</div>
                    )}
                  </div>
                </div>

                {d && d.images.length > 0 && (
                  <div className="mt-2.5 -mx-3 px-3 sm:-mx-4 sm:px-4 flex gap-1.5 overflow-x-auto no-scrollbar">
                    {d.images.map((im, i) => (
                      <button
                        key={im.thumb + i}
                        onClick={() => setViewer({ id: v.id, image: i })}
                        className="shrink-0 w-16 h-16 rounded overflow-hidden bg-muted ring-1 ring-black/5"
                        aria-label={`Photo ${i + 1}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={im.thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}

                {d && d.runouts.length > 0 && (
                  <div className="mt-2.5 rounded-md bg-muted/60 px-2.5 py-2 font-mono text-xs space-y-0.5">
                    {d.runouts.map((r, i) => {
                      const hit = q && normalizeRunout(r.value).includes(q);
                      return (
                        <div key={i} className={hit ? "text-primary font-semibold" : ""}>
                          {r.side && <span className="text-muted-foreground font-sans">{r.side}: </span>}
                          {r.value}
                        </div>
                      );
                    })}
                  </div>
                )}
                {d && d.runouts.length === 0 && (
                  <div className="mt-2 text-xs text-muted-foreground italic">No runouts recorded on Discogs.</div>
                )}

                {d?.notes && (
                  <div className="mt-2">
                    <button
                      className="text-xs text-muted-foreground inline-flex items-center gap-1"
                      onClick={() => setOpenNotes((s) => { const n = new Set(s); n.has(v.id) ? n.delete(v.id) : n.add(v.id); return n; })}
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${notesOpen ? "rotate-180" : ""}`} />
                      Collector notes
                    </button>
                    {notesOpen && <p className="mt-1 text-xs whitespace-pre-line text-muted-foreground">{d.notes}</p>}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between gap-2">
                  <a
                    href={`https://www.discogs.com/release/${v.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Discogs <ExternalLink className="w-3 h-3" />
                  </a>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" onClick={() => setOut(v.id, true)}>
                      Not this one
                    </Button>
                    <AddButton id={v.id} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Cover({ src, size }: { src?: string; size: number }) {
  return (
    <div className="relative shrink-0 rounded-md overflow-hidden bg-muted ring-1 ring-black/5" style={{ width: size, height: size }}>
      {src ? (
        <Image src={src} alt="" fill sizes={`${size}px`} className="object-cover" unoptimized />
      ) : (
        <Disc3 className="w-1/2 h-1/2 text-muted-foreground absolute inset-0 m-auto" />
      )}
    </div>
  );
}
