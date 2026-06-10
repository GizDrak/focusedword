window.SelectionManager = class SelectionManager {
  constructor(bridge) {
    this._bridge = bridge;
    this._db = null;
  }

  async init() {
    try {
      await this._openDB();
      await this._ensureDefaultSet();
    } catch (e) {
      console.warn('IndexedDB unavailable:', e);
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
      bookId,
      chapter,
      verse: verses[0],
      verses,
      setId: setId || null,
      text: text.slice(0, 200),
      createdAt: Date.now()
    });
    if (bookId === this._bridge.state.get('currentBook') && chapter === this._bridge.state.get('currentChapter')) {
      this._bridge.call('base-renderer', 'applyBookmarks');
    }
    this._bridge.call('bookmarks-ui', 'refreshIfOpen');
  }

  async getBookmarksForChapter(bookId, chapter) {
    const all = await this._getAll('bookmarks');
    return all.filter((b) => b.bookId === bookId && b.chapter === chapter);
  }

  async getAllBookmarks() {
    const items = await this._getAll('bookmarks');
    for (const item of items) {
      if (!item.verses) item.verses = [item.verse];
    }
    return items;
  }

  async deleteItem(id) {
    return this._delete('bookmarks', id);
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
      const req = indexedDB.open('FocusedWord', 3);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
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
        Object.assign(data, updates);
        const putReq = tx.objectStore(store).put(data);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }
};
