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
        if (this._skipTick) { this._skipTick = false; return; }
        const num = parseInt(pos.verseEl.dataset.verse, 10);
        if (num && num !== this._bridge.state.get('currentVerse')) {
          window.verseManager.setPassive(num);
          const base = this._bridge.get('base-renderer');
          if (base) base.updateFocusedVerse(num);
        }
      }
    });
    this._skipTick = true;
    this._reader.start();
    this._skipTick = false;
  }

  updateFirstBlockHint(isSingleLine) {
    this._firstBlockSingleLine = isSingleLine;
    if (this._reader) {
      this._reader.updateFirstBlockHint(isSingleLine);
    }
  }

  stop() {
    this._running = false;
    if (this._reader) {
      this._reader.stop();
      this._reader = null;
    }
    if (this._bridge) {
      const sr = this._bridge.get('renderer-scroll');
      if (sr) {
        sr.enableScrollTracking();
      }
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
