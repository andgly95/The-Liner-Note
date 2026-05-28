# The Liner Note

AI-powered analysis of your Discogs record collection. Get roasted, find the gaps
in your vinyl obsession, build sequenced mixtapes, and discover what you should be
hunting for next.

## Features

### The Roast
Analyze your collection for taste patterns, cliché albums, and value distribution.
Receive a humorous, personalized roast and discover your "Collector Archetype."

### Gap Filler
Identify your top 5 "Core Artists" by volume and surface the critical studio
albums missing from those discographies.

### The Oracle
- **Predict your next 5 purchases** from your wantlist or gap-filler results.
- **5 "albums you don't know you want yet"** using sideman, scene, and
  genre-deep-cut logic. Feeds on Gap Filler output for sharper predictions.

### Mood
Tell it a mood or setting ("rainy day melancholy", "late night focus") and it
picks albums **from your own collection** that fit, with a specific musical reason
for each.

### Obscureness
Scores your collection on a mainstream→obscure spectrum (1–10), assigns an
archetype, and calls out your most mainstream and most obscure records.

### Listening Guide
Generates track-by-track liner notes for any album in your collection — what to
listen for, session context, and legacy. Saved locally and exportable to Markdown.

### Mixtape
Builds a sequenced Side A / Side B mixtape from your collection around a theme,
with a written transition explaining how each track leads into the next. A
two-stage pipeline (narrow → sequence) keeps it within the token budget.

### Collection Browser
Search, filter (genre/decade/format), and sort your whole collection, with live
breakdown stats and a "surprise me" random pick.

### Record Shop (Chat)
A multi-turn conversation with an AI record-shop owner about pressings, editions,
collectibility, and recommendations — grounded in your collection and wantlist.
Conversations are saved locally.

Plus: **browse any public Discogs collection** by adding friends' usernames.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS + shadcn/ui (Radix primitives)
- **Authentication**: Discogs OAuth 1.0a (hand-rolled HMAC-SHA1 signing)
- **AI**: Vercel AI SDK + Anthropic Claude (Haiku / Sonnet 4.6 / Opus 4.7,
  tuned per feature for cost vs. quality)
- **Validation**: Zod schemas as the source of truth for analysis result types
- **Data**: Discogs API for collection, wantlist, and release tracklists

## Getting Started

### Prerequisites

1. Create a Discogs application at https://www.discogs.com/settings/developers
2. Get an Anthropic API key from https://console.anthropic.com/

### Installation

```bash
npm install
```

### Configuration

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env.local
```

Required environment variables:
- `DISCOGS_CONSUMER_KEY` — your Discogs app consumer key
- `DISCOGS_CONSUMER_SECRET` — your Discogs app consumer secret
- `ANTHROPIC_API_KEY` — your Anthropic API key
- `NEXTAUTH_SECRET` — a random secret (`openssl rand -base64 32`)
- `NEXT_PUBLIC_APP_URL` — your app URL (`http://localhost:3000` for development;
  must be `https://` in production so the session cookie is `secure`)

Optional model overrides (sensible defaults are built in):
- `ANTHROPIC_MODEL` — default model for the analyze + chat routes
- `GUIDE_MODEL`, `MIXTAPE_NARROW_MODEL`, `MIXTAPE_SEQUENCE_MODEL` — per-feature
  overrides

### Development

```bash
npm run dev    # dev server on http://localhost:3000
npm run build  # production (standalone) build
npm start      # run the built app
npm run lint   # ESLint (next/core-web-vitals)
```

No test suite is configured.

## Architecture

The app follows a "dumb pipe" architecture: **Ingest → Compress → Inference**.

1. **Ingest** — fetch the user's full Discogs collection and wantlist via OAuth
   (paginated, rate-limited to stay under Discogs' 60 req/min).
2. **Compress** — map each release to a token-efficient
   `"{Artist} - {Album} ({Year}) [{Genre}]"` string.
3. **Inference** — stream the compressed data to Claude for analysis,
   categorization, and recommendations.

Session state lives entirely in an httpOnly `discogs_session` cookie — there is no
database. Client-side feature state (chats, saved guides, friends, cached
analyses) persists to `localStorage` / `sessionStorage`.

### Token optimization

`optimizeCollectionForLLM` handles large collections by prioritizing recently
added and high-rated items (with a slight bonus for vinyl), then truncating to fit
the token budget while preserving the collection's "character." Truncation is
flagged so the UI can surface it.

## Deployment

A multi-stage `Dockerfile` (relies on `output: 'standalone'`) and a
`docker-compose.yml` are included. Compose injects the required env vars from the
host shell at runtime:

```bash
docker-compose up --build
```

When OAuth callbacks fail in production, check that `NEXT_PUBLIC_APP_URL` matches
the URL registered with your Discogs app and is `https://`.

## Documentation

In-depth docs live in [`docs/`](./docs/README.md):

- [Authentication & Discogs integration](./docs/01-authentication.md)
- [LLM analysis pipeline & features](./docs/02-llm-pipeline.md)
- [Frontend & UI](./docs/03-frontend.md)
- [Data model, configuration & deployment](./docs/04-data-model-deployment.md)

Contributor guidance for working in this repo is in [`CLAUDE.md`](./CLAUDE.md).

## License

MIT
