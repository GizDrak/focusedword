window.SyncSettingsUI = class SyncSettingsUI {
  constructor(bridge) {
    this.bridge = bridge;
    this._autoSync = false;
    this._autoTimer = null;
    this._chapterSyncTimer = null;
    this._lastScrollTime = Date.now();
    this._resumeToastTimer = null;
    this._resumeToastEl = null;
    document.addEventListener('scroll', () => {
      this._lastScrollTime = Date.now();
    }, { passive: true });
  }

  init() {
    this._cacheElements();
    this._bindEvents();
    this._syncUI();
    syncService.setStateProvider(() => this._collectState());
    syncService.setStateApplier((modules) => this._applyServerState(modules));
    this.bridge.on('nav:chapter-loaded', () => {
      const targetVerse = this.bridge.state.get('currentVerse');
      setTimeout(() => {
        if (this.bridge.state.get('currentVerse') !== targetVerse) {
          this.bridge.state.set('currentVerse', targetVerse);
          this.bridge.emit('render:refresh');
        }
      }, 600);
      if (!this._autoSync) return;
      if (this._chapterSyncTimer) clearTimeout(this._chapterSyncTimer);
      this._chapterSyncTimer = setTimeout(() => {
        syncService.sync().catch(() => {});
      }, 3000);
    });
    if (this._autoSync) {
      syncService.pullLatestState().catch(() => {});
    }
    window.addEventListener('sync-key-revoked', () => {
      alert('Your sync key was revoked. Your sync settings will be reset.');
      try {
        const req = indexedDB.deleteDatabase('FocusedSyncDB');
        req.onsuccess = () => console.log('[SyncSettingsUI] Sync DB cleared');
      } catch (e) {}
      syncService.setKey(null);
      syncService.setServerUrl('https://sync.focusedword.com');
      localStorage.removeItem('sync-last-updated');
      localStorage.removeItem('sync-enabled');
      syncService.lastError = null;
      this._els.enable.checked = false;
      this._syncUI();
    });
  }

  _cacheElements() {
    this._els = {
      urlDisplay: document.getElementById('sync-server-url-display'),
      changeUrl: document.getElementById('sync-change-url'),
      enable: document.getElementById('sync-enabled'),
      keyDisplay: document.getElementById('sync-key-display'),
      restoreKey: document.getElementById('sync-restore-key'),
      lastLabel: document.getElementById('sync-last-label'),
      syncNow: document.getElementById('sync-now'),
      auto: document.getElementById('sync-auto'),
      syncSettings: document.getElementById('sync-settings'),
      reset: document.getElementById('sync-reset'),
      revoke: document.getElementById('sync-revoke')
    };
  }

  _bindEvents() {
    this._els.changeUrl.addEventListener('click', () => {
      const url = prompt('Enter server URL:', syncService.serverUrl);
      if (url) {
        try {
          if (!window.UrlValidator.isAllowedEndpoint(url)) {
            alert('Server URL must use HTTPS (or HTTP for localhost development only)');
            return;
          }
          const u = new URL(url);
          if (u.protocol === 'https:' && !window.UrlValidator.isLocalhost(u.hostname) && u.origin !== 'https://sync.focusedword.com') {
            if (!confirm('Use sync server at ' + u.origin + '? Make sure you trust this server.')) return;
          }
          syncService.setServerUrl(url);
          this._els.urlDisplay.textContent = syncService.serverUrl;
        } catch (e) {
          alert('Invalid server URL: ' + e.message);
        }
      }
    });

    this._els.enable.addEventListener('change', async () => {
      const wasEnabled = this._els.enable.checked;
      if (wasEnabled && !syncService.syncKey) {
        this._els.enable.checked = false;
        this._showSyncOnboardingModal();
        return;
      }
      this._autoSync = wasEnabled;
      this._els.auto.checked = wasEnabled;
      localStorage.setItem('sync-auto', String(wasEnabled));
      localStorage.setItem('sync-enabled', String(wasEnabled));
      syncService.setEnabled(wasEnabled);
      if (wasEnabled) this._startAutoSync(); else this._stopAutoSync();
      this._syncUI();
    });

    this._els.keyDisplay.addEventListener('click', (e) => {
      if (!syncService.syncKey) return;
      e.preventDefault();
      const ta = document.createElement('textarea');
      ta.value = syncService.syncKey;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (ex) {}
      document.body.removeChild(ta);
      const el = this._els.keyDisplay;
      el.textContent = 'Copied!';
      el.style.opacity = '0.5';
      setTimeout(() => {
        el.textContent = syncService.syncKey;
        el.style.opacity = '1';
      }, 700);
    });

    this._els.restoreKey.addEventListener('click', async () => {
      const input = prompt('Paste your sync key:');
      if (input) {
        syncService.setKey(input);
        syncService.lastError = null;
        localStorage.setItem('sync-enabled', 'true');
        syncService.setEnabled(true);
        this._syncUI();
        try {
          await syncService.restoreKeyAndPull(input);
        } catch (e) {
          console.warn('[SyncSettingsUI] Key restore pull failed:', e);
        }
        this._refreshLastLabel();
      }
    });

    this._els.syncNow.addEventListener('click', async () => {
      this._els.syncNow.disabled = true;
      this._els.syncNow.textContent = 'Syncing...';
      try {
        await syncService.sync();
      } catch (e) {
        console.warn('[SyncSettingsUI] Sync failed:', e);
      }
      this._refreshLastLabel();
      this._els.syncNow.disabled = false;
      this._els.syncNow.textContent = 'Sync Now';
    });

    let longPressTimer = null;
    const startLongPress = () => {
      longPressTimer = setTimeout(async () => {
        longPressTimer = null;
        this._els.syncNow.disabled = true;
        this._els.syncNow.textContent = 'Pulling...';
        try {
          await syncService.pullLatestState();
        } catch (e) {
          console.warn('[SyncSettingsUI] Pull-only failed:', e);
        }
        this._refreshLastLabel();
        this._els.syncNow.disabled = false;
        this._els.syncNow.textContent = 'Sync Now';
      }, 500);
    };
    const cancelLongPress = () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    };
    this._els.syncNow.addEventListener('pointerdown', startLongPress);
    this._els.syncNow.addEventListener('pointerup', cancelLongPress);
    this._els.syncNow.addEventListener('pointercancel', cancelLongPress);
    this._els.syncNow.addEventListener('pointermove', cancelLongPress);

    this._els.auto.addEventListener('change', () => {
      this._autoSync = this._els.auto.checked;
      localStorage.setItem('sync-auto', String(this._autoSync));
      if (this._autoSync) {
        this._startAutoSync();
      } else {
        this._stopAutoSync();
      }
    });

    this._els.syncSettings.addEventListener('change', () => {
      localStorage.setItem('sync-settings', String(this._els.syncSettings.checked));
    });

    document.addEventListener('visibilitychange', () => {
      if (!this._autoSync) return;
      if (document.visibilityState === 'hidden') {
        if (this._chapterSyncTimer) {
          clearTimeout(this._chapterSyncTimer);
          this._chapterSyncTimer = null;
        }
        syncService.processSync().catch(() => {});
      } else {
        syncService.sync().catch(() => {});
      }
    });

    this._els.reset.addEventListener('click', () => {
      if (!confirm('Reset all sync data including local outbox? This does not affect bookmarks or reading progress.')) return;
      try {
        const req = indexedDB.deleteDatabase('FocusedSyncDB');
        req.onsuccess = () => console.log('[SyncSettingsUI] Sync DB cleared');
      } catch (e) {}
      syncService.setKey(null);
      syncService.setServerUrl('https://sync.focusedword.com');
      localStorage.removeItem('sync-last-updated');
      localStorage.removeItem('sync-enabled');
      syncService.lastError = null;
      this._els.enable.checked = false;
      this._syncUI();
    });

    this._els.revoke.addEventListener('click', async () => {
      if (!confirm('This will permanently delete all synced bookmarks, highlights, notes, and plans from the cloud server only. Your local data on this device will NOT be deleted. Your sync key will be revoked and cannot be reused, even if cloud data remains after a server error. Are you sure?')) return;
      this._els.revoke.disabled = true;
      this._els.revoke.textContent = 'Revoking...';
      try {
        await syncService.revokeSyncKey();
      } catch (e) {
        console.warn('[SyncSettingsUI] Revocation failed:', e);
        this._els.revoke.disabled = false;
        this._els.revoke.textContent = 'Revoke Failed — Try Again';
        return;
      }
      syncService.setKey(null);
      syncService.setEnabled(false);
      localStorage.removeItem('sync-enabled');
      localStorage.removeItem('sync-key');
      syncService.lastError = null;
      this._els.enable.checked = false;
      this._els.revoke.disabled = false;
      this._els.revoke.textContent = 'Erase Cloud Data & Disconnect';
      this._syncUI();
      location.reload();
    });
  }

  _showSyncOnboardingModal() {
    if (document.getElementById('sync-onboarding-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'sync-onboarding-overlay';
    overlay.id = 'sync-onboarding-overlay';
    overlay.innerHTML = `
      <div class="sync-onboarding-panel">
        <div class="sync-onboarding-header">
          <h2>Enable Focused Sync</h2>
        </div>
        <div class="sync-onboarding-body">
          <p>Keep your reading progress, bookmarks, notes, and settings synced across all your devices. Focused Sync is an opt-in service.</p>
          <div class="sync-onboarding-lists">
            <div class="sync-onboarding-list">
               <h4>What is shared with the server:</h4>
              <ul>
                <li>Reading position</li>
                <li>Layout settings</li>
                <li>Bookmarks</li>
                <li>Highlights</li>
                <li>Notes</li>
                <li>Reading plans</li>
                <li>Note categories</li>
                <li>Bookmark sets</li>
                <li>Repository URLs</li>
                <li>Recent navigation locations</li>
              </ul>
            </div>
            <div class="sync-onboarding-list">
              <h4>What is NEVER shared:</h4>
              <ul>
                <li>Personal identity or email</li>
                <li>Analytics or tracking data</li>
                <li>Private repository decryption keys</li>
                <li>Downloaded Bible database files</li>
              </ul>
            </div>
          </div>
          <p class="sync-onboarding-prompt">To get started, do you already have a Sync Key from another device?</p>
          <div class="sync-onboarding-actions">
            <button class="btn-secondary" id="sync-onboarding-restore">I Have a Key</button>
            <button class="btn-primary" id="sync-onboarding-generate">Generate New Key</button>
          </div>
          </div>
          <div class="sync-onboarding-footer" style="margin-top:14px;text-align:center">
            <button id="sync-onboarding-server-url" style="background:none;border:none;color:var(--text-muted,#888);cursor:pointer;font-size:0.78rem;text-decoration:underline;padding:4px 8px">Change Server</button>
          </div>
        </div>
      `;
 
     document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add('open'));

    document.getElementById('sync-onboarding-generate').addEventListener('click', async () => {
      try {
        await syncService.generateKey();
      } catch (e) {
        console.warn('[SyncSettingsUI] Key generation failed:', e);
        return;
      }
      const key = syncService.syncKey;
      const body = document.querySelector('.sync-onboarding-body');
      if (!body) return;
      body.innerHTML = `
        <div class="sync-key-reveal">
          <p class="sync-key-reveal-intro">Your sync key has been generated. <strong>Write it down or save it somewhere safe</strong> — you'll need it to sync your other devices.</p>
          <div class="sync-key-box">
            <code class="sync-key-text">${window.HTMLEscape(key)}</code>
            <button class="sync-key-copy-btn" id="sync-key-copy-btn" aria-label="Copy key">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              <span id="sync-key-copy-label">Copy</span>
            </button>
          </div>
          <p class="sync-key-reveal-warn">If you lose this key, you won't be able to recover your synced data.</p>
          <div class="sync-onboarding-actions">
            <button class="btn-primary" id="sync-key-confirm">Done, I've Saved It</button>
          </div>
        </div>
      `;
      document.getElementById('sync-key-copy-btn').addEventListener('click', () => {
        const ta = document.createElement('textarea');
        ta.value = key;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (ex) {}
        document.body.removeChild(ta);
        const label = document.getElementById('sync-key-copy-label');
        if (label) label.textContent = 'Copied!';
      });
      document.getElementById('sync-key-confirm').addEventListener('click', async () => {
        this._els.enable.checked = true;
        this._els.enable.dispatchEvent(new Event('change'));
        const ts = this.bridge.state.moduleTimestamps;
        for (const k of Object.keys(ts)) ts[k] = Date.now();
        this.bridge.state._saveTimestamps();
        try {
          await syncService.processSync();
        } catch (e) {}
        this._refreshLastLabel();
        this._closeSyncOnboarding();
      });
    });

    document.getElementById('sync-onboarding-restore').addEventListener('click', () => {
      this._closeSyncOnboarding();
      if (this._els.restoreKey) this._els.restoreKey.click();
    });

    document.getElementById('sync-onboarding-server-url')?.addEventListener('click', () => {
      const url = prompt('Enter server URL:', syncService.serverUrl);
      if (url) {
        try {
          if (!window.UrlValidator.isAllowedEndpoint(url)) {
            alert('Server URL must use HTTPS (or HTTP for localhost development only)');
            return;
          }
          syncService.setServerUrl(url);
        } catch (e) {
          alert('Invalid server URL: ' + e.message);
        }
      }
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this._closeSyncOnboarding();
        this._els.enable.checked = false;
      }
    });
  }

  _closeSyncOnboarding() {
    const overlay = document.getElementById('sync-onboarding-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  }

  _syncUI() {
    this._els.urlDisplay.textContent = syncService.serverUrl;
    this._els.keyDisplay.textContent = syncService.syncKey || '—';
    this._els.enable.checked = localStorage.getItem('sync-enabled') === 'true';
    syncService.setEnabled(this._els.enable.checked);
    const body = document.getElementById('sync-settings-body');
    if (body) body.style.display = this._els.enable.checked ? '' : 'none';
    const revokeBtn = document.getElementById('sync-revoke');
    if (revokeBtn) revokeBtn.style.display = this._els.enable.checked ? '' : 'none';
    const resetBtn = document.getElementById('sync-reset');
    if (resetBtn) resetBtn.style.display = localStorage.getItem('sync-key') ? '' : 'none';
    this._refreshLastLabel();
    const autoOn = localStorage.getItem('sync-auto') === 'true';
    this._els.auto.checked = autoOn;
    if (autoOn !== this._autoSync) {
      this._autoSync = autoOn;
      if (autoOn) this._startAutoSync(); else this._stopAutoSync();
    }
    this._els.syncSettings.checked = localStorage.getItem('sync-settings') !== 'false';
  }

  async _collectState() {
    const state = this.bridge.state;
    await state.ready();
    const hm = this.bridge.get('highlight-manager');
    const highlights = hm ? await hm.store.getAllIncludingTombstones() : [];
    const bookmarks = await this.bridge.selection.getAllBookmarksIncludingTombstones();
    const notes = await state.getAllForSync('notes');
    const plans = await state.getAllForSync('plans');
    const noteCategories = await state.getAllForSync('noteCategories');
    const bookmarkSets = await state.getAllForSync('bookmarkSets');
    const repos = await window.idb.getAllRepositories();
    const readingLog = await state.getAllForSync('readingLog');
    const navigationHistory = await state.getAllForSync('navigationHistory');

    const _maxTs = (items) => items.length > 0
      ? Math.max(...items.map(i => i.updated_at || i.createdAt || 0))
      : 0;

    const bookmarksTs = Math.max(_maxTs(bookmarks), state.moduleTimestamps.bookmarks);
    const highlightsTs = Math.max(_maxTs(highlights), state.moduleTimestamps.highlights);
    const notesTs = Math.max(_maxTs(notes), state.moduleTimestamps.notes);
    const plansTs = Math.max(_maxTs(plans), state.moduleTimestamps.plans);
    const noteCategoriesTs = Math.max(_maxTs(noteCategories), state.moduleTimestamps.noteCategories);
    const bookmarkSetsTs = Math.max(_maxTs(bookmarkSets), state.moduleTimestamps.bookmarkSets);
    const readingLogTs = Math.max(_maxTs(readingLog), state.moduleTimestamps.readingLog);
    const navigationHistoryTs = Math.max(_maxTs(navigationHistory), state.moduleTimestamps.navigationHistory);

    return {
      settings: {
        data: {
        theme: state.get('theme'),
        accent: state.get('accent'),
        fontFamily: state.get('fontFamily'),
        fontSize: state.get('fontSize'),
        margins: state.get('margins'),
        lineSpacing: state.get('lineSpacing'),
        letterSpacing: state.get('letterSpacing'),
        bionic: state.get('bionic'),
        bionicStrength: state.get('bionicStrength'),
        paragraphMode: state.get('paragraphMode'),
        redLetter: state.get('redLetter'),
        redLetterColor: state.get('redLetterColor'),
        footnotes: state.get('footnotes'),
        chapterTitle: state.get('chapterTitle'),
        sectionHeadings: state.get('sectionHeadings'),
        uiSkin: state.get('uiSkin'),
        poetryFormatting: state.get('poetryFormatting'),
        crossRefs: state.get('crossRefs'),
        backgroundTexture: state.get('backgroundTexture'),
        chapterHeaderAlignment: state.get('chapterHeaderAlignment'),
        sectionHeadingAlignment: state.get('sectionHeadingAlignment'),
        verseTextAlignment: state.get('verseTextAlignment'),
        verseNumberPlacement: state.get('verseNumberPlacement'),
        currentTranslation: state.get('currentTranslation')
        },
        updated_at: state.moduleTimestamps.settings
      },
      reading: {
        data: {
        book: state.get('currentBook'),
        chapter: state.get('currentChapter'),
        verse: state.get('currentVerse'),
        bookName: state.get('currentBookName')
        },
        updated_at: state.moduleTimestamps.reading
      },
      bookmarks: {
        data: bookmarks,
        updated_at: bookmarksTs
      },
      highlights: {
        data: highlights,
        updated_at: highlightsTs
      },
      notes: {
        data: notes,
        updated_at: notesTs
      },
      plans: {
        data: plans,
        updated_at: plansTs
      },
      noteCategories: {
        data: noteCategories,
        updated_at: noteCategoriesTs
      },
      bookmarkSets: {
        data: bookmarkSets,
        updated_at: bookmarkSetsTs
      },
      repositories: {
        data: repos.map(r => ({
          id: r.id,
          url: r.url,
          name: r.name,
          repo_name: r.repo_name || null,
          checked_at: r.checked_at || null,
          created_at: r.created_at,
          updated_at: r.updated_at || null,
          deleted: r.deleted || false
        })),
        updated_at: Math.max(state.moduleTimestamps.repositories || 0, ...(repos.length > 0 ? repos.map(r => r.updated_at || r.checked_at || r.created_at || 0) : [0]))
      },
      readingLog: {
        data: readingLog,
        updated_at: readingLogTs
      },
      navigationHistory: {
        data: navigationHistory,
        updated_at: navigationHistoryTs
      }
    };
  }

  async _applyServerState(modules) {
    if (!modules) return;
    this.bridge.state._isApplyingServerState = true;
    try {
      if (modules.settings && modules.settings.data && localStorage.getItem('sync-settings') !== 'false') {
        const settings = modules.settings.data;
        const ct = this.bridge.get('color-theme');
        if (settings.theme) {
          const resolved = window.UISkins ? window.UISkins.resolveSetting('theme', settings.theme) : (settings.theme === 'skin' ? 'dark' : settings.theme);
          document.documentElement.dataset.theme = resolved;
          this.bridge.state.set('theme', settings.theme);
        }
        if (settings.accent && ct) ct.setAccent(settings.accent);
        if (settings.fontFamily) this.bridge.state.set('fontFamily', settings.fontFamily);
        if (settings.fontSize) this.bridge.state.set('fontSize', settings.fontSize);
        if (settings.margins) this.bridge.state.set('margins', settings.margins);
        if (settings.lineSpacing) this.bridge.state.set('lineSpacing', settings.lineSpacing);
        if (settings.letterSpacing) this.bridge.state.set('letterSpacing', settings.letterSpacing);
        if (settings.bionic !== undefined) { this.bridge.state.set('bionic', settings.bionic); document.getElementById('settings-bionic').checked = settings.bionic; }
        if (settings.bionicStrength) this.bridge.state.set('bionicStrength', settings.bionicStrength);
        if (settings.paragraphMode !== undefined) this.bridge.state.set('paragraphMode', settings.paragraphMode);
        if (settings.redLetter !== undefined) this.bridge.state.set('redLetter', settings.redLetter);
        if (settings.redLetterColor !== undefined) {
          this.bridge.state.set('redLetterColor', settings.redLetterColor);
          document.documentElement.style.setProperty('--wj-color', settings.redLetterColor);
        }
        if (settings.footnotes !== undefined) this.bridge.state.set('footnotes', settings.footnotes);
        if (settings.chapterTitle !== undefined) this.bridge.state.set('chapterTitle', settings.chapterTitle);
        if (settings.sectionHeadings !== undefined) this.bridge.state.set('sectionHeadings', settings.sectionHeadings);
        if (settings.uiSkin) {
          this.bridge.state.set('uiSkin', settings.uiSkin);
          if (window.UISkins) window.UISkins.apply(settings.uiSkin);
        } else if (settings.sectionHeadingStyle) {
          this.bridge.state.set('uiSkin', settings.sectionHeadingStyle);
          if (window.UISkins) window.UISkins.apply(settings.sectionHeadingStyle);
        }
        if (settings.poetryFormatting !== undefined) this.bridge.state.set('poetryFormatting', settings.poetryFormatting);
        if (settings.crossRefs !== undefined) this.bridge.state.set('crossRefs', settings.crossRefs);
        if (settings.backgroundTexture !== undefined) this.bridge.state.set('backgroundTexture', settings.backgroundTexture);
        if (settings.chapterHeaderAlignment) this.bridge.state.set('chapterHeaderAlignment', settings.chapterHeaderAlignment);
        if (settings.sectionHeadingAlignment) this.bridge.state.set('sectionHeadingAlignment', settings.sectionHeadingAlignment);
        if (settings.verseTextAlignment) this.bridge.state.set('verseTextAlignment', settings.verseTextAlignment);
        if (settings.verseNumberPlacement) this.bridge.state.set('verseNumberPlacement', settings.verseNumberPlacement);
        if (settings.currentTranslation) this.bridge.state.set('currentTranslation', settings.currentTranslation);
        const settingsMod = this.bridge.get('settings');
        if (settingsMod) {
          settingsMod._applyTextSettings();
          settingsMod._syncUIFromState();
        }
        if (modules.settings.updated_at) {
          this.bridge.state.moduleTimestamps.settings = modules.settings.updated_at;
          this.bridge.state._saveTimestamps();
        }
        if (!modules.reading) this.bridge.emit('render:refresh');
      }
      if (modules.reading && modules.reading.data) {
        const r = modules.reading.data;
        const currentBook = Number(this.bridge.state.get('currentBook'));
        const currentChapter = Number(this.bridge.state.get('currentChapter'));
        const remoteBook = r.book ? Number(r.book) : null;
        const remoteChapter = r.chapter ? Number(r.chapter) : null;
        const remoteVerse = r.verse ? Number(r.verse) : null;
        const remoteBookName = r.bookName || null;
        const sameChapter = remoteBook && remoteChapter && remoteBook === currentBook && remoteChapter === currentChapter;
        if (sameChapter) {
          if (remoteVerse && Date.now() - this._lastScrollTime > 2000) {
            window.verseManager.setIntentional(remoteVerse);
          }
          if (modules.reading.updated_at) {
            this.bridge.state.moduleTimestamps.reading = modules.reading.updated_at;
            this.bridge.state._saveTimestamps();
          }
        } else if (remoteBook && remoteChapter) {
          const remoteData = { book: remoteBook, chapter: remoteChapter, verse: remoteVerse, bookName: remoteBookName };
          this.bridge.state.set('remoteReadingPosition', remoteData);
          this._showResumeToast(remoteData);
        }
      }
      if (modules.bookmarks && Array.isArray(modules.bookmarks.data)) {
        await this._mergeAndReplaceBookmarks(modules.bookmarks.data);
        if (modules.bookmarks.updated_at) {
          this.bridge.state.moduleTimestamps.bookmarks = Math.max(this.bridge.state.moduleTimestamps.bookmarks, modules.bookmarks.updated_at);
          this.bridge.state._saveTimestamps();
        }
        window.dispatchEvent(new CustomEvent('sync-module-updated', { detail: 'bookmarks' }));
      }
      if (modules.highlights && Array.isArray(modules.highlights.data)) {
        await this._mergeAndReplaceHighlights(modules.highlights.data);
        if (modules.highlights.updated_at) {
          this.bridge.state.moduleTimestamps.highlights = Math.max(this.bridge.state.moduleTimestamps.highlights, modules.highlights.updated_at);
          this.bridge.state._saveTimestamps();
        }
        window.dispatchEvent(new CustomEvent('sync-module-updated', { detail: 'highlights' }));
      }
      if (modules.notes && Array.isArray(modules.notes.data)) {
        const localNotes = await this.bridge.state.getAllForSync('notes');
        await this.bridge.state.mergeArrays(localNotes, modules.notes.data, 'notes');
        if (modules.notes.updated_at) {
          this.bridge.state.moduleTimestamps.notes = Math.max(this.bridge.state.moduleTimestamps.notes, modules.notes.updated_at);
          this.bridge.state._saveTimestamps();
        }
        window.dispatchEvent(new CustomEvent('sync-module-updated', { detail: 'notes' }));
      }
      if (modules.plans && Array.isArray(modules.plans.data)) {
        const localPlans = await this.bridge.state.getAllForSync('plans');
        await this.bridge.state.mergeArrays(localPlans, modules.plans.data, 'plans');
        if (modules.plans.updated_at) {
          this.bridge.state.moduleTimestamps.plans = Math.max(this.bridge.state.moduleTimestamps.plans, modules.plans.updated_at);
          this.bridge.state._saveTimestamps();
        }
        window.dispatchEvent(new CustomEvent('sync-module-updated', { detail: 'plans' }));
      }
      if (modules.noteCategories && Array.isArray(modules.noteCategories.data)) {
        const localCats = await this.bridge.state.getAllForSync('noteCategories');
        await this.bridge.state.mergeArrays(localCats, modules.noteCategories.data, 'noteCategories');
        if (modules.noteCategories.updated_at) {
          this.bridge.state.moduleTimestamps.noteCategories = Math.max(this.bridge.state.moduleTimestamps.noteCategories, modules.noteCategories.updated_at);
          this.bridge.state._saveTimestamps();
        }
        window.dispatchEvent(new CustomEvent('sync-module-updated', { detail: 'noteCategories' }));
      }
      if (modules.repositories && Array.isArray(modules.repositories.data)) {
        const rs = window.repoService;
        if (rs) {
          for (const remote of modules.repositories.data) {
            const local = rs.repositories.find(r => r.url === remote.url);
            if (remote.deleted) {
              if (local) {
                await rs.removeRepository(local.id);
              }
            } else if (!local) {
              const repo = await rs.registerRepository(remote.url, remote.name || remote.url);
              if (remote.repo_name) repo.repo_name = remote.repo_name;
              if (remote.checked_at) repo.checked_at = remote.checked_at;
              if (remote.updated_at) repo.updated_at = remote.updated_at;
              await window.idb.putRepository(repo);
            }
          }
          rs._repositories = await window.idb.getAllRepositories();
          const reposUi = this.bridge.get('scripture-repos-ui');
          if (reposUi) {
            reposUi._renderAll();
            reposUi._buildTranslationManifest();
          }
          if (modules.repositories.updated_at) {
            this.bridge.state.moduleTimestamps.repositories = Math.max(this.bridge.state.moduleTimestamps.repositories || 0, modules.repositories.updated_at);
            this.bridge.state._saveTimestamps();
          }
        }
      }
      if (modules.bookmarkSets && Array.isArray(modules.bookmarkSets.data)) {
        const localSets = await this.bridge.state.getAllForSync('bookmarkSets');
        await this.bridge.state.mergeArrays(localSets, modules.bookmarkSets.data, 'bookmarkSets');
        if (modules.bookmarkSets.updated_at) {
          this.bridge.state.moduleTimestamps.bookmarkSets = Math.max(this.bridge.state.moduleTimestamps.bookmarkSets, modules.bookmarkSets.updated_at);
          this.bridge.state._saveTimestamps();
        }
        window.dispatchEvent(new CustomEvent('sync-module-updated', { detail: 'bookmarkSets' }));
      }
      if (modules.readingLog && Array.isArray(modules.readingLog.data)) {
        const localLog = await this.bridge.state.getAllForSync('readingLog');
        await this.bridge.state.mergeArrays(localLog, modules.readingLog.data, 'readingLog');
        if (modules.readingLog.updated_at) {
          this.bridge.state.moduleTimestamps.readingLog = Math.max(this.bridge.state.moduleTimestamps.readingLog, modules.readingLog.updated_at);
          this.bridge.state._saveTimestamps();
        }
        const rl = this.bridge.get('reading-log');
        if (rl) {
          rl._entries = await window.idb.getAll('reading_log');
          rl._emit('reading-log-synced');
        }
      }
      if (modules.navigationHistory && Array.isArray(modules.navigationHistory.data)) {
        const localHistory = await this.bridge.state.getAllForSync('navigationHistory');
        await this.bridge.state.mergeArrays(localHistory, modules.navigationHistory.data, 'navigationHistory');
        if (modules.navigationHistory.updated_at) {
          this.bridge.state.moduleTimestamps.navigationHistory = Math.max(this.bridge.state.moduleTimestamps.navigationHistory, modules.navigationHistory.updated_at);
          this.bridge.state._saveTimestamps();
        }
        const nh = this.bridge.get('navigation-history');
        if (nh) {
          nh._entries = await window.idb.getAll('navigation_history');
          if (document.getElementById('nav-view-recent')?.classList.contains('hidden') === false) {
            const nav = this.bridge.get('navigation');
            if (nav) nav.renderRecentView();
          }
        }
      }
    } finally {
      this.bridge.state._isApplyingServerState = false;
    }
  }

  async _mergeAndReplaceBookmarks(remoteItems) {
    const selection = this.bridge.selection;
    const localItems = await selection.getAllBookmarksIncludingTombstones();
    const merged = await this.bridge.state.mergeArrays(localItems, remoteItems, 'bookmarks');
  }

  async _mergeAndReplaceHighlights(remoteItems) {
    const hm = this.bridge.get('highlight-manager');
    if (!hm) return;
    const localItems = await hm.store.getAllIncludingTombstones();
    const merged = await this.bridge.state.mergeArrays(localItems, remoteItems, 'highlights');
  }

  _refreshLastLabel() {
    if (syncService.lastError) {
      this._els.lastLabel.textContent = 'Error: ' + syncService.lastError;
      this._els.lastLabel.style.color = 'var(--error-text, #e74c3c)';
    } else {
      this._els.lastLabel.textContent = syncService.lastSyncLabel;
      this._els.lastLabel.style.color = '';
    }
  }

  _dismissResumeToast() {
    if (this._resumeToastEl) {
      this._resumeToastEl.remove();
      this._resumeToastEl = null;
    }
    if (this._resumeToastTimer) {
      clearTimeout(this._resumeToastTimer);
      this._resumeToastTimer = null;
    }
  }

  _showResumeToast(remoteData) {
    this._dismissResumeToast();
    const nav = this.bridge.get('navigation');
    const toast = document.createElement('div');
    toast.id = 'sync-resume-toast';
    toast.style.cssText = 'position:fixed;bottom:calc(env(safe-area-inset-bottom) + 96px);left:50%;transform:translateX(-50%);z-index:10000;background:var(--bg-surface);border:1px solid var(--border);padding:10px 20px;border-radius:50px;box-shadow:0 4px 20px rgba(0,0,0,0.5);display:flex;align-items:center;gap:10px;font-size:0.85rem;width:auto;max-width:360px';
    const label = document.createElement('span');
    label.style.cssText = 'color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500';
    label.textContent = `Continue ${remoteData.bookName || 'Book'} ${remoteData.chapter}?`;
    toast.appendChild(label);
    const resumeBtn = document.createElement('button');
    resumeBtn.textContent = 'Resume';
    resumeBtn.style.cssText = 'background:var(--accent-color);color:var(--progress-text,#111827);border:none;padding:4px 12px;border-radius:4px;font-size:0.8rem;cursor:pointer;font-weight:600';
    resumeBtn.addEventListener('click', async () => {
      this._dismissResumeToast();
      this.bridge.state.set('remoteReadingPosition', null);
      if (nav) {
        if (remoteData.verse) {
          window.verseManager.setIntentional(remoteData.verse);
        }
        nav._recordNextNavigation = true;
        await nav.loadChapter(remoteData.book, remoteData.chapter);
      }
    });
    toast.appendChild(resumeBtn);
    const ignoreBtn = document.createElement('button');
    ignoreBtn.textContent = 'Ignore';
    ignoreBtn.style.cssText = 'background:transparent;color:var(--text-muted,#888);border:1px solid var(--border,#333);padding:4px 12px;border-radius:4px;font-size:0.8rem;cursor:pointer';
    ignoreBtn.addEventListener('click', () => {
      this._dismissResumeToast();
      this.bridge.state.set('remoteReadingPosition', null);
    });
    toast.appendChild(ignoreBtn);
    document.body.appendChild(toast);
    this._resumeToastEl = toast;
    this._resumeToastTimer = setTimeout(() => {
      this._dismissResumeToast();
    }, 10000);
  }

  _startAutoSync() {
    this._stopAutoSync();
    this._autoTimer = setInterval(async () => {
      if (!navigator.onLine || !syncService.syncKey) return;
      try {
        await syncService.sync();
        this._refreshLastLabel();
      } catch (e) {}
    }, 300000);
  }

  _stopAutoSync() {
    if (this._autoTimer) {
      clearInterval(this._autoTimer);
      this._autoTimer = null;
    }
    if (this._chapterSyncTimer) {
      clearTimeout(this._chapterSyncTimer);
      this._chapterSyncTimer = null;
    }
  }
};
