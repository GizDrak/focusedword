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
      this.vm.setMode('speed');
      this.bridge.call('renderer-speed', 'render', verses);
    } else if (s.get('swipeMode')) {
      this.vm.setMode('swipe');
      this.bridge.call('renderer-swipe', 'render', verses);
    } else if (s.get('spotlightMode')) {
      this.vm.setMode('spotlight');
      this.bridge.call('renderer-spotlight', 'render', verses);
    } else {
      this.bridge.call('renderer-scroll', 'render', verses);
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
      this.base.setupScrollAutoHide(this.vm.content);
      this.base.updateFocusedVerse(currentVerse);
      this.base.showSpeedControls(!!state.get('speedMode'));

      if (!state.get('swipeMode')) {
        this.vm.scrollToVerse(currentVerse);
      }

      if (!state.get('swipeMode') && !state.get('spotlightMode') && !state.get('speedMode')) {
        const sr = this.bridge.get('renderer-scroll');
        if (sr) sr.onRenderComplete();
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
    this.bridge.state.onChange('swipeMode spotlightMode speedMode'.split(' '), () => {
      this.vm.syncBodyClasses(this._modeFlags());
    });
  }

  _modeFlags() {
    const s = this.bridge.state;
    return { swipe: s.get('swipeMode'), spotlight: s.get('spotlightMode'), speed: s.get('speedMode') };
  }

  _syncOnInit() {
    this.vm.syncBodyClasses(this._modeFlags());
  }
};
