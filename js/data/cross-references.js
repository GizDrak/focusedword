window.CrossReferences = class CrossReferences {
  constructor(bridge) {
    this.bridge = bridge;
    this.SQL = null;
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
      const SQL = await window.initSqlJs({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/${file}`
      });
      const response = await fetch('/scripture/en/cross_references.db');
      const buffer = await response.arrayBuffer();
      this.SQL = SQL;
      this.db = new SQL.Database(new Uint8Array(buffer));
      this._enabled = true;
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
    this.SQL = null;
  }

  getRefs(bookId, chapter, verse) {
    if (!this.db) return [];
    try {
      const stmt = this.db.prepare(`
        SELECT to_book_id, to_chapter, to_verse_start, to_verse_end, votes
        FROM cross_references
        WHERE from_book_id = ? AND from_chapter = ? AND from_verse = ? AND votes >= 2
        ORDER BY votes DESC
      `);
      stmt.bind([bookId, chapter, verse]);
      const refs = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        refs.push(row);
      }
      stmt.free();
      return refs;
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
      const stmt = this.db.prepare(`
        SELECT from_verse, to_book_id, to_chapter, to_verse_start, to_verse_end, votes
        FROM cross_references
        WHERE from_book_id = ? AND from_chapter = ? AND votes >= 2
        ORDER BY from_verse, votes DESC
      `);
      stmt.bind([bookId, chapter]);
      const grouped = {};
      while (stmt.step()) {
        const row = stmt.getAsObject();
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
      stmt.free();
      this._refsCache = { _key: `${bookId}_${chapter}`, data: grouped };
      return grouped;
    } catch (e) {
      console.error('CrossReferences.getRefsBulk failed:', e);
      return {};
    }
  }
};
