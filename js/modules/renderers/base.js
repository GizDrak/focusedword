window.BaseRenderer = class BaseRenderer {
  constructor(bridge) {
    this.bridge = bridge;
  }

  clearContent() {
    const el = document.getElementById('content');
    const header = el.querySelector('#chapter-header');
    const controls = el.querySelector('#speed-controls');
    const keep = [];
    if (header) keep.push(header);
    if (controls) keep.push(controls);
    for (let i = el.children.length - 1; i >= 0; i--) {
      const child = el.children[i];
      if (!keep.includes(child)) child.remove();
    }
    return el;
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
    const parts = cleaned.split(/[,;:—–-]/);
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
      titleEl.textContent = summary || this._extractChapterTitle(verses[0]?.text || '');
    }

    const subtitleEl = document.getElementById('chapter-subtitle');
    if (subtitleEl) {
      subtitleEl.textContent = bookName + ' ' + chapter + ' \u00B7 ' + verses.length + ' verses';
    }

    if (state.get('swipeMode')) return;

    chapterHeader.classList.remove('hidden', 'header-hidden');
  }

  setupScrollAutoHide(contentEl) {
    if (this._scrollHandler) {
      if (this._scrollTarget) {
        this._scrollTarget.removeEventListener('scroll', this._scrollHandler, { passive: true });
      }
      this._scrollHandler = null;
    }
  }

  createVerseElement(verse, bionic, strength) {
    const container = document.createElement('div');
    container.className = 'verse-container';
    container.dataset.verse = verse.verse;

    const verseNum = document.createElement('sup');
    verseNum.className = 'verse-num';
    verseNum.textContent = verse.verse;

    const verseText = document.createElement('span');
    verseText.className = 'verse-text';
    verseText.setAttribute('dir', 'auto');

    const useWj = this.bridge.state.get('redLetter') && verse.has_wj && verse.text_wj;

    if (useWj) {
      verseText.innerHTML = bionic
        ? this._applyBionicToWj(verse.text_wj, strength)
        : verse.text_wj;
    } else if (bionic) {
      verseText.innerHTML = this.bridge.bionic.parse(verse.text, strength);
    } else {
      verseText.textContent = verse.text;
    }

    verseText.prepend(verseNum);
    container.appendChild(verseText);
    return container;
  }

  _applyBionicToWj(html, strength) {
    return html.replace(/(^|>)([^<]+)(?=<|$)/g, (_, before, text) => {
      return before + this.bridge.bionic.parse(text, strength);
    });
  }

  updateFocusedVerse(verseNum) {
    document.querySelectorAll('.verse-container.focused').forEach(el => el.classList.remove('focused'));
    if (!verseNum) return;
    const target = document.querySelector('.verse-container[data-verse="' + verseNum + '"]');
    if (target) {
      target.classList.add('focused');
      this._updateProgressBar(verseNum);
    }
  }

  _updateProgressBar(verseNum) {
    const bar = document.getElementById('verse-progress');
    const label = document.getElementById('verse-progress-label');
    if (!bar || !label) return;

    const state = this.bridge.state;
    const nav = this.bridge.get('navigation');
    const total = nav?.currentVerses?.length ||
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

  showSpeedControls(show) {
    const el = document.getElementById('speed-controls');
    if (el) el.classList.toggle('hidden', !show);
  }

  scrollActiveVerseIntoView() {
    const el = document.querySelector('.verse-container.active-verse');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
};
