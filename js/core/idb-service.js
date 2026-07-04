window.IDBService = class IDBService {
  constructor() {
    this._db = null;
    this._ready = this._open();
  }

  _open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('focused_word_db', 4);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        const tx = e.target.transaction;

        if (e.oldVersion < 1) {
          for (const name of ['bookmarks', 'highlights', 'notes', 'plans']) {
            if (!db.objectStoreNames.contains(name)) {
              const store = db.createObjectStore(name, { keyPath: 'id' });
              store.createIndex('deleted', 'deleted', { unique: false });
              store.createIndex('updated_at', 'updated_at', { unique: false });
            }
          }
        }

        if (e.oldVersion < 2) {
          if (!db.objectStoreNames.contains('note_categories')) {
            db.createObjectStore('note_categories', { keyPath: 'id' });
          }

          for (const name of ['notes', 'highlights', 'bookmarks']) {
            const store = tx.objectStore(name);
            if (!store.indexNames.contains('byTags')) {
              store.createIndex('byTags', 'tags', { unique: false, multiEntry: true });
            }
          }

          const notesStore = tx.objectStore('notes');
          if (!notesStore.indexNames.contains('byCategory')) {
            notesStore.createIndex('byCategory', 'categoryId', { unique: false });
          }
          if (!notesStore.indexNames.contains('byUpdated')) {
            notesStore.createIndex('byUpdated', 'updated_at', { unique: false });
          }
        }

        if (e.oldVersion < 3) {
          if (!db.objectStoreNames.contains('metadata')) {
            db.createObjectStore('metadata', { keyPath: 'key' });
          }
        }

        if (e.oldVersion < 4) {
          if (!db.objectStoreNames.contains('bookmark_sets')) {
            db.createObjectStore('bookmark_sets', { keyPath: 'id' });
          }
          for (const name of ['bookmarks', 'highlights']) {
            const store = tx.objectStore(name);
            if (!store.indexNames.contains('byChapter')) {
              store.createIndex('byChapter', ['bookId', 'chapter'], { unique: false });
            }
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

  async get(storeName, key) {
    await this._ready;
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllFromIndex(storeName, indexName, value) {
    await this._ready;
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).index(indexName).getAll(value);
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

  async putBatch(items) {
    await this._ready;
    return new Promise((resolve, reject) => {
      const names = [...new Set(items.map(i => i.storeName))];
      const tx = this._db.transaction(names, 'readwrite');
      for (const { storeName, item } of items) {
        tx.objectStore(storeName).put(item);
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
