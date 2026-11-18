# The Liner Note: a modernizing pass

Same look, different priorities. The palette, Fraunces and Inter all stay; what changes is
what each screen puts first, what it repeats, and what it stops saying. Designed on the
canvas **[The Liner Note redesign](https://claude.ai/artifact/UAj9AAqTfCVv6CbjtTLKj2)**,
which has the before screenshots beside the new boards. This folder is design only.

## Before you start

**The branches on GitHub are older than the app this designs for.** They have the
Roast / Oracle / Mixtape dashboard. The live app, with Home, Collection and You tabs,
ratings and track ranking, isn't on GitHub. Build in that codebase and bring this
folder along; it merges anywhere because nothing outside `design/redesign/` changes.

**This spec describes behaviour, not file names.** It was written from screenshots of the
live app, not its code. Where it says "the album page" or "the rating", use whatever
the live code calls them.

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
2. **One meaning per colour.** Oxblood `#8E3329` is for actions and your ratings. **Plum
   `#894D6B` now means "yours"**: owned records, your copy, and later your boxes. Until
   now it only coloured the decade bars. Green `#4F7A4A` means done ("Listened today").
   The decade bars and the format bar stop having colours of their own.
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
  - "By decade" as a small column chart instead of eight rows.
  - Format as one sentence ("309 on vinyl and one box set"). "All Media" is a Discogs
    descriptor, not a format, so it doesn't count as one.
- **The breakdown lives here only.** Today Browse draws it a second time.

### 06 Browse

- **Records first.** Under the header, a sticky toolbar:
  - Search ("Search 311 records").
  - A scrolling row of filter chips: Genre, Decade, Box (step 7), and the sort.
- **One summary line**, "311 records · 1951–2026", with a **Stats** button that opens 08.
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

It replaces the stats that were stacked above Browse's records.

### 09 Put it in a box (step 7)

A sheet with your Kallax drawn as cubes. Tap one, then "Put it in T2". It's drawn so the
shape is settled, but nothing about it should be built yet.

## Data

- **Owned or not.** Search, the album page and "Put one on" all need to know whether an
  album is in your Discogs collection.
  - Discogs collection items carry a `master_id`. If the app's albums can be tied to a
    Discogs master, match on that.
  - Otherwise match on normalised artist and title, and accept the odd miss.
  - Do it once per collection sync and keep the result, not per screen.
- **Original year.** Discogs' `basic_information.year` is the pressing's year. The
  original is the master's year.
  - Use the app's own album year when there's a match.
  - Otherwise fetch the master's year once per master and cache it, minding the 60 a minute
    limit (a few hundred records is a few minutes, once).
- **The liner note.** One plain-text note per album per person, stored with that person's
  rating and listens. Say 2,000 characters.
- **Cache the collection.** Keep the last full fetch (IndexedDB, or on the server). Open
  Browse and Overview from it instantly, then sync in the background and show "synced 2 min
  ago". Only the very first load shows 07.
- **Stats** are computed in the browser from the filtered list, as now.
- **Boxes (step 7):** undecided on purpose. Two ways Discogs can hold them:
  - One collection **folder per box.** Simple, but a copy can only be in one folder, so
    folders can't be used for anything else.
  - A **custom collection field** "Box": a dropdown created once on the Discogs website,
    set per copy through the collection fields API.

  Either way tablet mode reads the same thing. Decide once the new layout exists.

## Build steps

Each ships on its own.

1. **Foundations.** Sentence-case labels, visible empty stars, back buttons and headers on
   inner screens, no card inside a card, the hidden zeros. Mostly CSS and copy.
2. **Album page.** Logging and rating first, the liner note field and its storage,
   scale chips to settings, Rank them demoted, hidden zero counts.
3. **Owned matching.** The search chip, the album page's "In your collection" card without
   its box row, and "Put one on" on Home.
4. **Browse.** The grid first, the sticky toolbar and filter chips without Box, the stats
   sheet, original years.
5. **Cache and first load.** The cached collection, background sync, placeholders.
6. **Overview.** The new header, the segmented control, one breakdown with the decade
   chart, the format sentence.
7. **Boxes, after they're redone.** Pick the storage, then add the box chips, the Box
   filter, the Kallax on Overview, the "not in a box" prompt, the box row on the album
   page, and 09.

**Not redesigned yet:** the You tab, Pressings, Shop, and the track-ranking flow. They get
step 1's styling and nothing else. Send screenshots of them for a second pass.

There's no test suite. Check each step with `npm run lint` and `npm run build`, then by eye
at 390px wide.
