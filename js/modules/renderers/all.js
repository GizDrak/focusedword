window.AllRenderer = class AllRenderer {
  constructor(bridge, base) {
    this.bridge = bridge;
    this.base = base;
  }

  render(verses) {
    const state = this.bridge.state;
    const bionic = state.get('bionic');
    const strength = state.get('bionicStrength');

    const content = this.base.clearContent();
    content.classList.remove('swipe-mode', 'spotlight-mode', 'speed-mode');

    for (const v of verses) {
      content.appendChild(this.base.createVerseElement(v, bionic, strength));
    }

    this.base.showSpeedControls(false);
    this.base.applyBookmarks();
    this.base.renderHighlights();
    this.base.updateFocusedVerse(state.get('currentVerse'));
    this.bridge.call('navigation', 'scrollToVerse');
  }
};
