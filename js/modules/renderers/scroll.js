window.ScrollRenderer = class ScrollRenderer {
  constructor(bridge, base) {
    this.bridge = bridge;
    this.base = base;
  }

  async render(verses) {
    this._pendingRender = true;
    const state = this.bridge.state;
    const content = document.getElementById('content');
    await this._renderVerses(verses, content);
    if (!this._scrollTrackingDisabled) {
      this._setupScrollTracking();
    }
  }

  async _renderVerses(verses, content) {
    if (!verses.length) return;
    const state = this.bridge.state;
    const settings = this.base._getSettings();
    const bookId = state.get('currentBook');
    const chapter = state.get('currentChapter');
    const bionic = state.get('bionic');
    const strength = state.get('bionicStrength');

    let bulkRefs = {};
    if (state.get('crossRefs')) {
      this.base._currentBookId = bookId;
      this.base._currentChapter = chapter;
      const cr = this.bridge.get('cross-references');
      if (cr && cr.enabled) {
        bulkRefs = cr.getRefsBulk(bookId, chapter) || {};
      }
    }

    const frag = this.base.renderTokenChapter(verses, bionic, strength, settings);
    this.base._addCrossRefIndicators(frag, bulkRefs);
    content.appendChild(frag);

    this._appendBottomNav(content);

    await new Promise(r => requestAnimationFrame(r));
    if (content.scrollHeight > content.clientHeight + 5) {
      const spacer = document.createElement('div');
      spacer.className = 'scroll-bottom-spacer';
      spacer.style.height = '25svh';
      content.appendChild(spacer);
    }
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

  disableScrollTracking() {
    this._scrollTrackingDisabled = true;
    if (this._scrollHandler && this._scrollTarget) {
      this._scrollTarget.removeEventListener('scroll', this._scrollHandler, { passive: true });
      this._scrollHandler = null;
    }
  }

  enableScrollTracking() {
    this._scrollTrackingDisabled = false;
    this._setupScrollTracking();
  }

  onRenderComplete() {
    setTimeout(() => { this._pendingRender = false; }, 400);
  }

  async _appendBottomNav(content) {
    const existing = content.querySelector('.chapter-bottom-nav');
    if (existing) existing.remove();

    const state = this.bridge.state;
    const nav = this.bridge.get('navigation');
    if (!nav) return;

    const bookId = state.get('currentBook');
    const chapter = state.get('currentChapter');
    const book = nav.booksCache.find(b => b.id === bookId);
    const bookIndex = nav.booksCache.indexOf(book);
    const totalChapters = await this.bridge.db.getChapterCount(bookId);

    const wrap = document.createElement('div');
    wrap.className = 'chapter-bottom-nav';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'chapter-bottom-arrow';
    prevBtn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';
    prevBtn.setAttribute('aria-label', 'Previous chapter');
    if (bookIndex === 0 && chapter <= 1) prevBtn.disabled = true;
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      nav.loadPrevChapter();
    });

    const label = document.createElement('span');
    label.className = 'chapter-bottom-label';
    label.textContent = (book ? book.name : '') + ' ' + chapter;

    const nextBtn = document.createElement('button');
    nextBtn.className = 'chapter-bottom-arrow';
    nextBtn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';
    nextBtn.setAttribute('aria-label', 'Next chapter');
    if (bookIndex === nav.booksCache.length - 1 && chapter >= totalChapters) nextBtn.disabled = true;
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      nav.loadNextChapter();
    });

    wrap.appendChild(prevBtn);
    wrap.appendChild(label);
    wrap.appendChild(nextBtn);
    content.appendChild(wrap);
  }

  _syncVerseFromScroll() {
    if (this._pendingRender) return;
    if (document.body.classList.contains('paragraph-mode')) return;
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
      window.verseManager.setPassive(active);
      this.base.updateFocusedVerse(active);
    }
  }
};
