"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Disc3,
  Flame,
  Search,
  Sparkles,
  Store,
  LogOut,
  RefreshCw,
  Loader2,
  Headphones,
  Telescope,
  Library,
  ListMusic,
  BookOpen,
  Compass,
  ChevronDown,
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
}

interface WantlistData {
  username: string;
  totalItems: number;
  wantlistString: string;
}

const ACTIVE_TAB_STORAGE_KEY = "linernote-active-tab";

// On a phone, nine tabs do not fit anywhere you can reach. The five analyses
// are one destination ("Discover") with their own chip row; the bottom bar has
// the five places people actually go.
const DISCOVER = [
  { value: "roast", label: "Roast", icon: Flame },
  { value: "gap_filler", label: "Gap Filler", icon: Search },
  { value: "oracle", label: "Oracle", icon: Sparkles },
  { value: "mood", label: "Mood", icon: Headphones },
  { value: "obscureness", label: "Obscure", icon: Telescope },
] as const;
const DISCOVER_SET = new Set<string>(DISCOVER.map((d) => d.value));
const BOTTOM_NAV = [
  { value: "discover", label: "Discover", icon: Compass },
  { value: "pressings", label: "Pressings", icon: ScanLine },
  { value: "mixtape", label: "Mixtape", icon: ListMusic },
  { value: "guides", label: "Guides", icon: BookOpen },
  { value: "browse", label: "Browse", icon: Library },
  { value: "shop", label: "Shop", icon: Store },
] as const;
const VALID_TABS = new Set([
  "roast",
  "gap_filler",
  "oracle",
  "shop",
  "mood",
  "obscureness",
  "browse",
  "mixtape",
  "guides",
  "pressings",
]);

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [collection, setCollection] = useState<CollectionData | null>(null);
  const [wantlist, setWantlist] = useState<WantlistData | null>(null);
  const [fetchingCollection, setFetchingCollection] = useState(false);
  const [fetchingWantlist, setFetchingWantlist] = useState(false);
  const [gapFillerResults, setGapFillerResults] = useState<GapFillerResult | null>(null);
  const [activeTab, setActiveTab] = useState("roast");
  const [viewingUser, setViewingUser] = useState<string | null>(null);

  // Restore last-used tab from localStorage so refresh doesn't drop the user back to Roast.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
      if (saved && VALID_TABS.has(saved)) setActiveTab(saved);
    } catch {
      // localStorage unavailable — ignore
    }
  }, []);

  const [lastDiscover, setLastDiscover] = useState("roast");
  const [menuOpen, setMenuOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleTabChange = useCallback((next: string) => {
    setActiveTab(next);
    if (DISCOVER_SET.has(next)) setLastDiscover(next);
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
          router.push("/");
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

  const fetchCollection = useCallback(async (username?: string | null) => {
    setFetchingCollection(true);
    try {
      const url = username ? `/api/collection?username=${encodeURIComponent(username)}` : "/api/collection";
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 403) throw new Error("Collection is private");
        throw new Error("Failed to fetch collection");
      }
      const data = await res.json();
      setCollection(data);
    } catch (error) {
      console.error("Error fetching collection:", error);
      setCollection(null);
    } finally {
      setFetchingCollection(false);
    }
  }, []);

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

  // From the bottom bar: switch, then put the feature at the top of the screen
  // rather than leaving you wherever you had scrolled to in the last one.
  const goTo = useCallback(
    (next: string) => {
      handleTabChange(next === "discover" ? lastDiscover : next);
      requestAnimationFrame(() => {
        const el = contentRef.current;
        if (!el) return;
        const top = el.getBoundingClientRect().top + window.scrollY - 64;
        // Tools (the finder, the shop) open AT the tool; the rest only scroll back up.
        if (window.scrollY > top || next === "shop" || next === "pressings") window.scrollTo({ top, behavior: "smooth" });
      });
    },
    [handleTabChange, lastDiscover]
  );

  useEffect(() => {
    if (DISCOVER_SET.has(activeTab)) setLastDiscover(activeTab);
  }, [activeTab]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="vinyl-record w-16 h-16 animate-spin-slow" />
      </div>
    );
  }

  if (!user) return null;

  const busy = fetchingCollection || fetchingWantlist;
  const refreshAll = () => {
    fetchCollection(viewingUser);
    fetchWantlist(viewingUser);
  };
  const recent = collection?.raw?.slice(0, 20) ?? [];
  const navActive = DISCOVER_SET.has(activeTab) ? "discover" : activeTab;
  // Only YOUR collection says what you own — not a friend's you are browsing.
  const ownedReleaseIds = !viewingUser && collection?.raw
    ? new Set(collection.raw.map((it) => it.basic_information.id))
    : undefined;

  return (
    <div className="min-h-screen bg-background">
      {/* Header — one line at any width; the account lives behind the avatar */}
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="vinyl-record w-7 h-7 shrink-0" />
            <h1 className="font-display text-lg sm:text-xl font-semibold tracking-tight whitespace-nowrap">
              The Liner Note
            </h1>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:bg-accent"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Avatar className="w-8 h-8">
                <AvatarImage src={user.avatar_url} alt={user.username} />
                <AvatarFallback>{user.username[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="hidden sm:inline text-sm font-medium">{user.username}</span>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-52 z-50 rounded-lg border bg-popover shadow-lg p-1"
                >
                  <div className="px-3 py-2 text-sm">
                    <div className="text-muted-foreground text-xs">Signed in as</div>
                    <div className="font-medium truncate">{user.username}</div>
                  </div>
                  <button
                    role="menuitem"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent"
                  >
                    <LogOut className="w-4 h-4" />
                    Log out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 pt-4 pb-28 md:pt-8 md:pb-12">
        {/* User Switcher */}
        <div className="mb-4">
          <UserSwitcher
            currentUser={user.username}
            viewingUser={viewingUser}
            onUserSelect={handleUserSelect}
          />
        </div>

        {/* Summary — the three stat cards were a screen of chrome on a phone */}
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
                : collection.optimized.truncated
                  ? `Analyses use the top ${collection.optimized.truncatedAt?.toLocaleString()} records`
                  : "Full collection loaded"}
            </div>
          </div>
          <Button variant="outline" size="icon" onClick={refreshAll} disabled={busy} aria-label="Refresh collection and wantlist">
            <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
          </Button>
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

        {/* Recently added — covers up front, as a shelf you swipe along */}
        {recent.length > 0 && (
          <section className="mb-4" aria-label="Recently added">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="font-display text-lg font-semibold">
                {viewingUser ? `${viewingUser}'s latest` : "Recently added"}
              </h2>
              {collection && collection.totalItems > recent.length && (
                <button className="text-sm text-primary font-medium" onClick={() => goTo("browse")}>
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
                        <Image
                          src={thumb}
                          alt={`${artist} — ${basic.title}`}
                          fill
                          sizes="128px"
                          className="object-cover"
                          unoptimized
                        />
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

        {/* Stats — derived from already-fetched data; folded away, since Browse
            shows the same breakdown for whatever slice you are looking at */}
        {collection && (
          <details className="group mb-6">
            <summary className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
              Collection breakdown
              <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3">
              <CollectionStats collection={collection.optimized} />
            </div>
          </details>
        )}

        {/* Feature Tabs */}
        <div ref={contentRef} className="scroll-mt-16" />
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          {/* Desktop: the full row. On a phone it is replaced by the bottom bar. */}
          <TabsList className="hidden md:grid w-full md:grid-cols-5 lg:grid-cols-10 mb-8 h-auto gap-1">
            <TabsTrigger value="pressings" className="flex items-center gap-1.5">
              <ScanLine className="w-4 h-4 shrink-0" />
              Pressings
            </TabsTrigger>
            <TabsTrigger value="roast" className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 shrink-0" />
              Roast
            </TabsTrigger>
            <TabsTrigger value="gap_filler" className="flex items-center gap-1.5">
              <Search className="w-4 h-4 shrink-0" />
              <span className="hidden lg:inline">Gap </span>Filler
            </TabsTrigger>
            <TabsTrigger value="oracle" className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 shrink-0" />
              Oracle
            </TabsTrigger>
            <TabsTrigger value="guides" className="flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 shrink-0" />
              Guides
            </TabsTrigger>
            <TabsTrigger value="mixtape" className="flex items-center gap-1.5">
              <ListMusic className="w-4 h-4 shrink-0" />
              Mixtape
            </TabsTrigger>
            <TabsTrigger value="mood" className="flex items-center gap-1.5">
              <Headphones className="w-4 h-4 shrink-0" />
              Mood
            </TabsTrigger>
            <TabsTrigger value="obscureness" className="flex items-center gap-1.5">
              <Telescope className="w-4 h-4 shrink-0" />
              Obscure
            </TabsTrigger>
            <TabsTrigger value="browse" className="flex items-center gap-1.5">
              <Library className="w-4 h-4 shrink-0" />
              Browse
            </TabsTrigger>
            <TabsTrigger value="shop" className="flex items-center gap-1.5">
              <Store className="w-4 h-4 shrink-0" />
              Shop
            </TabsTrigger>
          </TabsList>

          {/* Phone: the five analyses as one swipeable chip row */}
          {DISCOVER_SET.has(activeTab) && (
            <div className="md:hidden -mx-4 px-4 scroll-px-4 mb-4 flex gap-2 overflow-x-auto no-scrollbar" role="tablist" aria-label="Discover">
              {DISCOVER.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={activeTab === value}
                  onClick={() => handleTabChange(value)}
                  className={`shrink-0 flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                    activeTab === value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          )}
          <TabsContent value="pressings">
            <PressingFinder ownedReleaseIds={ownedReleaseIds} />
          </TabsContent>

          <TabsContent value="roast">
            <RoastDisplay
              collectionString={collection?.collectionString || ""}
              username={collection?.username}
              isReady={!!collection}
            />
          </TabsContent>

          <TabsContent value="gap_filler">
            <GapFillerDisplay
              collectionString={collection?.collectionString || ""}
              username={collection?.username}
              isReady={!!collection}
              onResultsReceived={setGapFillerResults}
            />
          </TabsContent>

          <TabsContent value="oracle">
            <OracleDisplay
              collectionString={collection?.collectionString || ""}
              username={collection?.username}
              wantlistString={wantlist?.wantlistString}
              gapFillerResults={gapFillerResults}
              isReady={!!collection}
            />
          </TabsContent>

          <TabsContent value="mood">
            <MoodDisplay
              collectionString={collection?.collectionString || ""}
              isReady={!!collection}
            />
          </TabsContent>

          <TabsContent value="obscureness">
            <ObscurenessDisplay
              collectionString={collection?.collectionString || ""}
              username={collection?.username}
              isReady={!!collection}
            />
          </TabsContent>

          <TabsContent value="guides">
            <GuideDisplay
              items={collection?.raw}
              isReady={!!collection}
            />
          </TabsContent>

          <TabsContent value="mixtape">
            <MixtapeDisplay
              items={collection?.raw}
              isReady={!!collection}
            />
          </TabsContent>

          <TabsContent value="browse">
            <CollectionBrowser
              items={collection?.raw}
              totalItems={collection?.totalItems ?? 0}
              isReady={!!collection}
            />
          </TabsContent>

          <TabsContent value="shop">
            <RecordShopChat
              collectionString={collection?.collectionString || ""}
              wantlistString={wantlist?.wantlistString}
              isReady={!!collection}
            />
          </TabsContent>
        </Tabs>

      </main>

      {/* Phone: the bottom tab bar — always within reach of a thumb */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-safe"
        aria-label="Sections"
      >
        <div className="grid grid-cols-6">
          {BOTTOM_NAV.map(({ value, label, icon: Icon }) => {
            const on = navActive === value;
            return (
              <button
                key={value}
                onClick={() => goTo(value)}
                aria-current={on ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10.5px] font-medium tracking-tight transition-colors ${
                  on ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <span className={`flex items-center justify-center w-11 h-7 rounded-full transition-colors ${on ? "bg-primary/10" : ""}`}>
                  <Icon className="w-5 h-5" />
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
