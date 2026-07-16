window.TagSearch = {
  search(tag, bridge) {
    const state = bridge.state;
    const notes = state.notes.filter(n => n.tags && n.tags.includes(tag) && !n.deleted);
    const highlights = state.highlights.filter(h => h.tags && h.tags.includes(tag) && !h.deleted);
    const bookmarks = state.bookmarks.filter(b => b.tags && b.tags.includes(tag) && !b.deleted);
    return { notes, highlights, bookmarks, tag };
  }
};
