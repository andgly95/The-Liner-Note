# LLM Analysis Pipeline & Features

All AI features call **Anthropic Claude** via the Vercel AI SDK (`ai@4.x`) and the
`@ai-sdk/anthropic` provider, wrapped by `src/lib/anthropic-client.ts`. System
prompts live in `src/lib/prompts.ts`; output contracts are Zod schemas in
`src/lib/analysis-schemas.ts`.

## Feature summary

| Feature | Route | Default model | Override env | Method / stream | Output schema |
|---------|-------|---------------|--------------|-----------------|---------------|
| Roast | `POST /api/analyze` (`roast`) | `claude-haiku-3-5-20241022` | `ANTHROPIC_MODEL` | `streamObject` ✓ | `roastResultSchema` |
| Gap Filler | `POST /api/analyze` (`gap_filler`) | Haiku 3.5 | `ANTHROPIC_MODEL` | `streamObject` ✓ | `gapFillerResultSchema` |
| Oracle | `POST /api/analyze` (`oracle`) | Haiku 3.5 | `ANTHROPIC_MODEL` | `streamObject` ✓ | `oracleResultSchema` |
| Mood | `POST /api/analyze` (`mood`) | Haiku 3.5 | `ANTHROPIC_MODEL` | `streamObject` ✓ | `moodResultSchema` |
| Obscureness | `POST /api/analyze` (`obscureness`) | Haiku 3.5 | `ANTHROPIC_MODEL` | `streamObject` ✓ | `obscurenessResultSchema` |
| Record Shop chat | `POST /api/chat` | `claude-opus-4-7` | `ANTHROPIC_MODEL` | `streamText` ✓ | free text |
| Listening Guide | `POST /api/guide` | `claude-opus-4-7` | `GUIDE_MODEL` | `generateText` (one-shot) | `listeningGuideSchema` |
| Mixtape (narrow) | `POST /api/mixtape` | `claude-sonnet-4-6` | `MIXTAPE_NARROW_MODEL` | `generateObject` | `mixtapeCandidatesSchema` |
| Mixtape (sequence) | `POST /api/mixtape` | `claude-opus-4-7` | `MIXTAPE_SEQUENCE_MODEL` | `streamObject` ✓ | `mixtapeResultSchema` |

> Model assignment is cost/quality-tuned per feature, not unified: cheap
> structured analyses run on **Haiku**; conversational and long-form prose run on
> **Opus 4.7**; the mixtape's fast narrowing pass runs on **Sonnet 4.6**.

## The four one-shot analyses (`POST /api/analyze`)

A single route switches on `type` (`roast | gap_filler | oracle | mood |
obscureness`), selects the system prompt + Zod schema, then `streamObject()`s the
result. `maxDuration = 60`.

### Roast
Witty/sardonic critic. Output: main `roast` (2–3 paragraphs), `archetype`
(`{title, description}`), `tastePatterns[]` (3–5), `clicheAlbums[]`,
`valueDistribution` (`{summary, highlights[]}`).

### Gap Filler
Finds the top **5 core artists** (by album count) and **10–15 missing essential
studio albums** (studio only — no live/comps/EPs), each with `{artist, album,
year, reason}`.

### Oracle (feature-chained)
Predicts **5 likely next purchases** (`source: "wantlist" | "gap_filler"`) and
**5 unexpected suggestions** (`logic: "sideman" | "scene" | "genre_deep_cut"`).
Oracle **consumes Gap Filler's JSON output** as additional context — the client
runs Gap Filler first and passes `gapFillerResults` into the Oracle request
(`buildOraclePrompt(collection, wantlist?, gapFillerResults?)`). Chaining is
client-orchestrated, not automatic on the server.

### Mood
Picks exactly **N albums (1–10)** from the user's *own* collection matching a
free-text mood/setting, each with a specific musical reason. Input adds `mood` and
`count`.

### Obscureness
Scores the collection 1–10 (1 = household names, 10 = private-press), assigns an
`archetype` + `summary`, and lists up to 5 `mostMainstream` and 5 `mostObscure`
items with per-item scores and justifications.

## Record Shop chat (`POST /api/chat`)

Multi-turn conversational owner-of-a-record-shop persona on **Opus 4.7**. Uses
`streamText` + `toDataStreamResponse()`; the client uses `useChat` from
`ai/react`. The static persona prompt (`RECORD_SHOP_SYSTEM_PROMPT`) and the
per-user collection/wantlist context (`buildRecordShopPrompt`) are sent as system
content with **ephemeral prompt caching**, so each turn only pays for the new user
message. History persists to `localStorage` only.

## Listening Guide (`POST /api/guide`)

Input: `{ releaseId }`. Fetches the tracklist (cache-first, see below), then
generates a track-by-track guide: `albumIntro`, `trackGuides[]` (`{position,
title, commentary}`, exact positions/titles from the tracklist), `closing`.

**Why `generateText` + manual JSON parse instead of `generateObject`:** under
`ai@4.x`'s default tool-call mode, Opus 4.7 returns `{value: "<stringified JSON>"}`
rather than the schema shape, and `mode: "json"` is rejected by
`@ai-sdk/anthropic@1.2.12`. The route asks for raw JSON in prose
(`JSON_INSTRUCTION`), extracts the object with `extractJsonObject()`, then
validates with Zod. (This is the same incompatibility noted in project memory.)

## Mixtape (`POST /api/mixtape`) — two stages

Token budget makes a single pass impractical, so the route stages the work:

1. **Narrow (Sonnet 4.6)** — `generateObject` over an indexed collection (capped at
   `MAX_INDEXED_ITEMS = 600`) + mood + target track count (4–12). Returns 6–20
   `candidates` (`{releaseId, artist, album, why}`). The model can hallucinate
   release IDs, so candidates are filtered against an `idIndex`; **≥4 valid**
   candidates are required.
2. **Fetch tracklists** — for valid candidates, cache-first via
   `tracklist-cache.ts`, rate-limited to ~1/s (`DISCOGS_RATE_LIMIT_MS = 1000`;
   cache hits skip the delay). **≥4 successful** fetches required to proceed.
3. **Sequence (Opus 4.7, streamed)** — `streamObject` into `mixtapeResultSchema`:
   `title`, `premise`, `sideA[]`, `sideBreak`, `sideB[]`, `closing`. Each track has
   a `transition` narrative; one track per album, titles used exactly.

## Supporting libraries

### `src/lib/anthropic-client.ts`
Exports `anthropic = createAnthropic({ fetch: stripTemperatureFetch })`. The
wrapper unconditionally strips `temperature` from outbound request bodies because
`ai@4.x` hardcodes `temperature: 0` and Opus 4.7+ **rejects** the parameter; older
models ignore its absence. (See project memory on the `ai@4.x` incompatibilities.)

### `src/lib/optimize-collection.ts`
Compresses each release to `"{Artist} - {Album} ({Year}) [{Genre}]"`. Scores items
by recency (added < 2 yrs), rating (×10), and Vinyl format (+5), sorts by score,
and truncates to a **60k-token** budget for collections (**10k** for wantlists, no
rating/recency weighting) at ~4 chars/token. Sets `truncated` / `truncatedAt` so
the UI can warn. Also exports `findCoreArtists()` and `getCollectionStats()`
(genre/decade/format/artist breakdowns) used by the UI.

### `src/lib/tracklist-cache.ts`
Process-local `Map<number, CachedTracklist>` with **no expiry** — Discogs release
metadata is immutable, so entries accumulate until restart. Shared by the mixtape
and guide routes. (In a serverless/multi-instance deployment this cache would not
be shared across instances.)

### `src/hooks/use-analysis-cache.ts`
`useAnalysisCache<T>(type, username)` — caches analysis results in **sessionStorage**
under `linernote-analysis-{type}-{username}`. Per-tab, per-user (switching users
loads a different cache, preventing cross-user leakage); cleared via
`setCached(null)` or tab close. Lets tab-switching avoid re-running the LLM.

## Schemas & types (`src/lib/analysis-schemas.ts`)

Zod objects with `.describe()` annotations that double as LLM field instructions.
Bounds are deliberately lenient where the model might drift (e.g. Mood 1–12,
mixtape sides 1–8) to avoid validation failures. Result TypeScript types are
exported as `z.infer<>` of each schema (`RoastResult`, `GapFillerResult`,
`OracleResult`, `MoodResult`, `ObscurenessResult`, `ListeningGuideResult`,
`MixtapeCandidatesResult`, `MixtapeResult`, …) — this schema file is the single
source of truth for both validation and types.

## Caching layers at a glance

- **Anthropic ephemeral prompt cache** — system + context messages on chat/analyze
  routes, so re-runs pay only marginal tokens.
- **Server in-memory tracklist cache** — `tracklist-cache.ts`, no expiry.
- **Client sessionStorage** — analysis results per `{type, username}`.
