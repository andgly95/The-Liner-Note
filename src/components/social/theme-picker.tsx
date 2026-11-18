"use client";

// Choosing how the app looks. Per device (localStorage), applied to <html> —
// the inline script in the root layout re-applies it before first paint.
import { useEffect, useState } from "react";

const THEMES = [
  { id: "paper", label: "Liner notes", blurb: "Warm paper, oxblood ink", bg: "#f6f1e8", ink: "#8f2f22", font: "var(--font-display)" },
  { id: "hardbop", label: "Hard Bop", blurb: "1950s jazz-label blue", bg: "#f4f2ee", ink: "#18449f", font: "var(--font-condensed)" },
] as const;

export const THEME_COLOR: Record<string, string> = { paper: "#f6f1e8", hardbop: "#f4f2ee" };

export function applyTheme(id: string) {
  if (id === "paper") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = id;
  try { localStorage.setItem("ln-theme", id); } catch {}
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[id] ?? THEME_COLOR.paper);
}

export function ThemePicker() {
  const [current, setCurrent] = useState("paper");
  useEffect(() => setCurrent(document.documentElement.dataset.theme || "paper"), []);
  return (
    <div className="grid grid-cols-2 gap-2">
      {THEMES.map((t) => {
        const on = current === t.id;
        return (
          <button
            key={t.id}
            onClick={() => { applyTheme(t.id); setCurrent(t.id); }}
            aria-pressed={on}
            className={`text-left rounded-lg border p-3 transition-shadow ${on ? "ring-2 ring-primary border-transparent" : ""}`}
            style={{ background: t.bg }}
          >
            <span className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full shrink-0" style={{ background: t.id === "hardbop" ? `linear-gradient(${t.ink} 50%, #fff 50%)` : t.ink, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15)" }} />
              <span
                className="text-base font-semibold leading-none"
                style={{ fontFamily: t.font, color: t.ink, textTransform: t.id === "hardbop" ? "uppercase" : undefined }}
              >
                {t.label}
              </span>
            </span>
            <span className="block mt-1.5 text-xs" style={{ color: "#555" }}>{t.blurb}</span>
          </button>
        );
      })}
    </div>
  );
}
