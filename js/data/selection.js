window.SelectionManager = class SelectionManager {
  constructor(bridge) {
    this._bridge = bridge;
  }

  async init() {
    await this._ensureDefaultSet();
  }

  async _ensureDefaultSet() {
    const sets = await window.idb.getAll('bookmark_sets');
    if (sets.length === 0) {
      await window.idb.put('bookmark_sets', {
        id: window.UUID.generate(),
        name: 'General',
        color: '#8B5CF6',
        deleted: false,
        createdAt: Date.now(),
        updated_at: Date.now()
      });
    }
  }

  async saveBookmark(bookId, chapter, verses, text, setId) {
    if (!Array.isArray(verses)) verses = [verses];
    this._bridge.state.addBookmark({
      bookId,
      chapter,
      verse: verses[0],
      verses,
      setId: setId || null,
      text: text.slice(0, 200),
    });
    if (bookId === this._bridge.state.get('currentBook') && chapter === this._bridge.state.get('currentChapter')) {
      this._bridge.call('base-renderer', 'applyBookmarks');
    }
    this._bridge.call('bookmarks-ui', 'refreshIfOpen');
  }

  async getBookmarksForChapter(bookId, chapter) {
    try {
      const items = await window.idb.getAllFromIndex('bookmarks', 'byChapter', IDBKeyRange.only([bookId, chapter]));
      return items.filter(b => !b.deleted);
    } catch (e) {
      const all = await window.idb.getAll('bookmarks');
      return all.filter(b => b.bookId === bookId && b.chapter === chapter && !b.deleted);
    }
  }

  async getAllBookmarks() {
    const items = await window.idb.getAll('bookmarks');
    for (const item of items) {
      if (!item.verses) item.verses = [item.verse];
    }
    return items.filter(item => !item.deleted);
  }

  async getAllBookmarksIncludingTombstones() {
    const items = await window.idb.getAll('bookmarks');
    for (const item of items) {
      if (!item.verses) item.verses = [item.verse];
    }
    return items;
  }

  async deleteItem(id) {
    const item = this._bridge.state.bookmarks.find(i => i.id === id);
    if (item) {
      this._bridge.state.deleteBookmark(id);
      return;
    }
    const idbItem = await window.idb.get('bookmarks', id);
    if (!idbItem) return;
    idbItem.deleted = true;
    idbItem.updated_at = Date.now();
    await window.idb.put('bookmarks', idbItem);
  }

  async updateBookmarkTags(bookmarkId, tags) {
    const item = await window.idb.get('bookmarks', bookmarkId);
    if (!item) return;
    item.tags = tags;
    item.updated_at = Date.now();
    await window.idb.put('bookmarks', item);
    this._bridge.state.updateBookmark(bookmarkId, { tags });
  }

  async saveBookmarkSet(name, color) {
    const id = window.UUID.generate();
    await window.idb.put('bookmark_sets', {
      id,
      name,
      color: color || '#8B5CF6',
      deleted: false,
      createdAt: Date.now(),
      updated_at: Date.now()
    });
    return id;
  }

  async getAllBookmarkSets() {
    const items = await window.idb.getAll('bookmark_sets');
    return items.filter(s => !s.deleted);
  }

  async updateBookmarkSet(id, updates) {
    const item = await window.idb.get('bookmark_sets', id);
    if (!item) return;
    Object.assign(item, updates, { updated_at: Date.now() });
    await window.idb.put('bookmark_sets', item);
  }

  async deleteBookmarkSet(id) {
    const item = await window.idb.get('bookmark_sets', id);
    if (item) {
      item.deleted = true;
      item.updated_at = Date.now();
      await window.idb.put('bookmark_sets', item);
    }
    const all = await window.idb.getAll('bookmarks');
    for (const bm of all) {
      if (bm.setId === id) {
        bm.setId = null;
        bm.updated_at = Date.now();
        await window.idb.put('bookmarks', bm);
      }
    }
  }
};
