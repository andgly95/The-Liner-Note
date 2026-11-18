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
  Sparkles,
  Store,
  RefreshCw,
  Loader2,
  Headphones,
  Telescope,
  Library,
  BookOpen,
  ScanLine,
  Users,
  MoreHorizontal,
  X,
} from "lucide-react";
import { RoastDisplay } from "@/components/features/roast-display";
import { NextDisplay } from "@/components/features/next-display";
import { RecordShopChat } from "@/components/features/record-shop-chat";
import { MoodDisplay } from "@/components/features/mood-display";
import { ObscurenessDisplay } from "@/components/features/obscureness-display";
import { CollectionBrowser } from "@/components/features/collection-browser";
import { GuideDisplay } from "@/components/features/guide-display";
import { PressingFinder } from "@/components/features/pressing-finder";
import { UserSwitcher } from "@/components/features/user-switcher";
import { WhatItIs } from "@/components/features/collection-overview";
import { ShareCollectionButton } from "@/components/social/share-collection";
import type { CompressedCollection, DiscogsCollectionItem } from "@/types/discogs";

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
  { value: "guides", label: "Guides", icon: BookOpen },
  // The analyses — read your collection back to you.
  { value: "next", label: "What next", icon: Sparkles, analysis: true },
  { value: "roast", label: "Roast", icon: Flame, analysis: true },
  { value: "mood", label: "Mood", icon: Headphones, analysis: true },
  { value: "obscureness", label: "Obscure", icon: Telescope, analysis: true },
] as const;
const VALID_TABS = new Set<string>(SECTIONS.map((x) => x.value));
// The segmented control: the four that matter, in this order. The rest of the
// tools are one tap away under More.
const MAIN_SECTIONS = ["overview", "browse", "pressings", "shop"] as const;

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [collection, setCollection] = useState<CollectionData | null>(null);
  const [wantlist, setWantlist] = useState<WantlistData | null>(null);
  const [fetchingCollection, setFetchingCollection] = useState(false);
  const [fetchingWantlist, setFetchingWantlist] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [viewingUser, setViewingUser] = useState<string | null>(null);
  const [needsDiscogs, setNeedsDiscogs] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

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
      let saved = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
      // Gap filler and the Oracle became one tool; Mixtape is gone.
      if (saved === "gap_filler" || saved === "oracle") saved = "next";
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

  const active = SECTIONS.find((x) => x.value === activeTab);
  const inMore = !(MAIN_SECTIONS as readonly string[]).includes(activeTab);
  const counts = [
    collection ? `${collection.totalItems.toLocaleString()} record${collection.totalItems === 1 ? "" : "s"}` : null,
    wantlist ? `${wantlist.totalItems.toLocaleString()} wanted` : null,
  ].filter(Boolean).join(" · ");

  return (
    <Shell wide bare>
      {/* Collection's own header: title, counts, and its three actions */}
      <header className="flex items-start justify-between gap-3 pt-2 pb-3" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))" }}>
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold leading-tight truncate">
            {viewingUser ? `${viewingUser}'s collection` : "Collection"}
          </h1>
          <p className="text-sm text-muted-foreground truncate">
            {counts || (fetchingCollection ? "Loading…" : "\u00a0")}
          </p>
          {!viewingUser && collection && (
            <p className="text-xs text-muted-foreground">
              {syncing ? "Syncing with Discogs…" : collection.syncedAt ? `Synced ${syncedAgo(collection.syncedAt)}` : null}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 pt-1">
          <Button variant="outline" size="icon" className="rounded-full w-11 h-11" onClick={() => setFriendsOpen(true)} aria-label="A friend's collection" title="A friend's collection">
            <Users className="w-[18px] h-[18px]" />
          </Button>
          {!viewingUser && <ShareCollectionButton label="Send a friend this collection" iconOnly className="rounded-full w-11 h-11" />}
          <Button variant="outline" size="icon" className="rounded-full w-11 h-11" onClick={refreshAll} disabled={busy} aria-label="Sync with Discogs" title="Sync with Discogs">
            <RefreshCw className={`w-[18px] h-[18px] ${busy || syncing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      {/* Sections — a segmented control that fits the width, sticky */}
      <div
        ref={stripWrapRef}
        style={{ top: "calc(var(--app-header, 3.5rem) + env(safe-area-inset-top, 0px))" }}
        className="sticky z-20 -mx-4 px-4 py-2 mb-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85"
      >
        <div className="flex items-center gap-2">
          <div ref={stripRef} role="tablist" aria-label="Collection" className="flex-1 min-w-0 grid grid-cols-4 rounded-full bg-secondary p-1">
            {MAIN_SECTIONS.map((v) => {
              const sec = SECTIONS.find((x) => x.value === v)!;
              const on = activeTab === v;
              return (
                <button
                  key={v}
                  role="tab"
                  aria-selected={on}
                  onClick={() => handleTabChange(v)}
                  className={`h-9 rounded-full text-sm font-medium truncate px-1 transition-colors ${on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                >
                  {sec.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setMoreOpen(true)}
            aria-label={inMore && active ? `More tools (${active.label} open)` : "More tools"}
            className={`w-11 h-11 shrink-0 rounded-full inline-flex items-center justify-center ${
              inMore ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"
            }`}
          >
            {/* Lit up with the open tool's icon; the tool names itself below. */}
            {inMore && active ? <active.icon className="w-5 h-5" /> : <MoreHorizontal className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Whose collection — said once wherever you are, not a card on every page */}
      {viewingUser && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-secondary px-3 py-2 text-sm">
          <span className="min-w-0 truncate">Viewing <span className="font-medium">{viewingUser}</span>&apos;s collection</span>
          <button className="shrink-0 h-9 text-primary font-medium" onClick={() => handleUserSelect(null)}>Back to yours</button>
        </div>
      )}

      {/* Only the analyses read a sample; say so there, not on Overview. */}
      {active && "analysis" in active && collection?.optimized.truncated && collection.optimized.truncatedAt && (
        <p className="mb-4 text-sm text-muted-foreground">
          Your collection is large, so this reads the top {collection.optimized.truncatedAt.toLocaleString()} of{" "}
          {collection.totalItems.toLocaleString()} records (recently added, highly rated, vinyl first).
        </p>
      )}

      {activeTab === "overview" && (
        <div className="space-y-8 pb-4">
          {!collection && fetchingCollection ? (
            <div aria-busy="true" className="space-y-4">
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full bg-primary rounded-full transition-[width] duration-700 ${loadProgress ? "" : "w-1/4 animate-pulse"}`}
                  style={loadProgress ? { width: `${Math.max(6, (loadProgress.current / Math.max(1, loadProgress.total)) * 100)}%` } : undefined}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {loadProgress
                  ? `Loading ${loadProgress.total.toLocaleString()} records · ${Math.min(Math.ceil(loadProgress.total / 100), Math.max(1, Math.ceil(loadProgress.current / 100)))} of ${Math.ceil(loadProgress.total / 100)} pages`
                  : "Loading your records from Discogs…"}
              </p>
              <div className="flex gap-3 overflow-hidden">
                {Array.from({ length: 4 }, (_, i) => <div key={i} className="w-28 sm:w-32 shrink-0 aspect-square rounded-md bg-muted animate-pulse" />)}
              </div>
            </div>
          ) : null}

          {recent.length > 0 && (
            <section aria-label="Recently added">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-display text-xl font-semibold">
                  {viewingUser ? `${viewingUser}'s latest` : "Recently added"}
                </h2>
                {collection && collection.totalItems > recent.length && (
                  <button className="h-9 text-sm text-primary font-medium" onClick={() => handleTabChange("browse")}>
                    Browse all
                  </button>
                )}
              </div>
              <div className="-mx-4 px-4 scroll-px-4 flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-1">
                {recent.map((item) => {
                  const basic = item.basic_information;
                  const artist = basic.artists.map((a) => a.name.replace(/\s\(\d+\)$/, "").replace(/\*$/, "")).join(", ");
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
                      <div className="mt-1.5 text-xs leading-snug">
                        <div className="font-semibold truncate" title={basic.title}>{basic.title}</div>
                        <div className="text-muted-foreground truncate" title={artist}>{artist}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {collection?.raw && <WhatItIs items={collection.raw} years={collection.years} />}
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
        />
      )}
      {activeTab === "shop" && (
        <RecordShopChat collectionString={collectionString} wantlistString={wantlist?.wantlistString} isReady={!!collection} />
      )}
      {activeTab === "guides" && <GuideDisplay items={collection?.raw} isReady={!!collection} />}
      {activeTab === "roast" && (
        <RoastDisplay collectionString={collectionString} subject={collection?.username} isReady={!!collection} />
      )}
      {activeTab === "next" && (
        <NextDisplay
          collectionString={collectionString}
          wantlistString={wantlist?.wantlistString}
          wantlistReady={!fetchingWantlist}
          subject={collection?.username}
          isReady={!!collection}
        />
      )}
      {activeTab === "mood" && <MoodDisplay collectionString={collectionString} isReady={!!collection} />}
      {activeTab === "obscureness" && (
        <ObscurenessDisplay collectionString={collectionString} subject={collection?.username} isReady={!!collection} />
      )}
      {friendsOpen && (
        <Sheet title="A friend's collection" onClose={() => setFriendsOpen(false)}>
          <UserSwitcher
            currentUser={user.username}
            viewingUser={viewingUser}
            defaultExpanded
            onUserSelect={(u) => { setFriendsOpen(false); handleUserSelect(u); }}
          />
        </Sheet>
      )}
      {moreOpen && (
        <Sheet title="More tools" onClose={() => setMoreOpen(false)}>
          <ul className="divide-y border-y">
            {SECTIONS.filter((x) => !(MAIN_SECTIONS as readonly string[]).includes(x.value)).map((sec) => (
              <li key={sec.value}>
                <button
                  onClick={() => { setMoreOpen(false); handleTabChange(sec.value); }}
                  className={`w-full h-12 flex items-center gap-3 px-1 text-left ${activeTab === sec.value ? "text-primary font-medium" : ""}`}
                >
                  <sec.icon className="w-5 h-5 text-muted-foreground" />
                  {sec.label}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </Shell>
  );
}

/** A bottom sheet on a phone, a centred dialog on a wider screen. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto bg-card rounded-t-2xl sm:rounded-2xl shadow-xl px-5 pt-3 pb-6 pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto w-10 h-1 rounded-full bg-border sm:hidden" />
        <div className="mt-2 mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="-mr-2 w-11 h-11 inline-flex items-center justify-center rounded-full hover:bg-accent">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
