# The Liner Note

AI-powered analysis of your Discogs record collection. Get roasted, find gaps in your vinyl obsession, and discover what you should be hunting for next.

## Features

### The Roast (Viral Hook)
Analyze your collection for taste patterns, cliche albums, and value distribution. Receive a humorous, personalized roast and discover your "Collector Archetype."

### Gap Filler
Identify your top 5 "Core Artists" by volume and discover critical studio albums missing from those discographies.

### The Oracle (Dual Prediction Engine)
- **Predict Next 5 Purchases**: Items from your wantlist or gap filler that bridge gaps in your collection
- **Predict 5 "Wantlist Additions"**: Albums you don't know you want yet using "Sideman Logic" and "Scene Logic"

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS + shadcn/ui
- **Authentication**: Discogs OAuth 1.0a
- **AI**: Vercel AI SDK with Anthropic Claude
- **API**: Discogs API for collection data

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
- `DISCOGS_CONSUMER_KEY` - Your Discogs app consumer key
- `DISCOGS_CONSUMER_SECRET` - Your Discogs app consumer secret
- `ANTHROPIC_API_KEY` - Your Anthropic API key
- `NEXTAUTH_SECRET` - A random secret for session encryption
- `NEXT_PUBLIC_APP_URL` - Your app URL (http://localhost:3000 for development)

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Architecture

The app follows a "dumb pipe" architecture:

1. **Ingest**: Fetch the user's full Discogs Collection and Wantlist via OAuth
2. **Compress**: Map data to a token-efficient format: `"{Artist} - {Album} ({Year}) [{Genre}]"`
3. **Inference**: Send compressed data to Claude for analysis, categorization, and recommendations

### Token Optimization

The `optimizeCollectionForLLM` utility handles large collections by:
- Prioritizing recently added items
- Prioritizing high-rated items
- Truncating to fit within token limits while preserving collection character

## License

MIT
