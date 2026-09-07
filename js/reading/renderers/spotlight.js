window.SpotlightRenderer = class SpotlightRenderer {
  constructor(bridge, base) {
    this.bridge = bridge;
    this.base = base;
    this.currentVerseIndex = 0;
    this._window = null;
    this._verseEntries = [];
    this._activeEntryIndex = -1;
    this._activeKey = null;
    this._building = false;
  }

  _isContinuous() {
    const s = this.bridge.state;
    return s.get('continuousChapters') === true && !s.get('splitMode');
  }

  render(verses) {
    const state = this.bridge.state;
    const bionic = state.get('bionic');
    const strength = state.get('bionicStrength');

    this.bridge.state.set('spotlightMode', true);

    if (this._isContinuous()) {
      return this._renderContinuousWindow();
    }

    this._verseEntries = [];
    this._activeEntryIndex = -1;
    this._activeKey = null;

    const idx = verses.findIndex(v => v.verse === state.get('currentVerse'));
    this.currentVerseIndex = idx >= 0 ? idx : 0;

    this._renderAll(verses, bionic, strength);
  }

  async _renderContinuousWindow() {
    const state = this.bridge.state;
    const content = document.getElementById('content');
    this._building = true;
    try {
      if (!this._window) this._window = new window.ChapterWindow(this.bridge);
      const bookId = state.get('currentBook');
      const chapter = state.get('currentChapter');
      await this._window.setActive(bookId, chapter);
      this._activeKey = ChapterWindow.key(bookId, chapter);
      this._renderWindow(content);
      const persistentHeader = document.getElementById('chapter-header');
      if (persistentHeader) persistentHeader.classList.add('header-hidden');
    } finally {
      this._building = false;
    }
  }

  _renderWindow(content) {
    const state = this.bridge.state;
    const bionic = state.get('bionic');
    const strength = state.get('bionicStrength');
    content.classList.add('spotlight-mode');
    content.classList.remove('swipe-mode', 'speed-mode');

    const _rp = (key, def) => {
      const raw = state.get(key);
      if (raw !== 'skin' || !window.UISkins) return raw;
      const skin = UISkins.getActive();
      if (skin && key in (skin.preferences || {})) return skin.preferences[key];
      return UISkins._builtinDefaults[key] !== undefined ? UISkins._builtinDefaults[key] : def;
    };
    const paragraphMode = _rp('paragraphMode', false);

    this._verseEntries = [];
    this._activeEntryIndex = -1;

    for (const section of this._window.sections) {
      const { els, entries } = this._buildSectionEntries(section, bionic, strength, paragraphMode);
      for (const el of els) content.appendChild(el);
      this._verseEntries.push(...entries);
      this._applyResolvedAnnotations(section, content);
    }

    for (const section of this._window.sections) {
      this._maybeEnrichSection(section, content);
    }

    let target = this._verseEntries.findIndex(e => e.key === this._activeKey && e.verse === state.get('currentVerse'));
    if (target < 0) {
      target = this._verseEntries.findIndex(e => e.key === this._activeKey && !e.headingOnly);
    }
    this._activeEntryIndex = target;

    const entry = this._verseEntries[this._activeEntryIndex];
    if (entry) {
      if (paragraphMode) {
        this.base.updateFocusedVerse(entry.verse, { book: entry.bookId, chapter: entry.chapter });
      } else {
        entry.container.classList.remove('dimmed-verse');
        entry.container.classList.add('active-verse', 'focused');
      }
      if (entry.verse !== state.get('currentVerse')) {
        window.verseManager.setPassive(entry.verse);
      }
      this.base.updateProgress(entry.verse);
    }

    this._syncTailSpacer(content);
  }

  _buildSectionEntries(section, bionic, strength, paragraphMode) {
    const state = this.bridge.state;
    const verses = this._window.peekVerses(section.key) || [];
    let bulkRefs = {};
    if (state.get('crossRefs')) {
      const cr = this.bridge.get('cross-references');
      if (cr && cr.enabled) {
        bulkRefs = cr.getRefsBulk(section.bookId, section.chapter) || {};
      }
    }
    const els = [];
    const entries = [];

    const header = document.createElement('div');
    header.className = 'chapter-header';
    header.innerHTML = '<div class="chapter-emblem"></div><h2 class="chapter-title"></h2><p class="chapter-subtitle"></p>';
    this.base.renderChapterHeaderInto(header, section.bookId, section.chapter, section.bookName, verses);
    els.push(header);

    for (let i = 0; i < verses.length; i++) {
      const v = verses[i];
      const frag = this.base.renderTokenChapter([v], bionic, strength);
      const children = Array.from(frag.children);

      const headingCls = 'section-heading-container';
      for (const child of children) {
        if (child.classList.contains(headingCls)) {
          els.push(child);
        }
      }

      const container = children.find(el => el.classList.contains('verse-container') && !el.classList.contains('section-heading-container'));
      if (container) {
        container.dataset.verseIndex = i;
        if (!paragraphMode) {
          container.classList.add('dimmed-verse');
        }
        const refs = bulkRefs[v.verse] || null;
        if (refs && refs.length > 0 && state.get('crossRefs')) {
          this.base._addCrossRefIndicator(container, v.verse);
        }
        els.push(container);
        entries.push({
          key: section.key,
          bookId: section.bookId,
          chapter: section.chapter,
          verse: v.verse,
          headingOnly: this.base._isHeadingOnly(v),
          container
        });
      }
    }
    section.els = els;
    section.firstEl = els.length ? els[0] : null;
    return { els, entries };
  }

  _studyFlags() {
    const state = this.bridge.state;
    return {
      wordClasses: state.get('wordClasses') === true,
      clearReading: state.get('clearReadingEnabled') === true,
      wordStudy: state.get('wordStudyEnabled') === true,
      verseTopics: state.get('verseTopicsEnabled') === true
    };
  }

  _hasStudyFeatures() {
    const f = this._studyFlags();
    return f.wordClasses || f.clearReading || f.wordStudy || f.verseTopics;
  }

  // Paint any study spans already resolved on the cached window verse copies
  // (e.g. carried over from a prior scroll session) onto the live DOM.
  _applyResolvedAnnotations(section, root) {
    const state = this.bridge.state;
    if (state.get('currentTranslation') !== 'BSB' && state.get('verseTopicsEnabled') !== true) return;
    if (!this._hasStudyFeatures()) return;
    const verses = this._window.peekVerses(section.key);
    if (!verses || !verses.length) return;
    const tr = this.base._tokenRenderer;
    if (!tr || typeof tr.applyAnnotationsToDom !== 'function') return;
    tr.applyAnnotationsToDom(verses, this._studyFlags(), root);
  }

  // Enrich the cached window verse copies for a section with study spans and
  // stream them onto the live DOM once resolved — mirrors
  // ContinuousScroller._maybeEnrichSection so spotlight continuous behaves
  // like scroll continuous instead of relying on the global path that only
  // reaches nav.currentVerses.
  _maybeEnrichSection(section, root) {
    const state = this.bridge.state;
    if (state.get('currentTranslation') !== 'BSB' && state.get('verseTopicsEnabled') !== true) return;
    if (!this._hasStudyFeatures()) return;
    const verses = this._window.peekVerses(section.key);
    if (!verses || !verses.length) return;
    const nav = this.bridge.get('navigation');
    if (!nav || typeof nav._applyEnrichment !== 'function') return;
    nav._applyEnrichment(section.bookId, section.chapter, verses, null).then(did => {
      if (!did) return;
      if (!this._window || !this._window.sections.includes(section)) return;
      const tr = this.base._tokenRenderer;
      if (!tr || typeof tr.applyAnnotationsToDom !== 'function') return;
      tr.applyAnnotationsToDom(verses, this._studyFlags(), root);
    }).catch(() => {});
  }

  _advanceContinuous(direction) {
    const entries = this._verseEntries;
    if (!entries.length) return;
    const dir = direction === 'next' ? 1 : -1;
    let i = this._activeEntryIndex;
    if (i < 0) i = dir === 'next' ? -1 : entries.length;
    for (;;) {
      i += dir;
      if (i < 0 || i >= entries.length) {
        this._crossWindowEdge(direction);
        return;
      }
      if (!entries[i].headingOnly) break;
    }
    this._activeEntryIndex = i;
    this._setActiveEntry(entries[i]);
  }

  _setActiveEntry(entry) {
    const state = this.bridge.state;
    const _rp = (key, def) => {
      const raw = state.get(key);
      if (raw !== 'skin' || !window.UISkins) return raw;
      const skin = UISkins.getActive();
      if (skin && key in (skin.preferences || {})) return skin.preferences[key];
      return UISkins._builtinDefaults[key] !== undefined ? UISkins._builtinDefaults[key] : def;
    };
    const paragraphMode = _rp('paragraphMode', false);

    if (entry.key !== this._activeKey) {
      const bookName = this._window.bookName(entry.bookId);
      const verses = this._window.peekVerses(entry.key) || [];
      window.verseManager.setPassivePosition(entry.bookId, entry.chapter, entry.verse, bookName);
      const nav = this.bridge.get('navigation');
      if (nav && verses.length) nav.currentVerses = verses;
      const nh = this.bridge.get('navigation-history');
      if (nh) nh.record(entry.bookId, entry.chapter, entry.verse, bookName);
      this._activeKey = entry.key;
      this.base.applyBookmarks(entry.bookId, entry.chapter);
      const hm = this.bridge.get('highlight-manager');
      if (hm) hm.renderHighlightsForChapter(entry.bookId, entry.chapter);
    } else if (entry.verse !== state.get('currentVerse')) {
      window.verseManager.setPassive(entry.verse);
    }

    if (paragraphMode) {
      this.base.updateFocusedVerse(entry.verse, { book: entry.bookId, chapter: entry.chapter });
    } else {
      const oldEl = document.querySelector('.verse-container.active-verse');
      if (oldEl && oldEl !== entry.container) {
        oldEl.style.transition = 'none';
        oldEl.classList.remove('active-verse');
        oldEl.classList.add('dimmed-verse');
      }
      document.querySelectorAll('.verse-container.focused').forEach(el => {
        el.style.transition = 'none';
        el.classList.remove('focused');
      });

      void document.body.offsetHeight;

      if (oldEl && oldEl !== entry.container) oldEl.style.transition = '';
      document.querySelectorAll('.verse-container.dimmed-verse').forEach(el => {
        el.style.transition = '';
      });

      entry.container.classList.remove('dimmed-verse');
      entry.container.classList.add('active-verse');
      entry.container.classList.add('focused');
    }

    this.base.updateProgress(entry.verse);

    if (!document.body.classList.contains('split-mode')) {
      const vm = this.bridge.get('view-manager');
      if (vm) vm.scrollToVerse(entry.verse, { book: entry.bookId, chapter: entry.chapter });
    }
  }

  async _crossWindowEdge(dir) {
    if (this._building || !this._window) return;
    this._building = true;
    try {
      const sections = this._window.sections;
      const edge = dir === 'next' ? sections[sections.length - 1] : sections[0];
      if (!edge) return;
      const adj = await this._window.getAdjacent(edge.bookId, edge.chapter, dir);
      if (!adj) return;
      await this._window.loadVerses(adj.bookId, adj.chapter);

      const content = document.getElementById('content');
      if (!content) return;
      const state = this.bridge.state;
      const _rp = (key, def) => {
        const raw = state.get(key);
        if (raw !== 'skin' || !window.UISkins) return raw;
        const skin = UISkins.getActive();
        if (skin && key in (skin.preferences || {})) return skin.preferences[key];
        return UISkins._builtinDefaults[key] !== undefined ? UISkins._builtinDefaults[key] : def;
      };
      const paragraphMode = _rp('paragraphMode', false);
      const bionic = state.get('bionic');
      const strength = state.get('bionicStrength');

      const anchorEntry = this._verseEntries[this._activeEntryIndex];
      const anchorEl = anchorEntry ? anchorEntry.container : null;
      const before = anchorEl ? anchorEl.getBoundingClientRect().top : 0;

      const section = {
        key: ChapterWindow.key(adj.bookId, adj.chapter),
        bookId: adj.bookId,
        chapter: adj.chapter,
        bookName: this._window.bookName(adj.bookId),
        firstEl: null,
        els: null
      };
      const { els, entries } = this._buildSectionEntries(section, bionic, strength, paragraphMode);

      const spacer = content.querySelector(':scope > .scroll-bottom-spacer');
      if (dir === 'next') {
        this._window.sections.push(section);
        this._verseEntries.push(...entries);
        for (const el of els) {
          if (spacer) content.insertBefore(el, spacer);
          else content.appendChild(el);
        }
      } else {
        this._window.sections.unshift(section);
        this._verseEntries.unshift(...entries);
        this._activeEntryIndex += entries.length;
        const refEl = this._window.sections[1] ? this._window.sections[1].firstEl : null;
        for (const el of els) {
          if (refEl && refEl.parentNode === content) content.insertBefore(el, refEl);
          else if (spacer) content.insertBefore(el, spacer);
          else content.appendChild(el);
        }
      }

      this._applyResolvedAnnotations(section, content);
      this._maybeEnrichSection(section, content);

      if (this._window.sections.length > 3) {
        const far = dir === 'next' ? this._window.sections.shift() : this._window.sections.pop();
        const farCount = this._verseEntries.filter(e => e.key === far.key).length;
        this._verseEntries = this._verseEntries.filter(e => e.key !== far.key);
        if (dir === 'next') this._activeEntryIndex -= farCount;
        for (const el of (far.els || [])) el.remove();
      }

      if (anchorEl) {
        const delta = anchorEl.getBoundingClientRect().top - before;
        this._adjustScroll(content, delta);
      }

      const target = dir === 'next'
        ? entries.find(e => !e.headingOnly)
        : [...entries].reverse().find(e => !e.headingOnly);
      if (target) {
        this._activeEntryIndex = this._verseEntries.indexOf(target);
        this._setActiveEntry(target);
      }

      this._syncTailSpacer(content);
      this._notifyDomChanged();
    } finally {
      this._building = false;
    }
  }

  _adjustScroll(content, delta) {
    if (!delta) return;
    const saved = content.style.scrollBehavior;
    content.style.scrollBehavior = 'auto';
    content.scrollTop += delta;
    content.style.scrollBehavior = saved;
  }

  async _syncTailSpacer(content) {
    const existing = content.querySelector(':scope > .scroll-bottom-spacer');
    const sections = this._window ? this._window.sections : [];
    const last = sections[sections.length - 1];
    const isEnd = last ? await this._window.isLastSection(last) : false;
    if (isEnd) {
      if (!existing) {
        const spacer = document.createElement('div');
        spacer.className = 'scroll-bottom-spacer';
        spacer.style.height = '25svh';
        content.appendChild(spacer);
      }
    } else if (existing) {
      existing.remove();
    }
  }

  _notifyDomChanged() {
    const rm = this.bridge.get('render-manager');
    const sw = rm && rm._scrollSwitcher;
    if (sw && typeof sw.refreshElements === 'function') sw.refreshElements();
  }

  moveToNeighbor(dir) {
    if (!this._isContinuous() || !this._window || !this._verseEntries.length) return false;
    const idx = this._window.sections.findIndex(s => s.key === this._activeKey);
    if (idx < 0) return false;
    const targetIdx = dir === 'next' ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= this._window.sections.length) return false;
    const targetKey = this._window.sections[targetIdx].key;
    const entry = dir === 'next'
      ? this._verseEntries.find(e => e.key === targetKey && !e.headingOnly)
      : [...this._verseEntries].reverse().find(e => e.key === targetKey && !e.headingOnly);
    if (!entry) return false;
    this._activeEntryIndex = this._verseEntries.indexOf(entry);
    this._setActiveEntry(entry);
    return true;
  }

  _renderAll(verses, bionic, strength) {
    const content = document.getElementById('content');
    content.classList.add('spotlight-mode');
    content.classList.remove('swipe-mode', 'speed-mode');

    const state = this.bridge.state;
    const bookId = state.get('currentBook');
    const chapter = state.get('currentChapter');
    const _rp = (key, def) => {
      const raw = state.get(key);
      if (raw !== 'skin' || !window.UISkins) return raw;
      const skin = UISkins.getActive();
      if (skin && key in (skin.preferences || {})) return skin.preferences[key];
      return UISkins._builtinDefaults[key] !== undefined ? UISkins._builtinDefaults[key] : def;
    };
    const paragraphMode = _rp('paragraphMode', false);

    let bulkRefs = {};
    if (state.get('crossRefs')) {
      this.base._currentBookId = bookId;
      this.base._currentChapter = chapter;
      const cr = this.bridge.get('cross-references');
      if (cr && cr.enabled) {
        bulkRefs = cr.getRefsBulk(bookId, chapter) || {};
      }
    }

    for (let i = 0; i < verses.length; i++) {
      const v = verses[i];
      const frag = this.base.renderTokenChapter([v], bionic, strength);
      const children = Array.from(frag.children);

      const headingCls = 'section-heading-container';
      for (const child of children) {
        if (child.classList.contains(headingCls)) {
          content.appendChild(child);
        }
      }

      const container = children.find(el => el.classList.contains('verse-container') && !el.classList.contains('section-heading-container'));
      if (container) {
        container.dataset.verseIndex = i;

        if (!paragraphMode) {
          if (i === this.currentVerseIndex) {
            container.classList.add('active-verse');
          } else {
            container.classList.add('dimmed-verse');
          }
        }

        const refs = bulkRefs[v.verse] || null;
        if (refs && refs.length > 0 && state.get('crossRefs')) {
          this.base._addCrossRefIndicator(container, v.verse);
        }
        content.appendChild(container);
      }
    }

    const spacer = document.createElement('div');
    spacer.className = 'scroll-bottom-spacer';
    spacer.style.height = '25svh';
    content.appendChild(spacer);

    if (paragraphMode) {
      this.base.updateFocusedVerse(verses[this.currentVerseIndex]?.verse);
    }

    const vCurrent = verses[this.currentVerseIndex];
    if (vCurrent && vCurrent.verse !== this.bridge.state.get('currentVerse')) {
      window.verseManager.setPassive(vCurrent.verse);
    }

    this.base.updateProgress(vCurrent?.verse);
    this.base.showChapterHeader(verses, state.get('currentBookName'));
  }

  setActiveVerse(verses, index) {
    const state = this.bridge.state;
    const _rp = (key, def) => {
      const raw = state.get(key);
      if (raw !== 'skin' || !window.UISkins) return raw;
      const skin = UISkins.getActive();
      if (skin && key in (skin.preferences || {})) return skin.preferences[key];
      return UISkins._builtinDefaults[key] !== undefined ? UISkins._builtinDefaults[key] : def;
    };
    const paragraphMode = _rp('paragraphMode', false);

    let newEl = null;

    if (paragraphMode) {
      this.base.updateFocusedVerse(verses[index]?.verse);
      newEl = document.querySelector(`.verse-container.focused`);
    } else {
      // Deactivate old verse instantly (no CSS transition flash)
      const oldEl = document.querySelector('.verse-container.active-verse');
      if (oldEl) {
        oldEl.style.transition = 'none';
        oldEl.classList.remove('active-verse');
        oldEl.classList.add('dimmed-verse');
      }
      document.querySelectorAll('.verse-container.focused').forEach(el => {
        el.style.transition = 'none';
        el.classList.remove('focused');
      });

      // Force style flush so deactivation takes effect before activating new verse
      void document.body.offsetHeight;

      // Restore transitions on deactivated elements
      if (oldEl) oldEl.style.transition = '';
      document.querySelectorAll('.verse-container.dimmed-verse').forEach(el => {
        el.style.transition = '';
      });

      newEl = document.querySelector(`.verse-container[data-verse-index="${index}"]`);
      if (newEl) {
        newEl.classList.remove('dimmed-verse');
        newEl.classList.add('active-verse');
        newEl.classList.add('focused');
      }
    }

    this.base.updateProgress(verses[index]?.verse);

    const v = verses[index];
    if (v && v.verse !== state.get('currentVerse')) {
      window.verseManager.setPassive(v.verse);
    }

    if (!document.body.classList.contains('split-mode')) {
      const vm = this.bridge.get('view-manager');
      if (vm) {
        vm.scrollToVerse(verses[index]?.verse);
      }
    }
  }

  goToVerse(verses, verseNum) {
    if (this._isContinuous() && this._verseEntries.length) {
      const entry = this._verseEntries.find(e => e.key === this._activeKey && e.verse === verseNum);
      if (!entry) return;
      this._activeEntryIndex = this._verseEntries.indexOf(entry);
      this._setActiveEntry(entry);
      return;
    }
    const idx = verses.findIndex(v => v.verse === verseNum);
    if (idx < 0) return;
    this.currentVerseIndex = idx;
    this.setActiveVerse(verses, idx);
  }

  advance(verses, direction) {
    if (this._isContinuous() && this._verseEntries.length) {
      this._advanceContinuous(direction);
      return;
    }
    if (direction === 'next') {
      let next = this.currentVerseIndex;
      do {
        if (next < verses.length - 1) {
          next++;
        } else {
          this.bridge.emit('nav:advance-chapter', { direction: 'next' });
          return;
        }
      } while (this.base._isHeadingOnly(verses[next]));
      this.currentVerseIndex = next;
      this.setActiveVerse(verses, this.currentVerseIndex);
    } else {
      let prev = this.currentVerseIndex;
      do {
        if (prev > 0) {
          prev--;
        } else {
          this.bridge.emit('nav:advance-chapter', { direction: 'prev' });
          return;
        }
      } while (this.base._isHeadingOnly(verses[prev]));
      this.currentVerseIndex = prev;
      this.setActiveVerse(verses, this.currentVerseIndex);
    }
  }
};
