# What's New in Focused Word

## v1.0.2 — Sequential Reading Plans & Study Data Updates

### Sequential Reading Plan Progression
- **Strict Catch-Up Progression**: Reading plans will no longer jump ahead to today's or future days' scriptures if prior days remain uncompleted.
- **Guided Catch-Up Reading**: Unfinished days from earlier in the schedule are clearly marked as Catch-Up readings, allowing you to read and mark multiple missed days complete in order.
- **Home Screen Widget Sync**: The home reading plan card keeps you on track by surfacing the earliest incomplete reading.

### Background Study Database Updates & Expanded Word Classes
- **Automatic Background Checks**: Study databases (`BSB_token_annotations_v2.sqlite`, `bsb_word_data.sqlite`, and `lexicon_data.sqlite`) now check for updates in the background on launch when previously cached, ensuring you stay up to date without interrupting your reading or re-downloading fresh installs.
- **Reliable Revalidation**: Update checks use the study manifest's SHA-256 and bypass the browser HTTP cache, downloading the large Word Classes database only when its published hash changes.
- **Additional Word Classes**: Additional words have been added to the Word Classes database for enhanced semantic and grammatical classification across Scripture.

---

## v1.0.0 — Release Version

Focused Word is now officially v1.0.0! This is the complete, release-ready feature set, shipped in an offline-first, installable app for your phone, tablet, and desktop.

### Read Your Way
- **Scroll** — a smooth continuous scroll with gentle verse tracking and a focus highlight that follows you down the page.
- **Swipe** — flip through card-based passages with a satisfying swipe, perfect for phones.
- **Spotlight** — one verse centered at a time; tap the edges to advance.
- **Speed** — rapid word-by-word (RSVP) reading with adjustable words-per-minute and auto-advance.
- **Split** — read a second translation in a side-by-side (or stacked) reference panel.
- **Focus Mode** — hide everything else for a calm, distraction-free page.

### Understand the Passage
- **Word Classes** — people, places, times, animals, materials, and themes are color-coded so a passage's shape becomes visible at a glance. Tune each class's color and turn grammar (nouns, verbs, prepositions…) on or off.
- **Word Study** — tap any word to see the original Hebrew or Greek, transliteration, English meaning, grammatical form, and its Strong's number, plus a full lexicon entry with definitions, pronunciation, etymology, and other places the same word appears.
- **Clear Reading** — soften pronouns, connectors, and other glue words (soft or strong) so the main ideas pop. Fine-tune each category.
- **Cross References** — tap the † beside a verse for related passages inline.
- **Search** — find any verse, phrase, or topic across the whole Bible instantly.
- **Footnotes** — translator notes without leaving the page.
- **Chapter titles, headings, and poetry formatting** — keep the passage in context.
- **Per-word Red Letter** — the words of Christ set apart in red.

### Remember & Grow
- **Bookmarks** — save verses into named, color-coded sets and jump back anytime.
- **Highlights** — 6 highlighter colors for a word, verse, or whole passage, filterable by color.
- **Notes** — a clean, taggable notebook attached to verses.
- **Reading Plans** — curated 1-year plans (Traditional, Chronological, Alternate, M'Cheyne, OT+NT) with a guided daily flow, streaks, and progress.
- **Navigation History** — a Recent tab returns you to the last 50 places you visited.

### Make It Yours
- **4 complete looks** — Modern, Classic, Minimal, and Luminous.
- **11 color themes** and **19 accent colors**.
- **10 font families** with full control over size, line spacing, letter spacing, and margins.
- **Bionic Reading** — bold the first part of each word to guide the eye; adjustable strength.
- **Background texture** and per-word verse numbers (inline or gutter).

### Your Library, Connected
- **Install more translations** from a Scripture Repository by URL, with optional private-key protection and checksum verification.
- **Offline-First PWA** — installable on iOS, Android, Windows, or macOS. Translations, cross-references, study data, and fonts are cached so the app keeps working with no signal.
- **Cross-Device Sync** — keep reading position, settings, bookmarks, highlights, notes, plans, and reading history in sync via a simple passphrase, encrypted in transit and merged automatically.

### Thoughtful Details
- **In-app What's New, License, and Credits.**
- **Debug Log** for troubleshooting.
- **Accessible by design** — keyboard navigation, focus trapping, ARIA-aware controls, and an optional high-visibility font.

---

## v0.9.7 — Faster Chapters & iOS Polish

### Faster chapter switching with Study features on
Chapters now appear instantly even when Word Classes, Clear Reading, or Word Study are enabled. The text renders right away and word colors, dimming, and Word Study underlines stream in just after — so flipping between chapters feels quick again, even on large books. Rapid navigation discards stale updates so only the current chapter is colored.

### Word Study sheet no longer peeks on iOS
On iPhones with a notch or Dynamic Island, the hidden Word Study panel could show its bottom edge in the status bar area. It now hides fully above the safe area and slides in cleanly when you tap a word.

### Reliable Study data hosting
Word Classes, Word Study, and Clear Reading databases are loaded from `https://repo.focusedword.com/study` and cached after the first fetch, so future content updates don't require reinstalling the app.

---

## v0.9.6 — New Study Tools

### Study data hosted in the repository
The Word Classes and Word Study databases are now fetched from the Focused Word repository at `https://repo.focusedword.com/study` and cached on first load. The app no longer needs to ship them with the install, so future updates roll out without reinstalling.

### Smarter Word Classes
Word Classes now make it easier to see what words are about, including people, places, things, and spiritual beings. Grammar information is available too, while words without a clear label remain normal text so the page stays easy to read.

### Easier Study settings
The Study panel now lets you turn different kinds of word information on or off, adjust individual labels, and choose the colors that work best for you. The main word meanings are shown by default, while grammar coloring can be turned on when you want it. Your choices are saved and synced across devices.

### Clear Reading mode
Clear Reading helps the main ideas in a passage stand out by softening words such as pronouns, connectors, articles, and other linking words. Choose Soft or Strong mode, adjust each type of word individually, and keep important words such as negation easy to notice. Clear Reading works alongside Word Class colors.

### Explore words across Scripture
Word Study now shows the available meaning and grammar information for the selected word. Select a label to find other verses with the same kind of information, read short excerpts, and jump directly to any matching verse.

### More reliable Word Study
Tapping a word in Word Study now opens the exact source word, so repeated words like "and" or "the" always open the right Strong's entry.

---

## v0.9.1 — Navigation History & Bug Fixes

### 🕐 Navigation History
The book selector now has a **Recent** tab next to Old and New Testament. It shows your last 50 visited chapters with time-ago labels, so you can quickly jump back to where you were reading. Navigation history syncs across your devices and can be cleared with one tap.

### 🔧 Bug Fixes
- Reading navigation is more reliable — verses no longer get skipped when advancing through a chapter.
- Popup panels now keep focus trapped properly, so tab cycling won't escape to the page behind.
- Safe-area padding is corrected on notched phones and devices with gesture bars.
- Accent color and skin settings initialize correctly on first launch.

---

## v0.9.0 — Reading Plans, Luminous UI & Offline Updates

### Reading Plans
Create personalized Bible reading plans and stay on track with a guided daily reading flow. Plans show your progress and reading streak, let you mark days complete, pause when needed, and sync across your devices.

### Meet Luminous UI
Try the new **Luminous** UI in Settings for a polished, glass-inspired reading experience with its own visual styling and floating navigation.

### Meet Modern UI
Try the new **Modern** UI in Settings for a clean, contemporary reading experience with a floating Bible control and refined bottom navigation. Notes and Plans now use the same compressed-panel behavior, with a centered Notes handle and controls that remain clear of the bottom navigation.

### Clearer Settings & Startup
- The appearance selector in Settings is now labeled **UI**.
- Startup messages now appear on separate lines, making loading progress easier to read.

### Better Offline Updates
Modern UI assets are now included in the offline app shell, so installed apps receive the complete interface after updating.

---

## v0.8.8 — Split Mode Upgraded, Smarter Selections

Split mode gets some serious love in this release — the right panel can now do everything the main panel can.

### 📐 Split Mode: Right Panel is Now Full-Featured
The right/bottom panel in Split mode is no longer a read-only reference pane. You can now tap verses to select them, long-press to select a range, and copy the text with the right panel translation name included. Cross-reference markers also appear in the right panel now — tap any † to explore related verses.

Switching from split mode to speed reading or swipe reading works immediately, and the panel divider is thicker so you can see the split clearly.

### 📝 Notes: Full Text Selected
When you tap "Add Note" from the selection toolbar, all selected verse text is now included — no more notes cut off at 500 characters.

### 📋 Copy Uses Clean Abbreviations
Whether you use a repository-installed Bible or a bundled one, the abbreviation in copied citations will be the clean user-facing name instead of the internal database id.

### 👆 Verse Range Selection with Long-Press
Enter verse selection mode by tapping a verse, then long-press another verse to select everything in between. Great for highlighting or copying a passage in one step. This works in both the main and split panels.

### 📱 iOS Long-Press Fix
Native iOS text selection no longer interferes when long-pressing during verse selection mode.

---

## v0.8.7 — Smarter Spotlight, Smoother Scrolling

This update focuses on making Spotlight mode more intuitive and fixing several interaction quirks.

### 🎯 Spotlight Navigation Reworked
Tap advances are now restricted to the edges of the screen — left side goes back, right side goes forward. The center area never navigates, so you can tap a verse to select it without suddenly jumping. Long-press repeat also uses the same edge zones.

- **Verse selection is now a soft card style** — tinted background with an accent left rail, stable line endings, no layout shift.
- **Footnotes and cross-references** always open when tapped, even in the edge zones.
- **Split-mode panel** follows the same edge-zone navigation rules.

### 📱 iOS Focus Flash Fixed
When advancing verses in Spotlight mode, the old highlight no longer lingers — the transition fires immediately on the outgoing verse before activating the new one.

### 🎯 Smooth Mode Switching
Switching from any reading mode to Scroll mode now lands on the correct verse instead of jumping to a nearby one (e.g. verse 15 → 13). The scroll tracker waits for the programmatic scroll to settle before activating.

### 🖋 Verse Selection — Stable & Clean
The wavy SVG underline has been replaced with a clean card-style highlight. Tapping a verse no longer shifts line endings or rearranges the text — the layout stays exactly as it was.

### 🔧 Bug Fixes & Polish
- **Desktop chapter navigation bars** repositioned to floating pills outside the reader column.
- **Landscape edge gestures** fixed for scroll, swipe, and spotlight modes.

---

## v0.8.6 — Scripture Repositories, Better Sync & Reading Polish

This update makes Focused Word more flexible, easier to set up on multiple devices, and smoother to read across translations.

### 📚 Scripture Repositories
Install more Bible translations from remote repositories.
- Add a repository by URL from Settings.
- Repository URLs now start with `https://` so setup is faster.
- Protected repositories can be unlocked with a private key.
- The private key field focuses automatically when needed, and Enter/Return confirms unlock.
- Repository URLs sync across your devices, while private keys stay only on your device.

### 📖 Updated BSB Database
The bundled Berean Standard Bible has been refreshed.
- BSB now uses `bsb_v3.sqlite`.
- Poetry token cleanup removes extra blank rows and awkward line breaks.
- Matthew and quoted Old Testament poetry should format more naturally.
- Existing installs automatically upgrade from the older bundled BSB cache.

### ✍️ Better Typography
Scripture text has received several readability improvements.
- Verse numbers stay attached to the first word instead of being left alone on a line.
- Poetry hanging indents are more stable across reading modes.
- Footnote markers behave better at line breaks.
- Opening quote spacing is cleaned up automatically for translations that include extra spaces.
- Bionic Reading now works more consistently with non-breaking spaces.

### 🔄 Smarter Sync
Sync now knows about repository metadata and translation choice.
- Current translation selection syncs across devices.
- Repository URLs are included in sync data.
- Downloaded Bible database files are not synced; each device downloads its own copy.
- Private repository keys are not synced.
- Repository timestamp handling was improved to avoid repeated conflict loops.

### 🎨 Interface Polish
Small UI details were refined.
- The Bible tab now uses the new closed Bible icon asset.
- The Bible tab icon is larger and easier to see.
- Swipe mode keeps its card width instead of being narrowed by reading-measure settings.

### 🔧 Stability Fixes
Several under-the-hood fixes reduce edge-case bugs.
- Repo download and OPFS fallback behavior is more reliable.
- Sync conflict retry handling is safer.
- BSB cache upgrades no longer require manually clearing browser data.

---

*Thanks for reading with Focused Word.*
