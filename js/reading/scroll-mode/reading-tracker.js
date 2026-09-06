window.ReadingTracker = class ReadingTracker {
  constructor(options) {
    this._options = options;
    this._selector = options.selector;
    this._highlightLine = options.highlightLine !== false;
    this._onPosition = options.onPosition || null;
    this._firstBlockSingleLine = options.firstBlockSingleLine || false;

    const ua = navigator.userAgent;
    this._isIOS = /iPad|iPhone|iPod/.test(ua);
    this._isAndroid = /Android/.test(ua);
    this._isTouch = 'ontouchstart' in window;
    this._useRangeFromPoint = this._isIOS || !document.caretPositionFromPoint;

    this._scrollTarget = options.scrollTarget ?? null;

    this._blockResolver = null;
    this._highlightRenderer = null;
    this._rafId = null;
    this._onTick = null;
    this._onResize = null;
    this._onOrientation = null;
    this._running = false;
  }

  getVH() {
    if (this._isAndroid && window.visualViewport) {
      return window.visualViewport.height;
    }
    return window.innerHeight;
  }

  _getScrollY() {
    return this._scrollTarget
      ? this._scrollTarget.scrollTop
      : window.scrollY;
  }

  _getScrollHeight() {
    return this._scrollTarget
      ? this._scrollTarget.scrollHeight
      : document.documentElement.scrollHeight;
  }

  start() {
    if (this._running) return;
    this._running = true;

    this._blockResolver = new window.BlockResolver(this._selector, {
      firstBlockSingleLine: this._firstBlockSingleLine,
      scrollTarget: this._scrollTarget
    });
    this._blockResolver.start();

    this._highlightRenderer = new window.HighlightRenderer();

    this._onTick = () => {
      if (!this._running) return;
      if (this._rafId) return;
      this._rafId = requestAnimationFrame(() => {
        this._rafId = null;
        if (!this._running) return;
        this._tick();
      });
    };

    const scrollEl = this._scrollTarget ?? window;
    scrollEl.addEventListener('scroll', this._onTick, { passive: true });

    if (this._isTouch) {
      document.addEventListener('touchmove', this._onTick, { passive: true });
    }

    if (this._isAndroid) {
      this._onResize = this._onTick;
      window.visualViewport?.addEventListener('resize', this._onResize);
    }

    this._onOrientation = () => {
      requestAnimationFrame(() => {
        if (!this._running) return;
        this._blockResolver.start();
        this._tick();
      });
    };
    window.addEventListener('orientationchange', this._onOrientation);

    this._tick();
  }

  _tick() {
    if (!this._running) return;

    const scrollY = this._getScrollY();
    const vh = this.getVH();
    const docH = this._getScrollHeight();
    const bandY = BandEngine.getReadingBandY(scrollY, vh, docH);

    const containers = this._blockResolver.getElements();
    const verseEl = containers.length
      ? CharResolver.findActiveVerse(containers, bandY)
      : null;

    const pos = CharResolver.resolveCharPosition(bandY, this._useRangeFromPoint);

    if (pos) {
      const lineRange = CharResolver.getLineRange(pos.node, pos.offset);
      if (lineRange && this._highlightLine) {
        this._highlightRenderer.highlight(lineRange);
      }
    }

    if (this._onPosition) {
      this._onPosition({
        verseEl,
        node: pos ? pos.node : null,
        offset: pos ? pos.offset : null,
        bandY
      });
    }
  }

  updateFirstBlockHint(isSingleLine) {
    this._firstBlockSingleLine = isSingleLine;
    if (this._blockResolver) {
      this._blockResolver.updateFirstBlockHint(isSingleLine);
    }
  }

  refreshElements() {
    if (this._blockResolver) {
      this._blockResolver.refresh();
    }
  }

  stop() {
    this._running = false;

    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    if (this._blockResolver) {
      this._blockResolver.destroy();
      this._blockResolver = null;
    }

    if (this._highlightRenderer) {
      this._highlightRenderer.destroy();
      this._highlightRenderer = null;
    }

    if (this._onTick) {
      const scrollEl = this._scrollTarget ?? window;
      scrollEl.removeEventListener('scroll', this._onTick, { passive: true });

      if (this._isTouch) {
        document.removeEventListener('touchmove', this._onTick, { passive: true });
      }
    }
    this._onTick = null;

    if (this._onResize) {
      window.visualViewport?.removeEventListener('resize', this._onResize);
      this._onResize = null;
    }

    if (this._onOrientation) {
      window.removeEventListener('orientationchange', this._onOrientation);
      this._onOrientation = null;
    }

    this._onPosition = null;
  }
};
