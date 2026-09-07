window.ScriptureRepositoryService = class ScriptureRepositoryService {
  constructor() {
    this._repositories = [];
    this._installed = [];
    this._cachedManifests = new Map();
    this._sqlite3 = null;
    this._ready = this._init();
  }

  static get DEFAULT_REPO_URL() { return 'https://repo.focusedword.com'; }
  static get DEFAULT_REPO_NAME() { return 'Focused Word Repository'; }

  async _init() {
    try {
      await window.idb._ready;
      this._repositories = await window.idb.getAllRepositories();
      this._installed = await window.idb.getAllInstalledDatabases();
      try {
        const cached = await window.idb.getAllRepoManifests();
        for (const entry of cached) {
          if (entry && entry.repo_id) this._cachedManifests.set(entry.repo_id, entry);
        }
      } catch (e) {
        console.error('[RepoService] Manifest cache init failed:', e);
      }
    } catch (e) {
      console.error('[RepoService] IDB init failed:', e);
    }
    await this._seedDefaultRepo();
  }

  async _seedDefaultRepo() {
    const url = window.UrlValidator.normalizeUrl(ScriptureRepositoryService.DEFAULT_REPO_URL);
    const has = this._repositories.some(r => r.url === url);
    if (has) return;
    try {
      const repo = await this._registerRaw(url, ScriptureRepositoryService.DEFAULT_REPO_NAME);
      this._repositories.push(repo);
    } catch (e) {
      console.warn('[RepoService] Failed to seed default repo:', e);
    }
  }

  async _registerRaw(url, name) {
    const normalized = window.UrlValidator.normalizeUrl(url);
    if (!window.UrlValidator.isAllowedEndpoint(normalized)) {
      throw new Error('Repository URL must use HTTPS (or HTTP for localhost development only)');
    }
    if (typeof name !== 'string' || name.length > 200) {
      throw new Error('Repository name must be a string of at most 200 characters');
    }
    const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    const repo = { id, url: normalized, name, access_key: null, created_at: Date.now(), checked_at: null, updated_at: Date.now() };
    await window.idb.putRepository(repo);
    return repo;
  }

  get ready() { return this._ready; }
  get repositories() { return this._repositories; }
  get installed() { return this._installed; }

  async _getSqlite3() {
    if (this._sqlite3) return this._sqlite3;
    const mod = await BibleDB._sqliteWasmPromise;
    this._sqlite3 = mod;
    return mod;
  }

  async _hasOpfsVfs() {
    const sqlite3 = await this._getSqlite3();
    return !!(sqlite3.oo1?.OpfsDb?.importDb);
  }

  // ─── Repository CRUD ────────────────────────────────────────

  async registerRepository(url, name) {
    const repo = await this._registerRaw(url, name);
    this._repositories.push(repo);
    return repo;
  }

  async removeRepository(id) {
    await window.idb.deleteRepository(id);
    this._repositories = this._repositories.filter(r => r.id !== id);
    await this.removeManifestCache(id);
  }

  async markRepositoryDeleted(id) {
    const repo = this._repositories.find(r => r.id === id);
    if (!repo) return;
    repo.deleted = true;
    repo.updated_at = Date.now();
    await window.idb.putRepository(repo);
    this._repositories = this._repositories.filter(r => r.id !== id);
    await this.removeManifestCache(id);
  }

  async saveAccessKey(repoId, key) {
    const repo = this._repositories.find(r => r.id === repoId);
    if (!repo) return;
    repo.access_key = key;
    repo.updated_at = Date.now();
    await window.idb.putRepository(repo);
  }

  async clearAccessKey(repoId) {
    const repo = this._repositories.find(r => r.id === repoId);
    if (!repo) return;
    repo.access_key = null;
    repo.updated_at = Date.now();
    await window.idb.putRepository(repo);
  }

  // ─── Limits ────────────────────────────────────────────────

  static get MAX_DOWNLOAD_SIZE() { return 250 * 1024 * 1024; }
  static get MAX_MANIFEST_SIZE() { return 1024 * 1024; }
  static get MAX_PAYLOAD_SIZE() { return 1024 * 1024; }
  static get MAX_PBKDF2_ITERATIONS() { return 2000000; }

  // ─── Manifest Fetch ─────────────────────────────────────────

  async checkRepository(repoUrl) {
    const url = window.UrlValidator.normalizeUrl(repoUrl) + '/manifest.json';
    if (!window.UrlValidator.isAllowedEndpoint(url.replace(/\/manifest\.json$/, ''))) {
      throw new Error('Repository URL must use HTTPS (or HTTP for localhost)');
    }
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Manifest fetch failed: ${resp.status}`);
    const contentLen = resp.headers.get('Content-Length');
    if (contentLen && parseInt(contentLen) > ScriptureRepositoryService.MAX_MANIFEST_SIZE) {
      throw new Error('Manifest exceeds maximum size');
    }
    const text = await resp.text();
    if (text.length > ScriptureRepositoryService.MAX_MANIFEST_SIZE) {
      throw new Error('Manifest exceeds maximum size');
    }
    let manifest;
    try { manifest = JSON.parse(text); } catch { throw new Error('Manifest is not valid JSON'); }
    if (manifest.repo_name && (typeof manifest.repo_name !== 'string' || manifest.repo_name.length > 200)) {
      throw new Error('Invalid repository name in manifest');
    }
    const publicTranslations = Array.isArray(manifest.public_translations)
      ? manifest.public_translations.map(t => this._normalizeTranslation(t, false))
      : [];
    const encryptedPayload = manifest.encrypted_payload || null;
    if (encryptedPayload && typeof encryptedPayload === 'string' && encryptedPayload.length > ScriptureRepositoryService.MAX_PAYLOAD_SIZE) {
      throw new Error('Encrypted payload exceeds maximum size');
    }
    return {
      repo_name: manifest.repo_name || null,
      publicTranslations,
      hasProtected: !!encryptedPayload,
      encryptedPayload
    };
  }

  // ─── Cached Manifests (availability without browsing) ─────
  // The Bible pickers list translations from every connected repository,
  // downloaded or not. Manifests are fetched at startup (and whenever a
  // repo is browsed) and persisted in IndexedDB so the listing works
  // offline. Nothing is downloaded until the user selects a translation.

  _stripManifestTranslation(t) {
    return {
      id: t.id,
      name: t.name,
      abbreviation: t.abbreviation || '',
      fullname: t.fullname || null,
      language: t.language || 'en',
      file_name: t.file_name,
      size_bytes: t.size_bytes || null,
      version: t.version || null,
      checksum: t.checksum || null,
      copyright: t.copyright || null,
      description: t.description || null,
      encrypted: !!t.encrypted
    };
  }

  async cacheManifest(repo, result) {
    const entry = {
      repo_id: repo.id,
      repo_url: repo.url,
      repo_name: result.repo_name || repo.repo_name || repo.name,
      publicTranslations: (result.publicTranslations || []).map(t => this._stripManifestTranslation(t)),
      hasProtected: !!result.hasProtected,
      encryptedPayload: result.encryptedPayload || null,
      hiddenTranslations: result.hiddenTranslations
        ? result.hiddenTranslations.map(t => this._stripManifestTranslation(t))
        : null,
      checked_at: Date.now()
    };
    await window.idb.putRepoManifest(entry);
    this._cachedManifests.set(repo.id, entry);
    return entry;
  }

  async removeManifestCache(repoId) {
    this._cachedManifests.delete(repoId);
    try {
      await window.idb.deleteRepoManifest(repoId);
    } catch (e) {
      console.warn('[RepoService] Failed to drop cached manifest:', e);
    }
  }

  async refreshManifest(repo) {
    const result = await this.checkRepository(repo.url);
    // Protected translations are only exposed to the pickers when the
    // repo's access key is already saved (same rule as the repo browser).
    if (result.hasProtected && repo.access_key) {
      try {
        result.hiddenTranslations = await this.unlockRepository(
          repo.url, result.encryptedPayload, repo.access_key
        );
      } catch (e) {
        console.warn('[RepoService] Background unlock failed for', repo.url + ':', e.message);
      }
    }
    return this.cacheManifest(repo, result);
  }

  async refreshAllManifests() {
    const refreshed = [];
    for (const repo of this._repositories) {
      try {
        await this.refreshManifest(repo);
        refreshed.push(repo.id);
      } catch (e) {
        console.warn('[RepoService] Manifest refresh failed for', repo.url + ':', e.message);
      }
    }
    return refreshed;
  }

  // ─── Download on Selection ────────────────────────────────

  async ensureInstalled(entry) {
    if (!entry) return { ok: false, error: 'Unknown translation' };
    if (this._installed.some(i => i.translation_id === entry.id)) {
      return { ok: true, already: true };
    }
    const t = entry.translation;
    const repoUrl = entry.repo_url;
    if (!t || !t.file_name || !repoUrl) {
      return { ok: false, error: 'This translation is not available for download' };
    }
    let repo = entry.repo_id
      ? this._repositories.find(r => r.id === entry.repo_id)
      : null;
    if (!repo) {
      const norm = window.UrlValidator ? window.UrlValidator.normalizeUrl(repoUrl) : repoUrl;
      repo = this._repositories.find(r => r.url === norm);
    }
    if (!repo) {
      return { ok: false, error: 'The source repository is no longer connected' };
    }
    const password = t.encrypted ? repo.access_key : null;
    if (t.encrypted && !password) {
      return { ok: false, error: 'This translation is protected — open the repository browser and enter its access key first.' };
    }
    try {
      const record = await this.downloadAndInstall(repo.url, t, password);
      return { ok: true, record };
    } catch (e) {
      console.error('[RepoService] On-select download failed:', e);
      return { ok: false, error: e.message || 'Download failed' };
    }
  }

  // ─── Manifest Payload Decryption ────────────────────────────

  async unlockRepository(repoUrl, encryptedPayload, password) {
    const { salt, nonce, ciphertext, iterations } = this._decodeEncryptedPayload(encryptedPayload);
    const plainBuf = await this._pbkdf2Decrypt(password, salt, nonce, ciphertext, iterations);
    const text = new TextDecoder().decode(plainBuf);
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      throw new Error('Decrypted payload is not an array — expected flat translation list');
    }
    return parsed.map(t => this._normalizeTranslation(t, true));
  }

  _decodeEncryptedPayload(payload) {
    if (typeof payload !== 'string') {
      throw new Error('encrypted_payload must be a string, got ' + typeof payload);
    }
    if (payload.length > ScriptureRepositoryService.MAX_PAYLOAD_SIZE) {
      throw new Error('Encrypted payload exceeds maximum size');
    }

    if (payload.trim().startsWith('{')) {
      return this._decodeJsonEnvelope(payload);
    }
    return this._decodePackedBase64(payload);
  }

  _decodePackedBase64(payload) {
    const cleaned = payload.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = cleaned.length % 4 === 0 ? cleaned : cleaned + '='.repeat(4 - cleaned.length % 4);
    let raw;
    try {
      raw = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    } catch (e) {
      console.error('[RepoService] Base64 decode failed. length:', payload.length, 'first 50:', payload.slice(0, 50));
      throw new Error('Failed to decode packed encrypted payload: ' + e.message);
    }
    if (raw.length < 29) {
      throw new Error('Packed payload too short — need at least 29 bytes');
    }
    return {
      salt: raw.slice(0, 16),
      nonce: raw.slice(16, 28),
      ciphertext: raw.slice(28),
      iterations: 390000
    };
  }

  _decodeJsonEnvelope(payload) {
    let envelope;
    try {
      envelope = JSON.parse(payload);
    } catch (e) {
      throw new Error('Invalid encrypted_payload JSON: ' + e.message);
    }
    if (!envelope.s || !envelope.n || !envelope.c) {
      throw new Error('JSON envelope missing required fields: s (salt), n (nonce), c (ciphertext)');
    }
    return {
      salt: this._hexToBytes(envelope.s, 16, 'salt'),
      nonce: this._hexToBytes(envelope.n, 12, 'nonce'),
      ciphertext: this._hexToBytes(envelope.c, 0, 'ciphertext'),
      iterations: (typeof envelope.i === 'number' && envelope.i > 0 && envelope.i <= ScriptureRepositoryService.MAX_PBKDF2_ITERATIONS) ? envelope.i : 390000
    };
  }

  _hexToBytes(hex, expectedLen, label) {
    if (typeof hex !== 'string' || !/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
      throw new Error('Invalid hex ' + label + ': must be an even-length hex string');
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    if (expectedLen > 0 && bytes.length !== expectedLen) {
      throw new Error('Invalid hex ' + label + ': expected ' + expectedLen + ' bytes, got ' + bytes.length);
    }
    return bytes;
  }

  _decodeEncryptedFileBytes(bytes) {
    if (bytes.length > ScriptureRepositoryService.MAX_DOWNLOAD_SIZE) {
      throw new Error('Encrypted file exceeds maximum size');
    }
    if (bytes[0] === 0x7b) {
      const text = new TextDecoder().decode(bytes);
      const parsed = JSON.parse(text);
      if (!parsed.s || !parsed.n || !parsed.c) {
        throw new Error('JSON envelope missing required fields');
      }
      const iterations = (typeof parsed.i === 'number' && parsed.i > 0) ? parsed.i : 390000;
      if (iterations > ScriptureRepositoryService.MAX_PBKDF2_ITERATIONS) {
        throw new Error('PBKDF2 iterations (' + iterations + ') exceeds maximum (' + ScriptureRepositoryService.MAX_PBKDF2_ITERATIONS + ')');
      }
      return {
        salt: this._hexToBytes(parsed.s, 16, 'salt'),
        nonce: this._hexToBytes(parsed.n, 12, 'nonce'),
        ciphertext: this._hexToBytes(parsed.c, 0, 'ciphertext'),
        iterations
      };
    }
    if (bytes.length < 29) {
      throw new Error('Encrypted file too short');
    }
    return {
      salt: bytes.slice(0, 16),
      nonce: bytes.slice(16, 28),
      ciphertext: bytes.slice(28),
      iterations: 390000
    };
  }

  // ─── Download + Install ─────────────────────────────────────

  async downloadAndInstall(repoUrl, translation, password) {
    const fileUrl = this._resolveTranslationUrl(repoUrl, translation);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    let resp;
    try {
      resp = await fetch(fileUrl, { signal: controller.signal });
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Download timed out after 120 seconds');
      throw e;
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);

    // Enforce content-length limit
    const contentLen = resp.headers.get('Content-Length');
    if (contentLen && parseInt(contentLen) > ScriptureRepositoryService.MAX_DOWNLOAD_SIZE) {
      throw new Error('Download exceeds maximum file size');
    }

    // Stream download with size cap
    const reader = resp.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > ScriptureRepositoryService.MAX_DOWNLOAD_SIZE) {
        reader.cancel();
        throw new Error('Download exceeds maximum file size');
      }
      chunks.push(value);
    }
    let all = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      all.set(chunk, offset);
      offset += chunk.length;
    }

    // Verify SHA-256 checksum if declared
    if (translation.checksum) {
      const hash = await crypto.subtle.digest('SHA-256', all);
      const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
      if (hex !== translation.checksum.toLowerCase()) {
        throw new Error('Download checksum mismatch — expected ' + translation.checksum + ', got ' + hex);
      }
    }

    let bytes = all;

    if (translation.encrypted) {
      if (!password) throw new Error('Encrypted translation requires a decryption key');
      const { salt, nonce, ciphertext, iterations } = this._decodeEncryptedFileBytes(bytes);
      if (iterations > ScriptureRepositoryService.MAX_PBKDF2_ITERATIONS) {
        throw new Error('PBKDF2 iterations (' + iterations + ') exceeds maximum (' + ScriptureRepositoryService.MAX_PBKDF2_ITERATIONS + ')');
      }
      const plainBuf = await this._pbkdf2Decrypt(password, salt, nonce, ciphertext, iterations);
      bytes = new Uint8Array(plainBuf);
      const header = new TextDecoder().decode(bytes.slice(0, 15));
      if (header !== 'SQLite format 3') {
        throw new Error('Decrypted data is not a valid SQLite database');
      }
    } else {
      // Verify SQLite header for unencrypted downloads too
      const header = new TextDecoder().decode(bytes.slice(0, 15));
      if (header !== 'SQLite format 3') {
        throw new Error('Downloaded file is not a valid SQLite database');
      }
    }

    const lang = translation.language || 'en';
    const fileName = translation.file_name;

    // OPFS preferred with timeout, fallback to IDB
    let storage, opfsPath;
    const hasOpfs = await this._hasOpfsVfs();
    if (hasOpfs) {
      opfsPath = this._opfsPath(lang, fileName);
      try {
        await this._opfsImportWithTimeout(opfsPath, bytes, 60000);
        storage = 'opfs';
      } catch (e) {
        console.warn('[RepoService] OPFS import failed, falling back to IDB:', e);
        opfsPath = null;
      }
    }
    if (!storage) {
      await window.idb.putDatabaseBytes(translation.id, bytes);
      storage = 'idb';
    }

      const record = {
        translation_id: translation.id,
        name: this._displayName(translation),
        abbreviation: translation.abbreviation || this._abbrevFromId(translation.id),
        fullname: translation.fullname || translation.full_name || null,
        language: lang,
        file_name: fileName,
        repo_url: repoUrl,
        version: translation.version || null,
        checksum: translation.checksum || null,
        copyright: translation.copyright || null,
        installed_at: Date.now(),
        source: 'repository',
        storage
      };
    if (opfsPath) record.opfs_path = opfsPath;

    await window.idb.putInstalledDatabase(record);
    const existing = this._installed.findIndex(i => i.translation_id === record.translation_id);
    if (existing >= 0) {
      this._installed[existing] = record;
    } else {
      this._installed.push(record);
    }

    return record;
  }

  // ─── OPFS Bootstrapping (BSB) ───────────────────────────────

  static get BUNDLED_BSB_IDENTITY() {
    return { file_name: 'bsb_v3.sqlite', version: 3 };
  }

  async bootstrapBSB() {
    const existing = await window.idb.getInstalledDatabase('BSB');
    const expected = ScriptureRepositoryService.BUNDLED_BSB_IDENTITY;
    if (existing) {
      const stale = existing.file_name !== expected.file_name || existing.version !== expected.version;
      if (stale) {
        console.log('[RepoService] Bundled BSB changed, upgrading (' + (existing.file_name || '?') + ' -> ' + expected.file_name + ')');
      } else {
        if (!this._installed.find(i => i.translation_id === 'BSB')) {
          this._installed.push(existing);
        }
        return existing;
      }
    }

    const fileName = expected.file_name;
    let storage, opfsPath;
    const prevStorage = existing?.storage;
    const prevStorageKey = existing?.storage === 'idb' ? 'BSB' : null;
    const prevOpfsPath = existing?.opfs_path;

    try {
      const resp = await fetch('/scripture/' + expected.file_name);
      if (!resp.ok) throw new Error('Failed to fetch bundled BSB: ' + resp.status);
      const bytes = new Uint8Array(await resp.arrayBuffer());

      const hasOpfs = await this._hasOpfsVfs();
      if (hasOpfs) {
        opfsPath = this._opfsPath('en', fileName);
        const sqlite3 = await this._getSqlite3();
        try {
          await sqlite3.oo1.OpfsDb.importDb(opfsPath, bytes);
          storage = 'opfs';
        } catch (e) {
          console.warn('[RepoService] BSB OPFS import failed, using IDB:', e);
          await window.idb.putDatabaseBytes('BSB', bytes);
          storage = 'idb';
        }
      } else {
        await window.idb.putDatabaseBytes('BSB', bytes);
        storage = 'idb';
      }

      const record = {
        translation_id: 'BSB',
        name: 'BSB: Berean Standard Bible',
        abbreviation: 'BSB',
        fullname: 'Berean Standard Bible',
        language: 'en',
        file_name: fileName,
        version: expected.version,
        repo_url: null,
        copyright: 'Creative Commons CC0',
        installed_at: Date.now(),
        source: 'bundled',
        storage
      };
      if (opfsPath) record.opfs_path = opfsPath;

      await window.idb.putInstalledDatabase(record);
      this._installed = this._installed.filter(i => i.translation_id !== 'BSB');
      this._installed.push(record);

      // Clean up old storage after new record is committed
      if (existing) {
        if (prevStorage === 'idb' && prevStorageKey) {
          try { await window.idb.deleteDatabaseBytes('BSB'); } catch (e) { console.warn('[RepoService] Failed to clean up old IDB bytes:', e); }
        }
        if (prevStorage === 'opfs' && prevOpfsPath) {
          try {
            const sqlite3 = await this._getSqlite3();
            if (sqlite3.opfs?.unlink) await sqlite3.opfs.unlink(prevOpfsPath);
          } catch (e) { console.warn('[RepoService] Failed to clean up old OPFS:', e); }
        }
      }

      return record;
    } catch (e) {
      console.warn('[RepoService] BSB bootstrap failed, will use bundled fallback:', e);
      if (!existing && storage) {
        try {
          if (storage === 'idb') await window.idb.deleteDatabaseBytes('BSB');
          if (storage === 'opfs' && opfsPath) {
            const sqlite3 = await this._getSqlite3();
            if (sqlite3.opfs?.unlink) await sqlite3.opfs.unlink(opfsPath);
          }
        } catch (_) {}
      }
      return null;
    }
  }

  async removeInstalledDatabase(translationId) {
    const installed = this._installed.find(i => i.translation_id === translationId);
    if (installed?.storage === 'idb') {
      await window.idb.deleteDatabaseBytes(translationId);
    }
    if (installed?.storage === 'opfs' && installed.opfs_path) {
      try {
        const sqlite3 = await this._getSqlite3();
        if (sqlite3.opfs?.unlink) {
          await sqlite3.opfs.unlink(installed.opfs_path);
        }
      } catch (e) {
        console.warn('[RepoService] Failed to clean up OPFS file:', e);
      }
    }
    await window.idb.deleteInstalledDatabase(translationId);
    this._installed = this._installed.filter(i => i.translation_id !== translationId);
  }

  async migrateInstalledToOpfs() {
    const sqlite3 = await this._getSqlite3();
    const canOpfs = !!(sqlite3.opfs?.importDb || sqlite3.oo1?.OpfsDb?.importDb);
    if (!canOpfs) return 0;
    let migrated = 0;
    for (const record of this._installed) {
      if (record.storage !== 'idb') continue;
      const opfsPath = this._opfsPath(record.language || 'en', record.file_name);
      try {
        const bytes = await window.idb.getDatabaseBytes(record.translation_id);
        if (!bytes) continue;
        await this._opfsImportWithTimeout(opfsPath, bytes, 60000);
        record.storage = 'opfs';
        record.opfs_path = opfsPath;
        await window.idb.putInstalledDatabase(record);
        await window.idb.deleteDatabaseBytes(record.translation_id);
        migrated++;
      } catch (e) {
        console.warn(`[RepoService] OPFS migration skipped for ${record.translation_id}:`, e);
      }
    }
    return migrated;
  }

  // ─── Manifest Builder (for bridge.translationManifest) ──────

  async buildManifest() {
    const installed = await window.idb.getAllInstalledDatabases();
    const seen = new Set();
    const result = [];

    for (const t of this._BUNDLED) {
      result.push(t);
      seen.add(t.id);
    }
    for (const i of installed) {
      if (!seen.has(i.translation_id)) {
        result.push({
          id: i.translation_id,
          name: this._displayName(i),
          shortname: i.abbreviation || this._abbrevFromId(i.translation_id),
          lang: i.language || 'en',
          format: 'split',
          components: ['verses', 'blocks', 'chapters', 'notes'],
          copyright: i.copyright || ''
        });
        seen.add(i.translation_id);
      }
    }
    // Available (not yet downloaded) translations from every connected
    // repo. These flow into the Bible pickers with `available: true` plus
    // everything needed to download them on selection; nothing is fetched
    // until the user actually picks one.
    for (const cache of this._cachedManifests.values()) {
      const list = [...(cache.publicTranslations || [])];
      if (cache.hiddenTranslations) list.push(...cache.hiddenTranslations);
      for (const t of list) {
        if (!t || !t.id || seen.has(t.id)) continue;
        seen.add(t.id);
        result.push({
          id: t.id,
          name: this._displayName(t),
          shortname: t.abbreviation || this._abbrevFromId(t.id),
          lang: t.language || 'en',
          format: 'split',
          components: ['verses', 'blocks', 'chapters', 'notes'],
          copyright: t.copyright || '',
          description: t.description || '',
          size_bytes: t.size_bytes || null,
          available: true,
          repo_id: cache.repo_id,
          repo_url: cache.repo_url,
          translation: t
        });
      }
    }
    return result;
  }

  get _BUNDLED() {
    return [
      { id: 'BSB', name: 'BSB: Berean Standard Bible', shortname: 'BSB', lang: 'en', format: 'split', components: ['verses', 'blocks', 'chapters', 'notes'], copyright: 'Creative Commons CC0' }
    ];
  }

  // ─── Private Helpers ────────────────────────────────────────

  _abbrevFromId(id) {
    if (!id) return '';
    return id.replace(/_(?:v)?\d+$/i, '').toUpperCase();
  }

  _displayName(t) {
    const abbr = t.abbreviation || this._abbrevFromId(t.id || t.translation_id) || '';
    const full = t.fullname || t.full_name || t.name || '';
    if (!abbr) return full;
    if (full.startsWith(abbr + ':') || full.startsWith(abbr + ' \u00B7') || full === abbr) return full;
    return abbr + ': ' + full;
  }

  _normalizeTranslation(t, isProtected) {
    if (!t.id || !t.name || !t.file_name) {
      throw new Error('Translation object missing required fields (id, name, file_name)');
    }
    if (typeof t.id !== 'string' || t.id.length > 100) {
      throw new Error('Translation id must be a string of at most 100 characters');
    }
    if (typeof t.name !== 'string' || t.name.length > 300) {
      throw new Error('Translation name must be a string of at most 300 characters');
    }
    if (typeof t.file_name !== 'string' || t.file_name.length > 200 || /[<>:"/\\|?*]/.test(t.file_name)) {
      throw new Error('Translation file_name contains invalid characters');
    }
    const sizeBytes = t.size_bytes || null;
    if (sizeBytes !== null && (typeof sizeBytes !== 'number' || sizeBytes <= 0 || sizeBytes > ScriptureRepositoryService.MAX_DOWNLOAD_SIZE)) {
      throw new Error('Translation size_bytes is out of valid range');
    }
    return {
      id: t.id,
      name: t.name,
      abbreviation: (t.abbreviation || t.short_name || t.code || '').slice(0, 30),
      fullname: t.fullname || t.full_name || null,
      language: (t.language || 'en').slice(0, 20),
      file_name: t.file_name,
      size_bytes: sizeBytes,
      version: typeof t.version === 'number' ? t.version : null,
      checksum: typeof t.checksum === 'string' && /^[0-9a-fA-F]{64}$/.test(t.checksum) ? t.checksum.toLowerCase() : null,
      copyright: typeof t.copyright === 'string' ? t.copyright.slice(0, 500) : null,
      description: typeof t.description === 'string' ? t.description.slice(0, 1000) : null,
      encrypted: isProtected ? (!!t.encrypted || true) : false
    };
  }

  _resolveTranslationUrl(repoUrl, translation) {
    const root = repoUrl.replace(/\/+$/, '');
    const lang = translation.language || 'en';
    return `${root}/scriptures/${lang}/${translation.file_name}`;
  }

  _opfsPath(lang, fileName) {
    const local = fileName.replace(/\.enc$/i, '.sqlite');
    return `/scriptures/${lang}/${local}`;
  }

  async _opfsImportWithTimeout(opfsPath, bytes, timeoutMs) {
    const sqlite3 = await this._getSqlite3();
    let importFn;
    if (sqlite3.opfs?.importDb) {
      importFn = () => sqlite3.opfs.importDb(opfsPath, bytes);
    } else if (sqlite3.oo1?.OpfsDb?.importDb) {
      importFn = () => sqlite3.oo1.OpfsDb.importDb(opfsPath, bytes);
    } else {
      throw new Error('No OPFS import API available');
    }
    const result = await Promise.race([
      importFn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('OPFS import timed out')), timeoutMs)
      )
    ]);
    return result;
  }

  async _pbkdf2Decrypt(password, salt, nonce, ciphertext, iterations = 390000) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    return crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce },
      key,
      ciphertext
    );
  }
};

window.repoService = new ScriptureRepositoryService();
