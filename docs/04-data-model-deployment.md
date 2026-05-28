# Data Model, Configuration & Deployment

## Data model

### Discogs types (`src/types/discogs.ts`)

The contract between the Discogs API, the LLM compressor, and the UI.

- **`DiscogsUser`** — `{ id, username, resource_url, consumer_name, avatar_url? }`.
- **`DiscogsOAuthTokens`** — `{ accessToken, accessTokenSecret }`.
- **`DiscogsSession`** — `{ user, tokens }` (the parsed `discogs_session` cookie).
- **`DiscogsArtist` / `DiscogsLabel` / `DiscogsFormat`** — credit, label
  (incl. `catno`), and physical format metadata.
- **`DiscogsBasicInfo`** — minimal release data on collection/wantlist items:
  `id`, `master_id`, `title`, `year`, `thumb`, `cover_image`, `formats`,
  `artists`, `labels`, `genres[]`, `styles[]`.
- **`DiscogsCollectionItem`** — `{ id, instance_id, date_added, rating,
  basic_information, notes? }`.
- **`DiscogsWantlistItem`** — similar; `notes` is a single optional string.
- **`DiscogsPagination`** — `{ page, pages, per_page, items, urls }`.
- **`DiscogsCollectionResponse` / `DiscogsWantlistResponse`** — `{ pagination,
  releases[] }` / `{ pagination, wants[] }`.
- **`DiscogsTrack` / `DiscogsReleaseDetail`** — tracklist data for guides/mixtapes.
- **`CompressedRelease`** — `{ artist, album, year, genres[], styles[], format,
  dateAdded?, rating? }` (token-efficient).
- **`CompressedCollection`** — `{ username, totalItems, releases[], truncated,
  truncatedAt? }`.

Flow: `DiscogsCollectionItem[]` → `optimizeCollectionForLLM` →
`CompressedCollection` → `collectionToString` → `"Artist - Album (YYYY) [Genre]"`
LLM input.

### Analysis types (`src/types/analysis.ts`)

Re-exports the `z.infer<>` result types from `src/lib/analysis-schemas.ts`
(`RoastResult`, `GapFillerResult`, `OracleResult`, `MoodResult`,
`ObscurenessResult`, `ListeningGuideResult`, mixtape types, …). Also defines:

```ts
type AnalysisType = "roast" | "gap_filler" | "oracle" | "mood" | "obscureness";

interface AnalysisRequest {
  type: AnalysisType;
  collection: string;
  wantlist?: string;
  gapFillerResults?: GapFillerResult; // oracle chaining
}
```

## Dependencies (`package.json`)

| Package | Range | Locked | Notes |
|---------|-------|--------|-------|
| `next` | `14.2.0` | — | App Router |
| `react` / `react-dom` | `^18.3.1` | — | |
| `ai` | `^4.0.0` | `4.3.19` | Vercel AI SDK (v4 — see prompt-mode caveats in doc 02) |
| `@ai-sdk/anthropic` | `^1.0.0` | `1.2.12` | Claude provider |
| `zod` | `^3.25.0` | — | schema validation + type inference |
| `tailwindcss` | `^3.4.7` | — | + `tailwindcss-animate`, `autoprefixer`, `postcss` |
| `@radix-ui/react-*` | 1.1–2.1 | — | shadcn/ui primitives |
| `lucide-react` | `^0.400.0` | — | icons |
| `react-markdown` | `^10.1.0` | — | chat / guide rendering |
| `clsx`, `class-variance-authority`, `tailwind-merge` | — | — | `cn()` styling utilities |
| `disconnect` | (present) | — | **declared but unused** — OAuth is hand-rolled |

Dev: `typescript ^5`, `@types/*`, `eslint ^8` + `eslint-config-next@14.2.0`.

**Notable:** no NextAuth.js and no usage of `disconnect`; auth is fully custom.

## npm scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `next dev` | dev server, hot reload |
| `build` | `next build` | standalone production build |
| `start` | `next start` | run built app |
| `lint` | `next lint` | ESLint (`next/core-web-vitals`) |

No test suite is configured.

## Environment variables (`.env.example`)

**Required:** `DISCOGS_CONSUMER_KEY`, `DISCOGS_CONSUMER_SECRET`,
`ANTHROPIC_API_KEY`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_APP_URL` (also
`NEXTAUTH_URL` in the example).

**Optional / model overrides:** `ANTHROPIC_MODEL` (analyze + chat defaults),
`GUIDE_MODEL`, `MIXTAPE_NARROW_MODEL`, `MIXTAPE_SEQUENCE_MODEL` (see doc 02).

> `NEXTAUTH_SECRET` is documented/required but **not used** in code (no NextAuth) —
> a legacy/reserved artifact. `NEXT_PUBLIC_APP_URL` must be `https://` in
> production so the session cookie sets `secure: true`, and must match the URL
> registered with the Discogs app.

## Build configuration

- **`next.config.js`** — `output: 'standalone'` (lean Docker artifact);
  `images.remotePatterns` whitelists `i.discogs.com` (covers) and
  `st.discogs.com` (thumbs).
- **`tsconfig.json`** — `strict`, `noEmit`, `moduleResolution: "bundler"`, JSX
  preserved, path alias `@/* → ./src/*`, Next.js TS plugin.
- **`tailwind.config.ts`** — class-based dark mode, HSL CSS-variable colors (incl.
  `--vinyl`), `spin-slow` + accordion animations, `tailwindcss-animate`.
- **`components.json`** — shadcn defaults: RSC + TSX, base color slate, CSS
  variables, aliases (`@/components`, `@/lib`, `@/components/ui`, `@/hooks`).
- **`postcss.config.js`** — tailwindcss + autoprefixer.
- **`.eslintrc.json`** — extends `next/core-web-vitals`.
- No `middleware.ts` — routing/auth handled inside route handlers + components.

## Deployment (Docker)

- **`Dockerfile`** — multi-stage on `node:20-alpine`:
  1. `deps` — `npm ci` against `package*.json` (+ `libc6-compat`).
  2. `builder` — copies deps + source, `npm run build` (telemetry off).
  3. `runner` — production env, non-root `nextjs` user (uid 1001), copies
     `public/`, `.next/standalone`, `.next/static`; `EXPOSE 3000`; runs
     `node server.js`.
- **`docker-compose.yml`** — builds from the repo, maps `3000:3000`, injects the
  five required env vars from the host shell (no `env_file`), `restart:
  unless-stopped`. Vars are injected at **runtime**, so one image works across
  environments.

## Notable discrepancies

1. `NEXTAUTH_SECRET` required but unused.
2. `disconnect` declared but unused; OAuth is custom (`src/lib/discogs.ts`).
3. `ai` resolves to `4.3.19`; the v4 prompt-mode quirks drive the temperature
   strip and the guide route's `generateText` + manual-JSON workaround (doc 02).
4. Tracklist cache is in-memory/no-expiry — fine for single-instance, not shared
   across serverless instances.
5. Image optimization is restricted to the two Discogs CDN hosts.
