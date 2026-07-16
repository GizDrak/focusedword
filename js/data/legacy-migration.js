window.LegacyMigration = {
  async run() {
    if (!await this._needsMigration()) return;
    const data = await this._readFocusedWord();
    const highlights = data.highlights || [];
    const bookmarks = data.bookmarks || [];
    const sets = data.bookmark_sets || [];

    if (highlights.length || bookmarks.length || sets.length) {
      const setIdMap = new Map();

      for (const s of sets) {
        const oldId = s.id;
        if (typeof oldId !== 'string') s.id = window.UUID.generate();
        if (oldId !== s.id) setIdMap.set(oldId, s.id);
        s.updated_at = s.updated_at || s.createdAt || Date.now();
        if (!s.tags) s.tags = [];
        await window.idb.put('bookmark_sets', s);
      }

      for (const h of highlights) {
        if (typeof h.id !== 'string') h.id = window.UUID.generate();
        h.updated_at = h.updated_at || h.createdAt || Date.now();
        if (!h.tags) h.tags = [];
        await window.idb.put('highlights', h);
      }

      for (const b of bookmarks) {
        if (typeof b.id !== 'string') b.id = window.UUID.generate();
        if (b.setId && setIdMap.has(b.setId)) b.setId = setIdMap.get(b.setId);
        b.updated_at = b.updated_at || b.createdAt || Date.now();
        if (!b.tags) b.tags = [];
        if (!b.verses) b.verses = b.verse ? [b.verse] : [];
        await window.idb.put('bookmarks', b);
      }
    }

    await window.idb.put('metadata', { key: 'focusedWordMigrated', value: true });

    await new Promise(resolve => {
      const req = indexedDB.deleteDatabase('FocusedWord');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });

    console.log('[LegacyMigration] FocusedWord migration complete');
  },

  async _needsMigration() {
    try {
      const flag = await window.idb.get('metadata', 'focusedWordMigrated');
      if (flag?.value) return false;

      let dbExists = false;
      try {
        const allDbs = await indexedDB.databases();
        dbExists = allDbs.some(d => d.name === 'FocusedWord');
      } catch {
        const probe = indexedDB.open('FocusedWord');
        await new Promise(r => {
          probe.onsuccess = (e) => {
            dbExists = e.target.result.objectStoreNames.length > 0;
            e.target.result.close();
            r();
          };
          probe.onerror = () => r();
          probe.onupgradeneeded = () => r();
        });
      }
      if (!dbExists) {
        await window.idb.put('metadata', { key: 'focusedWordMigrated', value: true });
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },

  _readFocusedWord() {
    return new Promise(resolve => {
      const req = indexedDB.open('FocusedWord');
      req.onsuccess = (e) => {
        const db = e.target.result;
        const names = ['bookmarks', 'highlights', 'bookmark_sets'].filter(n => db.objectStoreNames.contains(n));
        if (!names.length) { db.close(); resolve({}); return; }
        const result = {};
        let pending = names.length;
        for (const n of names) {
          const tx = db.transaction(n, 'readonly');
          tx.objectStore(n).getAll().onsuccess = (ev) => {
            result[n] = ev.target.result || [];
            if (--pending === 0) { db.close(); resolve(result); }
          };
        }
      };
      req.onerror = () => resolve({});
      req.onupgradeneeded = () => resolve({});
    });
  }
};
