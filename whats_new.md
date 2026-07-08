# What's New in Focused Word

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
