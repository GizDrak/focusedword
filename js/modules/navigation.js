window.NavigationModule = class NavigationModule {
  constructor(bridge) {
    this.bridge = bridge;
    this.booksCache = [];
    this.currentVerses = [];
    this._cleanupFocus = null;
  }

  onRegister(bridge) {
    Object.defineProperty(bridge, 'booksCache', {
      get: () => this.booksCache
    });
  }

  async init() {
    this.booksCache = await this.bridge.db.getBooks();
    this._initEventListeners();
  }

  _initEventListeners() {
    const bibleTab = document.querySelector('.tab-item[data-tab="bible"]');
    if (bibleTab) {
      let pressTimer = null;
      let isLongPress = false;

      bibleTab.addEventListener('pointerdown', () => {
        isLongPress = false;
        pressTimer = setTimeout(() => {
          isLongPress = true;
          const settings = this.bridge.get('settings');
          if (settings) settings.toggleFocusMode();
        }, 500);
      });

      bibleTab.addEventListener('pointerup', () => {
        clearTimeout(pressTimer);
      });

      bibleTab.addEventListener('pointercancel', () => {
        clearTimeout(pressTimer);
        isLongPress = false;
      });

      bibleTab.addEventListener('click', (e) => {
        if (isLongPress) {
          e.preventDefault();
          e.stopPropagation();
          isLongPress = false;
          return;
        }
        this.openSheet('translation');
      });
    }

    document.getElementById('nav-close').addEventListener('click', () => this.closeSheet());
    document.getElementById('nav-backdrop').addEventListener('click', () => this.closeSheet());

    this.bridge.on('nav:advance-chapter', (payload) => {
      if (payload.direction === 'next') this.loadNextChapter(payload.autoAdvance);
      else this.loadPrevChapter();
    });
  }

  async switchTranslation() {
    this.booksCache = await this.bridge.db.getBooks();
    const state = this.bridge.state;
    await this.loadChapter(state.get('currentBook'), state.get('currentChapter'));
  }

  async loadChapter(bookId, chapter) {
    const state = this.bridge.state;
    state.batch({
      currentBook: bookId,
      currentChapter: chapter
    });

    const book = this.booksCache.find(b => b.id === bookId);
    if (book) state.set('currentBookName', book.name);

    this.currentVerses = await this.bridge.db.getVerses(bookId, chapter);

    this.bridge.emit('nav:chapter-loaded', { verses: this.currentVerses });
  }

  async loadNextChapter(autoAdvance) {
    const state = this.bridge.state;
    const bookId = state.get('currentBook');
    const book = this.booksCache.find(b => b.id === bookId);
    const bookIndex = this.booksCache.indexOf(book);
    const totalChapters = await this.bridge.db.getChapterCount(bookId);

    state.set('currentVerse', 1);

    if (state.get('currentChapter') < totalChapters) {
      await this.loadChapter(bookId, state.get('currentChapter') + 1);
    } else if (bookIndex < this.booksCache.length - 1) {
      const nextBook = this.booksCache[bookIndex + 1];
      await this.loadChapter(nextBook.id, 1);
    }

    if (autoAdvance) {
      const speed = this.bridge.get('renderer-speed');
      if (speed) speed.togglePlayPause();
    }
  }

  async loadPrevChapter() {
    const state = this.bridge.state;
    const bookId = state.get('currentBook');
    const book = this.booksCache.find(b => b.id === bookId);
    const bookIndex = this.booksCache.indexOf(book);

    state.set('currentVerse', 1);

    if (state.get('currentChapter') > 1) {
      await this.loadChapter(bookId, state.get('currentChapter') - 1);
    } else if (bookIndex > 0) {
      const prevBook = this.booksCache[bookIndex - 1];
      const totalChapters = await this.bridge.db.getChapterCount(prevBook.id);
      await this.loadChapter(prevBook.id, totalChapters);
    }
  }

  scrollToVerse(verseNum) {
    const state = this.bridge.state;
    if (!verseNum) verseNum = state.get('currentVerse');

    const containers = document.querySelectorAll('.verse-container');
    for (const c of containers) {
      const num = c.querySelector('.verse-num');
      if (num && parseInt(num.textContent) === verseNum) {
        c.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      }
    }
  }

  async navigateTo(bookId, chapter, verse) {
    const state = this.bridge.state;
    state.batch({
      currentBook: bookId,
      currentChapter: chapter,
      currentVerse: verse
    });
    this.closeSheet();
    await this.loadChapter(bookId, chapter);
  }

  renderBookList() {
    const list = document.getElementById('nav-book-list');
    list.innerHTML = '';
    const otBooks = this.booksCache.filter(b => b.id <= 39);
    const ntBooks = this.booksCache.filter(b => b.id >= 40);
    const currentBookId = this.bridge.state.get('currentBook');

    const renderColumn = (books, label) => {
      const col = document.createElement('div');
      col.className = 'nav-testament';
      const header = document.createElement('div');
      header.className = 'nav-testament-header';
      header.textContent = label;
      col.appendChild(header);
      for (const book of books) {
        const btn = document.createElement('button');
        btn.className = 'nav-book-item';
        if (book.id === currentBookId) btn.classList.add('current');
        btn.textContent = book.name;
        btn.addEventListener('click', () => this.openSheet('chapters', book.id));
        col.appendChild(btn);
      }
      return col;
    };

    list.appendChild(renderColumn(otBooks, 'Old Testament'));
    list.appendChild(renderColumn(ntBooks, 'New Testament'));
  }

  async renderChapterGrid(bookId) {
    const grid = document.getElementById('nav-chapter-grid');
    grid.innerHTML = '';
    const count = await this.bridge.db.getChapterCount(bookId);
    const state = this.bridge.state;
    for (let i = 1; i <= count; i++) {
      const item = document.createElement('button');
      item.className = 'nav-grid-item';
      if (bookId === state.get('currentBook') && i === state.get('currentChapter')) {
        item.classList.add('current');
      }
      item.textContent = String(i);
      item.addEventListener('click', () => this.openSheet('verses', bookId, i));
      grid.appendChild(item);
    }
  }

  async renderVerseGrid(bookId, chapter) {
    const grid = document.getElementById('nav-verse-grid');
    grid.innerHTML = '';
    const count = await this.bridge.db.getVerseCount(bookId, chapter);
    const state = this.bridge.state;
    for (let i = 1; i <= count; i++) {
      const item = document.createElement('button');
      item.className = 'nav-grid-item';
      if (bookId === state.get('currentBook') && chapter === state.get('currentChapter') && i === state.get('currentVerse')) {
        item.classList.add('current');
      }
      item.textContent = String(i);
      item.addEventListener('click', () => this.navigateTo(bookId, chapter, i));
      grid.appendChild(item);
    }
  }

  renderTranslationView() {
    const select = document.getElementById('nav-translation');
    if (!select || select.options.length > 0) return;

    const manifest = this.bridge.translationManifest;
    if (!manifest || !manifest.length) return;

    const currentId = this.bridge.state.get('currentTranslation');
    let selectedIndex = 0;
    for (let i = 0; i < manifest.length; i++) {
      const opt = document.createElement('option');
      opt.value = manifest[i].id;
      opt.textContent = manifest[i].name;
      select.appendChild(opt);
      if (manifest[i].id === currentId) selectedIndex = i;
    }
    select.selectedIndex = selectedIndex;

    select.addEventListener('change', async () => {
      const id = select.value;
      if (id === this.bridge.state.get('currentTranslation')) return;

      this.bridge.state.set('currentTranslation', id);

      try {
        const ok = await this.bridge.db.init(id);
        if (!ok) {
          this.bridge.state.set('currentTranslation', 'BSB');
          select.value = 'BSB';
          return;
        }
        await this.switchTranslation();
        this.renderBookList();
      } catch (e) {
        console.error('Translation switch failed:', e);
      }
    });
  }

  openSheet(view, bookId, chapter) {
    document.getElementById('nav-backdrop').classList.add('open');
    document.getElementById('nav-sheet').classList.add('open');

    document.getElementById('nav-view-books').classList.add('hidden');
    document.getElementById('nav-view-chapters').classList.add('hidden');
    document.getElementById('nav-view-verses').classList.add('hidden');

    const titleEl = document.getElementById('nav-sheet-title');
    titleEl.onclick = null;

    if (view === 'translation' || view === 'books') {
      titleEl.textContent = 'Books';
      document.getElementById('nav-view-books').classList.remove('hidden');
      if (view === 'translation') this.renderTranslationView();
      this.renderBookList();
    } else if (view === 'chapters') {
      titleEl.textContent = this.booksCache.find(b => b.id === bookId)?.name || 'Chapters';
      titleEl.onclick = () => this.openSheet('books');
      document.getElementById('nav-view-chapters').classList.remove('hidden');
      this.renderChapterGrid(bookId);
    } else if (view === 'verses') {
      const bookName = this.booksCache.find(b => b.id === bookId)?.name || '';
      titleEl.textContent = `${bookName} ${chapter}`;
      titleEl.onclick = () => this.openSheet('chapters', bookId);
      document.getElementById('nav-view-verses').classList.remove('hidden');
      this.renderVerseGrid(bookId, chapter);
    }

    const base = this.bridge.get('base-renderer');
    if (base) {
      this._cleanupFocus = base.trapFocus(document.getElementById('nav-sheet'), document.querySelector('.tab-item[data-tab="bible"]'));
    }
  }

  closeSheet() {
    document.getElementById('nav-backdrop').classList.remove('open');
    document.getElementById('nav-sheet').classList.remove('open');
    if (this._cleanupFocus) { this._cleanupFocus(); this._cleanupFocus = null; }
  }

};
