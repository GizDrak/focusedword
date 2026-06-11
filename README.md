# Focused Word

An offline-first Bible study PWA with multiple reading modes, cross-references, and customizable themes.

## Features

**Reading Modes**
- **Scroll** — continuous vertical scroll with verse focus tracking
- **Spotlight** — one verse at a time, tap or swipe to advance
- **Swipe** — card-based swiping (horizontal or vertical)
- **Speed** — RSVP word-by-word rapid reading

**Bible Translations**
- Berean Standard Bible (BSB) — default, with word-level red-letter
- King James Version (KJV) — with word-level red-letter
- World English Bible (WEB) — with word-level red-letter

**Cross-References**
- Toggle on/off in Settings
- Tap the `†` indicator next to any verse to see the top 3 most agreed-upon cross-references
- Each reference shows the verse text inline with a citation
- Tap a reference to navigate to that verse
- Uses the Treasury of Scripture Knowledge dataset (433K unique refs, filtered to votes ≥ 2)

**Visual Customization**
- 7 color themes (Dark, Sepia, Light, Midnight, Linen, Forest, Nord, Royal)
- 14 accent colors (Purple, Gold, Slate, Sage, Ice, Bronze, Emerald, Sapphire, Rose, Amber, Pink, Teal, Coral, Lilac)
- 12 font families across serif, sans-serif, monospace, handwriting, and display categories
- Adjustable font size, line spacing, letter spacing, and margins
- Bionic reading mode with adjustable strength

**Bionic Reading**
- Bold the first portion of each word to guide the eye
- Works in all reading modes
- Adjustable strength slider

**Red Letter**
- Words of Christ highlighted in red across all translations
- Toggle on/off in Settings

**Bookmarks & Highlights**
- Bookmark verses across translation sets
- 3 highlight styles (background, underline, glow)
- Organized by set with custom colors
- Synced via IndexedDB

**Offline PWA**
- Fully installable as a standalone app
- All translations and cross-references cached offline
- Service worker with cache-first strategy for DB files
- Works on iOS and Android after initial load

**Navigation**
- Bottom sheet book/chapter/verse picker
- Swipe left/right to change chapters (with slide animation)
- Landscape orientation warning on mobile

**Focus Mode**
- Distraction-free reading
- Hides navigation and settings
- Exit with a tap

## Tech Stack

- Vanilla JavaScript (no frameworks)
- SQLite via sql.js (WASM) for Bible and cross-reference data
- IndexedDB for bookmarks and highlights
- Service Worker for offline caching
- CSS custom properties for theming
- PWA manifest for installability

## Project Structure

```
├── index.html              — App shell
├── manifest.json            — PWA manifest
├── sw.js                    — Service Worker (v7)
├── css/styles.css           — Complete stylesheet
├── js/
│   ├── app.js               — Boot sequence, event wiring
│   ├── core/                — Bridge, state-store, debug
│   ├── data/                — BibleDB, cross-references, bookmarks, highlights
│   ├── modules/             — Navigation, settings, renderers, UI
│   └── utils/               — Bionic parser
├── assets/                  — Icons, fonts
└── scripture/en/            — SQLite databases + JSON metadata
    ├── BSB.db               — Berean Standard Bible
    ├── kjv.db               — King James Version
    ├── web.db               — World English Bible
    ├── cross_references.db  — Cross-reference data
    └── translation-manifest.json
```

## Development

The app requires no build step. Serve the root directory with any static file server:

```bash
npx serve .
```

## License

The app code is MIT. Bible translations and cross-reference data are public domain or permissively licensed (see individual files for details).
