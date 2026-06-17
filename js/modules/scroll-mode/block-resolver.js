window.BlockResolver = class BlockResolver {
  constructor(selector, options) {
    this._selector = selector;
    this._options = options || {};
    this._elements = [];
    this._scrollTarget = options.scrollTarget ?? null;
    this._isAndroid = /Android/.test(navigator.userAgent);
    this._firstBlockSingleLine = false;
    this._firstBlockThreshold = 0;
    this._onVVResize = null;
    this._onOrientationChange = null;
  }

  _getVH() {
    if (this._isAndroid && window.visualViewport) {
      return window.visualViewport.height;
    }
    return window.innerHeight;
  }

  start() {
    this._elements = Array.from(document.querySelectorAll(this._selector));
    this._detectFirstBlock();

    let _vvResizeTimer = null;
    this._onVVResize = () => {
      clearTimeout(_vvResizeTimer);
      _vvResizeTimer = setTimeout(() => this._detectFirstBlock(), 150);
    };
    this._onOrientationChange = () => {
      requestAnimationFrame(() => this._detectFirstBlock());
    };
    if (this._isAndroid && window.visualViewport) {
      window.visualViewport.addEventListener('resize', this._onVVResize);
    }
    window.addEventListener('orientationchange', this._onOrientationChange);
  }

  _detectFirstBlock() {
    if (!this._elements || this._elements.length === 0) return;

    const first = this._elements[0];
    if (!first) return;

    const lineHeight = parseFloat(getComputedStyle(first).lineHeight) || 24;
    const blockHeight = first.getBoundingClientRect().height;
    const renderedSingleLine = blockHeight <= lineHeight * 1.5;

    this._firstBlockSingleLine = this._options.firstBlockSingleLine || renderedSingleLine;
    this._firstBlockThreshold = this._firstBlockSingleLine
      ? this._getVH() * 0.25
      : lineHeight * 2;
  }

  getElements() {
    return this._elements;
  }

  isInTopZone(scrollY) {
    return scrollY <= this._firstBlockThreshold;
  }

  updateFirstBlockHint(isSingleLine) {
    this._firstBlockSingleLine = isSingleLine;
    if (this._elements[0]) {
      const lineHeight = parseFloat(getComputedStyle(this._elements[0]).lineHeight) || 24;
      this._firstBlockThreshold = isSingleLine
        ? this._getVH() * 0.25
        : lineHeight * 2;
    }
  }

  destroy() {
    if (this._onVVResize) {
      if (this._isAndroid && window.visualViewport) {
        window.visualViewport.removeEventListener('resize', this._onVVResize);
      }
      this._onVVResize = null;
    }
    if (this._onOrientationChange) {
      window.removeEventListener('orientationchange', this._onOrientationChange);
      this._onOrientationChange = null;
    }
    this._elements = [];
  }
};
