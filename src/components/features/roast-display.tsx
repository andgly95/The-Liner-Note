"use client";

// The roast: an archetype, the roast itself, and the evidence. Kept per collection.
import { Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RoastResult } from "@/types/analysis";
import { Failed, RunAgain, Running, ToolHeader, useAnalysis } from "./tool-frame";

interface Props {
  collectionString: string;
  subject?: string;
  isReady: boolean;
}

function Points({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className="font-display text-xl font-semibold mb-2">{title}</h3>
      <ul className="divide-y border-y">
        {items.map((t, i) => (
          <li key={i} className="py-2.5 text-sm text-muted-foreground leading-relaxed">{t}</li>
        ))}
      </ul>
    </section>
  );
}

export function RoastDisplay({ collectionString, subject, isReady }: Props) {
  const a = useAnalysis<RoastResult>("roast", subject);
  const go = () => a.run({ collection: collectionString });
  const r = a.result;

  return (
    <div className="space-y-6">
      <ToolHeader icon={<Flame className="w-5 h-5 text-destructive" />} title="The roast">
        What your collection says about you, said with love.
      </ToolHeader>

      {a.running ? (
        <Running label="Analyzing your taste…" hint="About half a minute." onStop={a.stop} />
      ) : a.error ? (
        <Failed message={a.error} onRetry={go} />
      ) : !r ? (
        !a.loadingSaved && (
          <div className="py-6 text-center space-y-3">
            <Button className="h-11 px-5 rounded-full" disabled={!isReady} onClick={go}>
              <Flame className="w-4 h-4 mr-2" /> Roast my collection
            </Button>
            <p className="text-xs text-muted-foreground">{isReady ? "Funny, not cruel. Mostly." : "Loading your collection…"}</p>
          </div>
        )
      ) : (
        <>
          <section className="text-center space-y-1">
            <p className="section-label">Your collector archetype</p>
            <h3 className="font-display text-2xl font-semibold text-destructive">{r.archetype.title}</h3>
            <p className="text-sm text-muted-foreground">{r.archetype.description}</p>
          </section>

          <section className="whitespace-pre-wrap leading-relaxed">{r.roast}</section>

          <Points title="Taste patterns" items={r.tastePatterns} />
          <Points title="Cliché alert" items={r.clicheAlbums} />
          <section>
            <h3 className="font-display text-xl font-semibold mb-2">Collection balance</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{r.valueDistribution.summary}</p>
            {r.valueDistribution.highlights.length > 0 && (
              <ul className="mt-2 divide-y border-y">
                {r.valueDistribution.highlights.map((t, i) => (
                  <li key={i} className="py-2.5 text-sm text-muted-foreground leading-relaxed">{t}</li>
                ))}
              </ul>
            )}
          </section>

          <RunAgain createdAt={a.createdAt} label="Another roast" onRun={go} />
        </>
      )}
    </div>
  );
}
