# The Liner Note: a modernizing pass

Same look, different priorities. The palette, Fraunces and Inter all stay; what changes is
what each screen puts first, what it repeats, and what it stops saying. Designed on the
canvas **[The Liner Note redesign](https://claude.ai/artifact/UAj9AAqTfCVv6CbjtTLKj2)**,
which has the before screenshots beside the new boards. This folder is design only.

## Before you start

**Push the Pi's branch first.** The branches on GitHub still have the old Roast / Oracle /
Mixtape dashboard. The Pi's local branch is ahead of them, with the Home, Collection and You
app and the shelf work. Push it, retarget this PR at it if it lands on a different branch,
and build there. This folder merges anywhere, because nothing outside `design/redesign/`
changes.

**This spec describes behaviour, not file names.** It was written from screenshots of the
live app, not its code. Where it says "the album page" or "the rating", use whatever
the live code calls them.

**Reuse what the shelf work already built:**

- **Master years for all 304 masters** are already saved on the Pi. Every year in this spec
  is the **original** release year, so Browse, the Overview decade chart and the stats sheet
  read from those, not from a second copy.
- **The Pi's server copy of the collection** is the cache Browse and Overview should open
  from.
- **"Send a friend this collection"** is the existing Share button. It just moves into the new
  Collection header.

**The boxes come last, and later.** The Kallax boxes are being reorganised now that the
collection is past 300 records. Every box element in the renders (the box chips, the Box
filter, the Kallax grid, "Put it in a box") is **step 7**. Leave all of them out until
the new layout exists. The box names and counts drawn here are only examples.

## Renders

`screens/png/` is what to look at (they show on GitHub). `screens/*.html` are the same
boards as pages. `mockup-src/` holds the canvas boards, and
`node design/redesign/mockup-src/render.mjs` (after `npm i --no-save linkedom`)
regenerates the HTML. **Album covers are placeholders**: the app keeps showing the real
art.

| # | Screen | |
|---|---|---|
| 01 | Home | "Put one on" from your shelves, then your latest |
| 02 | Search | Grouped by type, with the albums you own marked |
| 03 | Album, before you log it | Logging and rating first, a place for the liner note, your copy |
| 04 | Album, logged | The same page after a listen, a rating and a note |
| 05 | Collection overview | Shelves, recently added, one breakdown |
| 06 | Browse | The records first |
| 07 | Browse, first load | Placeholders and progress instead of a spinner |
| 08 | Stats for a slice | Browse's numbers, in a sheet |
| 09 | Put it in a box | Step 7, later |

## The rules

1. **Keep the look.** Same tokens, same type: Fraunces 600 for headings and titles, Inter
   for everything else.
2. **One meaning per colour.** The accent is for actions and your ratings. **A new
   `--yours` (plum on Paper) means "yours"**: owned records, your copy, and later your boxes.
   Until now plum only coloured the decade bars. **A new `--done` (green on Paper)** means
   done ("Listened today"). The decade bars and the format bar stop having colours of their
   own.
3. **Sentence case.** "ALBUM", "GENRES", "DECADES" and "FORMATS" become "Album · 1972",
   "What it is" and "By decade". Section labels are 13px, weight 600, muted.
4. **Fewer boxes.**
   - No card inside a card: the stats box inside the Browse card goes, and so do the
     bordered cards around plain lists.
   - Track lists and search results become rows with hairlines.
   - A card is for a thing you act on: logging an album, your copy of it.
5. **Inner screens get their own header.** The logo bar belongs to Home. An album page
   gets a back button, share and more. Collection gets its title and its actions.
6. **Hide what's zero or noise.** No "No ratings yet · 0 listeners", no "Avg rating —",
   no "Box Set 1 · 0%", no "Based on 311 prioritized items".
7. **44px tap targets**, real buttons, and visible empty states. The unrated stars today
   are a pale pink at about 1.4:1, so they look disabled.

### Tokens

| Token | Value | Use |
|---|---|---|
| page | `#F7F4ED` | Unchanged |
| card | `#FDFCF9` | Unchanged |
| line | `#DDD5CA` | Borders and hairlines |
| raised | `#EFEAE2` | Fields, chips, segmented-control track |
| ink / ink 2 | `#251D18` / `#4A3F37` | Text |
| muted | `#6B6057` | Secondary text (5.5:1 on the page) |
| accent | `#8E3329` | Primary buttons, links, stars, chart bars |
| accent tint | `#ECE0D9` | The active tab, the quiet "Rate it" pill |
| plum | `#894D6B`, tint 12% | Owned, your copy, boxes |
| green | `#4F7A4A`, tint 12% | Done |

**These values are Paper's.** The app has three themes: Paper, the dark theme and Hard Bop.
`--yours` and `--done` (and their 12% tints) go into **every** theme's block next to its
accent. Otherwise "one meaning per colour" holds on Paper and breaks on the other two. For
each theme, pick values that:

- read at 4.5:1 or better against that theme's card,
- differ from its accent in lightness, not only in hue,
- keep plum recognisably plum and green recognisably green.

## Screens

### 01 Home

- **Header:** the logo and "The Liner Note" only. The "A" avatar goes, because the You tab
  already is that.
- **Search** is a 50px pill that opens the search screen.
- **"Put one on":** three records you **own but haven't logged**, with a button that
  swaps in three others. This is what ties the two halves of the app together, and it
  needs the owned-to-logged matching under Data. Each shows its box later (step 7).
- **"Your latest":** what you logged, with your stars. An unrated one gets a small
  **Rate it** pill instead of nothing.
- **"Happening now"** only appears once someone other than you is in it. Today it repeats
  "Your latest" with "@andgly95" in front.

### 02 Search

- The field gets a back button and a clear button, and a 1.5px accent ring while focused.
- Results are grouped under **Albums** and **EPs**: rows with a 56px cover, the title,
  and "Artist · year".
- **Albums you own get a plum "In your collection" chip.**
- The placeholder becomes "Search albums". The example titles were cut off at the edge.

### 03 Album, before you log it

- **Header:** a band tinted with the cover's colour behind it, holding back, share and more.
  Under it, the cover at 210px centred, "Album · 1972", the title, and the artist as a link.
- **The listen card comes first:**
  - **Log a listen** as the primary button.
  - Five 34px stars with **muted outlines**, which fill in oxblood when tapped.
  - **"Write a liner note…"**, a field that grows. For an app with this name it has
    to be the second thing on the page.
- **The rating-scale chips** (stars / 1–10 / 0–100 / Letter, three of them locked) move to
  settings on the You tab. One scale per person is a setting, not a per-album choice.
- **"In your collection"**, a plum card, only for records you own:
  - Your copy: the release's format and when it was added to Discogs.
  - Its box: step 7.
  - A link to the pressing on Discogs.
- **Tracks:** "11 tracks · 28 min", the rows, and **Rank them** as a secondary outlined
  button. It's no longer the loudest thing on the page. "Album order" only appears as a
  segmented choice once there's a ranking to switch to.

### 04 Album, logged

- The button turns into a green **"Listened today"**, and the stars stay filled with
  "4 out of 5" beside them.
- The note shows in Fraunces at 18px, under "Your liner note", with **Edit**.

### 05 Collection overview

- **Header:** "Collection" with "311 records · 14 wanted" under it. Three icon buttons
  replace the "Your Collection ▾" card:
  - A friend's collection: the existing user switcher, unchanged underneath.
  - Send a friend this collection.
  - Sync with Discogs.
- **Overview · Browse · Pressings · Shop** become a segmented control that fits the width,
  instead of a strip of tabs cut off at the edge.
- **Your shelves:** the Kallax grid and the "not in a box" prompt. **Step 7.**
- **Recently added:** the carousel as now.
- **"What it is":**
  - The top five genres as bars with counts. Drop the percentages: they're the same fact
    twice.
  - "By decade" as a small column chart instead of eight rows, **by original release year**.
    The render has the real figures: one record from the 1930s, then 58, 138, 63, 20, 12, 7,
    7 and 4 from the 1950s on. The pressing years give a completely different shape, with
    the 2020s looking like the peak.
  - Format as one sentence ("309 on vinyl and one box set"). "All Media" is a Discogs
    descriptor, not a format, so it doesn't count as one.
- **The breakdown lives here only.** Today Browse draws it a second time.

### 06 Browse

- **Records first.** Under the header, a sticky toolbar:
  - Search ("Search 311 records").
  - A scrolling row of filter chips: Genre, Decade, Box (step 7), and the sort.
- **One summary line**, "311 records · 1930s to 2020s" (original years), with a **Stats**
  button that opens 08.
  The three bar charts that sit above the records today go.
- **A three-column grid,** so a screen shows 9 records instead of 2. Each has its title,
  artist, and the **original release year**, with the box chip later.
  - Today the year is the pressing's (Can't Buy A Thrill reads 1976). See Data.
  - The pressing's own year belongs on the album page's "Your copy".
- **A chosen filter turns its chip dark,** with an × to clear it.

### 07 Browse, first load

- **Placeholder tiles** in the grid's shape, and a thin progress bar: "Loading 311
  records · 2 of 4 pages". It's the 1-second gap between Discogs pages, made visible.
- **After the first time, it shouldn't show at all.** Open from the cached copy and
  refresh behind it (see Data).

### 08 Stats for a slice

A sheet from **Stats**, describing exactly what the filters show:

- The slice's name and "158 of 311".
- The year range.
- A decade chart.
- The artists with the most records.
- Later, which boxes they're in.

It replaces the stats that were stacked above Browse's records. The Jazz figures in the
render are illustrative; 05's are the real ones.

### 09 Put it in a box (step 7)

A sheet with your Kallax drawn as cubes. Tap one, then "Put it in T2". It's drawn so the
shape is settled, but nothing about it should be built yet.

## Data

- **Owned or not.** Search, the album page and "Put one on" all need to know whether an
  album is in your Discogs collection.
  - **Exact first.** The app's albums are MusicBrainz release groups, and many link straight
    to their Discogs master through MusicBrainz's URL relationships. The shelf already
    stores each record's master ID, so most records match exactly.
  - **Fallback:** normalised artist and title, for release groups with no Discogs link.
  - Do it once per collection sync and keep the result, not per screen.
- **Original year.** Discogs' `basic_information.year` is the pressing's year, which is
  what Browse shows today. Use the master years already saved on the Pi.
- **The liner note** gets its own table: **migration 6** (2 to 5 went to the shelf work).
  One plain-text note per album per person, up to about 2,000 characters.
- **The rating scale** becomes a per-person setting, but **each rating keeps the scale it
  was given on**, as ratings are stored now. The setting only decides how a new rating is
  entered. Changing it must never reinterpret old ratings: an old rating shows on its own
  scale until it's re-rated.
- **The collection cache** is the shelf's server copy. Open Browse and Overview from it
  instantly, sync in the background, and show "synced 2 min ago". Only the very first load,
  before that copy exists, shows 07.
- **Stats** are computed in the browser from the filtered list, as now.
- **Boxes (step 7):** still waiting on the new layout. The leading option is a **custom
  collection field "Box"** on Discogs: a dropdown created once on the website and set per
  copy through the collection fields API.
  - Field values arrive with the collection items the Pi already fetches for the shelf, so
    they cost no extra requests.
  - The tablet shelf display can show the same box chips from that data.
  - The alternative, one collection folder per box, works but uses up folders for anything
    else.

## Build steps

Each ships on its own. **Suggested order: 1, then 4.** Browse gains the most from what the
shelf work already built. The rest follow in any order.

1. **Foundations.** Sentence-case labels, visible empty stars, back buttons and headers on
   inner screens, no card inside a card, the hidden zeros. Mostly CSS and copy.
2. **Album page.** Logging and rating first, the liner note field and its table (migration
   6), the scale chips moved to settings without touching old ratings, Rank them demoted,
   hidden zero counts.
3. **Owned matching.** The search chip, the album page's "In your collection" card without
   its box row, and "Put one on" on Home.
4. **Browse.** The grid first, the sticky toolbar and filter chips without Box, the stats
   sheet, original years.
5. **Cache and first load.** Point Browse and Overview at the shelf's server copy, add
   background sync and the placeholders.
6. **Overview.** The new header, the segmented control, one breakdown with the decade
   chart, the format sentence.
7. **Boxes, after they're redone.** Pick the storage, then add the box chips, the Box
   filter, the Kallax on Overview, the "not in a box" prompt, the box row on the album
   page, and 09.

**Not redesigned yet:** the You tab, Pressings, Shop, and the track-ranking flow. They get
step 1's styling and nothing else. Send screenshots of them for a second pass.

There's no test suite. Check each step with `npm run lint` and `npm run build`, then by eye
at 390px wide.
