# Frontend & UI

Next.js App Router + React 18 + TypeScript, with **shadcn/ui** (Radix primitives +
Tailwind) as the design system. Streaming is handled by the Vercel AI SDK
(`ai/react`). All persistent client state lives in `localStorage` /
`sessionStorage`.

## Pages

### Landing — `src/app/page.tsx`
Public auth gate. On mount, calls `GET /api/auth/session`; if authenticated,
redirects to `/dashboard`. Otherwise shows a hero, a 3-card feature preview, and a
**"Connect with Discogs"** CTA linking to `/api/auth/discogs`. An `ErrorMessage`
subcomponent maps OAuth error query params (`missing_params`, `session_expired`,
`token_mismatch`, `callback_failed`) to friendly text. Shows a vinyl-spinner while
checking auth.

### Root layout — `src/app/layout.tsx`
HTML shell, Inter font (`next/font`), global Radix `Toaster`, imports
`globals.css`.

### Dashboard — `src/app/dashboard/page.tsx`
The single-page app. Responsibilities:

- **Auth + fetch on mount:** verifies session, then fetches collection + wantlist.
- **State:** `user`, `collection` (`CollectionData`), `wantlist` (`WantlistData`),
  `gapFillerResults`, `activeTab`, `viewingUser`, plus fetch-in-flight flags.
- **`CollectionData`** = `{ username, totalItems, optimized (CompressedCollection),
  collectionString (LLM text), raw? (DiscogsCollectionItem[] with cover art) }`.
  Analysis features get `collectionString`; browse/guide/mixtape get `raw`.
- **Tab persistence:** last tab saved to `localStorage` key
  `linernote-active-tab`, validated against `VALID_TABS` on restore (falls back to
  `roast`).
- **User switching:** `handleUserSelect()` clears collection/wantlist/gap-filler
  state and re-fetches for the chosen username; switching back to self is handled
  the same way.
- **UI:** header (avatar + logout via `POST /api/auth/logout`), three stat cards,
  a truncation warning banner when `optimized.truncated`, `CollectionStats`
  breakdown, the 9-tab feature area, and a recent-records preview grid.

The 9 tabs: `roast`, `gap_filler`, `oracle`, `guides`, `mixtape`, `mood`,
`obscureness`, `browse`, `shop`.

## Feature components (`src/components/features/`)

All are named-export client components; props consistently include
`collectionString`, optional `username` (for the sessionStorage cache key), and
`isReady` (gates the UI until the collection has loaded).

| Component | Purpose / notes |
|-----------|-----------------|
| `RoastDisplay` | Streams `/api/analyze` (roast) via `experimental_useObject`; caches via `useAnalysisCache`. Renders archetype banner, roast text, taste patterns, cliché alert, value distribution. |
| `GapFillerDisplay` | Same streaming pattern; additionally surfaces cached results to the parent (for Oracle) via an `onResultsReceived(results)` callback. Renders core-artist cards + missing-album cards. |
| `OracleDisplay` | Takes `wantlistString` + `gapFillerResults`. If neither prereq is present, prompts the user to run Gap Filler first but offers "Run Oracle Anyway." Renders predicted purchases (green) and "don't know you want" picks (purple, tagged by logic). |
| `MoodDisplay` | Interactive: count selector (3/5/10), quick-mood buttons, custom mood input. Posts to `/api/analyze` (mood). |
| `ObscurenessDisplay` | Gradient score banner + 0–10 slider, two columns (most mainstream / most obscure). |
| `GuideDisplay` | Three modes — list / picker / viewing. Generates via raw `fetch` to `/api/guide` (+ `AbortController`), saves guides to `localStorage` (`linernote-listening-guides`), exports `.md`. |
| `MixtapeDisplay` | Theme input + track-count selector, posts minimal `{id, artist, album, year, genre}` items to `/api/mixtape`. Renders Side A / side break / Side B with transitions; exports `.txt`. Unwraps JSON error bodies. |
| `RecordShopChat` | `useChat` against `/api/chat`; conversations persisted to `localStorage` (`linernote-conversations`) with a sidebar history, new/export/regenerate controls, markdown rendering. Uses `chatKey` remount + `isSwitchingRef` to avoid double-persist on switch. |
| `CollectionBrowser` | Search + genre/decade/format filters + 6 sort modes over `raw` items; live filtered stats, `SliceBars` breakdown bars, a "Surprise me" random pick, responsive image grid. |
| `CollectionStats` | Compact genre/decade/format breakdown bars from `getCollectionStats()`. |
| `UserSwitcher` | Manages a friend username list in `localStorage` (`liner-note-friends`); validates against empty/self/duplicate; turns the card border blue while viewing someone else. |

## UI primitives & theming

- **shadcn/ui** in `src/components/ui/`: `avatar`, `button`, `card`, `progress`,
  `scroll-area`, `separator`, `tabs`, `toast` + `toaster`. New components should
  follow the same `cn()` + `class-variance-authority` pattern.
- **Theming** via CSS variables in `src/app/globals.css` (light + class-based
  dark mode), including a custom `--vinyl` color. Custom CSS: `animate-spin-slow`
  (3s) and `.vinyl-record` (radial-gradient record), thin scrollbars,
  `.prose-roast`.
- Responsive grids throughout (`grid-cols-{1..5}` with `md:`/`lg:` breakpoints).

## Client persistence keys

| Store | Key | Holds |
|-------|-----|-------|
| `localStorage` | `linernote-active-tab` | last dashboard tab |
| `localStorage` | `linernote-conversations` | Record Shop chat history |
| `localStorage` | `linernote-listening-guides` | saved listening guides |
| `localStorage` | `liner-note-friends` | friend usernames |
| `sessionStorage` | `linernote-analysis-{type}-{username}` | cached analysis results |

## Streaming patterns

- **`experimental_useObject({ api, schema, onFinish })`** for structured analyses
  (roast/gap_filler/oracle/mood/obscureness) — Zod-validated, schema errors caught
  in `onFinish`.
- **`useChat`** for Record Shop — bidirectional history, `reload()` to regenerate,
  `stop()` to abort.
- **Raw `fetch` + `AbortController`** for the Guide (custom POST body + full-body
  parse) and Mixtape (one-shot JSON result with error unwrapping).

## Page structure

```
RootLayout
├─ page.tsx (landing / auth gate)
└─ dashboard/page.tsx
   ├─ Header (avatar, logout)
   ├─ UserSwitcher
   ├─ Stat cards + truncation warning
   ├─ CollectionStats
   ├─ Tabs: roast │ gap_filler │ oracle │ guides │ mixtape │ mood │ obscureness │ browse │ shop
   └─ Recent-records preview grid
```
