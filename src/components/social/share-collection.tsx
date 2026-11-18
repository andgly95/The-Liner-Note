"use client";

// "Share collection": sends a friend a link to browse your whole record
// collection on their own phone — the shelf display's wall, without the kiosk
// bits. The link is the shelf's second token (not the tablet's code), so it can
// be changed on its own. The first tap turns sharing on if it isn't yet.
import { useEffect, useState } from "react";
import { Check, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface Status { enabled: boolean; shareToken?: string; title?: string }

export const shareUrl = (token: string) => `${window.location.origin}/shelf/${token}`;

/** Share sheet on phones and tablets; the clipboard elsewhere or if the sheet
 *  is refused (iOS wants the tap to be recent). Returns what happened. */
export async function sendLink(url: string, title: string): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share && window.matchMedia("(pointer: coarse)").matches) {
    try {
      await nav.share({ title, text: `Have a look through my records — ${title}`, url });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}

export function ShareCollectionButton({
  label = "Share collection",
  variant = "outline",
  className = "rounded-full",
}: {
  label?: string;
  variant?: "outline" | "default" | "ghost";
  className?: string;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Ask up front, so the tap itself can open the share sheet straight away.
  useEffect(() => {
    fetch("/api/shelf").then((r) => (r.ok ? r.json() : null)).then((b) => b && setStatus(b)).catch(() => {});
  }, []);

  const share = async () => {
    let s = status;
    if (!s?.enabled || !s.shareToken) {
      setBusy(true);
      try {
        const res = await fetch("/api/shelf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "enable" }),
        });
        const b = await res.json();
        if (!res.ok) {
          toast({
            title: "Couldn't make the link",
            description: b.discogs === false ? `${b.error}. Sign in with Discogs, then try again.` : b.error,
            variant: "destructive",
          });
          return;
        }
        s = b as Status;
        setStatus(s);
      } catch {
        toast({ title: "Couldn't make the link", description: "Check your connection and try again.", variant: "destructive" });
        return;
      } finally {
        setBusy(false);
      }
    }
    const url = shareUrl(s!.shareToken!);
    const result = await sendLink(url, s!.title || "My records");
    if (result === "copied") {
      setDone(true);
      setTimeout(() => setDone(false), 2000);
      toast({ title: "Link copied", description: "Send it to a friend — they can browse every record, nothing else." });
    } else if (result === "failed") {
      toast({ title: "Here's the link", description: url });
    }
  };

  return (
    <Button size="sm" variant={variant} className={className} onClick={share} disabled={busy}>
      {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : done ? <Check className="w-4 h-4 mr-1.5" /> : <Share2 className="w-4 h-4 mr-1.5" />}
      {busy ? "Making the link…" : done ? "Copied" : label}
    </Button>
  );
}
