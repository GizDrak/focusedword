# Changelog — Focused Word

## v0.8.7

### Spotlight Side-Zone Controls
- **Strict side-zone tap/hold advance** — prev/next navigation only triggers in explicit left/right side strips (`clamp(56px, 15vw, 80px)`). Center zone never advances, even on verse text.
- **Verse selection restricted to center zone** — `InteractionManager._isSideZone()` blocks enter/toggle selection in side strips; footnotes & crossrefs still work everywhere.
- **Split-mode panel** now uses the same side-zone rule for spotlight clicks.
- **Removed old `.verse-text`/`.verse-num` gutter guards** — side strips override verse content per strict-controls requirement.

### iOS Focus Flash Fix
- **`SpotlightRenderer.setActiveVerse`** — disables CSS transitions on the outgoing verse, force-flushes style (`void document.body.offsetHeight`), then restores transitions and activates the new verse. Prevents the iOS double-highlight where both old and new verses appeared active during the 0.4s transition.

### Spotlight Blank-Area Tap Guard Refactor
- Click & hold-to-advance now only fire on blank gutter/padding (not `.verse-text` or `.verse-num`), eliminating accidental navigation when tapping verse content.
- Pointer-move cancellation (`>12px`) prevents long-press repeat from firing during drag/select.

### Scroll-To-Verse Selector Fix
- `ViewManager.scrollToVerse` now queries by `data-verse` only (when verse number is provided) instead of falling back to `.verse-container.active-verse` which could return a stale element during rapid advance.

### Mode-Switch Verse Preservation
- Fixed switching from spotlight/swipe/speed to scroll mode jumping to the wrong verse (e.g. verse 15 → 13). The scroll mode reading tracker was restarting before the programmatic `scrollToReadingBand` settled, causing passive overwrite of `currentVerse`.
- `RenderManager._dispatch()` now stops the scroll switcher without restoring legacy scroll tracking during mode transition.
- `RenderManager._finalize()` locks `currentVerse` with `verseManager.setIntentional()` before the programmatic scroll, preventing the tracker from overwriting it via `setPassive`.
- `ScrollModeSwitcher.stop()` gained an `opts.restoreLegacyTracking` parameter (default `true`) so the renderer can opt out during mode switches.

### Verse Selection Card Style
- Replaced the wavy SVG underline with a clean selection card: tinted background, inset accent left rail, and subtle border — no DOM mutation, no text-node moves, no line-end layout shift.
- SVG underline code preserved as `_addSvgUnderline` / `_removeSvgUnderline` / `_removeAllSvgUnderlines` helpers in JS and commented CSS block for easy revert.
- Paragraph mode uses per-line cloned highlight via `box-decoration-break`.
- Selection visual is now entirely CSS-driven via `.verse-container.temp-selected`.

### PWA Startup & Splash Reliability
- **SW fetch strategy changed from network-first to cache-first** for all app-shell assets (JS, CSS, SVGs, images, wasm). Assets are served instantly from cache with background refresh instead of blocking on network.
- **Network requests** now have a 4-second timeout before falling back to cache — no more infinite spinner on slow/missing connections.
- **Startup timeouts** added around `repoService.ready`, `bootstrapBSB()`, and `bridge.db.init()` so one slow operation cannot hang the splash screen indefinitely.
- **`ChapterSummary.init()`** moved to non-blocking background — chapter titles are no longer required before the app renders.
- **IDB `onblocked` handler** now shows a message instead of hanging on splash when another tab has the database locked.
- **Splash status text** (`Starting…`, `Loading storage…`, `Loading Bible…`) helps users understand what's happening during long startups.

### iOS PWA Nav Gap Fix
- Removed `html:not(.ios-device)` exclusion from standalone safe-area rules so iOS installed PWA also gets `env(safe-area-inset-bottom)` padding on the bottom nav.
- Nav height and mode `main` heights now use `--bottom-nav-total` (`68px + safe-area`) consistently across all devices.
- Added `--app-viewport-height` JS synchronizer for iOS PWA — `visualViewport.height` captured on init, resize, and orientationchange (with 300ms delay) as a fallback when `100dvh` returns stale values on cold launch.
- Bottom nav now correctly touches the physical bottom of the screen on first portrait PWA launch instead of only after an orientation rotation.

### Cross-reference & Footnote Marker Polish
- **CrossRef indicators** now stay inline with poetry lines (appended to last `.poetry-line` instead of `.token-poetry`). Line breaks prevented via word joiner (`\u2060`) before the marker.
- **CrossRef indicator sizing**: increased to `1em`, baseline alignment, compact tappable padding.
- **Footnote caller sizing**: increased to `0.85em`, baseline alignment, `display: inline-block` with explicit tap target.
- **Desktop Click Navigation**: removed user-facing toggle; feature now activates automatically on desktop/fine-pointer devices via `(any-hover: hover) and (any-pointer: fine)` media query.
- **Desktop chapter bars**: converted from full-height absolute overlays inside `#content` to `position: fixed` floating pills centered vertically outside the reader column.
- **Spotlight mode layout**: added missing `body.spotlight-mode` toggle so full-height layout and background texture extend correctly to the bottom nav bar.
- **Spotlight mode gesture fix**: changed `body.spotlight-mode #content touch-action` from `pan-y` to `none` to restore swipe-to-advance.

## v0.8.6

### Scripture Repositories, BSB v3 & Sync Polish
- **Scripture repositories** — added repository install flow improvements, including `https://` URL prefill, cursor placement after the prefix, private-key auto-focus, and Enter/Return unlock support.
- **Repository sync** — repository URLs now sync across devices, `currentTranslation` is included in synced settings, and private repo keys / downloaded SQLite files remain local-only.
- **Sync conflict fix** — repository timestamp handling now includes synced module timestamps to prevent repeated `repositories is newer than client data` conflict loops.
- **BSB upgraded to `bsb_v3.sqlite`** — normalized token data removes redundant poetry markers/line breaks, and existing bundled BSB installs auto-upgrade from older cached files.
- **BSB poetry display** — BSB q1 poetry lines receive a translation-scoped indent so quoted poetry reads more naturally.
- **Typography polish** — centralized typography formatting now handles verse-start binding, Bionic NBSPs, quote-spacing cleanup, marker safeguards, and safer first-word extraction.
- **Bible tab icon** — switched to the new closed Bible SVG asset and increased the visible icon size.
- **App version** — bumped visible/package version to `v0.8.6`.

### Repo Sync Integration — currentTranslation, Repository URLs in Sync
- **currentTranslation synced** — added `currentTranslation` to the `settings` sync module in both `_collectState()` and `_applyServerState()`. Device A's translation choice now propagates to device B.
- **Repository URLs synced** — added `repositories` sync module. Repository metadata (url, name, id only — no access_key) is now included in sync payload. Receiving device auto-adds unknown repos. Private repo keys remain local-only.
- **Sync service registered** — `addModule('repositories')` added to both `processSync()` and conflict-retry path in `sync-service.js`.
- **Timestamp tracking** — `repositories` added to `StateStore.moduleTimestamps` with save/load and `setModuleTimestamp` support.
- **Onboarding disclosure updated** — sync settings now list "Repository URLs" as shared, and "Private repository keys" + "Downloaded Bible databases" as never shared.

### Repo Dialog UX — https:// Prefix, Key Focus, Enter Submit
- **URL pre-typed** — the "Add Repository" URL input now starts with `value="https://"` so the user only types the domain/path.
- **Key input auto-focus** — when the protected repo unlock section appears without a saved access key, cursor is focused on the password input.
- **Enter confirms dialogs** — the unlock key input now has an `Enter` keydown handler that triggers `_onPopupUnlock()`. The add-repo URL input already had Enter support for `doAdd()`.

### BSB Poetry Fix — q1 Indent & v3 Cache Upgrade
- **BSB q1 indented** — added `body[data-translation="bsb"] .token-poetry.q1 .poetry-line` CSS override so BSB q1 poetry lines get the same visible indent as q2. BSB heavily uses q1 for quoted poetry lines that should be visually distinct from prose.
- **Translation on body** — `render-manager.js` now syncs `body.dataset.translation` from `currentTranslation` state (initial set in `_syncOnInit()` + listener in `_bind()`). Enables translation-scoped CSS selectors.
- **BSB v3 cache upgrade** — `bootstrapBSB()` now checks the installed record's `file_name`. If it isn't `bsb_v3.sqlite`, the old cached DB is removed and the bundled v3 is reinstalled. Wrapped in try-catch to avoid breaking app init.

### BSB Database Upgrade — bsb_v3 Normalized Token Data
- **Upgraded to `bsb_v3.sqlite`** — normalized `json_tokens` in BSB database: removed 7,258 trailing `poetry_start` tokens and 2,914 redundant `line_break`→`poetry_start` sequences. The app now loads `bsb_v3.sqlite` instead of `bsb_v2`.
- **Database references updated** — `scripture-repository-service.js` and `generate-wordlist.js` point to `bsb_v3.sqlite`. No renderer changes needed.
- **Integrity verified** — all 31,086 verses checked; `clean_text` matches reconstructed token text with zero mismatches.

### Typography Module — First-Word Hardening, Swipe Measure Fix, Marker Safeguards
- **_extractFirstWord() hardened** — now uses `trimStart()` + regex `[\s\u00A0]+` to split on any whitespace or NBSP, handling leading whitespace, tabs, and non-breaking spaces that the previous `indexOf(' ')` missed.
- **Swipe measure regression fixed** — added `max-width: none` to `#content.swipe-mode .verse-deck .verse-container` to prevent the Phase 1 `--verse-measure` cap from narrowing swipe cards.
- **Marker attachment safeguard** — `.footnote-caller` now has `white-space: nowrap` and `text-indent: 0` as extra protection against unwanted line-break behavior.
- **Token survey confirmed** — no `stanza_break` or `blank_line` token type exists in any of the 5 installed translations, so stanza-break rendering is deferred (no source data to render).
- **QA pass (code review)** — Psalms/Proverbs/Isaiah paths traced through scroll, spotlight, and swipe — poetry hanging indent, verse-start binding, and widow protection all apply correctly. Spotlight dimming and focus highlighting interact properly with centered verse containers.

### Typography Module — Bionic Centralization, Quote Spacing Fix & Cleanup
- **Bionic centralized** — `ctx.applyBionic()` in `TokenRenderer` now delegates to `TypographyModule.applyBionicToHtml()` when available, making the module the single canonical Bionic owner while preserving the inline fallback.
- **Opening quote spacing fix** — `fixOpeningQuoteSpacing()` strips invalid whitespace between opening quote marks and the following word (supports ASCII `"`, curly `“`, and curly `‘`). Called inside `formatTextNode()` before widow protection.
- **Trailing whitespace preserved** — `applyWidowProtection()` now restores trailing whitespace after text processing, avoiding character loss for tokens with intentional trailing spaces.
- **_extractFirstWord() helper** — first-word splitting logic extracted from `_renderText()` into a dedicated method for clarity.

### Typography Module — Phase 1 Fixes & Layout-Safe Micro-Typography
- **Poetry hanging indent fixed** — `text-indent` moved to `.poetry-line` (each poetic line now gets its own hanging indent via `display: block`), fixing the bug where `text-indent` on `.token-poetry` didn't apply after `<br>` breaks.
- **Rhythm variables connected** — `.token-section-heading` uses `--heading-margin-before/after`, `.token-paragraph` and `.token-paragraph-break` use `--paragraph-gap`.
- **Text column centered** — `max-width` moved from `.verse-text` to `.verse-container`; both `.verse-container` and `.token-section-heading` use `margin-inline: auto`.
- **Bridge injection** — `TokenRenderer` now accepts `bridge` on construction, giving it access to the `TypographyModule`. All call sites in `BaseRenderer` and `SwipeRenderer` updated.
- **Micro-typography APIs** — `TypographyModule.formatTextNode()`, `applyWidowProtection()`, and `applyBionicToHtml()` added.
- **Text routing** — `_renderText()` and `_renderSectionHeading()` route through `formatTextNode()` for widow prevention and future formatting.
- **Widow prevention** — prose binds last 2 words with `\u00A0`; poetry binds last 3 when the final word is short/sacred-name (`God`, `Lord`, `it`, `he`, `me`, `us`, `you`).
- **Verse number binding** — first text token creates `<span class="verse-start">` wrapping the verse number + first word with `white-space: nowrap`, preventing the verse number from ever sitting alone on a line.
- **Bionic NBSP-safe** — regex changed from `[^\s]+` to `[^\s\u00A0]+` so non-breaking-space-bound words are treated as separate Bionic targets.

### Typography Module (Visual Metrics)
- **New `TypographyModule`** — single owner of all typography CSS variables, registered on the bridge and initialized before `SettingsModule`.
- **Visual settings delegated** from `SettingsModule._applyTextSettings()` — font family/size, line height, letter spacing, and margins now flow through `TypographyModule.applyVisualSettings()` instead of being written directly.
- **Mode-aware reading width** — measure (character-level max-width) adapts per mode: scroll `min(72ch, 100%)`, spotlight `min(68ch, 100%)`, swipe `min(58ch, 100%)`. Applied via `--verse-measure` on `.verse-text` and `.token-section-heading`.
- **Better text wrapping** — `.verse-text` uses `text-wrap: pretty` to optimize the ragged right edge; `.token-section-heading` uses `text-wrap: balance` for even heading breaks.
- **Poetry hanging indents** — `--poetry-indent-unit` drives `q1`/`q2`/`q3` padding; `text-indent` prevents wrapped lines from aligning with the stanza start.
- **Dynamic vertical rhythm** — `--heading-margin-before`, `--heading-margin-after`, `--paragraph-gap`, and `--poetry-stanza-gap` scale proportionally with font size and line spacing.
- **Zero-impact inline markers** — `.footnote-caller`, `.crossref-indicator`, and `.token-section-heading-ref` use `--marker-font-size` (`0.65em`), `--marker-line-height` (`0`), and `--marker-color` (`var(--text-muted)`) so they don't disturb line rhythm.
- **Mode reactivity** — `TypographyModule` listens for `swipeMode`/`spotlightMode`/`speedMode` changes and reapplies visual settings automatically.

### Repository Download Fix & OPFS Migration
- Fixed repo download stuck on "Downloading..." — OPFS `importDb` can hang on large SQLite downloads. Now uses `sqlite3.opfs.importDb()` or `oo1.OpfsDb.importDb()` with a 60-second timeout and falls back to IDB on failure.
- Added 120-second fetch timeout with `AbortController` so the button always resets and shows a clear error.
- Added `migrateInstalledToOpfs()` — promotes existing IDB-stored repo databases to OPFS in the background at startup, cleaning up IDB bytes on success.
- `removeInstalledDatabase()` now cleans up OPFS files on uninstall.
- Bumped SW cache to v21 to ensure clients receive the fixed service files.

### Focus Mode & Settings Cleanup
- Focus mode progress text now matches the exit button styling (`font-size: 0.8rem`, `font-weight: 500`, `color: var(--text-muted)`) with no background/shadow bar.
- Removed empty bar at top of focus mode caused by `<main>` having `padding-top: 1rem`.
- Removed "Lock to Portrait" setting from the settings panel (including all JS wiring and state defaults).

### Selection Underline — Fix Poetry & Style-start Wrapping
- Fixed poetry selection underline only appearing on the last line — each poetry line is now wrapped in a `<span class="poetry-line">` so the wavy underline applies per-line instead of once at the bottom of the entire block.
- Fixed first line of verse missing underline when it starts with a style span (e.g., red-letter `.wj`) — `_renderStyleStart` now wraps bare style spans in a `.token-text` container so the underline selector matches them.
- Fixed blank poetry lines showing the selection underline — empty `.token-poetry` divs no longer get background styling since they lack `.poetry-line` children.

### UI Icons — Complete Refresh
- **Tab bar icons** replaced with new icon set:
  - Bible tab → `at-bible-book.svg`
  - Mode tab → `at-sensor.svg`
  - Search tab → `at-magnifying-glass-plus.svg`
  - Library tab → `at-star-bookmark.svg`
  - More tab → `at-dots-vertical.svg` (centered viewBox)
- **Mode popup icons** replaced:
  - Scroll → `at-roll-gym.svg`
  - Spotlight → `at-virtual-reality-eye.svg`
  - Swipe → `at-dot-arrow-up-down.svg`
  - Speed → `at-play-circle.svg`
  - Split → `at-layout-half-vertical.svg`
- **More popup icons** replaced:
  - Settings → `at-gear.svg`
  - Notes → `at-notebook.svg`
- **Close buttons** all use `at-xmark-circle.svg` (replaced ✕ text)
- **Nav install button** uses `at-add-folder.svg` (icon-only, no text)
- CSS: added `.mode-item .mode-icon svg` rule for consistent sizing (24×24px)

### Landscape Edge Gestures
- **Scroll mode: edge scrolling fixed** — `#content` now uses `width: 100vw` (bypasses flex `stretch`) with `margin-left: calc((100% - 100vw) / 2)` so the scrollable hit area extends to viewport edges. Text position preserved via `padding-left/padding-right: calc((100vw - 100%) / 2)`.
- **Swipe/Spotlight modes: edge taps/swipes fixed** — `body.swipe-mode, body.spotlight-mode` now have `margin: 0; touch-action: none; overscroll-behavior: none` to prevent browser edge-gesture interception. `pointercancel` handler advances verse instead of clearing state.
- **JS: edge touch detection** — `pointerdown` on `document` no longer bails out for edge touches (outer 15%) even when target is inside `#content`.
- **CSS: `overflow: hidden` removed** from `<main>` in both landscape media queries for scroll mode; `body.scroll-mode` gets `margin: 0` in landscape.

### Split Mode — Spotlight Navigation
- Split mode now uses **spotlight navigation** instead of scroll-sync — both panels navigate verse-by-verse.
- Right panel gets click zones (left/right half → prev/next), mouse wheel, and pointer swipe for verse navigation.
- Events register immediately on split activation (before async DB fetch finishes) so controls work from the first moment.
- Both panels scroll the same verse to center using `scrollIntoView({ block: 'center' })`.
- On split exit, restores the previous reading mode (scroll/swipe/spotlight/speed).
- Right-panel translation selection is remembered across sessions via localStorage.
- Added spotlight-mode CSS for the right panel (`.active-verse`/`.dimmed-verse`, paragraph-mode support).

### Removed Progress Bar Padding
- Removed `syncProgressBarPadding()` and `_syncProgressPadding()` (with all 7 call sites) — content no longer gets extra bottom padding from the progress bar.
- Removed `#landscape-layout { box-sizing: border-box }` from styles.css.

### Spotlight Mode Performance
- Replaced `scrollIntoView({ behavior: 'smooth' })` with a custom ease-out-quart animation (250ms) — smooth scrolling without the browser's janky smooth-scroll implementation.
- Fixed `.focused` class persisting on the first verse in non-paragraph spotlight mode — `.focused` now tracks the active verse on every advance.

### Spotlight Navigation
- Spacebar now advances verses in spotlight/swipe mode (speed mode keeps space for play/pause).
- Hold-to-advance on left/right touch zones — hold for 400ms, then auto-advances every 300ms with instant scroll.
- Hold uses recursive `setTimeout` to prevent overlapping advances.
- Instant scroll during hold (no smooth animation) for responsive feel.
- Text selection disabled during reading modes via CSS (`body.reading-mode .verse-text { user-select: none }`) and JS inline style guard on content element during hold.

### Code Review Fixes
- Fixed critical bug: split-mode verse tracking subscription was torn down on deactivation and never re-established on reactivation — the subscription now lives permanently, guarded by `this._active`.
- Document click listener for closing translation dropdowns is properly stored and removable via `destroy()`.
- `MutationObserver` stored as instance property for proper cleanup.
- `_loadChapterTranslation` now wraps `db.init(origTrans)` re-init in a try/catch to prevent DB state corruption on failure.
- `_highlightVerse` uses `requestAnimationFrame` instead of fragile `setTimeout(10)`.
- Hold-to-advance cleanup clears `_instantScroll` flag and `_ptrHoldJustEnded` on pointercancel/pointerleave.

### Navigation UI
- Added Old/New Testament tabs in the book list for quicker navigation.
- Added breadcrumb navigation (Books > Book Name > Chapter > Verse) replacing the old click-to-go-back title.

### Notes & Editor
- Notes markdown-to-HTML conversion now handles raw newlines from browser formatting and correctly processes empty paragraphs.
- Tag pill insertion handles inline formatting wrappers (strong/em/sup) without breaking the DOM.
- Cursor placement after tag insertion is more reliable across different formatting contexts.
- **New notes always open in edit mode** (toolbar visible, content editable immediately).
- **Cursor never lands inside tag pills** — `_setCursorAtEnd` walks up past `.tag-pill` and formatting wrappers (strong/em/sup) to place the cursor after all tag boundaries.
- `_normalize` re-applies `contentEditable="false"` to every `.tag-pill` after each normalization cycle.
- Tag pills generated by `_markdownToHtml` now include `contenteditable="false"` and use `&nbsp;` instead of collapsible spaces after trailing `</span>`.
- **Spacebar removed from spotlight/swipe navigation** to avoid conflict with the note editor. Arrow keys still work.

### Sync
- Fixed 409 conflict loop — `_stateApplier` is now properly awaited before `_stateProvider` during conflict retry, so the retry body always has fresh timestamps.

### Misc
- Removed `orientation: portrait-primary` from PWA manifest — allows landscape use on tablets.

### Split Mode (tablet/PC)
- New reading mode "Split" in the mode popup (hidden on screens <768px) — side-by-side translation comparison.
- Both panels show the same chapter synchronized — clicking a verse in either panel highlights it in both.
- Independent translation selector at the top of each panel.
- Replaces the earlier tabbed panel approach (Scripture/Notes/Search); split view is now purely a dual-translation comparison tool.

### Sync Consolidation — Single POST
- Sync now uses a single POST request instead of pull-before-push (GET + POST), cutting network traffic in half.
- Removed the `_isSynced` pull-before-push safety guard — conflict detection is handled server-side via 409 + retry.
- Added "Change Server" link to the sync onboarding modal.
- Onboarding modal now lists "Notes" in the synced data disclosure.
- Cleaned up noisy debug console logs from sync merge operations.

### Tag Count Cache & Performance
- Tag browser now loads instantly — tag counts are cached instead of scanned from every note, bookmark, and highlight on every open.
- Skeleton "Indexing tags…" placeholder shown while the cache builds on first boot.
- Cache auto-rebuilds after remote sync to stay in sync with server data.

### Bookmark & Highlight Tags
- Added tag input to bookmark and highlight cards — type `+#tag` and press Enter to add, click the chip to remove.
- Tags on bookmarks and highlights now persist across library close/reopen.
- Tag search finds bookmarks and highlights by their tags.

### Database Consolidation (Internal)
- Migrated all data into a single database (`focused_word_db`) for consistency and reliability.
- Fixes the root cause of bookmark/highlight tags not persisting — all user content now shares one data store.
- One-time automatic migration on first launch — existing bookmarks, highlights, and bookmark sets are preserved and moved to the unified database.

### Bookmark Set Sync
- Bookmark sets now sync across devices.

### Library UI Unified
- **Unified item layout** — notes tab now shows color stripe, delete button with undo toast, and clickable tag chips (→ tag search), matching bookmarks/highlights visual structure.
- **Dropdown filters** — bookmark set filter and notes category filter switched from pills to `<select>` dropdowns (highlight color filter stays as chips, as color is best shown visually).
- **Set management** — manage button (⋮) opens a popover listing all sets with ✏️ rename and 🗑 delete actions per set, replacing the old long-press context menu on chips.
- **CSS consolidation** — removed duplicated `.hl-color-*` / `.bm-set-*` classes; unified chip styling (tag chips share the same subtle border + hover tint); added `.library-select-filter` shared dropdown bar, `.filter-icon-btn`, and `.bm-set-manage-popover` styles.

## v0.8.5 (Major Version)

### Sync Rewrite
- Rewrote sync client for the new server API — faster, more reliable conflict resolution with per-module `updated_at` tracking.
- Notes, plans, and note categories now sync with correct timestamps from individual items (not a single stale module timestamp), fixing a bug where newer data was silently dropped.
- Server migration: note categories now sync under the correct `catagory` module name, with automatic backward compatibility for accounts that have existing category data.
- Fixed 409 conflict retry loop and stale timestamp overwrites.

### Notes System
- Full-featured Note Taking — create, edit, and organize Bible study notes with a rich WYSIWYG editor (bold, italic, headings, lists, blockquotes, superscript, and more).
- **Color-coded Categories** — each category gets a color dot for visual organization. Pick a color at creation time, or click any dot in the category manager to change it. Note cards show a colored left border matching the assigned category.
- **Fixed** — auto-save no longer resets the editor's category label display back to the default icon.
- **Auto-tagging** — tags are automatically extracted from `#topic` syntax in your note content. Click any tag to search across notes, highlights, and bookmarks.
- **Auto-save** — notes save automatically as you type with a debounced write buffer — no manual save button needed.
- **Quick deletion** — swipe to delete notes from the list view.
- **Sort & Filter** — sort notes by updated date, created date, or title; filter by category.
- **Access** — notes are available from the Library panel's Notes tab or via the dedicated Notes button in the More menu.
- Full sync support: notes, categories, and metadata sync securely across all your devices.

### Settings & UI
- **App Reset** now reliably clears all IndexedDB data, including note categories (fixed: categories were reappearing after reset).
- **Library tabs** — switching from Notes to Bookmarks/Highlights properly clears the gold active underline (fixed: persistent bottom border on Notes tab).
- **More menu icons** — Settings (⚙) and Notes (📝) replaced with inline SVG icons that inherit the theme's accent color on hover.
- **Header** — "Bookmarks & Highlights" renamed to "Library" across both the slide-up panel and legacy modal.

## v8.4.5

### Selection Underline
- Replaced the sidebar (border-left) indicator on selected verses with a smooth, curved underline in the accent color.
- The underline now appears below the text on every wrapped line in paragraph mode, and under each text segment in scroll/spotlight/swipe modes.
- Focus highlighting no longer interferes with the selection underline.

### Settings UX
- Settings sections now collapse automatically when the settings panel is closed, so you always start with a clean slate.

## v0.8.4

### Spotlight Mode Fix
- Fixed verse progress bar not updating when advancing or going back through verses in spotlight mode. The progress bar now correctly tracks the current verse as you move through the chapter.
- Added `updateProgress` method to BaseRenderer for unified progress bar updates across all reading modes.
- Swipe and Speed modes now use the same unified progress bar pathway.

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
