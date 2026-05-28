"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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

  const handleTabChange = useCallback((next: string) => {
    setActiveTab(next);
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="vinyl-record w-8 h-8" />
            <h1 className="text-xl font-bold">The Liner Note</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Avatar className="w-8 h-8">
                <AvatarImage src={user.avatar_url} alt={user.username} />
                <AvatarFallback>{user.username[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{user.username}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* User Switcher */}
        <div className="mb-6">
          <UserSwitcher
            currentUser={user.username}
            viewingUser={viewingUser}
            onUserSelect={handleUserSelect}
          />
        </div>

        {/* Collection Stats */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Collection</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                {fetchingCollection ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  collection?.totalItems ?? "—"
                )}
                <span className="text-sm font-normal text-muted-foreground">
                  records
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchCollection(viewingUser)}
                disabled={fetchingCollection}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${fetchingCollection ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Wantlist</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                {fetchingWantlist ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  wantlist?.totalItems ?? "—"
                )}
                <span className="text-sm font-normal text-muted-foreground">
                  items
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchWantlist(viewingUser)}
                disabled={fetchingWantlist}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${fetchingWantlist ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Analysis Status</CardDescription>
              <CardTitle className="text-lg">
                {collection ? "Ready to analyze" : "Loading collection..."}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!collection && <Progress value={fetchingCollection ? 50 : 0} />}
              {collection && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Disc3 className="w-4 h-4" />
                  {collection.optimized.truncated
                    ? `Optimized to ${collection.optimized.truncatedAt} items`
                    : "Full collection loaded"}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Truncation warning — surfaces silent dropping for collections > LLM budget */}
        {collection?.optimized.truncated && collection.optimized.truncatedAt && (
          <div className="mb-6 px-4 py-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
            <Disc3 className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Your collection is large ({collection.totalItems.toLocaleString()} items). Analyses run on
              the top {collection.optimized.truncatedAt.toLocaleString()} prioritized records (recently
              added + highly rated + vinyl).
            </span>
          </div>
        )}

        {/* Stats card — derived from already-fetched data, no extra LLM cost */}
        {collection && (
          <div className="mb-8">
            <CollectionStats collection={collection.optimized} />
          </div>
        )}

        {/* Feature Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 mb-8 h-auto gap-1">
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
              <span className="hidden lg:inline">Obscure</span>
              <span className="lg:hidden">Obsc.</span>
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

        {/* Collection Preview — uses raw items (with cover art) when available */}
        {collection && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>
                {viewingUser ? `${viewingUser}'s Collection` : "Collection Preview"}
              </CardTitle>
              <CardDescription>
                Most recently added — {viewingUser ? `${viewingUser}'s` : "your"} latest 20 records
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-80">
                {collection.raw && collection.raw.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                    {collection.raw.slice(0, 20).map((item) => {
                      const basic = item.basic_information;
                      const artist = basic.artists.map((a) => a.name).join(", ");
                      const thumb = basic.thumb || basic.cover_image;
                      return (
                        <div key={item.instance_id} className="flex flex-col gap-2">
                          <div className="aspect-square relative bg-muted rounded-md overflow-hidden">
                            {thumb ? (
                              <Image
                                src={thumb}
                                alt={`${artist} — ${basic.title}`}
                                fill
                                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
                                className="object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Disc3 className="w-8 h-8 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div className="text-xs">
                            <div className="font-medium truncate" title={artist}>
                              {artist}
                            </div>
                            <div className="text-muted-foreground truncate" title={basic.title}>
                              {basic.title}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-1 font-mono text-sm">
                    {collection.optimized.releases.slice(0, 20).map((release, i) => (
                      <div key={i} className="text-muted-foreground">
                        {release.artist} - {release.album} ({release.year || "????"}) [
                        {release.genres.slice(0, 2).join("/")}]
                      </div>
                    ))}
                  </div>
                )}
                {collection.totalItems > 20 && (
                  <>
                    <Separator className="my-3" />
                    <div className="text-sm text-muted-foreground italic text-center">
                      …and {(collection.totalItems - 20).toLocaleString()} more
                    </div>
                  </>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
