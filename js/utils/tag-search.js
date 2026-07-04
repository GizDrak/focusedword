window.TagSearch = {
  search(tag, bridge) {
    const state = bridge.state;
    const notes = state.notes.filter(n => n.tags && n.tags.includes(tag));
    const highlights = state.highlights.filter(h => h.tags && h.tags.includes(tag));
    const bookmarks = state.bookmarks.filter(b => b.tags && b.tags.includes(tag));
    return { notes, highlights, bookmarks, tag };
  },

  searchFromIdb(tag) {
    return Promise.all([
      window.idb.getAllFromIndex('notes', 'byTags', tag).then(items => (items || []).filter(i => !i.deleted)),
      window.idb.getAllFromIndex('highlights', 'byTags', tag).then(items => (items || []).filter(i => !i.deleted)),
      window.idb.getAllFromIndex('bookmarks', 'byTags', tag).then(items => (items || []).filter(i => !i.deleted))
    ]).then(([notes, highlights, bookmarks]) => ({ notes, highlights, bookmarks, tag }));
  }
};
