window.ChapterWindow = class ChapterWindow {
  constructor(bridge) {
    this.bridge = bridge;
    this.sections = [];
    this._counts = new Map();
    if (!ChapterWindow._verses) ChapterWindow._verses = new Map();
    if (!ChapterWindow._inflight) ChapterWindow._inflight = new Map();
    bridge.state.onChange('currentTranslation', () => {
      ChapterWindow._verses.clear();
      this._counts.clear();
    });
  }

  static key(bookId, chapter) {
    return bookId + ':' + chapter;
  }

  static parseKey(key) {
    const i = key.indexOf(':');
    return {
      bookId: parseInt(key.slice(0, i), 10),
      chapter: parseInt(key.slice(i + 1), 10)
    };
  }

  bookIndex(bookId) {
    const nav = this.bridge.get('navigation');
    if (!nav || !nav.booksCache) return -1;
    return nav.booksCache.findIndex(b => b.id === bookId);
  }

  bookName(bookId) {
    const nav = this.bridge.get('navigation');
    const entry = nav && nav.booksCache ? nav.booksCache.find(b => b.id === bookId) : null;
    return entry ? entry.name : '';
  }

  async chapterCount(bookId) {
    if (this._counts.has(bookId)) return this._counts.get(bookId);
    const count = await this.bridge.db.getChapterCount(bookId);
    this._counts.set(bookId, count);
    return count;
  }

  async getAdjacent(bookId, chapter, dir) {
    const nav = this.bridge.get('navigation');
    if (!nav || !nav.booksCache || !nav.booksCache.length) return null;
    const bookIndex = this.bookIndex(bookId);
    if (bookIndex < 0) return null;
    const total = await this.chapterCount(bookId);
    if (dir === 'next') {
      if (chapter < total) return { bookId, chapter: chapter + 1 };
      if (bookIndex < nav.booksCache.length - 1) {
        return { bookId: nav.booksCache[bookIndex + 1].id, chapter: 1 };
      }
      return null;
    }
    if (chapter > 1) return { bookId, chapter: chapter - 1 };
    if (bookIndex > 0) {
      const prevBook = nav.booksCache[bookIndex - 1];
      return { bookId: prevBook.id, chapter: await this.chapterCount(prevBook.id) };
    }
    return null;
  }

  async isLastSection(section) {
    const nav = this.bridge.get('navigation');
    if (!nav || !nav.booksCache || !nav.booksCache.length) return false;
    const idx = this.bookIndex(section.bookId);
    if (idx < 0 || idx < nav.booksCache.length - 1) return false;
    const total = await this.chapterCount(section.bookId);
    return section.chapter >= total;
  }

  loadVerses(bookId, chapter) {
    const key = ChapterWindow.key(bookId, chapter);
    if (ChapterWindow._verses.has(key)) {
      return Promise.resolve(ChapterWindow._verses.get(key));
    }
    if (ChapterWindow._inflight.has(key)) {
      return ChapterWindow._inflight.get(key);
    }
    const p = (async () => {
      const bookCode = this.bridge.db.idToCode(bookId);
      if (!bookCode) return [];
      const tokenVerses = await this.bridge.db.getChapterTokens(bookCode, chapter);
      const verses = tokenVerses.map(v => ({ ...v, book_code: bookCode, book_id: bookId, chapter }));
      ChapterWindow._verses.set(key, verses);
      this._trim();
      return verses;
    })().catch(e => {
      console.error('[ChapterWindow] loadVerses failed:', e);
      return [];
    });
    ChapterWindow._inflight.set(key, p);
    const settle = (v) => {
      ChapterWindow._inflight.delete(key);
      return v;
    };
    return p.then(settle, settle);
  }

  peekVerses(key) {
    return ChapterWindow._verses.get(key) || null;
  }

  _trim() {
    const MAX = 10;
    if (ChapterWindow._verses.size <= MAX) return;
    const windowKeys = new Set(this.sections.map(s => s.key));
    for (const k of [...ChapterWindow._verses.keys()]) {
      if (ChapterWindow._verses.size <= MAX) break;
      if (!windowKeys.has(k)) ChapterWindow._verses.delete(k);
    }
    while (ChapterWindow._verses.size > MAX) {
      ChapterWindow._verses.delete(ChapterWindow._verses.keys().next().value);
    }
  }

  // Rebuild the ordered section list around a chapter: prev, current, next.
  // Returns once every section's verses are resident.
  async setActive(bookId, chapter) {
    const key = ChapterWindow.key(bookId, chapter);
    const idx = this.sections.findIndex(s => s.key === key);
    if (idx >= 0) {
      await this._loadNeighborsFor(idx);
      return this.sections;
    }
    const section = { key, bookId, chapter, bookName: this.bookName(bookId), firstEl: null, els: null };
    this.sections = [section];
    await this.loadVerses(bookId, chapter);
    await this._loadNeighborsFor(0);
    return this.sections;
  }

  async _loadNeighborsFor(activeIdx) {
    const cur = this.sections[activeIdx];
    if (!cur) return;
    const prevAdj = await this.getAdjacent(cur.bookId, cur.chapter, 'prev');
    const nextAdj = await this.getAdjacent(cur.bookId, cur.chapter, 'next');

    const desired = [];
    if (prevAdj) {
      desired.push({
        key: ChapterWindow.key(prevAdj.bookId, prevAdj.chapter),
        bookId: prevAdj.bookId,
        chapter: prevAdj.chapter,
        bookName: this.bookName(prevAdj.bookId),
        firstEl: null,
        els: null
      });
    }
    desired.push(cur);
    if (nextAdj) {
      desired.push({
        key: ChapterWindow.key(nextAdj.bookId, nextAdj.chapter),
        bookId: nextAdj.bookId,
        chapter: nextAdj.chapter,
        bookName: this.bookName(nextAdj.bookId),
        firstEl: null,
        els: null
      });
    }

    await Promise.all(desired.map(s => this.loadVerses(s.bookId, s.chapter)));

    const previous = this.sections;
    this.sections = desired.map(d => {
      const existing = previous.find(s => s.key === d.key);
      return existing || d;
    });
  }
};
