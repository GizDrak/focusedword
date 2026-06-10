window.HighlightStore = class HighlightStore {
  constructor() {
    this._db = null;
    this._ready = this._openDB();
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

  _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('FocusedWord', 3);
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
      };
      req.onsuccess = (e) => { this._db = e.target.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  }

  async _ensureOpen() {
    if (this._db) return;
    await this._ready;
  }

  async save(data) {
    await this._ensureOpen();
    const hl = {
      id: data.id || HighlightStore._uuid(),
      bookId: data.bookId,
      chapter: data.chapter,
      verse: data.verse,
      type: data.type,
      startOffset: data.type === 'partial' ? data.startOffset : null,
      endOffset: data.type === 'partial' ? data.endOffset : null,
      color: data.color,
      text: data.text || ''
    };
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('highlights', 'readwrite');
      const req = tx.objectStore('highlights').put(hl);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async delete(id) {
    await this._ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('highlights', 'readwrite');
      const req = tx.objectStore('highlights').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getForChapter(bookId, chapter) {
    await this._ensureOpen();
    const all = await this._getAll();
    return all.filter(h => h.bookId === bookId && h.chapter === chapter);
  }

  async getByVerse(bookId, chapter, verse) {
    await this._ensureOpen();
    const all = await this._getAll();
    return all.filter(h => h.bookId === bookId && h.chapter === chapter && h.verse === verse);
  }

  async getAll() {
    await this._ensureOpen();
    return this._getAll();
  }

  async deleteForChapter(bookId, chapter) {
    const chapterHl = await this.getForChapter(bookId, chapter);
    await Promise.all(chapterHl.map(h => this.delete(h.id)));
  }

  _getAll() {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('highlights', 'readonly');
      const req = tx.objectStore('highlights').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  static colorToClass(color) {
    const map = {
      '#FFD700': 'hl-yellow',
      '#48BB78': 'hl-green',
      '#63B3ED': 'hl-blue',
      '#ED8936': 'hl-orange',
      '#9F7AEA': 'hl-purple',
      '#F56565': 'hl-red'
    };
    return map[color] || 'hl-yellow';
  }
};
