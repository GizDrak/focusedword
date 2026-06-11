window.SpotlightRenderer = class SpotlightRenderer {
  constructor(bridge, base) {
    this.bridge = bridge;
    this.base = base;
    this.currentVerseIndex = 0;
  }

  render(verses) {
    const state = this.bridge.state;
    const bionic = state.get('bionic');
    const strength = state.get('bionicStrength');

    this.bridge.state.set('spotlightMode', true);

    const idx = verses.findIndex(v => v.verse === state.get('currentVerse'));
    this.currentVerseIndex = idx >= 0 ? idx : 0;

    this._renderAll(verses, bionic, strength);
  }

  _renderAll(verses, bionic, strength) {
    const content = this.base.clearContent();
    content.classList.remove('swipe-mode', 'speed-mode');
    content.classList.add('spotlight-mode');

    let bulkRefs = {};
    const state = this.bridge.state;
    if (state.get('crossRefs')) {
      this.base._currentBookId = state.get('currentBook');
      this.base._currentChapter = state.get('currentChapter');
      const cr = this.bridge.get('cross-references');
      if (cr && cr.enabled) {
        bulkRefs = cr.getRefsBulk(state.get('currentBook'), state.get('currentChapter')) || {};
      }
    }

    for (let i = 0; i < verses.length; i++) {
      const v = verses[i];
      const refs = bulkRefs[v.verse] || null;
      const container = this.base.createVerseElement(v, bionic, strength, refs);
      container.dataset.verseIndex = i;

      if (i === this.currentVerseIndex) {
        container.classList.add('active-verse');
      } else {
        container.classList.add('dimmed-verse');
      }

      content.appendChild(container);
    }

    const vCurrent = verses[this.currentVerseIndex];
    if (vCurrent && vCurrent.verse !== this.bridge.state.get('currentVerse')) {
      this.bridge.state.set('currentVerse', vCurrent.verse);
    }
    this.base.updateFocusedVerse(vCurrent?.verse);

    this.base.scrollActiveVerseIntoView();
    this.base.showSpeedControls(false);
    this.base.applyBookmarks();
    this.base.renderHighlights();
  }

  setActiveVerse(verses, index) {
    const oldEl = document.querySelector('.verse-container.active-verse');
    if (oldEl) {
      oldEl.classList.remove('active-verse');
      oldEl.classList.add('dimmed-verse');
    }

    const newEl = document.querySelector(`.verse-container[data-verse-index="${index}"]`);
    if (newEl) {
      newEl.classList.remove('dimmed-verse');
      newEl.classList.add('active-verse');
    }

    const v = verses[index];
    if (v && v.verse !== this.bridge.state.get('currentVerse')) {
      this.bridge.state.set('currentVerse', v.verse);
    }
    this.base.updateFocusedVerse(v?.verse);

    this.base.scrollActiveVerseIntoView();
  }

  advance(verses, direction) {
    if (direction === 'next') {
      if (this.currentVerseIndex < verses.length - 1) {
        this.currentVerseIndex++;
        this.setActiveVerse(verses, this.currentVerseIndex);
      } else {
        this.bridge.emit('nav:advance-chapter', { direction: 'next' });
      }
    } else {
      if (this.currentVerseIndex > 0) {
        this.currentVerseIndex--;
        this.setActiveVerse(verses, this.currentVerseIndex);
      } else {
        this.bridge.emit('nav:advance-chapter', { direction: 'prev' });
      }
    }
  }
};
