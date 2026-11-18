"use client";

// How you rate: one scale per person, set here rather than chosen per album
// (design/redesign 03). Stars are free; the others come with Premium. Each
// rating keeps the scale it was given on, so this only decides new ones.
import { Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SCALES = [
  { id: "stars5", label: "★ Stars", premium: false },
  { id: "ten", label: "1–10", premium: true },
  { id: "hundred", label: "0–100", premium: true },
  { id: "letter", label: "Letter", premium: true },
];

export function ScaleSetting() {
  const { toast } = useToast();
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Rating scale" className="flex flex-wrap gap-2">
        {SCALES.map((s) => (
          <button
            key={s.id}
            role="radio"
            aria-checked={!s.premium}
            onClick={() => s.premium && toast({ title: "Premium", description: `The ${s.label} scale is coming with Liner Note Premium.` })}
            className={`h-10 px-4 rounded-full text-sm font-medium inline-flex items-center gap-1.5 ${
              s.premium ? "border text-muted-foreground" : "bg-foreground text-background"
            }`}
          >
            {s.premium && <Lock className="w-3.5 h-3.5" />} {s.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Ratings you&apos;ve already given keep the scale they were given on.</p>
    </div>
  );
}
