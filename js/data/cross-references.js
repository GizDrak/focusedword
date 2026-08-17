window.CrossReferences = class CrossReferences {
  constructor(bridge) {
    this.bridge = bridge;
    this.db = null;
    this._enabled = false;
    this._refsCache = null;
  }

  get enabled() {
    return this._enabled;
  }

  async init() {
    if (this.db) return;
    if (this._loading) return;
    this._loading = true;
    try {
      this.db = await BibleDB.createDbFromBytes('/scripture/cross_references.db');
      this._enabled = !!this.db;
    } catch (e) {
      console.error('CrossReferences.init failed:', e);
      this._enabled = false;
    } finally {
      this._loading = false;
    }
  }

  destroy() {
    this._enabled = false;
    this._loading = false;
    this._refsCache = null;
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  getRefs(bookId, chapter, verse) {
    if (!this.db) return [];
    try {
      return this.db.exec({
        sql: `SELECT to_book_id, to_chapter, to_verse_start, to_verse_end, votes
              FROM cross_references
              WHERE from_book_id = ? AND from_chapter = ? AND from_verse = ? AND votes >= 2
              ORDER BY votes DESC`,
        bind: [bookId, chapter, verse],
        rowMode: 'object',
        returnValue: 'resultRows'
      });
    } catch (e) {
      console.error('CrossReferences.getRefs failed:', e);
      return [];
    }
  }

  getRefsBulk(bookId, chapter) {
    if (!this.db) return {};
    if (this._refsCache && this._refsCache._key === `${bookId}_${chapter}`) {
      return this._refsCache.data;
    }
    try {
      const rows = this.db.exec({
        sql: `SELECT from_verse, to_book_id, to_chapter, to_verse_start, to_verse_end, votes
              FROM cross_references
              WHERE from_book_id = ? AND from_chapter = ? AND votes >= 2
              ORDER BY from_verse, votes DESC`,
        bind: [bookId, chapter],
        rowMode: 'object',
        returnValue: 'resultRows'
      });
      const grouped = {};
      for (const row of rows) {
        const v = row.from_verse;
        if (!grouped[v]) grouped[v] = [];
        grouped[v].push({
          to_book_id: row.to_book_id,
          to_chapter: row.to_chapter,
          to_verse_start: row.to_verse_start,
          to_verse_end: row.to_verse_end,
          votes: row.votes
        });
      }
      this._refsCache = { _key: `${bookId}_${chapter}`, data: grouped };
      return grouped;
    } catch (e) {
      console.error('CrossReferences.getRefsBulk failed:', e);
      return {};
    }
  }
};
