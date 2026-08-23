window.StateStore = class StateStore {
  constructor() {
    this._listeners = new Map();
    this._throttleTimers = new Map();
    this._throttleDelay = 800;
    this._immediateKeys = new Set([
      'theme', 'accent', 'bionic', 'bionicStrength',
      'swipeMode', 'spotlightMode', 'speedMode', 'splitMode', 'splitPortrait',
      'focusMode', 'speedAutoAdvance', 'tapSwipeMode',
      'activeBookmarkSet',
      'activeHighlightColor',
      'fontFamily', 'fontSize', 'margins', 'lineSpacing', 'letterSpacing',
      'redLetter', 'redLetterColor', 'crossRefs',
      'footnotes', 'sectionHeadings',
      'poetryFormatting', 'paragraphBreaks',
      'paragraphMode', 'swipeMaxVerses', 'backgroundTexture',
      'uiSkin',
      'chapterHeaderAlignment', 'sectionHeadingAlignment', 'verseTextAlignment',
      'verseNumberPlacement',
      'currentTranslation',
      'currentBook', 'currentChapter', 'currentVerse', 'currentBookName',
      'wordClasses', 'wordClassAxisSettings',
      'wordStudyEnabled', 'wordStudyMode'
    ]);
    this._data = {
      bionic: false,
      bionicStrength: 0.45,
      theme: 'skin',
      accent: 'skin',
      currentBook: 1,
      currentChapter: 1,
      currentVerse: 1,
      currentBookName: 'Genesis',
      swipeMode: false,
      spotlightMode: false,
      speedMode: false,
      splitMode: false,
      splitPortrait: false,
      wpm: 250,
      focusMode: false,
      speedAutoAdvance: false,
      tapSwipeMode: true,
      currentTranslation: 'BSB',
      activeBookmarkSet: null,
      activeHighlightColor: null,
      swipeAnimDir: 'vertical',
      fontFamily: 'skin',
      fontSize: 1.083,
      margins: 1.0,
      lineSpacing: 1.8,
      letterSpacing: 0.005,
      redLetter: true,
      redLetterColor: '#BC3636',
      crossRefs: false,
      footnotes: true,
      chapterTitle: true,
      sectionHeadings: true,
      poetryFormatting: true,
      paragraphBreaks: false,
      paragraphMode: false,
      swipeMaxVerses: 4,
      backgroundTexture: true,
      uiSkin: 'modern',
      wordClasses: false,
      wordClassAxisSettings: null,
      wordStudyEnabled: false,
      wordStudyMode: false,
      clearReadingEnabled: false,
      clearReadingMode: 'off',
      clearReadingToggles: { content: true, pronoun: true, connector: true, relation: true, article: true, negation: true },
      chapterHeaderAlignment: 'skin',
      sectionHeadingAlignment: 'skin',
      verseTextAlignment: 'skin',
      verseNumberPlacement: 'skin'
    };
    this._isApplyingServerState = false;
    this._idbReady = false;
    this.moduleTimestamps = { settings: 0, reading: 0, bookmarks: 0, highlights: 0, notes: 0, plans: 0, noteCategories: 0, bookmarkSets: 0, repositories: 0, readingLog: 0, navigationHistory: 0 };
    this._tagCountCache = null;
    this.bookmarks = [];
    this.highlights = [];
    this.notes = [];
    this.plans = [];
    this.noteCategories = [];
    this.bookmarkSets = [];
    this._loadTimestamps();
    this._loadState();
    this._pendingWrites = [];
    this._initPromise = this.initializeDB().then(() => {
      this._setupPageHideFlush();
    });
  }

  _setupPageHideFlush() {
    const flush = () => this.flushPendingWrites().catch(() => {});
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    document.addEventListener('pagehide', flush);
  }

  async flushPendingWrites() {
    const writes = this._pendingWrites;
    this._pendingWrites = [];
    if (writes.length) {
      await Promise.allSettled(writes);
    }
  }

  _trackWrite(promise) {
    this._pendingWrites.push(promise);
  }

  async ready() {
    await this._initPromise;
  }

  async initializeDB() {
    try {
      await this._migrateFocusedWordIfNeeded();

      const stores = { bookmarks: 'bookmarks', highlights: 'highlights', notes: 'notes', plans: 'plans', noteCategories: 'note_categories', bookmarkSets: 'bookmark_sets' };
      for (const [key, storeName] of Object.entries(stores)) {
        const items = await window.idb.getAll(storeName);
        this[key] = items.filter(item => !item.deleted);
        if (this[key].length > 0) {
          this.moduleTimestamps[key] = Math.max(...this[key].map(i => i.updated_at));
        } else {
          this.moduleTimestamps[key] = 0;
        }
      }
      this._ensureTagsOnItems();
      this._saveTimestamps();
      const meta = await window.idb.get('metadata', 'tagCounts');
      this._tagCountCache = meta?.value || null;
      if (!this._tagCountCache) {
        this.rebuildTagCountCache();
      }
    } catch (e) {
      console.warn('[StateStore] IDB init failed:', e);
    }
    this._idbReady = true;
  }

  _countTags(cache, items) {
    for (const item of items) {
      if (item.tags && !item.deleted) {
        for (const tag of item.tags) {
          cache[tag] = (cache[tag] || 0) + 1;
        }
      }
    }
  }

  async _migrateFocusedWordIfNeeded() {
    try {
      await window.LegacyMigration.run();
    } catch (e) {
      console.warn('[StateStore] FocusedWord migration failed:', e);
    }
  }

  async rebuildTagCountCache() {
    const cache = {};
    this._countTags(cache, this.notes);
    this._countTags(cache, this.bookmarks);
    this._countTags(cache, this.highlights);
    this._tagCountCache = cache;
    try {
      await window.idb.put('metadata', { key: 'tagCounts', value: cache });
    } catch (e) {
      console.warn('[StateStore] failed to persist tag count cache:', e);
    }
  }

  _ensureTagsOnItems() {
    for (const item of this.highlights) {
      if (!item.tags) item.tags = [];
    }
    for (const item of this.bookmarks) {
      if (!item.tags) item.tags = [];
    }
    for (const item of this.notes) {
      if (!item.tags) item.tags = [];
    }
  }

  _updateTimestamp(key) {
    if (this._isApplyingServerState) return;
    if (key === 'currentBook' || key === 'currentChapter' || key === 'currentVerse' || key === 'currentBookName') {
      this.moduleTimestamps.reading = Date.now();
    } else {
      this.moduleTimestamps.settings = Date.now();
    }
    this._saveTimestamps();
  }

  setModuleTimestamp(module) {
    if (this._isApplyingServerState) return;
    if (['bookmarks', 'highlights', 'notes', 'plans', 'noteCategories', 'bookmarkSets', 'repositories', 'readingLog', 'navigationHistory'].includes(module)) {
      this.moduleTimestamps[module] = Date.now();
      this._saveTimestamps();
    }
  }

  _saveTimestamps() {
    try {
      localStorage.setItem('focused-word:sync-timestamps', JSON.stringify(this.moduleTimestamps));
    } catch (e) {}
  }

  _loadTimestamps() {
    try {
      const saved = localStorage.getItem('focused-word:sync-timestamps');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.settings === 'number') this.moduleTimestamps.settings = parsed.settings;
        if (typeof parsed.reading === 'number') this.moduleTimestamps.reading = parsed.reading;
        if (typeof parsed.bookmarks === 'number') this.moduleTimestamps.bookmarks = parsed.bookmarks;
        if (typeof parsed.highlights === 'number') this.moduleTimestamps.highlights = parsed.highlights;
        if (typeof parsed.notes === 'number') this.moduleTimestamps.notes = parsed.notes;
        if (typeof parsed.plans === 'number') this.moduleTimestamps.plans = parsed.plans;
        if (typeof parsed.noteCategories === 'number') this.moduleTimestamps.noteCategories = parsed.noteCategories;
        if (typeof parsed.bookmarkSets === 'number') this.moduleTimestamps.bookmarkSets = parsed.bookmarkSets;
        if (typeof parsed.repositories === 'number') this.moduleTimestamps.repositories = parsed.repositories;
        if (typeof parsed.planProgress === 'number') this.moduleTimestamps.planProgress = parsed.planProgress;
        if (typeof parsed.readingLog === 'number') this.moduleTimestamps.readingLog = parsed.readingLog;
        if (typeof parsed.navigationHistory === 'number') this.moduleTimestamps.navigationHistory = parsed.navigationHistory;
      }
    } catch (e) {}
  }

  async _persistItem(storeName, item) {
    const promise = window.idb.put(this._idbStoreName(storeName), item).catch(e => {
      console.warn('[StateStore] idb put failed:', e);
    });
    this._trackWrite(promise);
  }

  addBookmark(data) {
    const item = { id: window.UUID.generate(), deleted: false, updated_at: Date.now(), createdAt: Date.now(), tags: [], ...data };
    this.bookmarks.push(item);
    this.setModuleTimestamp('bookmarks');
    this._persistItem('bookmarks', item);
    if (item.tags?.length && this._tagCountCache) {
      for (const tag of item.tags) {
        this._tagCountCache[tag] = (this._tagCountCache[tag] || 0) + 1;
      }
    }
    return item;
  }

  addHighlight(data) {
    const item = { id: window.UUID.generate(), deleted: false, updated_at: Date.now(), createdAt: Date.now(), tags: [], ...data };
    this.highlights.push(item);
    this.setModuleTimestamp('highlights');
    this._persistItem('highlights', item);
    if (item.tags?.length && this._tagCountCache) {
      for (const tag of item.tags) {
        this._tagCountCache[tag] = (this._tagCountCache[tag] || 0) + 1;
      }
    }
    return item;
  }

  addNote(markdownContent) {
    const note = { id: window.UUID.generate(), deleted: false, updated_at: Date.now(), createdAt: Date.now(), content: markdownContent };
    this.notes.push(note);
    this.setModuleTimestamp('notes');
    this._persistItem('notes', note);
    return note;
  }

  addPlan(planData) {
    const plan = { id: window.UUID.generate(), deleted: false, updated_at: Date.now(), createdAt: Date.now(), ...planData };
    this.plans.push(plan);
    this.setModuleTimestamp('plans');
    this._persistItem('plans', plan);
    return plan;
  }

  _handleTagDeletion(item) {
    if (!item.tags?.length || !this._tagCountCache) return;
    for (const tag of item.tags) {
      if (this._tagCountCache[tag] !== undefined) this._tagCountCache[tag]--;
      if (this._tagCountCache[tag] <= 0) delete this._tagCountCache[tag];
    }
    window.TagCacheUtils.persistCache(this._tagCountCache).catch(() => {});
  }

  _tombstone(storeName, list, id) {
    const item = list.find(i => i.id === id);
    if (!item) return;
    item.deleted = true;
    item.updated_at = Date.now();
    this.setModuleTimestamp(storeName);
    this._persistItem(storeName, item);
    if (storeName === 'bookmarks' || storeName === 'highlights') {
      this._handleTagDeletion(item);
    }
  }

  updateBookmark(id, updates) {
    const item = this.bookmarks.find(i => i.id === id);
    if (!item) return;
    const oldTags = item.tags || [];
    Object.assign(item, updates, { updated_at: Date.now() });
    this.setModuleTimestamp('bookmarks');
    this._persistItem('bookmarks', item);
    if (updates.tags && this._tagCountCache) {
      window.TagCacheUtils.applyDiff(this._tagCountCache, oldTags, updates.tags);
      window.TagCacheUtils.persistCache(this._tagCountCache).catch(() => {});
    }
  }

  updateHighlight(id, updates) {
    const item = this.highlights.find(i => i.id === id);
    if (!item) return;
    const oldTags = item.tags || [];
    Object.assign(item, updates, { updated_at: Date.now() });
    this.setModuleTimestamp('highlights');
    this._persistItem('highlights', item);
    if (updates.tags && this._tagCountCache) {
      window.TagCacheUtils.applyDiff(this._tagCountCache, oldTags, updates.tags);
      window.TagCacheUtils.persistCache(this._tagCountCache).catch(() => {});
    }
  }

  updateNote(id, updates) {
    const item = this.notes.find(i => i.id === id);
    if (!item) return;
    Object.assign(item, updates, { updated_at: Date.now() });
    this.setModuleTimestamp('notes');
    this._persistItem('notes', item);
  }

  updatePlan(id, updates) {
    const item = this.plans.find(i => i.id === id);
    if (!item) return;
    Object.assign(item, updates, { updated_at: Date.now() });
    this.setModuleTimestamp('plans');
    this._persistItem('plans', item);
  }

  deleteBookmark(id) { this._tombstone('bookmarks', this.bookmarks, id); }
  deleteHighlight(id) { this._tombstone('highlights', this.highlights, id); }
  deleteNote(id) { this._tombstone('notes', this.notes, id); }
  deletePlan(id) { this._tombstone('plans', this.plans, id); }

  addBookmarkSet(data) {
    const item = { id: window.UUID.generate(), deleted: false, updated_at: Date.now(), createdAt: Date.now(), ...data };
    this.bookmarkSets.push(item);
    this.setModuleTimestamp('bookmarkSets');
    this._persistItem('bookmarkSets', item);
    return item;
  }

  updateBookmarkSet(id, updates) {
    const item = this.bookmarkSets.find(i => i.id === id);
    if (!item) return;
    Object.assign(item, updates, { updated_at: Date.now() });
    this.setModuleTimestamp('bookmarkSets');
    this._persistItem('bookmarkSets', item);
  }

  deleteBookmarkSet(id) {
    const item = this.bookmarkSets.find(i => i.id === id);
    if (!item) return;
    item.deleted = true;
    item.updated_at = Date.now();
    this.setModuleTimestamp('bookmarkSets');
    this._persistItem('bookmarkSets', item);
  }

  addNoteCategory(data) {
    const item = { id: window.UUID.generate(), deleted: false, updated_at: Date.now(), createdAt: Date.now(), ...data };
    this.noteCategories.push(item);
    this.setModuleTimestamp('noteCategories');
    this._persistItem('noteCategories', item);
    return item;
  }

  updateNoteCategory(id, updates) {
    const item = this.noteCategories.find(i => i.id === id);
    if (!item) return;
    Object.assign(item, updates, { updated_at: Date.now() });
    this.setModuleTimestamp('noteCategories');
    this._persistItem('noteCategories', item);
  }

  deleteNoteCategory(id) {
    const item = this.noteCategories.find(i => i.id === id);
    if (!item) return;
    item.deleted = true;
    item.updated_at = Date.now();
    this.setModuleTimestamp('noteCategories');
    this._persistItem('noteCategories', item);
  }

  async getAllForSync(storeKey) {
    const idbStore = this._idbStoreName(storeKey);
    try {
      return await window.idb.getAll(idbStore);
    } catch (e) {
      console.warn('[StateStore] getAllForSync failed:', storeKey, e);
      return [];
    }
  }

  async mergeArrays(localArray, remoteArray, storeName) {
    const map = new Map();
    if (Array.isArray(localArray)) localArray.forEach(item => map.set(item.id, item));
    if (Array.isArray(remoteArray)) {
      for (const item of remoteArray) {
        const existing = map.get(item.id);
        if (!existing || (item.updated_at || 0) > (existing.updated_at || 0)) {
          map.set(item.id, item);
        }
      }
    }
    const merged = Array.from(map.values());
    if (storeName) {
      const idbStore = this._idbStoreName(storeName);
      this[storeName] = merged.filter(item => !item.deleted);
      const multiPromise = window.idb.putMultiple(idbStore, merged).catch(e => {
        console.warn('[StateStore] idb putMultiple failed:', e);
      });
      this._trackWrite(multiPromise);
      let maxTs = 0;
      for (const item of merged) {
        if (item.updated_at && item.updated_at > maxTs) maxTs = item.updated_at;
      }
      this.moduleTimestamps[storeName] = maxTs;
      this._saveTimestamps();
    }
    if (storeName === 'notes' || storeName === 'highlights' || storeName === 'bookmarks') {
      this._tagCountCache = null;
      this.rebuildTagCountCache();
    }
    return merged;
  }

  _idbStoreName(key) {
    const map = { noteCategories: 'note_categories', bookmarkSets: 'bookmark_sets', bookmarks: 'bookmarks', highlights: 'highlights', notes: 'notes', plans: 'plans', readingLog: 'reading_log', navigationHistory: 'navigation_history' };
    return map[key] || key;
  }

  get(key) {
    return this._data[key];
  }

  set(key, value) {
    if (this._data[key] === value) return;
    const old = this._data[key];
    this._data[key] = value;
    this._notify(key, value, old);
    this._updateTimestamp(key);
    if (this._immediateKeys.has(key)) {
      this._persist(key);
    } else {
      this._throttledPersist(key);
    }
  }

  batch(updates) {
    const changed = [];
    for (const [key, value] of Object.entries(updates)) {
      if (this._data[key] !== value) {
        const old = this._data[key];
        this._data[key] = value;
        changed.push({ key, value, old });
      }
    }
    for (const c of changed) {
      this._notify(c.key, c.value, c.old);
      this._updateTimestamp(c.key);
    }
    for (const c of changed) {
      if (this._immediateKeys.has(c.key)) {
        this._persist(c.key);
      } else {
        this._throttledPersist(c.key);
      }
    }
  }

  onChange(keys, callback) {
    const keyArr = Array.isArray(keys) ? keys : [keys];
    for (const key of keyArr) {
      if (!this._listeners.has(key)) this._listeners.set(key, new Set());
      this._listeners.get(key).add(callback);
    }
    return () => this.offChange(callback);
  }

  offChange(callback) {
    for (const listeners of this._listeners.values()) {
      listeners.delete(callback);
    }
  }

  _notify(key, value, old) {
    const listeners = this._listeners.get(key);
    if (listeners) {
      for (const cb of listeners) {
        try { cb(key, value, old); } catch (e) { console.error('[state-store] handler error:', e); }
      }
    }
  }

  _persist(key) {
    try {
      if (key === 'clearReadingMode' || key === 'clearReadingToggles') return;
      if (key === 'currentBook' || key === 'currentChapter' || key === 'currentVerse' || key === 'currentBookName') {
        this._saveProgress();
      } else {
        localStorage.setItem('focused-word:' + key.replace(/([A-Z])/g, '-$1').toLowerCase(), JSON.stringify(this._data[key]));
      }
    } catch (e) { console.error('[state-store] persist failed:', e); }
  }

  _saveProgress() {
    try {
      localStorage.setItem('focused-word:progress', JSON.stringify({
        book: this._data.currentBook,
        chapter: this._data.currentChapter,
        verse: this._data.currentVerse,
        bookName: this._data.currentBookName
      }));
    } catch (e) { console.error('[state-store] saveProgress failed:', e); }
  }

  _throttledPersist(key) {
    if (this._throttleTimers.has(key)) return;
    this._throttleTimers.set(key, setTimeout(() => {
      this._throttleTimers.delete(key);
      this._persist(key);
    }, this._throttleDelay));
  }

  _loadState() {
    try {
      const map = {
        'focused-word:theme': 'theme',
        'focused-word:accent': 'accent',
        'focused-word:bionic': 'bionic',
        'focused-word:bionic-strength': 'bionicStrength',
        'focused-word:swipe-mode': 'swipeMode',
        'focused-word:spotlight-mode': 'spotlightMode',
        'focused-word:speed-mode': 'speedMode',
        'focused-word:wpm': 'wpm',
        'focused-word:focus-mode': 'focusMode',
        'focused-word:speed-auto-advance': 'speedAutoAdvance',
        'focused-word:tap-swipe': 'tapSwipeMode',
        'focused-word:current-translation': 'currentTranslation',
        'focused-word:active-bookmark-set': 'activeBookmarkSet',
        'focused-word:active-highlight-color': 'activeHighlightColor',
        'focused-word:font-family': 'fontFamily',
        'focused-word:font-size': 'fontSize',
        'focused-word:margins': 'margins',
        'focused-word:line-spacing': 'lineSpacing',
        'focused-word:letter-spacing': 'letterSpacing',
        'focused-word:red-letter': 'redLetter',
        'focused-word:red-letter-color': 'redLetterColor',
        'focused-word:cross-refs': 'crossRefs',
        'focused-word:footnotes': 'footnotes',
        'focused-word:chapter-title': 'chapterTitle',
        'focused-word:section-headings': 'sectionHeadings',
        'focused-word:section-heading-style': 'uiSkin',
        'focused-word:ui-skin': 'uiSkin',
        'focused-word:poetry-formatting': 'poetryFormatting',
        'focused-word:paragraph-breaks': 'paragraphBreaks',
        'focused-word:paragraph-mode': 'paragraphMode',
        'focused-word:swipe-max-verses': 'swipeMaxVerses',
        'focused-word:background-texture': 'backgroundTexture',
        'focused-word:chapter-header-alignment': 'chapterHeaderAlignment',
        'focused-word:section-heading-alignment': 'sectionHeadingAlignment',
        'focused-word:verse-text-alignment': 'verseTextAlignment',
        'focused-word:verse-number-placement': 'verseNumberPlacement',
        'focused-word:word-classes': 'wordClasses',
        'focused-word:word-class-axis-settings': 'wordClassAxisSettings',
        'focused-word:word-study-enabled': 'wordStudyEnabled',
        'focused-word:word-study-mode': 'wordStudyMode',
      };
      for (const [storageKey, dataKey] of Object.entries(map)) {
        let val = localStorage.getItem(storageKey);
        if (val === null && storageKey === 'focused-word:focus-mode') {
          val = localStorage.getItem('focused-word:zen-mode');
          if (val !== null) localStorage.removeItem('focused-word:zen-mode');
        }
        if (val !== null) {
          try {
            this._data[dataKey] = JSON.parse(val);
          } catch (e) {
            console.warn('[state-store] cleaning up corrupted value for', storageKey);
            localStorage.removeItem(storageKey);
          }
        }
      }
      if (!localStorage.getItem('focused-word:palette-migrated')) {
        localStorage.removeItem('focused-word:word-class-colors');
        localStorage.setItem('focused-word:palette-migrated', '1');
      }
      const progress = localStorage.getItem('focused-word:progress');
      if (progress) {
        const p = JSON.parse(progress);
        if (p.book) this._data.currentBook = p.book;
        if (p.chapter) this._data.currentChapter = p.chapter;
        if (p.verse) this._data.currentVerse = p.verse;
        if (p.bookName) this._data.currentBookName = p.bookName;
      }
    } catch (e) { console.error('[state-store] loadState failed:', e); }
  }
};
