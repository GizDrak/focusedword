window.SplitMode = class SplitMode {
  constructor(bridge) {
    this.bridge = bridge;
    this._active = false;
    this._rightTranslation = null;
    this._savedModes = null;
    this._verseUnsub = null;
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
          const item = document.createElement('div');
          item.className = 'translation-dropdown-item';
          item.dataset.value = t.id || t.name;
          item.textContent = t.name;
          dd.appendChild(item);
        });
      });

      const alt = manifest.find(t => (t.id || t.name) !== this.bridge.state.get('currentTranslation'));
      this._rightTranslation = alt ? (alt.id || alt.name) : this.bridge.state.get('currentTranslation');
    }

    const currentTrans = this.bridge.state.get('currentTranslation');
    this._setBtnAbbr(this._els.leftTransBtn, currentTrans);
    this._setBtnAbbr(this._els.rightTransBtn, this._rightTranslation || currentTrans);
    if (!this._rightTranslation) this._rightTranslation = currentTrans;
  }

  _setBtnAbbr(btn, id) {
    if (!btn) return;
    const manifest = this.bridge.translationManifest || [];
    const entry = manifest.find(t => (t.id || t.name) === id);
    btn.textContent = entry ? (entry.id || '').substring(0, 3) : (id || '').substring(0, 3);
  }

  _bindEvents() {
    const toggleDropdown = (btn, dd) => {
      if (!btn || !dd) return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.translation-dropdown.open').forEach(d => {
          if (d !== dd) d.classList.remove('open');
        });
        dd.classList.toggle('open');
      });
    };
    toggleDropdown(this._els.leftTransBtn, this._els.leftTransDropdown);
    toggleDropdown(this._els.rightTransBtn, this._els.rightTransDropdown);

    this._boundDocClick = () => {
      document.querySelectorAll('.translation-dropdown.open').forEach(d => {
        d.classList.remove('open');
      });
    };
    document.addEventListener('click', this._boundDocClick);

    const selectFromDropdown = (btn, dd, onChange) => {
      if (!dd) return;
      dd.addEventListener('click', (e) => {
        const item = e.target.closest('.translation-dropdown-item');
        if (!item) return;
        dd.classList.remove('open');
        const val = item.dataset.value;
        this._setBtnAbbr(btn, val);
        onChange(val);
      });
    };
    selectFromDropdown(this._els.leftTransBtn, this._els.leftTransDropdown, (val) => {
      this.bridge.state.set('currentTranslation', val);
    });
    selectFromDropdown(this._els.rightTransBtn, this._els.rightTransDropdown, (val) => {
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
    const manifest = this.bridge.translationManifest || [];

    this._setBtnAbbr(this._els.leftTransBtn, currentTrans);

    const alt = manifest.find(t => (t.id || t.name) !== currentTrans);
    this._rightTranslation = alt ? (alt.id || alt.name) : currentTrans;
    this._setBtnAbbr(this._els.rightTransBtn, this._rightTranslation);

    // Restore the last-used right-panel translation, if available
    const savedRight = localStorage.getItem('focused-word:split-right-translation');
    if (savedRight && manifest.some(t => (t.id || t.name) === savedRight)) {
      this._rightTranslation = savedRight;
      this._setBtnAbbr(this._els.rightTransBtn, this._rightTranslation);
    }

    // Save current reading mode to restore on exit
    this._savedModes = {
      spotlightMode: state.get('spotlightMode'),
      swipeMode: state.get('swipeMode'),
      speedMode: state.get('speedMode')
    };

    // Switch left panel to spotlight mode via the main render pipeline
    state.set('spotlightMode', true);

    // Detect device orientation for portrait (top/bottom) vs landscape (left/right) layout
    state.set('splitPortrait', window.innerHeight > window.innerWidth);

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

  _onDeactivate() {
    this._teardownPanelEvents(this._els.panelBody);
    this._teardownRightPanelPointerEvents();
    this._els.panelBody.innerHTML = '';
    this._unlistenOrientation();

    // Restore the reading mode that was active before split
    if (this._savedModes) {
      const state = this.bridge.state;
      state.batch({
        spotlightMode: this._savedModes.spotlightMode,
        swipeMode: this._savedModes.swipeMode,
        speedMode: this._savedModes.speedMode,
        splitPortrait: false
      });
      this._savedModes = null;
    } else {
      this.bridge.state.set('splitPortrait', false);
    }

    // Re-render left panel with the restored mode
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
    const paragraphMode = this.bridge.state.get('paragraphMode');
    if (paragraphMode) return;

    [this._els.content, this._els.panelBody].forEach(container => {
      if (!container) return;
      container.querySelectorAll('.verse-container').forEach(el => {
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
    body.appendChild(frag);

    // Apply initial spotlight classes (all dimmed except current verse)
    const currentVerse = state.get('currentVerse');
    const paragraphMode = state.get('paragraphMode');

    if (!paragraphMode) {
      body.querySelectorAll('.verse-container').forEach(container => {
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
