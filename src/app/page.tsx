"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Disc3, Flame, Search, Sparkles } from "lucide-react";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/session");
        const data = await res.json();
        setIsAuthenticated(data.authenticated);
      } catch {
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    }
    checkAuth();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="vinyl-record w-16 h-16 animate-spin-slow" />
      </div>
    );
  }

  if (isAuthenticated) {
    // Redirect to dashboard if already authenticated
    window.location.href = "/dashboard";
    return null;
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted">
      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <div className="vinyl-record w-24 h-24 animate-spin-slow" />
          </div>
          <h1 className="text-5xl font-bold mb-4">The Liner Note</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            AI-powered analysis of your Discogs collection. Get roasted, find
            gaps in your vinyl obsession, and discover what you should be
            hunting for next.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <Card className="border-2 hover:border-primary transition-colors">
            <CardHeader>
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <Flame className="w-6 h-6 text-destructive" />
              </div>
              <CardTitle>The Roast</CardTitle>
              <CardDescription>
                Let AI analyze your collection and deliver a humorous,
                personalized roast of your taste. Find out your &quot;Collector
                Archetype&quot; and which albums are too cliche.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-primary transition-colors">
            <CardHeader>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Search className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>Gap Filler</CardTitle>
              <CardDescription>
                Identify your core artists and discover the critical studio
                albums missing from your collection. No more incomplete
                discographies.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-primary transition-colors">
            <CardHeader>
              <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-purple-500" />
              </div>
              <CardTitle>The Oracle</CardTitle>
              <CardDescription>
                Predict your next purchases and discover albums you don&apos;t
                know you want yet. Using sideman logic and scene connections.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center justify-center gap-2">
                <Disc3 className="w-6 h-6" />
                Connect Your Discogs
              </CardTitle>
              <CardDescription>
                Sign in with your Discogs account to analyze your collection.
                We&apos;ll read your collection and wantlist to provide
                personalized insights.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="lg" className="w-full">
                <a href="/api/auth/discogs">Connect with Discogs</a>
              </Button>
              <p className="text-xs text-muted-foreground mt-4">
                We only read your collection data. We never modify your Discogs
                account.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Error handling for OAuth errors */}
        <ErrorMessage />
      </div>
    </main>
  );
}

function ErrorMessage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (errorParam) {
      const errorMessages: Record<string, string> = {
        oauth_failed: "Failed to connect with Discogs. Please try again.",
        missing_params: "Missing OAuth parameters. Please try again.",
        session_expired: "Your session expired. Please try again.",
        token_mismatch: "Security token mismatch. Please try again.",
        callback_failed: "OAuth callback failed. Please try again.",
      };
      setError(errorMessages[errorParam] || "An unknown error occurred.");
      // Clear the error from URL
      window.history.replaceState({}, "", "/");
    }
  }, []);

  if (!error) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground px-4 py-2 rounded-md shadow-lg">
      {error}
    </div>
  );
}
