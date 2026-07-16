window.FootnotesUI = class FootnotesUI {
  constructor(bridge) {
    this.bridge = bridge;
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
      if (e.key === 'Escape') this.close();
    });
  }

  async _showFootnote(callerEl) {
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
    const body = document.getElementById('footnote-popup-body');
    const title = document.getElementById('footnote-popup-title');
    body.innerHTML = html;
    title.textContent = `Footnote \u2014 ${ref}`;
    document.getElementById('footnote-overlay').classList.remove('hidden');
    document.getElementById('footnote-popup').classList.remove('hidden');
  }

  close() {
    document.getElementById('footnote-overlay').classList.add('hidden');
    document.getElementById('footnote-popup').classList.add('hidden');
    document.getElementById('footnote-popup-body').innerHTML = '';
  }
};
