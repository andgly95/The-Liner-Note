"use client";

// Your shelf display, from your profile: turn it on, get the code to type on
// the tablet, rename it, refresh it, change the link, turn it off.
import { useEffect, useState } from "react";
import { Copy, Check, ExternalLink, Loader2, RefreshCw, Share2, Tablet, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { sendLink } from "./share-collection";

interface Status {
  enabled: boolean;
  token?: string;
  code?: string;
  shareToken?: string;
  title?: string;
  count?: number | null;
  saved?: number;
  snapshotAt?: number | null;
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

export function ShelfSettings() {
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; discogs?: boolean } | null>(null);
  const [title, setTitle] = useState("");
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/shelf").then((r) => r.json()).then((b: Status) => { setS(b); setTitle(b.title ?? ""); }).catch(() => setS({ enabled: false }));
  }, []);

  const act = async (action: string, extra: Record<string, unknown> = {}, method = "POST") => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/shelf", {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify({ action, ...extra }) : undefined,
      });
      const b = await res.json();
      if (!res.ok) throw Object.assign(new Error(b.error || "That didn't work"), { discogs: b.discogs === false });
      setS(b);
      setTitle(b.title ?? "");
    } catch (e) {
      setError({ text: e instanceof Error ? e.message : "That didn't work", discogs: (e as { discogs?: boolean }).discogs });
    } finally {
      setBusy(null);
    }
  };

  if (!s) return null;
  const link = s.token ? `${origin}/shelf/${s.token}` : "";

  if (!s.enabled) {
    return (
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex gap-3">
          <Tablet className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Let friends browse your whole record collection — send them a link, or put it on a tablet by the
            shelf. Covers, tracklists, back sleeves; read-only, no notes or prices. Nobody needs to sign in.
          </p>
        </div>
        <Button size="sm" className="rounded-full" onClick={() => act("enable", { title })} disabled={!!busy}>
          {busy === "enable" ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Reading your collection…</> : "Turn on sharing"}
        </Button>
        {error && <ErrorLine error={error} />}
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="shelf-title" className="text-xs font-medium text-muted-foreground">Name on the display</label>
        <input
          id="shelf-title"
          value={title}
          maxLength={60}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title.trim() !== s.title && act("rename", { title: title.trim() })}
          className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {s.shareToken && (
        <div className="space-y-2">
          <div className="flex items-start gap-2.5">
            <Users className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-sm">
              <span className="font-medium">Link for friends</span>
              <span className="block text-xs text-muted-foreground">They browse every record on their own phone. Making a new link stops the old one; the tablet keeps working.</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm" className="rounded-full"
              onClick={async () => {
                const r = await sendLink(`${origin}/shelf/${s.shareToken}`, s.title || "My records");
                if (r === "copied") toast({ title: "Link copied", description: "Send it to a friend." });
                if (r === "failed") toast({ title: "Here's the link", description: `${origin}/shelf/${s.shareToken}` });
              }}
            >
              <Share2 className="w-4 h-4 mr-1.5" /> Send to a friend
            </Button>
            <Button
              size="sm" variant="ghost" className="rounded-full" disabled={!!busy}
              onClick={() => confirm("Make a new friends' link? Anyone with the old one can't open it any more.") && act("rotate-share")}
            >
              New link
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-2.5 pt-3 border-t">
        <Tablet className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p className="text-sm font-medium">Tablet on the shelf</p>
      </div>

      <div className="rounded-lg bg-muted/60 p-3 space-y-1">
        <p className="text-xs text-muted-foreground">On the tablet, go to <span className="font-medium text-foreground">{origin.replace(/^https?:\/\//, "")}/shelf</span> and type</p>
        <p className="font-mono text-2xl tracking-[0.15em] font-semibold select-all">{s.code}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm" variant="outline" className="rounded-full"
          onClick={() => { navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
        >
          {copied ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />} {copied ? "Copied" : "Copy link"}
        </Button>
        {typeof navigator !== "undefined" && "share" in navigator && (
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => navigator.share({ title: s.title, url: link }).catch(() => {})}>
            <Share2 className="w-4 h-4 mr-1.5" /> Send to the tablet
          </Button>
        )}
        <Button asChild size="sm" variant="outline" className="rounded-full">
          <a href={link} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4 mr-1.5" /> Open</a>
        </Button>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          {s.count != null ? `${s.count.toLocaleString()} records` : "Not read yet"}
          {s.snapshotAt ? ` · updated ${ago(s.snapshotAt)}` : ""} · refreshes every 6 hours
          {s.count != null && s.saved != null && s.saved < s.count && ` · saving to the Pi: ${s.saved} of ${s.count}`}
        </span>
        <button className="text-primary font-medium inline-flex items-center gap-1 disabled:opacity-50" disabled={!!busy} onClick={() => act("refresh")}>
          <RefreshCw className={`w-3 h-3 ${busy === "refresh" ? "animate-spin" : ""}`} /> Now
        </button>
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground/80">Setting up the tablet</summary>
        <ul className="mt-2 space-y-1.5 list-disc pl-4">
          <li>Open the shelf, then <b>Add to Home Screen</b> (iPad: Share button; Fire/Android: browser menu). It then opens straight to your shelf, full screen.</li>
          <li>Keep guests on the shelf: on an iPad, <b>Guided Access</b> (Settings → Accessibility); on a Fire tablet, a kiosk browser such as Fully Kiosk.</li>
          <li>Set the tablet&apos;s auto-lock to never while it&apos;s plugged in — the shelf also asks the screen to stay on, and drifts into a slideshow when nobody&apos;s browsing.</li>
        </ul>
      </details>

      <div className="flex flex-wrap gap-2 pt-1 border-t">
        <Button
          size="sm" variant="ghost" className="rounded-full" disabled={!!busy}
          onClick={() => confirm("Make a new tablet code? The old one stops working — the tablet will need the new one.") && act("rotate")}
        >
          New tablet code
        </Button>
        <Button
          size="sm" variant="ghost" className="rounded-full text-destructive" disabled={!!busy}
          onClick={() => confirm("Turn sharing off? The tablet and every friends' link stop showing your records.") && act("off", {}, "DELETE")}
        >
          Turn off
        </Button>
      </div>
      {error && <ErrorLine error={error} />}
    </div>
  );
}

function ErrorLine({ error }: { error: { text: string; discogs?: boolean } }) {
  return (
    <p className="text-sm text-destructive">
      {error.text}
      {error.discogs && <> — <a href="/api/auth/discogs" className="underline font-medium">sign in with Discogs</a></>}
    </p>
  );
}
