window.App = class App {
  async init() {
    const debug = new window.Debug();
    debug.clearLogs();
    const bridge = new window.Bridge(debug);
    window.__debug = debug;
    this._bridgeRef = bridge;

    bridge.state = new window.StateStore();
    window.verseManager = new window.VerseManager(bridge.state);
    bridge.db = new window.BibleDB();
    bridge.bionic = window.BionicParser;

    if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
      document.documentElement.classList.add('ios-device');
    }

    const installPrompt = new window.InstallPrompt(bridge);
    bridge.register('install-prompt', installPrompt);

    const initialTheme = bridge.state.get('theme');
    document.documentElement.dataset.theme = initialTheme;
    document.documentElement.dataset.accent = bridge.state.get('accent') || 'gold';
    {
      const lightThemes = ['light', 'sepia', 'icy-wind', 'clay'];
      const src = lightThemes.includes(initialTheme)
        ? '/assets/icons/icon-light.svg'
        : '/assets/icons/icon-dark.svg';
      document.querySelectorAll('.app-icon').forEach(el => el.src = src);
    }

    const syncThemeColor = () => {
      const bgSurface = getComputedStyle(document.documentElement).getPropertyValue('--bg-surface').trim();
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta && bgSurface) meta.setAttribute('content', bgSurface);
    };
    syncThemeColor();
    bridge.state.onChange('theme', () => requestAnimationFrame(syncThemeColor));

    const splashEl = document.getElementById('splash-screen');

    await window.repoService.ready;
    await window.repoService.bootstrapBSB();
    // Promote any IDB-installed repo databases to OPFS (background)
    window.repoService.migrateInstalledToOpfs().catch(e =>
      console.warn('[app] OPFS migration error:', e)
    );

    let translationId = bridge.state.get('currentTranslation');
    let ok = await bridge.db.init(translationId);
    if (!ok) {
      translationId = 'BSB';
      ok = await bridge.db.init(translationId);
      if (ok) {
        bridge.state.set('currentTranslation', 'BSB');
      }
    }
    if (!ok) {
      const err = document.getElementById('error-message');
      err.textContent = 'Failed to load Bible database. Please check your connection and try again.';
      err.classList.remove('hidden');
      splashEl.classList.add('splash-hidden');
      return;
    }

    await ChapterSummary.init();
    bridge.register('chapter-summary', ChapterSummary);

    const baseRenderer = new window.BaseRenderer(bridge);
    bridge.register('base-renderer', baseRenderer);
    bridge.register('renderer-swipe', new window.SwipeRenderer(bridge, baseRenderer));
    bridge.register('renderer-spotlight', new window.SpotlightRenderer(bridge, baseRenderer));
    bridge.register('renderer-speed', new window.SpeedRenderer(bridge, baseRenderer));
    bridge.register('renderer-scroll', new window.ScrollRenderer(bridge, baseRenderer));

    const navigation = new window.NavigationModule(bridge);
    bridge.register('navigation', navigation);
    const settings = new window.SettingsModule(bridge);
    bridge.register('settings', settings);
    const colorTheme = new window.ColorTheme(bridge);
    bridge.register('color-theme', colorTheme);
    colorTheme.init();
    const typography = new window.TypographyModule(bridge);
    bridge.register('typography', typography);
    typography.initialize();
    const bookmarks = new window.BookmarksUI(bridge);
    bridge.register('bookmarks-ui', bookmarks);

    bridge.register('interaction-manager', new window.InteractionManager(bridge));

    bridge.register('cross-references', new window.CrossReferences(bridge));
    bridge.register('cross-refs-ui', new window.CRefsUI(bridge));

    bridge.register('highlight-manager', new window.HighlightManager(bridge));

    bridge.selection = new window.SelectionManager(bridge);
    await bridge.selection.init();
    await navigation.init();
    settings.init();
    settings._applyTextSettings();

    if (window.NoteStore) {
      const noteStore = new window.NoteStore(bridge);
      bridge.register('note-store', noteStore);
    }
    if (window.NotesUI) {
      const notesUI = new window.NotesUI(bridge);
      bridge.register('notes-ui', notesUI);
      notesUI.init();
    }

    if (window.SyncSettingsUI) {
      const syncUI = new window.SyncSettingsUI(bridge);
      bridge.register('sync-ui', syncUI);
      syncUI.init();
    }
    if (window.ScriptureReposUI) {
      const dlUI = new window.ScriptureReposUI(bridge);
      bridge.register('scripture-repos-ui', dlUI);
      dlUI.init();
    }
    bookmarks.init();

    const searchModule = new window.SearchModule(bridge);
    bridge.register('search', searchModule);
    searchModule.init();

    const fnui = new window.FootnotesUI(bridge);
    bridge.register('footnotes-ui', fnui);
    fnui.init();

    if (bridge.state.get('crossRefs')) {
      const cr = bridge.get('cross-references');
      if (cr) {
        cr.init().then(() => {
          if (cr.enabled) bridge.emit('render:refresh');
        });
      }
    }

    this._buildTranslationManifest(bridge);
    this._setupModeButton(bridge);
    this._setupMoreButton(bridge);
    this._setupLibraryButton(bridge);
    this._setupSpeedControls(bridge);
    const viewMgr = new window.ViewManager(bridge);
    bridge.register('view-manager', viewMgr);
    bridge.register('render-manager', new window.RenderManager(bridge, viewMgr, baseRenderer));
    this._setupScrollRelease(bridge);
    this._setupGlobalEvents(bridge);
    this._setupSettingsListeners(bridge);

    const restoredBook = bridge.state.get('currentBook');
    const restoredChapter = bridge.state.get('currentChapter');
    console.log('[app] restoring to book:', restoredBook, 'chapter:', restoredChapter);
    await navigation.loadChapter(restoredBook, restoredChapter);

    const scrollNav = bridge.get('navigation');
    const firstVerseText = scrollNav?.currentVerses?.[0]?.text ?? '';

    const scrollVerseContainer = document.querySelector('.verse-container');
    const scrollContainerWidth = scrollVerseContainer?.clientWidth ?? 320;
    const scrollFontSizePx = scrollVerseContainer
      ? parseFloat(getComputedStyle(scrollVerseContainer).fontSize) || 16
      : 16;

    const scrollFirstBlockSingleLine = window.LineEstimator.isLikelySingleLine(
      firstVerseText,
      scrollContainerWidth,
      scrollFontSizePx
    );

    const scrollModeTarget = document.getElementById('content');

    const scrollModeSwitcher = new window.ScrollModeSwitcher({
      mode: 'new',
      selector: '.verse-container',
      bridge,
      firstBlockSingleLine: scrollFirstBlockSingleLine,
      scrollTarget: scrollModeTarget
    });

    const scrollRenderer = bridge.get('renderer-scroll');
    if (scrollRenderer) {
      scrollRenderer.disableScrollTracking();
    }

    const renderMgr = bridge.get('render-manager');
    if (renderMgr) renderMgr._scrollSwitcher = scrollModeSwitcher;

    if (!bridge.state.get('swipeMode') && !bridge.state.get('spotlightMode') && !bridge.state.get('speedMode')) {
      scrollModeSwitcher.start();
    }

    if (window.SplitMode) {
      const sm = new window.SplitMode(bridge);
      bridge.register('split-mode', sm);
      sm.init();
    }

    document.getElementById('content').style.display = '';
    splashEl.classList.add('splash-hidden');
    setTimeout(() => splashEl.remove(), 500);
  }

  async _buildTranslationManifest(bridge) {
    try {
      const manifest = await window.repoService.buildManifest();
      manifest.sort((a, b) => a.name.localeCompare(b.name));
      bridge.translationManifest = manifest;
    } catch (e) {
      console.warn('[app] Failed to build manifest:', e);
      bridge.translationManifest = [];
    }
    const nav = bridge.get('navigation');
    if (nav) nav.renderTranslationView();
    const sm = bridge.get('split-mode');
    if (sm) sm.repopulateSelectors();
  }

  _setupModeButton(bridge) {
    const modeTab = document.querySelector('.tab-item[data-tab="mode"]');
    const modePopup = document.getElementById('mode-popup');
    if (!modeTab || !modePopup) return;

    const setModeActive = () => {
      const inOtherMode = bridge.state.get('swipeMode') || bridge.state.get('spotlightMode') || bridge.state.get('speedMode');
      const inSplit = bridge.state.get('splitMode');
      modePopup.querySelectorAll('.mode-item').forEach(el => {
        const action = el.dataset.action;
        let isActive = false;
        if (action === 'scroll') isActive = !inOtherMode && !inSplit;
        else if (action === 'split') isActive = inSplit;
        else if (action === 'spotlight') isActive = bridge.state.get('spotlightMode');
        else if (action === 'swipe') isActive = bridge.state.get('swipeMode');
        else if (action === 'speed') isActive = bridge.state.get('speedMode');
        el.classList.toggle('active', isActive);
        el.setAttribute('aria-pressed', isActive.toString());
      });
    };

    const closeModePopup = () => {
      modePopup.classList.remove('open');
      modePopup.classList.add('hidden');
    };

    modeTab.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = modePopup.classList.contains('open');
      const mp = document.getElementById('more-popup');
      if (mp && mp.classList.contains('open')) { mp.classList.remove('open'); mp.classList.add('hidden'); }
      closeModePopup();
      if (!isOpen) {
        setModeActive();
        modePopup.classList.remove('hidden');
        requestAnimationFrame(() => modePopup.classList.add('open'));
      }
    });

    document.addEventListener('click', (e) => {
      if (!modePopup.classList.contains('open')) return;
      if (!modePopup.contains(e.target) && !modeTab.contains(e.target)) {
        closeModePopup();
      }
    });

    modePopup.addEventListener('click', (e) => {
      const item = e.target.closest('.mode-item');
      if (!item) return;
      const action = item.dataset.action;

      if (action === 'scroll') {
        bridge.state.batch({ swipeMode: false, spotlightMode: false, speedMode: false, splitMode: false });
        requestAnimationFrame(() => bridge.emit('render:refresh'));
      } else if (action === 'split') {
        bridge.state.set('splitMode', !bridge.state.get('splitMode'));
      } else if (['spotlight', 'swipe', 'speed'].includes(action)) {
        document.body.classList.remove('scroll-mode');
        bridge.call('settings', 'toggleMode', action + 'Mode');
      }
      setModeActive();
      closeModePopup();
    });

    bridge.state.onChange('spotlightMode swipeMode speedMode splitMode'.split(' '), () => {
      if (modePopup.classList.contains('open')) setModeActive();
    });
  }

  _setupMoreButton(bridge) {
    const moreTab = document.querySelector('.tab-item[data-tab="more"]');
    const morePopup = document.getElementById('more-popup');
    const installMoreItem = document.getElementById('more-install-app');
    if (!moreTab || !morePopup) return;

    const refreshInstallItem = () => {
      if (!installMoreItem) return;
      const ip = bridge.get('install-prompt');
      installMoreItem.classList.toggle('hidden', !ip?.isInstallable());
    };

    const closeMorePopup = () => {
      morePopup.classList.remove('open');
      morePopup.classList.add('hidden');
    };

    moreTab.addEventListener('click', (e) => {
      e.stopPropagation();
      refreshInstallItem();
      const isOpen = morePopup.classList.contains('open');
      const mp = document.getElementById('mode-popup');
      if (mp && mp.classList.contains('open')) { mp.classList.remove('open'); mp.classList.add('hidden'); }
      closeMorePopup();
      if (!isOpen) {
        morePopup.classList.remove('hidden');
        requestAnimationFrame(() => morePopup.classList.add('open'));
      }
    });

    bridge.on('install:state-changed', refreshInstallItem);
    refreshInstallItem();

    document.addEventListener('click', (e) => {
      if (!morePopup.classList.contains('open')) return;
      if (!morePopup.contains(e.target) && !moreTab.contains(e.target)) {
        closeMorePopup();
      }
    });

    morePopup.addEventListener('click', (e) => {
      const item = e.target.closest('.more-item');
      if (!item) return;
      closeMorePopup();
      setTimeout(() => {
        if (item.dataset.action === 'settings') {
          const s = bridge.get('settings');
          if (s) s.openSettings();
        } else if (item.dataset.action === 'notes') {
          const notesUI = bridge.get('notes-ui');
          if (notesUI) notesUI.open();
        } else if (item.dataset.action === 'install-app') {
          const ip = bridge.get('install-prompt');
          if (ip) ip.install();
        }
      }, 100);
    });

    document.getElementById('install-btn')?.addEventListener('click', () => {
      const ip = bridge.get('install-prompt');
      if (ip) ip._onInstallBtn();
    });
    document.getElementById('install-dismiss-btn')?.addEventListener('click', () => {
      const ip = bridge.get('install-prompt');
      if (ip) ip.dismiss();
    });
    document.getElementById('install-ios-close')?.addEventListener('click', () => {
      const ip = bridge.get('install-prompt');
      if (ip) ip._hideIOSSheet();
    });
    document.getElementById('install-ios-backdrop')?.addEventListener('click', () => {
      const ip = bridge.get('install-prompt');
      if (ip) ip._hideIOSSheet();
    });
  }

  _setupLibraryButton(bridge) {
    const libTab = document.querySelector('.tab-item[data-tab="library"]');
    if (!libTab) return;
    libTab.addEventListener('click', () => {
      const bm = bridge.get('bookmarks-ui');
      if (bm) bm.openSlideUp();
    });
  }

  _setupSpeedControls(bridge) {
    const wpmSlider = document.getElementById('speed-wpm');
    if (wpmSlider) wpmSlider.value = bridge.state.get('wpm');
    const wpmDisplay = document.getElementById('speed-wpm-display');
    if (wpmDisplay) wpmDisplay.textContent = bridge.state.get('wpm') + ' WPM';
  }

  _setupScrollRelease(bridge) {
    let scrollTimer = null;
    document.addEventListener('scroll', () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        if (window.verseManager) window.verseManager.releaseLock();
      }, 150);
    }, { passive: true });
  }

  _setupGlobalEvents(bridge) {
    this._setupPointerEvents(bridge);
    this._setupClickEvents(bridge);
    this._setupWheelEvents(bridge);
    this._setupKeyboardEvents(bridge);
    this._setupDesktopNav(bridge);
  }

  _setupPointerEvents(bridge) {
    const content = document.getElementById('content');
    let _ptrStart = null;

    content.addEventListener('pointerdown', (e) => {
      _ptrStart = { x: e.clientX, y: e.clientY };
      const swipe = bridge.get('renderer-swipe');
      if (swipe && bridge.state.get('swipeMode')) {
        e.preventDefault();
      }

      if (bridge.state.get('spotlightMode')) {
        if (e.target.closest('.footnote-caller') ||
            e.target.closest('.crossref-indicator') ||
            e.target.closest('.token-cross-ref') ||
            e.target.closest('.token-section-heading-ref')) {
          return;
        }

        const szRect = e.currentTarget.getBoundingClientRect();
        const szRelX = e.clientX - szRect.left;
        const szSide = Math.min(80, Math.max(56, window.innerWidth * 0.15));
        if (szRelX >= szSide && szRelX <= szRect.width - szSide) return; // center zone, no hold

        this._ptrHoldDir = szRelX < szSide ? 'prev' : 'next';
        this._ptrHeld = false;
        clearTimeout(this._ptrHoldTimer);

        const moveGuard = (me) => {
          if (Math.abs(me.clientX - _ptrStart.x) > 12 || Math.abs(me.clientY - _ptrStart.y) > 12) {
            clearTimeout(this._ptrHoldTimer);
            this._ptrHoldTimer = null;
            content.removeEventListener('pointermove', moveGuard);
          }
        };
        content.addEventListener('pointermove', moveGuard);
        this._ptrMoveCancel = () => content.removeEventListener('pointermove', moveGuard);

        this._ptrHoldTimer = setTimeout(() => {
          this._ptrHoldTimer = null;
          this._ptrHeld = true;
          content.style.webkitUserSelect = 'none';
          content.style.userSelect = 'none';
          const nav = bridge.get('navigation');
          if (!nav || !nav.currentVerses.length) return;
          const spot = bridge.get('renderer-spotlight');
          if (!spot) return;
          const vm = bridge.get('view-manager');
          if (vm) vm._instantScroll = true;
          spot.advance(nav.currentVerses, this._ptrHoldDir);
          const scheduleNext = () => {
            if (!this._ptrHeld) return;
            this._ptrHoldTimeout = setTimeout(() => {
              const n2 = bridge.get('navigation');
              if (!n2 || !n2.currentVerses.length) return;
              const s2 = bridge.get('renderer-spotlight');
              if (!s2) return;
              const vm2 = bridge.get('view-manager');
              if (vm2) vm2._instantScroll = true;
              s2.advance(n2.currentVerses, this._ptrHoldDir);
              scheduleNext();
            }, 300);
          };
          scheduleNext();
        }, 400);
      }
    });

    content.addEventListener('pointerup', (e) => {
      if (this._ptrHeld) {
        this._ptrHoldJustEnded = true;
      }
      if (this._ptrHoldTimer) { clearTimeout(this._ptrHoldTimer); this._ptrHoldTimer = null; }
      if (this._ptrHoldTimeout) { clearTimeout(this._ptrHoldTimeout); this._ptrHoldTimeout = null; }
      if (this._ptrMoveCancel) { this._ptrMoveCancel(); this._ptrMoveCancel = null; }
      content.style.webkitUserSelect = '';
      content.style.userSelect = '';
      this._ptrHeld = false;
      const upvm = bridge.get('view-manager');
      if (upvm) upvm._instantScroll = false;

      if (!_ptrStart) return;
      const dx = e.clientX - _ptrStart.x;
      const dy = e.clientY - _ptrStart.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      _ptrStart = null;

      if (window.getSelection() && !window.getSelection().isCollapsed) return;

      if (window.matchMedia('(any-hover: hover) and (any-pointer: fine)').matches) return;

      const nav = bridge.get('navigation');
      if (!nav) return;
      const interaction = bridge.get('interaction-manager');
      const swipeMode = bridge.state.get('swipeMode');
      const animDir = bridge.state.get('swipeAnimDir') || 'vertical';

      if (swipeMode && animDir === 'horizontal' && absDx > 50 && absDx > absDy * 1.5) {
        if (interaction && interaction.selectionMode) return;
        e.preventDefault();
        const swipe = bridge.get('renderer-swipe');
        if (swipe) swipe.advance(nav.currentVerses, dx > 0 ? 'next' : 'prev');
        return;
      }

      if (absDx > 35 && absDy < absDx * 1.3) {
        if (interaction && interaction.selectionMode) return;
        if (bridge._chapterNavLock) return;
        bridge._chapterNavLock = true;
        setTimeout(() => { bridge._chapterNavLock = false; }, 800);
        e.preventDefault();
        const el = document.getElementById('content');
        const dir = dx < 0 ? 'left' : 'right';
        el.classList.add('chapter-slide', 'slide-out-' + dir);

        let done = false;
        const onEnd = () => {
          if (done) return;
          done = true;
          el.classList.remove('chapter-slide', 'slide-out-' + dir);
          bridge._chapterNavLock = true;
          setTimeout(() => { bridge._chapterNavLock = false; }, 600);
          if (dx < 0) nav.loadNextChapter();
          else nav.loadPrevChapter();
        };

        el.addEventListener('transitionend', onEnd, { once: true });
        setTimeout(onEnd, 350);
        return;
      }

      if (swipeMode && absDy > 50 && absDy > absDx * 1.5 && animDir !== 'horizontal') {
        const swipe = bridge.get('renderer-swipe');
        if (swipe) swipe.advance(nav.currentVerses, dy < 0 ? 'next' : 'prev');
      }

      if (bridge.state.get('spotlightMode') && absDy > 50 && absDy > absDx * 1.5) {
        const spotlight = bridge.get('renderer-spotlight');
        if (spotlight) spotlight.advance(nav.currentVerses, dy < 0 ? 'next' : 'prev');
      }
    });

    content.addEventListener('pointercancel', () => {
      if (this._ptrHoldTimer) { clearTimeout(this._ptrHoldTimer); this._ptrHoldTimer = null; }
      if (this._ptrHoldTimeout) { clearTimeout(this._ptrHoldTimeout); this._ptrHoldTimeout = null; }
      if (this._ptrMoveCancel) { this._ptrMoveCancel(); this._ptrMoveCancel = null; }
      content.style.webkitUserSelect = '';
      content.style.userSelect = '';
      this._ptrHeld = false;
      this._ptrHoldJustEnded = false;
      const cvm = bridge.get('view-manager');
      if (cvm) cvm._instantScroll = false;
    });

    content.addEventListener('pointerleave', () => {
      if (this._ptrHeld || this._ptrHoldTimer || this._ptrHoldTimeout) {
        if (this._ptrHoldTimer) { clearTimeout(this._ptrHoldTimer); this._ptrHoldTimer = null; }
        if (this._ptrHoldTimeout) { clearTimeout(this._ptrHoldTimeout); this._ptrHoldTimeout = null; }
        if (this._ptrMoveCancel) { this._ptrMoveCancel(); this._ptrMoveCancel = null; }
        content.style.webkitUserSelect = '';
        content.style.userSelect = '';
        this._ptrHeld = false;
        this._ptrHoldJustEnded = false;
        const lvm = bridge.get('view-manager');
        if (lvm) lvm._instantScroll = false;
      }
    });

    // Edge-tap chapter navigation removed — only horizontal swipe changes chapters
  }

  _setupClickEvents(bridge) {
    const content = document.getElementById('content');
    let clickTimer = null;

    content.addEventListener('click', (e) => {
      const interaction = bridge.get('interaction-manager');
      if (interaction && interaction.selectionMode) return;
      if (interaction && interaction._clearedAt && Date.now() - interaction._clearedAt < 300) return;

      const ref = e.target.closest('.token-cross-ref[data-ref-book-id]');
      if (ref) {
        const bookId = parseInt(ref.dataset.refBookId);
        const chapter = parseInt(ref.dataset.refChapter);
        const verse = parseInt(ref.dataset.refVerse);
        if (bookId && chapter && verse) {
          bridge.get('navigation').navigateTo(bookId, chapter, verse);
        }
        return;
      }

      const nav = bridge.get('navigation');
      if (!nav) return;
      const verses = nav.currentVerses;

      if (bridge.state.get('speedMode')) {
        const speed = bridge.get('renderer-speed');
        if (speed) speed.togglePlayPause();
        return;
      }

      if (bridge.state.get('spotlightMode')) {
        if (this._ptrHoldJustEnded) {
          this._ptrHoldJustEnded = false;
          return;
        }

        if (e.target.closest('.footnote-caller') ||
            e.target.closest('.crossref-indicator') ||
            e.target.closest('.token-cross-ref') ||
            e.target.closest('.token-section-heading-ref')) {
          return;
        }

        const hlToolbar = document.getElementById('highlight-toolbar');
        if (hlToolbar && !hlToolbar.classList.contains('hidden')) return;

        const cRect = e.currentTarget.getBoundingClientRect();
        const cRelX = e.clientX - cRect.left;
        const cSide = Math.min(80, Math.max(56, window.innerWidth * 0.15));
        if (cRelX >= cSide && cRelX <= cRect.width - cSide) return;
        const direction = cRelX < cSide ? 'prev' : 'next';

        if (clickTimer) {
          clearTimeout(clickTimer);
          clickTimer = null;
          return;
        }

        const spotlight = bridge.get('renderer-spotlight');
        if (!spotlight) return;
        clickTimer = setTimeout(() => {
          clickTimer = null;
          spotlight.advance(verses, direction);
        }, 200);
      }
    });
  }

  _setupDesktopNav(bridge) {
    var prev = document.getElementById('desktop-prev-chapter');
    var next = document.getElementById('desktop-next-chapter');
    if (!prev || !next) return;
    var nav = bridge.get('navigation');
    if (!nav) return;
    prev.addEventListener('click', function () { nav.loadPrevChapter(); });
    next.addEventListener('click', function () { nav.loadNextChapter(); });
  }

  _setupWheelEvents(bridge) {
    const content = document.getElementById('content');
    let wheelCooldown = null;

    content.addEventListener('wheel', (e) => {
      if (bridge.state.get('speedMode')) return;
      if (!bridge.state.get('spotlightMode') && !bridge.state.get('swipeMode')) return;
      e.preventDefault();
      if (wheelCooldown) return;

      const nav = bridge.get('navigation');
      if (!nav) return;
      const verses = nav.currentVerses;
      if (!verses.length) return;

      const name = bridge.state.get('spotlightMode') ? 'renderer-spotlight' : 'renderer-swipe';
      const renderer = bridge.get(name);
      if (renderer) renderer.advance(verses, e.deltaY > 0 ? 'next' : 'prev');

      wheelCooldown = setTimeout(() => { wheelCooldown = null; }, 300);
    }, { passive: false });
  }

  _setupKeyboardEvents(bridge) {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;

      const settings = bridge.get('settings');
      if (settings && e.key === 'Escape' && settings.settingsOpen) {
        settings.closeSettings();
        return;
      }

      const nav = bridge.get('navigation');
      if (!nav) return;
      const verses = nav.currentVerses;

      if (bridge.state.get('speedMode')) {
        const speed = bridge.get('renderer-speed');
        if (!speed) return;
        if (e.key === ' ') {
          e.preventDefault();
          speed.togglePlayPause();
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          speed.advanceWord();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          speed.rewindWord();
        }
        return;
      }

      if (!bridge.state.get('swipeMode') && !bridge.state.get('spotlightMode')) return;

      const goNext = () => { e.preventDefault();
        if (bridge.state.get('swipeMode')) {
          const swipe = bridge.get('renderer-swipe');
          if (swipe) swipe.advance(verses, 'next');
        } else {
          const spot = bridge.get('renderer-spotlight');
          if (spot) spot.advance(verses, 'next');
        }
      };
      const goPrev = () => { e.preventDefault();
        if (bridge.state.get('swipeMode')) {
          const swipe = bridge.get('renderer-swipe');
          if (swipe) swipe.advance(verses, 'prev');
        } else {
          const spot = bridge.get('renderer-spotlight');
          if (spot) spot.advance(verses, 'prev');
        }
      };

      if (bridge.state.get('swipeMode') && bridge.state.get('tapSwipeMode')) {
        if (e.key === 'ArrowDown') { goNext(); }
        else if (e.key === 'ArrowUp') { goPrev(); }
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        goPrev();
      }
    });
  }

  _setupSettingsListeners(bridge) {
    if (bridge.state.get('focusMode')) {
      document.body.classList.add('focus-mode');
    }
    bridge.state.onChange('focusMode', (_, val) => {
      document.body.classList.toggle('focus-mode', val);
    });

  }
};

document.addEventListener('DOMContentLoaded', () => {
  new App().init();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
});
