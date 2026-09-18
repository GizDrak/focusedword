window.RenderManager = class RenderManager {
  constructor(bridge, vm, base) {
    this.bridge = bridge;
    this.vm = vm;
    this.base = base;
    this._bind();
    this._syncOnInit();
  }

  render() {
    const nav = this.bridge.get('navigation');
    if (!nav || !nav.currentVerses.length) return;
    this.vm.prepare();
    const dispatched = this._dispatch(nav.currentVerses);
    this._finalize(dispatched);
  }

  _dispatch(verses) {
    const s = this.bridge.state;
    if (s.get('speedMode')) {
      this._scrollSwitcher?.stop();
      this.vm.setMode('speed');
      this.bridge.call('renderer-speed', 'render', verses);
    } else if (s.get('swipeMode')) {
      this._scrollSwitcher?.stop();
      this.vm.setMode('swipe');
      this.bridge.call('renderer-swipe', 'render', verses);
    } else if (s.get('spotlightMode')) {
      this._scrollSwitcher?.stop();
      this.vm.setMode('spotlight');
      return this.bridge.call('renderer-spotlight', 'render', verses);
    } else {
      let dispatched = null;
      if (s.get('continuousChapters') === true && !s.get('splitMode')) {
        dispatched = this.bridge.call('renderer-scroll', 'renderContinuous', verses);
      } else {
        this.bridge.call('renderer-scroll', 'render', verses);
      }
      if (this._scrollSwitcher) {
        this._scrollSwitcher.stop({ restoreLegacyTracking: false });
      }
      return dispatched;
    }
  }

  // Streaming path: apply already-resolved annotation spans onto the living
    // chapter DOM in place instead of triggering a full chapter rebuild.
  applyAnnotations(payload) {
    const nav = this.bridge.get('navigation');
    const verses = payload && payload.verses ? payload.verses : (nav && nav.currentVerses);
    if (!verses || !verses.length) return;
    const mode = this.bridge.state;
    const flags = {
      wordClasses: mode.get('wordClasses') === true,
      clearReading: mode.get('clearReadingEnabled') === true,
      wordStudy: mode.get('wordStudyEnabled') === true,
      verseTopics: mode.get('verseTopicsEnabled') === true
    };
    const base = this.base;
    const tr = base && base._tokenRenderer;
    if (!tr || typeof tr.applyAnnotationsToDom !== 'function') {
      this.render();
      return;
    }
    const continuous = mode.get('continuousChapters') === true &&
      !mode.get('swipeMode') && !mode.get('spotlightMode') && !mode.get('speedMode') && !mode.get('splitMode');
    let root = null;
    if (continuous) {
      const first = verses[0];
      if (first && first.book_id != null && first.chapter != null) {
        root = document.querySelector('#content .chapter-section[data-book="' + first.book_id + '"][data-chapter="' + first.chapter + '"]');
        if (!root) return;
      }
    }
    const touched = tr.applyAnnotationsToDom(verses, flags, root);
    if (!touched) {
      // The stream resolved but painted nothing onto the DOM.
      if (!continuous && this.bridge.state.get('swipeMode') === false && this.bridge.state.get('spotlightMode') === false) {
        // DOM may not match (e.g. user re-rendered mid-stream); fall back to a
        // full refresh so the annotations still show.
        this.render();
        return;
      }
      if (this._repaintQueuedForStream(verses)) return;
    }
  }

  // Spotlight/swipe render asynchronously: on a chapter switch the DOM is
  // cleared synchronously (vm.prepare) but only rebuilt after setActive
  // resolves, so a chapter's annotation stream can resolve into an empty DOM.
  // RenderManager used to silently drop those streams under spotlight, leaving
  // the study spinners stuck until a manual mode switch forced a full render.
  // Repaint once — after the in-flight render settles — but only when the
  // payload is still the active chapter and none of its verse containers are on
  // screen (never when containers exist but had nothing to apply; that would
  // loop forever on a genuinely span-less chapter).
  _repaintQueuedForStream(verses) {
    if (!verses || !verses.length) return false;
    const first = verses[0];
    if (!first || first.book_id == null || first.chapter == null) return false;
    const cur = this.bridge.get('navigation')?.currentVerses;
    if (!cur || !cur.length) return false;
    if (cur[0].book_id !== first.book_id || cur[0].chapter !== first.chapter) return false;
    const containerSel = (bookId, chapter) =>
      '#content .verse-container[data-book="' + bookId + '"][data-chapter="' + chapter + '"]';
    if (document.querySelector(containerSel(first.book_id, first.chapter))) return false;
    if (this._annotationRepaintQueued) return true;
    this._annotationRepaintQueued = true;
    const bookId = first.book_id;
    const chapter = first.chapter;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this._annotationRepaintQueued = false;
      const cur = this.bridge.get('navigation')?.currentVerses;
      if (!cur || !cur.length) return;
      if (cur[0].book_id !== bookId || cur[0].chapter !== chapter) return;
      if (document.querySelector(containerSel(bookId, chapter))) return;
      this.render();
    }));
    return true;
  }

  _finalize(dispatched) {
    requestAnimationFrame(() => {
      Promise.resolve(dispatched).catch(() => {}).then(() => {
      const state = this.bridge.state;
      const verses = this.bridge.get('navigation')?.currentVerses;
      if (!verses) return;
      const bookName = state.get('currentBookName');
      const currentVerse = state.get('currentVerse');

      // Lock current verse before programmatic scroll so scroll tracking
      // cannot overwrite it during the mode transition
      if (!state.get('swipeMode') && !state.get('spotlightMode') && !state.get('speedMode')) {
        window.verseManager.setIntentional(currentVerse);
      }

      const continuousSpotlight = state.get('continuousChapters') === true && state.get('spotlightMode') === true;
      if (!continuousSpotlight) this.base.showChapterHeader(verses, bookName);
      this.base.updateFocusedVerse(currentVerse);
      this.base.showSpeedControls(!!state.get('speedMode'));

      if (!state.get('swipeMode')) {
        if (!state.get('spotlightMode') && !state.get('speedMode')) {
          this.vm.scrollToReadingBand(currentVerse);
        } else {
          this.vm.scrollToVerse(currentVerse);
        }
      }

      if (!state.get('swipeMode') && !state.get('spotlightMode') && !state.get('speedMode')) {
        const sr = this.bridge.get('renderer-scroll');
        if (sr) sr.onRenderComplete();
        requestAnimationFrame(() => {
          this._scrollSwitcher?.start();
        });
      }

      if (!state.get('swipeMode') && !state.get('speedMode')) {
        this.base.applyBookmarks();
        this.base.renderHighlights();
      }
      });
    });
  }

  _bind() {
    this.bridge.on('nav:chapter-loaded', () => this.render());
    this.bridge.on('render:refresh', () => this.render());
    this.bridge.on('nav:annotations-applied', (payload) => this.applyAnnotations(payload));
    this.bridge.state.onChange('swipeMode spotlightMode speedMode splitMode splitPortrait'.split(' '), () => {
      this.vm.syncBodyClasses(this._modeFlags());
    });
    this.bridge.state.onChange('paragraphMode', (_, val) => {
      document.body.classList.toggle('paragraph-mode', val === true);
      this.bridge.state.set('paragraphBreaks', val === true);
    });
    this.bridge.state.onChange('backgroundTexture', (_, val) => {
      document.body.classList.toggle('background-texture', val === true);
    });
    this.bridge.state.onChange('currentTranslation', (_, val) => {
      document.body.dataset.translation = (val || 'BSB').toLowerCase();
    });
  }

  _modeFlags() {
    const s = this.bridge.state;
    return { swipe: s.get('swipeMode'), spotlight: s.get('spotlightMode'), speed: s.get('speedMode'), split: s.get('splitMode'), splitPortrait: s.get('splitPortrait') };
  }

  _syncOnInit() {
    this.vm.syncBodyClasses(this._modeFlags());
    document.body.dataset.translation = (this.bridge.state.get('currentTranslation') || 'BSB').toLowerCase();
    if (this.bridge.state.get('paragraphMode') === true) {
      document.body.classList.add('paragraph-mode');
      this.bridge.state.set('paragraphBreaks', true);
    }
    if (this.bridge.state.get('backgroundTexture') === true) {
      document.body.classList.add('background-texture');
    }
  }
};
