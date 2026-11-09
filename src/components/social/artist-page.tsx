"use client";

// An artist's discography. Studio albums by default — MusicBrainz lists 300
// release groups for the Beatles, most of them EPs and compilations, and
// "the discography" means the albums.
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { AlbumTile, StarsDisplay } from "./bits";

interface Disco {
  artist: { mbid: string; name: string; disambig: string | null };
  albums: { mbid: string; title: string; year: number | null; type: string | null; secondary: string | null }[];
  mine: Record<string, { raw: string | null; scale: string | null }>;
}

const KINDS = [
  { id: "albums", label: "Albums", test: (a: Disco["albums"][number]) => a.type === "Album" && !a.secondary },
  { id: "eps", label: "EPs", test: (a: Disco["albums"][number]) => a.type === "EP" && !a.secondary },
  { id: "live", label: "Live", test: (a: Disco["albums"][number]) => !!a.secondary?.includes("Live") },
  { id: "comp", label: "Compilations", test: (a: Disco["albums"][number]) => !!a.secondary?.includes("Compilation") },
  { id: "all", label: "Everything", test: () => true },
] as const;

export function ArtistPage({ mbid }: { mbid: string }) {
  const [d, setD] = useState<Disco | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("albums");

  useEffect(() => {
    fetch(`/api/artists/${mbid}`)
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error); setD(b); })
      .catch((e) => setError(e.message || "Couldn't load that artist"));
  }, [mbid]);

  const counts = useMemo(() => Object.fromEntries(KINDS.map((k) => [k.id, d ? d.albums.filter(k.test).length : 0])), [d]);
  // Land on a non-empty shelf: an artist with no studio albums opens on EPs, etc.
  useEffect(() => {
    if (d && counts.albums === 0) setKind((KINDS.find((k) => counts[k.id] > 0)?.id ?? "all") as typeof kind);
  }, [d, counts]);

  if (error) return <p className="text-center text-muted-foreground py-16">{error}</p>;
  if (!d) return <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin" /><span className="text-sm">Fetching the discography…</span></div>;

  const shown = d.albums.filter(KINDS.find((k) => k.id === kind)!.test);
  const heard = d.albums.filter((a) => d.mine[a.mbid]).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-semibold">{d.artist.name}</h1>
        <p className="text-sm text-muted-foreground">
          {d.artist.disambig && <>{d.artist.disambig} · </>}
          {(() => {
            const heardHere = shown.filter((a) => d.mine[a.mbid]).length;
            return heard > 0 ? `You've heard ${heardHere} of these ${shown.length}` : `${shown.length} ${KINDS.find((k) => k.id === kind)!.label.toLowerCase()}`;
          })()}
        </p>
      </div>
      <div className="-mx-4 px-4 scroll-px-4 flex gap-1.5 overflow-x-auto no-scrollbar">
        {KINDS.filter((k) => counts[k.id] > 0).map((k) => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${kind === k.id ? "bg-foreground text-background font-medium" : "border text-muted-foreground"}`}
          >
            {k.label} <span className="opacity-60 tabular-nums">{counts[k.id]}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {shown.map((a) => {
          const m = d.mine[a.mbid];
          return (
            <div key={a.mbid} className={m ? "" : "opacity-90"}>
              <AlbumTile mbid={a.mbid} title={a.title} year={a.year} />
              {m?.raw && m.scale === "stars5" ? (
                <div className="mt-0.5"><StarsDisplay value={Number(m.raw)} className="w-3 h-3" /></div>
              ) : m ? (
                <div className="mt-0.5 text-[11px] text-primary font-medium">Heard</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
