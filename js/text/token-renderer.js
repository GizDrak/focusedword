window.TokenRenderer = class TokenRenderer {
  constructor(bridge) {
    this.bridge = bridge;
    this.typography = bridge?.get('typography');
  }

  renderChapter(verses, bionic, strength, settings) {
    const frag = document.createDocumentFragment();
    for (const v of verses) {
      const el = this._renderVerseTokens(v.verse, v.tokens, bionic, strength, settings, v.wordClassSpans, v.wordStudySpans, v.clearReadingSpans);
      if (!el) continue;
      let child = el.firstChild;
      while (child) {
        const next = child.nextSibling;
        if (child.nodeType === 1 && child.classList && child.classList.contains('section-heading-container')) {
          el.removeChild(child);
          frag.appendChild(child);
        }
        child = next;
      }
      frag.appendChild(el);
    }
    return frag;
  }

  _renderVerseTokens(verseNum, tokens, bionic, strength, settings, wordClassSpans, wordStudySpans, clearReadingSpans) {
    if (!tokens || !tokens.length) return null;
    settings = Object.assign({ redLetter: true, footnotes: true, sectionHeadings: true, poetryFormatting: true, paragraphBreaks: false, paragraphMode: false }, settings);

    const container = document.createElement('div');
    container.className = 'verse-container';
    container.dataset.verse = verseNum;

    const verseNumEl = document.createElement('sup');
    verseNumEl.className = 'verse-num';
    verseNumEl.textContent = verseNum;

    const verseText = document.createElement('span');
    verseText.className = 'verse-text';
    verseText.setAttribute('dir', 'auto');

    const self = this;
    const ctx = {
      container,
      verseText,
      verseNumEl,
      settings,
      currentBlock: null,
      verseNumInserted: false,
      pendingLeadingFootnotes: [],
      styleStack: [],
      lastHeadingEl: null,
      _poetryBlock: null,
      _poetryLine: null,
      _bionic: bionic,
      _bionicStrength: strength,
      closeBlock() {
        if (!ctx.currentBlock) return;
        if (ctx.currentBlock.tagName === 'SPAN' && !ctx.currentBlock.hasChildNodes()) {
          ctx.currentBlock.remove();
        }
        ctx.currentBlock = null;
      },
      applyBionic: (html) => {
        if (!bionic || !strength) return html;
        if (self.typography) {
          return self.typography.applyBionicToHtml(html, { bionic, bionicStrength: strength });
        }
        return html.replace(/(^|>)([^<]+)(?=<|$)/g, (_, before, text) => {
          return before + text.replace(/[^\s\u00A0]+/g, w => {
            const n = Math.max(1, Math.ceil(w.length * strength));
            return '<b>' + w.slice(0, n) + '</b>' + w.slice(n);
          });
        });
      }
    };

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      switch (token.type) {
        case 'paragraph_start': this._renderParagraphStart(token, ctx); break;
        case 'poetry_start':    this._renderPoetryStart(token, ctx); break;
        case 'line_break':      this._renderLineBreak(token, ctx); break;
        case 'section_heading': this._renderSectionHeading(token, ctx); break;
        case 'text':            this._renderText(token, ctx); break;
        case 'style_start':     this._renderStyleStart(token, ctx, tokens, i); break;
        case 'style_end':       this._renderStyleEnd(token, ctx, tokens, i); break;
        case 'footnote':        this._renderFootnote(token, ctx, tokens, i); break;
        case 'cross_ref':       this._renderCrossRef(token, ctx); break;
        case 'list_item':       this._renderListItem(token, ctx, tokens, i); break;
      }
    }

    ctx.closeBlock();
    while (ctx.pendingLeadingFootnotes.length) {
      ctx.verseText.appendChild(ctx.pendingLeadingFootnotes.shift());
    }
    if (!ctx.verseNumInserted) {
      ctx.verseText.appendChild(ctx.verseNumEl);
    }
    ctx.container.appendChild(ctx.verseText);

    if (wordClassSpans && wordClassSpans.length && this._wordClassesEnabled) {
      this._applyWordClassColors(ctx.verseText, wordClassSpans);
    }

    if (clearReadingSpans && clearReadingSpans.length && this._clearReadingEnabled) {
      this._applyClearReadingDimming(ctx.verseText, clearReadingSpans);
    }

    if (this._wordStudyMode) {
      this._applyWordStudyTargets(ctx.verseText, wordStudySpans);
    }

    // Show a small loading spinner on verses whose annotations stream in after
    // the first paint (word classes / clear reading / word study enabled but
    // spans not attached yet). Removed by applyAnnotationsToDom once applied.
    if (this._wordClassesEnabled || this._clearReadingEnabled || this._wordStudyMode) {
      const pending = this._streamingPending(wordClassSpans, clearReadingSpans, wordStudySpans);
      ctx.container.classList.toggle('wordstudy-pending', pending);
    }

    return ctx.container;
  }

  _renderParagraphStart(token, ctx) {
    ctx.closeBlock();
    ctx.lastHeadingEl = null;
    if (!ctx.settings.paragraphBreaks) return;
    if (ctx.settings.paragraphMode) {
      if (ctx.verseText.hasChildNodes()) {
        ctx.verseText.appendChild(document.createElement('br'));
      }
      const el = document.createElement('span');
      el.className = 'token-paragraph-break';
      ctx.verseText.appendChild(el);
    } else {
      const el = document.createElement('div');
      el.className = 'token-paragraph';
      ctx.verseText.appendChild(el);
      ctx.currentBlock = el;
    }
  }

  _renderPoetryStart(token, ctx) {
    ctx.closeBlock();
    ctx.lastHeadingEl = null;
    const usePoetry = ctx.settings.poetryFormatting && !ctx.settings.paragraphMode;
    const el = document.createElement('div');
    el.className = usePoetry ? 'token-poetry ' + (token.style || 'q1') : 'token-poetry--disabled';
    ctx.verseText.appendChild(el);
    ctx.currentBlock = el;
    ctx._poetryBlock = null;
    ctx._poetryLine = null;
    if (usePoetry) {
      ctx._poetryBlock = el;
      ctx._poetryLine = document.createElement('span');
      ctx._poetryLine.className = 'poetry-line';
      ctx._poetryBlock.appendChild(ctx._poetryLine);
      ctx.currentBlock = ctx._poetryLine;
    }
  }

  _renderLineBreak(token, ctx) {
    ctx.lastHeadingEl = null;
    if (ctx.settings.paragraphMode) {
      const space = document.createTextNode('\u00A0');
      const parent = ctx._poetryBlock || ctx.currentBlock || ctx.verseText;
      parent.appendChild(space);
    } else {
      const br = document.createElement('br');
      const parent = ctx._poetryBlock || ctx.currentBlock || ctx.verseText;
      parent.appendChild(br);
    }
    if (ctx._poetryBlock) {
      ctx._poetryLine = document.createElement('span');
      ctx._poetryLine.className = 'poetry-line';
      ctx._poetryBlock.appendChild(ctx._poetryLine);
      ctx.currentBlock = ctx._poetryLine;
    }
  }

  _renderSectionHeading(token, ctx) {
    const headingText = (token.text || '').trim();
    if (!headingText || /^[\s\(\\)\[\]\{\}.,;:!?\-]+$/.test(headingText)) return;
    ctx.closeBlock();
    ctx.lastHeadingEl = null;
    if (!ctx.settings.sectionHeadings) return;
    const formatted = this.typography ? this.typography.formatTextNode(headingText, { tokenType: 'section_heading' }) : headingText;

    const container = document.createElement('div');
    container.className = 'verse-container section-heading-container';

    const spacer = document.createElement('span');
    spacer.className = 'verse-num section-heading-spacer';
    spacer.setAttribute('aria-hidden', 'true');

    const textWrap = document.createElement('span');
    textWrap.className = 'verse-text section-heading-text';

    const heading = window.UISkins.renderComponent('section-heading', { text: formatted });
    if (heading) {
      heading.element.classList.add('token-section-heading');
      textWrap.appendChild(heading.element);
      ctx.lastHeadingEl = heading.lastHeadingEl;
    } else {
      textWrap.textContent = formatted;
      ctx.lastHeadingEl = textWrap;
    }

    container.appendChild(spacer);
    container.appendChild(textWrap);
    ctx.container.appendChild(container);
  }

  _extractFirstWord(text) {
    if (!text) return { firstWord: '', rest: '' };
    const trimmed = text.trimStart();
    const leadingPad = text.length - trimmed.length;
    if (!trimmed) return { firstWord: '', rest: '' };
    const wsMatch = trimmed.match(/[\s\u00A0]+/);
    if (!wsMatch) return { firstWord: trimmed, rest: '' };
    return {
      firstWord: trimmed.substring(0, wsMatch.index),
      rest: text.substring(leadingPad + wsMatch.index + wsMatch[0].length)
    };
  }

  _renderText(token, ctx) {
    ctx.lastHeadingEl = null;
    if (!ctx.currentBlock) {
      const el = document.createElement('span');
      el.className = 'token-text';
      ctx.verseText.appendChild(el);
      ctx.currentBlock = el;
    }

    const rawText = token.text || '';
    const typographyContext = {
      tokenType: ctx._poetryBlock ? 'poetry' : 'text',
      poetryLevel: ctx._poetryBlock ? (ctx._poetryBlock.className.match(/q[123]/)?.[0] || 'q1') : null,
      paragraphMode: ctx.settings?.paragraphMode || false,
      bionic: ctx._bionic,
      bionicStrength: ctx._bionicStrength
    };
    const formatted = this.typography ? this.typography.formatTextNode(rawText, typographyContext) : rawText;

    if (!ctx.verseNumInserted) {
      const { firstWord, rest } = this._extractFirstWord(formatted);

      const startSpan = document.createElement('span');
      startSpan.className = 'verse-start';
      startSpan.appendChild(ctx.verseNumEl);
      while (ctx.pendingLeadingFootnotes.length) {
        startSpan.appendChild(ctx.pendingLeadingFootnotes.shift());
      }
      startSpan.insertAdjacentHTML('beforeend', ctx.applyBionic(MarkdownParser.parse(firstWord)));
      ctx.currentBlock.appendChild(startSpan);
      ctx.verseNumInserted = true;

      if (rest) {
        ctx.currentBlock.insertAdjacentHTML(
          'beforeend',
          ctx.applyBionic(MarkdownParser.parse(' ' + rest))
        );
      } else {
        const trimmed = formatted.trimStart();
        if (trimmed.length > firstWord.length) {
          ctx.currentBlock.insertAdjacentHTML(
            'beforeend',
            ctx.applyBionic(MarkdownParser.parse(trimmed.substring(firstWord.length)))
          );
        }
      }
      return;
    }

    ctx.currentBlock.insertAdjacentHTML(
      'beforeend',
      ctx.applyBionic(MarkdownParser.parse(formatted))
    );
  }

  _renderStyleStart(token, ctx, tokens, index) {
    // The BSB token stream splits text at style boundaries; the split point is
    // where a space belonged in the source, so restore it to keep words apart.
    this._ensureBoundarySpace(tokens, index + 1, ctx);
    if (!ctx.settings.redLetter && token.style === 'wj') {
      ctx.styleStack.push({ el: null, parent: ctx.currentBlock, skip: true });
      return;
    }
    const el = document.createElement('span');
    el.className = token.style || '';
    let parent = ctx.currentBlock;
    if (!parent) {
      parent = document.createElement('span');
      parent.className = 'token-text';
      ctx.verseText.appendChild(parent);
      ctx.currentBlock = parent;
    }
    parent.appendChild(el);
    ctx.styleStack.push({ el, parent: ctx.currentBlock });
    ctx.currentBlock = el;
  }

  _renderStyleEnd(token, ctx, tokens, index) {
    if (!ctx.styleStack.length) return;
    const entry = ctx.styleStack.pop();
    ctx.currentBlock = entry.parent;
    if (entry.skip) return;
    if (entry.el && !entry.el.hasChildNodes()) entry.el.remove();
    this._ensureBoundarySpace(tokens, index + 1, ctx);
  }

  _renderListItem(token, ctx, tokens, index) {
    this._ensureBoundarySpace(tokens, index + 1, ctx);
  }

  // Inserts a single space into the current block when a structural boundary
  // (style span, footnote marker, list item) sits between two words and the
  // following text would otherwise glue to the previous content.
  _ensureBoundarySpace(tokens, fromIndex, ctx) {
    let nextText = null;
    for (let j = fromIndex; j < tokens.length; j++) {
      const t = tokens[j];
      if (t.type === 'text' && t.text) { nextText = t.text; break; }
      if (['paragraph_start', 'poetry_start', 'line_break', 'section_heading', 'list_item'].includes(t.type)) break;
    }
    if (!nextText) return;
    const first = nextText[0];
    if (/\s/.test(first)) return;
    // No space before closing punctuation; a space belongs before words,
    // opening quotes/parens, and dashes.
    if ('.,;:!?)]}\u2019\u201d'.includes(first)) return;
    const parent = ctx.currentBlock || ctx.verseText;
    const last = parent.lastChild;
    if (!last) return;
    let needsSpace = false;
    if (last.nodeType === 3) {
      const lastChar = (last.textContent || '')[last.textContent.length - 1];
      needsSpace = !!lastChar && !/\s/.test(lastChar);
    } else if (last.tagName === 'BR') {
      // A line break visually separates, but textContent collapses it to
      // nothing; a following space keeps the rendered text well-spaced.
      needsSpace = true;
    } else {
      const lastChar = (last.textContent || '').trimEnd().slice(-1);
      needsSpace = !!lastChar && !/\s/.test(lastChar);
    }
    if (!needsSpace) return;
    parent.appendChild(document.createTextNode(' '));
  }

  _renderFootnote(token, ctx, tokens, index) {
    if (!ctx.settings.footnotes) {
      ctx.lastHeadingEl = null;
      if (ctx.verseText.textContent.length > 0) {
        const last = ctx.verseText.textContent[ctx.verseText.textContent.length - 1];
        if (last !== ' ' && last !== '\u00A0') {
          let nextText = null;
          for (let j = index + 1; j < tokens.length; j++) {
            if (tokens[j].type === 'text' && tokens[j].text) {
              nextText = tokens[j].text;
              break;
            }
            if (['paragraph_start', 'poetry_start', 'section_heading'].includes(tokens[j].type)) break;
          }
          if (nextText && !nextText.startsWith(' ') &&
              !'.,;:!?)]}\u2019\u201d'.includes(nextText[0])) {
            (ctx.currentBlock || ctx.verseText).appendChild(document.createTextNode(' '));
          }
        }
      }
      return;
    }
    ctx.lastHeadingEl = null;
    const el = document.createElement('span');
    el.className = 'footnote-caller';
    el.textContent = token.marker || '*';
    el.dataset.footnoteText = token.text || '';
    if (!ctx.verseNumInserted) {
      ctx.pendingLeadingFootnotes.push(el);
    } else {
      (ctx.currentBlock || ctx.verseText).appendChild(el);
      this._ensureBoundarySpace(tokens, index + 1, ctx);
    }
  }

  _renderCrossRef(token, ctx) {
    if (!ctx.lastHeadingEl) return;
    const el = document.createElement('span');
    el.className = 'token-section-heading-ref';
    el.textContent = this._limitCrossRefText(token.text, 3);
    const refs = this._parseCrossRefRefs(token.text);
    if (refs.length) {
      el.dataset.refs = JSON.stringify(refs);
    }
    ctx.lastHeadingEl.appendChild(el);
  }

  _limitCrossRefText(text, max) {
    const m = text.match(/^\((.+?)\)\s*$/);
    if (!m) return text || '';
    const inner = m[1].trim();
    const parts = inner.split(/;/).map(s => s.trim()).filter(Boolean);
    if (parts.length <= max) return text;
    return '(' + parts.slice(0, max).join('; ') + '; …)';
  }

  _parseCrossRefRefs(text) {
    const m = text.match(/^\((.+?)\)\s*$/);
    if (!m) return [];
    const inner = m[1].trim();
    const parts = inner.split(/;/).map(s => s.trim()).filter(Boolean);
    const results = [];
    for (const part of parts) {
      const cleaned = part.replace(/^(see|cf\.?|e\.g\.|i\.e\.)\s+/i, '').trim();
      const refMatch = cleaned.match(/^(.+?)\s+(\d+):(\d+)(?:\u2013(\d+))?$/);
      if (!refMatch) continue;
      const rawName = refMatch[1].trim().replace(/\s+/g, ' ');
      const chapter = parseInt(refMatch[2]);
      const verseStart = parseInt(refMatch[3]);
      const verseEnd = refMatch[4] ? parseInt(refMatch[4]) : verseStart;
      let bookId = this._bookNameToId(rawName);
      if (!bookId) {
        const alt = window.BookMap.normalizeName(rawName);
        bookId = this._bookNameToId(alt);
      }
      if (!bookId) continue;
      results.push({
        to_book_id: bookId,
        to_chapter: chapter,
        to_verse_start: verseStart,
        to_verse_end: verseEnd
      });
    }
    return results;
  }

  _bookNameToId(name) {
    const books = window.BibleDB._BOOKS;
    const found = books.find(b => b.name === name);
    return found ? found.id : null;
  }

  get _wordClassesEnabled() {
    return this.bridge && this.bridge.state
      && this.bridge.state.get('wordClasses') === true
      && this.bridge.state.get('currentTranslation') === 'BSB';
  }

  get _clearReadingEnabled() {
    return this.bridge && this.bridge.state
      && this.bridge.state.get('clearReadingEnabled') === true
      && this.bridge.state.get('currentTranslation') === 'BSB'
      && this.bridge.state.get('clearReadingMode') !== 'off';
  }

  get _wordStudyMode() {
    return this.bridge && this.bridge.state
      && this.bridge.state.get('wordStudyMode') === true
      && this.bridge.state.get('currentTranslation') === 'BSB';
  }

  _collectWordSegments(verseText) {
    const walker = document.createTreeWalker(verseText, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
    const allNodes = [];
    let n;
    while ((n = walker.nextNode())) {
      allNodes.push(n);
    }

    const isExcluded = (node) => {
      let parent = node.parentNode;
      while (parent && parent !== verseText) {
        if (parent.tagName === 'SUP' ||
            (parent.classList && (parent.classList.contains('footnote-caller') ||
                parent.classList.contains('crossref-indicator') ||
                parent.classList.contains('token-section-heading-ref') ||
                parent.classList.contains('verse-num')))) {
          return true;
        }
        parent = parent.parentNode;
      }
      return false;
    };

    const WORD_CHAR = /[^\W_]/;
    // Matches the apostrophe/quote class used by _wordRanges, which treats
    // these as word-internal. A boundary after one of them still needs a space
    // or the adjacent words collapse into a single token (e.g. "neighbor'and").
    const APOSTROPHE = /[’']/;
    const segments = [];
    const parts = [];
    let offset = 0;
    let lastChar = '';
    let lastTextParent = null;
    let prevWasBionic = false;
    let boundaryPending = false;

    for (const node of allNodes) {
      if (node.nodeType === 1) {
        // Any element node between text nodes (style span, list item, poetry
        // block, <br>, …) can sit where a space belonged in the source text.
        boundaryPending = true;
        continue;
      }

      if (isExcluded(node)) {
        boundaryPending = true;
        continue;
      }

      const t = node.textContent;
      if (!t) {
        boundaryPending = true;
        continue;
      }

      const parent = node.parentElement;
      const parentChanged = lastTextParent && parent !== lastTextParent;
      const adjacentText = lastTextParent && parent === lastTextParent && !boundaryPending;
      // A bionic <b> fragment is always immediately followed by its word's
      // continuation in the same chunk, so it must not introduce a space.
      const continueBionic = prevWasBionic;

      const prevConnects = lastChar && (WORD_CHAR.test(lastChar) || APOSTROPHE.test(lastChar));
      const curStartsWord = t && WORD_CHAR.test(t[0]);
      if (prevConnects && curStartsWord && !continueBionic && (boundaryPending || parentChanged || adjacentText)) {
        parts.push(' ');
        offset += 1;
      }

      segments.push({ node, start: offset, end: offset + t.length });
      parts.push(t);
      offset += t.length;

      const trimmed = t.trim();
      lastChar = trimmed ? trimmed[trimmed.length - 1] : '';
      lastTextParent = parent;
      prevWasBionic = !!(parent && parent.tagName === 'B');
      boundaryPending = false;
    }

    return { segments, fullText: parts.join('') };
  }

  _wordRanges(fullText) {
    const WORD_RE = /[^\W_]+(?:[’'][^\W_]+)*/gu;
    const words = [];
    let m;
    while ((m = WORD_RE.exec(fullText)) !== null) {
      words.push({ start: m.index, end: m.index + m[0].length, text: m[0].toLowerCase() });
    }
    return words;
  }

  // Resolve a v2 annotation span to a concrete [start, end) range in the
  // Map a v2 annotation span onto the reconstructed verse text. The exact
  // character offsets from the database are authoritative; the surface text
  // cross-checks them (a footnote-inserted space or punctuation can shift the
  // reconstructed offsets). word_index is only a fallback and is never
  // trusted on its own — it uses a different numbering than the legacy
  // visible-token index (they diverge by hundreds of tokens across the
  // corpus), so an index hit is accepted only when it lands on an identical
  // surface word. Mismatches are skipped rather than shifted.
  _v2Range(span, fullText, words) {
    const normSurface = (span.surface || '').toLowerCase();
    if (typeof span.charStart === 'number' && typeof span.charEnd === 'number') {
      const spanText = fullText.slice(span.charStart, span.charEnd);
      if (normSurface && spanText.toLowerCase() === normSurface) {
        return { start: span.charStart, end: span.charEnd };
      }
    }
    if (span.wordIndex != null) {
      const w = words[span.wordIndex];
      if (w && w.text === normSurface) return w;
    }
    return null;
  }

  _applyWordStudyTargets(verseText, wordPositions) {
    if (!wordPositions || !wordPositions.length) return;
    this._applyWordStudyTargetsV2(verseText, wordPositions);
  }

  _applyWordStudyTargetsV2(verseText, wordPositions) {
    const { segments, fullText } = this._collectWordSegments(verseText);
    if (!segments.length || !fullText) return;
    const words = this._wordRanges(fullText);
    if (!words.length) return;

    const ranges = new Map();
    for (const s of wordPositions) {
      const r = this._v2Range(s, fullText, words);
      if (!r) continue;
      const key = r.start + ':' + r.end;
      if (!ranges.has(key)) {
        ranges.set(key, { charStart: r.start, charEnd: r.end, word_position: s.wordPosition, token_id: s.tokenId });
      }
    }
    if (!ranges.size) return;

    // A crosswalk can contain nested or partially overlapping ranges. Clip
    // them before wrapping text so shared characters are emitted only once.
    const nonOverlapping = [];
    const sortedRanges = [...ranges.values()].sort((a, b) =>
      a.charStart - b.charStart ||
      (b.charEnd - b.charStart) - (a.charEnd - a.charStart)
    );
    for (const range of sortedRanges) {
      const previous = nonOverlapping[nonOverlapping.length - 1];
      const charStart = previous && range.charStart < previous.charEnd
        ? previous.charEnd
        : range.charStart;
      if (range.charEnd <= charStart) continue;
      nonOverlapping.push({ ...range, charStart });
    }
    if (!nonOverlapping.length) return;

    for (const entry of segments) {
      const { node: tn, start: tnIndex, end: tnEnd } = entry;
      const tnText = tn.textContent;
      const rangesIn = [];
      for (const r of nonOverlapping) {
        if (r.charStart < tnEnd && r.charEnd > tnIndex) {
          rangesIn.push({
            localStart: Math.max(r.charStart - tnIndex, 0),
            localEnd: Math.min(r.charEnd - tnIndex, tnEnd - tnIndex),
            word_position: r.word_position,
            token_id: r.token_id,
          });
        }
      }
      if (!rangesIn.length) continue;

      rangesIn.sort((a, b) => a.localStart - b.localStart);

      const frag = document.createDocumentFragment();
      let pos = 0;

      for (const r of rangesIn) {
        if (pos < r.localStart) {
          frag.appendChild(document.createTextNode(tnText.slice(pos, r.localStart)));
        }
        const targetText = tnText.slice(r.localStart, r.localEnd);
        if (targetText) {
          const span = document.createElement('span');
          span.className = 'word-study-target' + (this._wordClassesEnabled ? ' word-study-target--combined' : '');
          span.dataset.wp = r.word_position;
          if (r.token_id) span.dataset.tokenId = r.token_id;
          span.textContent = targetText;
          frag.appendChild(span);
        }
        pos = r.localEnd;
      }
      if (pos < tnText.length) {
        frag.appendChild(document.createTextNode(tnText.slice(pos)));
      }

      tn.parentNode.replaceChild(frag, tn);
    }
  }

  _applyWordClassColors(verseText, wordClassSpans) {
    if (!wordClassSpans || !wordClassSpans.length) return;
    this._applyWordClassColorsV2(verseText, wordClassSpans);
  }

  _applyWordClassColorsV2(verseText, wordClassSpans) {
    const state = this.bridge.state;
    const axisSettings = state.get('wordClassAxisSettings') || null;
    const overrides = (axisSettings && axisSettings.colors) || null;

    const activeSpans = wordClassSpans.filter(s => {
      if (s.axis == null || s.value == null) return false;
      return WordClassService.isValueEnabled(axisSettings, s.axis, s.value);
    });
    if (!activeSpans.length) return;

    const { segments, fullText } = this._collectWordSegments(verseText);
    if (!segments.length) return;
    const words = this._wordRanges(fullText);
    if (!words.length) return;

    const colorByRange = new Map();
    for (const span of activeSpans) {
      const r = this._v2Range(span, fullText, words);
      if (!r) continue;
      const color = WordClassService.getAxisColor(span.axis, span.value, overrides);
      const key = r.start + ':' + r.end;
      if (!colorByRange.has(key)) colorByRange.set(key, { charStart: r.start, charEnd: r.end, color });
    }
    if (!colorByRange.size) return;

    this._applyColorRangesToSegments(segments, colorByRange);
  }

  _applyColorRangesToSegments(segments, colorByRange) {
    for (const entry of segments) {
      const { node: tn, start: tnStart, end: tnEnd } = entry;
      const ranges = [];
      for (const c of colorByRange.values()) {
        if (c.charStart < tnEnd && c.charEnd > tnStart) {
          ranges.push({
            localStart: Math.max(c.charStart - tnStart, 0),
            localEnd: Math.min(c.charEnd - tnStart, tnEnd - tnStart),
            color: c.color,
          });
        }
      }
      if (!ranges.length) continue;

      ranges.sort((a, b) => a.localStart - b.localStart);
      const merged = [];
      for (const r of ranges) {
        if (merged.length && merged[merged.length - 1].localEnd >= r.localStart) {
          merged[merged.length - 1].localEnd = Math.max(merged[merged.length - 1].localEnd, r.localEnd);
        } else {
          merged.push({ localStart: r.localStart, localEnd: r.localEnd, color: r.color });
        }
      }

      const text = tn.textContent;
      const frag = document.createDocumentFragment();
      let pos = 0;
      let changed = false;

      for (const r of merged) {
        if (pos < r.localStart) {
          frag.appendChild(document.createTextNode(text.slice(pos, r.localStart)));
        }
        const colored = text.slice(r.localStart, r.localEnd);
        if (colored) {
          const span = document.createElement('span');
          span.style.color = r.color;
          span.textContent = colored;
          frag.appendChild(span);
          changed = true;
        }
        pos = r.localEnd;
      }
      if (pos < text.length) {
        frag.appendChild(document.createTextNode(text.slice(pos)));
      }

      if (changed) {
        tn.parentNode.replaceChild(frag, tn);
      }
    }
  }

  // A verse shows the streaming spinner until its annotation spans arrive. It
  // is pending when a streaming feature is active but the corresponding spans
  // have not been attached yet (first paint happens before enrichment).
  _streamingPending(wordClassSpans, clearReadingSpans, wordStudySpans) {
    const active = this.bridge && this.bridge.state;
    if (!active) return false;
    if (this._wordClassesEnabled) {
      const spans = wordClassSpans || [];
      if (!spans.length) return true;
    }
    if (this._clearReadingEnabled) {
      const spans = clearReadingSpans || [];
      if (!spans.length) return true;
    }
    if (this._wordStudyMode) {
      const spans = wordStudySpans || [];
      if (!spans.length) return true;
    }
    return false;
  }

  // Apply already-resolved annotation spans onto living verse containers in the
  // DOM without re-rendering the chapter. Used by the streaming enrichment path
  // in NavigationModule so annotations stream in past the initial paint instead
  // of forcing a full chapter rebuild. Returns the number of verses touched.
  applyAnnotationsToDom(verses, flags) {
    const state = this.bridge && this.bridge.state;
    if (!state) return 0;
    const speedOn = state.get('speedMode') === true;
    if (speedOn) return 0;

    let touched = 0;
    for (const v of verses) {
      const container = document.querySelector('.verse-container[data-verse="' + v.verse + '"]:not(.section-heading-container)');
      if (!container) continue;
      const verseText = container.querySelector(':scope > .verse-text') || container.querySelector('.verse-text');
      if (!verseText) continue;

      const doWordClasses = !!(flags && flags.wordClasses) && Array.isArray(v.wordClassSpans) && v.wordClassSpans.length;
      const doClearReading = !!(flags && flags.clearReading) && Array.isArray(v.clearReadingSpans) && v.clearReadingSpans.length;
      const doWordStudy = !!(flags && flags.wordStudy) && Array.isArray(v.wordStudySpans) && v.wordStudySpans.length;
      if (!doWordClasses && !doClearReading && !doWordStudy) continue;

      if (container.dataset.wcApplied === '1') continue;

      if (doWordClasses && this._wordClassesEnabled) {
        this._applyWordClassColors(verseText, v.wordClassSpans);
      }
      if (doClearReading && this._clearReadingEnabled) {
        this._applyClearReadingDimming(verseText, v.clearReadingSpans);
      }
      if (doWordStudy && this._wordStudyMode) {
        this._applyWordStudyTargets(verseText, v.wordStudySpans);
      }

      container.classList.remove('wordstudy-pending');
      container.dataset.wcApplied = '1';
      touched++;
    }
    return touched;
  }

  _applyClearReadingDimming(verseText, clearReadingSpans) {
    const state = this.bridge.state;
    const mode = state.get('clearReadingMode');
    const toggles = state.get('clearReadingToggles') || null;
    if (!WordClassService.CLEAR_READING_WEIGHTS[mode]) return;

    const activeSpans = clearReadingSpans.filter(s => s.value);
    if (!activeSpans.length) return;

    const { segments, fullText } = this._collectWordSegments(verseText);
    if (!segments.length) return;
    const words = this._wordRanges(fullText);
    if (!words.length) return;

    const styleByRange = new Map();
    for (const span of activeSpans) {
      const r = this._v2Range(span, fullText, words);
      if (!r) continue;
      const w = WordClassService.getClearReadingWeight(span.value, mode, toggles);
      if (w.opacity === 1.0 && !w.fontWeight) continue;
      const key = r.start + ':' + r.end;
      if (!styleByRange.has(key)) {
        styleByRange.set(key, { charStart: r.start, charEnd: r.end, opacity: w.opacity, fontWeight: w.fontWeight });
      }
    }
    if (!styleByRange.size) return;

    let anyChange = false;
    for (const entry of segments) {
      const { node: tn, start: tnStart, end: tnEnd } = entry;
      const ranges = [];
      for (const c of styleByRange.values()) {
        if (c.charStart < tnEnd && c.charEnd > tnStart) {
          ranges.push({
            localStart: Math.max(c.charStart - tnStart, 0),
            localEnd: Math.min(c.charEnd - tnStart, tnEnd - tnStart),
            opacity: c.opacity,
            fontWeight: c.fontWeight,
          });
        }
      }
      if (!ranges.length) continue;

      ranges.sort((a, b) => a.localStart - b.localStart);
      const merged = [];
      for (const r of ranges) {
        if (merged.length && merged[merged.length - 1].localEnd >= r.localStart) {
          merged[merged.length - 1].localEnd = Math.max(merged[merged.length - 1].localEnd, r.localEnd);
        } else {
          merged.push(r);
        }
      }

      const text = tn.textContent;
      const frag = document.createDocumentFragment();
      let pos = 0;
      let changed = false;

      for (const r of merged) {
        if (pos < r.localStart) {
          frag.appendChild(document.createTextNode(text.slice(pos, r.localStart)));
        }
        const styled = text.slice(r.localStart, r.localEnd);
        if (styled) {
          const span = document.createElement('span');
          span.style.opacity = String(r.opacity);
          if (r.fontWeight) span.style.fontWeight = String(r.fontWeight);
          span.textContent = styled;
          frag.appendChild(span);
          changed = true;
        }
        pos = r.localEnd;
      }
      if (pos < text.length) {
        frag.appendChild(document.createTextNode(text.slice(pos)));
      }

      if (changed) {
        tn.parentNode.replaceChild(frag, tn);
        anyChange = true;
      }
    }
  }
};
