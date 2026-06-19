window.StateStore = class StateStore {
  constructor() {
    this._listeners = new Map();
    this._throttleTimers = new Map();
    this._throttleDelay = 800;
    this._immediateKeys = new Set([
      'theme', 'accent', 'bionic', 'bionicStrength',
      'swipeMode', 'spotlightMode', 'speedMode',
      'focusMode', 'speedAutoAdvance', 'tapSwipe',
      'activeBookmarkSet',
      'activeHighlightColor',
      'fontFamily', 'fontSize', 'margins', 'lineSpacing', 'letterSpacing',
      'redLetter', 'crossRefs',
      'footnotes', 'sectionHeadings',
      'poetryFormatting', 'paragraphBreaks',
      'paragraphMode', 'backgroundTexture',
      'currentTranslation',
      'currentBook', 'currentChapter', 'currentVerse', 'currentBookName'
    ]);
    this._data = {
      bionic: false,
      bionicStrength: 0.45,
      theme: 'dark',
      accent: 'gold',
      currentBook: 1,
      currentChapter: 1,
      currentVerse: 1,
      currentBookName: 'Genesis',
      swipeMode: false,
      spotlightMode: false,
      speedMode: false,
      wpm: 250,
      focusMode: false,
      speedAutoAdvance: false,
      tapSwipeMode: true,
      currentTranslation: 'BSB',
      activeBookmarkSet: null,
      activeHighlightColor: null,
      swipeAnimDir: 'vertical',
      fontFamily: 'inter',
      fontSize: 1.083,
      margins: 1.0,
      lineSpacing: 1.8,
      letterSpacing: 0.005,
      redLetter: true,
      crossRefs: false,
      footnotes: true,
      sectionHeadings: true,
      poetryFormatting: true,
      paragraphBreaks: false,
      paragraphMode: false,
      backgroundTexture: true
    };
    this._isApplyingServerState = false;
    this._idbReady = false;
    this.moduleTimestamps = { settings: 0, reading: 0, bookmarks: 0, highlights: 0, notes: 0, plans: 0 };
    this.bookmarks = [];
    this.highlights = [];
    this.notes = [];
    this.plans = [];
    this._loadTimestamps();
    this._loadState();
    this._initPromise = this.initializeDB();
  }

  async ready() {
    await this._initPromise;
  }

  async initializeDB() {
    try {
      const stores = { bookmarks: 'bookmarks', highlights: 'highlights', notes: 'notes', plans: 'plans' };
      for (const [key, store] of Object.entries(stores)) {
        const items = await window.idb.getAll(store);
        this[key] = items.filter(item => !item.deleted);
        if (this[key].length > 0) {
          this.moduleTimestamps[key] = Math.max(...this[key].map(i => i.updated_at));
        } else {
          this.moduleTimestamps[key] = 0;
        }
      }
      this._saveTimestamps();
    } catch (e) {
      console.warn('[StateStore] IDB init failed:', e);
    }
    this._idbReady = true;
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
    if (['bookmarks', 'highlights', 'notes', 'plans'].includes(module)) {
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
      }
    } catch (e) {}
  }

  static _uuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  async _persistItem(storeName, item) {
    try { await window.idb.put(storeName, item); } catch (e) { console.warn('[StateStore] idb put failed:', e); }
  }

  addBookmark(data) {
    const item = { id: StateStore._uuid(), deleted: false, updated_at: Date.now(), createdAt: Date.now(), ...data };
    this.bookmarks.push(item);
    this.setModuleTimestamp('bookmarks');
    this._persistItem('bookmarks', item);
    return item;
  }

  addHighlight(data) {
    const item = { id: StateStore._uuid(), deleted: false, updated_at: Date.now(), createdAt: Date.now(), ...data };
    this.highlights.push(item);
    this.setModuleTimestamp('highlights');
    this._persistItem('highlights', item);
    return item;
  }

  addNote(markdownContent) {
    const note = { id: StateStore._uuid(), deleted: false, updated_at: Date.now(), createdAt: Date.now(), content: markdownContent };
    this.notes.push(note);
    this.setModuleTimestamp('notes');
    this._persistItem('notes', note);
    return note;
  }

  addPlan(planData) {
    const plan = { id: StateStore._uuid(), deleted: false, updated_at: Date.now(), createdAt: Date.now(), ...planData };
    this.plans.push(plan);
    this.setModuleTimestamp('plans');
    this._persistItem('plans', plan);
    return plan;
  }

  _tombstone(storeName, list, id) {
    const item = list.find(i => i.id === id);
    if (!item) return;
    item.deleted = true;
    item.updated_at = Date.now();
    this.setModuleTimestamp(storeName);
    this._persistItem(storeName, item);
  }

  updateBookmark(id, updates) {
    const item = this.bookmarks.find(i => i.id === id);
    if (!item) return;
    Object.assign(item, updates, { updated_at: Date.now() });
    this.setModuleTimestamp('bookmarks');
    this._persistItem('bookmarks', item);
  }

  updateHighlight(id, updates) {
    const item = this.highlights.find(i => i.id === id);
    if (!item) return;
    Object.assign(item, updates, { updated_at: Date.now() });
    this.setModuleTimestamp('highlights');
    this._persistItem('highlights', item);
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

  async mergeArrays(localArray, remoteArray, storeName) {
    const map = new Map();
    if (Array.isArray(localArray)) localArray.forEach(item => map.set(item.id, item));
    if (Array.isArray(remoteArray)) remoteArray.forEach(item => map.set(item.id, item));
    const merged = Array.from(map.values());
    if (storeName) {
      this[storeName] = merged.filter(item => !item.deleted);
      try { await window.idb.putMultiple(storeName, merged); } catch (e) { console.warn('[StateStore] idb putMultiple failed:', e); }
      let maxTs = 0;
      for (const item of merged) {
        if (item.updated_at && item.updated_at > maxTs) maxTs = item.updated_at;
      }
      this.moduleTimestamps[storeName] = maxTs;
      this._saveTimestamps();
    }
    return merged;
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
        'focused-word:cross-refs': 'crossRefs',
        'focused-word:footnotes': 'footnotes',
        'focused-word:section-headings': 'sectionHeadings',
        'focused-word:poetry-formatting': 'poetryFormatting',
        'focused-word:paragraph-breaks': 'paragraphBreaks',
        'focused-word:paragraph-mode': 'paragraphMode',
        'focused-word:background-texture': 'backgroundTexture'
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
