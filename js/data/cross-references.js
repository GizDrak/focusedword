window.CrossReferences = class CrossReferences {
  constructor(bridge) {
    this.bridge = bridge;
    this.db = null;
    this._enabled = false;
    this._refsCache = null;
    this._usingNotesDb = false;
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
    this._usingNotesDb = false;
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  getRefs(bookId, chapter, verse) {
    if (this._usingNotesDb) {
      return this._getRefsFromNotes(bookId, chapter, verse);
    }
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
    if (this._usingNotesDb) {
      return this._getRefsBulkFromNotes(bookId, chapter);
    }
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

  _getRefsFromNotes(bookId, chapter, verse) {
    const db = this.bridge.db.getCoreDb();
    if (!db) return [];
    const code = this.bridge.db.idToCode(bookId);
    if (!code) return [];
    try {
      const jsonStr = db.selectValue(
        'SELECT json_tokens FROM bible_verses WHERE book = ? AND chapter = ? AND verse = ?',
        [code, chapter, verse]
      );
      if (jsonStr === undefined) return [];
      const tokens = JSON.parse(jsonStr || '[]');
      return this._extractRefsFromTokens(tokens);
    } catch {
      return [];
    }
  }

  _getRefsBulkFromNotes(bookId, chapter) {
    const db = this.bridge.db.getCoreDb();
    if (!db) return {};
    const code = this.bridge.db.idToCode(bookId);
    if (!code) return {};
    const cacheKey = `${bookId}_${chapter}`;
    if (this._refsCache && this._refsCache._key === cacheKey) {
      return this._refsCache.data;
    }
    try {
      const rows = db.exec({
        sql: 'SELECT verse, json_tokens FROM bible_verses WHERE book = ? AND chapter = ? ORDER BY verse',
        bind: [code, chapter],
        rowMode: 'object',
        returnValue: 'resultRows'
      });
      const grouped = {};
      for (const row of rows) {
        const verseNum = row.verse;
        const tokens = JSON.parse(row.json_tokens || '[]');
        const refs = this._extractRefsFromTokens(tokens);
        if (refs.length) {
          grouped[verseNum] = refs;
        }
      }
      this._refsCache = { _key: cacheKey, data: grouped };
      return grouped;
    } catch {
      return {};
    }
  }

  _extractRefsFromTokens(tokens) {
    const refs = [];
    for (const token of tokens) {
      if (token.type === 'cross_ref' && token.text) {
        const parsed = this._parseCrossRefText(token.text);
        if (parsed) {
          refs.push(parsed);
        }
      }
    }
    return refs;
  }

  _parseCrossRefText(text) {
    const m = text.match(/^\((.+?)\)\s*$/);
    if (!m) return null;
    const inner = m[1].trim();
    const firstRef = inner.split(/;/)[0].trim();
    const refMatch = firstRef.match(/^(.+?)\s+(\d+):(\d+)(?:\u2013(\d+))?$/);
    if (!refMatch) return null;

    const rawName = refMatch[1].trim().replace(/\s+/g, ' ');
    const chapter = parseInt(refMatch[2]);
    const verseStart = parseInt(refMatch[3]);
    const verseEnd = refMatch[4] ? parseInt(refMatch[4]) : verseStart;

    let bookId = this._bookNameToId(rawName);
    if (!bookId) {
      const alt = window.BookMap.normalizeName(rawName);
      bookId = this._bookNameToId(alt);
    }
    if (!bookId) return null;

    return {
      to_book_id: bookId,
      to_chapter: chapter,
      to_verse_start: verseStart,
      to_verse_end: verseEnd,
      votes: 1,
      text: text,
      markup: null
    };
  }

  _bookNameToId(name) {
    const found = BookMap.getBooks().find(b => b.name === name);
    return found ? found.id : null;
  }
};
