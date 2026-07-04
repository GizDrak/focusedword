window.NoteStore = class NoteStore {
  constructor(bridge) {
    this.bridge = bridge;
    this._state = bridge.state;
    this._autoSaveTimers = new Map();
    this._debounceMs = 1000;
    this._lastSavedAt = 0;
    this._listeners = {};
    this._bridgeHandler = (e) => {
      if (e.detail === 'notes') this._emit('notes-changed', { source: 'sync' });
      if (e.detail === 'noteCategories') this._emit('categories-changed', { source: 'sync' });
    };
    window.addEventListener('sync-module-updated', this._bridgeHandler);
  }

  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = new Set();
    this._listeners[event].add(callback);
  }

  off(event, callback) {
    this._listeners[event]?.delete(callback);
  }

  _emit(event, data) {
    this._listeners[event]?.forEach(cb => cb(data));
  }

  createNote({ title, content, categoryId }) {
    const base = this._state.addNote(content);
    const tags = this._extractTags(content);
    const excerpt = this._computeExcerpt(content);
    this._state.updateNote(base.id, { title, categoryId, tags, excerpt });
    const created = this._state.notes.find(n => n.id === base.id);
    this._emit('notes-changed', { action: 'create', id: created?.id });
    if (tags.length && this._state._tagCountCache) {
      window.TagCacheUtils.applyDiff(this._state._tagCountCache, [], tags);
      window.TagCacheUtils.persistCache(this._state._tagCountCache).catch(() => {});
    }
    return created;
  }

  updateNote(id, updates) {
    let oldTags = [];
    if (updates.content !== undefined) {
      const note = this._state.notes.find(n => n.id === id);
      oldTags = note?.tags || [];
      updates.tags = this._extractTags(updates.content);
      updates.excerpt = this._computeExcerpt(updates.content);
    }
    this._state.updateNote(id, updates);
    this._emit('notes-changed', { action: 'update', id });
    if (updates.tags && this._state._tagCountCache) {
      window.TagCacheUtils.applyDiff(this._state._tagCountCache, oldTags, updates.tags);
      window.TagCacheUtils.persistCache(this._state._tagCountCache).catch(() => {});
    }
  }

  deleteNote(id) {
    const note = this._state.notes.find(n => n.id === id);
    const tags = note?.tags || [];
    this._state.deleteNote(id);
    this._emit('notes-changed', { action: 'delete', id });
    if (tags.length && this._state._tagCountCache) {
      window.TagCacheUtils.applyDiff(this._state._tagCountCache, tags, []);
      window.TagCacheUtils.persistCache(this._state._tagCountCache).catch(() => {});
    }
  }

  getAllNotes() {
    return this._state.notes.filter(n => !n.deleted);
  }

  getNoteById(id) {
    return this._state.notes.find(n => n.id === id && !n.deleted);
  }

  getNotesByCategory(categoryId) {
    return this._state.notes.filter(n => n.categoryId === categoryId && !n.deleted);
  }

  getNotesByTag(tag) {
    return this._state.notes.filter(n => n.tags && n.tags.includes(tag) && !n.deleted);
  }

  scheduleAutoSave(noteId, fieldUpdates, onSaved) {
    if (this._autoSaveTimers.has(noteId)) {
      clearTimeout(this._autoSaveTimers.get(noteId));
    }
    this._autoSaveTimers.set(noteId, setTimeout(() => {
      this._autoSaveTimers.delete(noteId);
      this.updateNote(noteId, fieldUpdates);
      this._lastSavedAt = Date.now();
      if (onSaved) onSaved();
    }, this._debounceMs));
  }

  flushAutoSave(noteId, fieldUpdates) {
    if (this._autoSaveTimers.has(noteId)) {
      clearTimeout(this._autoSaveTimers.get(noteId));
      this._autoSaveTimers.delete(noteId);
    }
    this.updateNote(noteId, fieldUpdates);
    this._lastSavedAt = Date.now();
  }

  _extractTags(content) {
    if (!content) return [];
    const re = /(?<=^|\s)#([\w-]+)/g;
    const tags = new Set();
    let match;
    while ((match = re.exec(content)) !== null) {
      tags.add(match[1].toLowerCase());
    }
    return Array.from(tags);
  }

  _computeExcerpt(content, maxLen = 180) {
    if (!content) return null;
    const plain = content
      .replace(/<\/(p|h[1-6]|li|div|blockquote|pre)>/g, ' ')
      .replace(/<br\s*\/?>/g, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/\x00SUP\x00|\x00\/SUP\x00/g, '')
      .replace(/[*#>`\[\]]/g, '')
      .replace(/---/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (plain.length <= maxLen) return plain;
    const truncated = plain.slice(0, maxLen);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > 0 ? truncated.slice(0, lastSpace) + '...' : truncated + '...';
  }

  createCategory({ name, color, icon }) {
    const created = this._state.addNoteCategory({ name, color, icon });
    this._emit('categories-changed', { action: 'create', id: created?.id });
    return created;
  }

  updateCategory(id, updates) {
    this._state.updateNoteCategory(id, updates);
    this._emit('categories-changed', { action: 'update', id });
  }

  deleteCategory(id) {
    const cat = this._state.noteCategories.find(c => c.id === id);
    if (!cat) return;
    this._state.deleteNoteCategory(id);
    for (const note of this._state.notes) {
      if (note.categoryId === id) {
        this._state.updateNote(note.id, { categoryId: null });
      }
    }
    this._emit('categories-changed', { action: 'delete', id });
  }

  getAllCategories() {
    return this._state.noteCategories.filter(() => true);
  }

  getCategoryById(id) {
    return this._state.noteCategories.find(c => c.id === id);
  }

  destroy() {
    if (this._bridgeHandler) {
      window.removeEventListener('sync-module-updated', this._bridgeHandler);
      this._bridgeHandler = null;
    }
    this._listeners = {};
  }
};
