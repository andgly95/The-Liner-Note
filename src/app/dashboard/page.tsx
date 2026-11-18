"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Shell } from "@/components/social/shell";
import {
  Disc3,
  Flame,
  Search,
  Sparkles,
  Store,
  RefreshCw,
  Loader2,
  Headphones,
  Telescope,
  Library,
  ListMusic,
  BookOpen,
  ScanLine,
} from "lucide-react";
import { RoastDisplay } from "@/components/features/roast-display";
import { GapFillerDisplay } from "@/components/features/gap-filler-display";
import { OracleDisplay } from "@/components/features/oracle-display";
import { RecordShopChat } from "@/components/features/record-shop-chat";
import { MoodDisplay } from "@/components/features/mood-display";
import { ObscurenessDisplay } from "@/components/features/obscureness-display";
import { CollectionBrowser } from "@/components/features/collection-browser";
import { MixtapeDisplay } from "@/components/features/mixtape-display";
import { GuideDisplay } from "@/components/features/guide-display";
import { PressingFinder } from "@/components/features/pressing-finder";
import { UserSwitcher } from "@/components/features/user-switcher";
import { CollectionStats } from "@/components/features/collection-stats";
import { ShareCollectionButton } from "@/components/social/share-collection";
import type { CompressedCollection, DiscogsCollectionItem } from "@/types/discogs";
import type { GapFillerResult } from "@/types/analysis";

interface User {
  id: number;
  username: string;
  avatar_url?: string;
}

interface CollectionData {
  username: string;
  totalItems: number;
  optimized: CompressedCollection;
  collectionString: string;
  raw?: DiscogsCollectionItem[];
  /** Original release year by Discogs master id (what the server knows). */
  years?: Record<number, number>;
  /** Your own collection's masters still being looked up. */
  yearsPending?: number;
  /** When this copy was read from Discogs. */
  syncedAt?: number;
}

/** "just now", "2 min ago", "3 h ago", "Nov 12". */
function syncedAgo(t: number, now = Date.now()) {
  const m = Math.floor((now - t) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface WantlistData {
  username: string;
  totalItems: number;
  wantlistString: string;
}

const ACTIVE_TAB_STORAGE_KEY = "linernote-section";

// One row of sections, at every width, and each one IS the page below it.
// It used to be a bar of six tools under a stats block that never changed, so
// tapping a tab seemed to do nothing to the top half — and on a phone that bar
// replaced the app's own Home / Collection / You, which read as two sets of tabs.
const SECTIONS = [
  { value: "overview", label: "Overview", icon: Disc3 },
  { value: "pressings", label: "Pressings", icon: ScanLine },
  { value: "browse", label: "Browse", icon: Library },
  { value: "shop", label: "Shop", icon: Store },
  { value: "mixtape", label: "Mixtape", icon: ListMusic },
  { value: "guides", label: "Guides", icon: BookOpen },
  // The analyses — read your collection back to you.
  { value: "roast", label: "Roast", icon: Flame, analysis: true },
  { value: "gap_filler", label: "Gap filler", icon: Search, analysis: true },
  { value: "oracle", label: "Oracle", icon: Sparkles, analysis: true },
  { value: "mood", label: "Mood", icon: Headphones, analysis: true },
  { value: "obscureness", label: "Obscure", icon: Telescope, analysis: true },
] as const;
const VALID_TABS = new Set<string>(SECTIONS.map((x) => x.value));

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [collection, setCollection] = useState<CollectionData | null>(null);
  const [wantlist, setWantlist] = useState<WantlistData | null>(null);
  const [fetchingCollection, setFetchingCollection] = useState(false);
  const [fetchingWantlist, setFetchingWantlist] = useState(false);
  const [gapFillerResults, setGapFillerResults] = useState<GapFillerResult | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [viewingUser, setViewingUser] = useState<string | null>(null);
  const [needsDiscogs, setNeedsDiscogs] = useState(false);

  // Restore last-used tab from localStorage so refresh doesn't drop the user back to Roast.
  useEffect(() => {
    // ?section=pressings (the home-screen shortcut) wins over the saved one.
    const asked = new URLSearchParams(window.location.search).get("section");
    if (asked && VALID_TABS.has(asked)) {
      setActiveTab(asked);
      try { localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, asked); } catch {}
      return;
    }
    try {
      const saved = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
      if (saved && VALID_TABS.has(saved)) setActiveTab(saved);
    } catch {
      // localStorage unavailable — ignore
    }
  }, []);

  const stripRef = useRef<HTMLDivElement>(null);
  // The strip's height, for whatever sticks under it (Browse's toolbar).
  const stripWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stripWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const set = () => document.documentElement.style.setProperty("--section-strip", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isLoading, needsDiscogs, user]);

  const handleTabChange = useCallback((next: string) => {
    setActiveTab(next);
    // A new section is a new page: start it at the top.
    window.scrollTo({ top: 0 });
    try {
      localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/session");
        const data = await res.json();
        if (!data.authenticated) {
          // Signed in to The Liner Note but no record collection linked: offer
          // to link one rather than bouncing back to the start.
          setNeedsDiscogs(true);
          return;
        }
        setUser(data.user);
      } catch {
        router.push("/");
      } finally {
        setIsLoading(false);
      }
    }
    checkAuth();
  }, [router]);

  // Your own collection opens from the server's copy at once and syncs with
  // Discogs behind it; only the very first load (no copy yet) waits, showing
  // placeholders and page progress. A friend's is always read live.
  const collSeq = useRef(0); // a newer request (switching collections) wins
  const [syncing, setSyncing] = useState(false);
  const [loadProgress, setLoadProgress] = useState<{ current: number; total: number } | null>(null);
  const fetchCollection = useCallback(async (username?: string | null, opts: { background?: boolean } = {}) => {
    const n = ++collSeq.current;
    const current = () => n === collSeq.current;
    const live = async (): Promise<CollectionData> => {
      const url = username ? `/api/collection?username=${encodeURIComponent(username)}` : "/api/collection";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 403 ? "Collection is private" : "Failed to fetch collection");
      return res.json();
    };
    const syncBehind = async () => {
      setSyncing(true);
      try {
        const data = await live();
        if (current()) setCollection(data);
      } catch (error) {
        console.error("Collection sync failed:", error); // keep showing the copy
      } finally {
        if (current()) setSyncing(false);
      }
    };

    if (!username && opts.background) return syncBehind();
    if (!username) {
      try {
        const res = await fetch("/api/collection?cached=1", { cache: "no-store" });
        if (res.ok) {
          const copy = await res.json();
          if (!current()) return;
          setCollection(copy);
          return syncBehind();
        }
      } catch {}
    }

    setFetchingCollection(true);
    const poll = !username
      ? setInterval(async () => {
          try {
            const p = await (await fetch("/api/collection/progress", { cache: "no-store" })).json();
            if (current()) setLoadProgress(p.total ? p : null);
          } catch {}
        }, 800)
      : undefined;
    try {
      const data = await live();
      if (current()) setCollection(data);
    } catch (error) {
      console.error("Error fetching collection:", error);
      if (current()) setCollection(null);
    } finally {
      clearInterval(poll);
      if (current()) {
        setFetchingCollection(false);
        setLoadProgress(null);
      }
    }
  }, []);

  // Back in the app after a while: sync your collection behind what's shown.
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState !== "visible" || viewingUser || syncing || fetchingCollection) return;
      if (collection?.syncedAt && Date.now() - collection.syncedAt > 10 * 60_000) fetchCollection(null, { background: true });
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [collection?.syncedAt, viewingUser, syncing, fetchingCollection, fetchCollection]);

  // "synced 2 min ago" keeps counting.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // The server fetches original years for your own collection after it loads
  // (about a second each, first time only): pick them up as they arrive.
  useEffect(() => {
    if (!collection?.yearsPending || viewingUser) return;
    let last = collection.yearsPending;
    let stalls = 0;
    const t = setInterval(async () => {
      try {
        const r = await fetch("/api/collection/years", { cache: "no-store" });
        if (!r.ok) return;
        const b: { years: Record<number, number>; pending: number } = await r.json();
        setCollection((c) => (c ? { ...c, years: b.years, yearsPending: b.pending } : c));
        stalls = b.pending < last ? 0 : stalls + 1;
        last = b.pending;
        if (b.pending === 0 || stalls >= 6) clearInterval(t);
      } catch {}
    }, 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when a new collection arrives
  }, [collection?.username, viewingUser, !!collection?.yearsPending]);

  const fetchWantlist = useCallback(async (username?: string | null) => {
    setFetchingWantlist(true);
    try {
      const url = username ? `/api/wantlist?username=${encodeURIComponent(username)}` : "/api/wantlist";
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 403) throw new Error("Wantlist is private");
        throw new Error("Failed to fetch wantlist");
      }
      const data = await res.json();
      setWantlist(data);
    } catch (error) {
      console.error("Error fetching wantlist:", error);
      setWantlist(null);
    } finally {
      setFetchingWantlist(false);
    }
  }, []);

  useEffect(() => {
    if (user && !collection && !viewingUser) {
      fetchCollection();
      fetchWantlist();
    }
  }, [user, collection, viewingUser, fetchCollection, fetchWantlist]);

  const handleUserSelect = useCallback((username: string | null) => {
    setViewingUser(username);
    setCollection(null);
    setWantlist(null);
    setGapFillerResults(null);
    // Fetch the selected user's data
    fetchCollection(username);
    fetchWantlist(username);
  }, [fetchCollection, fetchWantlist]);

  // Keep the chosen section in view in the strip when it scrolls sideways.
  useEffect(() => {
    stripRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTab, isLoading]);

  if (isLoading) {
    return (
      <Shell wide>
        <div className="flex items-center justify-center py-24">
          <div className="vinyl-record w-16 h-16 animate-spin-slow" />
        </div>
      </Shell>
    );
  }

  if (needsDiscogs) {
    return (
      <Shell wide>
        <div className="flex items-center justify-center py-10">
          <div className="max-w-sm w-full rounded-2xl border bg-card p-6 text-center space-y-4">
            <div className="vinyl-record w-14 h-14 mx-auto" />
            <h1 className="font-display text-2xl font-semibold">Your record collection</h1>
            <p className="text-sm text-muted-foreground">
              Link Discogs to bring in your collection and wantlist, find exactly which pressing you own, and use the
              collection tools. We only ever write to Discogs when you add a record yourself.
            </p>
            <Button asChild className="w-full rounded-full"><a href="/api/auth/discogs">Link Discogs</a></Button>
            <Button asChild variant="ghost" className="w-full rounded-full"><Link href="/home">Back to Home</Link></Button>
          </div>
        </div>
      </Shell>
    );
  }

  if (!user) return null;

  const busy = fetchingCollection || fetchingWantlist;
  const refreshAll = () => {
    // Yours: sync behind what's shown. A friend's: read again.
    fetchCollection(viewingUser, { background: !viewingUser && !!collection });
    fetchWantlist(viewingUser);
  };
  const recent = collection?.raw?.slice(0, 20) ?? [];
  // Only YOUR collection says what you own — not a friend's you are browsing.
  const ownedReleaseIds = !viewingUser && collection?.raw
    ? new Set(collection.raw.map((it) => it.basic_information.id))
    : undefined;
  const collectionString = collection?.collectionString || "";

  return (
    <Shell wide>
      {/* Sections — sticky under the header, swiped sideways on a phone */}
      <div
        ref={stripWrapRef}
        style={{ top: "calc(3.5rem + env(safe-area-inset-top, 0px))" }}
        className="sticky z-20 -mx-4 -mt-4 mb-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 border-b">
        <div
          ref={stripRef}
          role="tablist"
          aria-label="Collection"
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar px-4 scroll-px-4 py-2.5"
        >
          {SECTIONS.map((sec, i) => {
            const on = activeTab === sec.value;
            const Icon = sec.icon;
            const firstAnalysis = "analysis" in sec && !("analysis" in SECTIONS[i - 1]);
            return (
              <div key={sec.value} className="flex items-center gap-1.5 shrink-0">
                {firstAnalysis && <span className="w-px h-5 bg-border mx-1" aria-hidden />}
                <button
                  role="tab"
                  aria-selected={on}
                  onClick={() => handleTabChange(sec.value)}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    on ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {sec.label}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Whose collection — said once wherever you are, not a card on every page */}
      {viewingUser && activeTab !== "overview" && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <span className="min-w-0 truncate">Viewing <span className="font-medium">{viewingUser}</span>&apos;s collection</span>
          <button className="shrink-0 text-primary font-medium" onClick={() => handleUserSelect(null)}>Back to yours</button>
        </div>
      )}

      {activeTab === "overview" && (
        <div>
          <div className="mb-4">
            <UserSwitcher currentUser={user.username} viewingUser={viewingUser} onUserSelect={handleUserSelect} />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 mb-4">
            <div className="flex items-baseline gap-x-4 gap-y-1 flex-wrap min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-2xl font-semibold tabular-nums">
                  {fetchingCollection ? <Loader2 className="w-5 h-5 animate-spin inline" /> : collection?.totalItems?.toLocaleString() ?? "—"}
                </span>
                <span className="text-sm text-muted-foreground">records</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-2xl font-semibold tabular-nums">
                  {fetchingWantlist ? <Loader2 className="w-5 h-5 animate-spin inline" /> : wantlist?.totalItems?.toLocaleString() ?? "—"}
                </span>
                <span className="text-sm text-muted-foreground">wanted</span>
              </div>
              <div className="basis-full text-xs text-muted-foreground flex items-center gap-1.5">
                <Disc3 className="w-3.5 h-3.5" />
                {!collection
                  ? fetchingCollection ? "Loading collection…" : "Collection not loaded"
                  : syncing
                    ? "Syncing with Discogs…"
                    : collection.syncedAt
                      ? `Synced ${syncedAgo(collection.syncedAt)}`
                      : "Collection loaded"}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* A link for a friend to browse your records — yours only, not one you're viewing */}
              {!viewingUser && <ShareCollectionButton label="Share" />}
              <Button variant="outline" size="icon" onClick={refreshAll} disabled={busy} aria-label="Refresh collection and wantlist">
                <RefreshCw className={`w-4 h-4 ${busy || syncing ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {/* Truncation warning — surfaces silent dropping for collections > LLM budget */}
          {collection?.optimized.truncated && collection.optimized.truncatedAt && (
            <div className="mb-4 px-4 py-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <Disc3 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Your collection is large ({collection.totalItems.toLocaleString()} items). Analyses run on
                the top {collection.optimized.truncatedAt.toLocaleString()} prioritized records (recently
                added + highly rated + vinyl).
              </span>
            </div>
          )}

          {recent.length > 0 && (
            <section className="mb-4" aria-label="Recently added">
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="font-display text-lg font-semibold">
                  {viewingUser ? `${viewingUser}'s latest` : "Recently added"}
                </h2>
                {collection && collection.totalItems > recent.length && (
                  <button className="text-sm text-primary font-medium" onClick={() => handleTabChange("browse")}>
                    Browse all
                  </button>
                )}
              </div>
              <div className="-mx-4 px-4 scroll-px-4 flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-1">
                {recent.map((item) => {
                  const basic = item.basic_information;
                  const artist = basic.artists.map((a) => a.name).join(", ");
                  const thumb = basic.cover_image || basic.thumb;
                  return (
                    <div key={item.instance_id} className="w-28 sm:w-32 shrink-0 snap-start">
                      <div className="aspect-square relative bg-muted rounded-md overflow-hidden shadow-sm ring-1 ring-black/5">
                        {thumb ? (
                          <Image src={thumb} alt={`${artist} — ${basic.title}`} fill sizes="128px" className="object-cover" unoptimized />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Disc3 className="w-8 h-8 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="mt-1.5 text-xs leading-tight">
                        <div className="font-medium truncate" title={artist}>{artist}</div>
                        <div className="text-muted-foreground truncate" title={basic.title}>{basic.title}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {collection && (
            <section className="mb-6" aria-label="Collection breakdown">
              <CollectionStats collection={collection.optimized} />
            </section>
          )}
        </div>
      )}

      {activeTab === "pressings" && <PressingFinder ownedReleaseIds={ownedReleaseIds} />}
      {activeTab === "browse" && (
        <CollectionBrowser
          items={collection?.raw}
          totalItems={collection?.totalItems ?? 0}
          isReady={!!collection}
          years={collection?.years}
          yearsPending={collection?.yearsPending ?? 0}
          progress={loadProgress}
          actions={!viewingUser ? <ShareCollectionButton label="Send a friend this collection" iconOnly className="rounded-full w-10 h-10" /> : null}
        />
      )}
      {activeTab === "shop" && (
        <RecordShopChat collectionString={collectionString} wantlistString={wantlist?.wantlistString} isReady={!!collection} />
      )}
      {activeTab === "mixtape" && <MixtapeDisplay items={collection?.raw} isReady={!!collection} />}
      {activeTab === "guides" && <GuideDisplay items={collection?.raw} isReady={!!collection} />}
      {activeTab === "roast" && (
        <RoastDisplay collectionString={collectionString} username={collection?.username} isReady={!!collection} />
      )}
      {activeTab === "gap_filler" && (
        <GapFillerDisplay
          collectionString={collectionString}
          username={collection?.username}
          isReady={!!collection}
          onResultsReceived={setGapFillerResults}
        />
      )}
      {activeTab === "oracle" && (
        <OracleDisplay
          collectionString={collectionString}
          username={collection?.username}
          wantlistString={wantlist?.wantlistString}
          gapFillerResults={gapFillerResults}
          isReady={!!collection}
        />
      )}
      {activeTab === "mood" && <MoodDisplay collectionString={collectionString} isReady={!!collection} />}
      {activeTab === "obscureness" && (
        <ObscurenessDisplay collectionString={collectionString} username={collection?.username} isReady={!!collection} />
      )}
    </Shell>
  );
}
