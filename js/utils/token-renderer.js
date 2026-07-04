window.TokenRenderer = class TokenRenderer {
  renderChapter(verses, bionic, strength, settings) {
    const frag = document.createDocumentFragment();
    for (const v of verses) {
      const el = this._renderVerseTokens(v.verse, v.tokens, bionic, strength, settings);
      if (!el) continue;
      let child = el.firstChild;
      while (child) {
        const next = child.nextSibling;
        if (child.nodeType === 1 && child.classList &&
            child.classList.contains('token-section-heading')) {
          el.removeChild(child);
          frag.appendChild(child);
        }
        child = next;
      }
      frag.appendChild(el);
    }
    return frag;
  }

  _renderVerseTokens(verseNum, tokens, bionic, strength, settings) {
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

    const ctx = {
      container,
      verseText,
      verseNumEl,
      settings,
      currentBlock: null,
      verseNumInserted: false,
      styleStack: [],
      lastHeadingEl: null,
      closeBlock() {
        if (!ctx.currentBlock) return;
        if (ctx.currentBlock.tagName === 'SPAN' && !ctx.currentBlock.hasChildNodes()) {
          ctx.currentBlock.remove();
        }
        ctx.currentBlock = null;
      },
      applyBionic(html) {
        if (!bionic || !strength) return html;
        return html.replace(/(^|>)([^<]+)(?=<|$)/g, (_, before, text) => {
          return before + text.replace(/[^\s]+/g, w => {
            const n = Math.max(1, Math.ceil(w.length * strength));
            return '<b>' + w.slice(0, n) + '</b>' + w.slice(n);
          });
        });
      }
    };

    for (const token of tokens) {
      switch (token.type) {
        case 'paragraph_start': this._renderParagraphStart(token, ctx); break;
        case 'poetry_start':    this._renderPoetryStart(token, ctx); break;
        case 'line_break':      this._renderLineBreak(token, ctx); break;
        case 'section_heading': this._renderSectionHeading(token, ctx); break;
        case 'text':            this._renderText(token, ctx); break;
        case 'style_start':     this._renderStyleStart(token, ctx); break;
        case 'style_end':       this._renderStyleEnd(token, ctx); break;
        case 'footnote':        this._renderFootnote(token, ctx); break;
        case 'cross_ref':       this._renderCrossRef(token, ctx); break;
      }
    }

    ctx.closeBlock();
    if (!ctx.verseNumInserted) {
      ctx.verseText.appendChild(ctx.verseNumEl);
    }
    ctx.container.appendChild(ctx.verseText);
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
  }

  _renderLineBreak(token, ctx) {
    ctx.lastHeadingEl = null;
    if (ctx.settings.paragraphMode) {
      const space = document.createTextNode('\u00A0');
      if (ctx.currentBlock) {
        ctx.currentBlock.appendChild(space);
      } else {
        ctx.verseText.appendChild(space);
      }
    } else {
      const br = document.createElement('br');
      if (ctx.currentBlock) {
        ctx.currentBlock.appendChild(br);
      } else {
        ctx.verseText.appendChild(br);
      }
    }
  }

  _renderSectionHeading(token, ctx) {
    const headingText = (token.text || '').trim();
    if (!headingText || /^[\s\(\\)\[\]\{\}.,;:!?\-]+$/.test(headingText)) return;
    ctx.closeBlock();
    ctx.lastHeadingEl = null;
    if (!ctx.settings.sectionHeadings) return;
    const el = document.createElement('div');
    el.className = 'token-section-heading';
    el.textContent = headingText;
    ctx.container.appendChild(el);
    ctx.lastHeadingEl = el;
  }

  _renderText(token, ctx) {
    ctx.lastHeadingEl = null;
    if (!ctx.currentBlock) {
      const el = document.createElement('span');
      el.className = 'token-text';
      ctx.verseText.appendChild(el);
      ctx.currentBlock = el;
    }
    if (!ctx.verseNumInserted) {
      ctx.currentBlock.insertAdjacentElement('afterbegin', ctx.verseNumEl);
      ctx.verseNumInserted = true;
    }
    ctx.currentBlock.insertAdjacentHTML(
      'beforeend',
      ctx.applyBionic(MarkdownParser.parse(token.text || ''))
    );
  }

  _renderStyleStart(token, ctx) {
    if (!ctx.settings.redLetter && token.style === 'wj') {
      ctx.styleStack.push({ el: null, parent: ctx.currentBlock, skip: true });
      return;
    }
    const el = document.createElement('span');
    el.className = token.style || '';
    const parent = ctx.currentBlock || ctx.verseText;
    parent.appendChild(el);
    ctx.styleStack.push({ el, parent: ctx.currentBlock });
    ctx.currentBlock = el;
  }

  _renderStyleEnd(token, ctx) {
    if (!ctx.styleStack.length) return;
    const entry = ctx.styleStack.pop();
    if (entry.skip) {
      ctx.currentBlock = entry.parent;
      return;
    }
    ctx.currentBlock = entry.parent;
    if (entry.el && !entry.el.hasChildNodes()) entry.el.remove();
  }

  _renderFootnote(token, ctx) {
    if (!ctx.settings.footnotes) {
      ctx.lastHeadingEl = null;
      return;
    }
    ctx.lastHeadingEl = null;
    const el = document.createElement('span');
    el.className = 'footnote-caller';
    el.textContent = token.marker || '*';
    el.dataset.footnoteText = token.text || '';
    (ctx.currentBlock || ctx.verseText).appendChild(el);
  }

  _renderCrossRef(token, ctx) {
    if (!ctx.lastHeadingEl) return;
    const el = document.createElement('span');
    el.className = 'token-section-heading-ref';
    el.textContent = token.text || '';
    const refs = this._parseCrossRefRefs(token.text);
    if (refs.length) {
      el.dataset.refs = JSON.stringify(refs);
    }
    ctx.lastHeadingEl.appendChild(el);
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
};
