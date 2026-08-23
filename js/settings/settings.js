window.SettingsModule = class SettingsModule {
  constructor(bridge) {
    this.bridge = bridge;
    this.settingsOpen = false;
    this._wpmTimer = null;
    this._cleanupFocus = null;
    this._wcKeyOpen = false;
    this._expandedClasses = new Set();
    this._wcHandler = null;
  }

  init() {
    this._initEventListeners();
    this._syncUIFromState();
    this._preloadStudyVocabulary();
    this._refreshWcWhenReady();
  }

  _preloadStudyVocabulary() {
    const wc = this.bridge.get('word-class-service');
    if (!wc || this.bridge.state.get('currentTranslation') !== 'BSB') return;
    wc.preloadVocabulary().then(() => {
      this._renderStudySection();
      if (this._wcKeyOpen) this.openStudyInfo('word-classes');
      // Also refresh once the full annotation DB finishes loading, in case the
      // compact vocabulary JSON and DB-driven vocabulary diverge.
      if (!wc.isReady && !this._wcReadyPoller) {
        this._wcReadyPoller = setInterval(() => {
          if (wc.isReady) {
            clearInterval(this._wcReadyPoller);
            this._wcReadyPoller = null;
            this._renderStudySection();
            if (this._wcKeyOpen) this.openStudyInfo('word-classes');
          }
        }, 250);
        setTimeout(() => {
          if (this._wcReadyPoller) {
            clearInterval(this._wcReadyPoller);
            this._wcReadyPoller = null;
          }
        }, 30000);
      }
    });
  }

  _refreshWcWhenReady() {
    const wc = this.bridge.get('word-class-service');
    if (!wc || wc.isReady) return;
    if (this.bridge.state.get('currentTranslation') !== 'BSB') return;
    // Only pre-warm the (large) annotation DB when a word feature is active.
    // Otherwise it loads lazily the first time word classes / word study are
    // enabled or the study panel is opened.
    const s = this.bridge.state;
    if (s.get('wordClasses') !== true && s.get('wordStudyEnabled') !== true && s.get('clearReadingEnabled') !== true) return;
    wc.init(this.bridge).then(() => this._renderStudySection());
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
    const wsCb = document.getElementById('settings-word-study');
    if (wsCb) wsCb.checked = state.get('wordStudyEnabled') === true;
    document.getElementById('settings-word-classes').checked = state.get('wordClasses') === true;
    const crCb = document.getElementById('settings-clear-reading');
    if (crCb) crCb.checked = state.get('clearReadingEnabled') === true;
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
    this._renderStudySection();
    this._applyTextSettings();
  }

  _renderAccentSwatches() {
    const wrap = document.getElementById('settings-accent-wrap');
    if (!wrap) return;
    this._closeAccentDropdown();
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
    dropdown.style.position = 'fixed';

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
      });
      dropdown.appendChild(btn);
    }

    wrap.appendChild(trigger);
    document.body.appendChild(dropdown);
    wrap._accentDropdown = dropdown;

    const positionDropdown = () => {
      const rect = trigger.getBoundingClientRect();
      dropdown.style.top = (rect.bottom + 4) + 'px';
      dropdown.style.left = rect.left + 'px';
      dropdown.style.width = rect.width + 'px';
    };

    const closeDropdown = (e) => {
      if (e && (wrap.contains(e.target) || dropdown.contains(e.target))) return;
      this._closeAccentDropdown();
    };
    const onScrollOrResize = () => {
      if (!dropdown.classList.contains('hidden')) positionDropdown();
    };

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const opening = dropdown.classList.contains('hidden');
      if (opening) {
        if (!dropdown.parentElement) document.body.appendChild(dropdown);
        dropdown.classList.remove('hidden');
        positionDropdown();
        trigger.dataset.open = 'true';
        document.addEventListener('click', closeDropdown, true);
        window.addEventListener('scroll', onScrollOrResize, true);
        window.addEventListener('resize', onScrollOrResize);
        this._accentCloseHandler = closeDropdown;
        this._accentOnScroll = onScrollOrResize;
        this._accentOnResize = onScrollOrResize;
      } else {
        this._closeAccentDropdown();
      }
    });
  }

  _closeAccentDropdown() {
    const wrap = document.getElementById('settings-accent-wrap');
    if (!wrap) return;
    const dropdown = wrap._accentDropdown;
    if (dropdown) {
      dropdown.classList.add('hidden');
      if (dropdown.parentElement) dropdown.parentElement.removeChild(dropdown);
    }
    wrap._accentDropdown = null;
    if (this._accentCloseHandler) {
      document.removeEventListener('click', this._accentCloseHandler, true);
      window.removeEventListener('scroll', this._accentOnScroll, true);
      window.removeEventListener('resize', this._accentOnResize);
      this._accentCloseHandler = null;
      this._accentOnScroll = null;
      this._accentOnResize = null;
    }
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
      { id: 'crimson',     label: 'Crimson',     color: '#C64C4C' },
      { id: 'rust',        label: 'Rust',        color: '#C14141' },
      { id: 'garnet',      label: 'Garnet',      color: '#BC3636' },
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
    const current = this.bridge.state.get('redLetterColor') || '#BC3636';
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

  _renderStudySection() {
    const wrap = document.getElementById('study-category-colors');
    if (!wrap) return;
    const state = this.bridge.state;
    const wordClasses = state.get('wordClasses');
    wrap.style.display = wordClasses ? '' : 'none';
    if (!wordClasses) return;

    this._renderStudySectionV2(wrap, state);
  }

  _renderStudySectionV2(wrap, state) {
    const settings = state.get('wordClassAxisSettings') || null;
    const wc = this.bridge.get('word-class-service');
    const groups = wc && wc.getAxisSettings ? wc.getAxisSettings() : null;
    if (!groups || !groups.length) {
      wrap.dataset.backend = 'v2';
      wrap.innerHTML = '<div class="study-category-hint">Word annotations are still loading. Open Settings again shortly to adjust colors.</div>';
      return;
    }
    const anyEnabled = groups.some(g => g.enabled);

    let html = '<div class="study-category-row">';
    html += '<div class="study-category-label"><span>All Classes</span></div>';
    html += '<div class="study-category-actions">';
    html += '<label class="toggle-label-wrapper" style="margin:0">';
    html += '<input type="checkbox" id="study-all-toggle" class="toggle-checkbox"' + (anyEnabled ? ' checked' : '') + '>';
    html += '<span class="toggle-pill"></span></label>';
    html += '</div></div>';

    for (const group of groups) {
      html += '<div class="study-category-row study-axis-group' + (group.enabled ? '' : ' muted') + '" data-axis="' + window.HTMLEscape(group.axis) + '">';
      html += '<div class="study-category-label"><span>' + window.HTMLEscape(group.label) + '</span></div>';
      html += '<div class="study-category-actions">';
      html += '<label class="toggle-label-wrapper" style="margin:0">';
      html += '<input type="checkbox" class="toggle-checkbox study-axis-toggle" data-axis="' + window.HTMLEscape(group.axis) + '"' + (group.enabled ? ' checked' : '') + '>';
      html += '<span class="toggle-pill"></span></label>';
      html += '</div></div>';
      for (const v of group.values) {
        const isOverridden = settings && settings.colors && settings.colors[v.key] !== undefined
          && settings.colors[v.key].toUpperCase() !== WordClassService.getAxisDefaultColor(group.axis, v.value).toUpperCase();
        html += '<div class="study-sub-row">';
        html += '<span class="study-sub-name" style="color:inherit"><span class="study-cat-dot" style="background:' + window.HTMLEscape(v.color) + '" id="study-dot-' + v.key + '"></span>' + window.HTMLEscape(v.label) + '</span>';
        html += '<div class="study-category-actions">';
        html += '<label class="toggle-label-wrapper" style="margin:0">';
        html += '<input type="checkbox" class="toggle-checkbox study-cat-toggle" data-axis="' + window.HTMLEscape(group.axis) + '" data-value="' + window.HTMLEscape(v.value) + '"' + (v.enabled ? ' checked' : '') + '>';
        html += '<span class="toggle-pill"></span></label>';
        html += '<input type="color" class="study-cat-color-input" data-axis="' + window.HTMLEscape(group.axis) + '" data-value="' + window.HTMLEscape(v.value) + '" value="' + window.HTMLEscape(v.hex || v.color) + '" title="Change color">';
        html += '<button class="study-cat-reset" data-axis="' + window.HTMLEscape(group.axis) + '" data-value="' + window.HTMLEscape(v.value) + '" title="Reset to default"' + (isOverridden ? '' : ' style="visibility:hidden"') + '>↺</button>';
        html += '</div></div>';
      }
    }

    wrap.dataset.backend = 'v2';
    wrap.innerHTML = html;
    this._initStudyListeners();
  }

  _handleStudyV2Change(e, wrap) {
    const state = this.bridge.state;

    const allToggle = e.target.closest('#study-all-toggle');
    if (allToggle) {
      const enabled = allToggle.checked;
      const wc = this.bridge.get('word-class-service');
      const groups = wc && wc.getAxisSettings ? wc.getAxisSettings() : null;
      if (!groups) return;
      const current = Object.assign({}, state.get('wordClassAxisSettings') || {});
      const axes = {};
      const values = {};
      for (const g of groups) {
        axes[g.axis] = enabled;
        for (const v of g.values) values[v.key] = enabled;
      }
      current.axes = axes;
      current.values = values;
      state.set('wordClassAxisSettings', (current.values || current.colors || current.axes) ? current : null);
      wrap.querySelectorAll('.study-axis-toggle').forEach(t => t.checked = enabled);
      wrap.querySelectorAll('.study-cat-toggle').forEach(t => t.checked = enabled);
      wrap.querySelectorAll('.study-axis-group').forEach(row => row.classList.toggle('muted', !enabled));
      this.bridge.emit('render:refresh');
      return;
    }

    const axisToggle = e.target.closest('.study-axis-toggle[data-axis]');
    if (axisToggle) {
      const axis = axisToggle.dataset.axis;
      const wc = this.bridge.get('word-class-service');
      const groups = (wc && wc.getAxisSettings) ? wc.getAxisSettings() : [];
      const current = Object.assign({}, state.get('wordClassAxisSettings') || {});
      const axes = Object.assign({}, current.axes || {});
      axes[axis] = axisToggle.checked;
      current.axes = axes;
      // The axis master is a bulk switch: clear per-value overrides so the
      // whole group follows the master.
      const values = Object.assign({}, current.values || {});
      const g = groups.find(x => x.axis === axis);
      if (g) {
        for (const v of g.values) delete values[v.key];
      }
      if (Object.keys(values).length) current.values = values; else delete current.values;
      state.set('wordClassAxisSettings', (current.values || current.colors || current.axes) ? current : null);
      wrap.querySelectorAll('.study-axis-toggle[data-axis="' + axis + '"]').forEach(t => t.checked = axisToggle.checked);
      wrap.querySelectorAll('.study-cat-toggle[data-axis="' + axis + '"]').forEach(t => {
        const g2 = groups.find(x => x.axis === axis);
        const v = g2 && g2.values.find(x => x.value === t.dataset.value);
        t.checked = !!(v && v.enabled);
      });
      const row = wrap.querySelector('.study-axis-group[data-axis="' + axis + '"]');
      if (row) row.classList.toggle('muted', !axisToggle.checked);
      const all = document.getElementById('study-all-toggle');
      if (all) all.checked = groups.some(g2 => g2.enabled);
      this.bridge.emit('render:refresh');
      return;
    }

    const toggle = e.target.closest('.study-cat-toggle[data-axis]');
    if (toggle) {
      const key = toggle.dataset.axis + ':' + toggle.dataset.value;
      const current = Object.assign({}, state.get('wordClassAxisSettings') || {});
      const values = Object.assign({}, current.values || {});
      values[key] = toggle.checked;
      current.values = values;
      state.set('wordClassAxisSettings', (current.values || current.colors || current.axes) ? current : null);
      this.bridge.emit('render:refresh');
      return;
    }

    const colorInput = e.target.closest('.study-cat-color-input[data-axis]');
    if (colorInput) {
      const key = colorInput.dataset.axis + ':' + colorInput.dataset.value;
      const current = Object.assign({}, state.get('wordClassAxisSettings') || {});
      const colors = Object.assign({}, current.colors || {});
      colors[key] = colorInput.value;
      current.colors = colors;
      state.set('wordClassAxisSettings', current);
      const dot = document.getElementById('study-dot-' + key);
      if (dot) dot.style.background = colorInput.value;
      const resetBtn = colorInput.closest('.study-sub-row')?.querySelector('.study-cat-reset');
      if (resetBtn) {
        const def = WordClassService.getAxisDefaultColor(colorInput.dataset.axis, colorInput.dataset.value);
        resetBtn.style.visibility = (colorInput.value.toUpperCase() !== def.toUpperCase()) ? '' : 'hidden';
      }
      return;
    }

    const resetBtn = e.target.closest('.study-cat-reset[data-axis]');
    if (resetBtn) {
      const key = resetBtn.dataset.axis + ':' + resetBtn.dataset.value;
      const current = Object.assign({}, state.get('wordClassAxisSettings') || {});
      const colors = Object.assign({}, current.colors || {});
      delete colors[key];
      if (Object.keys(colors).length) current.colors = colors; else delete current.colors;
      state.set('wordClassAxisSettings', (current.values || current.colors || current.axes) ? current : null);
      const def = WordClassService.getAxisDefaultColor(resetBtn.dataset.axis, resetBtn.dataset.value);
      const dot = document.getElementById('study-dot-' + key);
      if (dot) dot.style.background = WordClassService.getAxisColor(resetBtn.dataset.axis, resetBtn.dataset.value, null);
      const input = wrap.querySelector('.study-cat-color-input[data-axis="' + resetBtn.dataset.axis + '"][data-value="' + resetBtn.dataset.value + '"]');
      if (input) input.value = def;
      resetBtn.style.visibility = 'hidden';
      return;
    }
  }

  _initStudyListeners() {
    const wrap = document.getElementById('study-category-colors');
    if (!wrap) return;

    if (this._wcHandler) {
      wrap.removeEventListener('change', this._wcHandler);
      wrap.removeEventListener('click', this._wcHandler);
    }

    this._wcHandler = (e) => {
      this._handleStudyV2Change(e, wrap);
    };

    wrap.addEventListener('change', this._wcHandler);
    wrap.addEventListener('click', this._wcHandler);
  }

  async _onWordClassesToggle(enabled) {
    this.bridge.state.set('wordClasses', enabled);
    this._renderStudySection();
    if (enabled) {
      const loading = document.getElementById('wc-loading');
      if (loading) loading.classList.add('visible');
      try {
        const wc = this.bridge.get('word-class-service');
        if (wc && !wc.isReady) {
          await wc.init(this.bridge);
          this._renderStudySection();
        }
        const nav = this.bridge.get('navigation');
        if (nav) {
          const state = this.bridge.state;
          await nav.loadChapter(state.get('currentBook'), state.get('currentChapter'));
        } else {
          this.bridge.emit('render:refresh');
        }
      } finally {
        if (loading) loading.classList.remove('visible');
      }
      return;
    }
    const nav = this.bridge.get('navigation');
    if (nav) {
      const state = this.bridge.state;
      await nav.loadChapter(state.get('currentBook'), state.get('currentChapter'));
    } else {
      this.bridge.emit('render:refresh');
    }
  }

  async _onWordStudyToggle(enabled) {
    const state = this.bridge.state;
    const loading = document.getElementById('ws-loading');
    const wc = this.bridge.get('word-class-service');
    const ws = this.bridge.get('word-study-service');

    if (enabled) {
      if (loading) loading.classList.add('visible');
      try {
        if (wc && !wc.isReady) {
          await wc.init(this.bridge);
        }
        if (ws && !ws.dataReady) {
          const ok = await ws.initDataDb();
          if (!ok) throw new Error('bsb_word_data failed to load');
          await ws.initLexDb();
        }
        state.set('wordStudyEnabled', true);
        state.set('wordStudyMode', true);
        const nav = this.bridge.get('navigation');
        if (nav) {
          await nav.loadChapter(state.get('currentBook'), state.get('currentChapter'));
        } else {
          this.bridge.emit('render:refresh');
        }
      } catch (e) {
        console.error('[WordStudy] enable failed:', e);
        state.set('wordStudyEnabled', false);
        state.set('wordStudyMode', false);
        if (ws) ws.destroy();
      } finally {
        if (loading) loading.classList.remove('visible');
      }
      return;
    }

    state.set('wordStudyEnabled', false);
    state.set('wordStudyMode', false);
    if (ws) ws.destroy();
    const nav = this.bridge.get('navigation');
    if (nav) {
      await nav.loadChapter(state.get('currentBook'), state.get('currentChapter'));
    } else {
      this.bridge.emit('render:refresh');
    }
  }

  async _onClearReadingToggle(enabled) {
    const state = this.bridge.state;
    const loading = document.getElementById('cr-loading');
    if (enabled) {
      if (loading) loading.classList.add('visible');
      try {
        const wc = this.bridge.get('word-class-service');
        if (wc && !wc.isReady) {
          await wc.init(this.bridge);
        }
        if (state.get('clearReadingMode') === 'off') {
          state.set('clearReadingMode', 'soft');
        }
        state.set('clearReadingEnabled', true);
        const nav = this.bridge.get('navigation');
        if (nav) {
          await nav.loadChapter(state.get('currentBook'), state.get('currentChapter'));
        } else {
          this.bridge.emit('render:refresh');
        }
      } catch (e) {
        console.error('[ClearReading] enable failed:', e);
        state.set('clearReadingEnabled', false);
      } finally {
        if (loading) loading.classList.remove('visible');
      }
      return;
    }

    state.set('clearReadingEnabled', false);
    const nav = this.bridge.get('navigation');
    if (nav) {
      await nav.loadChapter(state.get('currentBook'), state.get('currentChapter'));
    } else {
      this.bridge.emit('render:refresh');
    }
  }

  _applyRedLetterColor() {
    const color = this.bridge.state.get('redLetterColor') || '#BC3636';
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
      this._renderAccentSwatches();
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
    document.getElementById('settings-word-classes').addEventListener('change', (e) => this._onWordClassesToggle(e.target.checked));
    document.getElementById('settings-word-study').addEventListener('change', (e) => this._onWordStudyToggle(e.target.checked));
    document.getElementById('settings-clear-reading').addEventListener('change', (e) => this._onClearReadingToggle(e.target.checked));
    const studyInfo = {
      'study-info-word-classes': 'word-classes',
      'study-info-word-study': 'word-study',
      'study-info-clear-reading': 'clear-reading',
    };
    Object.entries(studyInfo).forEach(([id, feature]) => {
      const infoBtn = document.getElementById(id);
      if (infoBtn) infoBtn.addEventListener('click', (e) => { e.stopPropagation(); this.openStudyInfo(feature); });
    });
    document.getElementById('wckey-close').addEventListener('click', (e) => { e.stopPropagation(); this._closeWordClassKey(); });
    document.getElementById('wckey-overlay').addEventListener('click', () => this._closeWordClassKey());
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
    document.getElementById('view-license').addEventListener('click', (e) => { e.preventDefault(); this._openLicense(); });
    document.getElementById('view-credits').addEventListener('click', (e) => { e.preventDefault(); this._openCredits(); });
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
    const panel = document.getElementById('settings-panel');
    const overlay = document.getElementById('settings-overlay');
    // Capture the element that opened settings so focus restores to the
    // correct trigger (More tab) instead of hardcoding the bible button,
    // which left a :focus-visible ring on the bible button after skin switches on iOS/Android.
    const rawOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const opener = (rawOpener && rawOpener !== document.body && document.body.contains(rawOpener) && !rawOpener.closest('[aria-hidden="true"][inert]'))
      ? rawOpener
      : document.querySelector('.tab-item[data-tab="more"]');
    panel.classList.add('open');
    overlay.classList.add('open');
    panel.removeAttribute('aria-hidden');
    panel.inert = false;
    overlay.removeAttribute('aria-hidden');
    const base = this.bridge.get('base-renderer');
    if (base) {
      this._cleanupFocus = base.trapFocus(panel, opener, document.querySelector('#settings-panel .section-header'));
    }
  }

  closeSettings() {
    this.settingsOpen = false;
    const panel = document.getElementById('settings-panel');
    const overlay = document.getElementById('settings-overlay');
    panel.classList.remove('open');
    overlay.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    panel.inert = true;
    overlay.setAttribute('aria-hidden', 'true');
    this._closeAccentDropdown();
    document.querySelectorAll('.section-header').forEach(h => h.setAttribute('aria-expanded', 'false'));
    if (this._cleanupFocus) { this._cleanupFocus(); this._cleanupFocus = null; }
  }

  _confirmDialog(options) {
    if (window.dialogService) return window.dialogService.confirm(options);
    return Promise.resolve(window.confirm(options.message || ''));
  }

  _alertDialog(options) {
    if (window.dialogService) return window.dialogService.alert(options);
    window.alert(options.message || '');
    return Promise.resolve(true);
  }

  _renderModeChange() {
    const render = () => this.bridge.emit('render:refresh');
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || typeof document.startViewTransition !== 'function') {
      render();
      return;
    }

    try {
      const transition = document.startViewTransition(render);
      transition.finished.catch(() => {});
    } catch (_) {
      render();
    }
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
    const saved = this.bridge.state.get('accent');
    if (!saved || saved === 'skin') {
      const defaultAccent = name === 'skin'
        ? (window.UISkins ? (UISkins.resolvePreference('accent') || 'gold') : 'gold')
        : (ColorTheme.themeAccentMap[name] || 'gold');
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

  _openModalPanel(opts) {
    const panel = opts.panel;
    const overlay = opts.overlay;
    if (!panel || !overlay) return;
    if (opts.title) {
      const titleEl = opts.title();
      if (titleEl) titleEl.textContent = opts.titleText;
    }
    const prevFocus = document.activeElement;
    this._openModalState = {
      panel,
      overlay,
      prevFocus: prevFocus instanceof Element ? prevFocus : null,
      cleanup: null,
    };
    panel.removeAttribute('inert');
    panel.setAttribute('aria-hidden', 'false');
    overlay.removeAttribute('aria-hidden');
    if (opts.openClass) {
      overlay.classList.add(opts.openClass);
      panel.classList.add(opts.openClass);
    } else {
      overlay.classList.remove('hidden');
      panel.classList.remove('hidden');
    }
    const base = this.bridge.get('base-renderer');
    if (base && typeof base.trapFocus === 'function') {
      this._openModalState.cleanup = base.trapFocus(panel, null);
    } else {
      setTimeout(() => {
        const focusable = panel.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        focusable?.focus();
      }, 50);
    }
    if (opts.closeButton) {
      opts.closeButton.onclick = () => opts.close();
    }
    if (opts.overlayClick !== false) {
      overlay.onclick = () => opts.close();
    }
    this._modalEscapeHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        opts.close();
      }
    };
    document.addEventListener('keydown', this._modalEscapeHandler);
  }

  _closeModalPanel() {
    const state = this._openModalState;
    if (!state) return;
    state.panel.setAttribute('inert', '');
    state.panel.setAttribute('aria-hidden', 'true');
    state.overlay.setAttribute('aria-hidden', 'true');
    if (state.panel.classList.contains('open')) {
      state.panel.classList.remove('open');
      state.overlay.classList.remove('open');
    } else {
      state.panel.classList.add('hidden');
      state.overlay.classList.add('hidden');
    }
    if (state.cleanup) state.cleanup();
    if (this._modalEscapeHandler) {
      document.removeEventListener('keydown', this._modalEscapeHandler);
      this._modalEscapeHandler = null;
    }
    if (state.prevFocus && state.prevFocus.isConnected) {
      state.prevFocus.focus();
    }
    this._openModalState = null;
  }

  async _openChangelog() {
    const body = document.getElementById('changelog-body');
    const panel = document.getElementById('changelog-panel');
    const overlay = document.getElementById('changelog-overlay');
    if (!body || !panel || !overlay) return;
    body.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--text-muted)">Loading...</div>';
    this._openModalPanel({
      panel,
      overlay,
      openClass: 'open',
      closeButton: document.getElementById('changelog-close'),
      close: () => this._closeChangelog(),
    });
    try {
      const resp = await fetch('whats_new.md');
      const md = await resp.text();
      body.innerHTML = this._renderMarkdown(md);
    } catch (e) {
      body.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--error-text)">Failed to load changelog.</div>';
    }
  }

  _closeChangelog() {
    this._closeModalPanel();
  }

  async _openLicense() {
    const body = document.getElementById('license-body');
    const panel = document.getElementById('license-panel');
    const overlay = document.getElementById('license-overlay');
    if (!body || !panel || !overlay) return;
    body.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--text-muted)">Loading...</div>';
    this._openModalPanel({
      panel,
      overlay,
      openClass: 'open',
      closeButton: document.getElementById('license-close'),
      close: () => this._closeLicense(),
    });
    try {
      const resp = await fetch('LICENSE.md');
      const md = await resp.text();
      const html = this._renderMarkdown(md);
      body.innerHTML = html;
    } catch (e) {
      body.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--error-text)">Failed to load license.</div>';
    }
  }

  _closeLicense() {
    this._closeModalPanel();
  }

  async _openCredits() {
    const body = document.getElementById('credits-body');
    const panel = document.getElementById('credits-panel');
    const overlay = document.getElementById('credits-overlay');
    if (!body || !panel || !overlay) return;
    body.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--text-muted)">Loading...</div>';
    this._openModalPanel({
      panel,
      overlay,
      openClass: 'open',
      closeButton: document.getElementById('credits-close'),
      close: () => this._closeCredits(),
    });
    try {
      const resp = await fetch('THIRD_PARTY_NOTICES.md');
      const md = await resp.text();
      body.innerHTML = this._renderMarkdown(md);
    } catch (e) {
      body.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--error-text)">Failed to load credits.</div>';
    }
  }

  _closeCredits() {
    this._closeModalPanel();
  }

  _renderMarkdown(md) {
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
    const isTableRow = (t) => t.startsWith('|') && t.endsWith('|') && t.indexOf('|', 1) !== -1;
    const isTableSep = (t) => /^\|[\s\-:|]+\|$/.test(t);
    const cells = (row) => row.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) { closeList(); html += '<br>'; continue; }

      if (isTableRow(trimmed)) {
        const rows = [];
        while (i < lines.length && isTableRow(lines[i].trim())) {
          rows.push(lines[i].trim());
          i++;
        }
        i--;
        closeList();
        if (rows.length >= 2 && isTableSep(rows[1])) {
          html += '<table><thead><tr>' + cells(rows[0]).map(c => '<th>' + escapeInline(c) + '</th>').join('') + '</tr></thead><tbody>';
          for (let r = 2; r < rows.length; r++) {
            html += '<tr>' + cells(rows[r]).map(c => '<td>' + escapeInline(c) + '</td>').join('') + '</tr>';
          }
          html += '</tbody></table>';
        } else {
          for (const row of rows) html += '<p>' + escapeInline(row) + '</p>';
        }
        continue;
      }

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
    return html;
  }

  openStudyInfo(feature) {
    const body = document.getElementById('wckey-body');
    const title = document.getElementById('wckey-title');
    const panel = document.getElementById('wckey-panel');
    const overlay = document.getElementById('wckey-overlay');
    if (!body || !panel) return;

    const descriptions = {
      'word-study': {
        title: 'Word Study',
        body: '<p>Word Study gives you a closer look at a word in the Bible.</p><p>Tap a word to see its original form, pronunciation, grammar, Strong’s number, definitions, and other places where it appears.</p>',
      },
      'clear-reading': {
        title: 'Clear Reading',
        body: '<p>Clear Reading helps the main ideas in a passage stand out.</p><p>Choose Soft or Strong mode to reduce the emphasis of connecting words, articles, and other supporting words. You can adjust each type of word and keep important words such as negation easy to notice.</p>',
      },
    };

    if (feature !== 'word-classes') {
      const info = descriptions[feature];
      if (!info) return;
      if (title) title.textContent = info.title;
      body.innerHTML = info.body;
    } else {
      if (title) title.textContent = 'Word Classes';
      const wc = this.bridge.get('word-class-service');
      const groups = wc && wc.getAxisSettings ? wc.getAxisSettings() : null;
      let html = '<p>Word Classes add helpful colors to words in the BSB translation, making it easier to notice what a passage is talking about. Adjust the colors and labels in Settings &gt; Study.</p>';
      if (groups && groups.length) {
        html += '<div class="wckey-list">';
        for (const group of groups) {
          html += '<div class="wckey-group-name">' + window.HTMLEscape(group.label) + '</div>';
          for (const v of group.values) {
            html += '<div class="wckey-item">';
            html += '<span class="wckey-dot" style="background:' + window.HTMLEscape(v.color) + '"></span>';
            html += '<div class="wckey-info">';
            html += '<div class="wckey-name">' + window.HTMLEscape(v.label) + '</div>';
            html += '<div class="wckey-desc">' + window.HTMLEscape(v.definition || '') + '</div>';
            html += '</div></div>';
          }
        }
        html += '</div>';
      } else {
        html += '<p>Word Class colors are still loading. Open this again shortly to see the color guide.</p>';
      }
      body.innerHTML = html;
    }

    this._openModalPanel({
      panel,
      overlay,
      closeButton: document.getElementById('wckey-close'),
      close: () => this._closeWordClassKey(),
    });
    this._wcKeyOpen = true;
  }

  _closeWordClassKey() {
    this._closeModalPanel();
    this._wcKeyOpen = false;
  }

  _openDebugLog() {
    const panel = document.getElementById('debuglog-panel');
    const overlay = document.getElementById('debuglog-overlay');
    if (!panel || !overlay) return;
    this._openModalPanel({
      panel,
      overlay,
      openClass: 'open',
      closeButton: document.getElementById('debuglog-close'),
      close: () => this._closeDebugLog(),
    });
    this._renderDebugLog('all');
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
    this._closeModalPanel();
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
    this._scheduleRefresh();
  }

  _setBionicStrength(value) {
    this.bridge.state.set('bionicStrength', value);
    document.getElementById('settings-strength-label').textContent = Math.round(value * 100) + '%';
    this._updateRangeFill(document.getElementById('settings-strength'));
    this._scheduleRefresh();
  }

  _scheduleRefresh() {
    if (this._refreshTimer) return;
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = null;
      this.bridge.emit('render:refresh');
    }, 150);
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

  async resetSettings() {
    const confirmed = await this._confirmDialog({
      title: 'Reset settings',
      message: 'Reset all settings to their defaults?',
      confirmLabel: 'Reset Settings',
      danger: true
    });
    if (!confirmed) return;
    const state = this.bridge.state;
    document.body.classList.remove('focus-mode');
    state.batch({
      theme: 'skin',
      accent: 'skin',
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
      redLetterColor: '#BC3636',
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
      verseNumberPlacement: 'skin',
      wordClasses: false,
      clearReadingEnabled: false
    });
    const ct = this.bridge.get('color-theme');
    const resolvedTheme = this._resolveTheme('skin');
    document.documentElement.dataset.theme = resolvedTheme;
    const resolvedAccent = window.UISkins
      ? (UISkins.resolvePreference('accent') || 'gold')
      : 'gold';
    if (ct) ct.apply(resolvedAccent);
    this._syncUIFromState();
    this._applyRedLetterColor();
    this.bridge.emit('render:refresh');
  }

  async resetApp() {
    const confirmed = await this._confirmDialog({
      title: 'Reset app',
      message: 'This will reset ALL data including notes, categories, bookmarks, highlights, and reading position. This cannot be undone. Continue?',
      confirmLabel: 'Reset App',
      danger: true
    });
    if (!confirmed) return;
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
          this._alertDialog({
            title: 'Reset failed',
            message: 'Failed to delete database "' + name + '". Close other tabs and try Reset App again.'
          });
        };
        req.onblocked = () => {
          this._alertDialog({
            title: 'Reset blocked',
            message: 'Close all other Focused Word tabs/windows, then click Reset App again.'
          });
        };
      }
    } catch (e) {
      console.warn('[Settings] Error deleting databases:', e);
      this._alertDialog({
        title: 'Reset failed',
        message: 'Close other tabs and try again, or reload manually.'
      });
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

    this._renderModeChange();
  }

};
