window.BibleDB = class BibleDB {
  constructor() {
    this.db = null;
    this.SQL = null;
    this._mode = null;
    this._booksCache = null;
  }

  static get _BOOKS() {
    if (!BibleDB.__books) {
      BibleDB.__books = [
        { id: 1, name: 'Genesis' },
        { id: 2, name: 'Exodus' },
        { id: 3, name: 'Leviticus' },
        { id: 4, name: 'Numbers' },
        { id: 5, name: 'Deuteronomy' },
        { id: 6, name: 'Joshua' },
        { id: 7, name: 'Judges' },
        { id: 8, name: 'Ruth' },
        { id: 9, name: 'I Samuel' },
        { id: 10, name: 'II Samuel' },
        { id: 11, name: 'I Kings' },
        { id: 12, name: 'II Kings' },
        { id: 13, name: 'I Chronicles' },
        { id: 14, name: 'II Chronicles' },
        { id: 15, name: 'Ezra' },
        { id: 16, name: 'Nehemiah' },
        { id: 17, name: 'Esther' },
        { id: 18, name: 'Job' },
        { id: 19, name: 'Psalms' },
        { id: 20, name: 'Proverbs' },
        { id: 21, name: 'Ecclesiastes' },
        { id: 22, name: 'Song of Solomon' },
        { id: 23, name: 'Isaiah' },
        { id: 24, name: 'Jeremiah' },
        { id: 25, name: 'Lamentations' },
        { id: 26, name: 'Ezekiel' },
        { id: 27, name: 'Daniel' },
        { id: 28, name: 'Hosea' },
        { id: 29, name: 'Joel' },
        { id: 30, name: 'Amos' },
        { id: 31, name: 'Obadiah' },
        { id: 32, name: 'Jonah' },
        { id: 33, name: 'Micah' },
        { id: 34, name: 'Nahum' },
        { id: 35, name: 'Habakkuk' },
        { id: 36, name: 'Zephaniah' },
        { id: 37, name: 'Haggai' },
        { id: 38, name: 'Zechariah' },
        { id: 39, name: 'Malachi' },
        { id: 40, name: 'Matthew' },
        { id: 41, name: 'Mark' },
        { id: 42, name: 'Luke' },
        { id: 43, name: 'John' },
        { id: 44, name: 'Acts' },
        { id: 45, name: 'Romans' },
        { id: 46, name: 'I Corinthians' },
        { id: 47, name: 'II Corinthians' },
        { id: 48, name: 'Galatians' },
        { id: 49, name: 'Ephesians' },
        { id: 50, name: 'Philippians' },
        { id: 51, name: 'Colossians' },
        { id: 52, name: 'I Thessalonians' },
        { id: 53, name: 'II Thessalonians' },
        { id: 54, name: 'I Timothy' },
        { id: 55, name: 'II Timothy' },
        { id: 56, name: 'Titus' },
        { id: 57, name: 'Philemon' },
        { id: 58, name: 'Hebrews' },
        { id: 59, name: 'James' },
        { id: 60, name: 'I Peter' },
        { id: 61, name: 'II Peter' },
        { id: 62, name: 'I John' },
        { id: 63, name: 'II John' },
        { id: 64, name: 'III John' },
        { id: 65, name: 'Jude' },
        { id: 66, name: 'Revelation of John' }
      ];
    }
    return BibleDB.__books;
  }

  async init(translationId = 'BSB') {
    try {
      const sqlPromise = window.initSqlJs({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/${file}`
      });
      this.SQL = await sqlPromise;
      const response = await fetch(`/scripture/en/${translationId}.db`);
      const buffer = await response.arrayBuffer();
      this.db = new this.SQL.Database(new Uint8Array(buffer));

      const tables = this.db.exec("SELECT name FROM sqlite_master WHERE type='table'");
      const names = tables[0].values.flat();
      this._mode = names.includes('BSB_verses') ? 'bsb' : 'crosswire';
      this._booksCache = null;
      return true;
    } catch (e) {
      console.error('BibleDB init failed:', e);
      return false;
    }
  }

  _schema() {
    if (this._mode === 'bsb') {
      return {
        versesTable: 'BSB_verses',
        booksTable: 'BSB_books',
        bookCol: 'book_id',
        hasBooksTable: true
      };
    }
    return {
      versesTable: 'verses',
      booksTable: null,
      bookCol: 'book',
      hasBooksTable: false
    };
  }

  _ensureBooksCache() {
    if (!this._booksCache) {
      this._booksCache = BibleDB._BOOKS;
    }
    return this._booksCache;
  }

  async getBooks() {
    const s = this._schema();
    if (s.hasBooksTable) {
      const result = this.db.exec(`SELECT id, name FROM ${s.booksTable} ORDER BY id`);
      if (!result.length) return [];
      const { columns, values } = result[0];
      return values.map((row) => {
        const obj = {};
        columns.forEach((col, i) => { obj[col] = row[i]; });
        return obj;
      });
    }
    return this._ensureBooksCache();
  }

  async getBookId(name) {
    const books = this._ensureBooksCache();
    const book = books.find(b => b.name === name);
    return book ? book.id : null;
  }

  async getVerses(bookId, chapter) {
    const s = this._schema();
    const extra = s.hasBooksTable ? ', has_wj, text_wj' : '';
    const stmt = this.db.prepare(`SELECT verse, text${extra} FROM ${s.versesTable} WHERE ${s.bookCol} = ? AND chapter = ? ORDER BY verse`);
    stmt.bind([bookId, chapter]);
    const verses = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      verses.push(row);
    }
    stmt.free();
    return verses;
  }

  async getChapterCount(bookId) {
    const s = this._schema();
    const result = this.db.exec(`SELECT MAX(chapter) as count FROM ${s.versesTable} WHERE ${s.bookCol} = ?`, [bookId]);
    if (!result.length || !result[0].values.length || result[0].values[0][0] === null) return 0;
    return result[0].values[0][0];
  }

  async getVerseCount(bookId, chapter) {
    const s = this._schema();
    const result = this.db.exec(`SELECT COUNT(*) as count FROM ${s.versesTable} WHERE ${s.bookCol} = ? AND chapter = ?`, [bookId, chapter]);
    if (!result.length || !result[0].values.length) return 0;
    return result[0].values[0][0];
  }

  async searchVerses(query) {
    const s = this._schema();
    const terms = query.trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];

    const cond = () => `' ' || v.text || ' ' LIKE '% ' || ? || ' %'`;
    const caseExprs = terms.map(() => `CASE WHEN ${cond()} THEN 1 ELSE 0 END`);
    const whereExprs = terms.map(() => cond());

    if (s.hasBooksTable) {
      const sql = `SELECT v.verse, v.text, b.name as book_name, v.chapter, v.${s.bookCol} as book_id,
                          (${caseExprs.join(' + ')}) as match_count
                   FROM ${s.versesTable} v
                   JOIN ${s.booksTable} b ON b.id = v.${s.bookCol}
                   WHERE ${whereExprs.join(' OR ')}
                   ORDER BY match_count DESC, v.${s.bookCol}, v.chapter, v.verse
                   LIMIT 50`;
      const stmt = this.db.prepare(sql);
      const bindParams = [];
      terms.forEach(t => { bindParams.push(t); bindParams.push(t); });
      stmt.bind(bindParams);
      const results = [];
      while (stmt.step()) results.push(stmt.getAsObject());
      stmt.free();
      return results;
    }

    const sql = `SELECT v.verse, v.text, v.${s.bookCol} as book_id, v.chapter,
                        (${caseExprs.join(' + ')}) as match_count
                 FROM ${s.versesTable} v
                 WHERE ${whereExprs.join(' OR ')}
                 ORDER BY match_count DESC, v.${s.bookCol}, v.chapter, v.verse
                 LIMIT 50`;
    const stmt = this.db.prepare(sql);
    const bindParams = [];
    terms.forEach(t => { bindParams.push(t); bindParams.push(t); });
    stmt.bind(bindParams);
    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();

    const books = this._ensureBooksCache();
    for (const r of results) {
      const book = books.find(b => b.id === r.book_id);
      r.book_name = book ? book.name : '';
    }
    return results;
  }
};
