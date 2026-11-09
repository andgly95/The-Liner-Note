// Rating scales and ranking modes — one table each, shared by server and client.
//
// Every scale converts to a 0–100 score, so a 4.5-star rating and an 8/10 sit
// on the same axis and the album average means something across everyone. The
// raw value is kept too, so you always see your rating the way you gave it.

export interface Scale {
  id: string;
  label: string;
  premium: boolean;
  /** The values you can pick, low to high. */
  steps: string[];
  toScore: (raw: string) => number | null;
  /** How a 0–100 score reads on this scale (e.g. the community average). */
  fromScore: (score: number) => string;
}

const range = (from: number, to: number, step: number) => {
  const out: string[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(String(Math.round(v * 10) / 10));
  return out;
};
const num = (raw: string, min: number, max: number, step: number) => {
  const v = Number(raw);
  if (!Number.isFinite(v) || v < min || v > max) return null;
  return Math.abs(v / step - Math.round(v / step)) < 1e-6 ? v : null;
};

export const SCALES: Scale[] = [
  {
    // The free scale: half stars, like the apps people already know.
    id: "stars5",
    label: "★ 0.5–5",
    premium: false,
    steps: range(0.5, 5, 0.5),
    toScore: (r) => { const v = num(r, 0.5, 5, 0.5); return v === null ? null : Math.round(v * 20); },
    fromScore: (s) => `${(Math.round(s / 10) / 2).toFixed(1)}★`,
  },
  {
    id: "ten",
    label: "1–10",
    premium: true,
    steps: range(1, 10, 1),
    toScore: (r) => { const v = num(r, 1, 10, 1); return v === null ? null : Math.round(v * 10); },
    fromScore: (s) => `${Math.max(1, Math.round(s / 10))}/10`,
  },
  {
    id: "hundred",
    label: "0–100",
    premium: true,
    steps: range(0, 100, 1),
    toScore: (r) => num(r, 0, 100, 1),
    fromScore: (s) => `${Math.round(s)}`,
  },
  {
    id: "letter",
    label: "Letter grade",
    premium: true,
    steps: ["F", "D", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"],
    toScore: (r) => { const i = ["F", "D", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"].indexOf(r); return i === -1 ? null : i * 10; },
    fromScore: (s) => ["F", "D", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"][Math.max(0, Math.min(10, Math.round(s / 10)))],
  },
];

export const scaleById = (id: string) => SCALES.find((s) => s.id === id);
export const FREE_SCALE = SCALES[0];

export interface RankMode { id: string; label: string; premium: boolean; blurb: string }

// Every mode SAVES an ordered list; the extra shape lives in the payload. That
// is what lets all of them feed one community ranking.
export const RANK_MODES: RankMode[] = [
  { id: "list", label: "List", premium: false, blurb: "Drag tracks into order, best first." },
  { id: "tier", label: "Tiers", premium: true, blurb: "Sort tracks into S, A, B, C, D." },
  { id: "line", label: "Horizontal", premium: true, blurb: "Place tracks along a line — the gaps say how much better." },
  { id: "duel", label: "Head to head", premium: true, blurb: "Pick the better of two until the order falls out." },
];
export const rankModeById = (id: string) => RANK_MODES.find((m) => m.id === id);
