window.PassageRef = {
  _bookMap: {
    'Gen': 1, 'Ex': 2, 'Lev': 3, 'Num': 4, 'Deut': 5,
    'Josh': 6, 'Jdg': 7, 'Rut': 8, '1Sa': 9, '1 Sa': 9, '2Sa': 10, '2 Sa': 10,
    '1Kgs': 11, '1 Kgs': 11, '2Kgs': 12, '2 Kgs': 12,
    '1Chr': 13, '1 Chr': 13, '2Chr': 14, '2 Chr': 14,
    'Ezr': 15, 'Neh': 16, 'Est': 17, 'Job': 18, 'Ps': 19, 'Psa': 19,
    'Pro': 20, 'Ecc': 21, 'Sos': 22,
    'Isa': 23, 'Jer': 24, 'Lam': 25, 'Eze': 26, 'Dan': 27,
    'Hos': 28, 'Joe': 29, 'Amo': 30, 'Oba': 31, 'Jon': 32,
    'Mic': 33, 'Nah': 34, 'Hab': 35, 'Zep': 36, 'Hag': 37,
    'Zec': 38, 'Mal': 39,
    'Mat': 40, 'Mk': 41, 'Luk': 42, 'John': 43,
    'Acts': 44, 'Rom': 45, '1Co': 46, '1 Co': 46,
    '2Co': 47, '2 Co': 47, 'Gal': 48, 'Eph': 49,
    'Phil': 50, 'Col': 51, '1Th': 52, '1 Th': 52,
    '2Th': 53, '2 Th': 53, '1Ti': 54, '1 Ti': 54,
    '2Ti': 55, '2 Ti': 55, 'Tit': 56, 'Phlm': 57,
    'Heb': 58, 'Jam': 59, '1Pe': 60, '1 Pe': 60,
    '2Pe': 61, '2 Pe': 61, '1Jn': 62, '1 Jn': 62,
    '2Jn': 63, '2 Jn': 63, '3Jn': 64, '3 Jn': 64,
    'Jude': 65, 'Rev': 66
  },

  _reverseMap: null,

  _buildReverse() {
    if (this._reverseMap) return;
    this._reverseMap = {};
    for (const [key, id] of Object.entries(this._bookMap)) {
      if (!this._reverseMap[id] || key.indexOf(' ') === -1) {
        this._reverseMap[id] = key;
      }
    }
  },

  parsePassage(text) {
    text = text.trim();
    if (!text) return null;
    const parts = text.split(';').map(s => s.trim()).filter(Boolean);
    return parts.map(p => this._parseSingle(p)).filter(Boolean);
  },

  _parseSingle(text) {
    const m = text.match(/^([\d\s]*[A-Za-z]\S*(?:\s+\d)?)\s+(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) return null;
    let bookName = m[1].trim();
    const chapter = parseInt(m[2], 10);
    const chapterEnd = m[3] ? parseInt(m[3], 10) : chapter;
    const bookId = this._bookMap[bookName];
    if (!bookId) return null;
    return { book_id: bookId, chapter, chapter_end: chapterEnd, verse: 1, verse_end: null };
  },

  parseChapterRange(text) {
    const parsed = this.parsePassage(text);
    if (!parsed || parsed.length === 0) return null;
    if (parsed.length === 1) return parsed[0];
    return { multi: true, parts: parsed };
  },

  formatPassage(passage) {
    if (!passage) return '';
    this._buildReverse();
    const name = window.BookMap.getName(passage.book_id) || this._reverseMap[passage.book_id] || `Book${passage.book_id}`;
    const ch = passage.chapter;
    const chEnd = passage.chapter_end || ch;
    const vStart = passage.verse_start || passage.verse || 1;
    const vEnd = passage.verse_end;
    const hasVerses = vEnd !== null && vEnd !== undefined;
    if (ch === chEnd) {
      if (hasVerses && (vStart !== 1 || vEnd !== vStart)) {
        if (vStart === vEnd) return `${name} ${ch}:${vStart}`;
        return `${name} ${ch}:${vStart}\u2013${vEnd}`;
      }
      return `${name} ${ch}`;
    }
    if (hasVerses && vStart !== 1) return `${name} ${ch}:${vStart}\u2013${chEnd}:${vEnd}`;
    return `${name} ${ch}\u2013${chEnd}`;
  },

  formatPassages(passages) {
    if (!passages || !passages.length) return '';
    return passages.map(p => this.formatPassage(p)).join('; ');
  },

  formatDailyReading(entries) {
    if (!entries || !entries.length) return '';
    return entries.map(e => {
      if (e.multi) {
        return e.parts.map(p => this.formatPassage(p)).join('; ');
      }
      return this.formatPassage(e);
    }).join(' | ');
  },

  bookNameFromAbbr(abbr) {
    return this._bookMap[abbr] ? window.BookMap.getName(this._bookMap[abbr]) : abbr;
  }
};
