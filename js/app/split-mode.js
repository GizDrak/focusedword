window.SplitMode = class SplitMode {
  constructor(bridge) {
    this.bridge = bridge;
    this._active = false;
    this._rightTranslation = null;
    this._savedModes = null;
    this._externalModeSwitch = false;
    this._verseUnsub = null;
    this._refreshUnsub = null;
    this._boundDocClick = null;
    this._bodyObserver = null;
  }

  init() {
    this._cacheEls();
    this._populateTranslationSelects();
    this._bindEvents();
    this._checkSplitMode();
    this._bodyObserver = new MutationObserver(() => this._checkSplitMode());
    this._bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  _cacheEls() {
    this._els = {
      panel: document.getElementById('panel-right'),
      panelBody: document.getElementById('panel-right-body'),
      leftTransBtn: document.getElementById('panel-left-translation-btn'),
      rightTransBtn: document.getElementById('panel-right-translation-btn'),
      leftTransDropdown: document.getElementById('panel-left-translation-dropdown'),
      rightTransDropdown: document.getElementById('panel-right-translation-dropdown'),
      content: document.getElementById('content'),
    };
  }

  repopulateSelectors() {
    this._populateTranslationSelects();
  }

  _populateTranslationSelects() {
    const manifest = this.bridge.translationManifest || [];

    if (manifest.length > 0) {
      [this._els.leftTransDropdown, this._els.rightTransDropdown].forEach(dd => {
        if (!dd) return;
        dd.innerHTML = '';
        manifest.forEach(t => {
          const item = document.createElement('button');
          item.className = 'translation-dropdown-item' + (t.available ? ' not-installed' : '');
          item.type = 'button';
          item.dataset.value = t.id || t.name;
          if (t.available) {
            item.dataset.available = '1';
            item.title = 'Not downloaded yet — select to download';
            item.setAttribute('aria-label', t.name + ' (not downloaded yet)');
            item.innerHTML = `<span class="tl-name">${window.HTMLEscape(t.name)}</span><span class="tl-install-hint" aria-hidden="true">⤓</span>`;
          } else {
            item.textContent = t.name;
          }
          dd.appendChild(item);
        });
      });
    }

    const currentTrans = this.bridge.state.get('currentTranslation');
    this._setBtnAbbr(this._els.leftTransBtn, currentTrans);
    this._rightTranslation = this._resolveRightTranslation(currentTrans);
    this._setBtnAbbr(this._els.rightTransBtn, this._rightTranslation || currentTrans);
  }

  // Downloads a not-yet-installed translation picked from either dropdown.
  // Returns true when it is ready to use (re-renders both dropdowns so the
  // entry flips to installed). Shows an alert and returns false on failure.
  async _ensureDropdownTranslation(item, entry) {
    if (item) {
      item.classList.add('downloading');
      const hint = item.querySelector('.tl-install-hint');
      if (hint) hint.textContent = '…';
    }
    let res = { ok: false, error: 'Repository helper unavailable' };
    try {
      const reposUi = this.bridge.get('scripture-repos-ui');
      if (reposUi && typeof reposUi.ensureTranslationReady === 'function') {
        res = await reposUi.ensureTranslationReady(entry);
      }
    } catch (e) {
      res = { ok: false, error: e.message || 'Download failed' };
    }
    if (!res.ok) {
      if (item) {
        item.classList.remove('downloading');
        const hint = item.querySelector('.tl-install-hint');
        if (hint) hint.textContent = '⤓';
      }
      if (window.dialogService && typeof window.dialogService.alert === 'function') {
        await window.dialogService.alert({
          title: 'Download failed',
          message: 'Could not download "' + entry.name + '": ' + (res.error || 'unknown error')
        });
      } else {
        console.error('[SplitMode] Translation download failed:', res.error);
      }
      return false;
    }
    this._populateTranslationSelects();
    return true;
  }

  _setBtnAbbr(btn, id) {
    if (!btn) return;
    const manifest = this.bridge.translationManifest || [];
    const entry = manifest.find(t => (t.id || t.name) === id);
    const label = entry ? (entry.shortname || entry.abbreviation || entry.id) : (id || '');
    const short = label.substring(0, 6);
    btn.textContent = short;
    btn.title = label;
  }

  _bindEvents() {
    const toggleDropdown = (btn, dd) => {
      if (!btn || !dd) return;
      const controller = window.PopoverService
        ? window.PopoverService.create(dd, {
            onChange: (open) => btn.setAttribute('aria-expanded', String(open))
          })
        : null;
      btn._translationPopover = controller;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        document.querySelectorAll('.translation-dropdown').forEach(d => {
          if (d === dd) return;
          if (window.PopoverService) window.PopoverService.create(d).hide();
          else d.classList.remove('open');
        });
        if (controller) controller.toggle();
        else dd.classList.toggle('open');
      });
    };
    toggleDropdown(this._els.leftTransBtn, this._els.leftTransDropdown);
    toggleDropdown(this._els.rightTransBtn, this._els.rightTransDropdown);

    this._boundDocClick = () => {
      [
        [this._els.leftTransBtn, this._els.leftTransDropdown],
        [this._els.rightTransBtn, this._els.rightTransDropdown]
      ].forEach(([btn, dd]) => {
        if (!dd || btn?._translationPopover?.native) return;
        dd.classList.remove('open');
        btn?.setAttribute('aria-expanded', 'false');
      });
    };
    if (!this._els.leftTransBtn?._translationPopover?.native || !this._els.rightTransBtn?._translationPopover?.native) {
      document.addEventListener('click', this._boundDocClick);
    }

    const selectFromDropdown = (btn, dd, onChange) => {
      if (!dd) return;
      dd.addEventListener('click', (e) => {
        const item = e.target.closest('.translation-dropdown-item');
        if (!item) return;
        if (btn._translationPopover) btn._translationPopover.hide();
        else dd.classList.remove('open');
        const val = item.dataset.value;
        this._setBtnAbbr(btn, val);
        onChange(val, item);
      });
    };
    selectFromDropdown(this._els.leftTransBtn, this._els.leftTransDropdown, (val, item) => {
      this._selectLeftTranslation(val, item);
    });
    selectFromDropdown(this._els.rightTransBtn, this._els.rightTransDropdown, async (val, item) => {
      const manifest = this.bridge.translationManifest || [];
      const entry = manifest.find(t => (t.id || t.name) === val);
      if (entry && entry.available) {
        const ok = await this._ensureDropdownTranslation(item, entry);
        if (!ok) {
          this._setBtnAbbr(this._els.rightTransBtn, this._rightTranslation || this.bridge.state.get('currentTranslation'));
          return;
        }
      }
      this._rightTranslation = val;
      localStorage.setItem('focused-word:split-right-translation', val);
      this._refreshRight().then(() => {
        const verse = this.bridge.state.get('currentVerse');
        if (verse) this._syncBothPanels(verse);
      });
    });

    this.bridge.on('nav:chapter-loaded', async () => {
      if (!this._active) return;
      this._syncLeftTransSelect();
      await this._refreshRight();
      const verse = this.bridge.state.get('currentVerse');
      if (verse) this._syncBothPanels(verse);
    });

    this._verseUnsub = this.bridge.state.onChange('currentVerse', (_, verse) => {
      if (!this._active || !verse) return;
      this._syncBothPanels(verse);
    });

    this._refreshUnsub = this.bridge.on('render:refresh', () => {
      if (!this._active) return;
      this._refreshRight().then(() => {
        const verse = this.bridge.state.get('currentVerse');
        if (verse) this._syncBothPanels(verse);
      });
    });
  }

  _resolveRightTranslation(currentTrans) {
    const manifest = this.bridge.translationManifest || [];

    const saved = localStorage.getItem('focused-word:split-right-translation');
    if (saved && manifest.some(t => (t.id || t.name) === saved)) return saved;

    if (this._rightTranslation && manifest.some(t => (t.id || t.name) === this._rightTranslation)) {
      return this._rightTranslation;
    }

    const alt = manifest.find(t => (t.id || t.name) !== currentTrans);
    return alt ? (alt.id || alt.name) : currentTrans;
  }

  async _selectLeftTranslation(val, item) {
    const currentTrans = this.bridge.state.get('currentTranslation');
    const manifest = this.bridge.translationManifest || [];
    const entry = manifest.find(t => (t.id || t.name) === val);
    if (entry && entry.available) {
      const ok = await this._ensureDropdownTranslation(item, entry);
      if (!ok) {
        this._setBtnAbbr(this._els.leftTransBtn, currentTrans);
        return;
      }
      this.bridge.state.set('currentTranslation', val);
      try {
        const initOk = await this.bridge.db.init(val);
        if (!initOk) {
          this.bridge.state.set('currentTranslation', currentTrans || 'BSB');
          this._setBtnAbbr(this._els.leftTransBtn, currentTrans);
          return;
        }
        const nav = this.bridge.get('navigation');
        if (nav) await nav.switchTranslation();
        this._syncLeftTransSelect();
      } catch (e) {
        console.error('[SplitMode] Translation switch failed:', e);
      }
      return;
    }
    this.bridge.state.set('currentTranslation', val);
  }

  _syncLeftTransSelect() {
    const current = this.bridge.state.get('currentTranslation');
    this._setBtnAbbr(this._els.leftTransBtn, current);
  }

  _checkSplitMode() {
    const active = document.body.classList.contains('split-mode');
    if (active && !this._active) {
      this._active = true;
      this._onActivate();
    } else if (!active && this._active) {
      this._active = false;
      this._onDeactivate();
    }
  }

  async _onActivate() {
    const state = this.bridge.state;
    const currentTrans = state.get('currentTranslation');

    this._setBtnAbbr(this._els.leftTransBtn, currentTrans);
    this._rightTranslation = this._resolveRightTranslation(currentTrans);
    this._setBtnAbbr(this._els.rightTransBtn, this._rightTranslation);

    // Save current reading mode to restore on exit
    this._savedModes = {
      spotlightMode: state.get('spotlightMode'),
      swipeMode: state.get('swipeMode'),
      speedMode: state.get('speedMode')
    };

    // Force spotlight navigation for split; clear swipe/speed so they don't
    // block the render pipeline
    state.batch({
      swipeMode: false,
      speedMode: false,
      spotlightMode: true,
      splitPortrait: window.innerHeight > window.innerWidth
    });

    // Re-render left panel with SpotlightRenderer
    this.bridge.emit('render:refresh');
    // Bind desktop events to the right panel immediately (before content loads)
    this._setupPanelEvents(this._els.panelBody);
    this._setupRightPanelPointerEvents();
    this._listenOrientation();
    await this._refreshRight();
    const verse = state.get('currentVerse');
    if (verse) this._syncBothPanels(verse);
  }

  /** Call before switching to speed/swipe/scroll so deactivate does not override the new mode. */
  prepareExternalModeSwitch() {
    this._externalModeSwitch = true;
  }

  _onDeactivate() {
    [this._els.leftTransBtn, this._els.rightTransBtn].forEach(btn => btn?._translationPopover?.hide());
    this._teardownPanelEvents(this._els.panelBody);
    this._teardownRightPanelPointerEvents();
    this._els.panelBody.innerHTML = '';
    this._unlistenOrientation();

    const state = this.bridge.state;

    if (this._externalModeSwitch) {
      // User explicitly chose another mode — don't restore saved modes
      this._externalModeSwitch = false;
      this._savedModes = null;
      state.set('splitPortrait', false);
    } else if (this._savedModes) {
      // Tapping Split off — restore the reading mode that was active before split
      state.batch({
        spotlightMode: this._savedModes.spotlightMode,
        swipeMode: this._savedModes.swipeMode,
        speedMode: this._savedModes.speedMode,
        splitPortrait: false
      });
      this._savedModes = null;
    } else {
      state.set('splitPortrait', false);
    }

    // Re-render left panel with the restored/new mode
    this.bridge.emit('render:refresh');
  }

  _listenOrientation() {
    this._boundOrientationChange = () => {
      if (!this._active) return;
      this.bridge.state.set('splitPortrait', window.innerHeight > window.innerWidth);
    };
    window.addEventListener('resize', this._boundOrientationChange);
    window.addEventListener('orientationchange', this._boundOrientationChange);
  }

  _unlistenOrientation() {
    if (this._boundOrientationChange) {
      window.removeEventListener('resize', this._boundOrientationChange);
      window.removeEventListener('orientationchange', this._boundOrientationChange);
      this._boundOrientationChange = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Spotlight Navigation on the Right Panel                            */
  /* ------------------------------------------------------------------ */

  _setupPanelEvents(container) {
    if (!container) return;

    container.classList.add('spotlight-mode');

    container.addEventListener('click', container._panelClick = (e) => {
      const state = this.bridge.state;
      const interaction = this.bridge.get('interaction-manager');
      if (interaction && interaction.selectionMode) return;
      if (interaction && interaction._clearedAt && Date.now() - interaction._clearedAt < 300) return;

      if (e.target.closest('.token-cross-ref[data-ref-book-id]')) return;
      if (e.target.closest('.crossref-indicator')) return;

      if (state.get('speedMode')) return;

      const nav = this.bridge.get('navigation');
      const verses = nav?.currentVerses;
      const spotlight = this.bridge.get('renderer-spotlight');
      if (!verses?.length || !spotlight) return;

      const sRect = container.getBoundingClientRect();
      const sRelX = e.clientX - sRect.left;
      const sSide = Math.min(80, Math.max(56, window.innerWidth * 0.15));
      if (sRelX >= sSide && sRelX <= sRect.width - sSide) return;
      const direction = sRelX < sSide ? 'prev' : 'next';

      if (container._panelTimer) {
        clearTimeout(container._panelTimer);
        container._panelTimer = null;
        return;
      }

      container._panelTimer = setTimeout(() => {
        container._panelTimer = null;
        spotlight.advance(verses, direction);
      }, 200);
    });

    container.addEventListener('wheel', container._panelWheel = (e) => {
      const state = this.bridge.state;
      if (state.get('speedMode')) return;
      if (!state.get('spotlightMode') && !state.get('swipeMode')) return;

      e.preventDefault();

      const nav = this.bridge.get('navigation');
      const verses = nav?.currentVerses;
      const spotlight = this.bridge.get('renderer-spotlight');
      if (!verses?.length || !spotlight) return;

      if (container._wheelCooldown) return;
      container._wheelCooldown = true;
      setTimeout(() => { container._wheelCooldown = false; }, 300);

      spotlight.advance(verses, e.deltaY > 0 ? 'next' : 'prev');
    }, { passive: false });
  }

  _teardownPanelEvents(container) {
    if (!container) return;
    container.classList.remove('spotlight-mode');

    if (container._panelClick) {
      container.removeEventListener('click', container._panelClick);
      container._panelClick = null;
    }
    if (container._panelWheel) {
      container.removeEventListener('wheel', container._panelWheel);
      container._panelWheel = null;
    }
    if (container._panelTimer) {
      clearTimeout(container._panelTimer);
      container._panelTimer = null;
    }
  }

  _setupRightPanelPointerEvents() {
    const body = this._els.panelBody;
    if (!body) return;

    let _ptrStart = null;

    body.addEventListener('pointerdown', this._rightPanelPtrDown = (e) => {
      _ptrStart = { x: e.clientX, y: e.clientY };
    });

    body.addEventListener('pointerup', this._rightPanelPtrUp = (e) => {
      if (!_ptrStart) return;
      const dx = e.clientX - _ptrStart.x;
      const dy = e.clientY - _ptrStart.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      _ptrStart = null;

      const state = this.bridge.state;
      if (!state.get('spotlightMode')) return;

      const interaction = this.bridge.get('interaction-manager');
      if (interaction && interaction.selectionMode) return;

      const hlToolbar = document.getElementById('highlight-toolbar');
      if (hlToolbar && !hlToolbar.classList.contains('hidden')) return;

      if (absDy > 50 && absDy > absDx * 1.5) {
        const nav = this.bridge.get('navigation');
        if (!nav) return;
        const verses = nav.currentVerses;
        if (!verses.length) return;
        const spotlight = this.bridge.get('renderer-spotlight');
        if (!spotlight) return;
        spotlight.advance(verses, dy < 0 ? 'next' : 'prev');
      }
    });
  }

  _teardownRightPanelPointerEvents() {
    const body = this._els.panelBody;
    if (!body) return;

    if (this._rightPanelPtrDown) {
      body.removeEventListener('pointerdown', this._rightPanelPtrDown);
      this._rightPanelPtrDown = null;
    }
    if (this._rightPanelPtrUp) {
      body.removeEventListener('pointerup', this._rightPanelPtrUp);
      this._rightPanelPtrUp = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Syncing both panels                                                */
  /* ------------------------------------------------------------------ */

  _syncBothPanels(verseNum) {
    this._applySpotlightClasses(verseNum);
    this._scrollPanel('left', verseNum);
    this._highlightVerse(verseNum);
    requestAnimationFrame(() => {
      this._scrollPanel('right', verseNum);
    });
  }

  _applySpotlightClasses(verseNum) {
    if (!this._active) return;
    const _rp = (key, def) => {
      const raw = this.bridge.state.get(key);
      if (raw !== 'skin' || !window.UISkins) return raw;
      const skin = UISkins.getActive();
      if (skin && key in (skin.preferences || {})) return skin.preferences[key];
      return UISkins._builtinDefaults[key] !== undefined ? UISkins._builtinDefaults[key] : def;
    };
    const paragraphMode = _rp('paragraphMode', false);
    if (paragraphMode) return;

    [this._els.content, this._els.panelBody].forEach(container => {
      if (!container) return;
      container.querySelectorAll('.verse-container:not(.section-heading-container)').forEach(el => {
        const v = parseInt(el.dataset.verse, 10);
        if (v === verseNum) {
          el.classList.remove('dimmed-verse');
          el.classList.add('active-verse');
        } else {
          el.classList.remove('active-verse');
          el.classList.add('dimmed-verse');
        }
      });
    });
  }

  _scrollPanel(panelName, verseNum) {
    const container = panelName === 'left' ? this._els.content : this._els.panelBody;
    if (!container) return;
    const target = container.querySelector(`.verse-container[data-verse="${verseNum}"]`) ||
                   container.querySelector(`.verse-container[data-verse-index="${verseNum}"]`);
    if (!target) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const offset = targetRect.top - containerRect.top + container.scrollTop;
    const targetScroll = offset - (containerRect.height / 2) + (targetRect.height / 2);
    container.scrollTo({ top: targetScroll, behavior: 'smooth' });
  }

  _highlightVerse(verseNum) {
    if (!this._active) return;
    requestAnimationFrame(() => {
      [this._els.content, this._els.panelBody].forEach(container => {
        container.querySelectorAll('.verse-container.focused').forEach(el => {
          el.classList.remove('focused');
        });
        const targets = container.querySelectorAll(`.verse-container[data-verse="${verseNum}"]`);
        targets.forEach(t => t.classList.add('focused'));
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Right-panel content management                                     */
  /* ------------------------------------------------------------------ */

  _refreshRight() {
    const state = this.bridge.state;
    const bookId = state.get('currentBook');
    const chapter = state.get('currentChapter');
    if (!bookId || !chapter) {
      this._els.panelBody.innerHTML = '<p style="padding:1rem;color:var(--text-muted);">No chapter loaded.</p>';
      return;
    }
    return this._renderRightPanel(bookId, chapter);
  }

  async _renderRightPanel(bookId, chapter) {
    const body = this._els.panelBody;
    body.innerHTML = '';

    const verses = await this._loadChapterTranslation(bookId, chapter, this._rightTranslation);
    if (!verses || verses.length === 0) {
      body.innerHTML = '<p style="padding:1rem;color:var(--text-muted);">No verses loaded.</p>';
      return;
    }

    const base = this.bridge.get('base-renderer');
    const state = this.bridge.state;
    const bionic = state.get('bionic');
    const strength = state.get('bionicStrength');

    const frag = base.renderTokenChapter(verses, bionic, strength);

    // Inject cross-reference indicators if enabled
    if (state.get('crossRefs')) {
      base._currentBookId = bookId;
      base._currentChapter = chapter;
      const cr = this.bridge.get('cross-references');
      if (cr && cr.enabled) {
        const bulkRefs = cr.getRefsBulk(bookId, chapter) || {};
        base._addCrossRefIndicators(frag, bulkRefs);
      }
    }

    body.appendChild(frag);

    // Apply initial spotlight classes (all dimmed except current verse)
    const currentVerse = state.get('currentVerse');
    const _rp = (key, def) => {
      const raw = state.get(key);
      if (raw !== 'skin' || !window.UISkins) return raw;
      const skin = UISkins.getActive();
      if (skin && key in (skin.preferences || {})) return skin.preferences[key];
      return UISkins._builtinDefaults[key] !== undefined ? UISkins._builtinDefaults[key] : def;
    };
    const paragraphMode = _rp('paragraphMode', false);

    if (!paragraphMode) {
      body.querySelectorAll('.verse-container:not(.section-heading-container)').forEach(container => {
        const v = parseInt(container.dataset.verse, 10);
        if (v === currentVerse) {
          container.classList.add('active-verse');
        } else {
          container.classList.add('dimmed-verse');
        }
      });
    }
  }

  async _loadChapterTranslation(bookId, chapter, translationId) {
    try {
      const nav = this.bridge.get('navigation');
      if (nav._cachedTranslation?.[translationId]?.[`${bookId}:${chapter}`]) {
        return nav._cachedTranslation[translationId][`${bookId}:${chapter}`];
      }
      const db = this.bridge.db;
      const state = this.bridge.state;
      const origTrans = state.get('currentTranslation');

      const ok = await db.init(translationId);
      if (!ok) {
        if (origTrans) await db.init(origTrans);
        return [];
      }
      const bookCode = db.idToCode(bookId);
      if (!bookCode) {
        if (origTrans) await db.init(origTrans);
        return [];
      }
      const verses = await db.getChapterTokens(bookCode, chapter);
      const mapped = verses.map(v => ({ ...v, book_code: bookCode, book_id: bookId }));
      if (origTrans) {
        try { await db.init(origTrans); } catch (e) {
          console.warn('[SplitMode] Failed to restore original translation:', e);
        }
      }
      if (!nav._cachedTranslation) nav._cachedTranslation = {};
      if (!nav._cachedTranslation[translationId]) nav._cachedTranslation[translationId] = {};
      nav._cachedTranslation[translationId][`${bookId}:${chapter}`] = mapped;
      return mapped;
    } catch (e) {
      console.warn('[SplitMode] Failed to load translation:', e);
      return [];
    }
  }

  destroy() {
    if (this._verseUnsub) {
      this._verseUnsub();
      this._verseUnsub = null;
    }
    if (this._refreshUnsub) {
      this._refreshUnsub();
      this._refreshUnsub = null;
    }
    if (this._boundDocClick) {
      document.removeEventListener('click', this._boundDocClick);
      this._boundDocClick = null;
    }
    if (this._bodyObserver) {
      this._bodyObserver.disconnect();
      this._bodyObserver = null;
    }
    this._teardownPanelEvents(this._els.panelBody);
    this._teardownRightPanelPointerEvents();
    this._unlistenOrientation();
    this._els.panelBody.innerHTML = '';
  }
};
