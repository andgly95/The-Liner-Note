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
  Send,
  Undo2,
  History,
} from "lucide-react";
import {
  MAX_DETAILS, MAX_IDENTIFY, normalizeRunout, runoutMatches, looksLikeBarcode, barcodeDigits, isFormatChip, type PressingDetail,
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
  total: number; listed: number; formatExact?: boolean;
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

type Turn =
  | { role: "assistant"; content: string; ruled?: number[]; undone?: boolean; failed?: boolean }
  | { role: "user"; content: string; standing: number[] };

// Where you are in the finder, kept on this device so closing the app (or
// switching tabs, which unmounts this) doesn't lose the album, the narrowing,
// the loaded runouts or the conversation with the guide.
export const FINDER_SAVE_KEY = "ln-pressing-finder";
const SAVE_VERSION = 1;
const SAVE_MAX_AGE = 30 * 24 * 3600 * 1000;
interface Saved {
  v: number;
  at: number;
  query: string;
  master: MasterHit | null;
  filters: Record<FilterKey, string[]>;
  barcode: { code: string; versions: Version[] } | null;
  data: VersionsData | null;
  details: PressingDetail[];
  runout: string;
  ruledOut: number[];
  thread: Turn[];
  guideCtx: { ids: number[]; filters: string } | null;
  reply: string;
  adds: Record<number, AddState>;
  /** A guide reply was still arriving when this was saved. */
  streaming: boolean;
}

function readSaved(): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(FINDER_SAVE_KEY) || "null") as Saved | null;
    if (!s || s.v !== SAVE_VERSION || Date.now() - s.at > SAVE_MAX_AGE) return null;
    return s;
  } catch {
    return null;
  }
}

function writeSaved(s: Saved) {
  try {
    localStorage.setItem(FINDER_SAVE_KEY, JSON.stringify(s));
  } catch {
    // Full: the runouts can be loaded again; everything else is small.
    try { localStorage.setItem(FINDER_SAVE_KEY, JSON.stringify({ ...s, details: [] })); } catch {}
  }
}

/** The release ids on a reply's closing <ruled-out>…</ruled-out> line. */
function parseRuledOut(text: string): number[] {
  const m = text.match(/<ruled-out>([\s\S]*?)<\/ruled-out>/);
  return m ? (m[1].match(/\d+/g) ?? []).map(Number) : [];
}

function sinceText(at: number): string {
  const min = Math.round((Date.now() - at) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/** The reply as shown: without the machine line, even half-streamed. */
function visibleGuide(text: string): string {
  return text.replace(/<ruled-out>[\s\S]*?(<\/ruled-out>|$)/, "").replace(/<[a-z-]*$/, "").trimEnd();
}

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

  // The guide is a conversation: Claude's guide, then what the person sees on
  // their copy and Claude's replies, each of which may rule pressings out.
  const [thread, setThread] = useState<Turn[]>([]);
  // What the guide was written about — fixed for the whole conversation.
  const [guideCtx, setGuideCtx] = useState<{ ids: number[]; filters: string } | null>(null);
  const [guideLoading, setGuideLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [guideError, setGuideError] = useState<string | null>(null);
  const guideAbort = useRef<AbortController | null>(null);
  const resetGuide = useCallback(() => {
    guideAbort.current?.abort();
    guideAbort.current = null; // so the aborted stream knows it was superseded
    setGuideLoading(false);
    setGuideError(null);
    setThread([]);
    setGuideCtx(null);
    setReply("");
  }, []);

  const [adds, setAdds] = useState<Record<number, AddState>>({});
  const [openNotes, setOpenNotes] = useState<Set<number>>(new Set());

  const [scanning, setScanning] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState<BarcodeResult | null>(null);
  // While set, the list is exactly the releases carrying this barcode.
  const [barcode, setBarcode] = useState<{ code: string; versions: Version[] } | null>(null);
  const [ruledOut, setRuledOut] = useState<Set<number>>(new Set());
  const [viewer, setViewer] = useState<{ id: number; image?: number } | null>(null);

  /* ── 0. pick up where you left off ─────────────────────────────────── */

  const [restored, setRestored] = useState(false);
  const [resumedAt, setResumedAt] = useState<number | null>(null);
  const skipScroll = useRef(false);
  useEffect(() => {
    const s = readSaved();
    if (s) {
      let thread = s.thread;
      let reply = s.reply;
      // Closed while a reply was arriving: that reply is lost. Put the
      // question back in the box (or drop a half-written first guide).
      if (s.streaming && thread[thread.length - 1]?.role === "assistant") {
        thread = thread.slice(0, -1);
        const asked = thread[thread.length - 1];
        if (asked?.role === "user") {
          thread = thread.slice(0, -1);
          reply = reply || asked.content;
        }
      }
      skipScroll.current = true;
      setQuery(s.query);
      setMaster(s.master);
      setFilters(s.filters);
      setBarcode(s.barcode);
      setData(s.data);
      setDetails(new Map(s.details.map((d) => [d.id, d])));
      setRunout(s.runout);
      setRuledOut(new Set(s.ruledOut));
      setThread(thread);
      setGuideCtx(thread.length ? s.guideCtx : null);
      setReply(reply);
      setAdds(Object.fromEntries(Object.entries(s.adds).filter(([, a]) => a !== "adding")));
      if (s.master) setResumedAt(s.at);
    }
    setRestored(true);
  }, []);

  // The latest state, ready to write: debounced while it changes, and at once
  // when the app goes to the background (a phone may kill it after that).
  const snapshot = useRef<Saved | null>(null);
  useEffect(() => {
    if (!restored) return;
    const keep = new Set((barcode?.versions ?? data?.versions ?? []).map((v) => v.id));
    snapshot.current = {
      v: SAVE_VERSION,
      at: Date.now(),
      query,
      master,
      filters,
      barcode,
      data,
      details: Array.from(details.values()).filter((d) => keep.has(d.id)),
      runout,
      ruledOut: Array.from(ruledOut),
      thread,
      guideCtx,
      reply,
      adds,
      streaming: guideLoading,
    };
    const t = setTimeout(() => snapshot.current && writeSaved(snapshot.current), 500);
    return () => clearTimeout(t);
  }, [restored, query, master, filters, barcode, data, details, runout, ruledOut, thread, guideCtx, reply, adds, guideLoading]);
  useEffect(() => {
    const flush = () => { if (snapshot.current) writeSaved(snapshot.current); };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      flush(); // switching dashboard tab unmounts the finder
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

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
        setSearchNote(`No vinyl release on Discogs lists the barcode ${code}. Records from before the 1980s rarely had one — try the artist and album instead.`);
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
    resetGuide();
    setHits(null);
  };

  // Picking an album makes the page long; bring the finder to the top of the
  // screen so the filters are under your thumb rather than below the shelf.
  // Done once the first versions are in — before that the page is too short to
  // scroll that far, and the scroll stops partway.
  const scrollOnLoad = useRef(false);
  useEffect(() => {
    // A restored album is not a fresh pick: don't yank the page down to it.
    if (skipScroll.current) { skipScroll.current = false; return; }
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
    resetGuide();
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));
  };

  // Formats are ordered by what tells pressings apart, not by count — sorted by
  // count, "Mono" sat thirteenth behind "Album" and "CD".
  const FORMAT_FIRST = ["LP", "Mono", "Stereo", '7"', '10"', '12"', "Test Pressing", "Promo", "Reissue", "Repress", "Misprint"];
  const rank = (v: string) => {
    const i = FORMAT_FIRST.indexOf(v);
    return i === -1 ? FORMAT_FIRST.length : i;
  };

  // With a barcode the list is short and already in hand, so the same chips are
  // worked out here instead of asking Discogs. Values within one kind AND
  // together, as Discogs' own filters do.
  const valuesOf = (v: Version, key: FilterKey): string[] =>
    key === "format" ? v.format.split(/,\s*/).filter((x) => x && isFormatChip(x))
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
    // A format every remaining pressing has ("LP 12" of 12) can't narrow anything.
    const all = barcode ? versions.length : data?.formatExact ? data.total : Infinity;
    const rest = avail
      .filter(([v, n]) => !chosen.includes(v) && !(key === "format" && n >= all))
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

  // Ruling out by eye keeps the conversation: the next reply tells Claude
  // what is still standing.
  const setOut = useCallback((id: number, out: boolean) => {
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

  const talk = async (history: Turn[], ctx: { ids: number[]; filters: string }) => {
    guideAbort.current?.abort();
    const ctrl = new AbortController();
    guideAbort.current = ctrl;
    const asked = history[history.length - 1];
    const standing = asked?.role === "user" ? asked.standing : ctx.ids;
    const put = (content: string, extra: Partial<Extract<Turn, { role: "assistant" }>> = {}) =>
      setThread([...history, { role: "assistant", content, ...extra }]);
    put("");
    setGuideLoading(true);
    let text = "";
    try {
      const res = await fetch("/api/pressings/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: ctx.ids,
          master: master?.title,
          filters: ctx.filters,
          history: history.length ? history.map((t) => (t.role === "user" ? { role: t.role, content: t.content, standing: t.standing } : { role: t.role, content: t.content })) : undefined,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || "The guide failed");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        put(text);
      }
      if (!text.trim()) throw new Error("Claude returned nothing — try again.");
      // Apply what the reply rules out — only pressings that were standing,
      // and never all of them (the prompt forbids it; this enforces it).
      if (history.length) {
        const ruled = parseRuledOut(text).filter((id) => standing.includes(id));
        if (ruled.length && ruled.length < standing.length) {
          setRuledOut((s) => { const n = new Set(s); ruled.forEach((id) => n.add(id)); return n; });
          put(text, { ruled });
        }
      }
    } catch (e) {
      if (guideAbort.current !== ctrl) return; // reset or replaced: leave the new state alone
      const aborted = (e as Error)?.name === "AbortError";
      if (aborted && text.trim()) return; // stopped partway: keep what came
      if (history.length) {
        // A failed follow-up: take the question back into the box to resend.
        setThread(history.slice(0, -1));
        if (asked?.role === "user") setReply(asked.content);
        if (!aborted) setGuideError(e instanceof Error ? e.message : "The guide failed");
      } else if (aborted) {
        setThread([]);
      } else {
        put(`_${e instanceof Error ? e.message : "The guide failed"}_`, { failed: true });
      }
    } finally {
      if (guideAbort.current === ctrl) setGuideLoading(false);
    }
  };
  const identify = () => {
    const ctx = { ids: shown.map((v) => v.id).slice(0, MAX_IDENTIFY), filters: filterSummary };
    if (ctx.ids.length < 2) return;
    setGuideCtx(ctx);
    setReply("");
    setGuideError(null);
    talk([], ctx);
  };

  const sendReply = () => {
    const said = reply.trim();
    if (!said || !guideCtx || guideLoading) return;
    const standing = shown.map((v) => v.id).filter((id) => guideCtx.ids.includes(id));
    setReply("");
    setGuideError(null);
    talk([...thread, { role: "user", content: said, standing }], guideCtx);
  };

  const undoRuling = (i: number) => {
    const t = thread[i];
    if (t.role !== "assistant" || !t.ruled) return;
    setRuledOut((s) => { const n = new Set(s); t.ruled!.forEach((id) => n.delete(id)); return n; });
    setThread((th) => th.map((x, j) => (j === i ? { ...x, undone: true } : x)));
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

  // [UK 1st](#r-123) → a chip that scrolls to that pressing, with Add.
  const guideMarkdown = {
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
      const m = href?.match(/^#r-(\d+)$/);
      if (!m) return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
      const id = Number(m[1]);
      const out = ruledOut.has(id);
      return (
        <span className="inline-flex items-center gap-1.5 align-baseline">
          <button
            className={`font-medium underline underline-offset-2 ${out ? "text-muted-foreground line-through decoration-muted-foreground/50" : "text-primary decoration-primary/30"}`}
            onClick={() => document.getElementById(`pressing-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
          >
            {children}
          </button>
          {!out && <AddButton id={id} compact />}
        </span>
      );
    },
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
          <Button variant="ghost" size="sm" onClick={() => { setMaster(null); setData(null); resetGuide(); setBarcode(null); setRuledOut(new Set()); setRunout(""); setFilters(emptyFilters()); setResumedAt(null); }}>
            Change
          </Button>
        </CardContent>
      </Card>
      {resumedAt && (
        <p className="text-xs text-muted-foreground px-1 -mt-1 flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" /> Picked up where you left off · {sinceText(resumedAt)}
          <button className="ml-auto text-primary font-medium" onClick={() => setResumedAt(null)}>OK</button>
        </p>
      )}

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
            <Button variant="ghost" size="sm" onClick={() => { setBarcode(null); setFilters(emptyFilters()); setRuledOut(new Set()); resetGuide(); }}>
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
                <div className="flex items-center justify-between mb-1.5">
                  <span className="section-label">
                    {label}
                    {key === "format" && filters.format.length > 1 && (
                      <span className="font-normal"> · all of these</span>
                    )}
                  </span>
                </div>
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
                      {v}
                      {/* Format counts come from the listed versions; past 300 they'd be a sample, so none. */}
                      {(key !== "format" || barcode || data?.formatExact) && (
                        <span className="text-muted-foreground tabular-nums"> {n}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {filterSummary && (
            <button className="text-sm text-primary font-medium" onClick={() => { setFilters(emptyFilters()); setRunout(""); resetGuide(); }}>
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
              onChange={(e) => { setRunout(e.target.value); resetGuide(); }}
              placeholder="e.g. XEX 709-1   (spacing and dashes don't matter)"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="w-full px-3 py-2 text-sm font-mono rounded-md border border-input bg-background placeholder:font-sans placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          )}
        </CardContent>
      </Card>

      {/* Tell them apart — and then talk it through */}
      {allLoaded && (shown.length >= 2 || thread.length > 0) && (
        <Card className="border-primary/30">
          <CardContent className="p-3 sm:p-4 space-y-3">
            {thread.length === 0 && (
              <Button onClick={identify} className="w-full">
                <Sparkles className="w-4 h-4 mr-2" />
                How do I tell {shown.length > MAX_IDENTIFY ? `the first ${MAX_IDENTIFY}` : `these ${shown.length}`} apart?
              </Button>
            )}
            {thread.length > 0 && (
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
                    <Button variant="ghost" size="sm" onClick={identify} disabled={shown.length < 2}>Start over</Button>
                  )}
                </div>
                {thread.map((t, i) =>
                  t.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3.5 py-2 text-sm whitespace-pre-wrap">{t.content}</p>
                    </div>
                  ) : (
                    <div key={i} className={i > 0 ? "border-l-2 border-primary/30 pl-3" : ""}>
                      {guideLoading && i === thread.length - 1 && !visibleGuide(t.content) && (
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> {i === 0 ? "Reading every runout and note…" : "Checking that against every pressing…"}
                        </p>
                      )}
                      <div className="md-guide text-sm">
                        <ReactMarkdown components={guideMarkdown}>{visibleGuide(t.content)}</ReactMarkdown>
                      </div>
                      {t.ruled && (
                        <p className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
                          <Ban className="w-3.5 h-3.5" />
                          {t.undone ? `Brought back ${t.ruled.length}` : `Ruled out ${t.ruled.length}`}
                          {!t.undone && (
                            <button className="text-primary font-medium inline-flex items-center gap-1" onClick={() => undoRuling(i)}>
                              <Undo2 className="w-3 h-3" /> Undo
                            </button>
                          )}
                        </p>
                      )}
                    </div>
                  )
                )}
                {guideError && <p className="text-sm text-destructive">{guideError}</p>}
                {!(thread[0]?.role === "assistant" && thread[0].failed) && (
                  <form
                    className="space-y-1.5 pt-1"
                    onSubmit={(e) => { e.preventDefault(); sendReply(); }}
                  >
                    <label htmlFor="guide-reply" className="text-xs font-medium text-muted-foreground">
                      {shown.length === 1 ? "One left. Anything that doesn't match?" : "What do you see on your copy?"}
                    </label>
                    <div className="flex gap-2 items-end">
                      <textarea
                        id="guide-reply"
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); sendReply(); }
                        }}
                        rows={1}
                        maxLength={1000}
                        placeholder="e.g. red labels · sans serif on both sides · KT embossed near the spindle hole"
                        className="flex-1 min-h-[2.5rem] max-h-32 resize-none px-3 py-2 text-sm rounded-md border border-input bg-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <Button type="submit" size="icon" disabled={!reply.trim() || guideLoading} aria-label="Send">
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </form>
                )}
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
          <button className="text-primary font-medium" onClick={() => { setRuledOut(new Set()); setThread((t) => t.map((x) => (x.role === "assistant" && x.ruled ? { ...x, undone: true } : x))); }}>
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
