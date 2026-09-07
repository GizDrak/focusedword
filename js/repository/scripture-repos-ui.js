window.ScriptureReposUI = class ScriptureReposUI {
  constructor(bridge) {
    this.bridge = bridge;
    this._repoManifests = new Map();
    this._activeRepoId = null;
  }

  init() {
    this._cacheElements();
    this._bindEvents();
    this._renderAll();
  }

  _confirmDialog(options) {
    if (window.dialogService) return window.dialogService.confirm(options);
    return Promise.resolve(window.confirm(options.message || ''));
  }

  _cacheElements() {
    this._els = {
      body: document.getElementById('scripture-repos-body'),
      addBtn: document.getElementById('sr-toggle-add'),
      repoList: document.getElementById('sr-repo-list'),
      installedList: document.getElementById('sr-installed-list'),
      navInstallBtn: document.getElementById('nav-install-more'),
      popupOverlay: document.getElementById('sr-popup-overlay'),
      popupPanel: document.getElementById('sr-popup-panel'),
      popupTitle: document.getElementById('sr-popup-title'),
      popupClose: document.getElementById('sr-popup-close'),
      popupBody: document.getElementById('sr-popup-body'),
      popupLoading: document.getElementById('sr-popup-loading'),
      popupContent: document.getElementById('sr-popup-content'),
      popupPublic: document.getElementById('sr-popup-public'),
      popupLocked: document.getElementById('sr-popup-locked'),
      popupKey: document.getElementById('sr-popup-key'),
      popupUnlockBtn: document.getElementById('sr-popup-unlock-btn'),
      popupPrivate: document.getElementById('sr-popup-private'),
      popupError: document.getElementById('sr-popup-error')
    };
  }

  _bindEvents() {
    this._els.addBtn.addEventListener('click', () => this.showAddRepoPopup());
    this._els.navInstallBtn.addEventListener('click', () => this.showRepoPicker());
    this._els.popupClose.addEventListener('click', () => this.closePanel());
    this._els.popupOverlay.addEventListener('click', () => this.closePanel());
    this._els.popupUnlockBtn.addEventListener('click', () => this._onPopupUnlock());
    this._els.popupKey.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._onPopupUnlock();
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._els.popupPanel.classList.contains('open')) {
        this.closePanel();
      }
    });
  }

  async _onAddRepo(url) {
    if (!url) return;
    try {
      if (!window.UrlValidator.isAllowedEndpoint(url)) {
        this._showPopupError('Repository URL must use HTTPS (or HTTP for localhost development only)');
        return;
      }
      const u = new URL(url);
      if (u.protocol === 'https:' && !window.UrlValidator.isLocalhost(u.hostname) && u.origin !== 'https://repo.focusedword.com') {
        const trusted = await this._confirmDialog({
          title: 'Add repository?',
          message: 'Add repository from ' + u.origin + '? Make sure you trust this source.',
          confirmLabel: 'Add Repository'
        });
        if (!trusted) return;
      }
      const name = url.replace(/^https?:\/\//, '').split('/')[0];
      const repo = await window.repoService.registerRepository(url, name);
      this._renderRepoList();
      this._renderInstalledList();
      this.openRepo(repo.id);
    } catch (e) {
      console.error('[ScriptureRepos] Failed to add repo:', e);
      this._showPopupError('Failed to add repository: ' + e.message);
    }
  }

  _renderAll() {
    this._renderRepoList();
    this._renderInstalledList();
  }

  _renderRepoList() {
    const container = this._els.repoList;
    container.innerHTML = '';
    const repos = window.repoService.repositories;
    if (!repos.length) {
      container.innerHTML = '<div class="sr-empty">No repositories configured.</div>';
      return;
    }
    for (const repo of repos) {
      const row = document.createElement('div');
      row.className = 'sr-repo-row';
      row.innerHTML = `
        <span class="sr-repo-name">${this._escape(repo.repo_name || repo.name)}</span>
        <div class="sr-repo-row-actions">
          <button class="sr-btn-icon sr-check-btn" data-repo-id="${repo.id}" title="Check repository">✓</button>
          <button class="sr-btn-icon sr-repo-remove" data-repo-id="${repo.id}" title="Remove repository">✕</button>
        </div>
      `;
      container.appendChild(row);
      row.querySelector('.sr-check-btn').addEventListener('click', () => this.openRepo(repo.id));
      row.querySelector('.sr-repo-remove').addEventListener('click', () => this._onRemoveRepo(repo.id));
    }
  }

  async _onRemoveRepo(repoId) {
    const confirmed = await this._confirmDialog({
      title: 'Remove repository',
      message: 'Remove this repository? It can be re-added later using the same URL. Downloaded translations will be kept.',
      confirmLabel: 'Remove Repository',
      danger: true
    });
    if (!confirmed) return;
    await window.repoService.markRepositoryDeleted(repoId);
    this._repoManifests.delete(repoId);
    if (this._activeRepoId === repoId) this.closePanel();
    this._renderRepoList();
  }

  // ─── Popup ────────────────────────────────────────────────

  async openRepo(repoId) {
    const repo = window.repoService.repositories.find(r => r.id === repoId);
    if (!repo) return;
    this._activeRepoId = repoId;
    this._previousFocus = document.activeElement;
    this._els.popupTitle.textContent = repo.repo_name || repo.name;
    this._els.popupLoading.style.display = '';
    this._els.popupContent.style.display = 'none';
    this._els.popupError.style.display = 'none';
    this._els.popupPanel.classList.add('open');
    this._els.popupOverlay.classList.add('open');
    this._els.popupPanel.removeAttribute('aria-hidden');
    this._els.popupPanel.inert = false;
    this._els.popupOverlay.removeAttribute('aria-hidden');
    const base = this.bridge.get('base-renderer');
    if (base) this._popupCleanupFocus = base.trapFocus(this._els.popupPanel, null);

    try {
      const result = await window.repoService.refreshManifest(repo);
      if (result.repo_name && result.repo_name !== repo.repo_name) {
        repo.repo_name = result.repo_name;
        await window.idb.putRepository(repo);
        this._renderRepoList();
      }
      this._repoManifests.set(repoId, result);
      // Keep the Bible pickers in sync — freshly browsed translations may
      // now be listed as available (not downloaded yet).
      this._buildTranslationManifest();
      this._els.popupLoading.style.display = 'none';
      this._els.popupContent.style.display = '';
      this._renderPopupContent(repoId, result);
      if (result.hasProtected && repo.access_key && !result.hiddenTranslations) {
        this._onPopupUnlock(repo.access_key);
      }
    } catch (e) {
      this._els.popupLoading.style.display = 'none';
      this._els.popupContent.style.display = '';
      this._showPopupError('Check failed: ' + e.message);
    }
  }

  // ─── Repo Picker (from nav Install button) ────────────────

  showRepoPicker() {
    this._activeRepoId = null;
    this._previousFocus = document.activeElement;
    this._els.popupTitle.textContent = 'Select Repository';
    this._els.popupLoading.style.display = 'none';
    this._els.popupContent.style.display = '';
    this._els.popupError.style.display = 'none';
    this._els.popupPanel.classList.add('open');
    this._els.popupOverlay.classList.add('open');
    this._els.popupPanel.removeAttribute('aria-hidden');
    this._els.popupPanel.inert = false;
    this._els.popupOverlay.removeAttribute('aria-hidden');
    const base = this.bridge.get('base-renderer');
    if (base) this._popupCleanupFocus = base.trapFocus(this._els.popupPanel, null);

    const repos = window.repoService.repositories;
    if (!repos.length) {
      this._els.popupPublic.innerHTML = '<div class="sr-empty">No repositories configured. Add one in Settings.</div>';
      this._els.popupLocked.style.display = 'none';
      this._els.popupPrivate.style.display = 'none';
      return;
    }

    this._els.popupLocked.style.display = 'none';
    this._els.popupPrivate.style.display = 'none';

    const container = this._els.popupPublic;
    container.innerHTML = '';
    for (const repo of repos) {
      const row = document.createElement('div');
      row.className = 'sr-translation-row';
      row.style.cursor = 'pointer';
      row.innerHTML = `
        <div class="sr-tl-info">
          <span class="sr-tl-name">${this._escape(repo.repo_name || repo.name)}</span>
          <span class="sr-tl-meta">${this._escape(repo.url)}</span>
        </div>
        <span style="color:var(--accent-color);font-size:0.85rem;">›</span>
      `;
      row.addEventListener('click', () => {
        this.openRepo(repo.id);
      });
      container.appendChild(row);
    }
  }

  showAddRepoPopup() {
    this._activeRepoId = null;
    this._previousFocus = document.activeElement;
    this._els.popupTitle.textContent = 'Add Repository';
    this._els.popupLoading.style.display = 'none';
    this._els.popupContent.style.display = '';
    this._els.popupError.style.display = 'none';
    this._els.popupLocked.style.display = 'none';
    this._els.popupPrivate.style.display = 'none';
    this._els.popupPanel.classList.add('open');
    this._els.popupOverlay.classList.add('open');
    this._els.popupPanel.removeAttribute('aria-hidden');
    this._els.popupPanel.inert = false;
    this._els.popupOverlay.removeAttribute('aria-hidden');
    const base = this.bridge.get('base-renderer');
    if (base) this._popupCleanupFocus = base.trapFocus(this._els.popupPanel, null);

    const container = this._els.popupPublic;
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0.5rem;">
        <label style="font-size:0.85rem;color:var(--text-secondary);">Repository URL</label>
        <input type="url" id="sr-add-popup-url" value="https://" placeholder="https://example.com/bibles" style="flex:1;min-height:2.5rem;font-size:16px;">
        <div style="display:flex;gap:0.4rem;">
          <button id="sr-add-popup-confirm" class="btn-secondary" style="flex:1;padding:0.5rem;">Add</button>
          <button id="sr-add-popup-cancel" class="btn-secondary" style="flex:1;padding:0.5rem;">Cancel</button>
        </div>
      </div>
    `;

    const input = document.getElementById('sr-add-popup-url');
    const confirmBtn = document.getElementById('sr-add-popup-confirm');
    const cancelBtn = document.getElementById('sr-add-popup-cancel');

    const doAdd = () => { const v = input.value.trim(); if (v) { this._onAddRepo(v); } };
    const doCancel = () => this.closePanel();

    confirmBtn.addEventListener('click', doAdd);
    cancelBtn.addEventListener('click', doCancel);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doAdd();
      if (e.key === 'Escape') doCancel();
    });
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(8, 8);
    }, 100);
  }

  closePanel() {
    this._activeRepoId = null;
    this._els.popupPanel.classList.remove('open');
    this._els.popupOverlay.classList.remove('open');
    this._els.popupPanel.setAttribute('aria-hidden', 'true');
    this._els.popupPanel.inert = true;
    this._els.popupOverlay.setAttribute('aria-hidden', 'true');
    this._els.popupKey.value = '';
    this._els.popupError.style.display = 'none';
    if (this._popupCleanupFocus) { this._popupCleanupFocus(); this._popupCleanupFocus = null; }
    if (this._previousFocus && this._previousFocus.isConnected) {
      this._previousFocus.focus({ preventScroll: true });
    }
    this._previousFocus = null;
  }

  _showPopupError(msg) {
    this._els.popupError.textContent = msg;
    this._els.popupError.style.display = '';
  }

  _renderPopupContent(repoId, manifest) {
    const repo = window.repoService.repositories.find(r => r.id === repoId);

    const publicContainer = this._els.popupPublic;
    publicContainer.innerHTML = '';
    if (manifest.publicTranslations?.length) {
      publicContainer.innerHTML = '<div class="sr-popup-public-label">Public Translations</div>';
      for (const t of manifest.publicTranslations) {
        publicContainer.appendChild(this._translationRow(repoId, t, false));
      }
    }

    if (manifest.hasProtected) {
      this._els.popupLocked.style.display = '';
      if (repo?.access_key) this._els.popupKey.value = repo.access_key;
      this._els.popupPrivate.style.display = 'none';
      if (!repo?.access_key) {
        setTimeout(() => this._els.popupKey.focus(), 100);
      }
    } else {
      this._els.popupLocked.style.display = 'none';
      this._els.popupPrivate.style.display = 'none';
      this._els.popupPrivate.innerHTML = '';
    }

    if (manifest.hiddenTranslations?.length) {
      this._els.popupLocked.style.display = 'none';
      this._els.popupPrivate.style.display = '';
      this._els.popupPrivate.innerHTML = '<div class="sr-popup-private-label">Protected Translations</div>';
      for (const t of manifest.hiddenTranslations) {
        this._els.popupPrivate.appendChild(this._translationRow(repoId, t, true));
      }
    }
  }

  _translationRow(repoId, t, isProtected) {
    const installed = window.repoService.installed.find(i => i.translation_id === t.id);
    const row = document.createElement('div');
    row.className = 'sr-translation-row';
    const sizeStr = t.size_bytes ? this._formatSize(t.size_bytes) : '';
    row.innerHTML = `
      <div class="sr-tl-info">
        <span class="sr-tl-name">${this._escape(t.name)}</span>
        <span class="sr-tl-meta">${this._escape(t.language)}${sizeStr ? ' · ' + sizeStr : ''}${isProtected ? ' · 🔒' : ''}</span>
      </div>
      <div class="sr-tl-action">
        ${installed
          ? `<span class="sr-installed-badge">Installed</span>
             <button class="btn-secondary sr-remove-install-btn" data-id="${t.id}" style="width:auto;padding:0.2rem 0.5rem;font-size:0.75rem;">Remove</button>`
          : `<button class="btn-secondary sr-download-btn" data-repo-id="${repoId}" data-tl-id="${t.id}" style="width:auto;padding:0.2rem 0.5rem;font-size:0.75rem;">Download</button>`
        }
      </div>
    `;
    const downloadBtn = row.querySelector('.sr-download-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => this._onDownload(repoId, t.id));
    }
    const removeBtn = row.querySelector('.sr-remove-install-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => this._onRemoveInstalled(t.id));
    }
    return row;
  }

  async _onPopupUnlock(presetKey) {
    const repo = window.repoService.repositories.find(r => r.id === this._activeRepoId);
    if (!repo) return;
    const password = presetKey || this._els.popupKey.value;
    if (!password) return;
    const cached = this._repoManifests.get(this._activeRepoId);
    if (!cached || !cached.encryptedPayload) return;

    this._els.popupUnlockBtn.disabled = true;
    this._els.popupUnlockBtn.textContent = 'Unlocking...';
    this._els.popupError.style.display = 'none';
    try {
      const hiddenTranslations = await window.repoService.unlockRepository(
        repo.url, cached.encryptedPayload, password
      );
      await window.repoService.saveAccessKey(this._activeRepoId, password);
      cached.hiddenTranslations = hiddenTranslations;
      this._repoManifests.set(this._activeRepoId, cached);
      // Persist the unlocked list so the Bible pickers can offer these
      // protected translations without re-entering the key.
      await window.repoService.cacheManifest(repo, cached);
      this._buildTranslationManifest();
      this._renderPopupContent(this._activeRepoId, cached);
    } catch (e) {
      this._showPopupError('Unlock failed: ' + e.message);
    } finally {
      this._els.popupUnlockBtn.disabled = false;
      this._els.popupUnlockBtn.textContent = 'Unlock';
    }
  }

  async _onDownload(repoId, translationId) {
    const repo = window.repoService.repositories.find(r => r.id === repoId);
    if (!repo) return;
    const cached = this._repoManifests.get(repoId);
    if (!cached) return;
    const all = [
      ...(cached.publicTranslations || []),
      ...(cached.hiddenTranslations || [])
    ];
    const t = all.find(t => t.id === translationId);
    if (!t) return;

    const password = t.encrypted ? repo.access_key : null;

    const btn = document.querySelector(`.sr-download-btn[data-repo-id="${repoId}"][data-tl-id="${translationId}"]`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Downloading...';
    }
    try {
      await window.repoService.downloadAndInstall(repo.url, t, password);
      this._buildTranslationManifest();
      this._renderInstalledList();
      if (this._activeRepoId === repoId) {
        this._renderPopupContent(repoId, cached);
      }
    } catch (e) {
      console.error('[ScriptureRepos] Download failed:', e);
      this._showPopupError('Download failed: ' + e.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Download';
      }
    }
  }

  async _onRemoveInstalled(translationId) {
    const confirmed = await this._confirmDialog({
      title: 'Remove translation',
      message: `Remove "${translationId}" from installed translations?`,
      confirmLabel: 'Remove Translation',
      danger: true
    });
    if (!confirmed) return;
    try {
      await window.repoService.removeInstalledDatabase(translationId);
      this._buildTranslationManifest();
      this._renderInstalledList();
      if (this._activeRepoId) {
        const cached = this._repoManifests.get(this._activeRepoId);
        if (cached) this._renderPopupContent(this._activeRepoId, cached);
      }
    } catch (e) {
      console.error('[ScriptureRepos] Remove failed:', e);
    }
  }

  _renderInstalledList() {
    const container = this._els.installedList;
    const installed = window.repoService.installed;
    if (!installed.length) {
      container.style.display = 'none';
      return;
    }
    container.style.display = '';
    container.innerHTML = '<div style="font-size:0.85rem;font-weight:600;margin-bottom:0.3rem;color:var(--text-secondary);">Installed Translations</div>';
    for (const i of installed) {
      const row = document.createElement('div');
      row.className = 'sr-installed-row';
      const isBundled = i.source === 'bundled';
      row.innerHTML = `
        <span>${this._escape(i.name)}</span>
        <div style="display:flex;align-items:center;gap:0.3rem;">
          <span style="font-size:0.72rem;color:var(--text-muted);">${isBundled ? 'Built-in' : 'Repository'}</span>
          ${isBundled ? '' : '<button class="sr-btn-icon sr-installed-remove" data-id="' + i.translation_id + '" title="Remove" style="color:var(--error-text);">✕</button>'}
        </div>
      `;
      container.appendChild(row);
      const rmBtn = row.querySelector('.sr-installed-remove');
      if (rmBtn) {
        rmBtn.addEventListener('click', () => this._onRemoveInstalled(i.translation_id));
      }
    }
  }

  // Called by the Bible pickers when the user selects a translation that
  // is listed but not downloaded yet. Downloads it first, then refreshes
  // the pickers so the entry flips to installed.
  async ensureTranslationReady(entry) {
    const res = await window.repoService.ensureInstalled(entry);
    if (res.ok) {
      await this._buildTranslationManifest();
    }
    return res;
  }

  async _buildTranslationManifest() {
    const bridge = this.bridge;
    try {
      const manifest = await window.repoService.buildManifest();
      manifest.sort((a, b) => a.name.localeCompare(b.name));
      bridge.translationManifest = manifest;
      const nav = bridge.get('navigation');
      if (nav) nav.renderTranslationView();
      const sm = bridge.get('split-mode');
      if (sm) sm.repopulateSelectors();
    } catch (e) {
      console.warn('[ScriptureRepos] Manifest rebuild failed:', e);
    }
  }

  _escape(str) {
    return window.HTMLEscape(str);
  }

  _formatSize(bytes) {
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
    if (bytes >= 1e3) return (bytes / 1e3).toFixed(0) + ' KB';
    return bytes + ' B';
  }
};
