window.IDBService = class IDBService {
  constructor() {
    this._db = null;
    this._ready = this._open();
  }

  _open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('focused_word_db', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const name of ['bookmarks', 'highlights', 'notes', 'plans']) {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: 'id' });
            store.createIndex('deleted', 'deleted', { unique: false });
            store.createIndex('updated_at', 'updated_at', { unique: false });
          }
        }
      };
      req.onsuccess = (e) => { this._db = e.target.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  }

  async getAll(storeName) {
    await this._ready;
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async put(storeName, item) {
    await this._ready;
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async putMultiple(storeName, items) {
    await this._ready;
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      for (const item of items) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async delete(storeName, id) {
    await this._ready;
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async vacuumGraveyard(storeName) {
    await this._ready;
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const all = await this.getAll(storeName);
    const toDelete = all.filter(item => item.deleted === true && item.updated_at && item.updated_at < cutoff);
    if (!toDelete.length) return;
    const tx = this._db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const item of toDelete) {
      store.delete(item.id);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { console.log(`[IDBService] Vacuumed ${toDelete.length} tombstones from ${storeName}`); resolve(); };
      tx.onerror = () => reject(tx.error);
    });
  }
};

window.idb = new IDBService();
