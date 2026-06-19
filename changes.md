# Changelog — Focused Word

## v0.8.3

### Theme Redesign
- Replaced Eclipse, Parchment, Pine, Velvet with Midnight Ink, Ocean Mist (→ Icy Wind), Forest Reader, Rosewood.
- Added Clay theme (neutral stone gray) as a new 10th theme.
- Updated Light theme: clean true white with blue accent (#2563EB).
- Updated Sepia theme: reduced yellow saturation, soft neutral parchment palette.
- Converted Ocean Mist from teal to light blue Icy Wind palette.
- Updated Clay from warm orange to neutral stone gray.
- Unique accent palettes for every theme (accent-gold, accent-glow, focus, spotlight).
- Every theme has a distinct accent identity verified with no duplicates.
- Fixed: bottom-sheet panel box-shadows bleeding through when hidden (changelog, debuglog, library, footnote panels).

## v0.8.2

### Sync & Backup
- New **Sync** system for keeping settings and reading position in sync across devices.
- Uses a BIP-39 style wordlist passphrase (generated from the BSB Bible text) for secure device pairing.
- Sync supports: Auto-Sync (periodic + on tab-hide), pull-before-push conflict resolution, and last-write-wins state merge.
- Settings panel redesigned: Enable Sync toggles visibility of all sync settings; Auto-Sync linked to Enable.
- Tap-to-copy sync key with visual feedback; server URL editable via prompt dialog.
- Auto-pull server state on app start when Auto-Sync is enabled.
- Online event now triggers full pull + push cycle.

### Debug Log Viewer
- New in-app **Debug Log** panel accessible from Settings > Data > Debug Log.
- Captures `console.error`, `console.warn`, window errors, and unhandled promise rejections into a 200-entry buffer.
- Filter by All / Errors / Warnings; tap to expand stack traces; Clear button to reset.
- Useful for diagnosing issues on mobile where DevTools aren't available.

### Library
- **Highlight color filter** — added a sticky filter bar to the highlights tab with colored chips for each highlight color, showing item counts. Filter selection persists across sessions.

### Bug Fixes
- Fixed enable sync toggle being stuck on (decoupled enable state from key existence).
- Fixed sync loop where local changes were overwritten before push (state applier now respects timestamp guard).
- Fixed book/chapter/verse restoration from server state.
- **Fixed: verse off-by-1 regression** — smooth scroll animation was overwriting the restored verse position. Each auto-sync cycle pushed the decremented verse to the server. Now the correct verse is re-asserted after scroll tracking settles.
- **Fixed: 409 conflict retry loop** — when the server returned a conflict, the retry used the same old timestamp and kept getting rejected. Now uses a fresh timestamp.
- **Fixed: auto-sync not triggering on tab return** — visibility change handler now syncs on both hide and show (was hidden-only).
- **Fixed: sync resume verse not restored** — resume toast `setIntentional(verse)` was called after `loadChapter`, so the render pipeline scrolled to verse 1 before the target verse was set. Now the verse is set before loading the chapter, matching the pattern used by bookmark navigation and chapter picker.

## v0.8.1

### Better Search
- Search is now much smarter and more accurate. It understands word variations (like “begin,” “begins,” “beginning,” “begun”) automatically — no more needing to add * wildcards.
- Fixed a bug that was sometimes preventing good search results.

## v0.8

### New Looks & Customization
- **New Galaxy theme** — a beautiful deep purple night-sky look.
- Renamed several themes for clearer names (Midnight is now Eclipse, etc.).
- Added **15 new accent colors** so you can personalize the app even more.
- Replaced the old Sage green accent with a nice Pink.

### Paragraph Reading Mode
- Paragraph mode now works beautifully in Spotlight mode too (with a clean inline focus highlight).
- Paragraph breaks turn on automatically when you enable Paragraph Reading.
- Smoother layout and spacing when reading in paragraph form.

### Search Improvements
- Full search experience with **pagination** (25 results at a time + “Load More”).
- Better result highlighting.
- Tapping the Discover tab now opens the search panel smoothly.

### Library Panel
- Redesigned the Library as a nice slide-up panel from the bottom (easier to use on phones).
- The bookmark filter bar now stays visible while you scroll.
- Old centered popup is still available as a backup.

### Text & Reading Experience
- Section headings now match the verse font style better for a cleaner look.
- Slightly smaller default font size (13pt) for improved readability.

### Highlights
- You can now highlight a range of verses (e.g., 1–8) as one single highlight instead of many separate ones.
- Highlights look better on both light and dark themes.
- Cleaner text when copying highlighted verses (no verse numbers included).

### Other Nice Touches
- Search box is taller and easier to tap.
- Better spacing at the bottom of long chapters.
- Improved poetry and formatting layout.
- New, clearer icons for Speed and Swipe modes.
- Translation picker stays visible and easy to reach.
- Added a **“What’s New”** changelog panel (you’re reading it now!).

### Bug Fixes
- Deleting a bookmark now cleans up the visual border properly.
- Fixed several small display and interaction issues.
- Improved database loading reliability.
- Various small polish improvements across the app.

---

## v0.7 (Major Update)

### Big Foundation Improvements
- Completely rebuilt how the Bible text is stored and displayed for better formatting, future features, and reliability.
- Added proper support for **Red Letter** text (Jesus’ words) — toggle it on or off in settings.

### Fresh New Look
- Modern bottom navigation bar (Discover, Mode, Bible, Library, More).
- Beautiful dark-first design with gold/amber accents.
- Larger, more readable verse text and elegant chapter titles.
- New mode selection grid and improved menus.

### Smoother Experience
- Better overall rendering and performance when switching reading modes.
- More reliable cross-references with clear indicators.
- Many navigation and mode-switching bugs fixed (no more jumping to the wrong verse, stuck views, etc.).

### Other Fixes
- Improved consistency between Scroll and Spotlight modes.
- Better verse restoration when reopening the app.
- Smoother paragraph mode toggling.