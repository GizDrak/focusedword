# Focused Word

A calm, distraction-free space to read, study, and understand Scripture on your own terms.

Focused Word is built to help you finish reading the Bible and truly understand what you read. Built natively around the Berean Standard Bible (BSB), the app pairs an accurate, transparent modern English translation with immediate access to original Hebrew and Greek word meanings, word class annotations, and cross-references. Everything runs entirely offline on your phone, tablet, or desktop with no ads, no trackers, no subscriptions, and no social clutter.

This document contains two sections:
1. [User Guide and Feature Overview](#user-guide-and-feature-overview): A complete guide to what Focused Word does, why it is built around the BSB, and how to use every feature.
2. [Technical Architecture and Developer Guide](#technical-architecture-and-developer-guide): A comprehensive breakdown of the application engineering, modular Bridge pattern, local SQLite WASM engine, and directory structure.

---

# User Guide and Feature Overview

Most digital Bible apps today feel like busy social networks or content portals. They come loaded with notifications, daily streaks that guilt-trip you, account sign-ups, community comments, and complex multi-layered menus that pull your attention away from Scripture. 

Focused Word was created to solve a different problem: **how do we create a digital reading sanctuary that helps you focus, read consistently, and understand the depth of what you are reading?**

The app is designed to feel like holding a well-printed, beautiful volume of Scripture in your hands, while giving you the power of deep reference tools that stay quietly tucked away until you tap them.

---

## Built Around the Berean Standard Bible (BSB)

At the foundation of Focused Word is the **Berean Standard Bible (BSB)**. 

The BSB was chosen as the core translation for three critical reasons:

1. **Faithful and Transparent Translation**: The Berean Standard Bible balances literal word-for-word accuracy with natural, readable modern English. It is clear enough for daily devotional reading yet precise enough for rigorous study.
2. **Deep Original Language Integration**: The BSB text is connected directly to original Greek, Hebrew, and Aramaic source texts. In Focused Word, every single word in the BSB is tied to its underlying lemma, Strong's concordance entry, grammatical morphology, and semantic class. This enables the app's signature Word Study and Clear Reading tools to work instantly without needing an active internet connection.
3. **Open and Generous Licensing**: The BSB is freely available to the global Church. This aligns with our belief that Scripture should never be locked behind subscriptions, digital rights management, or account gates.

While the BSB is the primary translation built into the heart of the app, you can also install additional translations from remote Scripture repositories and read them side-by-side in Split Mode.

---

## Key Features

### 1. Five Reading Modes
Different moments call for different ways of reading. Focused Word includes five distinct reading engines:

* **Scroll Mode**: A continuous, fluid vertical scroll. As you read down the page, a subtle focus highlight tracks your progress and marks the active verse without abrupt jumping.
* **Swipe Mode**: A card-based layout designed specifically for one-handed reading on mobile devices. Swipe vertically or horizontally to turn passages like pages in a pocket volume.
* **Spotlight Mode**: Centers a single verse directly on the screen and softens the surrounding text. Tap the left or right edges of the screen to advance or move back, allowing your eyes to rest in one central location.
* **Speed Mode (RSVP)**: Rapid Serial Visual Presentation flashes words one by one at your preferred reading speed, from 100 up to 800 words per minute. It includes optional automatic chapter advance, making it ideal for building reading momentum or scanning historical narratives.
* **Split Mode**: A dual-panel reader for desktop, tablet, or mobile landscape. Read two translations side-by-side or stacked, compare verses, tap cross-references, and select text in either panel independently.

---

### 2. Typographical Craft and Reading Aids
Reading long books of the Bible requires careful typography that avoids visual fatigue:

* **Focus Mode**: Hold down on the main Bible button to instantly hide all headers, bottom toolbars, and floating buttons, leaving only the text on screen for a completely distraction-free reading experience.
* **Paragraph and Poetry Formatting**: Switch between traditional verse-by-verse layouts, flowing narrative paragraphs, and poetic line formatting with proper stanzas and hanging indents for Psalms, Proverbs, and prophetic books.
* **Bionic Reading**: Guides your eye smoothly through long chapters by bolding the initial fixation points of words. The bolding strength can be adjusted to match your reading speed.
* **Red Letter Text**: Sets the spoken words of Christ apart in traditional red or in any custom accent color you prefer.
* **Section Headings and Chapter Summaries**: Natural, contextual section headings provide narrative signposts without breaking verse alignment.
* **Flexible Verse Numbers**: Place verse numbers inline directly before the first word, or position them in the left gutter out of the reading path.
* **Background Texture**: An optional subtle paper texture gives the screen a softer, warmer, book-like feel.

---

### 3. Study Tools at Your Fingertips
The depth of Scripture is always accessible with a single tap, yet completely unobtrusive when you just want to read:

* **Word Classes**: Subtle, customizable color-coding highlights people, places, divine names, time periods, animals, artifacts, and grammatical parts of speech. This visually reveals narrative structures, genealogies, and key themes across a chapter.
* **Word Study and Strong's Lexicon**: Tap any word in the BSB to open a bottom sheet showing the original Hebrew or Greek word, pronunciation, transliteration, part of speech, grammatical form, and Strong's number. Read full lexicon definitions and tap to view every other verse in the Bible where that exact root appears.
* **Clear Reading**: Gently softens linking words such as pronouns, connectors, and articles in Soft or Strong modes. This brings the primary subjects, verbs, and core theological assertions forward, while keeping negation words like "not" bold.
* **Cross References**: Tap the cross icon next to any verse to open related passages drawn from the Treasury of Scripture Knowledge. Tap any reference to jump directly to that chapter.
* **Translator Footnotes**: Tap footnote markers to inspect original translation alternatives, manuscript variations, and literal Hebrew or Greek renderings in a clean popover.
* **Fast Bible Search**: Search the entire Old and New Testaments instantly for keywords, exact phrases, topics, or direct chapter and verse references.

---

### 4. Notes, Highlights, and Reading Plans
Your study notes and devotional habits remain organized and completely private:

* **Highlights**: Choose from six warm highlighter colors. Highlight individual words, whole verses, or multiline passages, and filter your saved highlights by color.
* **Rich Text Notes and Tags**: A full rich-text editor attached directly to verses. Format text with bold, italics, headings, quotes, and lists. Use `#tags` to organize your notes by topic and search your notebook instantly.
* **Bookmarks and Sets**: Save verses into organized, color-coded bookmark collections such as *Comfort*, *Wisdom*, *Prayer*, or *Passages to Memorize*.
* **Curated 1-Year Reading Plans**: Follow established reading schedules including Traditional (Genesis to Revelation), Traditional OT/NT, Chronological, Alternate OT/NT (alternating Old and New Testament reading days), Alternative Traditional (OT then NT), and Robert Murray M'Cheyne's 4-track plan.
* **Custom Plan Generator**: Create custom reading schedules for any set of Bible books over any timeframe you choose.
* **Reading Streaks and Activity Logs**: Track your daily reading progress, mark completed chapters, and review your historical reading calendar.
* **Home Reading Panel**: When following an active plan, a clean card on the main reader greets you with your next scheduled passage and a quick button to start reading.
* **Navigation History**: The book picker includes a Recent tab tracking the last 50 chapters you visited with time-ago stamps for quick navigation.

---

### 5. Custom UI Skins and Themes
Tailor the app's aesthetics to your taste, device, and lighting conditions:

* **4 UI Skins**:
  * **Modern**: Contemporary floating bottom navigation bar, card surfaces, and streamlined menus.
  * **Classic**: Traditional header and footer layout with structured borders and classic controls.
  * **Luminous**: A glassmorphic design featuring soft translucent blurs and layered depth.
  * **Minimal**: An ultra-clean interface that removes almost all visible chrome for maximum reading space.
* **11 Color Themes**: Dark, Light, Sepia, Nord, Galaxy, Midnight Ink, Icy Wind, Forest Reader, Rosewood, Clay, and default dark.
* **19 Accent Colors**: Customize the tint of active buttons, verse rails, and selection highlights.
* **10 Self-Hosted Font Families**: Includes high-grade serif, sans-serif, monospace, and handwritten typefaces, along with the high-legibility Atkinson Hyperlegible font for readers with visual strain.
* **Full Spacing Controls**: Adjust font size, line spacing, letter spacing, margins, and text alignment.

---

### 6. 100% Offline and Private Device Sync
* **Installable Progressive Web App (PWA)**: Install Focused Word directly onto iOS, Android, Windows, macOS, or Linux. It operates as a standalone application with fast launch times.
* **Completely Offline**: All BSB scriptures, cross references, lexicon datasets, chapter summaries, and fonts live on your local device. The app works anywhere, including flights and remote areas.
* **Private Cross-Device Sync**: Connect multiple devices using an anonymous 3-word passphrase generated from a Bible wordlist. Your reading position, notes, highlights, bookmarks, and reading plans sync securely in the background without user accounts, email addresses, or password management.
* **Scripture Repositories**: In addition to the built-in Berean Standard Bible, you can add custom repository URLs to install other Bible translations with full SHA-256 integrity verification.

---
---

# Technical Architecture and Developer Guide

Focused Word is architected as a zero-build, local-first web application running entirely on modern browser standards without requiring frontend frameworks, bundlers, or compilation steps.

```
+-------------------------------------------------------------+
|                           Bridge                            |
|  (Service Registry, Pub/Sub Event Bus, Central Logger)      |
+-------+--------------+--------------+--------------+--------+
        |              |              |              |
        v              v              v              v
+--------------++--------------++--------------++-------------+
|  Navigation  ||  StateStore  ||  Token/DOM   ||  Storage    |
|  & History   ||  (Reactive)  ||  Renderers   || (SQLite/IDB)|
+--------------++--------------++--------------++-------------+
```

---

## Core Engineering Principles

### 1. Zero Build Step and Native ES6+
There are no Webpack, Vite, Rollup, or Babel configuration files in the project.
* Every JavaScript file is written as standard ES6+ that browsers run natively.
* Developers can edit HTML, CSS, or JS and test changes immediately by reloading the browser.
* The entire application can be served from any static file server or CDN without a Node runtime in production.

### 2. The Bridge Pattern (`js/core/bridge.js`)
Instead of relying on a heavyweight framework, the application uses a decoupled Mediator pattern:
* The `Bridge` serves as the central module registry and event bus.
* Subsystems register themselves during boot (`bridge.register('navigation', navigation)`).
* Communication occurs via explicit method calls (`bridge.call('settings', 'openSettings')`) or published events (`bridge.emit('render:refresh')`).
* Modules remain isolated, testable, and maintainable.

### 3. Local-First Dual Storage Architecture
The application cleanly divides immutable scripture reference datasets from mutable user study data:

| Data Type | Engine | Storage Target | Description |
| :--- | :--- | :--- | :--- |
| **Scripture and Lexicons** | `BibleDB` (`js/data/bible-db.js`) | SQLite WASM (`sql.js`) over OPFS / Cache API | High-performance in-memory SQL queries for BSB verse tokens, Strong's concordances, and cross references. |
| **User Data and Notes** | `IDBService` (`js/data/idb-service.js`) | IndexedDB (`focused_word_db` v7) | Durable local storage for notes, highlights, bookmarks, reading logs, and sync metadata. |

---

## Project Structure

```
├── index.html                       # HTML5 App Shell, modal containers, and popovers
├── manifest.json                    # PWA Web App Manifest (standalone mode, app shortcuts)
├── sw.js                            # Service Worker (offline cache-first engine, v80)
├── whats_new.md                     # In-app release changelog
├── LICENSE.md                       # MIT License
├── THIRD_PARTY_NOTICES.md           # Third-party font, data, and library notices
│
├── css/
│   └── styles.css                   # Global CSS custom properties, responsive layouts, and typography
│
├── assets/
│   ├── favicon.svg                  # Browser favicon
│   ├── fonts/                       # 10 self-hosted WOFF2 font families
│   │   ├── display/                 # Comic Neue, Lexend
│   │   ├── handwritten/             # Caveat
│   │   ├── mono/                    # IBM Plex Mono
│   │   ├── san/                     # Inter, Roboto, Atkinson Hyperlegible
│   │   └── serif/                   # Merriweather, Lora, Crimson Pro
│   ├── icons/                       # App emblems, SVG icons, and PWA assets
│   │   ├── app/                     # icon-dark.svg, icon-light.svg
│   │   ├── pwa/                     # PWA icons (192, 512, maskable)
│   │   └── ui/                      # Navigation, Bible, and reader icons
│   ├── lists/
│   │   └── bible-wordlist.json      # Wordlist used for generating sync passphrases
│   └── plans/                       # Predefined 1-year reading plan CSV definitions
│       ├── 1year-Traditional.csv
│       ├── 1year-Traditional-OT-NT.csv
│       ├── 1year-Chronological.csv
│       ├── 1year-Alternate.csv
│       ├── 1year-Alternate-OT-NT.csv
│       └── 1year-M'Cheyne-chapters.csv
│
├── scripture/
│   ├── bsb_v3.sqlite                # Bundled Berean Standard Bible SQLite database
│   ├── cross_references.db          # Cross-reference database (TSK dataset)
│   ├── bible_chapters.json          # Chapter titles, summaries, and verse counts
│   └── study/                       # Zipped runtime study databases (word classes / word study) + manifests
│
└── js/
    ├── app/
    │   ├── app.js                   # Boot sequence, global event wireup, and lifecycle
    │   ├── chapter-summary.js       # Chapter title and summary loader
    │   ├── install-prompt.js        # PWA installation banner and iOS install guide
    │   └── split-mode.js            # Dual-pane reference reader controller
    │
    ├── core/
    │   ├── bridge.js                # Mediator event bus and module registry
    │   ├── config.js                # Global configuration and endpoint constants
    │   ├── debug.js                 # In-app logging and error boundary wrapper
    │   ├── dialog-service.js        # Modal dialog controller with focus trapping
    │   └── popover-service.js       # Popover API wrapper with fallback handling
    │
    ├── domain/
    │   └── verse-manager.js         # Intentional vs passive reading scroll lock manager
    │
    ├── data/
    │   ├── bible-db.js              # SQLite WASM interface, query builder, and caching
    │   ├── bionic.js                # Bionic reading algorithm and token transformer
    │   ├── book-map.js              # Book names, IDs, abbreviations, and canon metadata
    │   ├── cross-references.js      # Cross-reference query service
    │   ├── highlight-store.js       # Highlight persistence and color manager
    │   ├── html.js                  # HTML escaping and sanitization helpers
    │   ├── idb-service.js           # IndexedDB v7 schema and CRUD operations
    │   ├── legacy-migration.js      # Migration utilities for earlier database schemas
    │   ├── note-store.js            # Note query, tag indexing, and storage service
    │   ├── selection.js             # Verse tap and range selection manager
    │   ├── state-store.js           # Reactive key-value store with change listeners
    │   ├── uuid.js                  # Cryptographic UUID generator helper
    │   ├── word-class-service.js    # Semantic word annotation and clear reading service
    │   └── word-study-service.js    # Strong's lexicon and lemma search service
    │
    ├── navigation/
    │   ├── navigation.js            # Book/Chapter/Verse selector and chapter loader
    │   ├── navigation-history.js    # Tracks the 50 most recent visited chapters
    │   ├── render-manager.js        # Coordinates DOM rendering between view modes
    │   └── view-manager.js          # View transitions and layout switching
    │
    ├── reading/
    │   ├── interaction-manager.js   # Touch gestures, taps, and long-press selection handlers
    │   ├── search.js                # Full-text Scripture search engine
    │   ├── renderers/
    │   │   ├── base.js              # Base renderer class
    │   │   ├── scroll.js            # Continuous vertical scroll renderer
    │   │   ├── swipe.js             # Card-based horizontal/vertical swipe renderer
    │   │   ├── spotlight.js         # Centered single-verse spotlight renderer
    │   │   └── speed.js             # RSVP word-by-word speed reader
    │   └── scroll-mode/
    │       ├── band-engine.js       # Viewport intersection and reading band engine
    │       ├── block-resolver.js    # Maps scroll offsets to verse blocks
    │       ├── char-resolver.js     # Character position estimation
    │       ├── highlight-renderer.js# Dynamic active reading line highlighter
    │       ├── line-estimator.js    # Text metric estimator for line breaks
    │       ├── reading-tracker.js   # High-performance RAF scroll tracker
    │       └── switcher.js          # Transitions between reading modes
    │
    ├── text/
    │   ├── highlight-manager.js     # Applies highlight colors to rendered verse DOM
    │   ├── markdown-parser.js       # Safe Markdown parser for notes and docs
    │   ├── token-renderer.js        # Converts token streams to DOM nodes
    │   └── url-validator.js         # Security guards against invalid external URLs
    │
    ├── notes/
    │   ├── notes-ui.js              # Full-screen notes sheet and tag filtering
    │   ├── simple-editor.js         # Clean contentEditable rich text editor
    │   ├── tag-cache-utils.js       # In-memory tag cache and autocompletion index
    │   └── tag-search.js            # Fast tag-based search service
    │
    ├── bookmarks/
    │   └── bookmarks-ui.js          # Bookmarks drawer and set manager
    │
    ├── plans/
    │   ├── book-groups.js           # Canonical book groupings (Gospels, Torah, Epistles)
    │   ├── home-plan-widget.js      # Plan banner shown on the reader screen
    │   ├── passage-ref.js           # Scripture reference range parser and formatter
    │   ├── plan-generator.js        # Dynamic plan generator for custom dates and books
    │   ├── plan-scheduler.js        # Calendar scheduling and streak calculation
    │   ├── plans-ui.js              # Plans dashboard and creation modal
    │   ├── predefined-loader.js     # CSV reading plan parser
    │   └── reading-log.js           # Reading activity and streak store
    │
    ├── footnotes/
    │   └── footnotes-ui.js          # Footnote drawer
    │
    ├── cross-refs/
    │   └── cross-refs-ui.js         # Cross-reference explorer drawer
    │
    ├── word-study/
    │   └── word-study-ui.js         # Strong's concordance and lexicon drawer
    │
    ├── settings/
    │   ├── settings.js              # Settings modal manager
    │   ├── color-theme.js           # Theme and accent color applier
    │   ├── typography.js            # Typography controls
    │   └── settings-sync-ui.js      # Sync pairing and settings interface
    │
    ├── repository/
    │   ├── scripture-repository-service.js # Translation installer service
    │   └── scripture-repos-ui.js    # Repository manager dialog
    │
    ├── sync/
    │   └── sync-service.js          # Encrypted sync transport and merge engine
    │
    ├── ui/
    │   ├── skin-system.js           # Skin registry and DOM decorator
    │   └── skins/
    │       ├── classic/             # Classic skin styles
    │       ├── modern/              # Modern floating UI styles
    │       ├── luminous/            # Glassmorphism theme styles
    │       └── minimal/             # Minimal typography skin styles
    │
    └── vendor/
        └── sqlite-wasm/             # Embedded SQLite 3 WebAssembly build (`sql.js`)
```

---

## Key Workflows

### 1. Token Stream Rendering
Scripture is stored in the database as tokenized streams instead of preformatted HTML. When a chapter is loaded:
1. `BibleDB` fetches the token objects (words, paragraph starts, poetry markers, footnotes, cross references).
2. `TokenRenderer` (`js/text/token-renderer.js`) constructs an in-memory `DocumentFragment`.
3. Bionic reading fixation points are calculated without altering line geometry.
4. Footnotes, headings, and red-letter styles are attached in a single pass.
5. The fragment mounts into the DOM with zero layout shift.

### 2. Reading Position Locks (`js/domain/verse-manager.js`)
To avoid jumpy scrolling when users navigate or select verses:
* **Intentional Navigation**: Clicking a verse or selecting a chapter sets a temporary lock (with a 1500ms automatic failsafe) so automated scroll listeners do not interrupt the animation.
* **Passive Tracking**: As you scroll naturally, `ReadingTracker` updates the active verse smoothly via `requestAnimationFrame`.

### 3. Non-Blocking Study Streams
To ensure instant chapter navigation, text displays immediately on the first frame. Word Class colors, Clear Reading opacity, and Strong's underlines stream in right after. If you navigate to another chapter quickly, pending study passes for previous chapters are canceled automatically.

---

## Local Development and Debugging

### Running the App Locally
Because Focused Word is built purely on modern web standards with no build step, you can serve the application using any static HTTP file server:

```bash
# Using Node / npx
npx serve .

# Using Python
python -m http.server 3000
```
Then open `http://localhost:3000` in your browser. Any edits to HTML, CSS, or JS take effect immediately on page refresh.

### In-App Debugging
* **Debug Log**: Open **Settings -> Data -> View Debug Log** to inspect real-time events, module registrations, and warnings recorded by `js/core/debug.js`.
* **Console Globals**: Useful instances such as `window.__debug`, `window.verseManager`, and `window.repoService` are accessible in browser developer tools for inspection.

---

## License and Notices

First-party source code and documentation are licensed under the [MIT License](./LICENSE.md) (Copyright (c) 2026 Matthew Cooper).

Third-party assets (fonts, SQLite WASM, and scripture datasets) are covered by their respective open licenses recorded in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
