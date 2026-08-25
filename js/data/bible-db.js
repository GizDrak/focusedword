window.BibleDB = class BibleDB {
  static SHA_UNAVAILABLE = '__sha_unavailable__';

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

static async createDbFromBytes(dbPath, expectedSha256 = null) {
    const sqlite3 = await BibleDB._sqliteWasmPromise;
    const fetched = await BibleDB.fetchBytes(dbPath);
    let bytes = fetched.bytes;
    if (!bytes || !bytes.length) return null;

    // Verify integrity, but only once per artifact version. A successful
    // check records the expected hash so later loads from the cache skip the
    // (potentially hundreds-of-MB) digest pass. On a mismatch the cached
    // copy is stale — drop it and retry a fresh download before giving up.
    if (expectedSha256) {
      const verified = await BibleDB._getVerifiedSha(dbPath);
      if (verified !== expectedSha256) {
        let actual = await BibleDB._sha256Hex(bytes);
        if (actual === BibleDB.SHA_UNAVAILABLE) {
          // Integrity verification is unavailable in this environment; accept
          // the bytes without digest checks rather than thrash the cache.
          console.warn('[db] Skipping integrity check for', dbPath, '— crypto.subtle unavailable');
        } else if (!actual || actual !== expectedSha256) {
          console.error('[db] Integrity check failed for', dbPath, '— expected', expectedSha256, 'got', actual || 'unavailable');
          await BibleDB._deleteCached(dbPath);
          const fresh = await BibleDB.fetchBytes(dbPath, true);
          actual = fresh.bytes ? await BibleDB._sha256Hex(fresh.bytes) : null;
          if (actual === BibleDB.SHA_UNAVAILABLE) {
            bytes = fresh.bytes;
          } else if (!actual || actual !== expectedSha256) {
            console.error('[db] Fresh download also failed integrity check for', dbPath);
            return null;
          } else {
            bytes = fresh.bytes;
          }
        }
        if (actual !== BibleDB.SHA_UNAVAILABLE) {
          await BibleDB._setVerifiedSha(dbPath, expectedSha256);
        }
      }
    }

    const db = BibleDB._deserialize(bytes);
    if (!db) await BibleDB._deleteCached(dbPath);
    return db;
  }

  static async checkForUpdates(dbPath) {
    try {
      if (typeof caches === 'undefined') return { updated: false };
      const cache = await caches.open('bible-database-cache');
      const cached = await cache.match(dbPath);
      if (!cached) return { updated: false };

      const headers = {};
      const etag = cached.headers ? cached.headers.get('ETag') : null;
      const lastModified = cached.headers ? cached.headers.get('Last-Modified') : null;
      if (etag) headers['If-None-Match'] = etag;
      if (lastModified) headers['If-Modified-Since'] = lastModified;

      // Do not let the browser HTTP cache hide a newer repository artifact.
      const resp = await fetch(dbPath, { headers, cache: 'no-store' });
      if (resp.status === 304) {
        return { updated: false };
      }
      if (resp.ok) {
        await cache.put(dbPath, resp.clone());
        const bytes = new Uint8Array(await resp.arrayBuffer());
        return { updated: true, bytes };
      }
      return { updated: false };
    } catch (e) {
      console.warn('[db] Update check failed for', dbPath, e);
      return { updated: false };
    }
  }

  static async fetchBytes(dbPath, forceNetwork = false) {
    try {
      // Defensive check: Only use caches if they exist (i.e., we are in HTTPS/localhost)
      if (typeof caches !== 'undefined') {
        const cache = await caches.open('bible-database-cache');
        if (!forceNetwork) {
          const cached = await cache.match(dbPath);
          if (cached) {
            return { bytes: new Uint8Array(await cached.arrayBuffer()), fromCache: true };
          }
        }

        const resp = await fetch(dbPath);
        if (resp.ok) await cache.put(dbPath, resp.clone());
        return { bytes: new Uint8Array(await resp.arrayBuffer()), fromCache: false };
      }
      // Fallback: Just fetch from the network if caches are not available
      console.warn('[db] Cache API not available (HTTP connection). Skipping cache.');
      const resp = await fetch(dbPath);
      return { bytes: new Uint8Array(await resp.arrayBuffer()), fromCache: false };
    } catch (e) {
      console.error('[db] Storage/Network error:', e);
      return { bytes: null, fromCache: false };
    }
  }

  static async _deleteCached(dbPath) {
    if (typeof caches === 'undefined') return;
    try {
      const cache = await caches.open('bible-database-cache');
      await cache.delete(dbPath);
    } catch (e) {
      console.warn('[db] Failed to delete cached entry for', dbPath, e);
    }
  }

  static _verifiedShaKey(dbPath) {
    return 'verified-db:' + dbPath;
  }

  static async _getVerifiedSha(dbPath) {
    try {
      if (typeof window === 'undefined' || !window.idb) return null;
      const rec = await window.idb.get('metadata', BibleDB._verifiedShaKey(dbPath));
      return rec && rec.sha256 ? rec.sha256 : null;
    } catch (e) {
      return null;
    }
  }

  static async _setVerifiedSha(dbPath, sha256) {
    try {
      if (typeof window === 'undefined' || !window.idb) return;
      await window.idb.put('metadata', { key: BibleDB._verifiedShaKey(dbPath), sha256 });
    } catch (e) {
      console.warn('[db] Failed to record verified hash for', dbPath, e);
    }
  }

  static async _sha256Hex(bytes) {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      console.warn('[db] crypto.subtle unavailable — skipping SHA-256 verification');
      return BibleDB.SHA_UNAVAILABLE;
    }
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
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
      if (this._core) {
        try { this._core.close(); } catch (e) { /* ignore */ }
        this._core = null;
        this._slug = null;
        this._mode = null;
        this._booksCache = null;
        this._codeCache = null;
      }
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

      const core = await BibleDB.createDbFromBytes(`/scripture/${slug}_v3.sqlite`);
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
    return BibleDB._deserialize(bytes);
  }

  static async _deserialize(bytes) {
    const sqlite3 = await BibleDB._sqliteWasmPromise;
    const header = new TextDecoder().decode(bytes.slice(0, 15));
    if (header !== 'SQLite format 3') {
      console.error('[db] Invalid database format');
      return null;
    }

    if (bytes.length > 20) { bytes[18] = 1; bytes[19] = 1; }

    try {
      const pData = sqlite3.wasm.allocFromTypedArray(bytes);
      if (!pData) { console.error('[db] WASM out of memory'); return null; }
      const db = new sqlite3.oo1.DB(':memory:');
      const flags = sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | 4;
      const rc = sqlite3.capi.sqlite3_deserialize(db.pointer, 'main', pData, bytes.byteLength, bytes.byteLength, flags);
      db.checkRc(rc);
      return db;
    } catch (e) {
      console.error('[db] _deserialize error:', e);
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
};
