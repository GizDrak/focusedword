# Third-Party Notices and Data Provenance

This document records the license, provenance, version, and integrity
information for every third-party asset redistributed by Focused Word. It
covers dependencies, fonts, icons, the vendored SQLite WASM build, and the
scripture / cross-reference datasets committed to the repository.

First-party source code is licensed separately under the MIT license in
[`LICENSE`](./LICENSE). The notices below do not alter or extend that
grant. Where a source is "repository-installed only" (fetched at runtime
from a user-supplied URL), it is not bundled in this repository and is not
covered by this file; the user is responsible for the rights to any such
data.

---



## 1. Runtime and Build Dependencies

| Component | Use | Version | License | Source |
|-----------|------|---------|---------|--------|
| `@sqlite.org/sqlite-wasm` | Vendored browser SQLite (WASM) | 3.53.0 | Public domain (SQLite) + Emscripten (MIT / UIUC/NCSA) | https://github.com/sqlite/sqlite-wasm |
| `sql.js` | Build/audit tooling only (not used at runtime) | ^1.14.1 | MIT | https://github.com/sql-js/sql.js |
| `node-forge` | Build/audit tooling only | ^1.4.0 | BSD-3-Clause OR GPL-2.0 | https://github.com/digitalbazaar/forge |

The vendored SQLite WASM build is tracked at `js/vendor/sqlite-wasm/`
(`index.mjs` and `sqlite3.wasm`). See `js/vendor/sqlite-wasm/NOTICE.md`
for the full upstream license text.

---

## 2. Fonts

All bundled fonts are released under the SIL Open Font License, Version 1.1
(OFL-1.1). The full license text is in [`assets/fonts/OFL.txt`](./assets/fonts/OFL.txt).

| Font family | Tracked version | Designer(s) | Source |
|-------------|-----------------|------------|--------|
| Atkinson Hyperlegible | v12 | Braille Institute | https://fonts.google.com/specimen/Atkinson+Hyperlegible |
| Caveat | v23 | Pablo Impallari | https://fonts.google.com/specimen/Caveat |
| Comic Neue | v9 | Cosimo Lorenzo Pancini (Zetan Spore) | https://fonts.google.com/specimen/Comic+Neue |
| Crimson Pro | v28 | Jacques Le Bailly | https://fonts.google.com/specimen/Crimson+Pro |
| IBM Plex Mono | v20 | Mike Abbink, Bold Monday | https://fonts.google.com/specimen/IBM+Plex+Mono |
| Inter | v20 | Rasmus Andersson | https://fonts.google.com/specimen/Inter |
| Lexend | v26 | Bonnie Shaver-Troup (Thomas Jockin) | https://fonts.google.com/specimen/Lexend |
| Lora | v37 | CYAN, Olga Karpushina, Alexei Vanyashin | https://fonts.google.com/specimen/Lora |
| Merriweather | v33 | Sorkin Type | https://fonts.google.com/specimen/Merriweather |
| Roboto | v51 | Christian Robertson | https://fonts.google.com/specimen/Roboto |

The Latin-subset `.woff2` files are committed under `assets/fonts/`.
OFL-1.1 requires that the license and copyright notices be distributed with
the fonts; this document and `assets/fonts/OFL.txt` satisfy that
requirement. Reserved font names are not modified.

---

## 3. Icons

| Icon set | Path | License / provenance |
|----------|------|----------------------|
| Project app icon | `assets/icons/icon.svg` and derived raster/PWA icons (`assets/icons/icon-*.png`, `assets/icons/ios/*`, `assets/icons/android/*`, `assets/icons/pwa/*`, `assets/icons/icon-dark.svg`, `assets/icons/icon-light.svg`) | Original artwork created for Focused Word. Covered by the project MIT license. |
| UI glyphs | `assets/icons/ui/*.svg` | Original artwork created for Focused Word. Covered by the project MIT license. |

If any icon asset is later replaced with a third-party icon set, its license
and required attribution must be added here and in the asset inventory.

---

## 4. Scripture and Cross-Reference Data

Datasets committed to `scripture/en/` are redistributed subject to their own
terms. The provenance below is the authoritative record for this repository.

| Dataset | File | License / terms | Source | Notes |
|---------|------|-----------------|--------|-------|
| Berean Standard Bible (BSB) | `scripture/en/bsb_v3.sqlite` | Creative Commons CC0 1.0 (public domain dedication) | Berean Bible Company — https://berean.bible/ | Bundled, default translation. Manifest `copyright`: "Creative Commons CC0". |
| Treasury of Scripture Knowledge cross-references | `scripture/en/cross_references.db` | Public domain compilation | Derived from the public-domain Treasury of Scripture Knowledge dataset | Bundled cross-reference data. |

### Word-study databases

The word-study feature databases (`bsb_word_data.sqlite`,
`bsb_word_classes.sqlite`, `BSB_token_annotations_v2.sqlite`,
`lexicon_data.sqlite`) are fetched at runtime from the Focused Word
repository at `https://repo.focusedword.com/study/<filename>` and cached
in OPFS or Cache Storage. They are derived from a number of third-party
data sources. The provenance for each source is recorded here.

| Source | What it provides | License / terms | Reference |
|--------|------------------|-----------------|-----------|
| Berean Standard Bible (BSB) | Scripture text used as the base for word data and token annotations (`bsb_v3.sqlite`) | Free for public use by Berean Bible | https://berean.bible/ |
| STEPBible.org / Tyndale House, Cambridge | Lexicons (TBESH, TBESG, TFLSJ) and morphology codes (TEHMC, TEGMC, TIPNR) | Creative Commons Attribution 4.0 International (CC BY 4.0) — credit STEPBible.org and Tyndale House | https://creativecommons.org/licenses/by/4.0/ — https://stepbible.org/ |
| BibleForgeDB interlinear | Per-occurrence pronunciation (IPA, SBL, dictionary-style) | Public domain (per the source README) | https://github.com/bibleforge/BibleForgeDB |
| cskit-strongs-rb concordance | Strong's concordance data | Public domain (per the source README) | https://github.com/camertron/cskit-strongs-rb |
| Lexicon Omnium Gentium | "Strong's Concordance, 28 Languages, 547K Definitions" — Strong's pronunciations, etymology, KJV renderings, parts of speech | Open dataset (Zenodo) | https://zenodo.org/records/19099634 |

Notable restrictions on definitions derived from the above sources:

- **TBESH** is based on the Abridged BDB (Online Bible). Permission should be
  gained from Online Bible before these definitions are applied in any project.
- **TFLSJ** draws from Abbott-Smith, Middle Liddell, and Bill Mounce's Greek
  dictionary where Abbott-Smith lacks a definition.

### Repository-installed translations (not bundled here)

The app supports installing additional translations at runtime from
user-provided repository URLs. Those databases are NOT included in this
repository and are NOT licensed by Focused Word. Each is governed by its own
copyright and license (for example, ASV, KJV, and WEB are public domain;
NET is "©1996-2016 Biblical Studies Press, L.L.C. — used by permission").
Users are responsible for confirming they have the right to use and
redistribute any repository-installed data.

---

## 5. License Texts

The full license text for the project's own code is in [`LICENSE`](./LICENSE)
(MIT with Commons Clause). The full text of the SIL Open Font License is in
[`assets/fonts/OFL.txt`](./assets/fonts/OFL.txt).
