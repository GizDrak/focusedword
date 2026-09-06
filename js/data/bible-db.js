window.BibleDB = class BibleDB {
  static SHA_UNAVAILABLE = '__sha_unavailable__';

  // ─── OPFS study-database persistence ────────────────────────────────────
  // Study SQLite databases (word classes / word study / lexicon / verse
  // topics) are immutable. Persisting them in the `opfs-sahpool` VFS lets us
  // open them directly from disk on later launches instead of deserializing
  // ~575 MB into memory every time. Everything here degrades to the existing
  // in-memory `createDbFromBytes` path when OPFS is unavailable.

  static _opfsStudyDir = '.focused-word-study-vfs';
  static _opfsStudyCapacity = 12;

  static get _opfsStatus() {
    if (!this.__opfsStatus) this.__opfsStatus = { available: false, reason: null, error: null };
    return this.__opfsStatus;
  }

  static _setOpfsStatus(available, reason = null, error = null) {
    const s = this._opfsStatus;
    s.available = available;
    s.reason = available ? null : reason;
    s.error = available ? null : error;
  }

  // Memoized Promise for the SAH-pool utility object; resolves to the pool on
  // success or `null` when OPFS cannot be used (tests, plain HTTP, locked by
  // another tab, quota, …). Never rejects.
  static get _opfsPoolPromise() {
    if (this.__opfsPoolPromise === undefined) this.__opfsPoolPromise = this._initOpfsPool();
    return this.__opfsPoolPromise;
  }

  static async _initOpfsPool() {
    if (typeof navigator === 'undefined' ||
        !navigator.storage || typeof navigator.storage.getDirectory !== 'function' ||
        !globalThis.FileSystemHandle ||
        !globalThis.FileSystemFileHandle ||
        typeof globalThis.FileSystemFileHandle.prototype.createSyncAccessHandle !== 'function') {
      this._setOpfsStatus(false, 'unsupported');
      return null;
    }
    try {
      const sqlite3 = await BibleDB._sqliteWasmPromise;
      if (!sqlite3 || typeof sqlite3.installOpfsSAHPoolVfs !== 'function') {
        this._setOpfsStatus(false, 'unsupported');
        return null;
      }
      const pool = await sqlite3.installOpfsSAHPoolVfs({
        name: 'focused-word-study',
        directory: BibleDB._opfsStudyDir,
        initialCapacity: 8,
      });
      if (typeof pool.reserveMinimumCapacity === 'function') {
        await pool.reserveMinimumCapacity(BibleDB._opfsStudyCapacity);
      }
      this._setOpfsStatus(true);
      return pool;
    } catch (e) {
      const msg = e && e.message ? String(e.message) : '';
      const reason = /lock|in use|another|No available|registered/i.test(msg) ? 'pool-locked'
        : /quota|storage/i.test(msg) ? 'quota'
          : 'init-failed';
      this._setOpfsStatus(false, reason, e);
      return null;
    }
  }

  static async _getOpfsPool() {
    const p = this._opfsPoolPromise;
    if (p == null) return null;
    try {
      return await p;
    } catch (e) {
      if (this._opfsStatus.available !== true) {
        this._setOpfsStatus(false, this._opfsStatus.reason || 'init-failed', e);
      }
      return null;
    }
  }

  static setOpfsPoolForTesting(pool) {
    // Test seam: inject a fake SAH-pool utility so jsdom tests can exercise
    // the OPFS code paths without a real browser OPFS.
    this.__opfsPoolPromise = pool == null ? undefined : Promise.resolve(pool);
    this.__opfsStatus = { available: pool != null, reason: pool ? null : 'unsupported', error: null };
  }

  static _studyDbBase(dbPath) {
    const leaf = String(dbPath).split('/').pop() || 'study';
    return leaf.replace(/\.sqlite$/i, '').replace(/[^A-Za-z0-9._-]/g, '-');
  }

  static _opfsNameFor(dbPath, sha256) {
    const base = this._studyDbBase(dbPath);
    const tag = sha256 && sha256.length >= 8 ? sha256.slice(0, 8) : 'import';
    return '/study/' + base + '.' + tag + '.sqlite';
  }

  static _studyMetaKey(dbPath) {
    return 'study-opfs:' + dbPath;
  }

  static async _getStudyMeta(dbPath) {
    try {
      if (typeof window === 'undefined' || !window.idb) return null;
      return await window.idb.get('metadata', this._studyMetaKey(dbPath));
    } catch (e) {
      return null;
    }
  }

  static async _writeStudyMeta(dbPath, patch) {
    try {
      if (typeof window === 'undefined' || !window.idb) return;
      const key = this._studyMetaKey(dbPath);
      const prev = (await this._getStudyMeta(dbPath)) || { key, dbPath, state: 'absent' };
      const merged = { ...prev, ...patch, key, dbPath };
      if (patch.state === 'ready') {
        if (patch.prevOpfsFilename !== undefined) {
          // Importers pass explicit sibling pointers (they knew the previous
          // READY generation before writing an `importing` record).
          merged.prevOpfsFilename = patch.prevOpfsFilename || null;
          merged.prevSha = patch.prevSha || null;
        } else if (prev.state === 'ready' && prev.opfsFilename && prev.opfsFilename !== merged.opfsFilename) {
          // A new generation is becoming active: keep the prior one as the
          // crash/recovery sibling.
          merged.prevOpfsFilename = prev.opfsFilename;
          merged.prevSha = prev.sha256 || null;
        }
      }
      if (patch.state !== 'ready') {
        delete merged.prevOpfsFilename;
        delete merged.prevSha;
      }
      await window.idb.put('metadata', merged);
    } catch (e) {
      console.warn('[BibleDB] failed to record study DB metadata:', e);
    }
  }

  static async _removeStudyGenerationFile(pool, name) {
    try {
      if (pool && name && pool.getFileNames().indexOf(name) >= 0) pool.unlink(name);
    } catch (e) {}
  }

  static async _openOpfsDb(pool, filename) {
    try {
      const DbCtor = pool.OpfsSAHPoolDb;
      if (typeof DbCtor !== 'function') return null;
      return new DbCtor(filename, 'r');
    } catch (e) {
      return null;
    }
  }

  static _runDbValidation(db, validate) {
    if (typeof validate === 'function') {
      try {
        const r = validate(db);
        if (r && typeof r.then === 'function') return false; // validators are sync here
        return r === true;
      } catch (e) {
        console.warn('[BibleDB] study DB validation threw:', e);
        return false;
      }
    }
    // Lightweight default: the database opens and exposes a schema.
    try {
      const rows = [];
      db.exec({ sql: 'SELECT name FROM sqlite_master LIMIT 1', rowMode: 'object', resultRows: rows });
      return true;
    } catch (e) {
      return false;
    }
  }

  // Imports `bytes` into a new content-addressed OPFS generation. Never
  // touches a currently-open generation. Returns the opened read-only DB, or
  // null on failure (in which case any half-written generation is removed and
  // the previous READY generation is restored).
  static async _importStudyGeneration({ pool, dbPath, sha256, validate, label, getBytes = null }) {
    const name = this._opfsNameFor(dbPath, sha256);
    const prev = await this._getStudyMeta(dbPath);
    const prevReady = (prev && prev.state === 'ready') ? prev : null;
    await this._writeStudyMeta(dbPath, { state: 'importing', sha256, opfsFilename: name });
    await this._removeStudyGenerationFile(pool, name);
    const restore = async () => {
      if (prevReady && prevReady.opfsFilename && pool.getFileNames().indexOf(prevReady.opfsFilename) >= 0) {
        await this._writeStudyMeta(dbPath, { state: 'ready', sha256: prevReady.sha256, opfsFilename: prevReady.opfsFilename });
      } else if (prevReady && prevReady.opfsFilename) {
        await this._writeStudyMeta(dbPath, { state: 'absent', sha256: null, opfsFilename: null, prevOpfsFilename: null });
      } else {
        await this._writeStudyMeta(dbPath, { state: 'absent', sha256: null, opfsFilename: null });
      }
    };
    try {
      const bytes = getBytes ? await getBytes() : await this._sha256FetchBody(dbPath);
      if (!bytes) throw new Error('no bytes available');
      const actualSha = await this._sha256Hex(bytes);
      if (actualSha !== BibleDB.SHA_UNAVAILABLE && actualSha !== sha256) {
        throw new Error('hash mismatch during OPFS import');
      }
      // Chunked import: avoid one giant synchronous SAH write for the 343 MB DB.
      const CHUNK = 1024 * 1024;
      let offset = 0;
      const feed = () => {
        if (offset >= bytes.byteLength) return undefined;
        const end = Math.min(offset + CHUNK, bytes.byteLength);
        const part = bytes.subarray(offset, end);
        offset = end;
        return part;
      };
      await pool.importDb(name, feed);
      const db = await this._openOpfsDb(pool, name);
      if (!db) throw new Error('open failed after import');
      if (!this._runDbValidation(db, validate)) {
        try { db.close(); } catch (e) {}
        await this._removeStudyGenerationFile(pool, name);
        this._setOpfsStatus(false, 'validation-failed', new Error('study DB failed validation'));
        await restore();
        return null;
      }
      await this._writeStudyMeta(dbPath, { state: 'ready', sha256, opfsFilename: name, prevOpfsFilename: prevReady ? prevReady.opfsFilename : null, prevSha: prevReady ? (prevReady.sha256 || null) : null });
      await this._setVerifiedSha(dbPath, sha256);
      console.log('[BibleDB]', label || this._studyDbBase(dbPath), ': OPFS generation ready', name);
      return db;
    } catch (e) {
      this._setOpfsStatus(false, /quota|storage/i.test(String(e && e.message || '')) ? 'quota' : 'import-failed', e);
      console.warn('[BibleDB] OPFS import failed for', dbPath, e);
      await this._removeStudyGenerationFile(pool, name);
      await restore();
      return null;
    }
  }

  static async _sha256FetchBody(dbPath) {
    const fetched = await BibleDB.fetchBytes(dbPath);
    return fetched && fetched.bytes ? fetched.bytes : null;
  }

  // Verifies a zip container (and, once inflated, the sqlite payload) against
  // a schema-v2 distribution manifest. Returns { ok, error } without throwing.
  static async _verifyAgainstManifest(kind, bytes, manifest) {
    const field = kind === 'zip' ? 'zipSha256' : 'sha256';
    const sizeField = kind === 'zip' ? 'zipSize' : 'size';
    const expectedSha = manifest ? manifest[field] : null;
    const expectedSize = manifest ? manifest[sizeField] : null;
    if (expectedSize != null && bytes.byteLength !== expectedSize) {
      return { ok: false, error: `${kind} size mismatch (got ${bytes.byteLength}, want ${expectedSize})` };
    }
    if (!expectedSha) return { ok: true };
    const actual = await this._sha256Hex(bytes);
    if (actual === BibleDB.SHA_UNAVAILABLE) {
      console.warn('[BibleDB] crypto.subtle unavailable — skipping', kind, 'SHA-256 check');
      return { ok: true };
    }
    if (actual !== expectedSha) {
      return { ok: false, error: `${kind} hash mismatch (got ${actual}, want ${expectedSha})` };
    }
    return { ok: true };
  }

  // Extracts the sqlite payload from a downloaded zip and verifies it against
  // the manifest. Returns { bytes } or null on any verification failure.
  static async extractZipResource(zipBytes, manifest) {
    if (!zipBytes || !zipBytes.byteLength) return null;
    const zipCheck = await this._verifyAgainstManifest('zip', zipBytes, manifest);
    if (!zipCheck.ok) {
      console.error('[BibleDB] zip verification failed:', zipCheck.error);
      return null;
    }
    let bytes;
    try {
      bytes = await window.ZipReader.extract(zipBytes, {
        expectedName: manifest && manifest.database ? manifest.database : undefined,
      });
    } catch (e) {
      console.error('[BibleDB] zip extraction failed:', e);
      return null;
    }
    const dbCheck = await this._verifyAgainstManifest('sqlite', bytes, manifest);
    if (!dbCheck.ok) {
      console.error('[BibleDB] sqlite verification failed:', dbCheck.error);
      return null;
    }
    return { bytes };
  }

  // Fetches a zipped study artifact through the shared cache, verifies the zip
  // against its manifest, inflates it, verifies the sqlite payload, and
  // returns { bytes }. A stale/mismatched cached zip is dropped once and
  // re-fetched from the network before failing.
  static async _resolveZipResource({ zipUrl, manifest, forceNetwork = false }) {
    let fetched = await BibleDB.fetchBytes(zipUrl, forceNetwork);
    let zipBytes = fetched && fetched.bytes;
    if (!zipBytes || !zipBytes.byteLength) return null;
    let result = await this.extractZipResource(zipBytes, manifest);
    if (!result) {
      await BibleDB._deleteCached(zipUrl);
      fetched = await BibleDB.fetchBytes(zipUrl, true);
      zipBytes = fetched && fetched.bytes;
      if (!zipBytes || !zipBytes.byteLength) return null;
      result = await this.extractZipResource(zipBytes, manifest);
      if (!result) {
        console.error('[BibleDB] zip resource failed verification after fresh download:', zipUrl);
        return null;
      }
    }
    return result;
  }

  // Recover interrupted migration state: metadata in IMPORTING/VALIDATING, or
  // READY metadata whose file is missing/unusable, is reset so the next
  // openStudyDb call re-imports cleanly. Leaves any usable READY file (current
  // or previous) untouched.
  static async _recoverStudyState({ pool, dbPath }) {
    const meta = await this._getStudyMeta(dbPath);
    if (!meta) return;
    const staleReady = meta.state === 'ready' && meta.opfsFilename && pool.getFileNames().indexOf(meta.opfsFilename) < 0;
    const interrupted = meta.state === 'importing' || meta.state === 'validating';
    if (staleReady) {
      // Try to fall back to a still-present previous generation before wiping
      // state, so a missing current file never strands the database.
      if (meta.prevOpfsFilename && pool.getFileNames().indexOf(meta.prevOpfsFilename) >= 0) {
        console.warn('[BibleDB]', this._studyDbBase(dbPath), ': metadata READY but file missing — reverting to previous generation');
        await this._writeStudyMeta(dbPath, { state: 'ready', sha256: meta.prevSha || null, opfsFilename: meta.prevOpfsFilename, prevOpfsFilename: null, prevSha: null });
        return;
      }
      console.warn('[BibleDB]', this._studyDbBase(dbPath), ': metadata READY but OPFS file missing — will re-import');
      await this._writeStudyMeta(dbPath, { state: 'absent', sha256: null, opfsFilename: null, prevOpfsFilename: null });
      return;
    }
    if (interrupted) {
      console.warn('[BibleDB]', this._studyDbBase(dbPath), ': interrupted migration (' + meta.state + ') — will re-import');
      await this._writeStudyMeta(dbPath, { state: 'absent', sha256: null, opfsFilename: null });
    }
  }

  // Opens (importing if necessary) a study database via OPFS, returning a
  // read-only handle that behaves exactly like an in-memory oo1.DB. Falls
  // back to the memory SQLite path whenever OPFS is unavailable or a step
  // fails. Services must not contain OPFS-specific logic. When `zip`
  // ({ url, manifest }) is supplied, raw bytes are sourced from the verified
  // zip distribution instead of a plain sqlite download.
  static async openStudyDb({ dbPath, expectedSha256 = null, validate = null, label = null, zip = null }) {
    const getBytes = zip
      ? () => this._resolveZipResource({ zipUrl: zip.url, manifest: zip.manifest })
      : null;
    const memoryFallback = () => (zip
      ? this.createDbFromBytes(dbPath, expectedSha256, { zip })
      : this.createDbFromBytes(dbPath, expectedSha256));
    const pool = await this._getOpfsPool();
    if (!pool) {
      return memoryFallback();
    }
    await this._recoverStudyState({ pool, dbPath });
    const meta = await this._getStudyMeta(dbPath);
    const metaReadyForSha = meta && meta.state === 'ready' && meta.opfsFilename &&
      (!expectedSha256 || meta.sha256 === expectedSha256);
    if (metaReadyForSha && pool.getFileNames().indexOf(meta.opfsFilename) >= 0) {
      const db = await this._openOpfsDb(pool, meta.opfsFilename);
      if (db && this._runDbValidation(db, validate)) {
        const tag = (meta.sha256 || 'ready').slice(0, 8);
        console.log('[BibleDB]', label || this._studyDbBase(dbPath), ': OPFS hit', tag);
        return db;
      }
      if (db) { try { db.close(); } catch (e) {} }
      console.warn('[BibleDB]', label || this._studyDbBase(dbPath), ': OPFS metadata READY but file unusable — repairing');
    }
    // Metadata READY but file missing → re-import (recovery). Content
    // addressing means the old generation (if any) stays untouched.
    const sha = expectedSha256 || null;
    if (!sha) {
      const bytes = getBytes ? await getBytes() : await this._sha256FetchBody(dbPath);
      if (!bytes) return memoryFallback();
      const actual = await this._sha256Hex(bytes);
      if (actual === BibleDB.SHA_UNAVAILABLE) return memoryFallback();
      return this._importWithBytes({ dbPath, bytes, sha256: actual, validate, label, pool });
    }
    const db = await this._importStudyGeneration({ pool, dbPath, sha256: sha, validate, label, getBytes });
    if (!db) {
      // OPFS import failed for a manifest-sha DB: fall back to the memory path
      // (createDbFromBytes reuses the cache/verified-bytes flow).
      return memoryFallback();
    }
    return db;
  }

  static async _importWithBytes({ dbPath, bytes, sha256, validate, label, pool }) {
    const name = this._opfsNameFor(dbPath, sha256);
    const prev = await this._getStudyMeta(dbPath);
    const prevReady = (prev && prev.state === 'ready') ? prev : null;
    await this._writeStudyMeta(dbPath, { state: 'importing', sha256, opfsFilename: name });
    await this._removeStudyGenerationFile(pool, name);
    const restore = async () => {
      if (prevReady && prevReady.opfsFilename) {
        await this._writeStudyMeta(dbPath, { state: 'ready', sha256: prevReady.sha256, opfsFilename: prevReady.opfsFilename, prevOpfsFilename: prevReady.prevOpfsFilename || null, prevSha: prevReady.prevSha || null });
      } else {
        await this._writeStudyMeta(dbPath, { state: 'absent', sha256: null, opfsFilename: null });
      }
    };
    try {
      const CHUNK = 1024 * 1024;
      let offset = 0;
      const feed = () => {
        if (offset >= bytes.byteLength) return undefined;
        const end = Math.min(offset + CHUNK, bytes.byteLength);
        const part = bytes.subarray(offset, end);
        offset = end;
        return part;
      };
      await pool.importDb(name, feed);
      const db = await this._openOpfsDb(pool, name);
      if (!db) throw new Error('open failed after import');
      if (!this._runDbValidation(db, validate)) {
        try { db.close(); } catch (e) {}
        await this._removeStudyGenerationFile(pool, name);
        this._setOpfsStatus(false, 'validation-failed', new Error('study DB failed validation'));
        await restore();
        return null;
      }
      await this._writeStudyMeta(dbPath, { state: 'ready', sha256, opfsFilename: name, prevOpfsFilename: prevReady ? prevReady.opfsFilename : null, prevSha: prevReady ? (prevReady.sha256 || null) : null });
      await this._setVerifiedSha(dbPath, sha256);
      console.log('[BibleDB]', label || this._studyDbBase(dbPath), ': OPFS generation ready', name);
      return db;
    } catch (e) {
      this._setOpfsStatus(false, /quota|storage/i.test(String(e && e.message || '')) ? 'quota' : 'import-failed', e);
      console.warn('[BibleDB] OPFS import failed for', dbPath, e);
      await this._removeStudyGenerationFile(pool, name);
      await restore();
      return null;
    }
  }

  // Import `bytes` (e.g. a freshly downloaded update) as a NEW generation and
  // return a handle, keeping any previous generation on disk. Falls back to an
  // awaited in-memory `_deserialize` when OPFS is unavailable.
  static async acceptStudyDbBytes({ dbPath, bytes, expectedSha256 = null, validate = null, label = null }) {
    const pool = await this._getOpfsPool();
    if (!pool) {
      if (!bytes || !bytes.byteLength) return null;
      const db = await BibleDB._deserialize(bytes);
      return db;
    }
    if (!bytes || !bytes.byteLength) return null;
    let sha = expectedSha256;
    if (!sha) {
      const actual = await this._sha256Hex(bytes);
      if (actual === BibleDB.SHA_UNAVAILABLE) {
        return BibleDB._deserialize(bytes);
      }
      sha = actual;
    }
    const meta = await this._getStudyMeta(dbPath);
    const name = this._opfsNameFor(dbPath, sha);
    if (meta && meta.state === 'ready' && meta.opfsFilename === name && pool.getFileNames().indexOf(name) >= 0) {
      const existing = await this._openOpfsDb(pool, name);
      if (existing && this._runDbValidation(existing, validate)) {
        return existing;
      }
      if (existing) { try { existing.close(); } catch (e) {} }
    }
    return this._importWithBytes({ pool, dbPath, bytes, sha256: sha, validate, label });
  }

  // Idle-time migration: populate OPFS generations from CacheStorage/verified
  // bytes without holding any database open in memory. Prefers the openers the
  // study services registered at construction so validation matches the exact
  // schema the app will use; falls back to a generic manifest-driven open.
  static async migrateStudyDatabasesToOpfs() {
    const pool = await this._getOpfsPool();
    if (!pool) return false;
    const configs = BibleDB._getRegisteredStudyDbOpeners().length
      ? BibleDB._getRegisteredStudyDbOpeners()
      : BibleDB._studyDbConfigs();
    for (const cfg of configs) {
      try {
        let db = null;
        if (typeof cfg.open === 'function') {
          db = await cfg.open();
        } else {
          // Fetch the expected manifest SHA for DBs that publish one, so the
          // content-addressed name matches the version the app will actually use.
          let expectedSha = null;
          let manifest = null;
          if (cfg._manifestPath) {
            try {
              const resp = await fetch(cfg._manifestPath, { cache: 'no-store' });
              if (resp.ok) {
                manifest = await resp.json();
                if (manifest && manifest.sha256) expectedSha = manifest.sha256;
              }
            } catch (e) {}
          }
          db = await BibleDB.openStudyDb({
            dbPath: cfg.dbPath,
            expectedSha256: expectedSha,
            validate: cfg.validate || null,
            label: cfg.label,
            zip: cfg._zipUrl && manifest ? { url: cfg._zipUrl, manifest } : null,
          });
        }
        if (db) { try { db.close(); } catch (e) {} }
      } catch (e) {
        console.warn('[BibleDB] background OPFS migration failed for', cfg.dbPath, e);
      }
    }
    await BibleDB.cleanupOldOpfsGenerations();
    return true;
  }

  static _studyDbConfigs() {
    const out = [];
    const cfg = (typeof AppConfig !== 'undefined') ? AppConfig : {};
    const push = (dbPath, manifestPath, label, zipUrl = null) => {
      if (!dbPath) return;
      out.push({
        dbPath,
        label,
        expectedSha256: null,
        validate: null,
        _manifestPath: manifestPath || null,
        _zipUrl: zipUrl || null,
      });
    };
    push(cfg.WORD_CLASSES_DB, cfg.WORD_CLASSES_DB_MANIFEST, 'word-classes', cfg.WORD_CLASSES_DB_ZIP);
    push(cfg.WORD_STUDY_DB, cfg.WORD_STUDY_DB_MANIFEST, 'word-study', cfg.WORD_STUDY_DB_ZIP);
    push(cfg.WORD_STUDY_DATA_DB, cfg.WORD_STUDY_DATA_DB_MANIFEST, 'word-data', cfg.WORD_STUDY_DATA_DB_ZIP);
    push(cfg.LEXICON_DATA_DB, cfg.LEXICON_DATA_DB_MANIFEST, 'lexicon', cfg.LEXICON_DATA_DB_ZIP);
    push(cfg.VERSE_TOPICS_DB, cfg.VERSE_TOPICS_MANIFEST, 'verse-topics', cfg.VERSE_TOPICS_DB_ZIP);
    return out;
  }

  // Background migration is DB-agnostic: instead of embedding service logic
  // (fetching a manifest, running schema validation) inside BibleDB, each
  // study service registers a small opener so the migration can build a READY
  // generation without the service being constructed yet.
  static _registerStudyDbOpener(label, dbPath, openFn) {
    if (!this.__studyDbOpeners) this.__studyDbOpeners = new Map();
    this.__studyDbOpeners.set(dbPath, { label, dbPath, open: openFn });
  }

  static _getRegisteredStudyDbOpeners() {
    return this.__studyDbOpeners ? Array.from(this.__studyDbOpeners.values()) : [];
  }

  static async cleanupOldOpfsGenerations() {
    const pool = await this._getOpfsPool();
    if (!pool) return;
    const keep = new Set();
    let records = [];
    try {
      if (typeof window !== 'undefined' && window.idb && typeof window.idb.getAll === 'function') {
        const all = await window.idb.getAll('metadata');
        records = (all || []).filter(r => typeof r.key === 'string' && r.key.indexOf('study-opfs:') === 0);
      }
    } catch (e) {}
    for (const r of records) {
      if (r.opfsFilename) keep.add(r.opfsFilename);
      if (r.prevOpfsFilename) keep.add(r.prevOpfsFilename);
    }
    const files = [];
    try { files.push(...(pool.getFileNames() || [])); } catch (e) {}
    for (const f of files) {
      if (typeof f === 'string' && f.indexOf('/study/') === 0 && !keep.has(f)) {
        try { pool.unlink(f); } catch (e) {}
      }
    }
  }

  static async getStorageStatus() {
    const databases = [];
    const pool = await this._getOpfsPool();
    for (const cfg of BibleDB._studyDbConfigs()) {
      let state = 'absent';
      let opfsFile = null;
      const meta = await this._getStudyMeta(cfg.dbPath);
      if (meta && meta.state === 'ready' && meta.opfsFilename && pool && pool.getFileNames().indexOf(meta.opfsFilename) >= 0) {
        state = 'ready';
        opfsFile = meta.opfsFilename;
      } else if (meta) {
        state = meta.state || 'absent';
      }
      databases.push({ label: cfg.label, dbPath: cfg.dbPath, opfs: state === 'ready', state, opfsFile });
    }
    return { opfs: { ...this._opfsStatus }, databases };
  }

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

static async createDbFromBytes(dbPath, expectedSha256 = null, opts = null) {
    const sqlite3 = await BibleDB._sqliteWasmPromise;
    let bytes = null;
    if (opts && opts.zip) {
      const resolved = await BibleDB._resolveZipResource({
        zipUrl: opts.zip.url,
        manifest: opts.zip.manifest,
      });
      bytes = resolved && resolved.bytes;
      if (bytes && expectedSha256) {
        await BibleDB._setVerifiedSha(dbPath, expectedSha256);
      }
    } else {
      const fetched = await BibleDB.fetchBytes(dbPath);
      bytes = fetched.bytes;
    }
    if (!bytes || !bytes.length) return null;

    // Verify integrity, but only once per artifact version. A successful
    // check records the expected hash so later loads from the cache skip the
    // (potentially hundreds-of-MB) digest pass. On a mismatch the cached
    // copy is stale — drop it and retry a fresh download before giving up.
    if (expectedSha256 && !(opts && opts.zip)) {
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

  static async checkForUpdates(dbPath, forceNetwork = false) {
    try {
      if (typeof caches === 'undefined') return { updated: false };
      const cache = await caches.open('bible-database-cache');
      const cached = await cache.match(dbPath);
      if (!cached && !forceNetwork) return { updated: false };

      const headers = {};
      if (!forceNetwork && cached) {
        const etag = cached.headers ? cached.headers.get('ETag') : null;
        const lastModified = cached.headers ? cached.headers.get('Last-Modified') : null;
        if (etag) headers['If-None-Match'] = etag;
        if (lastModified) headers['If-Modified-Since'] = lastModified;
      }

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
