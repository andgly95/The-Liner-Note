"use client";

// Ranking an album's tracks, the free way: one list, best first. Drag a row by
// its handle (touch or mouse), or nudge it with the arrows — the arrows are
// also what a keyboard or screen reader uses.
import { useCallback, useRef, useState } from "react";
import { GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface RankTrack { key: string; number: string; title: string; length_ms: number | null }

export const fmtLength = (ms: number | null) =>
  ms ? `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}` : "";

export function RankEditor({
  tracks,
  initial,
  saving,
  onSave,
  onCancel,
}: {
  tracks: RankTrack[];
  initial: string[];
  saving: boolean;
  onSave: (order: string[]) => void;
  onCancel: () => void;
}) {
  const byKey = new Map(tracks.map((t) => [t.key, t]));
  const [order, setOrder] = useState<string[]>(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());

  const move = useCallback((key: string, to: number) => {
    setOrder((o) => {
      const from = o.indexOf(key);
      if (from === -1 || to < 0 || to >= o.length || from === to) return o;
      const next = o.slice();
      next.splice(from, 1);
      next.splice(to, 0, key);
      return next;
    });
  }, []);

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const y = e.clientY;
    // Where would the dragged row go? Count the other rows whose middle is above the pointer.
    let to = 0;
    for (const k of order) {
      if (k === dragging) continue;
      const el = rows.current.get(k);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.top + r.height / 2 < y) to++;
    }
    move(dragging, to);
    // Keep the list moving under the finger near the edges of the screen.
    if (y < 90) window.scrollBy(0, -12);
    else if (y > window.innerHeight - 140) window.scrollBy(0, 12);
  };

  return (
    <div onPointerMove={onPointerMove} onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)}>
      <ol className="divide-y rounded-lg border bg-background select-none">
        {order.map((key, i) => {
          const t = byKey.get(key)!;
          const isDragging = dragging === key;
          return (
            <li
              key={key}
              ref={(el) => { if (el) rows.current.set(key, el); else rows.current.delete(key); }}
              className={`flex items-center gap-2 pl-1 pr-1.5 py-1.5 transition-colors ${isDragging ? "bg-primary/10 shadow-md relative z-10" : ""}`}
            >
              <button
                type="button"
                aria-label={`Drag ${t.title}`}
                className="touch-none cursor-grab active:cursor-grabbing p-2 text-muted-foreground"
                onPointerDown={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  setDragging(key);
                }}
              >
                <GripVertical className="w-4 h-4" />
              </button>
              <span className={`w-7 shrink-0 text-right font-display text-lg tabular-nums ${i < 3 ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{t.title}</span>
                <span className="block text-xs text-muted-foreground">
                  Track {t.number}{t.length_ms ? ` · ${fmtLength(t.length_ms)}` : ""}
                </span>
              </span>
              <span className="flex flex-col">
                <button type="button" aria-label={`Move ${t.title} up`} disabled={i === 0} onClick={() => move(key, i - 1)} className="p-0.5 text-muted-foreground disabled:opacity-25">
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button type="button" aria-label={`Move ${t.title} down`} disabled={i === order.length - 1} onClick={() => move(key, i + 1)} className="p-0.5 text-muted-foreground disabled:opacity-25">
                  <ChevronDown className="w-4 h-4" />
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="sticky bottom-20 md:bottom-4 mt-3 flex gap-2 justify-end">
        <Button variant="outline" className="rounded-full bg-background" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button className="rounded-full shadow-md" onClick={() => onSave(order)} disabled={saving}>
          {saving ? "Saving…" : "Save ranking"}
        </Button>
      </div>
    </div>
  );
}
