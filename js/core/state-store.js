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
      'fontFamily', 'fontSize', 'margins', 'lineSpacing', 'letterSpacing',
      'redLetter'
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
      swipeAnimDir: 'vertical',
      fontFamily: 'inter',
      fontSize: 1.2,
      margins: 1.0,
      lineSpacing: 1.8,
      letterSpacing: 0.005,
      redLetter: true
    };
    this._loadState();
  }

  get(key) {
    return this._data[key];
  }

  set(key, value) {
    if (this._data[key] === value) return;
    const old = this._data[key];
    this._data[key] = value;
    this._notify(key, value, old);
    if (this._immediateKeys.has(key) || key === 'currentTranslation') {
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
        try { cb(key, value, old); } catch (e) { /* swallow handler errors */ }
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
    } catch (e) { /* storage full etc */ }
  }

  _saveProgress() {
    try {
      localStorage.setItem('focused-word:progress', JSON.stringify({
        book: this._data.currentBook,
        chapter: this._data.currentChapter,
        verse: this._data.currentVerse,
        bookName: this._data.currentBookName
      }));
    } catch (e) { /* ignore */ }
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
        'focused-word:font-family': 'fontFamily',
        'focused-word:font-size': 'fontSize',
        'focused-word:margins': 'margins',
        'focused-word:line-spacing': 'lineSpacing',
        'focused-word:letter-spacing': 'letterSpacing',
        'focused-word:red-letter': 'redLetter'
      };
      for (const [storageKey, dataKey] of Object.entries(map)) {
        let val = localStorage.getItem(storageKey);
        if (val === null && storageKey === 'focused-word:focus-mode') {
          val = localStorage.getItem('focused-word:zen-mode');
          if (val !== null) localStorage.removeItem('focused-word:zen-mode');
        }
        if (val !== null) {
          this._data[dataKey] = JSON.parse(val);
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
    } catch (e) { /* ignore parse failures */ }
  }
};
