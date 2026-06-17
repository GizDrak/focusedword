# Changelog — Focused Word

## v0.8

### Themes & Accents
- Added **Galaxy** theme (#0F0A1F / #E6D9FF) — deep purple-dark with purple accent
- Renamed themes: Midnight → Eclipse, Linen → Parchment, Forest → Pine, Royal → Velvet
- New accent palette: 15 colors spread across the color wheel (Purple, Indigo, Sapphire, Ice, Teal, Emerald, Mint, Sage, Rose, Coral, Amber, Gold, Bronze, Slate)
- Sage (green) replaced with Pink (`#F472B6`)
- Removed Lilac accent

### Paragraph Reading
- Paragraph mode now works in **spotlight mode** (inline focus pill instead of dimmed verses)
- Paragraph breaks are automatically enabled when Paragraph Reading is on
- `paragraph_start` tokens create `<br>` + spacing span in paragraph mode
- Leading paragraph break suppressed if at start of a verse
- Left sidebar accent removed in paragraph mode focus state

### Search
- Added full **SearchModule** with pagination (25 results, Load More)
- XSS-safe highlighting with `_escapeHtml()`
- Prefix search highlighting fixed (no trailing `\b`)
- Discover tab opens search panel (slide-up from navigation)

### Library Panel
- Redesigned **slide-up library panel** from bottom (styled like nav sheet)
- Old centered modal retained as fallback (`open()` vs `openSlideUp()`)
- Bookmark filter bar made sticky (stays at top while scrolling)

### Text Settings
- Section headings now use `--verse-font-family`, `calc(--verse-font-size * 0.92)`, `--verse-line-height`, `--verse-letter-spacing`
- Default font size changed from 14pt to 13pt

### Scripture Database
- All `.sqlite` files renamed to `{slug}_v1.sqlite` (versioned paths)
- Added `getCoreDb()` method for direct SQLite access
- WAL-mode safety patch in `createDbFromBytes()` (bytes 18–19 forced to rollback mode)

### API Migration
- `cross-references.js` migrated from `selectObjects()` to `oo1.DB.exec()`
- `search.js` uses `returnValue: 'resultRows'` for SQLite-WASM compliance

### Highlight System
- **Range highlights**: multi-verse full highlights save as a single entry with `verseEnd`
- Display shows `"1–8"` instead of 8 separate entries
- Highlight style: text color on dark themes, background on light themes
- Selection text no longer includes verse number digits

### Interaction Fixes
- Selection mode blocks footnotes and cross-references from activating
- Spotlight mode undims verses during selection mode (`#content.verse-selecting`)
- Fixed `_positionToolbar` (no-op — toolbar stays at CSS position)
- Removed nonexistent `_toggleVerseSelectingClass` call

### Cross-References
- Fixed FTS5 MATCH query — table aliases not supported, uses `bible_search` directly
- Removed invalid `returnValue: 'resultRows'` option from exec call

### UI Polish
- Search input height increased for better usability
- Scroll mode padding-bottom increased to 25vh for last-verse clearance
- `.verse-text` set to `display: block` globally (fixes poetry div spacing)
- Speed mode icon changed from ⚡ to ▶
- Swipe mode icon changed from ⊳ to ↔
- Translation selector moved outside scrollable nav view (sticky)
- Changelog panel (What's New button in Data section)
- Changelog markdown rendered with proper headings, lists, bold, inline code

### Bugfixes
- Bookmark delete now removes left border from verse containers
- Highlight/bookmark display text strips leading verse number digits, truncates at 80 chars
- Database fails to load (WAL mode crash) — safety patch
- Section heading bottom padding reduced
- `idToCode` returning undefined for book IDs

---

## v0.7

### SQLite Schema Refactor
- New `bible_verses` + `bible_search` (FTS5) schema with `json_tokens` for rich rendering
- Token-based rendering with `TokenRenderer` — handles paragraph_start, poetry_start, section_heading, text, style_start/end (wj), footnote, cross_ref, line_break
- `MarkdownParser` for inline markdown (`*italic*` / `**bold**`)
- Legacy USFM format removed
- All 4 renderers (scroll/swipe/spotlight/speed) use token-format verses

### Red Letter (Words of Jesus)
- Handled via `style_start`/`style_end` tokens with `style:"wj"` — wrappable in `<span class="wj">`
- Conditionally rendered via `settings.redLetter` toggle

### Premium Dark UI Redesign
- Bottom navigation bar (Discover, Mode, Bible, Library, More)
- Mode grid popup (3-column), More popup (search + settings)
- Gold/amber accent theme, chapter header with SVG emblem
- Floating dropdown, vertical verse progress bar, dark default theme
- Large verse typography (1.2rem), Playfair Display for titles

### Render Pipeline Refactor
- ViewManager + RenderManager with three-phase lifecycle (prepare → dispatch → finalize)
- RAF-based post-render: header, focus, scroll, bookmarks, highlights
- Renderers only build DOM; per-advance side effects stay in renderers

### Cross-References Restoration
- Old `cross_references.db` system restored alongside token cross-refs
- Cross-ref indicators on verse containers (controlled by `crossRefs` toggle)

### Various Bugfixes
- Swipe→scroll verse jump, swipe→spotlight viewport stuck
- Mode-switch verse off-center (header animation)
- Scroll mode verse skipping on desktop/tablet
- Text spacing differences between scroll and spotlight
- currentVerse restoration lost on app refresh
- Paragraph mode toggle failures
