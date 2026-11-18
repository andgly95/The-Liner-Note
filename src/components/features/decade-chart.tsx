"use client";

// Records per decade as a small column chart. Every decade from first to last
// is drawn, empty ones as a hairline: a gap is part of the shape.
const short = (d: number) => `’${String(d).slice(2)}s`;

export function DecadeChart({ counts, height = "h-36" }: { counts: Map<number, number>; height?: string }) {
  if (!counts.size) return null;
  const keys = Array.from(counts.keys());
  const lo = Math.min(...keys);
  const hi = Math.max(...keys);
  const cols = Array.from({ length: (hi - lo) / 10 + 1 }, (_, i) => [lo + i * 10, counts.get(lo + i * 10) ?? 0] as const);
  const peak = Math.max(1, ...cols.map(([, n]) => n));
  return (
    <div role="img" aria-label={cols.filter(([, n]) => n).map(([d, n]) => `${d}s: ${n}`).join(", ")}>
      <div className={`flex items-end gap-1.5 ${height}`}>
        {cols.map(([d, n]) => (
          <div key={d} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1">
            {n > 0 && <span className="text-[11px] tabular-nums text-muted-foreground">{n}</span>}
            <div
              className={`w-full rounded-t ${n > 0 ? "bg-primary" : "bg-border h-px"}`}
              style={n > 0 ? { height: `${Math.max(3, (n / peak) * 100)}%` } : undefined}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {cols.map(([d]) => (
          <span key={d} className="flex-1 min-w-0 text-center text-[11px] font-medium text-muted-foreground">{short(d)}</span>
        ))}
      </div>
    </div>
  );
}
