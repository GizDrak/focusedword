window.TagCacheUtils = {
  applyDiff(cacheRef, oldTags, newTags) {
    const oldSet = new Set(oldTags || []);
    const newSet = new Set(newTags || []);
    for (const tag of oldSet) {
      if (!newSet.has(tag)) {
        if (cacheRef[tag] !== undefined) cacheRef[tag]--;
        if (cacheRef[tag] <= 0) delete cacheRef[tag];
      }
    }
    for (const tag of newSet) {
      if (!oldSet.has(tag)) {
        cacheRef[tag] = (cacheRef[tag] || 0) + 1;
      }
    }
  },

  persistCache(cache) {
    if (!cache) return Promise.resolve();
    return window.idb.put('metadata', { key: 'tagCounts', value: cache });
  }
};
