window.NavigationModule = class NavigationModule {
  constructor(bridge) {
    this.bridge = bridge;
    this.booksCache = [];
    this.currentVerses = [];
    this._cleanupFocus = null;
    this._enrichGen = 0;
  }

  onRegister(bridge) {
    Object.defineProperty(bridge, 'booksCache', {
      get: () => this.booksCache
    });
  }

  async init() {
    this.booksCache = await this.bridge.db.getBooks();
    this._initEventListeners();
    this.bridge.on('nav:chapter-loaded', () => {
      if (this._recordNextNavigation) {
        this._recordNextNavigation = false;
        const s = this.bridge.state;
        const nh = this.bridge.get('navigation-history');
        if (nh) nh.record(s.get('currentBook'), s.get('currentChapter'), s.get('currentVerse'), s.get('currentBookName'));
      }
    });
  }

  _initEventListeners() {
    const bibleTab = document.querySelector('.tab-item[data-tab="bible"]');
    const bibleFloat = document.querySelector('.bible-float');

    const bindBibleControl = (el) => {
      let pressTimer = null;
      let isLongPress = false;
      let _pressStart = null;

      const clearTimer = () => {
        clearTimeout(pressTimer);
        pressTimer = null;
        _pressStart = null;
      };

      el.addEventListener('pointerdown', (e) => {
        isLongPress = false;
        _pressStart = { x: e.clientX, y: e.clientY };
        pressTimer = setTimeout(() => {
          isLongPress = true;
          const settings = this.bridge.get('settings');
          if (settings) settings.toggleFocusMode();
        }, 500);
      });

      el.addEventListener('pointermove', (e) => {
        if (!_pressStart) return;
        const dx = e.clientX - _pressStart.x;
        const dy = e.clientY - _pressStart.y;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          clearTimer();
          isLongPress = false;
        }
      });

      el.addEventListener('pointerup', clearTimer);
      el.addEventListener('pointercancel', () => {
        clearTimer();
        isLongPress = false;
      });

      el.addEventListener('click', (e) => {
        if (isLongPress) {
          e.preventDefault();
          e.stopPropagation();
          isLongPress = false;
          return;
        }
        this.openSheet('translation');
      });

      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };

    if (bibleTab) bindBibleControl(bibleTab);
    if (bibleFloat) {
      bindBibleControl(bibleFloat);
      bibleFloat.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.openSheet('translation');
        }
      });
    }

    // Sync active class from hidden bible tab to floating button
    if (bibleTab && bibleFloat) {
      const sync = () => bibleFloat.classList.toggle('active', bibleTab.classList.contains('active'));
      sync();
      new MutationObserver(sync).observe(bibleTab, { attributes: true, attributeFilter: ['class'] });
    }

    document.getElementById('nav-close').addEventListener('click', () => this.closeSheet());
    document.getElementById('nav-backdrop').addEventListener('click', () => this.closeSheet());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('nav-sheet').classList.contains('open')) {
        e.stopPropagation();
        this.closeSheet();
      }
    });

    document.getElementById('nav-testament-tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.nav-testament-tab');
      if (!tab) return;
      document.querySelectorAll('.nav-testament-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      if (tab.dataset.testament === 'recent') {
        this.openSheet('recent');
      } else if (!document.getElementById('nav-view-books').classList.contains('hidden')) {
        this.renderBookList(tab.dataset.testament);
      } else {
        this.openSheet('books');
        this.renderBookList(tab.dataset.testament);
      }
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
      // Render the chapter immediately; stream word classes / word study
      // enrichment afterwards so switching chapters never blocks on the
      // annotation databases.
      this._enrichGen = (this._enrichGen || 0) + 1;
      const gen = this._enrichGen;
      const versesForEnrich = this.currentVerses;
      this.bridge.emit('nav:chapter-loaded', { verses: this.currentVerses });

      const currentTranslation = this.bridge.state.get('currentTranslation');
      if (currentTranslation === 'BSB') {
        const wc = this.bridge.get('word-class-service');
        if (wc && (state.get('wordClasses') === true || state.get('clearReadingEnabled') === true || state.get('wordStudyEnabled') === true)) {
          // Enrichment is deferred past the first paint so the chapter renders
          // immediately (Phase 1). Annotations are applied to the living DOM in
          // place (Phase 2) and adjacent chapters are prefetched during idle
          // (Phase 3). Never block the initial paint.
          const run = async () => {
            try {
              if (!wc.isReady) await wc.init(this.bridge);
              if (!wc.isReady) return;
              const isStale = () => gen !== this._enrichGen || this.currentVerses !== versesForEnrich || state.get('currentBook') !== bookId || state.get('currentChapter') !== chapter;
              if (isStale()) return;

              const tasks = [];
              let didEnrich = false;

              if (state.get('wordClasses') === true) {
                tasks.push(
                  Promise.resolve(wc.getChapterRenderSpans(bookCode, chapter)).then(spans => {
                    if (isStale() || state.get('wordClasses') !== true) return;
                    for (const v of versesForEnrich) {
                      v.wordClassSpans = spans[v.verse] || [];
                    }
                    didEnrich = true;
                  })
                );
              }

              if (state.get('clearReadingEnabled') === true) {
                tasks.push(
                  Promise.resolve(wc.getClearReadingSpans(bookCode, chapter)).then(clearReading => {
                    if (isStale() || state.get('clearReadingEnabled') !== true) return;
                    for (const v of versesForEnrich) {
                      v.clearReadingSpans = clearReading[v.verse] || [];
                    }
                    didEnrich = true;
                  })
                );
              }

              if (state.get('wordStudyEnabled') === true) {
                tasks.push(
                  (async () => {
                    const ws = this.bridge.get('word-study-service');
                    if (!ws) return;
                    try {
                      if (!ws.dataReady) await ws.initDataDb();
                      if (isStale() || !ws.dataReady || state.get('wordStudyEnabled') !== true) return;
                      const cleanTextVerses = {};
                      for (const v of versesForEnrich) cleanTextVerses[v.verse] = v.clean_text || '';
                      const studySpans = await ws.getChapterStudySpans(bookCode, chapter, cleanTextVerses, wc);
                      if (isStale()) return;
                      for (const v of versesForEnrich) {
                        v.wordStudySpans = studySpans[v.verse] || [];
                      }
                      didEnrich = true;
                    } catch (e) {
                      console.warn('[Navigation] Word study span enrichment failed:', e);
                    }
                  })()
                );
              }

              await Promise.all(tasks);
              if (isStale() || !didEnrich) return;

              // Phase 2: apply spans onto the living DOM; the render manager
              // falls back to a full refresh only if the DOM no longer matches.
              this.bridge.emit('nav:annotations-applied', { verses: versesForEnrich });

              // Phase 3: idle-time prefetch of the adjacent chapter's spans so
              // the next swipe applies almost instantly.
              this._prefetchAdjacent(bookId, chapter, wc);
            } catch (e) {
              console.warn('[Navigation] Word class enrichment failed:', e);
            }
          };

          if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(() => run(), { timeout: 250 });
          } else {
            requestAnimationFrame(() => requestAnimationFrame(() => run()));
          }
        }
      }
    } else {
      this.currentVerses = [];
      this._enrichGen = (this._enrichGen || 0) + 1;
      this.bridge.emit('nav:chapter-loaded', { verses: this.currentVerses });
    }
  }

  // Phase 3: warm the annotation caches for the next/previous chapter during
  // idle time so a swipe apply is nearly instant. Errors are swallowed.
  async _prefetchAdjacent(bookId, chapter, wc) {
    if (!wc) return;
    const state = this.bridge.state;
    if (state.get('currentTranslation') !== 'BSB') return;
    const bookIndex = this.booksCache.findIndex(b => b.id === bookId);
    if (bookIndex < 0) return;
    try {
      const totalChapters = await this.bridge.db.getChapterCount(bookId);
      const code = this.bridge.db.idToCode(bookId);
      const targets = [];
      // Within the current book: previous / next chapter use the same code.
      if (chapter > 1) targets.push({ code, chapter: chapter - 1 });
      if (chapter < totalChapters) targets.push({ code, chapter: chapter + 1 });
      // Boundaries roll over into the adjacent book with that book's own code.
      if (chapter === 1 && bookIndex > 0) {
        const prevBook = this.booksCache[bookIndex - 1];
        const prevChapters = await this.bridge.db.getChapterCount(prevBook.id);
        targets.push({ code: this.bridge.db.idToCode(prevBook.id), chapter: prevChapters });
      }
      if (chapter === totalChapters && bookIndex < this.booksCache.length - 1) {
        const nextBook = this.booksCache[bookIndex + 1];
        targets.push({ code: this.bridge.db.idToCode(nextBook.id), chapter: 1 });
      }

      for (const t of targets) {
        if (!t.code) continue;
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(() => this._prefetchCb(t.code, t.chapter, wc), { timeout: 300 });
        } else {
          setTimeout(() => this._prefetchCb(t.code, t.chapter, wc), 0);
        }
      }
    } catch (e) {
      console.warn('[Navigation] adjacent prefetch setup failed:', e);
    }
  }

  _prefetchCb(bookCode, chapter, wc) {
    if (!wc) return;
    try {
      const state = this.bridge.state;
      const done = () => {
        if (state.get('wordClasses') === true) wc.getChapterRenderSpans(bookCode, chapter);
        if (state.get('clearReadingEnabled') === true) wc.getClearReadingSpans(bookCode, chapter);
      };
      Promise.resolve().then(done).catch(() => {});
    } catch (e) {
      console.warn('[Navigation] adjacent prefetch failed:', e);
    }
  }

  async loadNextChapter(autoAdvance) {
    this._recordNextNavigation = true;
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
    this._recordNextNavigation = true;
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
    this._recordNextNavigation = true;
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

  renderRecentView() {
    const container = document.getElementById('nav-recent-list');
    if (!container) return;
    const nh = this.bridge.get('navigation-history');
    const entries = nh ? nh.getRecent() : [];
    container.innerHTML = '';

    if (!entries.length) {
      container.innerHTML = '<div class="nav-empty-state">No recent locations yet.</div>';
      const clearBtn = document.getElementById('nav-recent-clear');
      if (clearBtn) clearBtn.style.display = 'none';
      return;
    }

    for (const entry of entries) {
      const item = document.createElement('button');
      item.className = 'nav-recent-item';
      const bookName = entry.bookName || `Book ${entry.book}`;
      const label = `${window.HTMLEscape(bookName)} ${entry.chapter}:${entry.verse}`;
      item.innerHTML = `<span class="nav-recent-ref">${label}</span><span class="nav-recent-time">${this._timeAgo(entry.visited_at)}</span>`;
      item.addEventListener('click', () => this.navigateTo(entry.book, entry.chapter, entry.verse));
      container.appendChild(item);
    }

    const clearBtn = document.getElementById('nav-recent-clear');
    if (clearBtn) clearBtn.style.display = '';
  }

  _timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }

  renderTranslationView() {
    const btn = document.getElementById('nav-translation-btn');
    const menu = document.getElementById('nav-translation-menu');
    if (!btn || !menu) return;

    const menuController = window.PopoverService
      ? window.PopoverService.create(menu, {
          onChange: (open) => btn.setAttribute('aria-expanded', String(open))
        })
      : null;

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
      if (t.id === currentId) {
        item.classList.add('active');
        item.setAttribute('aria-current', 'true');
      }

      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = item.dataset.id;
        if (id === this.bridge.state.get('currentTranslation')) {
          if (menuController) menuController.hide();
          else {
            menu.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
          }
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
        if (menuController) menuController.hide();
        else {
          menu.classList.remove('open');
          btn.setAttribute('aria-expanded', 'false');
        }
      });
      menu.appendChild(item);
    }

    if (!this._menuBound) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (menuController) menuController.toggle();
        else menu.classList.toggle('open');
      });

      if (!menuController?.native) document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && e.target !== btn) {
          menu.classList.remove('open');
          btn.setAttribute('aria-expanded', 'false');
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
    sheet.removeAttribute('aria-hidden');
    sheet.inert = false;
    backdrop.removeAttribute('aria-hidden');

    document.getElementById('nav-view-books').classList.add('hidden');
    document.getElementById('nav-view-chapters').classList.add('hidden');
    document.getElementById('nav-view-verses').classList.add('hidden');
    document.getElementById('nav-view-recent')?.classList.add('hidden');

    const testamentTabs = document.getElementById('nav-testament-tabs');
    const breadcrumb = document.getElementById('nav-breadcrumb');

    if (view === 'translation' || view === 'books') {
      testamentTabs.classList.remove('hidden');
      breadcrumb.innerHTML = '';
      breadcrumb.classList.add('hidden');
      if (view === 'translation') {
        this.renderTranslationView();
        document.querySelectorAll('.nav-testament-tab').forEach(t => t.classList.remove('active'));
        const otTab = document.querySelector('.nav-testament-tab[data-testament="ot"]');
        if (otTab) otTab.classList.add('active');
      }
      const activeTestament = document.querySelector('.nav-testament-tab.active')?.dataset.testament || 'ot';
      this.renderBookList(activeTestament);
      document.getElementById('nav-view-books').classList.remove('hidden');
    } else if (view === 'recent') {
      testamentTabs.classList.remove('hidden');
      breadcrumb.innerHTML = '';
      breadcrumb.classList.add('hidden');
      document.getElementById('nav-view-recent')?.classList.remove('hidden');
      this.renderRecentView();
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
      testamentTabs.classList.add('hidden');
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
      if (this._cleanupFocus) { this._cleanupFocus(); this._cleanupFocus = null; }
      this._cleanupFocus = base.trapFocus(document.getElementById('nav-sheet'), document.querySelector('.tab-item[data-tab="bible"]'));
    }
  }

  closeSheet() {
    const sheet = document.getElementById('nav-sheet');
    const backdrop = document.getElementById('nav-backdrop');
    backdrop.classList.remove('open');
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    sheet.inert = true;
    backdrop.setAttribute('aria-hidden', 'true');
    const menu = document.getElementById('nav-translation-menu');
    if (menu) {
      if (window.PopoverService) window.PopoverService.create(menu).hide();
      else menu.classList.remove('open');
    }
    if (this._cleanupFocus) { this._cleanupFocus(); this._cleanupFocus = null; }
  }

};
