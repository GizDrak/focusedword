window.ContinuousScroller = class ContinuousScroller {
  constructor(bridge, base) {
    this.bridge = bridge;
    this.base = base;
    this.window = new window.ChapterWindow(bridge);
    this._sectionEls = new Map();
    this._activeKey = null;
    this._building = false;
    this._gen = 0;
    this._syncQueued = false;

    this._unsubs = [
      bridge.state.onChange(['currentBook', 'currentChapter'], () => this._queueWindowSync()),
      bridge.state.onChange('continuousChapters', (_, val) => {
        if (val === false) {
          this._sectionEls.clear();
          this._activeKey = null;
        }
      })
    ];
  }

  _continuousOn() {
    const s = this.bridge.state;
    return s.get('continuousChapters') === true &&
      !s.get('swipeMode') && !s.get('spotlightMode') && !s.get('speedMode') && !s.get('splitMode');
  }

  async render() {
    const state = this.bridge.state;
    this._building = true;
    const gen = ++this._gen;
    try {
      const bookId = state.get('currentBook');
      const chapter = state.get('currentChapter');
      await this.window.setActive(bookId, chapter);
      if (gen !== this._gen) return;

      const content = document.getElementById('content');
      const toRemove = [];
      for (const c of content.children) {
        if (c.id !== 'chapter-header' && c.id !== 'speed-controls') toRemove.push(c);
      }
      for (const c of toRemove) c.remove();

      const persistentHeader = document.getElementById('chapter-header');
      if (persistentHeader) persistentHeader.classList.add('header-hidden');

      this._sectionEls.clear();
      for (const section of this.window.sections) {
        const el = this._buildSectionDOM(section);
        this._sectionEls.set(section.key, el);
        content.appendChild(el);
        this._afterSectionMounted(section, el);
      }
      this._activeKey = ChapterWindow.key(bookId, chapter);
      this._syncTailSpacer(content);
      this._notifyDomChanged();
    } finally {
      this._building = false;
    }
  }

  _buildSectionDOM(section) {
    const base = this.base;
    const state = this.bridge.state;
    const verses = this.window.peekVerses(section.key) || [];

    const sec = document.createElement('section');
    sec.className = 'chapter-section';
    sec.dataset.book = section.bookId;
    sec.dataset.chapter = section.chapter;
    sec.dataset.key = section.key;

    const header = document.createElement('div');
    header.className = 'chapter-header';
    header.innerHTML =
      '<div class="chapter-emblem"></div>' +
      '<h2 class="chapter-title"></h2>' +
      '<p class="chapter-subtitle"></p>';
    base.renderChapterHeaderInto(header, section.bookId, section.chapter, section.bookName, verses);
    sec.appendChild(header);

    const _rc = (key, def) => {
      const raw = state.get(key);
      if (raw !== 'skin' || !window.UISkins) return raw;
      const skin = UISkins.getActive();
      if (skin && key in (skin.preferences || {})) return skin.preferences[key];
      return UISkins._builtinDefaults[key] !== undefined ? UISkins._builtinDefaults[key] : def;
    };
    const bionic = _rc('bionic', false);
    const strength = _rc('bionicStrength', 0.45);

    let bulkRefs = {};
    if (_rc('crossRefs', false)) {
      const cr = this.bridge.get('cross-references');
      if (cr && cr.enabled) {
        bulkRefs = cr.getRefsBulk(section.bookId, section.chapter) || {};
      }
    }

    const frag = base.renderTokenChapter(verses, bionic, strength, base._getSettings());
    base._addCrossRefIndicators(frag, bulkRefs);
    this._applyResolvedAnnotations(section, frag);
    sec.appendChild(frag);
    return sec;
  }

  _afterSectionMounted(section, el) {
    const hm = this.bridge.get('highlight-manager');
    if (hm) hm.renderHighlightsForChapter(section.bookId, section.chapter);
    this.base.applyBookmarks(section.bookId, section.chapter);
    this._maybeEnrichSection(section, el);
  }

  _maybeEnrichSection(section, el) {
    const state = this.bridge.state;
    if (state.get('currentTranslation') !== 'BSB') return;
    if (!this._hasStudyFeatures()) return;
    const verses = this.window.peekVerses(section.key);
    if (!verses || !verses.length) return;
    const nav = this.bridge.get('navigation');
    if (!nav || typeof nav._applyEnrichment !== 'function') return;
    nav._applyEnrichment(section.bookId, section.chapter, verses, null).then(did => {
      if (!did) return;
      if (this._sectionEls.get(section.key) !== el) return;
      const tr = this.base._tokenRenderer;
      if (!tr || typeof tr.applyAnnotationsToDom !== 'function') return;
      // Streamed spans can rewrap verse text and change this section's height.
      // That lands after _applySections already pinned the scroll, so keep the
      // reading band pinned across the mutation.
      this._anchoredMutation(() => tr.applyAnnotationsToDom(verses, this._studyFlags(), el));
    }).catch(() => {});
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

  // Apply already-resolved study spans onto a section while it is still
  // detached from the DOM, so re-inserted chapters mount at their final height
  // instead of reflowing after the scroll anchor was computed. Spans ride on
  // the cached verse objects (attached by _applyEnrichment), so this is a
  // no-op for chapters whose spans are not resolved yet.
  _applyResolvedAnnotations(section, frag) {
    const state = this.bridge.state;
    if (state.get('currentTranslation') !== 'BSB') return;
    if (!this._hasStudyFeatures()) return;
    const verses = this.window.peekVerses(section.key);
    if (!verses || !verses.length) return;
    const tr = this.base._tokenRenderer;
    if (!tr || typeof tr.applyAnnotationsToDom !== 'function') return;
    tr.applyAnnotationsToDom(verses, this._studyFlags(), frag);
  }

  // Screen-space Y of the verse under the reading band, used to pin the
  // reading position across layout mutations that happen outside the
  // _applySections window (e.g. streamed study annotations).
  _readingAnchor() {
    const content = document.getElementById('content');
    if (!content) return null;
    const bandY = window.BandEngine.getReadingBandY(content.scrollTop, window.innerHeight, content.scrollHeight);
    const hit = document.elementFromPoint(window.innerWidth / 2, bandY);
    const verseEl = hit && hit.closest ? hit.closest('.verse-container') : null;
    if (verseEl && content.contains(verseEl)) return verseEl;
    const containers = content.querySelectorAll('.verse-container:not(.section-heading-container)');
    let active = containers.length ? containers[0] : null;
    for (const c of containers) {
      if (c.getBoundingClientRect().top <= bandY) active = c;
      else break;
    }
    return active;
  }

  _anchoredMutation(fn) {
    const content = document.getElementById('content');
    if (!content) {
      fn();
      return;
    }
    const anchor = this._readingAnchor();
    const before = anchor ? anchor.getBoundingClientRect().top : null;
    fn();
    if (!anchor || !anchor.isConnected || before == null) return;
    const delta = anchor.getBoundingClientRect().top - before;
    if (Math.abs(delta) >= 0.5) this._adjustScroll(content, delta);
  }

  async _syncTailSpacer(content) {
    const existing = content.querySelector(':scope > .scroll-bottom-spacer');
    const sections = this.window.sections;
    const last = sections[sections.length - 1];
    const isEnd = last ? await this.window.isLastSection(last) : false;
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

  _queueWindowSync() {
    if (this._building) return;
    if (!this._continuousOn()) return;
    if (this._syncQueued) return;
    this._syncQueued = true;
    requestAnimationFrame(() => {
      this._syncQueued = false;
      this._syncWindowToActive();
    });
  }

  async _syncWindowToActive() {
    const state = this.bridge.state;
    if (this._building || !this._continuousOn()) return;
    const bookId = state.get('currentBook');
    const chapter = state.get('currentChapter');
    const key = ChapterWindow.key(bookId, chapter);
    if (!this._sectionEls.has(key)) return;
    if (key === this._activeKey) return;

    const gen = ++this._gen;
    await this.window.setActive(bookId, chapter);
    if (gen !== this._gen || this._building) return;
    this._applySections(key);
  }

  _applySections(activeKey) {
    const content = document.getElementById('content');
    if (!content) return;

    const anchorEl = this._sectionEls.get(activeKey);
    const before = anchorEl ? anchorEl.getBoundingClientRect().top : 0;

    const windowKeys = new Set(this.window.sections.map(s => s.key));
    for (const [k, el] of Array.from(this._sectionEls)) {
      if (!windowKeys.has(k)) {
        el.remove();
        this._sectionEls.delete(k);
      }
    }

    for (let i = 0; i < this.window.sections.length; i++) {
      const section = this.window.sections[i];
      if (this._sectionEls.has(section.key)) continue;
      const el = this._buildSectionDOM(section);
      this._sectionEls.set(section.key, el);
      const nextSection = this.window.sections[i + 1];
      const nextEl = nextSection ? this._sectionEls.get(nextSection.key) : null;
      const spacer = content.querySelector(':scope > .scroll-bottom-spacer');
      if (nextEl) content.insertBefore(el, nextEl);
      else if (spacer) content.insertBefore(el, spacer);
      else content.appendChild(el);
      this._afterSectionMounted(section, el);
    }

    this._activeKey = activeKey;

    if (anchorEl) {
      const delta = anchorEl.getBoundingClientRect().top - before;
      this._adjustScroll(content, delta);
    }

    const nav = this.bridge.get('navigation');
    const verses = this.window.peekVerses(activeKey);
    if (nav && verses && verses.length && nav.currentVerses !== verses) {
      const first = verses[0];
      const cur = nav.currentVerses;
      if (!cur || !cur.length || !cur[0] || cur[0].book_id !== first.book_id || cur[0].chapter !== first.chapter) {
        nav.currentVerses = verses;
      }
    }

    this._syncTailSpacer(content);
    this._notifyDomChanged();
  }

  _adjustScroll(content, delta) {
    if (!delta) return;
    const saved = content.style.scrollBehavior;
    content.style.scrollBehavior = 'auto';
    content.scrollTop += delta;
    content.style.scrollBehavior = saved;
  }

  async moveToNeighbor(dir) {
    const state = this.bridge.state;
    if (!this._continuousOn()) return false;
    const adj = await this.window.getAdjacent(state.get('currentBook'), state.get('currentChapter'), dir);
    if (!adj) return false;
    const adjKey = ChapterWindow.key(adj.bookId, adj.chapter);

    if (!this._sectionEls.has(adjKey)) {
      const nav = this.bridge.get('navigation');
      if (!nav) return false;
      window.verseManager.setIntentional(1);
      if (dir === 'next') await nav.loadNextChapter();
      else await nav.loadPrevChapter();
      return true;
    }

    const bookName = this.window.bookName(adj.bookId);
    window.verseManager.setIntentional(1);
    state.batch({
      currentBook: adj.bookId,
      currentChapter: adj.chapter,
      currentVerse: 1,
      currentBookName: bookName
    });
    const nav = this.bridge.get('navigation');
    const verses = this.window.peekVerses(adjKey);
    if (nav && verses && verses.length) nav.currentVerses = verses;
    const nh = this.bridge.get('navigation-history');
    if (nh) nh.record(adj.bookId, adj.chapter, 1, bookName);

    await this._syncWindowToActive();
    window.verseManager.releaseLock();

    const vm = this.bridge.get('view-manager');
    if (vm) vm.scrollToReadingBand(1, { book: adj.bookId, chapter: adj.chapter });
    this.base.updateFocusedVerse(1, { book: adj.bookId, chapter: adj.chapter });
    return true;
  }

  _notifyDomChanged() {
    const rm = this.bridge.get('render-manager');
    const sw = rm && rm._scrollSwitcher;
    if (sw && typeof sw.refreshElements === 'function') sw.refreshElements();
  }

  destroy() {
    for (const unsub of this._unsubs) {
      try { unsub(); } catch (e) {}
    }
    this._unsubs = [];
    this._sectionEls.clear();
    this._activeKey = null;
  }
};
