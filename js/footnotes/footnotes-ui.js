window.FootnotesUI = class FootnotesUI {
  constructor(bridge) {
    this.bridge = bridge;
    this._previousFocus = null;
    this._cleanupFocus = null;
  }

  init() {
    document.addEventListener('click', (e) => {
      const caller = e.target.closest('.footnote-caller');
      if (caller) {
        const im = this.bridge.get('interaction-manager');
        if (im && im.selectionMode) return;
        e.preventDefault();
        e.stopPropagation();
        this._showFootnote(caller);
        return;
      }
      if (e.target.closest('#footnote-popup')) return;
      if (e.target.closest('#footnote-overlay')) {
        this.close();
      }
    });

    document.getElementById('footnote-popup-close').addEventListener('click', () => this.close());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._previousFocus !== null) {
        e.stopPropagation();
        this.close();
      }
    });
  }

  async _showFootnote(callerEl) {
    this._previousFocus = document.activeElement;
    const footnoteText = callerEl.dataset.footnoteText;

    const verseContainer = callerEl.closest('.verse-container');
    const verse = verseContainer ? parseInt(verseContainer.dataset.verse) : NaN;

    const state = this.bridge.state;
    const chapter = state.get('currentChapter');
    const bookName = state.get('currentBookName');

    if (!footnoteText) {
      this._showContent('No footnote available.', '-');
      return;
    }

    const ref = `${bookName || '?'} ${chapter}:${verse || '?'}`;
    const base = this.bridge.get('base-renderer');
    const safeHtml = base ? base.escapeHtml(footnoteText) : footnoteText;
    this._showContent(safeHtml, ref);
  }

  _showContent(html, ref) {
    const overlay = document.getElementById('footnote-overlay');
    const popup = document.getElementById('footnote-popup');
    const body = document.getElementById('footnote-popup-body');
    const title = document.getElementById('footnote-popup-title');
    body.innerHTML = html;
    title.textContent = `Footnote \u2014 ${ref}`;
    overlay.classList.remove('hidden');
    popup.classList.remove('hidden');
    popup.removeAttribute('aria-hidden');
    const closeBtn = document.getElementById('footnote-popup-close');
    const base = this.bridge.get('base-renderer');
    if (base) this._cleanupFocus = base.trapFocus(popup, null);
    if (closeBtn) setTimeout(() => closeBtn.focus(), 50);
  }

  close() {
    const overlay = document.getElementById('footnote-overlay');
    const popup = document.getElementById('footnote-popup');
    const body = document.getElementById('footnote-popup-body');
    overlay.classList.add('hidden');
    popup.classList.add('hidden');
    popup.setAttribute('aria-hidden', 'true');
    body.innerHTML = '';
    if (this._cleanupFocus) { this._cleanupFocus(); this._cleanupFocus = null; }
    if (this._previousFocus && this._previousFocus.isConnected) {
      this._previousFocus.focus({ preventScroll: true });
    }
    this._previousFocus = null;
  }
};
