window.BookMap = {
  _codeToId: null,
  _idToCode: null,
  _entries: null,

  _build() {
    if (this._codeToId) return;
    this._codeToId = {};
    this._idToCode = {};
    this._entries = [];
    const entries = [
      [1, 'GEN', 'Genesis'],
      [2, 'EXO', 'Exodus'],
      [3, 'LEV', 'Leviticus'],
      [4, 'NUM', 'Numbers'],
      [5, 'DEU', 'Deuteronomy'],
      [6, 'JOS', 'Joshua'],
      [7, 'JDG', 'Judges'],
      [8, 'RUT', 'Ruth'],
      [9, '1SA', 'I Samuel'],
      [10, '2SA', 'II Samuel'],
      [11, '1KI', 'I Kings'],
      [12, '2KI', 'II Kings'],
      [13, '1CH', 'I Chronicles'],
      [14, '2CH', 'II Chronicles'],
      [15, 'EZR', 'Ezra'],
      [16, 'NEH', 'Nehemiah'],
      [17, 'EST', 'Esther'],
      [18, 'JOB', 'Job'],
      [19, 'PSA', 'Psalms'],
      [20, 'PRO', 'Proverbs'],
      [21, 'ECC', 'Ecclesiastes'],
      [22, 'SNG', 'Song of Solomon'],
      [23, 'ISA', 'Isaiah'],
      [24, 'JER', 'Jeremiah'],
      [25, 'LAM', 'Lamentations'],
      [26, 'EZK', 'Ezekiel'],
      [27, 'DAN', 'Daniel'],
      [28, 'HOS', 'Hosea'],
      [29, 'JOL', 'Joel'],
      [30, 'AMO', 'Amos'],
      [31, 'OBA', 'Obadiah'],
      [32, 'JON', 'Jonah'],
      [33, 'MIC', 'Micah'],
      [34, 'NAM', 'Nahum'],
      [35, 'HAB', 'Habakkuk'],
      [36, 'ZEP', 'Zephaniah'],
      [37, 'HAG', 'Haggai'],
      [38, 'ZEC', 'Zechariah'],
      [39, 'MAL', 'Malachi'],
      [40, 'MAT', 'Matthew'],
      [41, 'MRK', 'Mark'],
      [42, 'LUK', 'Luke'],
      [43, 'JHN', 'John'],
      [44, 'ACT', 'Acts'],
      [45, 'ROM', 'Romans'],
      [46, '1CO', 'I Corinthians'],
      [47, '2CO', 'II Corinthians'],
      [48, 'GAL', 'Galatians'],
      [49, 'EPH', 'Ephesians'],
      [50, 'PHP', 'Philippians'],
      [51, 'COL', 'Colossians'],
      [52, '1TH', 'I Thessalonians'],
      [53, '2TH', 'II Thessalonians'],
      [54, '1TI', 'I Timothy'],
      [55, '2TI', 'II Timothy'],
      [56, 'TIT', 'Titus'],
      [57, 'PHM', 'Philemon'],
      [58, 'HEB', 'Hebrews'],
      [59, 'JAS', 'James'],
      [60, '1PE', 'I Peter'],
      [61, '2PE', 'II Peter'],
      [62, '1JN', 'I John'],
      [63, '2JN', 'II John'],
      [64, '3JN', 'III John'],
      [65, 'JUD', 'Jude'],
      [66, 'REV', 'Revelation of John']
    ];
    for (const [id, code, name] of entries) {
      this._codeToId[code] = id;
      this._idToCode[id] = code;
      this._entries.push({ id, code, name });
    }
  },

  idToCode(id) {
    this._build();
    return this._idToCode[id];
  },

  codeToId(code) {
    this._build();
    return this._codeToId[code];
  },

  getBooks() {
    this._build();
    return this._entries.map(e => ({ id: e.id, name: e.name }));
  },

  asCodeMap() {
    this._build();
    const map = {};
    for (const e of this._entries) {
      map[e.code] = { id: e.id, name: e.name, code: e.code };
    }
    return map;
  },

  getName(id) {
    this._build();
    const entry = this._entries.find(e => e.id === id);
    return entry ? entry.name : '';
  },

  getIds() {
    this._build();
    return Object.keys(this._idToCode).map(Number);
  },

  isOT(id) {
    return id <= 39;
  },

  isNT(id) {
    return id >= 40;
  },

  normalizeName(name) {
    return name
      .replace(/^1\s+/, 'I ')
      .replace(/^2\s+/, 'II ')
      .replace(/^3\s+/, 'III ')
      .replace(/^Psalm$/, 'Psalms')
      .replace(/^Song of Songs$/, 'Song of Solomon')
      .replace(/^Revelation of Jesus Christ$/, 'Revelation of John');
  },

  denormalizeName(name) {
    if (name === 'Revelation of John') return 'Revelation';
    if (name.startsWith('I ')) return '1 ' + name.slice(2);
    if (name.startsWith('II ')) return '2 ' + name.slice(3);
    if (name.startsWith('III ')) return '3 ' + name.slice(4);
    return name;
  }
};
