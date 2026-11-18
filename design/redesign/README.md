# Design: The Liner Note, modernized

Start with [HANDOFF.md](HANDOFF.md). Album covers in these renders are placeholders.

| Home | Search | Album | Album, logged |
|---|---|---|---|
| ![Home](screens/png/01-home.png) | ![Search](screens/png/02-search.png) | ![Album](screens/png/03-album.png) | ![Album, logged](screens/png/04-album-logged.png) |

| Collection | Browse | Stats | First load |
|---|---|---|---|
| ![Collection](screens/png/05-collection.png) | ![Browse](screens/png/06-browse.png) | ![Stats](screens/png/08-stats.png) | ![First load](screens/png/07-first-load.png) |

- `screens/png/`: every board as an image; `screens/*.html`: the same boards as pages.
- `mockup-src/`: the canvas boards, and `render.mjs`, which regenerates `screens/*.html`.
- `09-box-sheet` and every box element are a later step (see the handoff).
