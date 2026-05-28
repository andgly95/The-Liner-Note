# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Next.js dev server on http://localhost:3000
- `npm run build` — production build (uses `output: 'standalone'` for Docker)
- `npm run lint` — `next lint` (ESLint with `next/core-web-vitals`)
- `npm start` — run the built app
- No test suite is configured.

Required env vars (see `.env.example`): `DISCOGS_CONSUMER_KEY`, `DISCOGS_CONSUMER_SECRET`, `ANTHROPIC_API_KEY`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_APP_URL`. Optional: `ANTHROPIC_MODEL` overrides the per-route default.

## Architecture

Next.js 14 App Router app implementing a "dumb pipe": **Ingest → Compress → Inference**. The user authenticates with Discogs, the server fetches their full collection/wantlist, compresses it into a token-efficient string, and streams it to Claude for one of four feature analyses.

### Auth (Discogs OAuth 1.0a)

`src/lib/discogs.ts` implements OAuth 1.0a from scratch (HMAC-SHA1, percent-encoding, signature base string). The `disconnect` package is a dependency but is **not** used — all signing is custom in this file. The flow:

1. `GET /api/auth/discogs` → request token, set as `discogs_request_token` / `_secret` cookies, redirect to Discogs.
2. `GET /api/auth/discogs/callback` → exchange verifier for access tokens, fetch identity, store `discogs_session` cookie (JSON of `{user, tokens}`, 30-day, `httpOnly`, `secure` only when `NEXT_PUBLIC_APP_URL` is https).
3. All subsequent API routes read and parse `discogs_session` directly — there's no DB or session store.

Rate limiting: `getFullCollection` / `getFullWantlist` paginate at 100 items/page with a hard-coded 1s `setTimeout` between pages to stay under Discogs' 60 req/min limit. Large collections take real wall time — keep this in mind when changing fetch logic.

The `?username=` query param on `/api/collection` and `/api/wantlist` lets the authenticated user browse **any public** Discogs collection using their own tokens. The `UserSwitcher` component stores friends' usernames in `localStorage` only.

### Token optimization (`src/lib/optimize-collection.ts`)

Collections can be huge; the LLM context isn't. `optimizeCollectionForLLM` compresses each release to `"{Artist} - {Album} ({Year}) [{Genre}]"`, scores items (recently added + high rating + Vinyl format = higher), sorts by score, and truncates to fit `MAX_COLLECTION_TOKENS` (60k, est. 4 chars/token). The result preserves "collection character" rather than being a uniform sample. `CompressedCollection.truncated` / `truncatedAt` flag whether truncation happened so the UI can surface it.

### LLM routes — two distinct patterns

- **`POST /api/analyze`** (`roast` | `gap_filler` | `oracle`): one-shot, expects JSON output. System prompts in `src/lib/prompts.ts` instruct Claude to emit a specific JSON shape; the feature display components (`roast-display.tsx`, `gap-filler-display.tsx`, `oracle-display.tsx`) parse the streamed text. Default model: `claude-haiku-3-5-20241022` (cost). The `oracle` type chains: it consumes the `gap_filler` JSON output as additional context, so gap_filler must run first to feed it.
- **`POST /api/chat`** (Record Shop): multi-turn conversational, uses `useChat` from `ai/react`. Default model: `claude-opus-4-5-20251101`. Collection + wantlist are jammed into the system prompt every turn (no caching). Conversation history persists to `localStorage` only.

Both routes use Vercel AI SDK's `streamText` + `toDataStreamResponse()` and have `maxDuration = 60`. Auth check is just "does `discogs_session` cookie exist and parse" — the tokens are passed implicitly via the cookie that's already in scope, not re-validated against Discogs.

### Frontend

- `src/app/dashboard/page.tsx` is the single-page app: fetches collection + wantlist on mount, holds them in React state, passes the precomputed `collectionString` down to each feature tab. Switching the viewed user clears all derived state.
- `src/components/ui/*` is shadcn/ui (Radix primitives + Tailwind), configured via `components.json`. New UI components should follow the same `cn()` + `class-variance-authority` pattern.
- Tailwind config uses CSS variables for theming (defined in `src/app/globals.css`).

### Deployment

`Dockerfile` is multi-stage, relies on `output: 'standalone'` in `next.config.js`. `docker-compose.yml` reads env vars from the host shell (no `env_file`). When OAuth callback fails in production, check that `NEXT_PUBLIC_APP_URL` matches what's registered with the Discogs app and is `https://` so the session cookie sets `secure: true`.
