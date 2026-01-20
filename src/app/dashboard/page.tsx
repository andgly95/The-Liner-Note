"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Disc3, Flame, Search, Sparkles, LogOut, RefreshCw, Loader2 } from "lucide-react";
import { RoastDisplay } from "@/components/features/roast-display";
import { GapFillerDisplay } from "@/components/features/gap-filler-display";
import { OracleDisplay } from "@/components/features/oracle-display";
import type { CompressedCollection } from "@/types/discogs";
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
}

interface WantlistData {
  username: string;
  totalItems: number;
  wantlistString: string;
}

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

  const fetchCollection = useCallback(async () => {
    setFetchingCollection(true);
    try {
      const res = await fetch("/api/collection");
      if (!res.ok) throw new Error("Failed to fetch collection");
      const data = await res.json();
      setCollection(data);
    } catch (error) {
      console.error("Error fetching collection:", error);
    } finally {
      setFetchingCollection(false);
    }
  }, []);

  const fetchWantlist = useCallback(async () => {
    setFetchingWantlist(true);
    try {
      const res = await fetch("/api/wantlist");
      if (!res.ok) throw new Error("Failed to fetch wantlist");
      const data = await res.json();
      setWantlist(data);
    } catch (error) {
      console.error("Error fetching wantlist:", error);
    } finally {
      setFetchingWantlist(false);
    }
  }, []);

  useEffect(() => {
    if (user && !collection) {
      fetchCollection();
      fetchWantlist();
    }
  }, [user, collection, fetchCollection, fetchWantlist]);

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
                onClick={fetchCollection}
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
                onClick={fetchWantlist}
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

        {/* Feature Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="roast" className="flex items-center gap-2">
              <Flame className="w-4 h-4" />
              The Roast
            </TabsTrigger>
            <TabsTrigger value="gap_filler" className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              Gap Filler
            </TabsTrigger>
            <TabsTrigger value="oracle" className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              The Oracle
            </TabsTrigger>
          </TabsList>

          <TabsContent value="roast">
            <RoastDisplay
              collectionString={collection?.collectionString || ""}
              isReady={!!collection}
            />
          </TabsContent>

          <TabsContent value="gap_filler">
            <GapFillerDisplay
              collectionString={collection?.collectionString || ""}
              isReady={!!collection}
              onResultsReceived={setGapFillerResults}
            />
          </TabsContent>

          <TabsContent value="oracle">
            <OracleDisplay
              collectionString={collection?.collectionString || ""}
              wantlistString={wantlist?.wantlistString}
              gapFillerResults={gapFillerResults}
              isReady={!!collection}
            />
          </TabsContent>
        </Tabs>

        {/* Collection Preview */}
        {collection && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Collection Preview</CardTitle>
              <CardDescription>
                First 20 items from your optimized collection data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64">
                <div className="space-y-1 font-mono text-sm">
                  {collection.optimized.releases.slice(0, 20).map((release, i) => (
                    <div key={i} className="text-muted-foreground">
                      {release.artist} - {release.album} ({release.year || "????"}) [
                      {release.genres.slice(0, 2).join("/")}]
                    </div>
                  ))}
                  {collection.optimized.releases.length > 20 && (
                    <>
                      <Separator className="my-2" />
                      <div className="text-muted-foreground italic">
                        ...and {collection.optimized.releases.length - 20} more
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
