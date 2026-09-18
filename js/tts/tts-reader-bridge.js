// tts-reader-bridge.js — Read Aloud UI wiring.
//
// Owns the Read Aloud panel (same bottom-sheet pattern as the Notes and Plans
// panels: opens from the bottom of the viewport with padding that keeps the
// controls above the main toolbar, collapsible to a transport bar) plus the
// reader-side follow. Closing the panel also stops playback. While emitting,
// the spoken verse is driven through the shared verse-focus pipeline
// (VerseManager + BaseRenderer.ttsFollowTo) so the reader highlight, progress
// and verse rail all follow it. In scroll mode the renderer's position-based
// focus/active tracking is suspended for the duration of playback so it never
// fights the TTS-driven verse.

window.TTSReaderBridge = class TTSReaderBridge {
  constructor(bridge) {
    this.bridge = bridge;
    this._offs = [];
    this._lastManualScroll = 0;
    this._programmaticScrollUntil = 0;
    this._verseProgress = null;
    this._compressed = false;
    this._ttsRunning = false;
    this._baseRendererCached = null;
  }

  get manager() {
    return this.bridge.get('tts');
  }

  init() {
    this._createPanel();
    this._offs.push(this.bridge.on('tts:current-verse', (p) => this._onCurrentVerse(p)));
    this._offs.push(this.bridge.on('tts:state', (p) => this._onState(p)));
    this._offs.push(this.bridge.on('tts:error', (p) => this._onError(p)));
    this._offs.push(this.bridge.on('tts:engine', () => this._populateVoices()));
    this._offs.push(this.bridge.on('tts:pack-progress', (p) => this._onPackProgress(p)));
    this._offs.push(this.bridge.on('tts:pack-status', (p) => this._onPackStatus(p)));
    this._offs.push(this.bridge.on('tts:pack-error', (p) => this._onPackError(p)));
    this._offs.push(this.bridge.on('tts:sleep-timer-tick', (p) => this._updateStatus(this._lastState)));
    this._offs.push(this.bridge.on('tts:prepare-status', (p) => this._onPrepareStatus(p)));
    this._offs.push(this.bridge.on('tts:prepared-status', (p) => this._onPreparedInfo(p)));
    this._setupManualScrollTracking();
    this._setupAutoCompress();
    this._setupControls();
    this._initPrepareUI();
  }

  dispose() {
    for (const off of this._offs) {
      try { off(); } catch (e) { /* ignore */ }
    }
    this._offs = [];
  }

  _createPanel() {
    if (document.getElementById('tts-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'tts-panel';
    panel.className = 'tts-panel hidden';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Read Aloud');
    panel.innerHTML = `
      <div class="tts-header">
        <h2 class="tts-title">Read Aloud</h2>
        <div class="tts-transport">
          <button id="tts-prev" class="tts-btn" aria-label="Previous verse">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>
          <button id="tts-play" class="tts-btn tts-btn--play" aria-label="Play or pause">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button id="tts-next" class="tts-btn" aria-label="Next verse">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 18l8.5-6L6 6zM16 6h2v12h-2z"/></svg>
          </button>
        </div>
        <button class="tts-close-btn" title="Close" aria-label="Close Read Aloud">✕</button>
      </div>
      <div class="tts-body">
        <div class="tts-status" id="tts-status">Ready</div>
        <div class="tts-options">
          <label class="tts-option">
            <span class="tts-option-label">Voice</span>
            <select id="tts-voice" class="tts-select" aria-label="Voice"></select>
          </label>
          <label class="tts-option">
            <span class="tts-option-label">Speed</span>
            <select id="tts-speed" class="tts-select tts-select--speed" aria-label="Speed">
              <option value="0.4">0.4&times;</option>
              <option value="0.6">0.6&times;</option>
              <option value="0.75">0.75&times;</option>
              <option value="1.0" selected>1.0&times;</option>
              <option value="1.2">1.2&times;</option>
              <option value="1.4">1.4&times;</option>
            </select>
          </label>
          <label class="tts-option">
            <span class="tts-option-label">Sleep timer</span>
            <select id="tts-sleep" class="tts-select tts-select--sleep" aria-label="Sleep timer">
              <option value="">Off</option>
              <option value="900000">15 min</option>
              <option value="1800000">30 min</option>
              <option value="2700000">45 min</option>
              <option value="3600000">1 hour</option>
              <option value="5400000">1&frac12; hours</option>
              <option value="7200000">2 hours</option>
              <option value="9000000">2&frac12; hours</option>
              <option value="10800000">3 hours</option>
            </select>
          </label>
        </div>
        <div class="tts-toggles">
          <label class="tts-toggle">
            <input type="checkbox" id="tts-follow" />
            <span>Follow reading</span>
          </label>
          <label class="tts-toggle">
            <input type="checkbox" id="tts-continue" />
            <span>Continue to next chapter</span>
          </label>
        </div>
        <div class="tts-prepare" id="tts-prepare" hidden>
          <span class="tts-option-label tts-prepare-label">Background audio</span>
          <div class="tts-prepare-row">
            <span class="tts-prepare-pick">
              <select id="tts-prepare-length" class="tts-select tts-select--speed" aria-label="Preparation length">
                <option value="15">15 min</option>
                <option value="30" selected>30 min</option>
                <option value="60">60 min</option>
              </select>
              <button id="tts-prepare-btn" class="tts-prepare-btn tts-prepare-btn--primary">Prepare</button>
              <button id="tts-prepare-cancel" class="tts-prepare-btn" hidden>Cancel</button>
            </span>
            <span class="tts-prepare-live">
              <span class="tts-prepare-dot" id="tts-prepare-dot" hidden aria-hidden="true"></span>
              <span id="tts-prepare-status" class="tts-prepare-value">Not prepared</span>
            </span>
          </div>
          <div class="tts-prepare-bar" id="tts-prepare-bar" hidden role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <span class="tts-prepare-bar-fill" id="tts-prepare-bar-fill"></span>
          </div>
          <button id="tts-prepare-clear" class="tts-prepare-btn tts-prepare-btn--danger tts-prepare-clear" hidden>Clear prepared audio</button>
          <div class="tts-prepare-meta" id="tts-prepare-meta"></div>
        </div>
        <div class="tts-pack-status" id="tts-pack-status" hidden aria-live="polite"></div>
      </div>
    `;
    document.body.appendChild(panel);
    if (window.UISkins) window.UISkins.decorate(panel, 'tts-panel');
  }

  open() {
    const panel = document.getElementById('tts-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    panel.classList.remove('compressed');
    this._compressed = false;
    const m = this.manager;
    if (m) m.preload();
    const state = m && m.controller ? m.controller.state : 'idle';
    this._onState({ state });
    this._refreshPrepareUI();
    const firstFocus = panel.querySelector('button, [href], input, select, textarea');
    if (firstFocus) setTimeout(() => firstFocus.focus(), 50);
  }

  close() {
    const panel = document.getElementById('tts-panel');
    if (!panel) return;
    panel.classList.add('hidden');
    const m = this.manager;
    if (m) m.stopPlayback();
  }

  isOpen() {
    const panel = document.getElementById('tts-panel');
    return !!panel && !panel.classList.contains('hidden');
  }

  _onState(p) {
    const state = p && p.state ? p.state : 'idle';
    this._lastState = state;
    const playBtn = document.getElementById('tts-play');
    if (playBtn) {
      playBtn.innerHTML = state === 'playing' || state === 'loading' || state === 'buffering'
        ? TTSReaderBridge.PAUSE_SVG
        : TTSReaderBridge.PLAY_SVG;
    }
    if (state === 'idle') this._verseProgress = null;
    this._setScrollTrackingForTTS(state);
    this._updateStatus(state);
  }

  // While TTS is emitting, suspend ALL position-based scroll tracking so it
  // never overwrites the TTS-driven verse: the ScrollModeSwitcher's
  // ReadingTracker (the active tracker in modern scroll mode) and the legacy
  // renderer listener. Restore them the moment playback stops, pauses or fails.
  _setScrollTrackingForTTS(state) {
    const running = state === 'playing' || state === 'buffering' || state === 'loading';
    if (running === this._ttsRunning) return;
    this._ttsRunning = running;

    const rm = this.bridge.get('render-manager');
    const switcher = rm && rm._scrollSwitcher;
    if (switcher) {
      if (typeof switcher.suspend === 'function') {
        if (running) switcher.suspend();
        else switcher.resume();
      }
      return;
    }

    const scroll = this.bridge.get('renderer-scroll');
    if (!scroll || typeof scroll.disableScrollTracking !== 'function') return;
    if (running) {
      scroll.disableScrollTracking();
    } else {
      scroll.enableScrollTracking();
    }
  }

  _updateStatus(state) {
    const el = document.getElementById('tts-status');
    if (!el) return;
    const v = this._verseProgress;
    const at = v && v.total ? ' — verse ' + (v.index + 1) + ' of ' + v.total : '';
    let text;
    switch (state) {
      case 'playing': text = 'Playing' + at; break;
      case 'paused': text = 'Paused' + at; break;
      case 'loading': text = 'Preparing…'; break;
      case 'buffering': text = 'Loading next chapter…'; break;
      case 'stopping': text = 'Stopping…'; break;
      case 'error': text = 'Playback error'; break;
      default: text = 'Ready';
    }
    // Sleep timer countdown, shown while a timer is actually armed (expiry
    // stops playback at a verse boundary, so the countdown trails a verse
    // after it reaches zero until the controller stops).
    const c = this.manager && this.manager.controller ? this.manager.controller : null;
    if (c && c.sleepTimerActive) {
      const rem = c.sleepRemainingMs;
      const mins = Math.ceil(rem / 60000);
      const label = mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + 'm';
      text += ' · sleep ' + label;
    }
    el.textContent = text;
  }

  _onError(p) {
    if (p && p.reason === 'no-engine') {
      console.warn('[tts] No TTS engine is available on this device');
    }
  }

  _packLabel(model) {
    if (model && window.TTSPackService && window.TTSPackService.PACKS[model]) {
      return window.TTSPackService.PACKS[model].label;
    }
    return model || 'voice';
  }

  _onPackProgress(p) {
    const el = document.getElementById('tts-pack-status');
    if (!el || !p || !p.model) return;
    el.hidden = false;
    el.textContent = 'Downloading ' + this._packLabel(p.model) + '…' +
      (typeof p.pct === 'number' ? ' ' + p.pct + '%' : '');
  }

  _onPackStatus(p) {
    const el = document.getElementById('tts-pack-status');
    if (!el) return;
    if (p && p.installed) {
      el.hidden = true;
      el.textContent = '';
    }
  }

  _onPackError(p) {
    const el = document.getElementById('tts-pack-status');
    if (!el) return;
    el.hidden = false;
    el.textContent = 'Couldn\'t download ' + this._packLabel(p && p.model) + ' — check your connection';
    this._packStatusTimer = setTimeout(() => {
      el.hidden = true;
      el.textContent = '';
    }, 4000);
  }

  _onCurrentVerse(payload) {
    if (payload && typeof payload.index === 'number' && payload.total) {
      this._verseProgress = { index: payload.index, total: payload.total };
    }
    const m = this.manager;
    if (m && m.controller && m.controller.state === 'playing') this._updateStatus('playing');
    const v = payload && payload.verseId;
    if (!v) return;
    const base = this._baseRenderer();
    if (!base) return;
    // Highlight always follows the spoken verse while emitting; movement only
    // when Follow Reading is on and the user hasn't just interacted.
    const follow = this.bridge.state.get('ttsFollowReading') === true;
    const graceOk = Date.now() - this._lastManualScroll >= 3000;
    const move = follow && graceOk;
    if (move) this._programmaticScrollUntil = Date.now() + 2000;
    base.ttsFollowTo(v.verse, { book: v.book, chapter: v.chapter }, move);
  }

  _baseRenderer() {
    if (this._baseRendererCached) return this._baseRendererCached;
    for (const name of ['renderer-scroll', 'renderer-spotlight', 'renderer-swipe', 'renderer-speed']) {
      const r = this.bridge.get(name);
      if (r && r.base) {
        this._baseRendererCached = r.base;
        return this._baseRendererCached;
      }
    }
    return null;
  }

  _setupManualScrollTracking() {
    const mark = () => {
      if (Date.now() < this._programmaticScrollUntil) return;
      this._lastManualScroll = Date.now();
    };
    window.addEventListener('wheel', mark, { passive: true, capture: true });
    window.addEventListener('touchmove', mark, { passive: true, capture: true });
    window.addEventListener('scroll', mark, { passive: true, capture: true });
  }

  _setupAutoCompress() {
    const content = document.getElementById('content');
    if (!content) return;
    content.addEventListener('pointerdown', () => this._compress());
    content.addEventListener('focusin', () => this._compress());
  }

  _compress() {
    const panel = document.getElementById('tts-panel');
    if (!panel || panel.classList.contains('hidden')) return;
    this._compressed = true;
    panel.classList.add('compressed');
  }

  _expand() {
    const panel = document.getElementById('tts-panel');
    if (!panel) return;
    this._compressed = false;
    panel.classList.remove('compressed');
  }

  _setupControls() {
    const panel = document.getElementById('tts-panel');
    if (!panel || panel._ttsBound) return;
    panel._ttsBound = true;
    panel.addEventListener('click', (e) => e.stopPropagation());
    panel.querySelector('.tts-header')?.addEventListener('click', (e) => {
      if (this._compressed && !e.target.closest('.tts-btn, .tts-close-btn')) {
        this._expand();
      }
    });
    panel.querySelector('.tts-close-btn')?.addEventListener('click', () => this.close());
    const tts = () => this.manager;
    document.getElementById('tts-play')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const m = tts();
      if (m) m.toggle();
    });
    document.getElementById('tts-prev')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const m = tts();
      if (m) m.prevVerse();
    });
    document.getElementById('tts-next')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const m = tts();
      if (m) m.nextVerse();
    });
    const voiceSel = document.getElementById('tts-voice');
    if (voiceSel) {
      voiceSel.addEventListener('click', (e) => e.stopPropagation());
      voiceSel.addEventListener('change', () => {
        const m = tts();
        if (!m) return;
        const cont = m.controller;
        const active = cont && (cont.state === 'playing' || cont.state === 'paused');
        m.setVoice(voiceSel.value);
        // Stop the current verse and re-synthesize it with the new voice
        // (restartCurrent is a no-op for any other state).
        if (active && cont.restartCurrent) cont.restartCurrent();
      });
      const registry = this.manager ? this.manager.registry : null;
      if (registry) {
        this._offs.push(registry.onVoicesChanged(() => this._populateVoices()));
      }
      this._populateVoices();
    }
    const speedSel = document.getElementById('tts-speed');
    if (speedSel) {
      speedSel.addEventListener('click', (e) => e.stopPropagation());
      speedSel.addEventListener('change', () => {
        const m = tts();
        if (!m) return;
        const cont = m.controller;
        const active = cont && (cont.state === 'playing' || cont.state === 'paused');
        m.setSpeed(parseFloat(speedSel.value));
        if (active && cont.restartCurrent) cont.restartCurrent();
      });
      const saved = this.bridge.state.get('ttsSpeed');
      if (saved != null) {
        // Snap to the nearest option so the selector is never left blank by a
        // value (e.g. 1 vs the "1.0" option, or a pre-migration stored rate).
        const opts = [...speedSel.options];
        let best = opts[0];
        let bestDiff = Infinity;
        for (const o of opts) {
          const diff = Math.abs(parseFloat(o.value) - saved);
          if (diff < bestDiff) { bestDiff = diff; best = o; }
        }
        speedSel.value = best.value;
      }
    }
    const sleepSel = document.getElementById('tts-sleep');
    if (sleepSel) {
      sleepSel.addEventListener('click', (e) => e.stopPropagation());
      sleepSel.addEventListener('wheel', (e) => e.stopPropagation());
      sleepSel.addEventListener('change', () => {
        const m = tts();
        if (!m || !m.controller) return;
        const value = sleepSel.value ? parseInt(sleepSel.value, 10) : null;
        m.controller.setSleepTimer(value);
      });
      const savedSleep = this.bridge.state.get('ttsSleepTimer');
      if (savedSleep) sleepSel.value = String(savedSleep);
    }
    const followChk = document.getElementById('tts-follow');
    if (followChk) {
      followChk.checked = this.bridge.state.get('ttsFollowReading') === true;
      followChk.addEventListener('click', (e) => e.stopPropagation());
      followChk.addEventListener('change', () => {
        this.bridge.state.set('ttsFollowReading', followChk.checked);
      });
    }
    const continueChk = document.getElementById('tts-continue');
    if (continueChk) {
      continueChk.checked = this.bridge.state.get('ttsContinueNextChapter') === true;
      continueChk.addEventListener('click', (e) => e.stopPropagation());
      continueChk.addEventListener('change', () => {
        this.bridge.state.set('ttsContinueNextChapter', continueChk.checked);
      });
    }
  }

  // ── Background audio (prepared listening) ──────────────────────────────────
  // Lives in the Read Aloud panel because it is a reading-flow action: pick a
  // length, prepare, and the panel shows progress/ready/clear. The heavy
  // lifting is TTSManager.preparation; this only drives and reflects it.

  _initPrepareUI() {
    const wrap = document.getElementById('tts-prepare');
    if (!wrap || wrap._bound) return;
    wrap._bound = true;
    const tts = () => this.manager;

    const lenSel = document.getElementById('tts-prepare-length');
    if (lenSel) {
      lenSel.addEventListener('click', (e) => e.stopPropagation());
      lenSel.addEventListener('wheel', (e) => e.stopPropagation());
      lenSel.addEventListener('change', () => {
        try { localStorage.setItem('focused-word:bg-audio-length', lenSel.value); } catch (e) { /* ignore */ }
      });
      try {
        const saved = localStorage.getItem('focused-word:bg-audio-length');
        if (saved) lenSel.value = saved;
      } catch (e) { /* ignore */ }
    }

    document.getElementById('tts-prepare-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const m = tts();
      const hasApi = !!(m && typeof m.prepareBackgroundAudio === 'function');
      // Diagnostics: one obvious console line per tap so a non-responsive
      // button can always be traced to a stale bundle vs. a real failure.
      try {
        console.info('[TTS] prepare tapped', {
          build: TTSReaderBridge.BUILD,
          hasManager: !!m,
          hasApi,
          hasService: !!(m && m.preparation),
          skipPrepared: !!(m && m.skipPrepared),
          engine: m && m.engine ? m.engine.id : null
        });
      } catch (err) { /* ignore */ }
      if (!hasApi) {
        this._onPrepareStatus({ phase: 'error', error: 'Background audio is not available in this build.' });
        return;
      }
      // Optimistic, immediate feedback: the tap must never look dead while the
      // engine warms up (~20s) or a voice pack downloads. The service confirms
      // with its own 'starting' status a moment later.
      this._onPrepareStatus({ phase: 'starting' });
      try {
        Promise.resolve(m.prepareBackgroundAudio(parseInt(lenSel && lenSel.value, 10) || 30))
          .catch((err) => this._onPrepareStatus({ phase: 'error', error: err && err.message ? err.message : String(err) }));
      } catch (err) {
        this._onPrepareStatus({ phase: 'error', error: err && err.message ? err.message : String(err) });
      }
    });
    document.getElementById('tts-prepare-cancel')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const m = tts();
      if (m && m.cancelPreparation) m.cancelPreparation();
    });
    document.getElementById('tts-prepare-clear')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const m = tts();
      if (!m || !m.clearPreparedAudio) return;
      await m.clearPreparedAudio();
      if (m.refreshPreparedStatus) m.refreshPreparedStatus().catch(() => {});
    });

    // Current state now; every open() refreshes again (cheap, cached in TTSManager).
    this._refreshPrepareUI();
  }

  _refreshPrepareUI() {
    const wrap = document.getElementById('tts-prepare');
    if (!wrap) return;
    const m = this.manager;
    // Hidden entirely while the background-audio generation feature is off, or
    // when the pieces are unavailable. Preparation is never auto-started.
    if (!m || !m.preparedAudioEnabled || typeof m.prepareBackgroundAudio !== 'function' || !m.preparation) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    if (m.refreshPreparedStatus) m.refreshPreparedStatus().catch(() => {});
    this._onPrepareStatus(m.preparedStatus ? m.preparedStatus() : { phase: 'idle' });
  }

  _onPrepareStatus(p) {
    const wrap = document.getElementById('tts-prepare');
    if (!wrap) return;
    const m = this.manager;
    if (!m || !m.preparedAudioEnabled || typeof m.prepareBackgroundAudio !== 'function' || !m.preparation) {
      wrap.hidden = true;
      return;
    }
    const status = document.getElementById('tts-prepare-status');
    const dot = document.getElementById('tts-prepare-dot');
    const bar = document.getElementById('tts-prepare-bar');
    const barFill = document.getElementById('tts-prepare-bar-fill');
    const prepareBtn = document.getElementById('tts-prepare-btn');
    const cancelBtn = document.getElementById('tts-prepare-cancel');
    const clearBtn = document.getElementById('tts-prepare-clear');
    const meta = document.getElementById('tts-prepare-meta');
    if (!status) return;
    const phase = p && p.phase ? p.phase : 'idle';
    const fmt = (s) => {
      s = Math.max(0, Math.round(s || 0));
      const mm = Math.floor(s / 60);
      const ss = s % 60;
      return mm + ':' + String(ss).padStart(2, '0');
    };
    const setBar = (state) => {
      if (!bar || !barFill) return;
      if (state === 'hidden') { bar.hidden = true; bar.classList.remove('is-indeterminate'); return; }
      bar.hidden = false;
      if (state === 'indeterminate') {
        bar.classList.add('is-indeterminate');
        barFill.style.width = '100%';
        bar.removeAttribute('aria-valuenow');
        return;
      }
      bar.classList.remove('is-indeterminate');
      const pct = Math.max(0, Math.min(100, Math.round((state && state.percent) || 0)));
      barFill.style.width = pct + '%';
      bar.setAttribute('aria-valuenow', String(pct));
    };
    if (phase === 'preparing') {
      status.textContent = fmt(p.generatedSeconds) + ' / ' + fmt(p.targetSeconds) +
        (typeof p.percent === 'number' ? ' (' + p.percent + '%)' : '');
      this._setPrepareDot(dot, 'is-building');
      setBar(p);
      if (prepareBtn) prepareBtn.hidden = true;
      if (cancelBtn) cancelBtn.hidden = false;
      if (clearBtn) clearBtn.hidden = true;
      if (meta) meta.textContent = '';
    } else if (phase === 'starting') {
      // Engine warm-up / pack download happens here and can take ~20s; show
      // it instead of appearing frozen on the first tap.
      status.textContent = 'Waking the voice…';
      this._setPrepareDot(dot, 'is-building');
      setBar('indeterminate');
      if (prepareBtn) prepareBtn.hidden = true;
      if (cancelBtn) cancelBtn.hidden = false;
      if (clearBtn) clearBtn.hidden = true;
      if (meta) meta.textContent = '';
    } else {
      if (prepareBtn) prepareBtn.hidden = false;
      if (cancelBtn) cancelBtn.hidden = true;
      if (clearBtn) clearBtn.hidden = phase !== 'ready';
      this._setPrepareDot(dot, phase === 'ready' ? 'is-ready' : null);
      setBar('hidden');
      if (phase === 'error') {
        status.textContent = 'Preparation failed';
        if (meta) meta.textContent = p.error ? String(p.error) : '';
      } else {
        status.textContent = phase === 'ready' ? 'Ready' : 'Not prepared';
        if (meta) meta.textContent = '';
      }
    }
  }

  // Reuses the chapter-status dot styles: pulsing accent while generating,
  // steady green when a session is ready.
  _setPrepareDot(dot, cls) {
    if (!dot) return;
    dot.hidden = !cls;
    dot.classList.toggle('is-building', cls === 'is-building');
    dot.classList.toggle('is-ready', cls === 'is-ready');
  }

  _onPreparedInfo(p) {
    const wrap = document.getElementById('tts-prepare');
    if (!wrap) return;
    const status = document.getElementById('tts-prepare-status');
    if (!status) return;
    // Don't fight the "starting/preparing" progress line.
    if (p && p.prepared && p.session) {
      const m = this.manager;
      if (m && m.preparation && m.preparation.running) return;
      const mins = Math.round((p.session.actualDuration || 0) / 60);
      const compat = p.compatible !== false;
      status.textContent = mins + ' min ready' + (compat ? '' : ' (stale)');
      const clearBtn = document.getElementById('tts-prepare-clear');
      if (clearBtn) clearBtn.hidden = false;
      const meta = document.getElementById('tts-prepare-meta');
      if (meta) {
        meta.textContent = compat
          ? 'Plays as one continuous stream with the screen off'
          : 'Voice, speed or translation changed — prepare again';
      }
    }
  }

  // Header for the voice picker optgroups: "American English" / "British
  // English" for the curated Piper voices, falling back to the engine's group
  // label for device/system voices.
  _voiceGroupLabel(voices) {
    const locale = (voices[0] && voices[0].locale || '').toLowerCase();
    if (locale.startsWith('en-us')) return 'American English';
    if (locale.startsWith('en-gb')) return 'British English';
    return voices[0] && voices[0].group && this.manager && this.manager.registry
      ? this.manager.registry.groupLabel(voices[0].group)
      : (locale || 'Voices');
  }

  _populateVoices() {
    const sel = document.getElementById('tts-voice');
    const manager = this.manager;
    if (!sel || !manager) return;
    // Show only the voices of the engine that will actually narrate. When
    // piper is active the picker lists just Natural Voices; Device Voices
    // appear only when the system engine is the active/fallback narrator.
    const activeId = manager.getActiveEngineId();
    const voices = manager.registry.getVoices().filter(v => v.engine === activeId);
    const current = (manager.getResolvedVoice() || {}).id;
    sel.innerHTML = '';
    // Group by locale so the optgroup header reads "American English" /
    // "British English" (not a per-voice "(en-US)" suffix).
    const byLang = new Map();
    for (const v of voices) {
      const lang = (v.locale || '').toLowerCase();
      if (!byLang.has(lang)) byLang.set(lang, []);
      byLang.get(lang).push(v);
    }
    for (const [, list] of byLang) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = this._voiceGroupLabel(list);
      for (const v of list) {
        const opt = document.createElement('option');
        opt.value = v.id;
        const gender = v.raw && v.raw.gender ? ' — ' + v.raw.gender : '';
        opt.textContent = v.name + gender;
        if (v.id === current) opt.selected = true;
        optgroup.appendChild(opt);
      }
      sel.appendChild(optgroup);
    }
    if (!voices.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No voices available';
      sel.appendChild(opt);
      sel.disabled = true;
    } else {
      sel.disabled = false;
    }
  }
};

TTSReaderBridge.PLAY_SVG = '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
TTSReaderBridge.PAUSE_SVG = '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
// Bump whenever the Read Aloud panel/background-audio UI changes, so a
// non-updating device can be diagnosed from one console line (stale bundle vs.
// real failure).
TTSReaderBridge.BUILD = 'bg-audio-4';
