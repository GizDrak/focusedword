window.SettingsModule = class SettingsModule {
  constructor(bridge) {
    this.bridge = bridge;
    this.settingsOpen = false;
    this._wpmTimer = null;
    this._cleanupFocus = null;
  }

  init() {
    this._initEventListeners();
    this._syncUIFromState();
  }

  _syncUIFromState() {
    const state = this.bridge.state;
    document.getElementById('settings-theme').value = state.get('theme');
    document.getElementById('settings-bionic').checked = state.get('bionic');
    document.getElementById('settings-red-letter').checked = state.get('redLetter');
    document.getElementById('settings-footnotes').checked = state.get('footnotes');
    document.getElementById('settings-section-headings').checked = state.get('sectionHeadings');
    document.getElementById('settings-poetry').checked = state.get('poetryFormatting');
    document.getElementById('settings-paragraph-mode').checked = state.get('paragraphMode');
    this._syncBionicStrengthVisibility(state.get('bionic'));
    document.getElementById('settings-cross-refs').checked = state.get('crossRefs');
    document.getElementById('speed-auto-advance').checked = state.get('speedAutoAdvance');
    document.getElementById('settings-strength').value = state.get('bionicStrength');
    document.getElementById('settings-strength-label').textContent = Math.round(state.get('bionicStrength') * 100) + '%';
    document.getElementById('settings-font').value = state.get('fontFamily');
    document.getElementById('settings-font-size').value = Math.round(state.get('fontSize') * 12);
    document.getElementById('settings-font-size-label').textContent = Math.round(state.get('fontSize') * 12) + 'pt';
    document.getElementById('settings-margins').value = state.get('margins');
    document.getElementById('settings-margins-label').textContent = state.get('margins').toFixed(1);
    document.getElementById('settings-line-spacing').value = state.get('lineSpacing');
    document.getElementById('settings-line-spacing-label').textContent = state.get('lineSpacing').toFixed(1);
    document.getElementById('settings-letter-spacing').value = state.get('letterSpacing');
    document.getElementById('settings-letter-spacing-label').textContent = state.get('letterSpacing').toFixed(3);
    this._renderAccentSwatches();
    document.getElementById('settings-background-texture').checked = state.get('backgroundTexture');
    this._applyTextSettings();
  }

  _renderAccentSwatches() {
    const container = document.getElementById('settings-accents');
    if (!container) return;
    const current = this.bridge.state.get('accent') || 'gold';
    container.innerHTML = '';
    for (const a of ColorTheme.definitions) {
      const btn = document.createElement('button');
      btn.className = 'accent-swatch' + (a.id === current ? ' active' : '');
      btn.style.background = a.color;
      btn.setAttribute('aria-label', a.label);
      btn.dataset.accent = a.id;
      btn.addEventListener('click', () => this._onAccentClick(a.id));
      container.appendChild(btn);
    }
  }

  _onAccentClick(id) {
    const ct = this.bridge.get('color-theme');
    if (ct) ct.setAccent(id);
    this._renderAccentSwatches();
  }

  _initEventListeners() {

    document.getElementById('settings-close').addEventListener('click', () => this.closeSettings());
    document.getElementById('settings-overlay').addEventListener('click', () => this.closeSettings());

    document.getElementById('settings-theme').addEventListener('change', (e) => this.setTheme(e.target.value));
    document.getElementById('settings-background-texture').addEventListener('change', (e) => this._setToggle('backgroundTexture', e.target.checked));
    document.getElementById('settings-bionic').addEventListener('change', (e) => this._setToggle('bionic', e.target.checked));
    document.getElementById('settings-red-letter').addEventListener('change', (e) => this._setToggle('redLetter', e.target.checked));
    document.getElementById('settings-footnotes').addEventListener('change', (e) => this._setToggle('footnotes', e.target.checked));
    document.getElementById('settings-section-headings').addEventListener('change', (e) => this._setToggle('sectionHeadings', e.target.checked));
    document.getElementById('settings-poetry').addEventListener('change', (e) => this._setToggle('poetryFormatting', e.target.checked));
    document.getElementById('settings-paragraph-mode').addEventListener('change', (e) => {
      this.bridge.state.set('paragraphMode', e.target.checked);
      this.bridge.state.set('paragraphBreaks', e.target.checked);
      this.bridge.emit('render:refresh');
    });
    document.getElementById('settings-bionic').addEventListener('change', (e) => this._syncBionicStrengthVisibility(e.target.checked));
    document.getElementById('settings-cross-refs').addEventListener('change', (e) => this._setCrossRefs(e.target.checked));
    document.getElementById('speed-auto-advance').addEventListener('change', (e) => this.bridge.state.set('speedAutoAdvance', e.target.checked));

    document.getElementById('speed-wpm').addEventListener('input', (e) => this._onWpmChange(parseInt(e.target.value, 10)));

    document.getElementById('settings-strength').addEventListener('input', (e) => this._setBionicStrength(parseFloat(e.target.value)));

    document.getElementById('settings-font').addEventListener('change', (e) => this._setFontFamily(e.target.value));
    document.getElementById('settings-font-size').addEventListener('input', (e) => this._setFontSize(parseFloat(e.target.value)));
    document.getElementById('settings-margins').addEventListener('input', (e) => this._setMargins(parseFloat(e.target.value)));
    document.getElementById('settings-line-spacing').addEventListener('input', (e) => this._setLineSpacing(parseFloat(e.target.value)));
    document.getElementById('settings-letter-spacing').addEventListener('input', (e) => this._setLetterSpacing(parseFloat(e.target.value)));

    document.getElementById('view-changelog').addEventListener('click', (e) => { e.preventDefault(); this._openChangelog(); });
    document.getElementById('view-debug-log').addEventListener('click', () => this._openDebugLog());

    document.getElementById('reset-settings').addEventListener('click', () => this.resetSettings());
    document.getElementById('reset-app').addEventListener('click', () => this.resetApp());

    document.querySelectorAll('.section-header').forEach(header => {
      header.addEventListener('click', () => this._toggleSection(header));
    });

    document.getElementById('focus-exit-btn').addEventListener('click', () => this.toggleFocusMode());
  }

  openSettings() {
    if (this.settingsOpen) return;
    this.settingsOpen = true;
    document.getElementById('settings-panel').classList.add('open');
    document.getElementById('settings-overlay').classList.add('open');
    const base = this.bridge.get('base-renderer');
    if (base) {
      this._cleanupFocus = base.trapFocus(document.getElementById('settings-panel'), document.querySelector('.tab-item[data-tab="bible"]'));
    }
  }

  toggleSettings() {
    this.settingsOpen = !this.settingsOpen;
    document.getElementById('settings-panel').classList.toggle('open', this.settingsOpen);
    document.getElementById('settings-overlay').classList.toggle('open', this.settingsOpen);
    if (this.settingsOpen) {
      const base = this.bridge.get('base-renderer');
      if (base) {
        this._cleanupFocus = base.trapFocus(document.getElementById('settings-panel'), document.querySelector('.tab-item[data-tab="bible"]'));
      }
    } else {
      if (this._cleanupFocus) { this._cleanupFocus(); this._cleanupFocus = null; }
    }
  }

  closeSettings() {
    this.settingsOpen = false;
    document.getElementById('settings-panel').classList.remove('open');
    document.getElementById('settings-overlay').classList.remove('open');
    if (this._cleanupFocus) { this._cleanupFocus(); this._cleanupFocus = null; }
  }

  setTheme(name) {
    this.bridge.state.set('theme', name);
    document.documentElement.dataset.theme = name;
    const accentMap = {
      dark: 'gold',
      sepia: 'amber',
      light: 'gold',
      'midnight-ink': 'sapphire',
      'icy-wind': 'icy',
      'forest-reader': 'emerald',
      nord: 'ice',
      rosewood: 'rose',
      galaxy: 'purple',
      clay: 'slate'
    };
    const defaultAccent = accentMap[name] || 'gold';
    const ct = this.bridge.get('color-theme');
    if (ct) ct.setAccent(defaultAccent);
    this._renderAccentSwatches();
  }

  toggleFocusMode() {
    const state = this.bridge.state;
    const active = !state.get('focusMode');
    state.set('focusMode', active);
    if (active) {
      document.body.classList.add('focus-mode');
      this.closeSettings();
    } else {
      document.body.classList.remove('focus-mode');
    }
  }

  _onWpmChange(value) {
    this.bridge.state.set('wpm', value);
    document.getElementById('speed-wpm').value = value;
    document.getElementById('speed-wpm-display').textContent = value + ' WPM';
    clearTimeout(this._wpmTimer);
    this._wpmTimer = setTimeout(() => {
      const speed = this.bridge.get('renderer-speed');
      if (speed && speed.isPlaying) {
        speed._stopTimer();
        speed._scheduleNext();
      }
    }, 150);
  }

  _setToggle(stateKey, enabled) {
    this.bridge.state.set(stateKey, enabled);
    this.bridge.emit('render:refresh');
  }

  async _openChangelog() {
    const body = document.getElementById('changelog-body');
    const panel = document.getElementById('changelog-panel');
    const overlay = document.getElementById('changelog-overlay');
    if (!body || !panel || !overlay) return;
    body.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--text-muted)">Loading...</div>';
    overlay.classList.add('open');
    panel.classList.add('open');
    try {
      const resp = await fetch('changes.md');
      const md = await resp.text();
      const lines = md.split('\n');
      let html = '';
      let inList = false;
      const escapeInline = (text) => {
        const parts = text.split(/(`[^`]+`)/g);
        return parts.map(p => {
          if (p.startsWith('`') && p.endsWith('`')) return '<code>' + p.slice(1, -1) + '</code>';
          return MarkdownParser.parse(p);
        }).join('');
      };
      const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
      for (let line of lines) {
        const trimmed = line.trim();
        if (!trimmed) { closeList(); html += '<br>'; continue; }
        const h1 = trimmed.match(/^# (.+)/);
        const h2 = trimmed.match(/^## (.+)/);
        const h3 = trimmed.match(/^### (.+)/);
        const li = trimmed.match(/^- (.+)/);
        const hr = trimmed.match(/^---+/);
        if (h1) { closeList(); html += '<h1>' + escapeInline(h1[1]) + '</h1>'; }
        else if (h2) { closeList(); html += '<h2>' + escapeInline(h2[1]) + '</h2>'; }
        else if (h3) { closeList(); html += '<h3>' + escapeInline(h3[1]) + '</h3>'; }
        else if (li) { if (!inList) { inList = true; html += '<ul>'; } html += '<li>' + escapeInline(li[1]) + '</li>'; }
        else if (hr) { closeList(); html += '<hr>'; }
        else { closeList(); html += '<p>' + escapeInline(trimmed) + '</p>'; }
      }
      closeList();
      body.innerHTML = html;
    } catch (e) {
      body.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--error-text)">Failed to load changelog.</div>';
    }
    document.getElementById('changelog-close').addEventListener('click', () => this._closeChangelog());
    overlay.addEventListener('click', () => this._closeChangelog());
  }

  _closeChangelog() {
    document.getElementById('changelog-panel').classList.remove('open');
    document.getElementById('changelog-overlay').classList.remove('open');
  }

  _openDebugLog() {
    const panel = document.getElementById('debuglog-panel');
    const overlay = document.getElementById('debuglog-overlay');
    panel.classList.add('open');
    overlay.classList.add('open');
    this._renderDebugLog('all');
    document.getElementById('debuglog-close').onclick = () => this._closeDebugLog();
    overlay.onclick = () => this._closeDebugLog();
    document.getElementById('debuglog-clear').onclick = () => {
      window.__debug.clearLogs();
      this._renderDebugLog(document.querySelector('.debuglog-filter-btn.active')?.dataset?.level || 'all');
    };
    document.getElementById('debuglog-entries').onclick = (e) => {
      const entry = e.target.closest('.debuglog-entry');
      if (!entry) return;
      const stack = entry.querySelector('.debuglog-stack');
      if (stack) stack.classList.toggle('hidden');
    };
  }

  _closeDebugLog() {
    document.getElementById('debuglog-panel').classList.remove('open');
    document.getElementById('debuglog-overlay').classList.remove('open');
  }

  _renderDebugLog(level) {
    const container = document.getElementById('debuglog-entries');
    const logs = window.__debug.getLogs(level === 'all' ? undefined : level);
    if (!logs.length) {
      container.innerHTML = '<div class="debuglog-empty">No entries.</div>';
      return;
    }
    document.querySelectorAll('.debuglog-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.level === level);
      btn.onclick = () => this._renderDebugLog(btn.dataset.level);
    });
    container.innerHTML = logs.map(e => {
      const ts = new Date(e.ts);
      const time = String(ts.getHours()).padStart(2, '0') + ':' + String(ts.getMinutes()).padStart(2, '0') + ':' + String(ts.getSeconds()).padStart(2, '0');
      const levelClass = 'debuglog-level--' + e.level;
      const levelLabel = e.level === 'error' ? 'ERR' : 'WRN';
      const stackHtml = e.stack ? '<div class="debuglog-stack hidden">' + this._escapeDebug(e.stack) + '</div>' : '';
      return '<div class="debuglog-entry" data-level="' + e.level + '">' +
        '<div class="debuglog-line">' +
        '<span class="debuglog-time">' + time + '</span>' +
        '<span class="debuglog-level ' + levelClass + '">' + levelLabel + '</span>' +
        '<span class="debuglog-module">' + this._escapeDebug(e.module) + '</span>' +
        '<span class="debuglog-msg">' + this._escapeDebug(e.msg) + '</span>' +
        '</div>' + stackHtml +
        '</div>';
    }).join('');
  }

  _escapeDebug(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  _syncBionicStrengthVisibility(enabled) {
    const row = document.querySelector('.settings-strength-row');
    if (row) row.style.display = enabled ? '' : 'none';
  }

  async _setCrossRefs(enabled) {
    this.bridge.state.set('crossRefs', enabled);
    const cr = this.bridge.get('cross-references');
    if (!cr) return;
    if (enabled) {
      await cr.init();
      if (!cr.enabled) {
        this.bridge.state.set('crossRefs', false);
        document.getElementById('settings-cross-refs').checked = false;
      }
    } else {
      cr.destroy();
    }
    this.bridge.emit('render:refresh');
  }

  _setBionicStrength(value) {
    this.bridge.state.set('bionicStrength', value);
    document.getElementById('settings-strength-label').textContent = Math.round(value * 100) + '%';
    this.bridge.emit('render:refresh');
  }

  _setFontFamily(value) {
    this.bridge.state.set('fontFamily', value);
    this._applyTextSettings();
  }

  _setFontSize(value) {
    const rem = value / 12;
    this.bridge.state.set('fontSize', rem);
    document.getElementById('settings-font-size-label').textContent = value + 'pt';
    this._applyTextSettings();
  }

  _setMargins(value) {
    this.bridge.state.set('margins', value);
    document.getElementById('settings-margins-label').textContent = value.toFixed(1);
    this._applyTextSettings();
  }

  _setLineSpacing(value) {
    this.bridge.state.set('lineSpacing', value);
    document.getElementById('settings-line-spacing-label').textContent = value.toFixed(1);
    this._applyTextSettings();
  }

  _setLetterSpacing(value) {
    this.bridge.state.set('letterSpacing', value);
    document.getElementById('settings-letter-spacing-label').textContent = value.toFixed(3);
    this._applyTextSettings();
  }

  _applyTextSettings() {
    const state = this.bridge.state;
    const root = document.documentElement;
    const FONT_MAP = {
      inter: "'Inter', system-ui, -apple-system, sans-serif",
      roboto: "'Roboto', system-ui, -apple-system, sans-serif",
      atkinson: "'Atkinson Hyperlegible', system-ui, -apple-system, sans-serif",
      merriweather: "'Merriweather', Georgia, 'Times New Roman', serif",
      lora: "'Lora', Georgia, 'Times New Roman', serif",
      'crimson-pro': "'Crimson Pro', Georgia, 'Times New Roman', serif",
      'ibm-plex-mono': "'IBM Plex Mono', 'Courier New', monospace",
      caveat: "'Caveat', 'Comic Sans MS', cursive",
      lexend: "'Lexend', system-ui, -apple-system, sans-serif",
      'comic-neue': "'Comic Neue', 'Comic Sans MS', cursive"
    };
    const fontKey = state.get('fontFamily');
    root.style.setProperty('--verse-font-family', FONT_MAP[fontKey] || FONT_MAP.inter);
    root.style.setProperty('--verse-font-size', state.get('fontSize') + 'rem');
    root.style.setProperty('--verse-line-height', String(state.get('lineSpacing')));
    root.style.setProperty('--verse-letter-spacing', state.get('letterSpacing') + 'em');
    root.style.setProperty('--verse-padding-x', state.get('margins') + 'rem');
  }

  _toggleSection(header) {
    const expanded = header.getAttribute('aria-expanded') === 'true';
    header.setAttribute('aria-expanded', !expanded);
  }

  resetSettings() {
    if (!confirm('Reset all settings to their defaults?')) return;
    const state = this.bridge.state;
    document.body.classList.remove('focus-mode');
    state.batch({
      theme: 'dark',
      accent: 'gold',
      fontFamily: 'inter',
      fontSize: 1.083,
      margins: 1.0,
      lineSpacing: 1.8,
      letterSpacing: 0.005,
      bionic: false,
      bionicStrength: 0.45,
      focusMode: false,
      swipeAnimDir: 'vertical',
      redLetter: true,
      footnotes: true,
      sectionHeadings: true,
      poetryFormatting: true,
      paragraphBreaks: false,
      paragraphMode: false,
      backgroundTexture: true
    });
    const ct = this.bridge.get('color-theme');
    if (ct) ct.apply('gold');
    document.documentElement.dataset.theme = 'dark';
    this._syncUIFromState();
    this.bridge.emit('render:refresh');
  }

  resetApp() {
    if (!confirm('This will reset ALL data including bookmarks, highlights, and reading position. This cannot be undone. Continue?')) return;
    this.closeSettings();
    this.bridge.state.set('currentBook', 1);
    this.bridge.state.set('currentChapter', 1);
    window.verseManager.setIntentional(1);
    this.bridge.state.set('currentBookName', 'Genesis');
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('focused-word:')) {
        keysToRemove.push(key);
      }
    }
    ['sync-key', 'sync-enabled', 'sync-auto', 'sync-server-url', 'sync-last-updated'].forEach(k => {
      const v = localStorage.getItem(k);
      if (v !== null) keysToRemove.push(k);
    });
    keysToRemove.forEach(k => localStorage.removeItem(k));
    try {
      indexedDB.deleteDatabase('FocusedWord');
      const req = indexedDB.deleteDatabase('FocusedSyncDB');
      req.onsuccess = () => location.reload();
      req.onerror = () => location.reload();
      req.onblocked = () => location.reload();
    } catch (e) {
      location.reload();
    }
  }

  toggleMode(mode) {
    const state = this.bridge.state;
    const speed = this.bridge.get('renderer-speed');

    if (state.get(mode)) {
      state.batch({ swipeMode: false, spotlightMode: false, speedMode: false });
    } else {
      const modes = { swipeMode: false, spotlightMode: false, speedMode: false };
      modes[mode] = true;
      state.batch(modes);
      if (mode === 'speedMode' && speed) speed.stop();
    }

    if (speed && !state.get('speedMode')) speed.stop();
    this.bridge.emit('render:refresh');
  }

};
