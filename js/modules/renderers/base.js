window.BaseRenderer = class BaseRenderer {
  constructor(bridge) {
    this.bridge = bridge;
    this._currentBookId = null;
    this._currentChapter = null;
  }

  _getSettings() {
    const state = this.bridge.state;
    return {
      redLetter: state.get('redLetter'),
      footnotes: state.get('footnotes'),
      sectionHeadings: state.get('sectionHeadings'),
      poetryFormatting: state.get('poetryFormatting'),
      paragraphBreaks: state.get('paragraphBreaks'),
      paragraphMode: state.get('paragraphMode')
    };
  }

  _getEmblemSvg(bookId) {
    const id = Number(bookId);
    let emblem;
    if (id <= 5) {
      emblem = 'pentateuch';
    } else if (id <= 17) {
      emblem = 'history';
    } else if (id <= 22) {
      emblem = 'wisdom';
    } else if (id <= 39) {
      emblem = 'prophets';
    } else if (id <= 43) {
      emblem = 'gospels';
    } else if (id === 44) {
      emblem = 'acts';
    } else if (id <= 65) {
      emblem = 'epistles';
    } else {
      emblem = 'revelation';
    }

    const svgs = {
      pentateuch: '<svg viewBox="0 0 80 80" fill="none"><g stroke="currentColor" stroke-width="0.7" opacity="0.25"><line x1="40" y1="15" x2="40" y2="5"/><line x1="40" y1="75" x2="40" y2="65"/><line x1="15" y1="40" x2="5" y2="40"/><line x1="65" y1="40" x2="75" y2="40"/><line x1="23" y1="23" x2="16" y2="16"/><line x1="57" y1="23" x2="64" y2="16"/><line x1="23" y1="57" x2="16" y2="64"/><line x1="57" y1="57" x2="64" y2="64"/><line x1="30" y1="18" x2="27" y2="9"/><line x1="50" y1="18" x2="53" y2="9"/><line x1="18" y1="30" x2="9" y2="27"/><line x1="62" y1="30" x2="71" y2="27"/><line x1="30" y1="62" x2="27" y2="71"/><line x1="50" y1="62" x2="53" y2="71"/></g><path d="M20 35 L40 30 L60 35 L60 60 L40 55 L20 60 Z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M40 30 L40 55" stroke="currentColor" stroke-width="1.2" opacity="0.5"/><line x1="36" y1="42" x2="44" y2="42" stroke="currentColor" stroke-width="1.2" opacity="0.5" stroke-linecap="round"/><circle cx="40" cy="28" r="2.5" fill="currentColor" opacity="0.5"/></svg>',
      history: '<svg viewBox="0 0 80 80" fill="none"><g stroke="currentColor" stroke-width="0.7" opacity="0.2"><line x1="40" y1="10" x2="40" y2="5"/><line x1="40" y1="75" x2="40" y2="70"/></g><rect x="22" y="22" width="36" height="40" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="28" y="28" width="24" height="28" rx="1" stroke="currentColor" stroke-width="1" fill="none" opacity="0.4"/><path d="M34 28v-6a6 6 0 0112 0v6" stroke="currentColor" stroke-width="1.2" fill="none"/><circle cx="40" cy="42" r="4" stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.6"/><path d="M40 46v6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.6"/></svg>',
      wisdom: '<svg viewBox="0 0 80 80" fill="none"><g stroke="currentColor" stroke-width="0.7" opacity="0.2"><line x1="40" y1="12" x2="40" y2="5"/><line x1="40" y1="75" x2="40" y2="68"/></g><path d="M25 50 C25 30 40 18 40 18 C40 18 55 30 55 50 L50 52 C50 45 45 40 40 40 C35 40 30 45 30 52 Z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M30 52 L30 58 C30 58 35 62 40 62 C45 62 50 58 50 58 L50 52" stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.6"/><circle cx="40" cy="32" r="3" fill="currentColor" opacity="0.3"/></svg>',
      prophets: '<svg viewBox="0 0 80 80" fill="none"><g stroke="currentColor" stroke-width="0.7" opacity="0.2"><line x1="40" y1="12" x2="40" y2="5"/><line x1="40" y1="75" x2="40" y2="68"/></g><path d="M22 52 L40 25 L58 52 Z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M22 52 L40 56 L58 52" stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.5"/><path d="M40 25 L40 56" stroke="currentColor" stroke-width="1.2" opacity="0.4"/><path d="M30 38 L35 33" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/><path d="M50 38 L45 33" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/></svg>',
      gospels: '<svg viewBox="0 0 80 80" fill="none"><g stroke="currentColor" stroke-width="0.7" opacity="0.2"><line x1="40" y1="10" x2="40" y2="5"/><line x1="40" y1="75" x2="40" y2="70"/><line x1="15" y1="40" x2="5" y2="40"/><line x1="65" y1="40" x2="75" y2="40"/></g><path d="M40 18 L40 62" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M22 34 L58 34" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="40" cy="18" r="5" stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.4"/><circle cx="40" cy="62" r="5" stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.4"/></svg>',
      acts: '<svg viewBox="0 0 80 80" fill="none"><g stroke="currentColor" stroke-width="0.7" opacity="0.2"><line x1="40" y1="12" x2="40" y2="5"/><line x1="40" y1="75" x2="40" y2="68"/></g><path d="M24 48 C24 38 32 22 40 22 C48 22 56 38 56 48 C56 58 48 60 40 60 C32 60 24 58 24 48Z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M30 48 L50 48" stroke="currentColor" stroke-width="1.2" opacity="0.4"/><path d="M34 40 C34 40 37 52 40 52 C43 52 46 40 46 40" stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.6"/><circle cx="40" cy="36" r="3" fill="currentColor" opacity="0.3"/></svg>',
      epistles: '<svg viewBox="0 0 80 80" fill="none"><g stroke="currentColor" stroke-width="0.7" opacity="0.2"><line x1="40" y1="12" x2="40" y2="5"/><line x1="40" y1="75" x2="40" y2="68"/></g><path d="M20 25 L40 20 L60 25 L60 58 L40 54 L20 58 Z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M40 20 L40 54" stroke="currentColor" stroke-width="1.2" opacity="0.4"/><line x1="28" y1="32" x2="52" y2="32" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/><line x1="28" y1="38" x2="48" y2="38" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.4"/><line x1="28" y1="44" x2="44" y2="44" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/></svg>',
      revelation: '<svg viewBox="0 0 80 80" fill="none"><g stroke="currentColor" stroke-width="0.7" opacity="0.2"><line x1="40" y1="10" x2="40" y2="5"/><line x1="40" y1="75" x2="40" y2="70"/><line x1="15" y1="40" x2="5" y2="40"/><line x1="65" y1="40" x2="75" y2="40"/></g><path d="M40 15 L45 32 L62 32 L48 43 L53 60 L40 49 L27 60 L32 43 L18 32 L35 32 Z" stroke="currentColor" stroke-width="1.2" fill="none"/><circle cx="40" cy="40" r="3" fill="currentColor" opacity="0.3"/></svg>'
    };

    return svgs[emblem] || svgs.pentateuch;
  }

  _extractChapterTitle(text) {
    if (!text) return 'The Beginning';
    const cleaned = text.replace(/^And\s+|^So\s+|^Then\s+|^Now\s+/i, '');
    const parts = cleaned.split(/[,;:\u2014\u2013-]/);
    const firstPart = parts[0].trim();
    let words = firstPart.split(/\s+/);

    if (words.length > 4) {
      words = words.slice(0, 4);
      while (words.length > 2 && ['and', 'the', 'of', 'in', 'at', 'to', 'for', 'with', 'a', 'an'].includes(words[words.length - 1].toLowerCase())) {
        words.pop();
      }
    }

    let title = words.map((w, i) => {
      if (i === 0) return w.charAt(0).toUpperCase() + w.slice(1);
      if (['the', 'and', 'of', 'in', 'at', 'to', 'for', 'with', 'a', 'an', 'by', 'on'].includes(w.toLowerCase())) {
        return w.toLowerCase();
      }
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');

    title = title.replace(/[^a-zA-Z0-9'\s-]/g, '').trim();
    return title || 'The Beginning';
  }

  showChapterHeader(verses, bookName) {
    const chapterHeader = document.getElementById('chapter-header');
    if (!chapterHeader) return;

    const state = this.bridge.state;

    if (state.get('speedMode')) {
      chapterHeader.classList.add('header-hidden');
      return;
    }

    const bookId = state.get('currentBook');
    const chapter = state.get('currentChapter');

    const emblemEl = document.getElementById('chapter-emblem');
    if (emblemEl) {
      emblemEl.innerHTML = this._getEmblemSvg(bookId);
    }

    const titleEl = document.getElementById('chapter-title');
    if (titleEl) {
      const cs = this.bridge.get('chapter-summary');
      const summary = cs ? cs.getSummary(bookId, chapter) : ChapterSummary.getSummary(bookId, chapter);
      titleEl.textContent = summary || this._extractChapterTitle(verses[0]?.clean_text || verses[0]?.text || '');
    }

    const subtitleEl = document.getElementById('chapter-subtitle');
    if (subtitleEl) {
      const count = verses.filter(v => v.verse > 0).length;
      subtitleEl.textContent = bookName + ' ' + chapter + ' \u00B7 ' + count + ' verses';
    }

    if (state.get('swipeMode')) return;

    const wasHidden = chapterHeader.classList.contains('header-hidden');

    if (wasHidden) {
      chapterHeader.style.transition = 'none';
    }
    chapterHeader.classList.remove('hidden', 'header-hidden');
    if (wasHidden) {
      void chapterHeader.offsetHeight;
      chapterHeader.style.transition = '';
    }
  }

  renderTokenChapter(verses, bionic, strength, settings) {
    if (!this._tokenRenderer) {
      this._tokenRenderer = new window.TokenRenderer();
    }
    const frag = this._tokenRenderer.renderChapter(verses, bionic, strength, settings || this._getSettings());
    frag.querySelectorAll('.token-section-heading-ref[data-refs]').forEach(el => {
      el.addEventListener('click', (e) => {
        const im = this.bridge.get('interaction-manager');
        if (im && im.selectionMode) return;
        e.stopPropagation();
        try {
          const refs = JSON.parse(el.dataset.refs);
          if (refs && refs.length) {
            const verseContainer = el.closest('.verse-container');
            const verseNum = verseContainer ? parseInt(verseContainer.dataset.verse) : null;
            this._showInlineCrossRefs(refs, verseNum);
          }
        } catch (e) { console.error('[base] cross-ref inline parse:', e); }
      });
    });
    return frag;
  }

  renderTokenVerse(verseTokens, verseNum) {
    if (!this._tokenRenderer) {
      this._tokenRenderer = new window.TokenRenderer();
    }
    return this._tokenRenderer._renderVerseTokens(verseNum, verseTokens, false, 0, this._getSettings());
  }

  createVerseElement(verse, bionic, strength, crossRefs) {
    if (verse.tokens) {
      const frag = this.renderTokenChapter([verse], bionic, strength);
      const container = frag.querySelector('.verse-container');
      if (container) {
        if (crossRefs && crossRefs.length > 0 && this.bridge.state.get('crossRefs')) {
          this._addCrossRefIndicator(container, verse.verse);
        }
        return container;
      }
    }

    const container = document.createElement('div');
    container.className = 'verse-container';
    container.dataset.verse = verse.verse;

    const verseNum = document.createElement('sup');
    verseNum.className = 'verse-num';
    verseNum.textContent = verse.verse;

    const verseText = document.createElement('span');
    verseText.className = 'verse-text';
    verseText.setAttribute('dir', 'auto');

    const text = verse.clean_text || '';
    if (bionic) {
      verseText.innerHTML = this.bridge.bionic.parse(text, strength);
    } else {
      verseText.textContent = text;
    }

    verseText.prepend(verseNum);
    container.appendChild(verseText);
    if (crossRefs && crossRefs.length > 0 && this.bridge.state.get('crossRefs')) {
      this._addCrossRefIndicator(container, verse.verse);
    }
    return container;
  }

  updateFocusedVerse(verseNum) {
    document.querySelectorAll('.verse-container.focused').forEach(el => el.classList.remove('focused'));
    if (!verseNum) return;
    const target = document.querySelector('.verse-container[data-verse="' + verseNum + '"]');
    if (target) {
      target.classList.add('focused');
    }
    this.updateProgress(verseNum);
  }

  updateProgress(verseNum) {
    this._updateProgressBar(verseNum);
  }

  _updateProgressBar(verseNum) {
    const bar = document.getElementById('verse-progress');
    const label = document.getElementById('verse-progress-label');
    if (!bar || !label) return;

    const state = this.bridge.state;
    const nav = this.bridge.get('navigation');
    const total = (nav?.currentVerses || []).filter(v => v.verse > 0).length ||
                  document.querySelectorAll('.verse-container').length;

    if (!total) {
      bar.classList.remove('visible');
      return;
    }

    const verse = verseNum || state.get('currentVerse');
    const bookName = state.get('currentBookName');
    const chapter = state.get('currentChapter');

    label.textContent = `${bookName} ${chapter} \u00B7 ${verse} / ${total}`;
    bar.classList.add('visible');
  }

  _addCrossRefIndicator(container, verseNum) {
    const verseText = container.querySelector('.verse-text');
    if (!verseText) return;
    const indicator = document.createElement('span');
    indicator.className = 'crossref-indicator';
    indicator.textContent = '\u2020';
    indicator.addEventListener('click', async (e) => {
      const im = this.bridge.get('interaction-manager');
      if (im && im.selectionMode) return;
      e.stopPropagation();
      await this._showCrossRefBar(this._currentBookId, this._currentChapter, verseNum);
    });
    const children = Array.from(verseText.children);
    let target = null;
    for (let i = children.length - 1; i >= 0; i--) {
      if (children[i].textContent.trim()) {
        target = children[i];
        break;
      }
    }
    if (target) {
      const lastEl = target.lastElementChild;
      if (lastEl && lastEl.tagName === 'BR') {
        target.insertBefore(indicator, lastEl);
      } else {
        target.appendChild(indicator);
      }
    } else {
      verseText.appendChild(indicator);
    }
  }

  _addCrossRefIndicators(fragment, bulkRefs) {
    if (!this.bridge.state.get('crossRefs')) return;
    const containers = fragment.querySelectorAll('.verse-container');
    for (const c of containers) {
      const v = parseInt(c.dataset.verse);
      if (bulkRefs && bulkRefs[v] && bulkRefs[v].length) {
        this._addCrossRefIndicator(c, v);
      }
    }
  }

  async _renderCrossRefEntries(refs, container, onNavigate) {
    const books = window.BibleDB._BOOKS;
    for (const ref of refs) {
      const toBook = books.find(b => b.id === ref.to_book_id);
      if (!toBook) continue;

      let text = '';
      try {
        const code = this.bridge.db.idToCode(ref.to_book_id);
        if (code) {
          const verses = await this.bridge.db.getChapterTokens(code, ref.to_chapter);
          const v = verses.find(v => v.verse === ref.to_verse_start);
          if (v) text = v.clean_text.trim();
        }
      } catch (e) { console.error('[base] fetch cross-ref text:', e, ref); }

      const label = `${toBook.name} ${ref.to_chapter}:${ref.to_verse_start}` +
        (ref.to_verse_end > ref.to_verse_start ? `-${ref.to_verse_end}` : '');

      const entry = document.createElement('div');
      entry.className = 'crossref-bar-entry';
      entry.addEventListener('click', () => {
        onNavigate();
        this.bridge.get('navigation').navigateTo(ref.to_book_id, ref.to_chapter, ref.to_verse_start);
      });

      const textSpan = document.createElement('span');
      textSpan.className = 'crossref-bar-text';
      textSpan.textContent = text || '(text not available)';

      const refSpan = document.createElement('span');
      refSpan.className = 'crossref-bar-ref';
      refSpan.textContent = '\u2014 ' + label;

      entry.appendChild(textSpan);
      entry.appendChild(refSpan);
      container.appendChild(entry);
    }
  }

  _dismissCrossRef(key) {
    this._crossRefShowingKey = null;
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    if (this._crossRefCleanup) { this._crossRefCleanup(); this._crossRefCleanup = null; }
    if (this._crossRefCloseDoc) {
      document.removeEventListener('click', this._crossRefCloseDoc);
      document.removeEventListener('wheel', this._crossRefCloseDoc);
      this._crossRefCloseDoc = null;
    }
    const refsContainer = document.getElementById('crossref-bar');
    if (refsContainer) refsContainer.innerHTML = '';
  }

  async _showCrossRefBar(bookId, chapter, verse) {
    const key = `${bookId}_${chapter}_${verse}`;
    if (this._crossRefShowingKey === key) {
      const refsContainer = document.getElementById('crossref-bar');
      const dismissBtn = refsContainer?.querySelector('.crossref-bar-dismiss');
      if (dismissBtn) dismissBtn.click();
      return;
    }

    const bar = document.getElementById('verse-progress');
    const refsContainer = document.getElementById('crossref-bar');
    if (!bar || !refsContainer) return;

    const refs = this.bridge.get('cross-references').getRefs(bookId, chapter, verse);
    const topRefs = refs.slice(0, 3);

    if (topRefs.length === 0) return;

    refsContainer.innerHTML = '';
    await this._renderCrossRefEntries(topRefs, refsContainer, () => this._dismissCrossRef(key));

    bar.classList.add('visible', 'show-references');
    this._crossRefShowingKey = key;

    const dismiss = document.createElement('button');
    dismiss.className = 'crossref-bar-dismiss';
    dismiss.textContent = '\u2715';
    dismiss.addEventListener('click', () => this._dismissCrossRef(key));
    refsContainer.appendChild(dismiss);

    if (this._crossRefCleanup) this._crossRefCleanup();
    this._crossRefCleanup = () => {
      bar.classList.remove('show-references');
      this._updateProgressBar();
    };

    if (this._crossRefCloseDoc) {
      document.removeEventListener('click', this._crossRefCloseDoc);
      document.removeEventListener('wheel', this._crossRefCloseDoc);
    }

    this._crossRefCloseDoc = (e) => {
      if (e.target && e.target.closest && e.target.closest('#verse-progress')) return;
      const vc = e.target && typeof e.target.closest === 'function' && e.target.closest('.verse-container');
      if (vc) {
        const ind = vc.querySelector('.crossref-indicator');
        if (ind) {
          const r = ind.getBoundingClientRect();
          const pad = 24;
          if (e.clientX >= r.left - pad && e.clientX <= r.right + pad &&
              e.clientY >= r.top - pad && e.clientY <= r.bottom + pad) return;
        }
      }
      this._dismissCrossRef(key);
    };

    setTimeout(() => {
      document.addEventListener('click', this._crossRefCloseDoc);
      document.addEventListener('wheel', this._crossRefCloseDoc);
    }, 0);
  }

  async _showInlineCrossRefs(refs, verseNum) {
    const key = 'inline_' + refs.map(r => `${r.to_book_id}:${r.to_chapter}:${r.to_verse_start}`).join(',');
    if (this._crossRefShowingKey === key) {
      const refsContainer = document.getElementById('crossref-bar');
      const dismissBtn = refsContainer?.querySelector('.crossref-bar-dismiss');
      if (dismissBtn) dismissBtn.click();
      return;
    }

    const bar = document.getElementById('verse-progress');
    const refsContainer = document.getElementById('crossref-bar');
    if (!bar || !refsContainer) return;

    const topRefs = refs.slice(0, 3);

    if (this._crossRefCleanup) this._crossRefCleanup();
    refsContainer.innerHTML = '';

    if (topRefs.length === 0) return;

    await this._renderCrossRefEntries(topRefs, refsContainer, () => this._dismissCrossRef(key));

    this._crossRefCleanup = () => {
      bar.classList.remove('show-references');
      this._updateProgressBar();
    };

    bar.classList.add('visible', 'show-references');
    this._crossRefShowingKey = key;

    const dismiss = document.createElement('button');
    dismiss.className = 'crossref-bar-dismiss';
    dismiss.textContent = '\u2715';
    dismiss.addEventListener('click', () => this._dismissCrossRef(key));
    refsContainer.appendChild(dismiss);

    if (this._crossRefCloseDoc) {
      document.removeEventListener('click', this._crossRefCloseDoc);
      document.removeEventListener('wheel', this._crossRefCloseDoc);
    }

    this._crossRefCloseDoc = (e) => {
      if (e.target && e.target.closest && e.target.closest('#verse-progress')) return;
      this._dismissCrossRef(key);
    };

    setTimeout(() => {
      document.addEventListener('click', this._crossRefCloseDoc);
      document.addEventListener('wheel', this._crossRefCloseDoc);
    }, 0);
  }

  showSpeedControls(show) {
    const el = document.getElementById('speed-controls');
    if (el) el.classList.toggle('hidden', !show);
  }

  async applyBookmarks() {
    const selection = this.bridge.selection;
    if (!selection) return;
    const state = this.bridge.state;
    const [chapterBm, sets] = await Promise.all([
      selection.getBookmarksForChapter(state.get('currentBook'), state.get('currentChapter')),
      selection.getAllBookmarkSets()
    ]);
    const setMap = {};
    for (const s of sets) setMap[s.id] = s.color;
    for (const c of document.querySelectorAll('.verse-container')) {
      c.style.borderLeft = '';
      c.style.paddingLeft = '';
      const num = parseInt(c.querySelector('.verse-num').textContent);
      const bm = chapterBm.find(b => (b.verses || [b.verse]).includes(num));
      if (bm) {
        const color = bm.setId ? setMap[bm.setId] : null;
        c.style.borderLeft = `3px solid ${color || 'var(--accent-gold)'}`;
        c.style.paddingLeft = '1rem';
      }
    }
  }

  async renderHighlights() {
    const hm = this.bridge.get('highlight-manager');
    if (hm) {
      await hm.renderHighlightsForChapter();
    }
  }

  trapFocus(container, triggerEl) {
    const focusable = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const handler = (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    };
    container.addEventListener('keydown', handler);
    setTimeout(() => first?.focus(), 50);
    return () => {
      container.removeEventListener('keydown', handler);
      triggerEl?.focus();
    };
  }

  escapeHtml(str) {
    return window.HTMLEscape(str);
  }
};
