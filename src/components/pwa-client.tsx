"use client";

// Mounted once in the root layout: registers the service worker, offers the
// reload when a new version is waiting, keeps the theme-color in step with the
// chosen theme, and says so when the device is offline.
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { WifiOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { captureInstallPrompt, useOnline } from "@/lib/pwa";
import { THEME_COLOR } from "@/components/social/theme-picker";

let started = false;

export function PwaClient() {
  const online = useOnline();
  const path = usePathname();

  useEffect(() => {
    if (started) return;
    started = true;
    captureInstallPrompt();

    // The shelf display is its own dark page, and a kiosk: nobody is there to
    // tap "Reload", so it takes updates by itself.
    const shelf = window.location.pathname.startsWith("/shelf");
    const theme = document.documentElement.dataset.theme || "paper";
    if (!shelf) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme] ?? THEME_COLOR.paper);

    if (!("serviceWorker" in navigator)) return;
    // Development: a worker left over from `npm start` on the same port would
    // serve stale chunks to `next dev`, so take it away instead.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
      return;
    }
    register(shelf);
  }, []);

  // The shelf keeps showing its saved wall; a banner there would only alarm guests.
  if (online || path?.startsWith("/shelf")) return null;
  return (
    <div
      role="status"
      className="fixed left-1/2 -translate-x-1/2 z-[70] flex items-center gap-1.5 rounded-full bg-foreground text-background text-xs font-medium px-3 py-1.5 shadow-lg md:top-3"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 3.75rem)" }}
    >
      <WifiOff className="w-3.5 h-3.5" /> Offline — showing what&apos;s saved
    </div>
  );
}

async function register(autoUpdate: boolean) {
  let reg: ServiceWorkerRegistration;
  try {
    reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return;
  }

  const offerReload = (worker: ServiceWorker) => {
    if (autoUpdate) return worker.postMessage("skip-waiting");
    toast({
      title: "A new version is ready",
      description: "Reload to get the latest Liner Note.",
      action: (
        <ToastAction altText="Reload" onClick={() => worker.postMessage("skip-waiting")}>
          Reload
        </ToastAction>
      ),
    });
  };

  // Only a worker that replaces an existing one is an "update"; the first
  // install just takes over quietly.
  if (reg.waiting && navigator.serviceWorker.controller) offerReload(reg.waiting);
  reg.addEventListener("updatefound", () => {
    const next = reg.installing;
    next?.addEventListener("statechange", () => {
      if (next.state === "installed" && navigator.serviceWorker.controller) offerReload(next);
    });
  });

  // The first install also changes controller (clients.claim) — that one must
  // not reload the page.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  // An installed app can stay open for days: look for a new version when it
  // comes back to the foreground.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") reg.update().catch(() => {});
  });
}
