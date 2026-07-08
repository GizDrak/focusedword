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

    document.getElementById('nav-testament-tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.nav-testament-tab');
      if (!tab) return;
      document.querySelectorAll('.nav-testament-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      this.renderBookList(tab.dataset.testament);
    });

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

    const bookCode = this.bridge.db.idToCode(bookId);
    if (bookCode) {
      const tokenVerses = await this.bridge.db.getChapterTokens(bookCode, chapter);
      this.currentVerses = tokenVerses.map(v => ({
        ...v,
        book_code: bookCode,
        book_id: bookId
      }));
    } else {
      this.currentVerses = [];
    }
    this.bridge.emit('nav:chapter-loaded', { verses: this.currentVerses });
  }

  async loadNextChapter(autoAdvance) {
    const state = this.bridge.state;
    const bookId = state.get('currentBook');
    const book = this.booksCache.find(b => b.id === bookId);
    const bookIndex = this.booksCache.indexOf(book);
    const totalChapters = await this.bridge.db.getChapterCount(bookId);

    window.verseManager.setIntentional(1);

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

    window.verseManager.setIntentional(1);

    if (state.get('currentChapter') > 1) {
      await this.loadChapter(bookId, state.get('currentChapter') - 1);
    } else if (bookIndex > 0) {
      const prevBook = this.booksCache[bookIndex - 1];
      const totalChapters = await this.bridge.db.getChapterCount(prevBook.id);
      await this.loadChapter(prevBook.id, totalChapters);
    }
  }

  async navigateTo(bookId, chapter, verse) {
    const state = this.bridge.state;
    state.batch({
      currentBook: bookId,
      currentChapter: chapter
    });
    window.verseManager.setIntentional(verse);
    this.closeSheet();
    await this.loadChapter(bookId, chapter);
  }

  renderBookList(testament) {
    const list = document.getElementById('nav-book-list');
    list.innerHTML = '';
    const currentBookId = this.bridge.state.get('currentBook');

    const books = this.booksCache.filter(b =>
      testament === 'ot' ? b.id <= 39 : b.id >= 40
    );

    for (const book of books) {
      const btn = document.createElement('button');
      btn.className = 'nav-book-item';
      if (book.id === currentBookId) btn.classList.add('current');
      btn.textContent = book.name;
      btn.addEventListener('click', () => this.openSheet('chapters', book.id));
      list.appendChild(btn);
    }
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
    const btn = document.getElementById('nav-translation-btn');
    const menu = document.getElementById('nav-translation-menu');
    if (!btn || !menu) return;

    const manifest = this.bridge.translationManifest;
    if (!manifest || !manifest.length) return;

    const currentId = this.bridge.state.get('currentTranslation');

    const current = manifest.find(t => t.id === currentId);
    btn.textContent = current ? current.name : 'Select Bible';

    menu.innerHTML = '';
    for (let i = 0; i < manifest.length; i++) {
      const t = manifest[i];
      const item = document.createElement('button');
      item.className = 'nav-translation-menu-item';
      item.dataset.id = t.id;
      item.textContent = t.name;
      if (t.id === currentId) item.classList.add('active');

      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = item.dataset.id;
        if (id === this.bridge.state.get('currentTranslation')) {
          menu.classList.remove('open');
          return;
        }
        this.bridge.state.set('currentTranslation', id);
        try {
          const ok = await this.bridge.db.init(id);
          if (!ok) {
            this.bridge.state.set('currentTranslation', 'BSB');
            return;
          }
          await this.switchTranslation();
          const activeTestament = document.querySelector('.nav-testament-tab.active')?.dataset.testament || 'ot';
          this.renderBookList(activeTestament);
          this.renderTranslationView();
        } catch (e) {
          console.error('Translation switch failed:', e);
        }
        menu.classList.remove('open');
      });
      menu.appendChild(item);
    }

    if (!this._menuBound) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('open');
      });

      document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && e.target !== btn) {
          menu.classList.remove('open');
        }
      });

      this._menuBound = true;
    }
  }

  openSheet(view, bookId, chapter) {
    const backdrop = document.getElementById('nav-backdrop');
    const sheet = document.getElementById('nav-sheet');
    backdrop.classList.add('open');
    sheet.classList.add('open');

    document.getElementById('nav-view-books').classList.add('hidden');
    document.getElementById('nav-view-chapters').classList.add('hidden');
    document.getElementById('nav-view-verses').classList.add('hidden');

    const testamentTabs = document.getElementById('nav-testament-tabs');
    const breadcrumb = document.getElementById('nav-breadcrumb');

    if (view === 'translation' || view === 'books') {
      testamentTabs.classList.remove('hidden');
      breadcrumb.innerHTML = '';
      breadcrumb.classList.add('hidden');
      if (view === 'translation') this.renderTranslationView();
      const activeTestament = document.querySelector('.nav-testament-tab.active')?.dataset.testament || 'ot';
      this.renderBookList(activeTestament);
      document.getElementById('nav-view-books').classList.remove('hidden');
    } else if (view === 'chapters') {
      testamentTabs.classList.add('hidden');
      const book = this.booksCache.find(b => b.id === bookId);
      breadcrumb.innerHTML =
        `<button class="nav-crumb" data-view="books">Books</button>` +
        `<span class="nav-crumb">${book?.name || ''}</span>` +
        `<span class="nav-crumb-current">Chapter</span>`;
      breadcrumb.classList.remove('hidden');
      breadcrumb.querySelector('[data-view="books"]').addEventListener('click', () => this.openSheet('books'));
      document.getElementById('nav-view-chapters').classList.remove('hidden');
      this.renderChapterGrid(bookId);
    } else if (view === 'verses') {
      const book = this.booksCache.find(b => b.id === bookId);
      breadcrumb.innerHTML =
        `<button class="nav-crumb" data-view="books">Books</button>` +
        `<button class="nav-crumb" data-view="chapters" data-book-id="${bookId}">${book?.name || ''}</button>` +
        `<span class="nav-crumb">Chapter ${chapter}</span>` +
        `<span class="nav-crumb-current">Verse</span>`;
      breadcrumb.classList.remove('hidden');
      const booksBtn = breadcrumb.querySelector('[data-view="books"]');
      if (booksBtn) booksBtn.addEventListener('click', () => this.openSheet('books'));
      const chaptersBtn = breadcrumb.querySelector('[data-view="chapters"]');
      if (chaptersBtn) chaptersBtn.addEventListener('click', () => this.openSheet('chapters', bookId));
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
    const menu = document.getElementById('nav-translation-menu');
    if (menu) menu.classList.remove('open');
    if (this._cleanupFocus) { this._cleanupFocus(); this._cleanupFocus = null; }
  }

};
