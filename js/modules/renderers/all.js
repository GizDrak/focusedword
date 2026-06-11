window.AllRenderer = class AllRenderer {
  constructor(bridge, base) {
    this.bridge = bridge;
    this.base = base;
  }

  render(verses) {
    const state = this.bridge.state;
    const bionic = state.get('bionic');
    const strength = state.get('bionicStrength');
    const crossRefsOn = state.get('crossRefs');

    const content = this.base.clearContent();
    content.classList.remove('swipe-mode', 'spotlight-mode', 'speed-mode');

    let bulkRefs = {};
    const bookId = state.get('currentBook');
    const chapter = state.get('currentChapter');

    if (crossRefsOn) {
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

    this.base.showSpeedControls(false);
    this.base.applyBookmarks();
    this.base.renderHighlights();
    this.base.updateFocusedVerse(state.get('currentVerse'));
    this.bridge.call('navigation', 'scrollToVerse');
  }
};
