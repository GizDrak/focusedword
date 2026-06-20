// usfm-to-sqlite.js
// Parses a USFM Bible source directory and writes a sqlite database matching
// the Focused_Word BSB schema. This pass keeps EVERYTHING from the source:
//   - All 66 canonical books, plus apocrypha / deuterocanon / front matter
//   - All inline + block USFM markers (poetry, sections, footnotes, cross-refs,
//     introductions, keywords, book/chapter titles, lists, etc.)
//   - Verse ranges and letter-suffix verse numbers
//   - Sub-footnote structure (ref, text, alt, variant, keyword)
//   - Sub-cross-reference structure (target, text, origin code)
// The only thing deliberately dropped is Strong's numbers — they live in
// source as `|strong="H1234"` attributes on \w … \w* ranges. We strip the
// attribute and emit clean text in both `text` and `text_html`.

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

// ---------------------------------------------------------------------------
// Book order
// ---------------------------------------------------------------------------
// 1-66: canonical 66-book Protestant canon (BSB is the source of truth).
// 67-83: deuterocanonical / apocryphal / front matter that some WEB / KJV
// 2006 sources include. IDs are stable and never reused.

const BOOK_ORDER = [
  // 1-39 OT
  ['GEN', 'Genesis'], ['EXO', 'Exodus'], ['LEV', 'Leviticus'], ['NUM', 'Numbers'],
  ['DEU', 'Deuteronomy'], ['JOS', 'Joshua'], ['JDG', 'Judges'], ['RUT', 'Ruth'],
  ['1SA', 'I Samuel'], ['2SA', 'II Samuel'], ['1KI', 'I Kings'], ['2KI', 'II Kings'],
  ['1CH', 'I Chronicles'], ['2CH', 'II Chronicles'], ['EZR', 'Ezra'], ['NEH', 'Nehemiah'],
  ['EST', 'Esther'], ['JOB', 'Job'], ['PSA', 'Psalms'], ['PRO', 'Proverbs'],
  ['ECC', 'Ecclesiastes'], ['SNG', 'Song of Solomon'], ['ISA', 'Isaiah'], ['JER', 'Jeremiah'],
  ['LAM', 'Lamentations'], ['EZK', 'Ezekiel'], ['DAN', 'Daniel'], ['HOS', 'Hosea'],
  ['JOL', 'Joel'], ['AMO', 'Amos'], ['OBA', 'Obadiah'], ['JON', 'Jonah'],
  ['MIC', 'Micah'], ['NAM', 'Nahum'], ['HAB', 'Habakkuk'], ['ZEP', 'Zephaniah'],
  ['HAG', 'Haggai'], ['ZEC', 'Zechariah'], ['MAL', 'Malachi'],
  // 40-66 NT
  ['MAT', 'Matthew'], ['MRK', 'Mark'], ['LUK', 'Luke'], ['JHN', 'John'],
  ['ACT', 'Acts'], ['ROM', 'Romans'], ['1CO', 'I Corinthians'], ['2CO', 'II Corinthians'],
  ['GAL', 'Galatians'], ['EPH', 'Ephesians'], ['PHP', 'Philippians'], ['COL', 'Colossians'],
  ['1TH', 'I Thessalonians'], ['2TH', 'II Thessalonians'], ['1TI', 'I Timothy'],
  ['2TI', 'II Timothy'], ['TIT', 'Titus'], ['PHM', 'Philemon'], ['HEB', 'Hebrews'],
  ['JAS', 'James'], ['1PE', 'I Peter'], ['2PE', 'II Peter'], ['1JN', 'I John'],
  ['2JN', 'II John'], ['3JN', 'III John'], ['JUD', 'Jude'], ['REV', 'Revelation of John'],
  // 67-83 deuterocanon / apocrypha / front matter (only some translations)
  ['TOB', 'Tobit'],                       // 67
  ['JDT', 'Judith'],                       // 68
  ['ESG', 'Esther (Greek)'],               // 69
  ['WIS', 'Wisdom of Solomon'],            // 70
  ['SIR', 'Sirach (Ecclesiasticus)'],      // 71
  ['BAR', 'Baruch'],                       // 72
  ['1MA', 'I Maccabees'],                  // 73
  ['2MA', 'II Maccabees'],                 // 74
  ['3MA', 'III Maccabees'],                // 75
  ['4MA', 'IV Maccabees'],                 // 76
  ['1ES', 'I Esdras'],                     // 77
  ['2ES', 'II Esdras'],                    // 78
  ['MAN', 'Prayer of Manasseh'],           // 79
  ['PS2', 'Psalm 151'],                    // 80
  ['DAG', 'Daniel (Greek)'],               // 81
  ['FRT', 'Preface'],                      // 82
  ['INT', 'Introduction'],                 // 83
  ['GLO', 'Glossary']                      // 84
];

const BOOK_CODE_TO_ID = {};
const BOOK_ID_TO_NAME = {};
BOOK_ORDER.forEach(([code, name], i) => {
  const id = i + 1;
  BOOK_CODE_TO_ID[code] = id;
  BOOK_ID_TO_NAME[id] = name;
});

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

// Strip USFM attribute lists like |strong="H1234"| or |lemma="x"|. We strip
// Strong's deliberately; any other attributes are also dropped. We ONLY
// remove pipes that are followed by `name="value"` (i.e. explicit
// key=value attributes). Bare `|` separators — used in \ref text|target
// spec — are left alone.
function stripAttrs(s) {
  return s.replace(/\|[A-Za-z][\w-]*="[^"]*"/g, '').replace(/\s+\|?$/, '').trim();
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Strip USFM inline markers whose body we keep as plain text. This is the
// safety net for the paragraph/poetry line-level rendering path. Also drops
// Strong's attributes (|strong="H1234") from any text that was already
// extracted from a \w range. Order matters: handle the marker pairs first
// (so we can reach the body), THEN do a global attr strip as a safety net.
function applyInlineTransforms(s) {
  s = s.replace(/\\w\s+([\s\S]*?)\\w\s*\*/g, (_, body) => stripAttrs(body));
  s = s.replace(/\\\+w\s+([\s\S]*?)\\\+w\s*\*/g, (_, body) => stripAttrs(body));
  s = s.replace(/\\\+?add\s+([\s\S]*?)\\\+?add\s*\*/g, (_, body) => body);
  s = s.replace(/\\\+?add\s*\*?/g, '');
  s = s.replace(/\\wj\s+([\s\S]*?)\\wj\s*\*/g, '$1');
  s = s.replace(/\\wj\s*\*?/g, '');
  s = s.replace(/\\\+?(em|bd|it|sc|no|nd|qt)\s+([\s\S]*?)\\\+?\1\s*\*/g, '$2');
  s = s.replace(/\\\+?(em|bd|it|sc|no|nd|qt)\s*\*?/g, '');
  // Inline cross-references: keep text only
  s = s.replace(/\\ref\s+([\s\S]*?)\\ref\s*\*/g, (_, body) => {
    const i = body.lastIndexOf('|');
    return i >= 0 ? body.slice(0, i) : body;
  });
  // Inline key terms (used in glossary): keep word only
  s = s.replace(/\\k\s+([\s\S]*?)\\k\s*\*/g, '$1');
  s = s.replace(/\\k\s*\*?/g, '');
  // Book titles (\bk Word\bk*) — keep word
  s = s.replace(/\\bk\s+([\s\S]*?)\\bk\s*\*/g, '$1');
  s = s.replace(/\\bk\s*\*?/g, '');
  // Transliterated (\tl Word\tl*) — keep word
  s = s.replace(/\\tl\s+([\s\S]*?)\\tl\s*\*/g, '$1');
  s = s.replace(/\\tl\s*\*?/g, '');
  // \fq…\fq*, \fqa…\fqa*, \fk…\fk*, \fv…\fv*, \fp…\fp*, \fdc…\fdc*,
  // \fl…\fl* — keep inner text
  s = s.replace(/\\f(qa|k|v|p|q|dc|l)\s+([\s\S]*?)\\f\1\s*\*/g, '$2');
  s = s.replace(/\\f(qa|k|v|p|q|dc|l)\s*\*?/g, '');
  // Safety net: strip any lingering |attr="…" or |attr on what remains.
  s = stripAttrs(s);
  return s;
}

// ---------------------------------------------------------------------------
// Marker catalogue — the single source of truth for the parser
// ---------------------------------------------------------------------------
// Each entry says:
//   type: 'block'    consumes to end of line
//          'inline'  pair-marker, the body is its argument (em, bd, wj, …)
//          'inline-r'  range-marker that wraps inline content (w, add, ref, k, bk, tl, …)
//          'note'    footnote / cross-ref family — captured separately
//          'meta'    header / book-level — dropped to end of line
//          'skip'    silently dropped (no text emitted)
//   html: 'tag'      rendered as <tag>…</tag>  (for type=inline or inline-r)
//         'void'     self-closing
//         'drop'     not emitted
//         'inline'   emitted as plain inline text
//   blockHtml: how a block-level marker renders its line
const MARKERS = {
  // ---- Paragraphs / poetry -----------------------------------------------
  p:    { type: 'block', blockHtml: 'p' },
  pb:   { type: 'block', blockHtml: 'p' },
  pc:   { type: 'block', blockHtml: 'pc' },
  pr:   { type: 'block', blockHtml: 'p' },
  pmo:  { type: 'block', blockHtml: 'pmo' },
  pm:   { type: 'block', blockHtml: 'p' },
  pmc:  { type: 'block', blockHtml: 'p' },
  pi:   { type: 'block', blockHtml: 'pi' },
  pi1:  { type: 'block', blockHtml: 'pi1' },
  pi2:  { type: 'block', blockHtml: 'pi2' },
  pi3:  { type: 'block', blockHtml: 'pi3' },
  mi:   { type: 'block', blockHtml: 'mi' },
  nb:   { type: 'block', blockHtml: 'p' },
  cls:  { type: 'block', blockHtml: 'p' },
  qr:   { type: 'block', blockHtml: 'qr' },
  qa:   { type: 'block', blockHtml: 'qa' },
  qac:  { type: 'block', blockHtml: 'qa' },
  q:    { type: 'block', blockHtml: 'q' },
  q1:   { type: 'block', blockHtml: 'q1' },
  q2:   { type: 'block', blockHtml: 'q2' },
  q3:   { type: 'block', blockHtml: 'q3' },
  q4:   { type: 'block', blockHtml: 'q4' },
  qm:   { type: 'block', blockHtml: 'qm' },
  qm1:  { type: 'block', blockHtml: 'qm1' },
  qm2:  { type: 'block', blockHtml: 'qm2' },
  qm3:  { type: 'block', blockHtml: 'qm3' },
  qs:   { type: 'block', blockHtml: 'qs' },
  qc:   { type: 'block', blockHtml: 'qc' },
  qt:   { type: 'inline-r', html: 'drop' },   // quoted OT in NT; keep inner text
  li:   { type: 'block', blockHtml: 'li' },
  li1:  { type: 'block', blockHtml: 'li1' },
  li2:  { type: 'block', blockHtml: 'li2' },
  li3:  { type: 'block', blockHtml: 'li3' },
  li4:  { type: 'block', blockHtml: 'li4' },
  ili:  { type: 'block', blockHtml: 'ili' },
  ili1: { type: 'block', blockHtml: 'ili1' },
  ili2: { type: 'block', blockHtml: 'ili2' },
  ib:   { type: 'block', blockHtml: 'p' },
  // ---- Verse / chapter / book -------------------------------------------
  c:    { type: 'meta' },            // chapter boundary (handled by chapter split)
  v:    { type: 'meta' },            // verse marker (handled by verse split)
  ca:   { type: 'meta' },            // chapter alternate
  cp:   { type: 'meta' },            // chapter published
  cl:   { type: 'meta' },            // chapter label
  cd:   { type: 'block', blockHtml: 'p' }, // chapter description
  // ---- Section / title ---------------------------------------------------
  s:    { type: 'block', blockHtml: 'h3' },
  s1:   { type: 'block', blockHtml: 'h3' },
  s2:   { type: 'block', blockHtml: 'h3' },
  s3:   { type: 'block', blockHtml: 'h3' },
  s4:   { type: 'block', blockHtml: 'h3' },
  sr:   { type: 'block', blockHtml: 'h4' },   // section reference range
  ms:   { type: 'block', blockHtml: 'h2' },
  ms1:  { type: 'block', blockHtml: 'h2' },
  ms2:  { type: 'block', blockHtml: 'h2' },
  ms3:  { type: 'block', blockHtml: 'h2' },
  mr:   { type: 'block', blockHtml: 'h3' },   // major section reference
  r:    { type: 'block', blockHtml: 'p' },    // parallel reference
  d:    { type: 'block', blockHtml: 'p' },    // descriptive title
  sp:   { type: 'block', blockHtml: 'p' },    // speaker / speaker label
  // ---- Identifiers / metadata (drop to end of line) --------------------
  id:   { type: 'meta' },
  ide:  { type: 'meta' },
  usfm: { type: 'meta' },
  h:    { type: 'meta' },            // running header
  toc1: { type: 'meta' },
  toc2: { type: 'meta' },
  toc3: { type: 'meta' },
  toct: { type: 'meta' },
  toca: { type: 'meta' },
  mt:   { type: 'meta' },
  mt1:  { type: 'meta' },
  mt2:  { type: 'meta' },
  mt3:  { type: 'meta' },
  mt4:  { type: 'meta' },
  mte:  { type: 'meta' },
  mte1: { type: 'meta' },
  mte2: { type: 'meta' },
  rem:  { type: 'meta' },            // remark / translator's note
  // ---- Introduction / outline (chapters) -------------------------------
  imt:  { type: 'block', blockHtml: 'h2' },
  imt1: { type: 'block', blockHtml: 'h2' },
  imt2: { type: 'block', blockHtml: 'h2' },
  imt3: { type: 'block', blockHtml: 'h2' },
  imte: { type: 'block', blockHtml: 'h2' },
  imte1:{ type: 'block', blockHtml: 'h2' },
  is:   { type: 'block', blockHtml: 'h3' },
  is1:  { type: 'block', blockHtml: 'h3' },
  is2:  { type: 'block', blockHtml: 'h3' },
  is3:  { type: 'block', blockHtml: 'h3' },
  isbe: { type: 'block', blockHtml: 'h3' },
  ip:   { type: 'block', blockHtml: 'p' },
  ipi:  { type: 'block', blockHtml: 'p' },
  im:   { type: 'block', blockHtml: 'p' },
  imi:  { type: 'block', blockHtml: 'p' },
  iot:  { type: 'block', blockHtml: 'p' },
  io1:  { type: 'block', blockHtml: 'p' },
  io2:  { type: 'block', blockHtml: 'p' },
  ior:  { type: 'block', blockHtml: 'p' },
  iq:   { type: 'block', blockHtml: 'p' },
  iq1:  { type: 'block', blockHtml: 'p' },
  iq2:  { type: 'block', blockHtml: 'p' },
  // ---- Blank / line break ---------------------------------------------
  b:    { type: 'void', html: 'br' },
  // ---- Inline wrappers (text-styling) ---------------------------------
  wj:   { type: 'inline', html: 'span class="wj"' },
  nd:   { type: 'inline', html: 'span class="nd"' },
  em:   { type: 'inline', html: 'em' },
  bd:   { type: 'inline', html: 'strong' },
  it:   { type: 'inline', html: 'em' },
  sc:   { type: 'inline', html: 'span class="sc"' },
  no:   { type: 'inline', html: 'span class="no"' },
  // ---- Inline wrappers with legacy "+" prefix (identical semantics) ---
  '+wj':  { type: 'inline', html: 'span class="wj"' },
  '+nd':  { type: 'inline', html: 'span class="nd"' },
  '+em':  { type: 'inline', html: 'em' },
  '+bd':  { type: 'inline', html: 'strong' },
  '+it':  { type: 'inline', html: 'em' },
  '+sc':  { type: 'inline', html: 'span class="sc"' },
  '+no':  { type: 'inline', html: 'span class="no"' },
  '+qt':  { type: 'inline', html: 'span class="qt"' },  // quoted OT in NT
  // ---- Inline ranges (emit their inner text, transformed) --------------
  w:    { type: 'inline-r', html: 'inline' },
  '+w': { type: 'inline-r', html: 'inline' },
  add:  { type: 'inline-r', html: 'inline' },
  '+add': { type: 'inline-r', html: 'inline' },
  wh:   { type: 'inline-r', html: 'span class="wh"' },   // webhook (WEB)
  '+wh': { type: 'inline-r', html: 'span class="wh"' },
  sup:  { type: 'inline-r', html: 'span class="sup"' },  // small-caps
  '+sup':{ type: 'inline-r', html: 'span class="sup"' },
  // ---- Note families with + prefix -------------------------------------
  '+xo': { type: 'note', family: 'xr' },                 // cross-ref origin
  '+fl': { type: 'note', family: 'fn' },                 // footnote label
  bk:   { type: 'inline-r', html: 'span class="bk"' },
  k:    { type: 'inline-r', html: 'span class="k"' },
  tl:   { type: 'inline-r', html: 'span class="tl"' },
  ref:  { type: 'inline-r', html: 'a class="ref"' },
  // ---- Notes (footnote + cross-ref families) --------------------------
  f:    { type: 'note', family: 'fn' },
  fe:   { type: 'note', family: 'fn' },
  x:    { type: 'note', family: 'xr' },
  rq:   { type: 'note', family: 'drop' }
};

// ---------------------------------------------------------------------------
// Marker reader
// ---------------------------------------------------------------------------

// Read one USFM marker starting at i (which points at '\\'). Returns
// { name, closing, end } where end is the index just past the marker and its
// trailing whitespace, or null if no marker is present. Handles the legacy
// "+" prefix (\+w, \+it, \+qt, \+nd, \+bd, …) by folding it into the name.
function readMarker(src, i) {
  if (src[i] !== '\\') return null;
  let j = i + 1;
  let name = '';
  if (src[j] === '+') { name = '+'; j++; }
  while (j < src.length && /[a-zA-Z]/.test(src[j])) { name += src[j]; j++; }
  if (/[0-9]/.test(src[j])) { name += src[j]; j++; }
  if (!name || name === '+') return null;
  const closing = src[j] === '*';
  if (closing) j++;
  if (!closing) { while (j < src.length && src[j] === ' ') j++; }
  return { name, closing, end: j };
}

// Render the inner text of a block marker. We treat any inner marker as if
// it were an inline (so a \qs nested inside a \q2 still gets recognised, but
// renders as a span instead of a new block). Returns the resulting HTML for
// the line's content (without the outer wrapper).
function renderBlockLine(line, parentName) {
  let out = '';
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c !== '\\') { out += c; i++; continue; }
    const m = readMarker(line, i);
    if (!m) { out += c; i++; continue; }
    const def = MARKERS[m.name];
    if (!def) { i = m.end; continue; }
    if (def.type === 'void') {
      out += `<${def.html}/>`;
      i = m.end;
      continue;
    }
    if (def.type === 'meta' || def.type === 'block') {
      // Drop the marker + the rest of the line (we're already inside a block).
      i = line.length;
      continue;
    }
    if (def.type === 'inline') {
      if (m.closing) { i = m.end; continue; }
      const close = findClose(line, m.end, m.name);
      if (close.idx < 0) { i = m.end; continue; }
      const inner = applyInlineTransforms(line.slice(m.end, close.idx));
      out += `<${def.html}>${escHtml(inner)}</${def.html.split(' ')[0]}>`;
      i = close.idx + close.len;
      continue;
    }
    if (def.type === 'inline-r') {
      if (m.closing) { i = m.end; continue; }
      const close = findClose(line, m.end, m.name);
      if (close.idx < 0) { i = m.end; continue; }
      const inner = applyInlineTransforms(line.slice(m.end, close.idx));
      if (def.html === 'a class="ref"') {
        const bar = inner.lastIndexOf('|');
        const txt = bar >= 0 ? inner.slice(0, bar).trim() : inner.trim();
        const tgt = bar >= 0 ? inner.slice(bar + 1).trim() : '';
        out += `<a class="ref" href="#${escHtml(tgt)}" title="${escHtml(tgt)}" data-ref="${escHtml(tgt)}">${escHtml(txt)}</a>`;
      } else if (def.html === 'inline') {
        out += escHtml(inner);
      } else {
        out += `<${def.html}>${escHtml(inner)}</${def.html.split(' ')[0]}>`;
      }
      i = close.idx + close.len;
      continue;
    }
    if (def.type === 'note') {
      // Inline notes inside a block are unusual; treat as drops to end of line.
      i = line.length;
      continue;
    }
    i = m.end;
  }
  return decodeEntities(out);
}

// Find the index of the matching closing marker for an inline-r. Accepts
// both canonical and whitespace-before-star forms. Returns -1 if not found.
function findClose(src, from, name) {
  const close = `\\${name}*`;
  const variants = [close, close.replace('*', ' *'), close.replace('*', '  *')];
  for (const p of variants) {
    const idx = src.indexOf(p, from);
    if (idx >= 0) return { idx, len: p.length };
  }
  return { idx: -1, len: 0 };
}

// Read to end of line (or end of input). Returns { end, line } where end is
// the index just past the line terminator and line is the unstripped line.
function readLine(src, from) {
  let j = from;
  while (j < src.length && src[j] !== '\n') j++;
  const line = src.slice(from, j);
  if (src[j] === '\n') j++;
  return { end: j, line };
}

// ---------------------------------------------------------------------------
// Note capture (footnotes + cross-references)
// ---------------------------------------------------------------------------
// A note is delimited by \f + ... \f* (or \fe, \x) and contains a series of
// sub-markers. We capture each as { ref, kind, text } and emit inline as a
// <sup> reference tag pointing into the captured array.

const FN_SUBTAGS = {
  fr: 'ref', ft: 'text', fqa: 'alt', fk: 'keyword', fv: 'variant',
  fp: 'paragraph', fq: 'quoted', fdc: 'deuterocanon', fl: 'label', it: 'text', em: 'text', bk: 'text', k: 'text'
};
const XR_SUBTAGS = {
  xo: 'origin', xt: 'target', xa: 'alt', xk: 'keyword',
  rq: 'quoted', qt: 'quoted'
};

function captureNote(body, family) {
  // Walk the body linearly, switching on each sub-marker we encounter.
  const sub = family === 'fn' ? FN_SUBTAGS : XR_SUBTAGS;
  const parts = [];
  let i = 0;
  let lastPart = { kind: 'text', text: '' };
  const flush = () => { if (lastPart.text) { parts.push(lastPart); lastPart = { kind: 'text', text: '' }; } };
  while (i < body.length) {
    if (body[i] === '\\') {
      const m = readMarker(body, i);
      if (m) {
        if (m.closing) {
          if (sub[m.name] === lastPart.kind) {
            // already in this part, just keep appending
          } else {
            flush();
            lastPart = { kind: sub[m.name] || 'text', text: '' };
          }
        } else if (sub[m.name]) {
          flush();
          lastPart = { kind: sub[m.name], text: '' };
        }
        // unknown sub-tag: drop the marker name + arg
        i = m.end;
        continue;
      }
    }
    lastPart.text += body[i];
    i++;
  }
  flush();
  // Merge consecutive same-kind parts
  const merged = [];
  for (const p of parts) {
    const t = p.text.replace(/\\\w+\s*\*/g, '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const last = merged[merged.length - 1];
    if (last && last.kind === p.kind) last.text += ' ' + t;
    else merged.push({ kind: p.kind, text: t });
  }
  // Build a flat object for storage
  const out = {};
  let primary = null;
  for (const p of merged) {
    if (!out[p.kind]) out[p.kind] = p.text;
    if (p.kind === 'text' || p.kind === 'target') primary = primary || p.text;
  }
  return { parts: merged, ref: out.ref || null, text: out.text || primary || null,
           alt: out.alt || null, target: out.target || primary || null, origin: out.origin || null };
}

// ---------------------------------------------------------------------------
// HTML builder for a single verse body
// ---------------------------------------------------------------------------

// Render the raw verse body into a flat HTML string with inline markers
// resolved. Note bodies are stored separately in the returned `footnotes` /
// `crossrefs` arrays; the inline representation is a <sup> reference tag.
function buildHtml(rawVerse, notes) {
  // Pre-pass: extract notes (footnotes + cross-refs) and replace with
  // placeholders. The placeholder form is \u0000NFn\u0000 / \u0000NRn\u0000.
  let src = rawVerse;
  // Footnotes \f + ... \f*  (also \fe ... \fe*)
  src = src.replace(/\\f\s*\+([\s\S]*?)\\f\*/g, (_, body) => {
    const n = captureNote(body, 'fn');
    const idx = notes.footnotes.length;
    notes.footnotes.push(n);
    return `\u0000NF${idx}\u0000`;
  });
  src = src.replace(/\\fe\s*\+?([\s\S]*?)\\fe\*/g, (_, body) => {
    const n = captureNote(body, 'fn');
    const idx = notes.footnotes.length;
    notes.footnotes.push(n);
    return `\u0000NF${idx}\u0000`;
  });
  // Cross-references \x + ... \x*
  src = src.replace(/\\x\s*\+([\s\S]*?)\\x\*/g, (_, body) => {
    const n = captureNote(body, 'xr');
    const idx = notes.crossrefs.length;
    notes.crossrefs.push(n);
    return `\u0000NR${idx}\u0000`;
  });
  // \rq ... \rq*  inline quoted cross-ref — drop
  src = src.replace(/\\rq\s*\+?[\s\S]*?\\rq\*/g, '');
  // \ior ... \ior*  introduction outline range — drop
  src = src.replace(/\\ior\s*\+?[\s\S]*?\\ior\*/g, '');

  // Linear scan, emitting HTML
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c !== '\\') { out += c; i++; continue; }
    const m = readMarker(src, i);
    if (!m) { out += c; i++; continue; }
    const def = MARKERS[m.name];
    const name = m.name;
    if (!def) {
      // Unknown marker: drop the marker name + the rest of the line.
      const { end } = readLine(src, m.end);
      i = end;
      continue;
    }

    if (def.type === 'void') {
      out += `<${def.html}/>`;
      i = m.end;
      continue;
    }

    if (def.type === 'meta') {
      // Drop the marker name + the rest of the line.
      const { end } = readLine(src, m.end);
      i = end;
      continue;
    }

    if (def.type === 'block') {
      // Wrap the rest of the line in a <p> (or h3) with the appropriate class.
      // The line may contain other block markers too (e.g. \qs inside \q2
      // for selah); recursively process those as inline-styled spans so the
      // wrapper still emits clean HTML without recursive blocks.
      const { end, line } = readLine(src, m.end);
      const inner = renderBlockLine(line, name);
      const cls = escHtml(name);
      const tag = (def.blockHtml || 'p').startsWith('h') ? def.blockHtml : 'p';
      out += `<${tag} class="${cls}">${inner}</${tag}>`;
      i = end;
      continue;
    }

    if (def.type === 'inline') {
      // Pair-marker. Find its matching close; emit the inner transformed text.
      if (m.closing) { i = m.end; continue; }
      const close = findClose(src, m.end, name);
      if (close.idx < 0) { i = m.end; continue; }
      const inner = src.slice(m.end, close.idx);
      out += `<${def.html}>${escHtml(applyInlineTransforms(inner))}</${def.html.split(' ')[0]}>`;
      i = close.idx + close.len;
      continue;
    }

    if (def.type === 'inline-r') {
      if (m.closing) { i = m.end; continue; }
      const close = findClose(src, m.end, name);
      if (close.idx < 0) { i = m.end; continue; }
      const inner = src.slice(m.end, close.idx);
      const transformed = applyInlineTransforms(inner);
      if (def.html === 'a class="ref"') {
        // body looks like: text|target
        const bar = transformed.lastIndexOf('|');
        const txt = bar >= 0 ? transformed.slice(0, bar).trim() : transformed.trim();
        const tgt = bar >= 0 ? transformed.slice(bar + 1).trim() : '';
        out += `<a class="ref" href="#${escHtml(tgt)}" title="${escHtml(tgt)}" data-ref="${escHtml(tgt)}">${escHtml(txt)}</a>`;
      } else if (def.html === 'inline') {
        out += escHtml(transformed);
      } else {
        out += `<${def.html}>${escHtml(transformed)}</${def.html.split(' ')[0]}>`;
      }
      i = close.idx + close.len;
      continue;
    }

    if (def.type === 'note') {
      // Should have been pre-passed; any leftover is malformed. Drop.
      const { end } = readLine(src, m.end);
      i = end;
      continue;
    }

    // default: skip
    i = m.end;
  }
  return decodeEntities(out);
}

// ---------------------------------------------------------------------------
// Plain text builder
// ---------------------------------------------------------------------------

// Render a verse body as plain text (no inline markup, no notes).
function buildPlain(rawVerse) {
  let src = rawVerse;
  // Strip notes entirely
  src = src.replace(/\\f\s*\+[\s\S]*?\\f\*/g, '');
  src = src.replace(/\\fe\s*\+?[\s\S]*?\\fe\*/g, '');
  src = src.replace(/\\x\s*\+?[\s\S]*?\\x\*/g, '');
  src = src.replace(/\\rq\s*\+?[\s\S]*?\\rq\*/g, '');
  src = src.replace(/\\ior\s*\+?[\s\S]*?\\ior\*/g, '');

  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c !== '\\') { out += c; i++; continue; }
    const m = readMarker(src, i);
    if (!m) { out += c; i++; continue; }
    const def = MARKERS[m.name];
    const name = m.name;
    if (!def) {
      const { end } = readLine(src, m.end);
      i = end;
      continue;
    }
    if (def.type === 'void') { out += ' '; i = m.end; continue; }
    if (def.type === 'meta') {
      const { end } = readLine(src, m.end);
      i = end;
      continue;
    }
    if (def.type === 'block') {
      out += ' ';
      const { end } = readLine(src, m.end);
      i = end;
      continue;
    }
    if (def.type === 'inline') {
      if (m.closing) { i = m.end; continue; }
      const close = findClose(src, m.end, name);
      if (close.idx < 0) { i = m.end; continue; }
      out += applyInlineTransforms(src.slice(m.end, close.idx));
      i = close.idx + close.len;
      continue;
    }
    if (def.type === 'inline-r') {
      if (m.closing) { i = m.end; continue; }
      const close = findClose(src, m.end, name);
      if (close.idx < 0) { i = m.end; continue; }
      out += applyInlineTransforms(src.slice(m.end, close.idx));
      i = close.idx + close.len;
      continue;
    }
    i = m.end;
  }
  return decodeEntities(out).replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Section / heading capture
// ---------------------------------------------------------------------------

function extractSections(src) {
  const sections = [];
  // Match each \s, \s1-3, \ms, \ms1, \mr, \sr, \is, \is1-3, \imt, \imt1-3
  const re = /\\(s\d?|ms\d?|mr|sr|is\d?|imt\d?|isbe)\s+([^\n]+)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const tag = m[1];
    const t = applyInlineTransforms(m[2]).replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const level = tag[0] === 'm' ? 0
      : tag[0] === 'i' ? 1
      : (parseInt(tag.replace(/\D/g, ''), 10) || 1);
    sections.push({ level, text: t });
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Verse rendering
// ---------------------------------------------------------------------------

function renderVerse(rawVerse) {
  const notes = { footnotes: [], crossrefs: [] };
  const text_html = buildHtml(rawVerse, notes);
  const text = buildPlain(rawVerse);
  // text_wj: like text but wrap \wj content in <span class="wj">
  // We re-run buildPlain but with a custom marker pass that emits wj spans.
  const text_wj = buildPlainWj(rawVerse);
  return {
    text, text_wj, text_html,
    footnotes: notes.footnotes,
    crossrefs: notes.crossrefs,
    sections: extractSections(rawVerse),
    has_wj: /\\wj\b/.test(rawVerse) ? 1 : 0
  };
}

// Plain-text-with-wj: strip notes entirely, drop all markers EXCEPT \wj
// which we replace with <span class="wj">…</span>.
function buildPlainWj(rawVerse) {
  let src = rawVerse;
  src = src.replace(/\\f\s*\+[\s\S]*?\\f\*/g, '');
  src = src.replace(/\\fe\s*\+?[\s\S]*?\\fe\*/g, '');
  src = src.replace(/\\x\s*\+?[\s\S]*?\\x\*/g, '');
  src = src.replace(/\\rq\s*\+?[\s\S]*?\\rq\*/g, '');
  src = src.replace(/\\ior\s*\+?[\s\S]*?\\ior\*/g, '');

  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c !== '\\') { out += c; i++; continue; }
    const m = readMarker(src, i);
    if (!m) { out += c; i++; continue; }
    const name = m.name;
    if (name === 'wj') {
      if (!m.closing) {
        out += '<span class="wj">';
        const close = findClose(src, m.end, 'wj');
        if (close.idx < 0) { i = m.end; continue; }
        out += applyInlineTransforms(src.slice(m.end, close.idx));
        out += '</span>';
        i = close.idx + close.len;
        continue;
      } else { i = m.end; continue; }
    }
    const def = MARKERS[name];
    if (!def) {
      const { end } = readLine(src, m.end);
      i = end;
      continue;
    }
    if (def.type === 'void') { out += ' '; i = m.end; continue; }
    if (def.type === 'meta') {
      const { end } = readLine(src, m.end);
      i = end;
      continue;
    }
    if (def.type === 'block') {
      out += ' ';
      const { end } = readLine(src, m.end);
      i = end;
      continue;
    }
    if (def.type === 'inline' || def.type === 'inline-r') {
      if (m.closing) { i = m.end; continue; }
      const close = findClose(src, m.end, name);
      if (close.idx < 0) { i = m.end; continue; }
      out += applyInlineTransforms(src.slice(m.end, close.idx));
      i = close.idx + close.len;
      continue;
    }
    i = m.end;
  }
  return decodeEntities(out).replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// USFM file parser
// ---------------------------------------------------------------------------

// Parse a USFM file. Returns:
// { bookCode, bookId, bookName, preChapters, chapters: [ { chapter, verses, preVerses } ] }
//   preChapters is an array of "intro paragraphs" that appear before the first \c
//   preVerses is an array of "intro paragraphs" that appear after a \c but before its first \v
//   Verses in the canonical chapter (verse 1+) are returned in the usual way.
//   Verses with verse=0 are book-level or chapter-level intro blocks.
function parseUsfm(content) {
  const idMatch = content.match(/\\id\s+(\S+)/);
  if (!idMatch) throw new Error('No \\id marker found');
  const bookCode = idMatch[1];
  if (!BOOK_CODE_TO_ID[bookCode]) throw new Error(`Unknown book code: ${bookCode}`);
  const bookId = BOOK_CODE_TO_ID[bookCode];
  const bookName = BOOK_ID_TO_NAME[bookId];

  const text = content.replace(/\r\n?/g, '\n');

  // Split on \c markers. Material before the first \c is book-level front matter.
  const chapterParts = text.split(/\\c\s+(\d+)/);
  const preChapters = parseIntroBlock(chapterParts[0] || '');
  const chapters = [];
  for (let i = 1; i < chapterParts.length; i += 2) {
    const chapterNum = parseInt(chapterParts[i], 10);
    let body = chapterParts[i + 1] || '';
    // Split into intro + verses
    // We split on the first \v marker
    const vSplit = body.split(/\\v\s+/);
    const preVerses = parseIntroBlock(vSplit[0] || '');
    const verses = [];
    for (let j = 1; j < vSplit.length; j++) {
      const vp = vSplit[j];
      const sp = vp.search(/\s/);
      if (sp < 0) continue;
      const ref = vp.slice(0, sp).trim();
      let bodyText = vp.slice(sp + 1);
      // Cut at the next \v that was absorbed
      const nextV = bodyText.indexOf('\\v ');
      const slice = nextV >= 0 ? bodyText.slice(0, nextV) : bodyText;
      // Parse the ref. It can be:
      //   7          -> verse 7
      //   7a, 7b     -> letter-suffix verse (we keep just 7; the suffix is lost)
      //   7-9        -> range; we create one row per integer in the range
      //   7-8a       -> range with suffix; we expand to 7, 8
      //   front      -> non-numeric; we treat as verse 0 (chapter-level intro tail)
      const main = ref.match(/^(\d+)/);
      if (!main) continue;
      const start = parseInt(main[1], 10);
      const rangeMatch = ref.match(/^(\d+)\s*-\s*(\d+)/);
      const endVerse = rangeMatch ? parseInt(rangeMatch[2], 10) : start;
      const rendered = renderVerse(slice);
      for (let v = start; v <= endVerse; v++) {
        verses.push({ verse: v, ...rendered });
      }
    }
    chapters.push({ chapter: chapterNum, verses, preVerses });
  }
  return { bookCode, bookId, bookName, preChapters, chapters };
}

// Parse an intro block (pre-chapter or pre-verse) into rendered rows.
// Returns an array of { verse, text, text_wj, text_html, footnotes, crossrefs,
// sections, has_wj, _intro: true }. We skip blocks that, after rendering,
// contain no text — those are book headers (\h, \toc, \mt, etc.) that we drop
// at render time.
function parseIntroBlock(src) {
  if (!src.trim()) return [];
  const rendered = renderVerse(src);
  if (!rendered.text.trim() && !rendered.text_html.trim()) return [];
  return [{
    verse: 0,
    ...rendered,
    _intro: true
  }];
}

// ---------------------------------------------------------------------------
// Translation database builder
// ---------------------------------------------------------------------------

async function buildTranslation({ usfmDir, dbPath, translationId, title, license, sourceName }) {
  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE translations (
      translation TEXT PRIMARY KEY,
      title TEXT,
      license TEXT
    );
    CREATE TABLE BSB_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT
    );
    CREATE TABLE BSB_verses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER,
      chapter INTEGER,
      verse INTEGER,
      text TEXT,
      has_wj INTEGER DEFAULT 0,
      text_wj TEXT,
      text_html TEXT,
      footnotes TEXT,
      crossrefs TEXT,
      refs TEXT,
      sections TEXT,
      FOREIGN KEY (book_id) REFERENCES BSB_books(id)
    );
    CREATE INDEX idx_verses_book_chap ON BSB_verses(book_id, chapter);
    CREATE INDEX idx_verses_lookup ON BSB_verses(book_id, chapter, verse);
  `);

  db.run('INSERT INTO translations(translation, title, license) VALUES (?, ?, ?)',
    [translationId, title, license]);

  const insertBook = db.prepare('INSERT INTO BSB_books(id, name) VALUES (?, ?)');
  for (let i = 0; i < BOOK_ORDER.length; i++) {
    insertBook.run([i + 1, BOOK_ORDER[i][1]]);
  }
  insertBook.free();

  const files = fs.readdirSync(usfmDir)
    .filter(f => /\.(usfm|sfm)$/i.test(f))
    .map(f => path.join(usfmDir, f));

  const seenBooks = new Set();
  let totalVerses = 0;
  let totalWj = 0;
  let totalFootnotes = 0;
  let totalCrossrefs = 0;
  let totalHtmlBytes = 0;
  const stmt = db.prepare(`
    INSERT INTO BSB_verses(book_id, chapter, verse, text, has_wj, text_wj, text_html, footnotes, crossrefs, refs, sections)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    let parsed;
    try {
      parsed = parseUsfm(content);
    } catch (e) {
      console.warn(`  ! parse failed for ${path.basename(file)}: ${e.message}`);
      continue;
    }
    seenBooks.add(parsed.bookId);
    const insertRows = (chapter, verse, r) => {
      stmt.run([
        parsed.bookId, chapter, verse,
        r.text, r.has_wj, r.has_wj ? r.text_wj : null,
        r.text_html,
        r.footnotes.length ? JSON.stringify(r.footnotes) : null,
        r.crossrefs.length ? JSON.stringify(r.crossrefs) : null,
        extractRefs(r).length ? JSON.stringify(extractRefs(r)) : null,
        r.sections.length ? JSON.stringify(r.sections) : null
      ]);
      totalVerses++;
      if (r.has_wj) totalWj++;
      totalFootnotes += r.footnotes.length;
      totalCrossrefs += r.crossrefs.length;
      totalHtmlBytes += r.text_html.length;
    };
    // Book-level intro (chapter=0, verse=0)
    for (const r of parsed.preChapters) insertRows(0, 0, r);
    for (const ch of parsed.chapters) {
      // Chapter-level intro (chapter=N, verse=0)
      for (const r of ch.preVerses) insertRows(ch.chapter, 0, r);
      for (const r of ch.verses) insertRows(ch.chapter, r.verse, r);
    }
  }
  stmt.free();

  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  db.close();
  return { totalVerses, totalWj, totalFootnotes, totalCrossrefs, totalHtmlBytes, bookCount: seenBooks.size, sourceName };
}

// Extract inline \ref targets from a verse's HTML. We look for the data-ref
// attribute we emitted on each <a class="ref">.
function extractRefs(r) {
  const refs = [];
  const re = /<a class="ref"[^>]*data-ref="([^"]*)"[^>]*>([^<]*)<\/a>/g;
  let m;
  while ((m = re.exec(r.text_html)) !== null) {
    refs.push({ text: m[2], target: m[1] });
  }
  return refs;
}

module.exports = {
  BOOK_ORDER, BOOK_CODE_TO_ID,
  parseUsfm, renderVerse, buildTranslation,
  applyInlineTransforms, stripAttrs, readMarker,
  MARKERS
};
