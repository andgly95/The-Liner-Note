"use client";

// Obscureness: one score, where the whole collection sits (five bands, every
// record counted), and the ends of the scale. Kept per collection.
import { Telescope } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ObscurenessItem, ObscurenessResult } from "@/types/analysis";
import { AlbumPick, Failed, RunAgain, Running, ToolHeader, useAnalysis } from "./tool-frame";

const BANDS: { key: keyof ObscurenessResult["spread"]; label: string; range: string }[] = [
  { key: "household", label: "Household names", range: "1–2" },
  { key: "canon", label: "The canon", range: "3–4" },
  { key: "genre", label: "Known in the genre", range: "5–6" },
  { key: "cult", label: "Cult records", range: "7–8" },
  { key: "deep", label: "Deep in the crates", range: "9–10" },
];

interface Props {
  collectionString: string;
  subject?: string;
  isReady: boolean;
}

function Ends({ title, items }: { title: string; items: ObscurenessItem[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      <ul className="mt-2 divide-y border-y">
        {items.map((it) => (
          <AlbumPick key={`${it.artist}|${it.album}`} artist={it.artist} album={it.album} tag={<span className="text-xs text-muted-foreground tabular-nums">{it.score}/10</span>}>
            {it.why}
          </AlbumPick>
        ))}
      </ul>
    </section>
  );
}

export function ObscurenessDisplay({ collectionString, subject, isReady }: Props) {
  const a = useAnalysis<ObscurenessResult>("obscureness", subject);
  const go = () => a.run({ collection: collectionString });
  const r = a.result;
  // Saved before the spread existed? Then there's simply no spread to draw.
  const spread = r?.spread;
  const total = spread ? BANDS.reduce((n, b) => n + (spread[b.key]?.count ?? 0), 0) : 0;
  const top = spread ? Math.max(1, ...BANDS.map((b) => spread[b.key]?.count ?? 0)) : 1;

  return (
    <div className="space-y-6">
      <ToolHeader icon={<Telescope className="w-5 h-5 text-primary" />} title="Obscureness">
        How far from the mainstream your collection goes, record by record.
      </ToolHeader>

      {a.running ? (
        <Running label="Measuring how deep you've gone…" hint="Under a minute — it scores every record." onStop={a.stop} />
      ) : a.error ? (
        <Failed message={a.error} onRetry={go} />
      ) : !r ? (
        !a.loadingSaved && (
          <div className="py-6 text-center space-y-3">
            <Button className="h-11 px-5 rounded-full" disabled={!isReady} onClick={go}>
              <Telescope className="w-4 h-4 mr-2" /> Score my collection
            </Button>
            <p className="text-xs text-muted-foreground">{isReady ? "Casual listener or crate-digger lifer?" : "Loading your collection…"}</p>
          </div>
        )
      ) : (
        <>
          <section className="text-center space-y-2">
            <div className="font-display text-5xl font-semibold tabular-nums">
              {r.overallScore.toFixed(1)}
              <span className="text-xl text-muted-foreground"> / 10</span>
            </div>
            <div className="text-lg font-medium text-primary">{r.archetype}</div>
            <p className="text-sm text-muted-foreground text-left">{r.summary}</p>
          </section>

          {spread && total > 0 && (
            <section aria-label="Where the collection sits">
              <h3 className="font-display text-xl font-semibold mb-3">Where it all sits</h3>
              <ul className="space-y-3.5">
                {BANDS.map((b) => {
                  const band = spread[b.key];
                  const n = band?.count ?? 0;
                  return (
                    <li key={b.key}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span>
                          {b.label} <span className="text-muted-foreground">· {b.range}</span>
                        </span>
                        <span className="text-muted-foreground tabular-nums">{n}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(n / top) * 100}%` }} />
                      </div>
                      {band?.examples?.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1.5 truncate">{band.examples.join(" · ")}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <Ends title="Most obscure" items={r.mostObscure} />
          <Ends title="Most mainstream" items={r.mostMainstream} />

          <RunAgain createdAt={a.createdAt} onRun={go} />
        </>
      )}
    </div>
  );
}
