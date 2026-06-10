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
    document.getElementById('settings-bionic').addEventListener('change', (e) => this._setBionic(e.target.checked));
    document.getElementById('settings-red-letter').addEventListener('change', (e) => this._setRedLetter(e.target.checked));
    document.getElementById('speed-auto-advance').addEventListener('change', (e) => this.bridge.state.set('speedAutoAdvance', e.target.checked));

    document.getElementById('speed-wpm').addEventListener('input', (e) => this._onWpmChange(parseInt(e.target.value, 10)));

    document.getElementById('settings-strength').addEventListener('input', (e) => this._setBionicStrength(parseFloat(e.target.value)));

    document.getElementById('settings-font').addEventListener('change', (e) => this._setFontFamily(e.target.value));
    document.getElementById('settings-font-size').addEventListener('input', (e) => this._setFontSize(parseFloat(e.target.value)));
    document.getElementById('settings-margins').addEventListener('input', (e) => this._setMargins(parseFloat(e.target.value)));
    document.getElementById('settings-line-spacing').addEventListener('input', (e) => this._setLineSpacing(parseFloat(e.target.value)));
    document.getElementById('settings-letter-spacing').addEventListener('input', (e) => this._setLetterSpacing(parseFloat(e.target.value)));

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
      midnight: 'slate',
      linen: 'sage',
      forest: 'gold',
      nord: 'ice',
      royal: 'bronze'
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

  _setBionic(enabled) {
    this.bridge.state.set('bionic', enabled);
    this.bridge.emit('render:refresh');
  }

  _setRedLetter(enabled) {
    this.bridge.state.set('redLetter', enabled);
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
      fontSize: 1.2,
      margins: 1.0,
      lineSpacing: 1.8,
      letterSpacing: 0.005,
      bionic: false,
      bionicStrength: 0.45,
      focusMode: false,
      swipeAnimDir: 'vertical',
      redLetter: true
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
    this.bridge.state.set('currentVerse', 1);
    this.bridge.state.set('currentBookName', 'Genesis');
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('focused-word:')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    try {
      const req = indexedDB.deleteDatabase('FocusedWord');
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
