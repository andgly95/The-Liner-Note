import { streamText } from "ai";
import { anthropic } from "@/lib/anthropic-client";
import { pressingDetails } from "@/lib/pressing-server";
import { MAX_IDENTIFY, type PressingDetail } from "@/lib/pressing";
import { PRESSING_ID_SYSTEM_PROMPT, buildPressingIdPrompt } from "@/lib/prompts";
import { sessionOrNull, unauthorized } from "../_session";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MODEL = process.env.PRESSING_MODEL || "claude-opus-5-5";

function block(p: PressingDetail): string {
  const lines = [
    `### Release ${p.id}: ${p.country ?? "?"} ${p.released || p.year || "?"}`,
    `Label/cat#: ${p.labels.join("; ") || "—"}`,
    `Format: ${p.formats.join(" + ") || "—"}`,
    p.runouts.length
      ? `Runouts: ${p.runouts.map((r) => `${r.side ? `${r.side}: ` : ""}${r.value}`).join(" | ")}`
      : "Runouts: none recorded",
  ];
  if (p.otherIds.length) lines.push(`Other identifiers: ${p.otherIds.map((i) => `${i.type}${i.description ? ` (${i.description})` : ""}: ${i.value}`).join(" | ")}`);
  if (p.companies.length) lines.push(`Companies: ${p.companies.join("; ")}`);
  if (p.notes) lines.push(`Notes: ${p.notes}`);
  return lines.join("\n");
}

// A follow-up conversation: [guide, what I see, reply, what I see, …]. The
// client keeps it; the server rebuilds the shortlist from the guide's ids
// (cached) and checks the turns alternate, starting with the guide and ending
// with the person.
const MAX_TURNS = 41; // the guide + 20 exchanges
interface Turn { role: "assistant" | "user"; content: string; standing?: unknown }

function followUps(raw: unknown, ids: number[]): { role: "assistant" | "user"; content: string }[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_TURNS) return null;
  const known = new Set(ids);
  const out: { role: "assistant" | "user"; content: string }[] = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i] as Turn;
    const role = i % 2 === 0 ? "assistant" : "user";
    if (!t || t.role !== role || typeof t.content !== "string") return null;
    if (role === "assistant") {
      out.push({ role, content: t.content.slice(0, 30000).trim() || "(no reply)" });
    } else {
      const standing = Array.isArray(t.standing) ? t.standing.map(Number).filter((n) => known.has(n)) : ids;
      const said = t.content.slice(0, 1000).trim();
      if (!said) return null;
      out.push({
        role,
        content: `Still in the running (${standing.length}): ${standing.join(", ")}\n\nOn my copy / my question: ${said}`,
      });
    }
  }
  if (out.length && out[out.length - 1].role !== "user") return null;
  return out;
}

export async function POST(req: Request) {
  const session = await sessionOrNull();
  if (!session) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body.ids)
    ? body.ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0).slice(0, MAX_IDENTIFY)
    : [];
  if (ids.length < 1) return Response.json({ error: "No pressings to compare" }, { status: 400 });
  const master = String(body.master || "").slice(0, 200);
  const filters = String(body.filters || "").slice(0, 300);
  const history = followUps(body.history, ids);
  if (!history) return Response.json({ error: "That conversation doesn't add up — start the guide again" }, { status: 400 });

  // Normally all cached already — the browser loaded them to show the list.
  const { details } = await pressingDetails(ids, session.tokens);
  if (!details.length) return Response.json({ error: "Could not load those pressings" }, { status: 502 });

  // The shortlist is the same on every turn of a conversation: cache it.
  const cache = { anthropic: { cacheControl: { type: "ephemeral" as const } } };
  const result = streamText({
    model: anthropic(MODEL),
    messages: [
      { role: "system", content: PRESSING_ID_SYSTEM_PROMPT, providerOptions: cache },
      {
        role: "user",
        content: buildPressingIdPrompt(master, filters, details.map(block).join("\n\n")),
        ...(history.length ? { providerOptions: cache } : {}),
      },
      ...history,
    ],
  });
  return result.toTextStreamResponse();
}
