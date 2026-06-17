# Bible App Database Architecture & JSON Schema Guide

This document serves as the official specification for the SQLite database architecture used in the Bible application. It details the hybrid "Clean Text + JSON Tokens" approach designed to maximize full-text search performance while perfectly preserving complex USFM layout metadata (poetry, footnotes, inline styles) for the frontend UI.

---

## 1. Architectural Philosophy

The core challenge of Bible data is **overlapping hierarchies** (e.g., a paragraph starting in the middle of a verse) and **metadata pollution** (Strong's numbers, footnotes, and cross-references breaking search indices). 

This architecture solves this by splitting the data into two distinct lanes:
1.  **`clean_text`**: A pristine, unformatted string stripped of all metadata, formatting, and markdown. Optimized exclusively for SQLite's FTS5 (Full-Text Search) engine.
2.  **`json_tokens`**: A serialized array of rendering commands. The frontend app iterates through these tokens to draw the UI, apply CSS, and inject interactive elements. To prevent data bloat, inline text styling (like italics for added words) relies on **Inline Markdown** rather than fragmented structural tokens.

---

## 2. SQLite Database Schema

Each translation (e.g., BSB, ASV, KJV) should reside in its own isolated `.sqlite` file to minimize storage footprint and allow for modular, on-demand downloads.

### Core Tables


```


sql
-- Main Table: Stores the structure, search string, and layout tokens
CREATE TABLE bible_verses (
id TEXT PRIMARY KEY,       -- Format: "BOOK.CHAPTER.VERSE" (e.g., "GEN.1.1")
book TEXT NOT NULL,        -- 3-Letter USFM Book Code (e.g., "GEN", "MAT")
chapter INTEGER NOT NULL,
verse INTEGER NOT NULL,
clean_text TEXT,           -- Pristine text for FTS5 and plain-text reading
json_tokens TEXT           -- Serialized JSON array of UI layout tokens
);

-- Virtual Table: FTS5 Engine for Lightning-Fast Search
CREATE VIRTUAL TABLE bible_search USING fts5 (
verse_id UNINDEXED,        -- Mirrors bible_verses.id, not included in search index
clean_text                 -- The actual searchable column
);

```

### Essential Indices

To ensure instantaneous navigation when a user opens a chapter, the database utilizes compound indexing:

```sql
CREATE INDEX idx_bible_verses_book ON bible_verses (book);
CREATE INDEX idx_bible_verses_ref ON bible_verses (book, chapter, verse);

```

---

## 3. The `clean_text` Specification

The `clean_text` column must strictly adhere to the following rules to ensure search accuracy:

* **No USFM Tags:** All markers (e.g., `\\p`, `\\q1`, `\\wj`) are removed.
* **No Inline Metadata:** Footnote text (`\\f`), cross-references (`\\x`), and section headings (`\\s`) are entirely excluded.
* **No Morphological Data:** Strong's numbers or lemma tags (e.g., `|strong="H7225"`) are completely stripped.
* **No Markdown:** Inline formatting asterisks (`*` or ``) MUST be stripped so they do not interfere with text matching.
* **No Formatting Artifacts:** No trailing spaces before punctuation (e.g., `God ,` becomes `God,`) and no raw newline (`\\n`) or pilcrow (`¶`) characters.

**Example `clean_text` (Genesis 1:2):**

> `"And the earth was without form, and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters."`

---

## 4. The `json_tokens` Specification

The `json_tokens` column contains a serialized JSON array. The frontend rendering engine should iterate through this array sequentially to build the UI.

### A. Block / Layout Tokens

These tokens define the structure of the page and dictate spacing, indentation, and margins.

| Token Type | JSON Signature | UI Behavior |
| --- | --- | --- |
| **Paragraph** | `{"type": "paragraph_start", "style": "p"}` | Starts a standard flush-left block of text. |
| **Poetry** | `{"type": "poetry_start", "style": "q1"}` | Indents the following text (Level 1). |
| **Poetry (Deep)** | `{"type": "poetry_start", "style": "q2"}` | Further indents the following text (Level 2). |
| **Selah / Music** | `{"type": "poetry_start", "style": "qr"}` | Flush-right alignment (typically used for "Selah"). |
| **Line Break** | `{"type": "line_break"}` | Forces a visual carriage return without ending the block. |
| **Section** | `{"type": "section_heading", "text": "..."}` | Renders a bold, centered heading *above* the verse. |

### B. Inline Text Tokens (With Markdown)

These tokens contain the actual spoken/written words. To prevent massive file bloat (especially in the KJV), contiguous text strings are merged together. Inline formatting (like translator-added words) uses **Markdown syntax** directly inside the string.

| Token Type | JSON Signature | UI Behavior |
| --- | --- | --- |
| **Standard Text** | `{"type": "text", "text": "and darkness *was* upon..."}` | Renders standard body text. The frontend must parse Markdown (`*text*` or `**text**`) into italics/bold. |

### C. Interactive Metadata Tokens

These tokens represent interactive elements that users can tap/click to reveal more information.

| Token Type | JSON Signature | UI Behavior |
| --- | --- | --- |
| **Footnote** | `{"type": "footnote", "marker": "+", "text": "..."}` | Renders a clickable superscript icon (e.g., `+` or `*`) that opens a modal with the `text`. |
| **Cross-Ref** | `{"type": "cross_ref", "text": "( See John 3:16 )"}` | Renders an inline link or clickable icon navigating to the target verse. |

---

## 5. JSON Token Array Examples

### Example A: Complex Structure (Psalm 1:1)

Contains a section heading, poetic indentations, and line breaks.

```json
[
  { "type": "section_heading", "text": "The Two Paths" },
  { "type": "poetry_start", "style": "q1" },
  { "type": "text", "text": "Blessed is the man" },
  { "type": "poetry_start", "style": "q2" },
  { "type": "text", "text": "who does not walk in the counsel of the wicked," },
  { "type": "poetry_start", "style": "q1" }
]

```

### Example B: Markdown Injection (Genesis 1:2 KJV)

Shows contiguous text containing translator-added words formatted via Markdown.

```json
[
  { 
    "type": "text", 
    "text": "And the earth was without form, and void; and darkness *was* upon the face of the deep. And the Spirit of God moved upon the face of the waters." 
  },
  { 
    "type": "paragraph_start", 
    "style": "p" 
  }
]

```

## 6. Implementation Notes for Frontend Engineers

1. **Rendering Engine Setup:** Build a sequential iterator in your frontend framework (React, Flutter, Swift, etc.). Loop through the array and append UI widgets based on the `type` key.
2. **Markdown Parsing:** Whenever your UI encounters a `{"type": "text"}` token, it must run the string through a lightweight Markdown parser to apply inline styles (e.g., `*was*` -> *was*) before drawing it to the screen.
3. **Handling Styles:** Do not hardcode CSS into the database. Let the UI framework map token styles (e.g., `"style": "q2"`) to dynamic application themes (Dark Mode, Light Mode, Custom Font Sizes).
4. **Search Implementation:** To search the Bible, run a standard `MATCH` query against the `bible_search` FTS5 table, then use the returned `verse_id` to fetch the rich JSON array from the `bible_verses` table for rendering.

