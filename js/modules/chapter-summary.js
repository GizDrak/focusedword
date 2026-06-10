window.ChapterSummary = class ChapterSummary {
  static init() {
    if (!ChapterSummary._initStarted) {
      ChapterSummary._initStarted = true;
      ChapterSummary._ready = ChapterSummary._load();
    }
    return ChapterSummary._ready || Promise.resolve();
  }

  static getSummary(bookId, chapter) {
    if (!ChapterSummary._data) return null;

    const books = BibleDB._BOOKS;
    const book = books.find(b => b.id === bookId);
    if (!book) return null;

    const jsonName = ChapterSummary._normalizeBookName(book.name);
    const bookData = ChapterSummary._data.Bible['Old Testament'][jsonName] ||
                     ChapterSummary._data.Bible['New Testament'][jsonName];
    if (!bookData) return null;

    const ch = bookData.find(c => c.chapter === chapter);
    return ch ? ch.title : null;
  }

  static _normalizeBookName(name) {
    if (name === 'Revelation of John') return 'Revelation';
    if (name.startsWith('I ')) return '1 ' + name.slice(2);
    if (name.startsWith('II ')) return '2 ' + name.slice(3);
    if (name.startsWith('III ')) return '3 ' + name.slice(4);
    return name;
  }

  static async _load() {
    try {
      const res = await fetch('/scripture/en/bible_chapters.json');
      ChapterSummary._data = await res.json();
    } catch {
      ChapterSummary._data = null;
    }
  }
}
