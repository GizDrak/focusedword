window.BibleDB = class BibleDB {
  constructor() {
    this._core = null;
    this._mode = null;
    this._booksCache = null;
    this._codeCache = null;
    this._slug = null;
  }

  static get _BOOKS() {
    return BookMap.getBooks();
  }

  static get _sqliteWasmPromise() {
    if (!this.__wasmPromise) {
      this.__wasmPromise = (async () => {
        try {
          const mod = await import(AppConfig.SQLITE_WASM_URL);
          const base = AppConfig.SQLITE_WASM_URL.substring(0, AppConfig.SQLITE_WASM_URL.lastIndexOf('/') + 1);
          return await mod.default({
            locateFile: (path) => base + path
          });
        } catch (e) {
          console.error('[db] SQLite WASM failed to load:', e);
          this.__wasmPromise = null;
          throw e;
        }
      })();
    }
    return this.__wasmPromise;
  }

static async createDbFromBytes(dbPath) {
    const sqlite3 = await BibleDB._sqliteWasmPromise;
    let buf;

    try {
      // Defensive check: Only use caches if they exist (i.e., we are in HTTPS/localhost)
      if (typeof caches !== 'undefined') {
        const cache = await caches.open('bible-database-cache');
        let resp = await cache.match(dbPath);

        if (!resp) {
          resp = await fetch(dbPath);
          if (resp.ok) await cache.put(dbPath, resp.clone());
        }
        buf = await resp.arrayBuffer();
      } else {
        // Fallback: Just fetch from the network if caches are not available
        console.warn('[db] Cache API not available (HTTP connection). Skipping cache.');
        const resp = await fetch(dbPath);
        buf = await resp.arrayBuffer();
      }
    } catch (e) {
      console.error('[db] Storage/Network error:', e);
      return null;
    }

    const bytes = new Uint8Array(buf);

    if (!bytes.length) {
      console.error('[db] Empty buffer — cannot load database.');
      return null;
    }

    const header = new TextDecoder().decode(bytes.slice(0, 15));
    if (header !== "SQLite format 3") {
      console.error(`[db] Invalid format! Expected database but got HTML.`);
      if (typeof caches !== 'undefined') {
        caches.open('bible-database-cache').then(c => c.delete(dbPath));
      }
      return null;
    }

    // --- SAFETY PATCH: FORCE ROLLBACK MODE ---
    if (bytes.length > 20) {
      bytes[18] = 1;
      bytes[19] = 1;
    }

    try {
      // 2. Allocate memory and load into WASM
      const pData = sqlite3.wasm.allocFromTypedArray(bytes);
      if (!pData) {
        console.error('[db] WASM out of memory!');
        return null;
      }

      const db = new sqlite3.oo1.DB(':memory:');
      
      // Read-Only flag (4) combined with Free-On-Close (1)
      const flags = sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | 4;

      const rc = sqlite3.capi.sqlite3_deserialize(
        db.pointer,
        'main',
        pData,
        bytes.byteLength,
        bytes.byteLength,
        flags
      );
      
      db.checkRc(rc);
      return db;
    } catch (e) {
      console.error('[db] createDbFromBytes error:', e);
      return null;
    }
  }
  

  _slugFor(translationId) {
    return translationId.toLowerCase();
  }

  _tableExists(db, name) {
    try {
      const val = db.selectValue("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [name]);
      return val !== undefined;
    } catch (e) {
      console.error('[db] _tableExists error:', e);
      return false;
    }
  }

  async init(translationId = 'BSB') {
    try {
      const slug = this._slugFor(translationId);

      const installed = await window.idb.getInstalledDatabase(translationId);
      if (installed) {
        if (installed.storage === 'opfs' && installed.opfs_path) {
          try {
            const sqlite3 = await BibleDB._sqliteWasmPromise;
            if (sqlite3.oo1.OpfsDb) {
              const db = new sqlite3.oo1.OpfsDb(installed.opfs_path, 'r');
              if (this._tableExists(db, 'bible_verses')) {
                this._core = db;
                this._slug = slug;
                this._mode = 'tokens';
                this._booksCache = null;
                this._codeCache = null;
                return true;
              }
              db.close();
            }
          } catch (e) {
            console.warn('[db] OPFS open failed for', translationId, e);
          }
        }

        if (installed.storage === 'idb') {
          try {
            const bytes = await window.idb.getDatabaseBytes(translationId);
            if (bytes) {
              const core = await BibleDB._dbFromBytes(bytes);
              if (core && this._tableExists(core, 'bible_verses')) {
                this._core = core;
                this._slug = slug;
                this._mode = 'tokens';
                this._booksCache = null;
                this._codeCache = null;
                return true;
              }
              if (core) core.close();
            }
          } catch (e) {
            console.warn('[db] IDB bytes load failed for', translationId, e);
          }
        }
      }

      const core = await BibleDB.createDbFromBytes(`/scripture/en/${slug}_v2.sqlite`);
      if (core && this._tableExists(core, 'bible_verses')) {
        this._core = core;
        this._slug = slug;
        this._mode = 'tokens';
        this._booksCache = null;
        this._codeCache = null;
        return true;
      }
      if (core) core.close();
      return false;
    } catch (e) {
      console.error('BibleDB init failed:', e);
      return false;
    }
  }

  static async _dbFromBytes(bytes) {
    const sqlite3 = await BibleDB._sqliteWasmPromise;
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const header = new TextDecoder().decode(bytes.slice(0, 15));
    if (header !== 'SQLite format 3') {
      console.error('[db] Invalid database format');
      return null;
    }

    const safe = new Uint8Array(buf);
    if (safe.length > 20) { safe[18] = 1; safe[19] = 1; }

    try {
      const pData = sqlite3.wasm.allocFromTypedArray(safe);
      if (!pData) { console.error('[db] WASM out of memory'); return null; }
      const db = new sqlite3.oo1.DB(':memory:');
      const flags = sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | 4;
      const rc = sqlite3.capi.sqlite3_deserialize(db.pointer, 'main', pData, safe.byteLength, safe.byteLength, flags);
      db.checkRc(rc);
      return db;
    } catch (e) {
      console.error('[db] _dbFromBytes error:', e);
      return null;
    }
  }

  _ensureBooksCache() {
    if (this._booksCache) return this._booksCache;
    const staticBooks = BibleDB._BOOKS;
    this._booksCache = staticBooks.map(b => ({
      id: b.id,
      code: BookMap.idToCode(b.id),
      name: b.name
    }));
    this._codeCache = {};
    for (const b of this._booksCache) {
      this._codeCache[b.id] = b.code;
      this._codeCache[b.code] = b.id;
    }
    return this._booksCache;
  }

  idToCode(id) {
    this._ensureBooksCache();
    if (this._codeCache) return this._codeCache[id];
    return BookMap.idToCode(id);
  }

  codeToId(code) {
    this._ensureBooksCache();
    if (this._codeCache) return this._codeCache[code];
    return BookMap.codeToId(code);
  }

  async getBooks() {
    this._ensureBooksCache();
    return this._booksCache.map(({ id, name }) => ({ id, name }));
  }

  async getBookId(name) {
    const books = this._ensureBooksCache();
    const book = books.find(b => b.name === name);
    return book ? book.id : null;
  }

  async getChapterCount(bookId) {
    const code = this.idToCode(bookId);
    if (!code || !this._core) return 0;
    try {
      return this._core.selectValue('SELECT MAX(chapter) FROM bible_verses WHERE book = ?', [code]) ?? 0;
    } catch (e) { console.error('[db] getChapterCount:', e); return 0; }
  }

  async getVerseCount(bookId, chapter) {
    const code = this.idToCode(bookId);
    if (!code || !this._core) return 0;
    try {
      return this._core.selectValue('SELECT COUNT(*) FROM bible_verses WHERE book = ? AND chapter = ?', [code, chapter]) ?? 0;
    } catch (e) { console.error('[db] getVerseCount:', e); return 0; }
  }

  getCoreDb() {
    return this._core;
  }

  async getChapterTokens(bookCode, chapter) {
    if (!this._core) return [];
    try {
      const rows = [];
      this._core.exec({
        sql: 'SELECT verse, json_tokens, clean_text FROM bible_verses WHERE book = ? AND chapter = ? ORDER BY verse',
        bind: [bookCode, chapter],
        rowMode: 'object', 
        resultRows: rows
      });

      return rows.map(r => ({
        verse: r.verse,
        tokens: JSON.parse(r.json_tokens || '[]'),
        clean_text: r.clean_text || ''
      }));
    } catch (e) {
      console.error('[db] getChapterTokens:', e, { bookCode, chapter });
      return [];
    }
  }
  
  async searchBible(searchTerm) {
    if (!this._core || !searchTerm) return [];
    try {
      const rows = [];
      this._core.exec({
        sql: `SELECT v.book, v.chapter, v.verse, v.clean_text, v.json_tokens
              FROM bible_search s
              JOIN bible_verses v ON s.verse_id = v.id
              WHERE bible_search MATCH ?
              ORDER BY bm25(bible_search)
              LIMIT 50`,
        bind: [searchTerm],
        rowMode: 'object',
        resultRows: rows
      });

      return rows.map(r => ({
        book: r.book,
        chapter: r.chapter,
        verse: r.verse,
        cleanText: r.clean_text || '',
        tokens: JSON.parse(r.json_tokens || '[]')
      }));
    } catch (e) {
      console.error('[db] searchBible error:', e);
      return [];
    }
  }
};