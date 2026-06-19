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
    const req = indexedDB.open('FocusedSyncDB', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => {
      this._db = req.result;
    };
  }

  enqueueAction(type, payload) {
    const tx = this._db.transaction('outbox', 'readwrite');
    tx.objectStore('outbox').add({ type, payload, timestamp: Date.now() });
    console.log(`[SyncService] Queued action: ${type}`);
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
    if (serverState && serverState.modules) {
      const timestamps = Object.values(serverState.modules)
        .map(m => m.updated_at)
        .filter(t => typeof t === 'number');
      const serverTs = timestamps.length ? Math.max(...timestamps) : 0;
      this._lastUpdatedAt = serverTs;
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
    headers['Content-Type'] = 'application/json';
    const method = options.method || (endpoint === 'state' ? 'GET' : 'POST');
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
    return lastSync ? new Date(parseInt(lastSync)).toLocaleString() : 'Never';
  }

  setStateProvider(fn) { this._stateProvider = fn; }
  setStateApplier(fn) { this._stateApplier = fn; }

  async pullLatestState() {
    const serverState = await this.apiRequest('state');
    if (serverState && serverState.modules) {
      const timestamps = Object.values(serverState.modules)
        .map(m => m.updated_at)
        .filter(t => typeof t === 'number');
      const serverTs = timestamps.length ? Math.max(...timestamps) : 0;
      if (serverTs > this._lastUpdatedAt) {
        this._lastUpdatedAt = serverTs;
        localStorage.setItem('sync-last-updated', String(this._lastUpdatedAt));
        if (this._stateApplier) {
          this._stateApplier(serverState.modules);
        }
      }
    }
    this._isSynced = true;
    return serverState;
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
    if (!this._isSynced) {
      console.warn('[SyncService] Pull-Before-Push enforced. Pulling latest state first...');
      try {
        await this.pullLatestState();
      } catch (e) {
        this.lastError = typeof e?.message === 'string' ? e.message : 'Pull before push failed';
        console.warn('[SyncService] Pull before push failed:', e);
        return;
      }
    }
    const tx = this._db.transaction('outbox', 'readonly');
    const records = await new Promise((resolve, reject) => {
      const req = tx.objectStore('outbox').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const raw = this._stateProvider ? await this._stateProvider() : {};
    const body = {
      modules: {},
      notes_deltas: records.filter(a => a.type === 'NOTE_UPDATE').map(a => a.payload),
      plans_deltas: records.filter(a => a.type === 'PLAN_UPDATE').map(a => a.payload)
    };
    const addModule = (mod) => {
      if (raw[mod] && raw[mod].data) {
        body.modules[mod] = { data: raw[mod].data, updated_at: raw[mod].updated_at || 0 };
      }
    };
    addModule('settings');
    addModule('reading');
    addModule('bookmarks');
    addModule('highlights');
    addModule('notes');
    addModule('plans');
    console.log('[Sync] processSync payload:', JSON.stringify(body, null, 2));
    try {
      const resp = await this.apiRequest('sync', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      if (resp && records.length > 0) {
        const clearTx = this._db.transaction('outbox', 'readwrite');
        clearTx.objectStore('outbox').clear();
      }
      if (resp && resp.modules) {
        const timestamps = Object.values(resp.modules)
          .map(m => m.updated_at)
          .filter(t => typeof t === 'number');
        this._lastUpdatedAt = timestamps.length ? Math.max(...timestamps) : 0;
        localStorage.setItem('sync-last-updated', String(this._lastUpdatedAt));
        if (this._stateApplier) {
          this._stateApplier(resp.modules);
        }
      }
      this.lastError = null;
      if (window.idb) {
        for (const store of ['bookmarks', 'highlights', 'notes', 'plans']) {
          window.idb.vacuumGraveyard(store).catch(() => {});
        }
      }
      return resp;
    } catch (e) {
      if (e._status === 409) {
        this.lastError = 'Conflict — pulling latest state and retrying';
        console.warn('[SyncService] Conflict — pulling latest state and retrying');
        try {
          const serverState = await this.apiRequest('state');
          if (serverState && serverState.modules) {
            const serverTimestamps = Object.values(serverState.modules)
              .map(m => m.updated_at)
              .filter(t => typeof t === 'number');
            this._lastUpdatedAt = serverTimestamps.length ? Math.max(...serverTimestamps) : 0;
            localStorage.setItem('sync-last-updated', String(this._lastUpdatedAt));
            if (this._stateApplier) {
              this._stateApplier(serverState.modules);
            }
          }
          const retryRaw = this._stateProvider ? await this._stateProvider() : {};
          const retryBody = { ...body, modules: {} };
          const addMod = (mod) => {
            if (retryRaw[mod] && retryRaw[mod].data) {
              retryBody.modules[mod] = { data: retryRaw[mod].data, updated_at: retryRaw[mod].updated_at || 0 };
            }
          };
          addMod('settings');
          addMod('reading');
          addMod('bookmarks');
          addMod('highlights');
          addMod('notes');
          addMod('plans');
          console.log('[Sync] processSync retry payload:', JSON.stringify(retryBody, null, 2));
          const retryResp = await this.apiRequest('sync', {
            method: 'POST',
            body: JSON.stringify(retryBody)
          });
          if (retryResp && records.length > 0) {
            const clearTx = this._db.transaction('outbox', 'readwrite');
            clearTx.objectStore('outbox').clear();
          }
          this.lastError = null;
          if (window.idb) {
            for (const store of ['bookmarks', 'highlights', 'notes', 'plans']) {
              window.idb.vacuumGraveyard(store).catch(() => {});
            }
          }
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
    try {
      await this.pullLatestState();
    } catch (e) {
      this.lastError = typeof e?.message === 'string' ? e.message : 'Pull failed';
      console.warn('[SyncService] Pull failed:', e);
      return;
    }
    return this.processSync();
  }
};

window.syncService = new SyncService();
