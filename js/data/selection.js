window.SelectionManager = class SelectionManager {
  constructor(bridge) {
    this._bridge = bridge;
    this._db = null;
  }

  async init() {
    try {
      await this._openDB();
      await this._ensureDefaultSet();
      await this._migrateUUIDs('bookmarks');
    } catch (e) {
      console.warn('IndexedDB unavailable:', e);
    }
  }

  static _uuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  async _migrateUUIDs(store) {
    const items = await this._getAll(store);
    const needsMigration = items.filter(item => typeof item.id !== 'string');
    if (!needsMigration.length) return;
    for (const item of needsMigration) {
      const oldId = item.id;
      item.id = SelectionManager._uuid();
      const tx = this._db.transaction(store, 'readwrite');
      const objStore = tx.objectStore(store);
      await new Promise((resolve, reject) => {
        const delReq = objStore.delete(oldId);
        delReq.onsuccess = () => {
          const addReq = objStore.add(item);
          addReq.onsuccess = () => resolve();
          addReq.onerror = () => reject(addReq.error);
        };
        delReq.onerror = () => reject(delReq.error);
      });
    }
  }

  async _ensureDefaultSet() {
    const sets = await this._getAll('bookmark_sets');
    if (sets.length === 0) {
      await this._save('bookmark_sets', {
        name: 'General',
        color: '#8B5CF6',
        createdAt: Date.now()
      });
    }
  }

  async saveBookmark(bookId, chapter, verses, text, setId) {
    if (!Array.isArray(verses)) verses = [verses];
    await this._save('bookmarks', {
      id: SelectionManager._uuid(),
      bookId,
      chapter,
      verse: verses[0],
      verses,
      setId: setId || null,
      text: text.slice(0, 200),
      createdAt: Date.now(),
      updated_at: Date.now()
    });
    if (bookId === this._bridge.state.get('currentBook') && chapter === this._bridge.state.get('currentChapter')) {
      this._bridge.call('base-renderer', 'applyBookmarks');
    }
    this._bridge.call('bookmarks-ui', 'refreshIfOpen');
  }

  async getBookmarksForChapter(bookId, chapter) {
    try {
      return await new Promise((resolve, reject) => {
        const tx = this._db.transaction('bookmarks', 'readonly');
        const store = tx.objectStore('bookmarks');
        if (!store.indexNames.contains('byChapter')) {
          const allReq = store.getAll();
          allReq.onsuccess = () => resolve((allReq.result || []).filter(b => b.bookId === bookId && b.chapter === chapter && !b.deleted));
          allReq.onerror = () => reject(allReq.error);
          return;
        }
        const range = IDBKeyRange.only([bookId, chapter]);
        const req = store.index('byChapter').getAll(range);
        req.onsuccess = () => resolve((req.result || []).filter(b => !b.deleted));
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      const all = await this._getAll('bookmarks');
      return all.filter(b => b.bookId === bookId && b.chapter === chapter && !b.deleted);
    }
  }

  async getAllBookmarks() {
    const items = await this._getAll('bookmarks');
    for (const item of items) {
      if (!item.verses) item.verses = [item.verse];
    }
    return items.filter(item => !item.deleted);
  }

  async getAllBookmarksIncludingTombstones() {
    const items = await this._getAll('bookmarks');
    for (const item of items) {
      if (!item.verses) item.verses = [item.verse];
    }
    return items;
  }

  async deleteItem(id) {
    const tx = this._db.transaction('bookmarks', 'readwrite');
    const store = tx.objectStore('bookmarks');
    const getReq = store.get(id);
    return new Promise((resolve, reject) => {
      getReq.onsuccess = () => {
        const item = getReq.result;
        if (!item) { resolve(); return; }
        item.deleted = true;
        item.updated_at = Date.now();
        const putReq = store.put(item);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  async updateBookmarkSetId(bookmarkId, setId) {
    return this._update('bookmarks', bookmarkId, { setId: setId || null });
  }

  async saveBookmarkSet(name, color) {
    const id = await this._save('bookmark_sets', {
      name,
      color: color || '#8B5CF6',
      createdAt: Date.now()
    });
    return id;
  }

  async getAllBookmarkSets() {
    return this._getAll('bookmark_sets');
  }

  async updateBookmarkSet(id, updates) {
    return this._update('bookmark_sets', id, updates);
  }

  async deleteBookmarkSet(id) {
    await this._delete('bookmark_sets', id);
    const all = await this._getAll('bookmarks');
    for (const bm of all) {
      if (bm.setId === id) {
        await this._update('bookmarks', bm.id, { setId: null });
      }
    }
  }

  _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('FocusedWord', 6);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        const tx = e.target.transaction;
        if (e.oldVersion < 1) {
          if (!db.objectStoreNames.contains('bookmarks')) db.createObjectStore('bookmarks', { keyPath: 'id', autoIncrement: true });
          if (!db.objectStoreNames.contains('highlights')) db.createObjectStore('highlights', { keyPath: 'id' });
        }
        if (e.oldVersion < 2) {
          if (db.objectStoreNames.contains('highlights')) db.deleteObjectStore('highlights');
          if (!db.objectStoreNames.contains('highlights')) db.createObjectStore('highlights', { keyPath: 'id' });
        }
        if (e.oldVersion < 3) {
          if (!db.objectStoreNames.contains('bookmark_sets')) db.createObjectStore('bookmark_sets', { keyPath: 'id', autoIncrement: true });
        }
        if (e.oldVersion < 4) {
          if (tx.objectStoreNames.contains('highlights')) {
            const store = tx.objectStore('highlights');
            if (!store.indexNames.contains('byChapter')) {
              store.createIndex('byChapter', ['bookId', 'chapter'], { unique: false });
            }
          }
          if (tx.objectStoreNames.contains('bookmarks')) {
            const store = tx.objectStore('bookmarks');
            if (!store.indexNames.contains('byChapter')) {
              store.createIndex('byChapter', ['bookId', 'chapter'], { unique: false });
            }
          }
        }
        if (e.oldVersion < 5) {
          if (tx.objectStoreNames.contains('highlights')) {
            const store = tx.objectStore('highlights');
            if (!store.indexNames.contains('byChapter')) {
              store.createIndex('byChapter', ['bookId', 'chapter'], { unique: false });
            }
          }
          if (tx.objectStoreNames.contains('bookmarks')) {
            const store = tx.objectStore('bookmarks');
            if (!store.indexNames.contains('byChapter')) {
              store.createIndex('byChapter', ['bookId', 'chapter'], { unique: false });
            }
          }
        }
        if (e.oldVersion < 6) {
          if (tx.objectStoreNames.contains('highlights')) {
            const store = tx.objectStore('highlights');
            const cursorReq = store.openCursor();
            cursorReq.onsuccess = (ev) => {
              const cursor = ev.target.result;
              if (cursor) {
                const item = cursor.value;
                let needsUpdate = false;
                if (!item.createdAt) { item.createdAt = Date.now(); needsUpdate = true; }
                if (!item.updated_at) { item.updated_at = item.createdAt; needsUpdate = true; }
                if (needsUpdate) cursor.update(item);
                cursor.continue();
              }
            };
          }
          if (tx.objectStoreNames.contains('bookmarks')) {
            const store = tx.objectStore('bookmarks');
            const cursorReq = store.openCursor();
            cursorReq.onsuccess = (ev) => {
              const cursor = ev.target.result;
              if (cursor) {
                const item = cursor.value;
                if (!item.updated_at && item.createdAt) {
                  item.updated_at = item.createdAt;
                  cursor.update(item);
                }
                cursor.continue();
              }
            };
          }
        }
      };
      req.onsuccess = (e) => { this._db = e.target.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  }

  _save(store, data) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).add(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  _getAll(store) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  _delete(store, id) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  _update(store, id, updates) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(store, 'readwrite');
      const getReq = tx.objectStore(store).get(id);
      getReq.onsuccess = () => {
        const data = getReq.result;
        if (!data) { resolve(); return; }
        Object.assign(data, updates, { updated_at: Date.now() });
        const putReq = tx.objectStore(store).put(data);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }
};
