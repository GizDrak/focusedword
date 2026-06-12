window.ScrollRenderer = class ScrollRenderer {
  constructor(bridge, base) {
    this.bridge = bridge;
    this.base = base;
  }

  render(verses) {
    this._pendingRender = true;
    const state = this.bridge.state;
    const bionic = state.get('bionic');
    const strength = state.get('bionicStrength');

    const content = document.getElementById('content');

    let bulkRefs = {};
    const bookId = state.get('currentBook');
    const chapter = state.get('currentChapter');

    if (state.get('crossRefs')) {
      this.base._currentBookId = bookId;
      this.base._currentChapter = chapter;
      if (bookId && chapter) {
        const cr = this.bridge.get('cross-references');
        if (cr && cr.enabled) {
          bulkRefs = cr.getRefsBulk(bookId, chapter) || {};
        }
      }
    }

    for (const v of verses) {
      const refs = bulkRefs[v.verse] || null;
      content.appendChild(this.base.createVerseElement(v, bionic, strength, refs));
    }

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
    this._lastSyncVerse = this.bridge.state.get('currentVerse');
    this._scrollTarget.addEventListener('scroll', this._scrollHandler, { passive: true });
  }

  onRenderComplete() {
    setTimeout(() => { this._pendingRender = false; }, 400);
  }

  _syncVerseFromScroll() {
    if (this._pendingRender) return;
    const containers = document.querySelectorAll('.verse-container');
    if (!containers.length) return;

    const scrollEl = this._scrollTarget;
    const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
    const scrollFraction = maxScroll > 0 ? scrollEl.scrollTop / maxScroll : 0;

    const viewportCenter = window.innerHeight / 2;
    const viewportBottom = window.innerHeight;
    const bottomWeight = Math.max(0, (scrollFraction - 0.88) / 0.12);
    const referencePoint = viewportCenter * (1 - bottomWeight) + viewportBottom * bottomWeight;

    let active = parseInt(containers[0].dataset.verse);
    for (let i = containers.length - 1; i >= 0; i--) {
      if (containers[i].getBoundingClientRect().top <= referencePoint) {
        active = parseInt(containers[i].dataset.verse);
        break;
      }
    }

    if (active !== this._lastSyncVerse) {
      this._lastSyncVerse = active;
      this.bridge.state.set('currentVerse', active);
      this.base.updateFocusedVerse(active);
    }
  }
};
