window.SyncService = class SyncService {
  constructor() {
    this.serverUrl = localStorage.getItem('sync-server-url') || 'https://sync.focusedword.com';
    this.syncKey = localStorage.getItem('sync-key') || null;
    this._lastUpdatedAt = Number(localStorage.getItem('sync-last-updated')) || 0;
    this._db = null;
    this._isSynced = false;
    this.lastError = null;
    this._stateProvider = null;
    this._stateApplier = null;
    this._enabled = localStorage.getItem('sync-enabled') === 'true';
    this.initDB();
    window.addEventListener('online', () => {
      if (this._enabled && this.syncKey) this.sync();
    });
  }

  setEnabled(v) {
    this._enabled = v;
  }

  async revokeSyncKey() {
    const response = await fetch(`${this.serverUrl}/api/sync/${this.syncKey}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Revocation failed');
    return true;
  }

  initDB() {
    this._ready = new Promise((resolve, reject) => {
      const req = indexedDB.open('FocusedSyncDB', 1);
      req.onupgradeneeded = () => {
      };
      req.onsuccess = () => {
        this._db = req.result;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  setServerUrl(url) {
    this.serverUrl = url;
    localStorage.setItem('sync-server-url', url);
  }

  setKey(key) {
    this.syncKey = key ? key.toLowerCase().trim() : null;
    if (this.syncKey) {
      localStorage.setItem('sync-key', this.syncKey);
    } else {
      localStorage.removeItem('sync-key');
    }
  }

  async restoreKeyAndPull(key) {
    this.setKey(key);
    this._isSynced = false;
    this.lastError = null;
    const serverState = await this.apiRequest('state');
    const modules = serverState?.modules;
    this._normalizeModuleNames(modules);
    if (modules) {
      const ts = Object.values(modules).map(m => m.updated_at).filter(v => typeof v === 'number');
      this._lastUpdatedAt = ts.length ? Math.max(...ts) : 0;
      localStorage.setItem('sync-last-updated', String(this._lastUpdatedAt));
    }
    this._isSynced = true;
    return serverState;
  }

  async generateKey() {
    const resp = await fetch('/assets/lists/bible-wordlist.json');
    if (!resp.ok) throw new Error('Failed to fetch wordlist');
    const words = await resp.json();
    const buf = new Uint32Array(3);
    window.crypto.getRandomValues(buf);
    const newKey = Array.from(buf).map(n => words[n % words.length]).join('-');
    this.setKey(newKey);
    console.log('[SyncService] Generated new key:', newKey);
    return newKey;
  }

  async apiRequest(endpoint = '', options = {}) {
    if (!this.syncKey) {
      throw new Error('No key configured');
    }
    const fullUrl = `${this.serverUrl}/api/sync/${this.syncKey}`;
    const headers = options.headers || {};
    const method = options.method || (endpoint === 'state' ? 'GET' : 'POST');
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
    }
    const resp = await fetch(fullUrl, { ...options, method, headers });
    let body;
    try { body = await resp.json(); } catch { body = null; }
    if (body && body.revoked) {
      window.dispatchEvent(new CustomEvent('sync-key-revoked'));
      throw new Error(body.error || 'Sync key has been revoked');
    }
    if (!resp.ok) {
      const err = body || { status: resp.status, statusText: resp.statusText };
      err._status = resp.status;
      throw err;
    }
    return body;
  }

  get lastSyncLabel() {
    const lastSync = localStorage.getItem('sync-last-updated');
    return lastSync && parseInt(lastSync) > 0 ? new Date(parseInt(lastSync)).toLocaleString() : 'Never';
  }

  setStateProvider(fn) { this._stateProvider = fn; }
  setStateApplier(fn) { this._stateApplier = fn; }

  _normalizeModuleNames(modules) {
    if (!modules) return;
    if (modules.catagory) {
      modules.noteCategories = modules.catagory;
      delete modules.catagory;
    }
    if (modules.category) {
      if (!modules.noteCategories) modules.noteCategories = modules.category;
      delete modules.category;
    }
  }

  async pullLatestState() {
    const serverState = await this.apiRequest('state');
    const modules = serverState?.modules;
    this._normalizeModuleNames(modules);
    if (modules) {
      const ts = Object.values(modules).map(m => m.updated_at).filter(v => typeof v === 'number');
      const serverTs = ts.length ? Math.max(...ts) : 0;
      if (serverTs > this._lastUpdatedAt) {
        this._lastUpdatedAt = serverTs;
        localStorage.setItem('sync-last-updated', String(this._lastUpdatedAt));
        if (this._stateApplier) {
          await this._stateApplier(modules);
        }
      }
    }
    if (this._lastUpdatedAt === 0) {
      this._lastUpdatedAt = Date.now();
      localStorage.setItem('sync-last-updated', String(this._lastUpdatedAt));
    }
    this._isSynced = true;
    return serverState;
  }

  _buildSyncBody(raw) {
    const MODULE_NAMES = ['settings', 'reading', 'bookmarks', 'highlights', 'notes', 'plans', 'noteCategories', 'repositories'];
    const SERVER_NAME = { noteCategories: 'catagory' };
    const body = { modules: {} };
    for (const mod of MODULE_NAMES) {
      if (raw[mod] && raw[mod].data) {
        const serverMod = SERVER_NAME[mod] || mod;
        body.modules[serverMod] = { data: raw[mod].data, updated_at: raw[mod].updated_at || 0 };
      }
    }
    return body;
  }

  _onSyncSuccess(resp) {
    if (resp && resp.modules) {
      this._normalizeModuleNames(resp.modules);
      const ts = Object.values(resp.modules).map(m => m.updated_at).filter(v => typeof v === 'number');
      this._lastUpdatedAt = ts.length ? Math.max(...ts) : 0;
      localStorage.setItem('sync-last-updated', String(this._lastUpdatedAt));
      if (this._stateApplier) {
        return this._stateApplier(resp.modules);
      }
    }
  }

  _vacuumGraveyards() {
    if (!window.idb) return;
    for (const store of ['bookmarks', 'highlights', 'notes', 'plans', 'note_categories']) {
      window.idb.vacuumGraveyard(store).catch(() => {});
    }
  }

  async processSync() {
    if (!this._enabled) return;
    if (!navigator.onLine) {
      this.lastError = 'Offline';
      console.warn('[SyncService] Offline — skipping sync');
      return;
    }
    if (!this.syncKey) {
      this.lastError = 'No key configured';
      console.warn('[SyncService] No key configured — skipping sync');
      return;
    }
    const raw = this._stateProvider ? await this._stateProvider() : {};
    const body = this._buildSyncBody(raw);
    try {
      const resp = await this.apiRequest('sync', { method: 'POST', body: JSON.stringify(body) });
      await this._onSyncSuccess(resp);
      if (this._lastUpdatedAt === 0) {
        this._lastUpdatedAt = Date.now();
        localStorage.setItem('sync-last-updated', String(this._lastUpdatedAt));
      }
      this.lastError = null;
      this._vacuumGraveyards();
      return resp;
    } catch (e) {
      if (e._status === 409) {
        this.lastError = 'Conflict — pulling latest state and retrying';
        console.warn('[SyncService] Conflict — pulling latest state and retrying');
        try {
          const serverState = await this.apiRequest('state');
          const retryModules = serverState?.modules;
          this._normalizeModuleNames(retryModules);
          if (retryModules) {
            const ts = Object.values(retryModules).map(m => m.updated_at).filter(v => typeof v === 'number');
            this._lastUpdatedAt = ts.length ? Math.max(...ts) : 0;
            localStorage.setItem('sync-last-updated', String(this._lastUpdatedAt));
            if (this._stateApplier) {
              await this._stateApplier(retryModules);
            }
          }
          const retryRaw = this._stateProvider ? await this._stateProvider() : {};
          const retryBody = this._buildSyncBody(retryRaw);
          const retryResp = await this.apiRequest('sync', { method: 'POST', body: JSON.stringify(retryBody) });
          await this._onSyncSuccess(retryResp);
          if (this._lastUpdatedAt === 0) {
            this._lastUpdatedAt = Date.now();
            localStorage.setItem('sync-last-updated', String(this._lastUpdatedAt));
          }
          this.lastError = null;
          this._vacuumGraveyards();
          return retryResp;
        } catch (retryErr) {
          this.lastError = typeof retryErr?.message === 'string' ? retryErr.message : 'Retry after conflict failed';
          console.warn('[SyncService] Retry after conflict failed:', retryErr);
        }
      } else {
        this.lastError = typeof e?.message === 'string' ? e.message : 'Sync failed';
        console.warn('[SyncService] Sync failed:', e);
      }
    }
  }

  async sync() {
    return this.processSync();
  }
};

window.syncService = new SyncService();
