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

- **`POST /api/analyze`** (`roast` | `gap_filler` | `oracle`): one-shot, expects JSON output. System prompts in `src/lib/prompts.ts` instruct Claude to emit a specific JSON shape; the feature display components (`roast-display.tsx`, `gap-filler-display.tsx`, `oracle-display.tsx`) parse the streamed text. Default model: `claude-opus-5-5`. Every request goes through `src/lib/anthropic-client.ts`, which adapts it for Opus 5.5 (no sampling params, forced tool choice → `auto` + an instruction, `max_tokens` ≥ 16000 because thinking is always on). The `oracle` type chains: it consumes the `gap_filler` JSON output as additional context, so gap_filler must run first to feed it.
- **`POST /api/chat`** (Record Shop): multi-turn conversational, uses `useChat` from `ai/react`. Default model: `claude-opus-5-5`. Collection + wantlist are jammed into the system prompt every turn (no caching). Conversation history persists to `localStorage` only.

Both routes use Vercel AI SDK's `streamText` + `toDataStreamResponse()` and have `maxDuration = 60`. Auth check is just "does `discogs_session` cookie exist and parse" — the tokens are passed implicitly via the cookie that's already in scope, not re-validated against Discogs.

### Frontend

- `src/app/dashboard/page.tsx` is the single-page app: fetches collection + wantlist on mount, holds them in React state, passes the precomputed `collectionString` down to each feature tab. Switching the viewed user clears all derived state.
- `src/components/ui/*` is shadcn/ui (Radix primitives + Tailwind), configured via `components.json`. New UI components should follow the same `cn()` + `class-variance-authority` pattern.
- Tailwind config uses CSS variables for theming (defined in `src/app/globals.css`).

### Deployment

`Dockerfile` is multi-stage, relies on `output: 'standalone'` in `next.config.js`. `docker-compose.yml` reads env vars from the host shell (no `env_file`). When OAuth callback fails in production, check that `NEXT_PUBLIC_APP_URL` matches what's registered with the Discogs app and is `https://` so the session cookie sets `secure: true`.


## Pressings — the pressing finder

`src/components/features/pressing-finder.tsx`, routes under `src/app/api/pressings/`.
From "I'm holding a copy of this" to the exact Discogs release, in your collection.

- **Facets first, details second.** `/masters/{id}/versions` filters server-side
  (`format`, `released`, `country`, `label` — values are ANDed, and the label
  value is the display name, not the `+`-encoded facet value) and returns facet
  counts, so narrowing is one request per tap. Runouts and notes exist only on
  `/releases/{id}`, one request each, so they load only once ≤ `MAX_DETAILS` (60)
  are left, paced at 1.1s by `pressing-server.ts` and cached in-process for a day.
- **Vinyl is implicit and never a chip.** The versions route always sends
  `format=Vinyl` (format values AND on Discogs' API: Vinyl + Mono on Abbey Road
  = 12) and the barcode route keeps only vinyl releases. Discogs returns NO
  format facet once any format is filtered on, and its unfiltered one is every
  medium's (that is how "CD" reached the screen), so format chips are counted
  from the listed vinyl versions' `format` strings ("LP, Album, Mono"), minus
  media names (`isFormatChip`). Past 300 listed they are a sample, so counts are
  hidden (`formatExact`); chips every remaining pressing has are hidden too.
- **Runout matching ignores case, spaces and dashes** (`normalizeRunout`) —
  "xex 709 1" finds "XEX 709 - 1".
- **The guide** (`/api/pressings/identify`, Opus 5.5) reads runouts, labels,
  formats, companies and collector notes for ≤ 40 pressings and streams markdown.
  It refers to pressings as `[name](#r-ID)`; the client renders those as chips
  with an Add button. The prompt forbids inventing matrix numbers.
- **The one write in the app**: `/api/pressings/add` → folder 1 of the SESSION
  user's collection — never a username from the request, so browsing a friend's
  collection cannot add to theirs. It checks for existing copies first (409) and
  adds another only when asked. The landing page says so.
- **Barcodes** (`barcode-scanner.tsx`, `/api/pressings/barcode`). The camera
  uses the native `BarcodeDetector` where it exists (Android Chrome) and ZXing
  (`@zxing/browser`, dynamically imported) elsewhere — iPhones need ZXing. A
  read must pass the EAN/UPC check digit and be seen twice running. Discogs'
  `barcode=` search matches loosely and the digits and the printed form
  (`0 77774 64462 4`) return different sets, so the route asks both, with and
  without UPC's leading 0, and keeps only releases whose `barcode` list contains
  exactly those digits. One album → straight in; the facet chips then narrow the
  barcode list **in the browser** (no versions call). 8–14 digits typed in the
  search box are treated as a barcode; 3–7 as a master id.
- **Photos** (`pressing-viewer.tsx`). `compact()` keeps every release image
  (600px is the most the API gives). The viewer is one continuous strip — swipe
  past a pressing's last photo onto the next pressing's first, up/down jumps a
  pressing, pinch/double-tap zooms — and loads details lazily as you go, so it
  works on lists too long to load up front. "Not this one" rules a pressing out
  (client state; it also drops out of the AI guide). Overlays are portalled to
  `<body>`: an ancestor became the containing block for `fixed` and the page
  showed through at the top.


## The social app (Phase 1) — log, rate and rank albums

The Liner Note is becoming a social "rate your music" app. Free core: log albums
you've heard, rate them, and **rank their tracks**. Premium (not built yet):
extra ranking modes, alternative rating scales, all AI features, and the Discogs
collector tools. Pages: `/home`, `/album/[mbid]`, `/artist/[mbid]`, `/u/[handle]`;
`/` redirects to `/home`, which is also the signed-out pitch.

- **Accounts** (`src/lib/auth/`): our own users table, with Google and Discogs
  as identities (`provider` + `subject`). Session = `ln_session`, an HS256 JWT
  holding only the user id (`SESSION_SECRET` in `.env.local`). Signing in with a
  new identity while signed in LINKS it; accounts are never merged by email.
  **The old `discogs_session` cookie is unsigned JSON** — it is never trusted for
  identity; `/api/me` upgrades it by asking Discogs whose tokens they are.
- **Google**: `GOOGLE_CLIENT_ID` + `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in `.env.local`
  (same value). Empty = the Google button is simply absent.
- **Database** (`src/lib/db.ts`): SQLite at `data/liner.db` (gitignored), WAL,
  migrations by `PRAGMA user_version`. `better-sqlite3` is in
  `serverComponentsExternalPackages`.
- **Catalogue** (`src/lib/musicbrainz.ts`): an album is a MusicBrainz *release
  group*; tracks come from one representative release (official, matching the
  group's first-release date, preferring XW/US/GB). Tracks are keyed by
  RECORDING id so a ranking survives a change of representative release. 1 req/s
  to MusicBrainz, UA carries the app URL. Search re-ranks by release count
  (the Beatles' Rubber Soul has 121 releases; covers have 1). Discographies use
  `release-group-status=website-default` (705 Beatles groups → 187).
- **The two shapes everything premium depends on** (`src/lib/scales.ts`,
  `src/lib/library.ts`): a rating is a 0–100 score + the scale it was given on;
  a ranking is an ordered list of every track + a mode-specific payload. Every
  mode feeds the same community ranking (mean fractional position). Premium
  scales/modes are refused server-side with 402. A ranking must list every
  track exactly once. Un-listening deletes your rating and ranking.
- **Previews**: `next dev` in a scratch copy with a symlinked node_modules is
  fine. **Never `next build` there** — on 2026-11-09 that emptied this repo's
  node_modules (suspect: standalone output). Verify builds with a real copy.


## The installed app (PWA)

- **Manifest**: `src/app/manifest.ts` → `/manifest.webmanifest` (start `/home`,
  standalone, shortcuts to `/dashboard?section=pressings|browse` — the dashboard
  honours `?section=`). Icons in `public/icons/` (any + maskable);
  `src/app/apple-icon.png` and `favicon.ico` use Next's file convention, which
  OVERRIDES `metadata.icons` — don't add icons there.
- **Service worker**: hand-written `public/sw.js`, no build step. Pages network
  first (last copy kept, else `/offline`); `/_next/static` cache first; cover
  art (Cover Art Archive only) cache first, fetched with CORS so nothing opaque
  is stored — Discogs images are left alone; GET reads of
  `/api/albums|artists|users|activity|me` network first. Auth, AI streams,
  Discogs and every POST pass through. Any `/api/auth/*` request wipes the API
  cache. Bump `VERSION` only when caching logic changes. `/sw.js` is served
  `no-store` (`next.config.js`).
- **Client** (`src/components/pwa-client.tsx`, `src/lib/pwa.ts`): registers
  only in production and UNREGISTERS in `next dev` (a worker from `npm start`
  on :3000 would serve stale chunks). New version → toast with Reload
  (skip-waiting); never auto-swaps. Install: `beforeinstallprompt` is caught at
  load; iOS gets Share → Add to Home Screen. Banner on Home (dismissible), row
  under "App" on your profile.


## The album page (redesign step 2)

- Order: a band tinted with the cover's average colour (canvas over the CAA
  image; the inner header takes the same tint via `--inner-header-bg`), then
  the listen card — "Log a listen" / green "Listened today" (`--done`), 34px
  stars, and the liner note — then Tracks ("11 tracks · 28 min", "Rank them"
  outlined; the order switch only appears when there's a ranking to switch to).
- **Liner notes**: `notes` (migration 7), plain text ≤ 2,000 chars, private to
  the writer for now. `PUT /api/albums/[mbid]/note {body}`; writing one logs a
  listen, empty deletes. Un-listening deletes it with the rating and ranking,
  after a confirm that names what goes.
- The rating scale is a setting on the You tab (`scale-setting.tsx`); only
  stars are free, and ratings keep the scale they were given on.


## Browse and the per-person collection copy

- **`collection_copies`** (migration 6, `src/lib/collection-copy.ts`): every
  Discogs-linked person's collection on the server, separate from sharing.
  `/api/collection` saves it when you load your OWN collection — only after
  Discogs confirms the (unsigned) `discogs_session` tokens belong to the
  signed-in person's linked account (`tokensAreUsers`, cached per token). No
  tokens are stored for it; they're used for that request's background work.
- **Original years** (`src/lib/master-years.ts`, shared with the shelf):
  `master_years` holds each master's year; `warmMasterYears` fills the gaps
  through the shared `paced` queue (one slot, waits on 429s, dedupes a master
  two warmers want). `/api/collection` returns `years` (by master id) and
  `yearsPending`; the dashboard polls `/api/collection/years` until it's 0.
  A friend's collection gets whatever years are known, nothing fetched.
- **Opening instantly** (step 5): the copy holds the raw Discogs items.
  `/api/collection?cached=1` answers from it with no Discogs call (404 when
  there's none); the dashboard shows that, then re-reads live behind it
  ("Syncing with Discogs…" → "Synced 2 min ago"), and again when the app comes
  back after 10 min. Only the very first load waits: placeholders plus "2 of 4
  pages" from `/api/collection/progress` (fed by `getFullCollection`'s
  `onProgress`). A request sequence makes a newer collection (a friend's) win.
- **Collection's frame** (step 6): `Shell bare` drops the logo bar on a phone
  (desktop keeps it — its navigation lives there); sticky things offset by
  `var(--app-header)` (0 on a phone there, 3.5rem otherwise). The page's own
  header: title, "311 records · 14 wanted", "Synced …", and three icon buttons
  (a friend's collection → the UserSwitcher in a sheet, share, sync). Sections
  are a 4-way segmented control (Overview · Browse · Pressings · Shop) plus a
  More sheet for the other tools. Overview = Recently added + `WhatItIs`
  (`collection-overview.tsx`: top 5 genres with counts, `DecadeChart` by
  original year, a format sentence that skips Discogs' "All Media").
- **Browse** (`collection-browser.tsx`) is records first: sticky search and
  chips (Genre, Decade, order, Surprise me) under the section strip (its
  height is published as `--section-strip`), one summary line, a 3-column
  grid with original years, and the Stats sheet for exactly the filtered
  slice (decade chart with empty decades shown, artists with 2+ records).


## The shelf display — the collection on a tablet

`/shelf/[token]` (`src/components/shelf/shelf-display.tsx`, `src/lib/shelf.ts`):
a dark, read-only gallery of one person's Discogs collection for a tablet on
their record shelf. Owner turns it on from their profile (`ShelfSettings`).

- **No sign-in on the tablet.** `shelves` (migration 2) holds a 10-char token
  (the link; `/shelf` lets you type it as `abcde-23456`) and the owner's Discogs
  tokens, so the server reads the collection itself. Enabling verifies the
  unsigned `discogs_session` with Discogs AND that the Discogs account is linked
  to the signed-in user. Turning it off deletes the row (and the tokens).
- **Two links to one shelf.** `token` is the tablet's code; `share_token`
  (migration 3, made lazily for older rows) is the link friends get from
  "Share collection" (`share-collection.tsx`: dashboard overview + Browse, and
  the profile). Either opens `/shelf/[token]`; the friends' one renders with
  `kiosk={false}` — no slideshow, wake lock, fullscreen or shelf manifest —
  and never exposes the tablet code (its manifest route 404s). Each rotates on
  its own. The first Share tap turns the shelf on if it's off.
- **Snapshot**: the collection is stored as JSON on the row and re-read in the
  background when older than 6 h (one refresh per shelf at a time). Only
  display fields — no notes, ratings or prices. The page SSRs the snapshot.
- **Release pages** (tracklist, back cover = `images[1]`) load on tap, only for
  releases in the snapshot, paced via `pressing-server`'s queue, cached a day.
- **Kiosk behaviour**: 90 s untouched → slideshow with clock, and the wall
  resets (search, genre, sort); the waking tap is swallowed. Screen Wake Lock
  while visible. Reloads itself (while idle) after 12 h. Takes SW updates
  without a toast. Ignores the app theme (THEME_SCRIPT skips `/shelf`). Its own
  manifest (`/shelf/[token]/manifest.webmanifest`, display fullscreen) so Add to
  Home Screen opens the shelf. SW caches `/api/shelf/*` reads so a Wi-Fi drop
  doesn't blank the wall; Discogs covers rely on the HTTP cache.
- **Everything is kept on the Pi** (`shelf.ts`): release pages in
  `release_cache` (migration 4, shared by all shelves, re-read after 30 days,
  stale served if Discogs fails); covers and back covers as files in
  `data/shelf-images/` (named by a hash of the Discogs URL), served by
  `/api/shelf/[token]/img/[id]/[n]` (0 = wall cover, 1+ = release images).
  Clients never see Discogs image URLs (`itemsForClient`/`releaseForClient`).
  `warmShelf` fills both after every snapshot and once per process start,
  newest first, holding one slot of the shared `paced` queue at a time; it
  stops after 5 failures in a row. The profile shows "saving to the Pi: n of m".
- **Discogs' image server returns 429 to bursts.** The Pi fetches images 3 at a
  time with backoff; `Cover` also retries (~2 s, 5 s, 12 s). It sends no CORS
  headers, so the SW must never fetch Discogs with CORS (that doubled every
  request); the Pi-served covers are cached by the SW like any image.
- **Year = when the album came out**, not the pressing: snapshots keep each
  record's Discogs `master` id, `master_years` (migration 5) holds each
  master's year (warmed before release pages, ~1 call per album), and
  `itemsForClient` adds `original` (falls back to the pressing year; old
  snapshots without `master` trigger a re-read). The record view shows
  "1965 · Pressed 2025". A 429 from Discogs makes the warmer wait a minute and
  retry (`patiently`) rather than count a failure.
- **Artists**: the fourth order ("Artists") is a grid of circles, A–Z; tapping
  one (or the artist name in a record) opens their page — every record, oldest
  first, swiping through only theirs. "A–Z" is records in artist order.
