# The Liner Note — Documentation

The Liner Note is a Next.js 14 (App Router) application that turns a user's
**Discogs** record collection into a set of AI-powered analyses. It follows a
"dumb pipe" philosophy: **Ingest → Compress → Inference**. The server
authenticates with Discogs, fetches the user's full collection/wantlist,
compresses it into token-efficient text, and streams it to Claude for one of
several feature analyses.

## Documentation map

| Doc | Covers |
|-----|--------|
| [01 — Authentication & Discogs Integration](./01-authentication.md) | OAuth 1.0a flow, signing, session cookies, rate-limited pagination, public-collection browsing |
| [02 — LLM Analysis Pipeline & Features](./02-llm-pipeline.md) | All AI features (Roast, Gap Filler, Oracle, Mood, Obscureness, Record Shop, Listening Guide, Mixtape), prompts, schemas, model selection, caching |
| [03 — Frontend & UI](./03-frontend.md) | Dashboard, feature display components, shadcn/ui, theming, client state & persistence |
| [04 — Data Model, Configuration & Deployment](./04-data-model-deployment.md) | TypeScript types, dependencies, env vars, build config, Docker |

## High-level architecture

```
┌──────────────────────┐     OAuth 1.0a      ┌──────────────────────┐
│  Browser (dashboard) │ ◄─────────────────► │   Discogs API        │
└──────────┬───────────┘                     └──────────────────────┘
           │ fetch /api/collection, /api/wantlist
           ▼
┌──────────────────────────────────────────────────────────────────┐
│ Next.js Route Handlers (src/app/api/*)                             │
│  • DiscogsClient (custom OAuth 1.0a, src/lib/discogs.ts)           │
│  • optimizeCollectionForLLM → compressed, token-budgeted text     │
│  • Claude via Vercel AI SDK (src/lib/anthropic-client.ts)         │
└──────────┬───────────────────────────────────────────────────────┘
           │ streamObject / streamText / generateText
           ▼
┌──────────────────────┐
│   Anthropic Claude   │  (Haiku / Sonnet 4.6 / Opus 4.7 per feature)
└──────────────────────┘
```

## Key conventions

- **No database or session store.** All session state lives in the `discogs_session`
  httpOnly cookie (JSON of `{ user, tokens }`). Client-side feature state persists
  to `localStorage` / `sessionStorage` only.
- **Zod schemas are the source of truth.** Analysis result TypeScript types are
  `z.infer<>` of the schemas in `src/lib/analysis-schemas.ts`, keeping runtime
  validation and types in sync.
- **Token budgeting matters.** Collections can be huge; `optimize-collection.ts`
  compresses and truncates to fit a 60k-token budget (10k for wantlists) while
  preserving "collection character."
- **Custom Discogs OAuth.** The `disconnect` package is a dependency but is **not
  used** — all OAuth 1.0a signing is hand-rolled in `src/lib/discogs.ts`.

See [CLAUDE.md](../CLAUDE.md) for build/run commands and contributor guidance.

> These docs were generated from a full multi-agent source analysis of the
> working tree on the `claude/discogs-llm-analysis-DLF5A` branch. Where the code
> and the older `CLAUDE.md` description diverge, the docs reflect the **current
> code**.
