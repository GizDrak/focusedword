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
    const idx = verses.findIndex(v => v.verse === verseNum);
    if (idx < 0) return;
    this.currentVerseIndex = idx;
    this.setActiveVerse(verses, idx);
  }

  advance(verses, direction) {
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
