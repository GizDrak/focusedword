# Focused Word

An offline-first Bible study PWA with multiple reading modes, cross-device sync, cross-references, and customizable themes.

## Features

**Reading Modes**
- **Scroll** — continuous vertical scroll with verse focus tracking and line-level highlight
- **Spotlight** — one verse at a time, tap or swipe to advance
- **Swipe** — card-based swiping with heading cards
- **Speed** — RSVP word-by-word rapid reading

**Bible Translations**
- Berean Standard Bible (BSB) — default, with word-level red-letter
- King James Version (KJV) — with word-level red-letter
- World English Bible (WEB) — with word-level red-letter
- American Standard Version (ASV)
- New English Translation (NET)

**Cross-References**
- Toggle on/off in Settings
- Tap the `†` indicator next to any verse to see the top 3 most agreed-upon cross-references
- Each reference shows the verse text inline with a citation
- Tap a reference to navigate to that verse
- Uses the Treasury of Scripture Knowledge dataset (433K unique refs, filtered to votes ≥ 2)

**Cross-Device Sync**
- Keep reading position, bookmarks, highlights, notes, and app settings in sync across devices
- Sync key uses a BIP-39 style wordlist passphrase for secure pairing
- Conflict resolution with last-write-wins merge and timestamp guards
- Auto-sync (periodic + on tab hide) and manual Sync Now
- Privacy-first: only syncs reading and layout data, no identity or analytics
- Revocation: erase cloud data and disconnect from any device

**Visual Customization**
- 8 color themes (Dark, Sepia, Light, Eclipse, Parchment, Pine, Nord, Velvet, Galaxy)
- 14 accent colors (Purple, Gold, Emerald, Sapphire, Rose, Amber, Slate, Pink, Mint, Ice, Bronze, Teal, Indigo, Coral)
- 12 font families across serif, sans-serif, monospace, handwriting, and display categories
- Adjustable font size, line spacing, letter spacing, and margins
- Bionic reading mode with adjustable strength
- Background texture toggle

**Bionic Reading**
- Bold the first portion of each word to guide the eye
- Works in all reading modes
- Adjustable strength slider

**Red Letter**
- Words of Christ highlighted in red across all translations
- Toggle on/off in Settings

**Bookmarks & Highlights**
- Bookmark verses across translation sets
- Organized by sets with custom colors and badges
- Range highlighting (single or multi-verse)
- 6 highlight colors (Yellow, Green, Blue, Orange, Purple, Red)
- Filter highlights by color in the Library panel
- Visual indicators in both Library panel and scripture text
- Sync across devices

**Library Panel**
- Slide-up panel showing bookmarks and highlights
- Filter bookmarks by set
- Filter highlights by color with item counts
- Navigate to any bookmark or highlight with a single tap

**Offline PWA**
- Fully installable as a standalone app
- All translations, cross-references, and fonts cached offline
- Service worker with cache-first strategy for DB files
- Works on iOS and Android after initial load

**Navigation**
- Bottom sheet book/chapter/verse picker with breadcrumb
- Chapter header with SVG book-group emblem
- Vertical verse progress bar on long chapters
- Landscape orientation warning on mobile

**Focus Mode**
- Distraction-free reading
- Hides navigation and settings
- Exit with a tap

**Debug Tools**
- In-app Debug Log panel (Settings > Data) captures errors and warnings
- Filterable by level (All / Errors / Warnings)
- Stack trace expansion and Clear button

## Tech Stack

- Vanilla JavaScript (no frameworks) — Bridge architecture for module communication
- SQLite via sql.js (WASM) for Bible and cross-reference data
- IndexedDB for user data: `FocusedWord` (legacy) and `focused_word_db` (sync/mutation storage)
- Service Worker for offline caching (v12)
- CSS custom properties for dynamic theming and accent colors
- PWA manifest for installability
- Fetch API + REST endpoints for cross-device sync

## Project Structure

```
├── index.html              — App shell
├── README.md               — This file
├── changes.md              — Changelog (viewable in-app)
├── manifest.json           — PWA manifest
├── sw.js                   — Service Worker (v12)
├── css/styles.css          — Complete stylesheet
├── js/
│   ├── app.js              — Boot sequence, event wiring
│   ├── core/               — Bridge, state-store, debug, sync, IDB, verse manager
│   ├── data/               — BibleDB, cross-references, bookmarks, highlights
│   ├── modules/            — Navigation, settings, renderers, sync UI, search
│   ├── utils/              — Bionic parser, markdown parser, token renderer
│   └── vendor/             — sql.js WASM build
├── docs/                   — Documentation
├── assets/                 — Icons, fonts, wordlist
├── scripts/                — Build tools (USFM converter, wordlist generator)
└── scripture/en/           — SQLite databases + metadata
    ├── trans/              — Translation databases (*_v2.sqlite)
    ├── cross_references.db — Cross-reference data
    └── translation-manifest.json
```

## Development

The app requires no build step. Serve the root directory with any static file server:

```bash
npx serve .
```

The app loads at `http://localhost:3000` (or the assigned port).

## License

The app code is MIT. Bible translations and cross-reference data are public domain or permissively licensed (see individual files for details).
