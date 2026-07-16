window.BookGroups = {
  getGroup(name) {
    return this.groups[name] || null;
  },

  getAllGroups() {
    return Object.keys(this.groups).map(key => ({
      id: key,
      name: this._displayName(key),
      books: this.groups[key]
    }));
  },

  _displayName(key) {
    const names = {
      'whole-bible': 'Whole Bible',
      'old-testament': 'Old Testament',
      'new-testament': 'New Testament',
      'pentateuch': 'Pentateuch (Genesis\u2013Deuteronomy)',
      'history': 'History (Joshua\u2013Esther)',
      'wisdom': 'Wisdom (Job\u2013Song of Solomon)',
      'major-prophets': 'Major Prophets (Isaiah\u2013Daniel)',
      'minor-prophets': 'Minor Prophets (Hosea\u2013Malachi)',
      'gospels': 'Gospels (Matthew\u2013John)',
      'pauline-epistles': 'Pauline Epistles (Romans\u2013Philemon)',
      'general-epistles': 'General Epistles (Hebrews\u2013Jude)',
      'revelation': 'Revelation',
      'psalms': 'Psalms',
      'proverbs': 'Proverbs'
    };
    return names[key] || key;
  },

  groups: {
    'whole-bible': Array.from({ length: 66 }, (_, i) => i + 1),
    'old-testament': Array.from({ length: 39 }, (_, i) => i + 1),
    'new-testament': Array.from({ length: 27 }, (_, i) => i + 40),
    'pentateuch': [1, 2, 3, 4, 5],
    'history': [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
    'wisdom': [18, 19, 20, 21, 22],
    'major-prophets': [23, 24, 25, 26, 27],
    'minor-prophets': [28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39],
    'gospels': [40, 41, 42, 43],
    'pauline-epistles': [45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57],
    'general-epistles': [58, 59, 60, 61, 62, 63, 64, 65],
    'revelation': [66],
    'psalms': [19],
    'proverbs': [20]
  },

  isOT(bookId) { return bookId >= 1 && bookId <= 39; },
  isNT(bookId) { return bookId >= 40 && bookId <= 66; },

  getTestament(bookId) {
    if (this.isOT(bookId)) return 'ot';
    if (this.isNT(bookId)) return 'nt';
    return null;
  }
};
