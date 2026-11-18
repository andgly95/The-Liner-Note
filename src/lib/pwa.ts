"use client";

// The installed-app plumbing shared by every page: the install prompt (which
// the browser fires once, early, so it is caught at module level by
// <PwaClient/> in the root layout) and "are we running as the installed app".
import { useEffect, useState, useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Called once from <PwaClient/>: keeps the browser's install event for later. */
export function captureInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own button instead of the mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's own flag for home-screen apps
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac; touch points give it away.
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export type InstallState =
  | { kind: "unknown" } // server render / first paint
  | { kind: "installed" } // running as the app, or just installed
  | { kind: "prompt"; install: () => Promise<boolean> } // Chrome, Edge, Android
  | { kind: "ios" } // Safari: no prompt API, show Share → Add to Home Screen
  | { kind: "unavailable" }; // already installed in another way, or not supported

export function useInstall(): InstallState {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const ev = useSyncExternalStore(subscribe, () => deferred, () => null);
  const done = useSyncExternalStore(subscribe, () => installed, () => false);
  if (!mounted) return { kind: "unknown" };
  if (done || isStandalone()) return { kind: "installed" };
  if (ev) {
    return {
      kind: "prompt",
      install: async () => {
        await ev.prompt();
        const { outcome } = await ev.userChoice;
        deferred = null;
        emit();
        return outcome === "accepted";
      },
    };
  }
  if (isIos()) return { kind: "ios" };
  return { kind: "unavailable" };
}

export function useOnline() {
  return useSyncExternalStore(
    (l) => {
      window.addEventListener("online", l);
      window.addEventListener("offline", l);
      return () => {
        window.removeEventListener("online", l);
        window.removeEventListener("offline", l);
      };
    },
    () => navigator.onLine,
    () => true
  );
}

/** Forget cached API reads (profile, ratings) — on sign-out. */
export function clearPersonalCache() {
  try { localStorage.removeItem("ln-pressing-finder"); } catch {}
  navigator.serviceWorker?.controller?.postMessage("clear-personal");
  if ("caches" in window) {
    caches.keys().then((names) => names.filter((n) => n.startsWith("ln-api-")).forEach((n) => caches.delete(n))).catch(() => {});
  }
}
