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
    this._dispatch(nav.currentVerses);
    this._finalize();
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
      this.bridge.call('renderer-spotlight', 'render', verses);
    } else {
      this.bridge.call('renderer-scroll', 'render', verses);
      if (this._scrollSwitcher) {
        this._scrollSwitcher.stop();
        this._scrollSwitcher.start();
      }
    }
  }

  _finalize() {
    requestAnimationFrame(() => {
      const state = this.bridge.state;
      const verses = this.bridge.get('navigation')?.currentVerses;
      if (!verses) return;
      const bookName = state.get('currentBookName');
      const currentVerse = state.get('currentVerse');

      this.base.showChapterHeader(verses, bookName);
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
  }

  _bind() {
    this.bridge.on('nav:chapter-loaded', () => this.render());
    this.bridge.on('render:refresh', () => this.render());
    this.bridge.state.onChange('swipeMode spotlightMode speedMode splitMode splitPortrait'.split(' '), () => {
      this.vm.syncBodyClasses(this._modeFlags());
    });
    this.bridge.state.onChange('paragraphMode', (_, val) => {
      document.body.classList.toggle('paragraph-mode', val);
      this.bridge.state.set('paragraphBreaks', val);
    });
    this.bridge.state.onChange('backgroundTexture', (_, val) => {
      document.body.classList.toggle('background-texture', val);
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
    if (this.bridge.state.get('paragraphMode')) {
      document.body.classList.add('paragraph-mode');
      this.bridge.state.set('paragraphBreaks', true);
    }
    if (this.bridge.state.get('backgroundTexture')) {
      document.body.classList.add('background-texture');
    }
  }
};
