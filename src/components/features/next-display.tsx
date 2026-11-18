"use client";

// What to get next — Gap filler and the Oracle as one run: finish your core
// artists' runs, what to get first from your wantlist, and records you don't
// know you want yet. Nothing you own or already want (checked on the server);
// every album taps through to its page, and the run is kept.
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NextResult } from "@/types/analysis";
import { AlbumPick, Chip, Failed, RunAgain, Running, ToolHeader, useAnalysis } from "./tool-frame";

const LOGIC: Record<NextResult["discoveries"][number]["logic"], string> = {
  sideman: "Who plays on your records",
  scene: "Deeper in a scene you collect",
  deep_cut: "Past the classics you own",
};

interface Props {
  collectionString: string;
  wantlistString?: string;
  wantlistReady: boolean;
  subject?: string;
  isReady: boolean;
}

export function NextDisplay({ collectionString, wantlistString, wantlistReady, subject, isReady }: Props) {
  const a = useAnalysis<NextResult>("next", subject);
  const go = () => a.run({ collection: collectionString, wantlist: wantlistString });
  const r = a.result;

  return (
    <div className="space-y-6">
      <ToolHeader icon={<Sparkles className="w-5 h-5 text-primary" />} title="What to get next">
        The gaps in your favourite artists&apos; runs, what to get first from your wantlist, and records you don&apos;t
        know you want yet.
      </ToolHeader>

      {a.running ? (
        <Running label="Reading your shelves…" hint="About half a minute." onStop={a.stop} />
      ) : a.error ? (
        <Failed message={a.error} onRetry={go} />
      ) : !r ? (
        !a.loadingSaved && (
          <div className="py-6 text-center space-y-3">
            <Button className="h-11 px-5 rounded-full" disabled={!isReady || !wantlistReady} onClick={go}>
              <Sparkles className="w-4 h-4 mr-2" /> Find what&apos;s next
            </Button>
            <p className="text-xs text-muted-foreground">
              {!isReady ? "Loading your collection…" : !wantlistReady ? "Loading your wantlist…" : "Takes about half a minute."}
            </p>
          </div>
        )
      ) : (
        <>
          {r.coreArtists.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Built around{" "}
              {r.coreArtists.map((c, i) => (
                <span key={c.name}>
                  {i > 0 && (i === r.coreArtists.length - 1 ? " and " : ", ")}
                  <span className="text-foreground font-medium">{c.name}</span> ({c.owned})
                </span>
              ))}
              .
            </p>
          )}

          {r.finishTheRun.length > 0 && (
            <section>
              <h3 className="font-display text-xl font-semibold">Finish the run</h3>
              <p className="text-sm text-muted-foreground">Studio albums your favourite artists&apos; runs are missing</p>
              <ul className="mt-2 divide-y border-y">
                {r.finishTheRun.map((p) => (
                  <AlbumPick key={`${p.artist}|${p.album}`} artist={p.artist} album={p.album} year={p.year}>
                    {p.reason}
                  </AlbumPick>
                ))}
              </ul>
            </section>
          )}

          {r.fromWantlist.length > 0 && (
            <section>
              <h3 className="font-display text-xl font-semibold">From your wantlist</h3>
              <p className="text-sm text-muted-foreground">The ones to get first</p>
              <ul className="mt-2 divide-y border-y">
                {r.fromWantlist.map((p) => (
                  <AlbumPick key={`${p.artist}|${p.album}`} artist={p.artist} album={p.album}>
                    {p.reason}
                  </AlbumPick>
                ))}
              </ul>
            </section>
          )}

          {r.discoveries.length > 0 && (
            <section>
              <h3 className="font-display text-xl font-semibold">You don&apos;t know you want these yet</h3>
              <ul className="mt-2 divide-y border-y">
                {r.discoveries.map((p) => (
                  <AlbumPick
                    key={`${p.artist}|${p.album}`}
                    artist={p.artist}
                    album={p.album}
                    year={p.year}
                    tag={<Chip tone="primary">{LOGIC[p.logic]}</Chip>}
                  >
                    {p.reason}
                  </AlbumPick>
                ))}
              </ul>
            </section>
          )}

          <RunAgain createdAt={a.createdAt} onRun={go} />
        </>
      )}
    </div>
  );
}
