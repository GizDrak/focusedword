window.NavigationHistory = class NavigationHistory {
  constructor(bridge) {
    this.bridge = bridge;
    this._entries = [];
  }

  async init() {
    try {
      this._entries = await window.idb.getAll('navigation_history');
    } catch (e) {
      console.warn('[NavigationHistory] init failed:', e);
      this._entries = [];
    }
  }

  _ref(book, chapter, verse) {
    return `${book}-${chapter}-${verse}`;
  }

  async record(book, chapter, verse, bookName) {
    const id = this._ref(book, chapter, verse);
    const existing = this._entries.find(e => e.id === id && !e.deleted);
    const now = Date.now();

    if (existing) {
      existing.visited_at = now;
      existing.updated_at = now;
      await window.idb.put('navigation_history', existing);
    } else {
      const entry = {
        id,
        book,
        chapter,
        verse,
        bookName: bookName || '',
        visited_at: now,
        created_at: now,
        updated_at: now,
        deleted: false
      };
      this._entries.push(entry);
      await window.idb.put('navigation_history', entry);
    }

    await this._prune(50);
    this.bridge.state.moduleTimestamps.navigationHistory = now;
    this.bridge.state._saveTimestamps();
  }

  async _prune(max) {
    const active = this._entries.filter(e => !e.deleted);
    if (active.length <= max) return;
    active.sort((a, b) => b.visited_at - a.visited_at);
    const toTombstone = active.slice(max);
    for (const entry of toTombstone) {
      entry.deleted = true;
      entry.updated_at = Date.now();
      await window.idb.put('navigation_history', entry);
    }
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const staleTombstones = this._entries.filter(e => e.deleted && e.updated_at && e.updated_at < cutoff);
    for (const entry of staleTombstones) {
      await window.idb.delete('navigation_history', entry.id);
      const idx = this._entries.indexOf(entry);
      if (idx >= 0) this._entries.splice(idx, 1);
    }
  }

  async clear() {
    const now = Date.now();
    for (const entry of this._entries) {
      if (!entry.deleted) {
        entry.deleted = true;
        entry.updated_at = now;
        await window.idb.put('navigation_history', entry);
      }
    }
    this.bridge.state.moduleTimestamps.navigationHistory = now;
    this.bridge.state._saveTimestamps();
  }

  getRecent(max = 50) {
    return this._entries
      .filter(e => !e.deleted)
      .sort((a, b) => b.visited_at - a.visited_at)
      .slice(0, max);
  }
};
