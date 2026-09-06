window.ScrollModeSwitcher = class ScrollModeSwitcher {
  constructor(options) {
    this._mode = options.mode || 'new';
    this._selector = options.selector;
    this._onPosition = options.onPosition || null;
    this._reader = null;
    this._bridge = options.bridge || null;
    this._running = false;
    this._firstBlockSingleLine = options.firstBlockSingleLine || false;
    this._scrollTarget = options.scrollTarget || null;
  }

  start() {
    if (this._running) return;
    this._running = true;

    if (this._mode !== 'new') return;

    const sr = this._bridge?.get('renderer-scroll');
    if (sr && !sr._scrollTrackingDisabled) {
      sr.disableScrollTracking();
    }

    this._reader = new window.ReadingTracker({
      selector: this._selector,
      highlightLine: false,
      firstBlockSingleLine: this._firstBlockSingleLine,
      scrollTarget: this._scrollTarget,
      onPosition: (pos) => {
        if (!this._bridge || !pos || !pos.verseEl) return;
        if (this._skipTick > 0) { this._skipTick--; return; }
        const num = parseInt(pos.verseEl.dataset.verse, 10);
        if (!num) return;
        const state = this._bridge.state;
        const book = pos.verseEl.dataset.book != null ? parseInt(pos.verseEl.dataset.book, 10) : null;
        const chapter = pos.verseEl.dataset.chapter != null ? parseInt(pos.verseEl.dataset.chapter, 10) : null;
        const crossed = book != null && chapter != null &&
          (book !== state.get('currentBook') || chapter !== state.get('currentChapter'));
        if (crossed) {
          const nav = this._bridge.get('navigation');
          const bookEntry = nav && nav.booksCache ? nav.booksCache.find(b => b.id === book) : null;
          const bookName = bookEntry ? bookEntry.name : '';
          window.verseManager.setPassivePosition(book, chapter, num, bookName);
          // Bookkeeping only when the passive update landed (verse manager
          // ignores updates while an intentional navigation holds the lock).
          if (state.get('currentBook') === book && state.get('currentChapter') === chapter) {
            const sr = this._bridge.get('renderer-scroll');
            const verses = sr && sr.continuousWindow
              ? sr.continuousWindow.peekVerses(book + ':' + chapter)
              : null;
            if (nav && verses && verses.length) nav.currentVerses = verses;
            const nh = this._bridge.get('navigation-history');
            if (nh) nh.record(book, chapter, num, bookName);
          }
        } else if (num !== state.get('currentVerse')) {
          window.verseManager.setPassive(num);
        }
        const base = this._bridge.get('base-renderer');
        if (base) base.updateFocusedVerse(num, crossed ? { book, chapter } : null);
      }
    });
    this._skipTick = 3;
    this._reader.start();
    const dec = () => {
      if (this._skipTick > 0) {
        this._skipTick--;
        requestAnimationFrame(dec);
      }
    };
    requestAnimationFrame(dec);
  }

  updateFirstBlockHint(isSingleLine) {
    this._firstBlockSingleLine = isSingleLine;
    if (this._reader) {
      this._reader.updateFirstBlockHint(isSingleLine);
    }
  }

  refreshElements() {
    if (this._reader) {
      this._reader.refreshElements();
    }
  }

  stop(opts = {}) {
    const restoreLegacyTracking = opts.restoreLegacyTracking !== false;
    this._running = false;
    if (this._reader) {
      this._reader.stop();
      this._reader = null;
    }
    if (restoreLegacyTracking && this._bridge) {
      const sr = this._bridge.get('renderer-scroll');
      if (!sr) return;
      const state = this._bridge.state;
      if (state.get('spotlightMode') || state.get('swipeMode') || state.get('speedMode') || state.get('splitMode')) {
        return;
      }
      sr.enableScrollTracking();
    }
  }

  switchTo(mode) {
    const wasRunning = this._running;
    this.stop();
    this._mode = mode;

    if (this._bridge && mode === 'new') {
      const sr = this._bridge.get('renderer-scroll');
      if (sr) sr.disableScrollTracking();
    }

    if (wasRunning) this.start();
  }

  getActiveMode() {
    return this._mode;
  }

  isRunning() {
    return this._running;
  }

  destroy() {
    this.stop();
    this._bridge = null;
  }
};
