# What's New in Focused Word

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
