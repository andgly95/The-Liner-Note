"use client";

// Sign-in: Google for everyone, Discogs for collectors. Google's own button is
// rendered by their script (it has to be, to be trusted); until a client id is
// configured it is simply absent and Discogs carries on working.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useMe } from "./me";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void;
          renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
        };
      };
    };
  }
}

let gsiLoading: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  if (gsiLoading) return gsiLoading;
  gsiLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Google sign-in didn't load"));
    document.head.appendChild(s);
  });
  return gsiLoading;
}

export function SignInButtons({ after }: { after?: () => void }) {
  const { googleClientId, refresh } = useMe();
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!googleClientId || !box.current) return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !window.google || !box.current) return;
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async ({ credential }) => {
            setError(null);
            const r = await fetch("/api/auth/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credential }),
            });
            const b = await r.json().catch(() => ({}));
            if (!r.ok) return setError(b.error || "Sign-in failed");
            await refresh();
            after?.();
          },
        });
        window.google.accounts.id.renderButton(box.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          width: Math.min(320, box.current.offsetWidth || 320),
        });
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [googleClientId, refresh, after]);

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {googleClientId && <div ref={box} className="w-full flex justify-center min-h-[44px]" />}
      <Button asChild variant={googleClientId ? "outline" : "default"} className="w-full max-w-[320px] rounded-full h-11">
        <a href="/api/auth/discogs">Continue with Discogs</a>
      </Button>
      {error && <p className="text-sm text-destructive text-center">{error}</p>}
    </div>
  );
}
