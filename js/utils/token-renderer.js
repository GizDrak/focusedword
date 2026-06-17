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

    let currentBlock = null;
    let verseNumInserted = false;
    const styleStack = [];
    let lastHeadingEl = null;

    const closeBlock = () => {
      if (!currentBlock) return;
      if (currentBlock.tagName === 'SPAN' && !currentBlock.hasChildNodes()) {
        currentBlock.remove();
      }
      currentBlock = null;
    };

    const _applyBionic = (html) => {
      if (!bionic || !strength) return html;
      return html.replace(/(^|>)([^<]+)(?=<|$)/g, (_, before, text) => {
        return before + text.replace(/[^\s]+/g, w => {
          const n = Math.max(1, Math.ceil(w.length * strength));
          return '<b>' + w.slice(0, n) + '</b>' + w.slice(n);
        });
      });
    };

    for (const token of tokens) {
      switch (token.type) {
        case 'paragraph_start': {
          closeBlock();
          lastHeadingEl = null;
          if (settings.paragraphBreaks) {
            if (settings.paragraphMode) {
              if (verseText.hasChildNodes()) {
                verseText.appendChild(document.createElement('br'));
              }
              const el = document.createElement('span');
              el.className = 'token-paragraph-break';
              verseText.appendChild(el);
            } else {
              const el = document.createElement('div');
              el.className = 'token-paragraph';
              verseText.appendChild(el);
              currentBlock = el;
            }
          }
          break;
        }

        case 'poetry_start': {
          closeBlock();
          lastHeadingEl = null;
          const usePoetry = settings.poetryFormatting && !settings.paragraphMode;
          const el = document.createElement('div');
          el.className = usePoetry ? 'token-poetry ' + (token.style || 'q1') : 'token-poetry--disabled';
          verseText.appendChild(el);
          currentBlock = el;
          break;
        }

        case 'line_break': {
          lastHeadingEl = null;
          if (settings.paragraphMode) {
            const space = document.createTextNode('\u00A0');
            if (currentBlock) {
              currentBlock.appendChild(space);
            } else {
              verseText.appendChild(space);
            }
          } else {
            const br = document.createElement('br');
            if (currentBlock) {
              currentBlock.appendChild(br);
            } else {
              verseText.appendChild(br);
            }
          }
          break;
        }

        case 'section_heading': {
          const headingText = (token.text || '').trim();
          if (!headingText || /^[\s\(\\)\[\]\{\}.,;:!?\-]+$/.test(headingText)) break;
          closeBlock();
          lastHeadingEl = null;
          if (!settings.sectionHeadings) break;
          const el = document.createElement('div');
          el.className = 'token-section-heading';
          el.textContent = headingText;
          container.appendChild(el);
          lastHeadingEl = el;
          break;
        }

        case 'text': {
          lastHeadingEl = null;
          if (!currentBlock) {
            const el = document.createElement('span');
            el.className = 'token-text';
            verseText.appendChild(el);
            currentBlock = el;
          }
          if (!verseNumInserted) {
            currentBlock.insertAdjacentElement('afterbegin', verseNumEl);
            verseNumInserted = true;
          }
          currentBlock.insertAdjacentHTML(
            'beforeend',
            _applyBionic(MarkdownParser.parse(token.text || ''))
          );
          break;
        }

        case 'style_start': {
          if (!settings.redLetter && token.style === 'wj') {
            styleStack.push({ el: null, parent: currentBlock, skip: true });
            break;
          }
          const el = document.createElement('span');
          el.className = token.style || '';
          const parent = currentBlock || verseText;
          parent.appendChild(el);
          styleStack.push({ el, parent: currentBlock });
          currentBlock = el;
          break;
        }

        case 'style_end': {
          if (styleStack.length) {
            const entry = styleStack.pop();
            if (entry.skip) { currentBlock = entry.parent; break; }
            currentBlock = entry.parent;
            if (entry.el && !entry.el.hasChildNodes()) entry.el.remove();
          }
          break;
        }

        case 'footnote': {
          if (!settings.footnotes) { lastHeadingEl = null; break; }
          lastHeadingEl = null;
          const el = document.createElement('span');
          el.className = 'footnote-caller';
          el.textContent = token.marker || '*';
          el.dataset.footnoteText = token.text || '';
          (currentBlock || verseText).appendChild(el);
          break;
        }

        case 'cross_ref': {
          if (lastHeadingEl) {
            const el = document.createElement('span');
            el.className = 'token-section-heading-ref';
            el.textContent = token.text || '';
            const refs = this._parseCrossRefRefs(token.text);
            if (refs.length) {
              el.dataset.refs = JSON.stringify(refs);
            }
            lastHeadingEl.appendChild(el);
          }
          break;
        }
      }
    }

    closeBlock();
    if (!verseNumInserted) {
      verseText.appendChild(verseNumEl);
    }
    container.appendChild(verseText);
    return container;
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
