window.HighlightStore = class HighlightStore {
  constructor(bridge) {
    this._bridge = bridge;
  }

  async save(data) {
    this._bridge.state.addHighlight({
      bookId: data.bookId,
      chapter: data.chapter,
      verse: data.verse,
      verseEnd: data.verseEnd || null,
      type: data.type,
      startOffset: data.type === 'partial' ? data.startOffset : null,
      endOffset: data.type === 'partial' ? data.endOffset : null,
      color: data.color,
      text: data.text || '',
    });
  }

  async updateTags(id, tags) {
    const item = await window.idb.get('highlights', id);
    if (!item) return;
    item.tags = tags;
    item.updated_at = Date.now();
    await window.idb.put('highlights', item);
    this._bridge.state.updateHighlight(id, { tags });
  }

  async delete(id) {
    const item = this._bridge.state.highlights.find(i => i.id === id);
    if (item) {
      this._bridge.state.deleteHighlight(id);
      return;
    }
    const idbItem = await window.idb.get('highlights', id);
    if (!idbItem) return;
    idbItem.deleted = true;
    idbItem.updated_at = Date.now();
    await window.idb.put('highlights', idbItem);
  }

  async getForChapter(bookId, chapter) {
    try {
      const items = await window.idb.getAllFromIndex('highlights', 'byChapter', IDBKeyRange.only([bookId, chapter]));
      return items.filter(h => !h.deleted);
    } catch (e) {
      const all = await window.idb.getAll('highlights');
      return all.filter(h => h.bookId === bookId && h.chapter === chapter && !h.deleted);
    }
  }

  async getByVerse(bookId, chapter, verse) {
    const rows = await this.getForChapter(bookId, chapter);
    return rows.filter(h => {
      if (h.verse === verse) return true;
      if (h.verseEnd && verse >= h.verse && verse <= h.verseEnd) return true;
      return false;
    });
  }

  async getAll() {
    const items = await window.idb.getAll('highlights');
    return items.filter(item => !item.deleted);
  }

  async getAllIncludingTombstones() {
    return window.idb.getAll('highlights');
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
