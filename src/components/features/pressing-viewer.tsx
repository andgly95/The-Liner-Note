"use client";

// Every photo of every pressing still in the running, full screen, so you can
// hold the record in one hand and flick through labels with the other.
//
// Discogs' own viewer is one release at a time, a page load each, and small.
// Here the photos are ONE continuous strip: swipe past a pressing's last photo
// and you are on the next pressing's first. Up/down jumps a whole pressing.
// "Not this one" rules it out and moves on — the point is elimination, so it is
// the biggest button. Pinch or double-tap to read a label's small print.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ExternalLink, Loader2, Ban, Undo2, ImageOff } from "lucide-react";
import type { PressingDetail } from "@/lib/pressing";

export interface ViewerPressing {
  id: number;
  label: string;
  catno: string;
  country: string;
  released: string;
  format: string;
}

interface Props {
  pressings: ViewerPressing[];
  start: { id: number; image?: number };
  details: Map<number, PressingDetail>;
  need: (ids: number[]) => void;
  ruledOut: Set<number>;
  onRuleOut: (id: number, out: boolean) => void;
  renderAdd: (id: number) => React.ReactNode;
  onClose: () => void;
}

type Zoom = { s: number; x: number; y: number };
const NO_ZOOM: Zoom = { s: 1, x: 0, y: 0 };

export function PressingViewer({ pressings, start, details, need, ruledOut, onRuleOut, renderAdd, onClose }: Props) {
  // A snapshot of the list at open: ruling one out must not reshuffle what you
  // are paging through (and it can be undone from right here).
  const [order] = useState(() => pressings);
  const [idx, setIdx] = useState(() => Math.max(0, order.findIndex((p) => p.id === start.id)));
  const [img, setImg] = useState(start.image ?? 0);
  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [showRunouts, setShowRunouts] = useState(false);

  const p = order[idx];
  const d = p ? details.get(p.id) : undefined;
  const images = useMemo(() => d?.images ?? [], [d]);
  const out = p ? ruledOut.has(p.id) : false;

  // Load this pressing and the next two; warm the next photos.
  useEffect(() => {
    need(order.slice(idx, idx + 3).map((x) => x.id).filter((id) => !details.has(id)));
  }, [idx, order, details, need]);
  useEffect(() => {
    const warm = [images[img + 1]?.full, details.get(order[idx + 1]?.id)?.images[0]?.full].filter(Boolean) as string[];
    warm.forEach((src) => { const i = new Image(); i.src = src; });
  }, [img, images, idx, order, details]);

  const goPressing = useCallback(
    (to: number, image: "first" | "last" = "first") => {
      if (to < 0 || to >= order.length) return;
      setIdx(to);
      const n = details.get(order[to].id)?.images.length ?? 0;
      setImg(image === "last" ? Math.max(0, n - 1) : 0);
      setZoom(NO_ZOOM);
      setShowRunouts(false);
    },
    [order, details]
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      setZoom(NO_ZOOM);
      if (dir === 1) {
        if (img < images.length - 1) setImg(img + 1);
        else goPressing(idx + 1, "first");
      } else {
        if (img > 0) setImg(img - 1);
        else goPressing(idx - 1, "last");
      }
    },
    [img, images.length, idx, goPressing]
  );

  const ruleOut = useCallback(() => {
    if (!p) return;
    if (out) return onRuleOut(p.id, false);
    onRuleOut(p.id, true);
    // Straight on to the next one still standing.
    const next = order.findIndex((x, i) => i > idx && !ruledOut.has(x.id) && x.id !== p.id);
    if (next !== -1) goPressing(next);
  }, [p, out, onRuleOut, order, idx, ruledOut, goPressing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowDown") { e.preventDefault(); goPressing(idx + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); goPressing(idx - 1); }
      else if (e.key.toLowerCase() === "x") ruleOut();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [step, goPressing, idx, ruleOut, onClose]);

  /* ── gestures: swipe, pinch, pan, double-tap ─────────────────────────── */

  const stage = useRef<HTMLDivElement>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<{ x0: number; y0: number; zoom0: Zoom; dist0?: number; mid0?: { x: number; y: number }; moved: boolean }>();
  const lastTap = useRef(0);

  const localPoint = (x: number, y: number) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: x - r.left - r.width / 2, y: y - r.top - r.height / 2 };
  };

  const onDown = (e: React.PointerEvent) => {
    stage.current?.setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const list = Array.from(pts.current.values());
    if (list.length === 1) {
      g.current = { x0: e.clientX, y0: e.clientY, zoom0: zoom, moved: false };
    } else if (list.length === 2) {
      const [a, b] = list;
      g.current = {
        x0: 0, y0: 0, zoom0: zoom, moved: true,
        dist0: Math.hypot(a.x - b.x, a.y - b.y),
        mid0: localPoint((a.x + b.x) / 2, (a.y + b.y) / 2),
      };
      setDrag(null);
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId) || !g.current) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const list = Array.from(pts.current.values());
    const s0 = g.current.zoom0;
    if (list.length === 2 && g.current.dist0 && g.current.mid0) {
      const [a, b] = list;
      const s = Math.min(6, Math.max(1, (s0.s * Math.hypot(a.x - b.x, a.y - b.y)) / g.current.dist0));
      const m = g.current.mid0;
      // Keep the point between the fingers where it was.
      setZoom(s === 1 ? NO_ZOOM : { s, x: m.x - ((m.x - s0.x) * s) / s0.s, y: m.y - ((m.y - s0.y) * s) / s0.s });
      return;
    }
    const dx = e.clientX - g.current.x0;
    const dy = e.clientY - g.current.y0;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) g.current.moved = true;
    if (s0.s > 1) setZoom({ ...s0, x: s0.x + dx, y: s0.y + dy });
    else setDrag({ dx, dy });
  };

  const onUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    const st = g.current;
    if (!st) return;
    if (pts.current.size === 1) {
      // One finger lifted from a pinch: carry on panning from where we are.
      const [rest] = Array.from(pts.current.values());
      g.current = { x0: rest.x, y0: rest.y, zoom0: zoom, moved: true };
      return;
    }
    if (pts.current.size > 0) return;
    g.current = undefined;
    const dx = e.clientX - st.x0;
    const dy = e.clientY - st.y0;
    setDrag(null);

    if (!st.moved) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        lastTap.current = 0;
        if (zoom.s > 1) setZoom(NO_ZOOM);
        else {
          const at = localPoint(e.clientX, e.clientY);
          setZoom({ s: 2.5, x: -at.x * 1.5, y: -at.y * 1.5 });
        }
      } else lastTap.current = now;
      return;
    }
    if (st.zoom0.s > 1 || zoom.s > 1) return;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
    else if (Math.abs(dy) > 70) goPressing(idx + (dy < 0 ? 1 : -1));
  };

  if (!p) return null;
  const cur = images[img];
  const remaining = order.filter((x) => !ruledOut.has(x.id)).length;

  // Into <body>: an ancestor with a transform would otherwise become the box
  // that "fixed" is relative to, and the page would show around the edges.
  return createPortal(
    <div className="fixed inset-0 z-[60] bg-black text-white flex flex-col select-none" role="dialog" aria-label="Pressing photos">
      {/* Which pressing */}
      <div className="shrink-0 px-3 pt-2 pb-2 bg-black/80" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center gap-2">
          <button onClick={onClose} aria-label="Close" className="p-2 -ml-1 rounded-full hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className={`text-sm font-semibold leading-tight truncate ${out ? "line-through text-white/50" : ""}`}>
              {p.country || "—"} · {p.released || "?"} · {p.label} <span className="font-normal text-white/60">{p.catno}</span>
            </div>
            <div className="text-xs text-white/60 truncate">{d?.formats.join(" + ") || p.format}</div>
          </div>
          <div className="flex items-center">
            <button onClick={() => goPressing(idx - 1)} disabled={idx === 0} aria-label="Previous pressing" className="p-2 rounded-full hover:bg-white/10 disabled:opacity-30">
              <ChevronUp className="w-5 h-5" />
            </button>
            <span className="text-xs tabular-nums text-white/70 w-12 text-center">{idx + 1}/{order.length}</span>
            <button onClick={() => goPressing(idx + 1)} disabled={idx === order.length - 1} aria-label="Next pressing" className="p-2 rounded-full hover:bg-white/10 disabled:opacity-30">
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        </div>
        {d && d.runouts.length > 0 && (
          <button onClick={() => setShowRunouts((v) => !v)} className="mt-1 w-full text-left font-mono text-[11px] text-white/70">
            {showRunouts ? (
              d.runouts.map((r, i) => (
                <div key={i}>{r.side && <span className="font-sans text-white/45">{r.side}: </span>}{r.value}</div>
              ))
            ) : (
              <div className="truncate">
                <span className="font-sans text-white/45">Runouts: </span>
                {d.runouts.map((r) => r.value).join("  ·  ")}
              </div>
            )}
          </button>
        )}
      </div>

      {/* The photo */}
      <div
        ref={stage}
        className="relative flex-1 min-h-0 overflow-hidden touch-none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {!d ? (
          <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Fetching photos…
          </div>
        ) : !cur ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60 text-sm gap-2 p-8 text-center">
            <ImageOff className="w-8 h-8" />
            Nobody has photographed this pressing on Discogs.
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={cur.full}
            src={cur.full}
            alt={`Photo ${img + 1} of ${p.label} ${p.catno}`}
            draggable={false}
            className={`absolute inset-0 m-auto max-w-full max-h-full object-contain ${drag || g.current ? "" : "transition-transform duration-200"} ${out ? "opacity-40" : ""}`}
            style={{
              transform: drag
                ? `translate(${drag.dx}px, ${drag.dy * 0.4}px)`
                : `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`,
            }}
          />
        )}
        {out && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold">
            Ruled out
          </div>
        )}
        {/* Desktop arrows; on a phone you swipe */}
        <button onClick={() => step(-1)} aria-label="Previous photo" className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/70">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button onClick={() => step(1)} aria-label="Next photo" className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/70">
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* This pressing's photos, and what to do about it */}
      <div className="shrink-0 bg-black/80 px-3 pt-2 space-y-2" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        {images.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {images.map((im, i) => (
              <button
                key={im.thumb + i}
                onClick={() => { setImg(i); setZoom(NO_ZOOM); }}
                className={`shrink-0 w-12 h-12 rounded overflow-hidden ring-2 ${i === img ? "ring-white" : "ring-transparent opacity-60"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.thumb} alt="" className="w-full h-full object-cover" draggable={false} />
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={ruleOut}
            className={`flex-1 flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold ${
              out ? "bg-white/15 text-white" : "bg-red-600 text-white"
            }`}
          >
            {out ? <><Undo2 className="w-4 h-4" /> Bring it back</> : <><Ban className="w-4 h-4" /> Not this one</>}
          </button>
          <a
            href={`https://www.discogs.com/release/${p.id}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Open on Discogs"
            className="p-2.5 rounded-full bg-white/10"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <div className="shrink-0">{renderAdd(p.id)}</div>
        </div>
        <div className="text-center text-[11px] text-white/45">
          {remaining} of {order.length} still possible · swipe for photos, up/down for the next pressing
        </div>
      </div>
    </div>,
    document.body
  );
}
