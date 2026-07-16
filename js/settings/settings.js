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
    const _rs = (key, def) => {
      const raw = state.get(key);
      if (raw !== 'skin' || !window.UISkins) return raw;
      const resolved = UISkins.getActive();
      if (resolved && key in (resolved.preferences || {})) return resolved.preferences[key];
      return UISkins._builtinDefaults[key] !== undefined ? UISkins._builtinDefaults[key] : def;
    };
    document.getElementById('settings-theme').value = state.get('theme');
    document.getElementById('settings-bionic').checked = _rs('bionic', false) === true;
    document.getElementById('settings-red-letter').checked = _rs('redLetter', true) === true;
    document.getElementById('settings-footnotes').checked = _rs('footnotes', true) === true;
    document.getElementById('settings-chapter-title').checked = _rs('chapterTitle', true) === true;
    document.getElementById('settings-section-headings').checked = _rs('sectionHeadings', true) === true;
    document.getElementById('settings-ui-skin').value = state.get('uiSkin');
    document.getElementById('settings-poetry').checked = _rs('poetryFormatting', true) === true;
    document.getElementById('settings-paragraph-mode').checked = _rs('paragraphMode', false) === true;
    document.getElementById('settings-swipe-max-verses').value = state.get('swipeMaxVerses');
    document.getElementById('settings-swipe-max-verses-label').textContent = state.get('swipeMaxVerses');
    this._syncSwipeMaxVersesVisibility(state.get('paragraphBreaks'));
    this._syncBionicStrengthVisibility(_rs('bionic', false) === true);
    document.getElementById('settings-cross-refs').checked = _rs('crossRefs', false) === true;
    document.getElementById('speed-auto-advance').checked = state.get('speedAutoAdvance');
    const _bionicStr = window.UISkins ? window.UISkins.resolveSetting('bionicStrength', state.get('bionicStrength')) : state.get('bionicStrength');
    document.getElementById('settings-strength').value = _bionicStr;
    document.getElementById('settings-strength-label').textContent = Math.round(_bionicStr * 100) + '%';
    document.getElementById('settings-font').value = state.get('fontFamily');
    const _fontSize = window.UISkins ? window.UISkins.resolveSetting('fontSize', state.get('fontSize')) : state.get('fontSize');
    document.getElementById('settings-font-size').value = Math.round(_fontSize * 12);
    document.getElementById('settings-font-size-label').textContent = Math.round(_fontSize * 12) + 'pt';
    const _margins = window.UISkins ? window.UISkins.resolveSetting('margins', state.get('margins')) : state.get('margins');
    document.getElementById('settings-margins').value = _margins;
    document.getElementById('settings-margins-label').textContent = _margins.toFixed(1);
    const _lineSpacing = window.UISkins ? window.UISkins.resolveSetting('lineSpacing', state.get('lineSpacing')) : state.get('lineSpacing');
    document.getElementById('settings-line-spacing').value = _lineSpacing;
    document.getElementById('settings-line-spacing-label').textContent = _lineSpacing.toFixed(1);
    const _letterSpacing = window.UISkins ? window.UISkins.resolveSetting('letterSpacing', state.get('letterSpacing')) : state.get('letterSpacing');
    document.getElementById('settings-letter-spacing').value = _letterSpacing;
    document.getElementById('settings-letter-spacing-label').textContent = _letterSpacing.toFixed(3);
    document.getElementById('settings-chapter-header-alignment').value = state.get('chapterHeaderAlignment');
    document.getElementById('settings-section-heading-alignment').value = state.get('sectionHeadingAlignment');
    document.getElementById('settings-verse-text-alignment').value = state.get('verseTextAlignment');
    document.getElementById('settings-verse-number-placement').value = state.get('verseNumberPlacement');
    this._renderAccentSwatches();
    this._renderRedLetterSwatches();
    this._applyRedLetterColor();
    document.getElementById('settings-background-texture').checked = _rs('backgroundTexture', true) === true;
    document.querySelectorAll('#settings-panel input[type="range"]').forEach(input => this._updateRangeFill(input));
    this._applyTextSettings();
  }

  _renderAccentSwatches() {
    const wrap = document.getElementById('settings-accent-wrap');
    if (!wrap) return;
    const _rs = (key, def) => {
      const raw = this.bridge.state.get(key);
      if (raw !== 'skin' || !window.UISkins) return raw;
      const resolved = UISkins.getActive();
      if (resolved && key in (resolved.preferences || {})) return resolved.preferences[key];
      return UISkins._builtinDefaults[key] !== undefined ? UISkins._builtinDefaults[key] : def;
    };
    const raw = this.bridge.state.get('accent');
    const effective = _rs('accent', 'gold');
    const resolvedColor = (id) => {
      const def = ColorTheme.definitions.find(d => d.id === (id === 'skin' ? effective : id));
      return def ? def.color : '#D4AF37';
    };
    const label = raw === 'skin' ? 'Default' : (ColorTheme.definitions.find(d => d.id === raw)?.label || raw);

    wrap.innerHTML = '';
    const trigger = document.createElement('button');
    trigger.className = 'custom-select-trigger';
    trigger.innerHTML = `<span class="color-dot" style="background:${resolvedColor(raw)}"></span><span class="cs-label">${label}</span><svg class="cs-chevron" viewBox="0 0 10 6" width="10" height="6" fill="currentColor" opacity="0.6"><path d="M0 0l5 6 5-6z"/></svg>`;

    const dropdown = document.createElement('div');
    dropdown.className = 'custom-select-dropdown hidden';

    const allOptions = [{ value: 'skin', label: 'Default' }, ...ColorTheme.definitions];
    for (const opt of allOptions) {
      const btn = document.createElement('button');
      const val = opt.value !== undefined ? opt.value : opt.id;
      btn.className = 'custom-select-option' + (val === raw ? ' active' : '');
      btn.dataset.value = val;
      const color = val === 'skin' ? resolvedColor('skin') : (opt.color || resolvedColor(val));
      btn.innerHTML = `<span class="color-dot" style="background:${color}"></span><span class="cs-label">${opt.label}</span>`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._onAccentChange(val);
        dropdown.classList.add('hidden');
      });
      dropdown.appendChild(btn);
    }

    wrap.appendChild(trigger);
    wrap.appendChild(dropdown);

    const closeDropdown = (e) => {
      if (!wrap.contains(e.target)) {
        dropdown.classList.add('hidden');
        document.removeEventListener('click', closeDropdown);
      }
    };
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const opening = dropdown.classList.contains('hidden');
      dropdown.classList.toggle('hidden');
      if (opening) {
        document.addEventListener('click', closeDropdown);
      } else {
        document.removeEventListener('click', closeDropdown);
      }
    });
  }

  _onAccentChange(id) {
    const ct = this.bridge.get('color-theme');
    if (ct) ct.setAccent(id);
    this._renderAccentSwatches();
  }

  static get redLetterShades() {
    return [
      { id: 'blush',       label: 'Blush',       color: '#F2A0A0' },
      { id: 'rose',        label: 'Rose',        color: '#E38080' },
      { id: 'soft-red',    label: 'Soft Red',    color: '#D06060' },
      { id: 'firebrick',   label: 'Firebrick',   color: '#B22222' },
      { id: 'rich-red',    label: 'Rich Red',    color: '#C61414' },
      { id: 'bright-red',  label: 'Bright Red',  color: '#DA0A0A' },
      { id: 'vivid-red',   label: 'Vivid Red',   color: '#EE0000' },
    ];
  }

  _renderRedLetterSwatches() {
    const container = document.getElementById('settings-red-letter-swatches');
    if (!container) return;
    const enabled = this.bridge.state.get('redLetter');
    container.style.display = enabled ? 'flex' : 'none';
    if (container.parentElement) {
      container.parentElement.style.display = enabled ? '' : 'none';
    }
    const current = this.bridge.state.get('redLetterColor') || '#B22222';
    container.innerHTML = '';
    for (const s of SettingsModule.redLetterShades) {
      const btn = document.createElement('button');
      btn.className = 'accent-swatch' + (s.color === current ? ' active' : '');
      btn.style.background = s.color;
      btn.setAttribute('aria-label', s.label);
      btn.dataset.color = s.color;
      btn.addEventListener('click', () => this._onRedLetterColorClick(s.color));
      container.appendChild(btn);
    }
  }

  _onRedLetterColorClick(color) {
    this.bridge.state.set('redLetterColor', color);
    this._applyRedLetterColor();
    this._renderRedLetterSwatches();
  }

  _applyRedLetterColor() {
    const color = this.bridge.state.get('redLetterColor') || '#B22222';
    document.documentElement.style.setProperty('--wj-color', color);
  }

  _initEventListeners() {

    document.getElementById('settings-close').addEventListener('click', () => this.closeSettings());
    document.getElementById('settings-overlay').addEventListener('click', () => this.closeSettings());

    document.getElementById('settings-theme').addEventListener('change', (e) => this.setTheme(e.target.value));
    document.getElementById('settings-background-texture').addEventListener('change', (e) => this._setToggle('backgroundTexture', e.target.checked));
    document.getElementById('settings-bionic').addEventListener('change', (e) => this._setToggle('bionic', e.target.checked));
    document.getElementById('settings-red-letter').addEventListener('change', (e) => {
      this._setToggle('redLetter', e.target.checked);
      this._renderRedLetterSwatches();
      this._applyRedLetterColor();
    });
    document.getElementById('settings-footnotes').addEventListener('change', (e) => this._setToggle('footnotes', e.target.checked));
    document.getElementById('settings-chapter-title').addEventListener('change', (e) => this._setToggle('chapterTitle', e.target.checked));
    document.getElementById('settings-section-headings').addEventListener('change', (e) => this._setToggle('sectionHeadings', e.target.checked));
    document.getElementById('settings-ui-skin').addEventListener('change', (e) => {
      const skin = e.target.value;
      this.bridge.state.set('uiSkin', skin);
      window.UISkins.apply(skin);
      this._applyTextSettings();
      this.bridge.emit('render:refresh');
    });
    document.getElementById('settings-poetry').addEventListener('change', (e) => this._setToggle('poetryFormatting', e.target.checked));
    document.getElementById('settings-paragraph-mode').addEventListener('change', (e) => {
      this.bridge.state.set('paragraphMode', e.target.checked);
      this.bridge.state.set('paragraphBreaks', e.target.checked);
      this._syncSwipeMaxVersesVisibility(e.target.checked);
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
    document.getElementById('settings-chapter-header-alignment').addEventListener('change', (e) => this._setChapterHeaderAlignment(e.target.value));
    document.getElementById('settings-section-heading-alignment').addEventListener('change', (e) => this._setSectionHeadingAlignment(e.target.value));
    document.getElementById('settings-verse-text-alignment').addEventListener('change', (e) => this._setVerseTextAlignment(e.target.value));
    document.getElementById('settings-verse-number-placement').addEventListener('change', (e) => this._setVerseNumberPlacement(e.target.value));
    document.getElementById('settings-swipe-max-verses').addEventListener('input', (e) => this._setSwipeMaxVerses(parseInt(e.target.value, 10)));

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

  closeSettings() {
    this.settingsOpen = false;
    document.getElementById('settings-panel').classList.remove('open');
    document.getElementById('settings-overlay').classList.remove('open');
    document.querySelectorAll('.section-header').forEach(h => h.setAttribute('aria-expanded', 'false'));
    if (this._cleanupFocus) { this._cleanupFocus(); this._cleanupFocus = null; }
  }

  _resolveTheme(raw) {
    return window.UISkins ? window.UISkins.resolveSetting('theme', raw) : (raw === 'skin' ? 'dark' : raw);
  }

  _resolveFont(raw) {
    return window.UISkins ? window.UISkins.resolveSetting('fontFamily', raw) : (raw === 'skin' ? 'inter' : raw);
  }

  setTheme(name) {
    this.bridge.state.set('theme', name);
    const resolved = this._resolveTheme(name);
    document.documentElement.dataset.theme = resolved;
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
    const saved = this.bridge.state.get('accent');
    if (!saved || saved === 'skin') {
      const defaultAccent = accentMap[name] || 'gold';
      const ct = this.bridge.get('color-theme');
      if (ct) {
        ct.apply(defaultAccent);
        this.bridge.state.set('accent', 'skin');
      }
    }
    this._syncAppIcon(name);
    this._renderAccentSwatches();
  }

  _syncAppIcon(theme) {
    const lightThemes = ['light', 'sepia', 'icy-wind', 'clay'];
    const src = lightThemes.includes(theme)
      ? '/assets/icons/app/icon-light.svg'
      : '/assets/icons/app/icon-dark.svg';
    document.querySelectorAll('.app-icon').forEach(el => el.src = src);
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
      const resp = await fetch('whats_new.md');
      const md = await resp.text();
      const lines = md.split('\n');
      let html = '';
      let inList = false;
      const escapeInline = (text) => {
        const parts = text.split(/(`[^`]+`)/g);
        return parts.map(p => {
          if (p.startsWith('`') && p.endsWith('`')) return '<code>' + window.HTMLEscape(p.slice(1, -1)) + '</code>';
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
    return window.HTMLEscape(str);
  }

  _syncBionicStrengthVisibility(enabled) {
    const row = document.getElementById('settings-strength')?.closest('.setting-row');
    if (row) row.style.display = enabled ? '' : 'none';
  }

  _updateRangeFill(input) {
    const min = parseFloat(input.min) || 0;
    const max = parseFloat(input.max) || 1;
    const val = parseFloat(input.value);
    const pct = ((val - min) / (max - min)) * 100;
    input.style.setProperty('--range-pct', pct + '%');
  }

  _syncSwipeMaxVersesVisibility(enabled) {
    const row = document.getElementById('swipe-max-verses-row');
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

  _setSwipeMaxVerses(value) {
    this.bridge.state.set('swipeMaxVerses', value);
    document.getElementById('settings-swipe-max-verses-label').textContent = value;
    this._updateRangeFill(document.getElementById('settings-swipe-max-verses'));
    this.bridge.emit('render:refresh');
  }

  _setBionicStrength(value) {
    this.bridge.state.set('bionicStrength', value);
    document.getElementById('settings-strength-label').textContent = Math.round(value * 100) + '%';
    this._updateRangeFill(document.getElementById('settings-strength'));
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
    this._updateRangeFill(document.getElementById('settings-font-size'));
    this._applyTextSettings();
  }

  _setMargins(value) {
    this.bridge.state.set('margins', value);
    document.getElementById('settings-margins-label').textContent = value.toFixed(1);
    this._updateRangeFill(document.getElementById('settings-margins'));
    this._applyTextSettings();
  }

  _setLineSpacing(value) {
    this.bridge.state.set('lineSpacing', value);
    document.getElementById('settings-line-spacing-label').textContent = value.toFixed(1);
    this._updateRangeFill(document.getElementById('settings-line-spacing'));
    this._applyTextSettings();
  }

  _setLetterSpacing(value) {
    this.bridge.state.set('letterSpacing', value);
    document.getElementById('settings-letter-spacing-label').textContent = value.toFixed(3);
    this._updateRangeFill(document.getElementById('settings-letter-spacing'));
    this._applyTextSettings();
  }

  _setChapterHeaderAlignment(value) {
    this.bridge.state.set('chapterHeaderAlignment', value);
    this._applyTextSettings();
  }

  _setSectionHeadingAlignment(value) {
    this.bridge.state.set('sectionHeadingAlignment', value);
    this._applyTextSettings();
  }

  _setVerseTextAlignment(value) {
    this.bridge.state.set('verseTextAlignment', value);
    this._applyTextSettings();
  }

  _setVerseNumberPlacement(value) {
    this.bridge.state.set('verseNumberPlacement', value);
    this._applyTextSettings();
  }

  _applyTextSettings() {
    this.bridge.get('typography')?.applyVisualSettings();
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
      fontFamily: 'skin',
      fontSize: 1.083,
      margins: 1.0,
      lineSpacing: 1.8,
      letterSpacing: 0.005,
      bionic: false,
      bionicStrength: 0.45,
      focusMode: false,
      swipeAnimDir: 'vertical',
      redLetter: true,
      redLetterColor: '#B22222',
      footnotes: true,
      chapterTitle: true,
      sectionHeadings: true,
      poetryFormatting: true,
      paragraphBreaks: false,
      paragraphMode: false,
      swipeMaxVerses: 4,
      backgroundTexture: true,
      chapterHeaderAlignment: 'skin',
      sectionHeadingAlignment: 'skin',
      verseTextAlignment: 'skin',
      verseNumberPlacement: 'skin'
    });
    const ct = this.bridge.get('color-theme');
    if (ct) ct.apply('gold');
    document.documentElement.dataset.theme = 'dark';
    this._syncUIFromState();
    this._applyRedLetterColor();
    this.bridge.emit('render:refresh');
  }

  resetApp() {
    if (!confirm('This will reset ALL data including notes, categories, bookmarks, highlights, and reading position. This cannot be undone. Continue?')) return;
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
      if (window.idb && window.idb._db) window.idb._db.close();
      if (window.syncService && window.syncService._db) window.syncService._db.close();
    } catch (e) {
      console.warn('[Settings] Error closing DB connections:', e);
    }
    const st = this.bridge.state;
    st.notes = [];
    st.plans = [];
    st.noteCategories = [];
    st.bookmarks = [];
    st.highlights = [];
    st.bookmarkSets = [];
    try {
      const dbs = ['focused_word_db', 'FocusedSyncDB'];
      let succeeded = 0;
      for (const name of dbs) {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = () => {
          if (++succeeded === dbs.length) location.reload();
        };
        req.onerror = () => {
          alert('Failed to delete database "' + name + '". Close other tabs and try Reset App again.');
        };
        req.onblocked = () => {
          alert('Reset blocked. Close all other Focused Word tabs/windows, then click Reset App again.');
        };
      }
    } catch (e) {
      console.warn('[Settings] Error deleting databases:', e);
      alert('Reset failed. Close other tabs and try again, or reload manually.');
    }
  }

  toggleMode(mode) {
    const state = this.bridge.state;
    const speed = this.bridge.get('renderer-speed');

    if (state.get(mode)) {
      state.batch({ swipeMode: false, spotlightMode: false, speedMode: false, splitMode: false });
      if (mode === 'speedMode' && speed) speed.stop();
    } else {
      const modes = { swipeMode: false, spotlightMode: false, speedMode: false, splitMode: false };
      modes[mode] = true;
      state.batch(modes);
    }

    this.bridge.emit('render:refresh');
  }

};
