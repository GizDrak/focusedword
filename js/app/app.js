window.App = class App {
  async init() {
    const debug = new window.Debug();
    debug.clearLogs();
    const bridge = new window.Bridge(debug);
    window.__debug = debug;
    this._bridgeRef = bridge;

    bridge.state = new window.StateStore();
    if (window.UISkins) {
      this._migrateSkinPrefs(bridge.state);
    }
    window.verseManager = new window.VerseManager(bridge.state);
    bridge.db = new window.BibleDB();
    bridge.bionic = window.BionicParser;

    if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
      document.documentElement.classList.add('ios-device');
    }
    if (/Android/.test(navigator.userAgent)) {
      document.documentElement.classList.add('android-device');
    }

    const installPrompt = new window.InstallPrompt(bridge);
    bridge.register('install-prompt', installPrompt);

    const applySkinPrefs = () => {
      if (!window.UISkins) return;
      const resolved = UISkins.getActive();
      if (!resolved || !resolved.preferences) return;
      const prefs = resolved.preferences;
      const state = bridge.state;
      const ct = bridge.get('color-theme');

      const resolve = (key) => {
        const raw = state.get(key);
        if (raw !== 'skin') return raw;
        return key in prefs ? prefs[key] : UISkins._builtinDefaults[key];
      };

      const skinDefault = (key) => (key in prefs ? prefs[key] : UISkins._builtinDefaults[key]);

      const theme = resolve('theme');
      if (theme) {
        document.documentElement.dataset.theme = theme;
        const lightThemes = ['light', 'sepia', 'icy-wind', 'clay'];
        const src = lightThemes.includes(theme) ? '/assets/icons/app/icon-light.svg' : '/assets/icons/app/icon-dark.svg';
        document.querySelectorAll('.app-icon').forEach(el => el.src = src);
      }
      const storedAccent = state.get('accent');
      const useSkinAccent = !storedAccent || storedAccent === 'skin';
      const resolveAccent = () => {
        if (!useSkinAccent) return storedAccent;
        const rawTheme = state.get('theme');
        if (rawTheme && rawTheme !== 'skin') {
          const resolvedTheme = resolve('theme');
          return window.ColorTheme?.themeAccentMap[resolvedTheme] || skinDefault('accent');
        }
        return skinDefault('accent');
      };
      if (ct) {
        const accent = resolveAccent();
        if (accent) {
          ct.apply(accent);
          if (useSkinAccent) state.set('accent', 'skin');
        }
      } else {
        const accent = resolveAccent();
        if (accent) {
          document.documentElement.dataset.accent = accent;
          if (useSkinAccent) state.set('accent', 'skin');
        }
      }
      const tex = resolve('backgroundTexture');
      document.body.classList.toggle('background-texture', tex === true);
      const para = resolve('paragraphMode');
      document.body.classList.toggle('paragraph-mode', para === true);
      state.set('paragraphBreaks', para === true);
      const cr = resolve('crossRefs');
      if (!cr) {
        const xref = bridge.get('cross-refs-ui');
        if (xref) xref.close();
      }
      const redLetter = resolve('redLetter');
      if (redLetter !== undefined) {
        state.set('redLetter', redLetter);
      }
      const redLetterColor = resolve('redLetterColor');
      if (redLetterColor) {
        state.set('redLetterColor', redLetterColor);
        document.documentElement.style.setProperty('--wj-color', redLetterColor);
      }
      const settingsMod = bridge.get('settings');
      if (settingsMod) {
        settingsMod._applyTextSettings();
        const checkbox = document.getElementById('settings-red-letter');
        if (checkbox) checkbox.checked = redLetter === true;
        if (settingsMod._renderRedLetterSwatches) settingsMod._renderRedLetterSwatches();
        if (settingsMod._applyRedLetterColor) settingsMod._applyRedLetterColor();
      }
    };

    document.addEventListener('ui:skin-changed', applySkinPrefs);

    if (window.UISkins) {
      window.UISkins.apply(bridge.state.get('uiSkin') || 'modern');
    }

    const syncThemeColor = () => {
      const bgSurface = getComputedStyle(document.documentElement).getPropertyValue('--bg-surface').trim();
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta && bgSurface) meta.setAttribute('content', bgSurface);
    };
    syncThemeColor();
    bridge.state.onChange('theme uiSkin', () => requestAnimationFrame(syncThemeColor));
    document.addEventListener('ui:skin-changed', () => requestAnimationFrame(syncThemeColor));

    const windowControlsOverlay = navigator.windowControlsOverlay;
    if (windowControlsOverlay) {
      const syncWindowControlsOverlay = () => {
        const rect = windowControlsOverlay.getTitlebarAreaRect?.();
        if (rect) document.documentElement.style.setProperty('--titlebar-area-height', `${rect.height}px`);
      };
      syncWindowControlsOverlay();
      windowControlsOverlay.addEventListener?.('geometrychange', syncWindowControlsOverlay);
    }

    const splashEl = document.getElementById('splash-screen');
    const statusEl = document.getElementById('splash-status');

    const _splash = (msg) => { if (statusEl) statusEl.textContent = msg; };
    const _timeout = (promise, ms, fallback) => {
      return Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => resolve(fallback), ms))
      ]);
    };

    _splash('Loading storage…');
    await _timeout(window.repoService.ready, 8000, null);
    _splash('Loading Bible database…');
    await _timeout(window.repoService.bootstrapBSB(), 15000, null);
    // Promote any IDB-installed repo databases to OPFS (background)
    window.repoService.migrateInstalledToOpfs().catch(e =>
      console.warn('[app] OPFS migration error:', e)
    );

    let translationId = bridge.state.get('currentTranslation');
    _splash('Opening Bible…');
    let ok = await _timeout(bridge.db.init(translationId), 10000, false);
    if (!ok) {
      translationId = 'BSB';
      ok = await _timeout(bridge.db.init(translationId), 10000, false);
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

    // Load chapter summaries in background before the first chapter renders
    const chapterSummaryReady = ChapterSummary.init().catch(() => {});
    bridge.register('chapter-summary', ChapterSummary);

    const baseRenderer = new window.BaseRenderer(bridge);
    bridge.register('base-renderer', baseRenderer);
    bridge.register('renderer-swipe', new window.SwipeRenderer(bridge, baseRenderer));
    bridge.register('renderer-spotlight', new window.SpotlightRenderer(bridge, baseRenderer));
    bridge.register('renderer-speed', new window.SpeedRenderer(bridge, baseRenderer));
    bridge.register('renderer-scroll', new window.ScrollRenderer(bridge, baseRenderer));

    const navigation = new window.NavigationModule(bridge);
    bridge.register('navigation', navigation);
    const navigationHistory = new window.NavigationHistory(bridge);
    bridge.register('navigation-history', navigationHistory);
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
    bridge.register('word-study-ui', new window.WordStudyUI(bridge));

    bridge.register('highlight-manager', new window.HighlightManager(bridge));

    // Register before settings.init so _refreshWcWhenReady can find the service
    bridge.register('word-class-service', new window.WordClassService());
    bridge.register('word-study-service', new window.WordStudyService());

    bridge.selection = new window.SelectionManager(bridge);
    _splash('Preparing…');
    await bridge.selection.init();
    await navigation.init();
    await navigationHistory.init();
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

    if (window.ReadingLog) {
      const rl = new window.ReadingLog(bridge);
      bridge.register('reading-log', rl);
      await rl.init();
    }

    if (window.PlansUI) {
      const plansUI = new window.PlansUI(bridge);
      bridge.register('plans-ui', plansUI);
      plansUI.init();
    }

    if (window.HomePlanWidget) {
      const hpw = new window.HomePlanWidget(bridge);
      bridge.register('home-plan-widget', hpw);
      hpw.init();
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

    if (bridge.state.get('crossRefs') === true) {
      const cr = bridge.get('cross-references');
      if (cr) {
        cr.init().then(() => {
          if (cr.enabled) bridge.emit('render:refresh');
        });
      }
    }

    if (bridge.state.get('wordStudyEnabled') === true && bridge.state.get('currentTranslation') === 'BSB') {
      const wc = bridge.get('word-class-service');
      if (wc && !wc.isReady) {
        wc.init(bridge).catch(e => console.warn('[WordStudy] startup wc init:', e));
      }
      const ws = bridge.get('word-study-service');
      if (ws && !ws.dataReady) {
        ws.initDataDb().then(() => ws.initLexDb()).catch(e => console.warn('[WordStudy] startup data init:', e));
      }
    }

    this._buildTranslationManifest(bridge);
    this._setupModeButton(bridge);
    this._setupWordStudyToggle(bridge);
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
    _splash('Loading chapter…');
    await chapterSummaryReady;
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
    this._handleStartupIntent(bridge);
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

    const modeMenu = window.PopoverService
      ? window.PopoverService.create(modePopup, {
          onChange: (open) => modeTab.setAttribute('aria-expanded', String(open))
        })
      : null;

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
      if (modeMenu) modeMenu.hide();
      else {
        modePopup.classList.remove('open');
        modePopup.classList.add('hidden');
        modeTab.setAttribute('aria-expanded', 'false');
      }
    };

    modeTab.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const isOpen = modeMenu ? modeMenu.isOpen() : modePopup.classList.contains('open');
      const mp = document.getElementById('more-popup');
      if (mp && window.PopoverService) {
        window.PopoverService.create(mp).hide();
      } else if (mp && mp.classList.contains('open')) {
        mp.classList.remove('open');
        mp.classList.add('hidden');
      }
      closeModePopup();
      if (!isOpen) {
        setModeActive();
        if (modeMenu) modeMenu.show();
        else {
          modePopup.classList.remove('hidden');
          requestAnimationFrame(() => modePopup.classList.add('open'));
        }
      }
    });

    if (!modeMenu?.native) document.addEventListener('click', (e) => {
      if (!modePopup.classList.contains('open')) return;
      if (!modePopup.contains(e.target) && !modeTab.contains(e.target)) {
        closeModePopup();
      }
    });

    modePopup.addEventListener('click', (e) => {
      const item = e.target.closest('.mode-item');
      if (!item) return;
      const action = item.dataset.action;

      if (bridge.state.get('splitMode') && action !== 'split') {
        const sm = bridge.get('split-mode');
        if (sm) sm.prepareExternalModeSwitch();
      }

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
      if (modeMenu?.isOpen() || modePopup.classList.contains('open')) setModeActive();
    });
  }

  _setupWordStudyToggle(bridge) {
    bridge.state.onChange('speedMode', (_, val) => {
      if (val && bridge.state.get('wordStudyMode')) {
        bridge.state.set('wordStudyMode', false);
      }
    });
  }

  _setupMoreButton(bridge) {
    const moreTab = document.querySelector('.tab-item[data-tab="more"]');
    const morePopup = document.getElementById('more-popup');
    if (!moreTab || !morePopup) return;

    let _moreSavedHTML = null;

    const showMainMenu = () => {
      if (_moreSavedHTML) {
        morePopup.innerHTML = _moreSavedHTML;
        _moreSavedHTML = null;
        morePopup.classList.remove('more-wc-open');
      }
    };

    const moreMenu = window.PopoverService
      ? window.PopoverService.create(morePopup, {
          onChange: (open) => {
            moreTab.setAttribute('aria-expanded', String(open));
            if (!open) showMainMenu();
          }
        })
      : null;

    const refreshInstallItem = () => {
      const installMoreItem = document.getElementById('more-install-app');
      if (!installMoreItem) return;
      const ip = bridge.get('install-prompt');
      installMoreItem.classList.toggle('hidden', !ip?.isInstallable());
    };

    const closeMorePopup = () => {
      if (moreMenu) moreMenu.hide();
      else {
        showMainMenu();
        morePopup.classList.remove('open');
        morePopup.classList.add('hidden');
        moreTab.setAttribute('aria-expanded', 'false');
      }
      morePopup.style.bottom = '';
      morePopup.style.right = '';
    };

    moreTab.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      refreshInstallItem();
      const isOpen = moreMenu ? moreMenu.isOpen() : morePopup.classList.contains('open');
      const mp = document.getElementById('mode-popup');
      if (mp && window.PopoverService) {
        window.PopoverService.create(mp).hide();
      } else if (mp && mp.classList.contains('open')) {
        mp.classList.remove('open');
        mp.classList.add('hidden');
      }
      closeMorePopup();
      if (!isOpen) {
        const rect = moreTab.getBoundingClientRect();
        const gap = 8;
        morePopup.style.bottom = (window.innerHeight - rect.top + gap) + 'px';
        morePopup.style.right = (window.innerWidth - rect.right) + 'px';
        if (moreMenu?.native) {
          moreMenu.show();
        } else {
          morePopup.classList.remove('hidden');
          requestAnimationFrame(() => morePopup.classList.add('open'));
        }
      }
    });

    bridge.on('install:state-changed', refreshInstallItem);
    refreshInstallItem();

    const refreshWcKeyItem = () => {
      const item = document.getElementById('more-word-class-key');
      if (!item) return;
      const wc = bridge.state?.get('wordClasses');
      item.classList.toggle('hidden', !wc);
    };
    bridge.state?.onChange('wordClasses', refreshWcKeyItem);
    bridge.on('render:chapter', refreshWcKeyItem);
    refreshWcKeyItem();

    const refreshWsItem = () => {
      const item = document.getElementById('more-word-study');
      if (!item) return;
      const ws = bridge.state?.get('wordStudyEnabled');
      item.classList.toggle('hidden', !ws);
    };
    bridge.state?.onChange('wordStudyEnabled', refreshWsItem);
    bridge.on('render:chapter', refreshWsItem);
    refreshWsItem();

    const refreshClearReadingItem = () => {
      const item = document.getElementById('more-clear-reading');
      if (!item) return;
      const cr = bridge.state?.get('clearReadingEnabled');
      item.classList.toggle('hidden', !cr);
    };
    bridge.state?.onChange('clearReadingEnabled', refreshClearReadingItem);
    bridge.on('render:chapter', refreshClearReadingItem);
    refreshClearReadingItem();

    const renderWcSubmenu = () => {
      if (!_moreSavedHTML) _moreSavedHTML = morePopup.innerHTML;
      morePopup.classList.add('more-wc-open');
      const wc = bridge.get('word-class-service');
      const groups = wc && wc.getAxisSettings ? wc.getAxisSettings() : null;
      let html = '<button class="more-item" id="wc-sub-back"><span class="more-item-icon">←</span><span class="more-item-label">Back</span></button>';
      html += '<div class="more-divider"></div>';
      if (groups && groups.length) {
        html += '<div class="more-wc-group">Word Classes</div>';
        for (const group of groups) {
          html += '<div class="more-item more-wc-row more-wc-axis' + (group.enabled ? '' : ' muted') + '" data-axis="' + window.HTMLEscape(group.axis) + '">';
          html += '<div class="more-wc-info">';
          html += '<span class="more-item-label">' + window.HTMLEscape(group.label) + '</span>';
          html += '</div>';
          html += '<input type="checkbox" class="toggle-checkbox" data-axis="' + window.HTMLEscape(group.axis) + '"' + (group.enabled ? ' checked' : '') + ' style="display:none">';
          html += '</div>';
          for (const v of group.values) {
            html += '<div class="more-item more-wc-row' + (v.enabled ? '' : ' muted') + '" data-axis="' + window.HTMLEscape(group.axis) + '" data-value="' + window.HTMLEscape(v.value) + '">';
            html += '<span class="wc-dot" style="background:' + window.HTMLEscape(v.color) + '"></span>';
            html += '<div class="more-wc-info">';
            html += '<span class="more-item-label">' + window.HTMLEscape(v.label) + '</span>';
            html += '<span class="more-wc-desc">' + window.HTMLEscape(v.definition || '') + '</span>';
            html += '</div>';
            html += '<input type="checkbox" class="toggle-checkbox" data-axis="' + window.HTMLEscape(group.axis) + '" data-value="' + window.HTMLEscape(v.value) + '"' + (v.enabled ? ' checked' : '') + ' style="display:none">';
            html += '</div>';
          }
        }
      } else {
        html += '<div class="more-item more-wc-row muted" data-note="loading"><span class="more-wc-info"><span class="more-item-label">Word annotations are still loading…</span></span></div>';
      }
      morePopup.innerHTML = html;
      morePopup.querySelector('#wc-sub-back').addEventListener('click', (e) => {
        e.stopPropagation();
        showMainMenu();
      });
      morePopup.querySelectorAll('.more-wc-row').forEach(row => {
        row.addEventListener('click', (e) => {
          const cb = row.querySelector('.toggle-checkbox');
          if (cb) {
            cb.checked = !cb.checked;
            row.classList.toggle('muted', !cb.checked);
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      });
      morePopup.querySelectorAll('.toggle-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
          if (cb.dataset.axis && !cb.dataset.value) {
            const axis = cb.dataset.axis;
            const current = Object.assign({}, bridge.state.get('wordClassAxisSettings') || {});
            const axes = Object.assign({}, current.axes || {});
            axes[axis] = cb.checked;
            current.axes = axes;
            // The axis master is a bulk switch: clear per-value overrides so
            // the whole group follows the master.
            const groups = (wc && wc.getAxisSettings) ? wc.getAxisSettings() : [];
            const g = groups.find(x => x.axis === axis);
            const values = Object.assign({}, current.values || {});
            if (g) {
              for (const v of g.values) delete values[v.key];
            }
            if (Object.keys(values).length) current.values = values; else delete current.values;
            bridge.state.set('wordClassAxisSettings', (current.values || current.colors || current.axes) ? current : null);
            const freshGroups = (wc && wc.getAxisSettings) ? wc.getAxisSettings() : [];
            morePopup.querySelectorAll('.more-wc-row[data-axis="' + axis + '"][data-value]').forEach(row => {
              const fg = freshGroups.find(x => x.axis === axis);
              const v = fg && fg.values.find(x => x.value === row.dataset.value);
              const enabled = !!(v && v.enabled);
              row.classList.toggle('muted', !enabled);
              const valueCb = row.querySelector('.toggle-checkbox');
              if (valueCb) valueCb.checked = enabled;
            });
          } else if (cb.dataset.axis && cb.dataset.value) {
            const key = cb.dataset.axis + ':' + cb.dataset.value;
            const current = Object.assign({}, bridge.state.get('wordClassAxisSettings') || {});
            const values = Object.assign({}, current.values || {});
            values[key] = cb.checked;
            current.values = values;
            bridge.state.set('wordClassAxisSettings', (current.values || current.colors || current.axes) ? current : null);
          }
          bridge.emit('render:refresh');
        });
      });
    };

    const renderClearReadingSubmenu = () => {
      if (!_moreSavedHTML) _moreSavedHTML = morePopup.innerHTML;
      morePopup.classList.add('more-wc-open');
      const mode = bridge.state.get('clearReadingMode') || 'off';
      const toggles = Object.assign({}, bridge.state.get('clearReadingToggles') || {});
      const values = window.WordClassService ? window.WordClassService.CLEAR_READING_VALUES : [];
      let html = '<button class="more-item" id="cr-sub-back"><span class="more-item-icon">←</span><span class="more-item-label">Back</span></button>';
      html += '<div class="more-divider"></div>';
      html += '<div class="more-wc-group">Mode</div>';
      html += '<div class="cr-mode-row">';
      for (const m of ['off', 'soft', 'strong']) {
        html += '<button class="cr-mode-option' + (mode === m ? ' active' : '') + '" data-mode="' + m + '">' + m.charAt(0).toUpperCase() + m.slice(1) + '</button>';
      }
      html += '</div>';
      html += '<div class="more-divider"></div>';
      html += '<div class="more-wc-group">Categories</div>';
      if (values && values.length) {
        for (const v of values) {
          const enabled = toggles[v.value] !== false;
          const w = window.WordClassService.getClearReadingWeight(v.value, mode === 'off' ? 'soft' : mode, toggles);
          const previewOpacity = enabled ? w.opacity : 1.0;
          const previewBold = enabled && w.fontWeight ? 'font-weight:' + w.fontWeight + ';' : '';
          html += '<div class="more-item more-wc-row cr-cat-row' + (enabled ? '' : ' muted') + '" data-value="' + window.HTMLEscape(v.value) + '">';
          html += '<span class="cr-preview" style="opacity:' + previewOpacity + ';' + previewBold + '">Aa</span>';
          html += '<div class="more-wc-info">';
          html += '<span class="more-item-label">' + window.HTMLEscape(window.WordClassService.getClearReadingLabel(v.value)) + '</span>';
          html += '<span class="more-wc-desc">' + window.HTMLEscape(v.definition || '') + '</span>';
          html += '</div>';
          html += '<input type="checkbox" class="toggle-checkbox" data-value="' + window.HTMLEscape(v.value) + '"' + (enabled ? ' checked' : '') + ' style="display:none">';
          html += '</div>';
        }
      }
      morePopup.innerHTML = html;
      morePopup.querySelector('#cr-sub-back').addEventListener('click', (e) => {
        e.stopPropagation();
        showMainMenu();
      });
      morePopup.querySelectorAll('.cr-mode-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const next = btn.dataset.mode;
          if (next === mode) return;
          bridge.state.set('clearReadingMode', next);
          bridge.emit('render:refresh');
          renderClearReadingSubmenu();
        });
      });
      morePopup.querySelectorAll('.more-wc-row[data-value]').forEach(row => {
        row.addEventListener('click', (e) => {
          const cb = row.querySelector('.toggle-checkbox');
          if (cb) {
            cb.checked = !cb.checked;
            row.classList.toggle('muted', !cb.checked);
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      });
      morePopup.querySelectorAll('.cr-cat-row .toggle-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
          const current = Object.assign({}, bridge.state.get('clearReadingToggles') || {});
          current[cb.dataset.value] = cb.checked;
          bridge.state.set('clearReadingToggles', current);
          bridge.emit('render:refresh');
          renderClearReadingSubmenu();
        });
      });
    };

    if (!moreMenu?.native) document.addEventListener('click', (e) => {
      if (!morePopup.classList.contains('open')) return;
      if (!morePopup.contains(e.target) && !moreTab.contains(e.target)) {
        if (_moreSavedHTML) showMainMenu();
        closeMorePopup();
      }
    });

    morePopup.addEventListener('click', (e) => {
      const item = e.target.closest('.more-item');
      if (!item) return;
      if (!item.dataset.action) return;
      if (item.dataset.action === 'word-class-key') {
        e.stopPropagation();
        renderWcSubmenu();
        return;
      }
      if (item.dataset.action === 'word-study-mode') {
        if (bridge.state.get('wordStudyEnabled') !== true) return;
        const next = !bridge.state.get('wordStudyMode');
        bridge.state.set('wordStudyMode', next);
        bridge.emit('render:refresh');
        return;
      }
      if (item.dataset.action === 'clear-reading') {
        if (bridge.state.get('clearReadingEnabled') !== true) return;
        e.stopPropagation();
        renderClearReadingSubmenu();
        return;
      }
      if (_moreSavedHTML) showMainMenu();
      closeMorePopup();
      setTimeout(() => {
        if (item.dataset.action === 'settings') {
          const s = bridge.get('settings');
          if (s) s.openSettings();
        } else if (item.dataset.action === 'notes') {
          const notesUI = bridge.get('notes-ui');
          if (notesUI) notesUI.open();
        } else if (item.dataset.action === 'plans') {
          const plansUI = bridge.get('plans-ui');
          if (plansUI) plansUI.open();
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
      if (e._wordStudyHandled) return;
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
      const tag = e.target.tagName;
      const isTextInput = tag === 'INPUT' && /^(text|number|search|email|tel|url|password)$/i.test(e.target.type || 'text');
      const isTextarea = tag === 'TEXTAREA';
      const isContentEditable = e.target.isContentEditable === true;
      if (isTextInput || isTextarea || isContentEditable) return;

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

  _handleStartupIntent(bridge) {
    const params = new URLSearchParams(location.search);
    const hash = location.hash.replace('#', '').toLowerCase();

    const sharedText = params.get('text');
    if (sharedText) {
      setTimeout(() => {
        const search = bridge.get('search');
        if (search) search.open(sharedText);
      }, 600);
      return;
    }

    const action = params.get('action') || hash;
    if (action === 'search') {
      setTimeout(() => {
        const tab = document.querySelector('.tab-item[data-tab="discover"]');
        if (tab) tab.click();
      }, 600);
    } else if (action === 'notes') {
      setTimeout(() => {
        const ui = bridge.get('notes-ui');
        if (ui) ui.open();
      }, 600);
    } else if (action === 'settings') {
      setTimeout(() => {
        const s = bridge.get('settings');
        if (s) s.openSettings();
      }, 600);
    }
  }

  _migrateSkinPrefs(state) {
    if (!window.UISkins || localStorage.getItem('focused-word:skin-pref-migrated')) return;
    const builtin = UISkins._builtinDefaults;
    if (!builtin) return;
    const prefKeys = ['theme', 'accent', 'fontFamily', 'fontSize', 'margins',
      'lineSpacing', 'letterSpacing', 'redLetter', 'redLetterColor',
      'footnotes', 'chapterTitle', 'sectionHeadings', 'poetryFormatting',
      'paragraphMode', 'crossRefs', 'backgroundTexture', 'bionic', 'bionicStrength',
      'chapterHeaderAlignment', 'sectionHeadingAlignment', 'verseTextAlignment',
      'verseNumberPlacement'];
    const map = {
      'focused-word:theme': 'theme', 'focused-word:accent': 'accent',
      'focused-word:font-family': 'fontFamily', 'focused-word:font-size': 'fontSize',
      'focused-word:margins': 'margins', 'focused-word:line-spacing': 'lineSpacing',
      'focused-word:letter-spacing': 'letterSpacing', 'focused-word:red-letter': 'redLetter',
      'focused-word:red-letter-color': 'redLetterColor', 'focused-word:footnotes': 'footnotes',
      'focused-word:chapter-title': 'chapterTitle', 'focused-word:section-headings': 'sectionHeadings',
      'focused-word:poetry-formatting': 'poetryFormatting', 'focused-word:paragraph-mode': 'paragraphMode',
      'focused-word:cross-refs': 'crossRefs', 'focused-word:background-texture': 'backgroundTexture',
      'focused-word:bionic': 'bionic', 'focused-word:bionic-strength': 'bionicStrength'
    };
    let changed = false;
    for (const k of prefKeys) {
      if (state._data[k] !== undefined && state._data[k] === builtin[k] && k in builtin) {
        state._data[k] = 'skin';
        const entry = Object.entries(map).find(([, v]) => v === k);
        if (entry) localStorage.setItem(entry[0], JSON.stringify('skin'));
        changed = true;
      }
    }
    if (changed) localStorage.setItem('focused-word:skin-pref-migrated', '1');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  new App().init();
  if ('serviceWorker' in navigator) {
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (installing) {
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              if (reg.waiting) {
                reg.waiting.postMessage({ type: 'SKIP_WAITING' });
              }
            }
          });
        }
      });
    });
  }
});
