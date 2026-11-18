"use client";

// Small shared pieces: album covers and the half-star rating.
import Link from "next/link";
import { useState } from "react";
import { Disc3, Star, StarHalf } from "lucide-react";

export const coverUrl = (mbid: string, size: 250 | 500 = 250) =>
  `https://coverartarchive.org/release-group/${mbid}/front-${size}`;

/** A cover from the Cover Art Archive, or a quiet placeholder when it has none. */
export function Cover({ mbid, size = 250, className = "", alt = "" }: { mbid: string; size?: 250 | 500; className?: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`relative aspect-square bg-muted rounded-md overflow-hidden ring-1 ring-black/5 ${className}`}>
      {!failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl(mbid, size)} alt={alt} loading="lazy" className="absolute inset-0 w-full h-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <Disc3 className="absolute inset-0 m-auto w-1/3 h-1/3 text-muted-foreground" />
      )}
    </div>
  );
}

export function AlbumTile({ mbid, title, artist, year, badge }: { mbid: string; title: string; artist?: string; year?: number | null; badge?: React.ReactNode }) {
  return (
    <Link href={`/album/${mbid}`} className="block group">
      <div className="relative">
        <Cover mbid={mbid} alt={`${title}${artist ? ` by ${artist}` : ""}`} />
        {badge && <div className="absolute bottom-1.5 right-1.5">{badge}</div>}
      </div>
      <div className="mt-1.5 text-xs leading-tight">
        <div className="font-medium truncate group-hover:underline">{title}</div>
        <div className="text-muted-foreground truncate">{[artist, year].filter(Boolean).join(" · ")}</div>
      </div>
    </Link>
  );
}

/** Read-only stars for a 0–5 value in halves. */
export function StarsDisplay({ value, className = "w-3.5 h-3.5" }: { value: number; className?: string }) {
  return (
    <span className="inline-flex items-center text-primary" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) =>
        value >= i ? (
          <Star key={i} className={`${className} fill-current`} />
        ) : value >= i - 0.5 ? (
          <StarHalf key={i} className={`${className} fill-current`} />
        ) : (
          <Star key={i} className={`${className} text-muted-foreground/60`} />
        )
      )}
    </span>
  );
}

/**
 * The free rating: five stars, each split into a left and right half so a tap
 * on the left of the fourth star is 3.5. Tapping your current rating clears it.
 */
export function StarsInput({ value, onChange, disabled, size = "w-9 h-9 sm:w-8 sm:h-8", className = "" }: { value: number | null; onChange: (v: number | null) => void; disabled?: boolean; size?: string; className?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div className={`inline-flex items-center ${className}`} onPointerLeave={() => setHover(null)} role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`relative ${size} text-primary`}>
          {shown >= i ? (
            <Star className="w-full h-full fill-current" />
          ) : shown >= i - 0.5 ? (
            <StarHalf className="w-full h-full fill-current" />
          ) : (
            <Star className="w-full h-full text-muted-foreground" strokeWidth={1.5} />
          )}
          {[i - 0.5, i].map((v, half) => (
            <button
              key={v}
              type="button"
              disabled={disabled}
              role="radio"
              aria-checked={value === v}
              aria-label={`${v} stars`}
              className={`absolute inset-y-0 ${half ? "right-0" : "left-0"} w-1/2`}
              onPointerEnter={(e) => e.pointerType === "mouse" && setHover(v)}
              onClick={() => onChange(value === v ? null : v)}
            />
          ))}
        </span>
      ))}
    </div>
  );
}
