"use client";

// "Put The Liner Note on your home screen." Two places: a card on Home that can
// be dismissed (remembered per device), and a permanent row in your profile.
import { useEffect, useState } from "react";
import { Download, Share, PlusSquare, X, Check } from "lucide-react";
import { useInstall } from "@/lib/pwa";

const DISMISS_KEY = "ln-install-dismissed";

export function InstallBanner() {
  const state = useInstall();
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === "1"); } catch { setDismissed(false); }
  }, []);
  if (dismissed || (state.kind !== "prompt" && state.kind !== "ios")) return null;
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
  };
  return (
    <section className="relative rounded-2xl border bg-card p-4 pr-10 flex gap-3 items-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed 48px app icon */}
      <img src="/icons/icon-192.png" alt="" className="w-12 h-12 rounded-xl shrink-0" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm font-medium leading-snug">Get The Liner Note on your home screen</p>
        <InstallAction />
      </div>
      <button onClick={dismiss} aria-label="Not now" className="absolute top-2 right-2 p-1.5 rounded-full text-muted-foreground hover:bg-accent">
        <X className="w-4 h-4" />
      </button>
    </section>
  );
}

/** The button (Chrome/Android) or the instructions (iOS), or "installed". */
export function InstallAction() {
  const state = useInstall();
  const [busy, setBusy] = useState(false);
  if (state.kind === "installed") {
    return <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Check className="w-4 h-4" /> Installed on this device</p>;
  }
  if (state.kind === "prompt") {
    return (
      <button
        disabled={busy}
        onClick={async () => { setBusy(true); try { await state.install(); } finally { setBusy(false); } }}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3.5 py-1.5 text-sm font-medium disabled:opacity-60"
      >
        <Download className="w-4 h-4" /> Install app
      </button>
    );
  }
  if (state.kind === "ios") {
    return (
      <p className="text-sm text-muted-foreground leading-relaxed">
        Tap <Share className="inline w-4 h-4 -mt-0.5" aria-label="Share" /> then{" "}
        <span className="whitespace-nowrap"><PlusSquare className="inline w-4 h-4 -mt-0.5" /> Add to Home Screen</span>.
      </p>
    );
  }
  if (state.kind === "unavailable") {
    return <p className="text-sm text-muted-foreground">Use your browser&apos;s menu to install or add to home screen.</p>;
  }
  return null;
}
