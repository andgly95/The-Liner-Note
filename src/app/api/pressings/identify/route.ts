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

  // Normally all cached already — the browser loaded them to show the list.
  const { details } = await pressingDetails(ids, session.tokens);
  if (!details.length) return Response.json({ error: "Could not load those pressings" }, { status: 502 });

  const result = streamText({
    model: anthropic(MODEL),
    messages: [
      {
        role: "system",
        content: PRESSING_ID_SYSTEM_PROMPT,
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" as const } } },
      },
      { role: "user", content: buildPressingIdPrompt(master, filters, details.map(block).join("\n\n")) },
    ],
  });
  return result.toTextStreamResponse();
}
