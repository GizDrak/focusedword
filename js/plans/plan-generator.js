window.PlanGenerator = class PlanGenerator {
  constructor(bridge) {
    this.bridge = bridge;
    this._wordCache = new Map();
  }

  generateUnits(params) {
    const split = params.split_chapters;
    const maxMin = params.max_minutes || 15;
    if (split) return this._generateUnitsWithSplits(params, maxMin);
    return this._generateUnitsNoSplit(params);
  }

  async _generateUnitsNoSplit(params) {
    const content = params.content || {};
    const books = this._resolveBooks(content);
    const order = params.order || 'canonical';
    const orderedBooks = await this._orderBooks(books, order);

    const units = [];
    for (const bookId of orderedBooks) {
      const chapterCount = await this._getChapterCount(bookId);
      for (let ch = 1; ch <= chapterCount; ch++) {
        const verseCount = await this._getVerseCount(bookId, ch);
        units.push({
          book_id: bookId,
          chapter: ch,
          chapter_end: ch,
          verse_start: 1,
          verse_end: verseCount,
          weight: this._calcWeight(verseCount)
        });
      }
    }
    return units;
  }

  async _generateUnitsWithSplits(params, maxMinutes) {
    const content = params.content || {};
    const books = this._resolveBooks(content);
    const order = params.order || 'canonical';
    const orderedBooks = await this._orderBooks(books, order);
    const readingWPM = 200;

    const units = [];
    for (const bookId of orderedBooks) {
      const chapterCount = await this._getChapterCount(bookId);
      const code = window.BookMap.idToCode(bookId);
      for (let ch = 1; ch <= chapterCount; ch++) {
        const verseData = await this._getVerseWordCounts(code, ch);
        if (!verseData || verseData.length === 0) continue;
        const totalWords = verseData.reduce((s, v) => s + v.wc, 0);
        const totalMinutes = totalWords / readingWPM;

        if (totalMinutes <= maxMinutes) {
          units.push({
            book_id: bookId,
            chapter: ch,
            chapter_end: ch,
            verse_start: verseData[0].v,
            verse_end: verseData[verseData.length - 1].v,
            weight: this._calcWeight(verseData.length)
          });
        } else {
          let accWords = 0;
          let splitStart = verseData[0].v;
          for (const vd of verseData) {
            accWords += vd.wc;
            if (accWords / readingWPM >= maxMinutes) {
              units.push({
                book_id: bookId,
                chapter: ch,
                chapter_end: ch,
                verse_start: splitStart,
                verse_end: vd.v,
                weight: Math.max(1, Math.round((accWords / readingWPM) * 10) / 10)
              });
              accWords = 0;
              splitStart = vd.v + 1;
            }
          }
          if (splitStart <= verseData[verseData.length - 1].v) {
            const remainingWords = verseData.filter(v => v.v >= splitStart).reduce((s, v) => s + v.wc, 0);
            units.push({
              book_id: bookId,
              chapter: ch,
              chapter_end: ch,
              verse_start: splitStart,
              verse_end: verseData[verseData.length - 1].v,
              weight: Math.max(1, Math.round((remainingWords / readingWPM) * 10) / 10)
            });
          }
        }
      }
    }
    return units;
  }

  async _getVerseWordCounts(code, chapter) {
    const key = code + ':' + chapter;
    if (this._wordCache.has(key)) return this._wordCache.get(key);

    try {
      const db = this.bridge.db;
      if (!db || !db.getCoreDb) return null;
      const rows = [];
      db.getCoreDb().exec({
        sql: 'SELECT verse, clean_text FROM bible_verses WHERE book = ? AND chapter = ? ORDER BY verse',
        bind: [code, chapter],
        rowMode: 'object',
        resultRows: rows
      });
      const result = rows.map(r => ({
        v: r.verse,
        wc: r.clean_text ? r.clean_text.split(/\s+/).filter(Boolean).length : 0
      }));
      this._wordCache.set(key, result);
      return result;
    } catch (e) {
      console.warn('[PlanGenerator] word count query failed:', e);
      return null;
    }
  }

  _resolveBooks(content) {
    if (content.books && content.books.length > 0) {
      let books = content.books;
      if (content.exclude && content.exclude.length > 0) {
        books = books.filter(b => !content.exclude.includes(b));
      }
      return books;
    }
    if (content.testament === 'ot') return Array.from({ length: 39 }, (_, i) => i + 1);
    if (content.testament === 'nt') return Array.from({ length: 27 }, (_, i) => i + 40);
    return Array.from({ length: 66 }, (_, i) => i + 1);
  }

  async _orderBooks(books, order) {
    if (order === 'canonical') return books.sort((a, b) => a - b);
    if (order === 'chronological') {
      const chronMap = await window.PredefinedLoader.loadChronologicalOrder();
      if (chronMap) {
        return books.slice().sort((a, b) => {
          const ca = chronMap[a];
          const cb = chronMap[b];
          if (ca && cb) {
            if (ca.known_chapter !== cb.known_chapter) return ca.known_chapter - cb.known_chapter;
            return a - b;
          }
          if (ca) return -1;
          if (cb) return 1;
          return a - b;
        });
      }
      return books.sort((a, b) => a - b);
    }
    if (order === 'mixed') {
      const ot = books.filter(b => b <= 39).sort((a, b) => a - b);
      const nt = books.filter(b => b >= 40).sort((a, b) => a - b);
      const wisdom = [19, 20];
      const others = books.filter(b => b > 0 && !ot.includes(b) && !nt.includes(b));
      const result = [];
      const maxLen = Math.max(ot.length, nt.length, wisdom.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < ot.length) result.push(ot[i]);
        if (i < wisdom.length) result.push(wisdom[i]);
        if (i < nt.length) result.push(nt[i]);
        if (i < others.length && i < maxLen) result.push(others[i]);
      }
      return result;
    }
    return books.sort((a, b) => a - b);
  }

  async _getChapterCount(bookId) {
    try {
      const db = this.bridge.db;
      if (db && db.getChapterCount) return await db.getChapterCount(bookId);
      const code = window.BookMap.idToCode(bookId);
      if (db && db.getCoreDb) {
        const result = await db.getCoreDb().selectValue('SELECT MAX(chapter) FROM bible_verses WHERE book=?', [code]);
        return result || 1;
      }
    } catch (e) {}
    return this._fallbackChapterCount(bookId);
  }

  async _getVerseCount(bookId, chapter) {
    try {
      const db = this.bridge.db;
      if (db && db.getVerseCount) return await db.getVerseCount(bookId, chapter);
      const code = window.BookMap.idToCode(bookId);
      if (db && db.getCoreDb) {
        const result = await db.getCoreDb().selectValue('SELECT COUNT(*) FROM bible_verses WHERE book=? AND chapter=?', [code, chapter]);
        return result || 1;
      }
    } catch (e) {}
    return 25;
  }

  _calcWeight(verseCount) {
    const avgWordsPerVerse = 28;
    const readingWPM = 200;
    const avgCharsPerWord = 5;
    const estChars = verseCount * avgWordsPerVerse * avgCharsPerWord;
    return Math.max(1, Math.round((estChars / (readingWPM * avgCharsPerWord)) * 10) / 10);
  }

  _fallbackChapterCount(bookId) {
    const counts = {
      1: 50, 2: 40, 3: 27, 4: 36, 5: 34, 6: 24, 7: 21, 8: 4, 9: 31, 10: 24,
      11: 22, 12: 25, 13: 29, 14: 36, 15: 10, 16: 13, 17: 10, 18: 42, 19: 150, 20: 31,
      21: 12, 22: 8, 23: 66, 24: 52, 25: 5, 26: 48, 27: 12, 28: 14, 29: 3, 30: 9,
      31: 1, 32: 4, 33: 7, 34: 3, 35: 3, 36: 3, 37: 2, 38: 14, 39: 4,
      40: 28, 41: 16, 42: 24, 43: 21, 44: 28, 45: 16, 46: 16, 47: 13, 48: 6, 49: 6,
      50: 4, 51: 4, 52: 5, 53: 3, 54: 6, 55: 4, 56: 3, 57: 1, 58: 13, 59: 5,
      60: 5, 61: 3, 62: 5, 63: 1, 64: 1, 65: 1, 66: 22
    };
    return counts[bookId] || 10;
  }
};
