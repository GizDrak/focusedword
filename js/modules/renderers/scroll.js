window.ScrollRenderer = class ScrollRenderer {
  constructor(bridge, base) {
    this.bridge = bridge;
    this.base = base;
  }

  render(verses) {
    const state = this.bridge.state;
    const bionic = state.get('bionic');
    const strength = state.get('bionicStrength');

    document.body.classList.add('scroll-mode');

    const content = this.base.clearContent();
    content.classList.remove('swipe-mode', 'spotlight-mode', 'speed-mode');

    this.base.showChapterHeader(verses, state.get('currentBookName'));

    for (const v of verses) {
      content.appendChild(this.base.createVerseElement(v, bionic, strength));
    }

    this.base.showSpeedControls(false);
    this.base.applyBookmarks();
    this.base.renderHighlights();
    this.base.updateFocusedVerse(state.get('currentVerse'));
    this.bridge.call('navigation', 'scrollToVerse');
    this._setupScrollTracking();
  }

  _setupScrollTracking() {
    if (this._scrollHandler) {
      this._scrollTarget.removeEventListener('scroll', this._scrollHandler, { passive: true });
    }
    this._scrollTarget = document.getElementById('content');
    if (!this._scrollTarget) return;
    this._scrollHandler = () => {
      if (this._scrollRaf) return;
      this._scrollRaf = requestAnimationFrame(() => {
        this._scrollRaf = null;
        this._syncVerseFromScroll();
      });
    };
    this._lastSyncVerse = null;
    this._scrollTarget.addEventListener('scroll', this._scrollHandler, { passive: true });
  }

  _syncVerseFromScroll() {
    const containers = document.querySelectorAll('.verse-container');
    if (!containers.length) return;

    const viewportMid = window.innerHeight / 2;
    let active = null;
    let minDist = Infinity;

    for (const c of containers) {
      const rect = c.getBoundingClientRect();
      const verseMid = (rect.top + rect.bottom) / 2;
      const dist = Math.abs(verseMid - viewportMid);
      if (dist < minDist) {
        minDist = dist;
        active = parseInt(c.dataset.verse);
      }
    }
    if (active !== null && active !== this._lastSyncVerse) {
      this._lastSyncVerse = active;
      this.bridge.state.set('currentVerse', active);
      this.base.updateFocusedVerse(active);
    }
  }
};
