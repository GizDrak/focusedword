window.CRefsUI = class CRefsUI {
  constructor(bridge) {
    this.bridge = bridge;
    this._open = false;
    this._init();
  }

  _init() {
    this.overlay = document.getElementById('crossref-overlay');
    this.panel = document.getElementById('crossref-panel');
    this.body = document.getElementById('crossref-body');
    this.title = document.getElementById('crossref-title');

    document.getElementById('crossref-close').addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', () => this.close());

    this.bridge.on('crossref:show', (detail) => this._show(detail));
    this.bridge.state.onChange('crossRefs', (key, val) => {
      if (!val) this.close();
    });
  }

  async _show(detail) {
    this.body.innerHTML = '<div class="crossref-empty">Loading...</div>';
    this.panel.classList.add('open');
    this.overlay.classList.add('open');
    this._open = true;

    let refs = this.bridge.get('cross-references').getRefs(detail.bookId, detail.chapter, detail.verse);
    const books = window.BibleDB._BOOKS;

    const bookName = books.find(b => b.id === detail.bookId)?.name || '?';
    this.title.textContent = `${bookName} ${detail.chapter}:${detail.verse}`;

    const topRefs = refs.slice(0, 3);

    if (topRefs.length === 0) {
      this.body.innerHTML = '<div class="crossref-empty">No cross-references</div>';
      return;
    }

    const list = document.createElement('div');
    list.className = 'crossref-list';

    for (const ref of topRefs) {
      const toBook = books.find(b => b.id === ref.to_book_id);
      if (!toBook) continue;
      const label = `${toBook.name} ${ref.to_chapter}:${ref.to_verse_start}` +
        (ref.to_verse_end > ref.to_verse_start ? `-${ref.to_verse_end}` : '');

      const text = await this._fetchVerseText(ref.to_book_id, ref.to_chapter, ref.to_verse_start);

      const entry = document.createElement('button');
      entry.className = 'crossref-entry';

      const textSpan = document.createElement('span');
      textSpan.className = 'crossref-entry-text';
      textSpan.textContent = text || '(text not available)';

      const refSpan = document.createElement('span');
      refSpan.className = 'crossref-entry-ref';
      refSpan.textContent = '\u2014 ' + label;

      entry.appendChild(textSpan);
      entry.appendChild(refSpan);
      entry.addEventListener('click', () => {
        this.close();
        this.bridge.get('navigation').navigateTo(ref.to_book_id, ref.to_chapter, ref.to_verse_start);
      });
      list.appendChild(entry);
    }

    this.body.innerHTML = '';
    this.body.appendChild(list);
  }

  async _fetchVerseText(bookId, chapter, verse) {
    try {
      const code = this.bridge.db.idToCode(bookId);
      if (!code) return '';
      const verses = await this.bridge.db.getChapterTokens(code, chapter);
      const v = verses.find(v => v.verse === verse);
      return v ? v.clean_text.trim() : '';
    } catch {
      return '';
    }
  }

  close() {
    this.panel.classList.remove('open');
    this.overlay.classList.remove('open');
    this._open = false;
  }
};
