window.PlaybackController = class PlaybackController {
  constructor(bridge, manager) {
    this.bridge = bridge;
    this.manager = manager;
    this.state = 'idle';
    this.queue = [];
    this.index = 0;
    this._generation = 0;
    this._buffer = [];
    this._fillPromise = null;
    this._fillGen = 0;
    // Neural look-ahead depth. iOS/iPadOS uses a single pre-synthesized verse
    // for this stability pass: one verse of look-ahead keeps inter-verse gaps
    // near zero while still capping peak ORT-wasm + phonemizer memory, and the
    // worker recycling below runs at verse boundaries so any single in-flight
    // look-ahead is cleanly cancelled. Other devices keep the 2-verse
    // look-ahead that maximizes pre-buffering.
    this._lookahead = this._defaultLookahead();
    // Bounded reads (the verse context-menu Listen action) play exactly the
    // items handed to setQueue() and then stop — the Continue-to-next-chapter
    // toggle never applies. Reset by every setQueue() so a normal chapter
    // play never inherits it.
    this.singleShot = false;
    // A voice/speed change mid-playback must not replay stale pre-synthesized
    // audio — drop the look-ahead buffer and let the next fill use the new
    // options. Generation is NOT bumped (that would abort the current verse).
    const clearBuffer = () => { this._buffer = []; };
    this._offStateChange = bridge.state.onChange(['ttsVoice', 'ttsSpeed'], clearBuffer);
    // Sleep timer: _sleepDurationMs is the user's selected duration (a
    // preference persisted to the state store); _sleepDeadlineMs is the armed
    // wall-clock deadline for the current playback session. The deadline is
    // armed when playback starts (or when the selection changes mid-playback)
    // and cleared on stop/interrupt, while the preference survives so the next
    // play re-arms it. Expiry never cuts a verse short: it is checked at the
    // verse boundary in _speakCurrent, so the in-progress verse always finishes.
    this._sleepDurationMs = null;
    this._sleepDeadlineMs = null;
    this._sleepTickTimer = null;
    // Mode: 'live' (Piper synthesis, the default) or 'prepared' (a loaded
    // PREPARED BACKGROUND AUDIO session). Prepared playback never synthesizes.
    this.mode = 'live';
    this._prepared = null;       // { session, url, blob, track, player }
    this._preparedAttempted = false;
    // A backgrounded/locked page (iOS) throttles or suspends timers, so the
    // wall-clock deadline can pass while the app is hidden. Re-check on return
    // so an expired timer stops at once instead of waiting for the next verse
    // boundary — or, with Continue-to-next-chapter, never.
    this._visibilityHandler = () => this._handleVisibility();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._visibilityHandler);
    }
  }

  get isPlaying() {
    return this.state === 'playing';
  }

  get isActive() {
    return this.state !== 'idle' && this.state !== 'stopping';
  }

  get currentItem() {
    return this.queue[this.index] || null;
  }

  // ── Sleep timer ──────────────────────────────────────────────────────────
  // The selected duration (ms) or null when Off. Persisted so the picker
  // remembers the choice across reloads.
  get sleepDurationMs() {
    return this._sleepDurationMs;
  }

  // Milliseconds until the armed timer stops playback (0 when not armed).
  get sleepRemainingMs() {
    if (!this._sleepDeadlineMs) return 0;
    return Math.max(0, this._sleepDeadlineMs - Date.now());
  }

  get sleepTimerActive() {
    return this._sleepDeadlineMs != null;
  }

  // Select a sleep-timer duration. Passing null/0/NaN turns it off. When
  // playback is active the deadline is (re)armed from now; when idle it is
  // merely remembered and armed by the next play().
  setSleepTimer(ms) {
    const value = (typeof ms === 'number' && isFinite(ms) && ms > 0) ? ms : null;
    this._sleepDurationMs = value;
    if (this.bridge.state) this.bridge.state.set('ttsSleepTimer', value);
    if (value && this.isActive) this._armSleepTimer(value);
    else this._disarmSleepTimer();
    this._emitSleepTick();
  }

  _armSleepTimer(ms) {
    if (this._sleepTickTimer) {
      clearInterval(this._sleepTickTimer);
      this._sleepTickTimer = null;
    }
    this._sleepDeadlineMs = Date.now() + ms;
    // Refresh the countdown every 30s; also emitted immediately by callers.
    this._sleepTickTimer = setInterval(() => {
      this._emitSleepTick();
    }, 30000);
  }

  _disarmSleepTimer() {
    if (this._sleepTickTimer) {
      clearInterval(this._sleepTickTimer);
      this._sleepTickTimer = null;
    }
    this._sleepDeadlineMs = null;
  }

  _emitSleepTick() {
    this.bridge.emit('tts:sleep-timer-tick', { remainingMs: this.sleepRemainingMs });
  }

  // Re-check the deadline when the page becomes visible again. A locked screen
  // suspends timers, so the 30s countdown tick may have missed the deadline
  // entirely; on return, stop a playback session whose timer has already
  // expired. The deadline is cleared by stop(), so this fires at most once.
  _handleVisibility() {
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    if (hidden) return;
    // Becoming visible: recover the correct verse from the prepared media clock
    // (its onSegment callbacks may not have run while JS was frozen) and resync
    // the reader.
    if (this.state === 'playing' || this.state === 'paused') {
      if (this.mode === 'prepared' && this._prepared && this._prepared.player) {
        const i = this._prepared.player.currentIndex();
        if (i >= 0 && i !== this.index) this._emitPreparedVerse(i);
      }
    }
    if (!this._sleepDeadlineMs) return;
    if (this.isActive && Date.now() >= this._sleepDeadlineMs) {
      this.stop();
      return;
    }
    // Not yet expired (or idle): repaint the countdown immediately so the
    // panel shows the correct remaining time without waiting for the tick.
    this._emitSleepTick();
  }

  dispose() {
    if (this._sleepTickTimer) {
      clearInterval(this._sleepTickTimer);
      this._sleepTickTimer = null;
    }
    if (this._visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
  }

  _canLookAhead(engine) {
    return !!(engine &&
      typeof engine.synthesizeAudio === 'function' &&
      typeof engine.playAudio === 'function');
  }

  // ── Prepared background audio playback ────────────────────────────────────
  //
  // A compatible PREPARED session is one long, already-encoded resource. Playing
  // it is the most lock-safe path (the resource drains on its own), so play()
  // prefers it. If there is no compatible prepared session, or it does not cover
  // the current position, normal Piper playback runs unchanged.

  _currentRefCode() {
    const state = this.bridge.state;
    const bookId = state.get('currentBook');
    const bookCode = (this.bridge.db && this.bridge.db.idToCode) ? this.bridge.db.idToCode(bookId) : null;
    if (!bookCode) return null;
    return window.PreparedSession.refFor(bookCode, state.get('currentChapter'), state.get('currentVerse') || 1);
  }

  // Returns true if prepared playback was started. Inert while the
  // background-audio feature is disabled (manager side returns no session).
  async _tryPreparedPlayback() {
    const m = this.manager;
    if (!m || !m.preparedAudioEnabled || m.skipPrepared) return false;
    let loaded = null;
    try {
      loaded = await m._loadCompatiblePrepared();
    } catch (e) {
      loaded = null;
    }
    if (!loaded || !loaded.session || !loaded.url) return false;
    // Only prefer prepared when its timetable actually covers the current ref.
    const ref = this._currentRefCode();
    const startIdx = ref ? loaded.session.verses.findIndex(v => v.ref === ref) : -1;
    if (startIdx < 0) {
      try { URL.revokeObjectURL(loaded.url); } catch (e) { /* ignore */ }
      return false;
    }
    const player = new window.PreparedPlayer(loaded.session, loaded.url);
    if (!player.available) {
      try { URL.revokeObjectURL(loaded.url); } catch (e) { /* ignore */ }
      return false;
    }
    this.mode = 'prepared';
    this._prepared = { session: loaded.session, url: loaded.url, player };
    this._preparedAttempted = true;
    this.manager.unlock();
    player.unlock();
    this._setState('playing');
    this._emitPreparedVerse(startIdx);
    this._diagnostics('preparedPlaybackStarted', { ref, index: startIdx });
    // The sleep timer still applies to prepared playback.
    if (this._sleepDurationMs && !this._sleepDeadlineMs) this._armSleepTimer(this._sleepDurationMs);
    try {
      await player.playFromIndex(startIdx, (i) => this._onPreparedSegment(i));
      // Natural end of the prepared resource.
      if (this.mode === 'prepared' && !this._sleepTimerFired) this._onQueueEnd();
    } catch (err) {
      if (err && err.canceled) return true;
      // A prepared-playback failure must not break the app: fall back to live.
      this._teardownPrepared();
      this._setState('error');
      this.bridge.emit('tts:error', {
        reason: 'prepared-playback-failed',
        error: err && err.message ? err.message : String(err)
      });
    }
    return true;
  }

  _onPreparedSegment(i) {
    if (this.mode !== 'prepared' || !this._prepared) return;
    this._emitPreparedVerse(i);
    // Sleep timer: stop at a verse boundary once the deadline has passed.
    if (this._sleepDeadlineMs && Date.now() >= this._sleepDeadlineMs) {
      this._sleepTimerFired = true;
      this.stop();
    }
  }

  _emitPreparedVerse(i) {
    const p = this._prepared;
    if (!p) return;
    const entry = p.session.verses[i];
    if (!entry) return;
    const parsed = window.PreparedSession.parseRef(entry.ref);
    if (!parsed) return;
    this.index = i;
    this.bridge.emit('tts:current-verse', {
      verseId: { book: parsed.bookCode, chapter: parsed.chapter, verse: parsed.verse },
      index: i,
      total: p.session.verses.length,
      prepared: true
    });
  }

  _teardownPrepared() {
    const p = this._prepared;
    this._prepared = null;
    this.mode = 'live';
    this._sleepTimerFired = false;
    if (!p) return;
    try { if (p.player) p.player.stop(); } catch (e) { /* ignore */ }
    try { if (p.url) URL.revokeObjectURL(p.url); } catch (e) { /* ignore */ }
  }

  _diagnostics(stage, data) {
    if (window.TTSDiagnostics) window.TTSDiagnostics.mark(stage, data);
  }

  _defaultLookahead() {
    const caps = window.TTSCapabilities;
    if (caps && typeof caps.isMobile === 'function' && caps.isMobile()) return 1;
    return 2;
  }

  // sessionStorage breadcrumbs survive an unexpected iOS process reload; these
  // mark the playback boundary of every verse.
  _markStage(stage, item) {
    if (window.TTSDiagnostics && item && item.verseId) {
      window.TTSDiagnostics.mark(stage, { verseId: item.verseId });
    }
  }

  async _playAndMark(engine, audio, item) {
    this._markStage('playback-start', item);
    await engine.playAudio(audio);
    this._markStage('playback-end', item);
  }

  setQueue(items, startVerse) {
    this.queue = items || [];
    this.index = 0;
    this.singleShot = false;
    this._buffer = [];
    this._fillPromise = null;
    if (startVerse != null) {
      const i = this.queue.findIndex(it => it.verseId.verse === startVerse);
      if (i >= 0) this.index = i;
    }
  }

  async play() {
    if (this.state === 'paused') return this.resume();
    if (this.state === 'playing' || this.state === 'loading') return;
    // PREPARED BACKGROUND AUDIO: when a compatible prepared session covers the
    // current position, its already-encoded continuous resource is the most
    // lock-safe thing to play — prefer it over live synthesis. Falls through to
    // normal Piper playback when there is no compatible prepared session.
    if (await this._tryPreparedPlayback()) return;
    this.manager.unlock();
    const gen = this._generation;
    this._setState('loading');
    const ok = await this.manager.ensureEngine();
    if (gen !== this._generation) return;
    if (this.state !== 'loading') return;
    if (!ok) {
      this._setState('idle');
      this.bridge.emit('tts:error', { reason: 'no-engine' });
      return;
    }
    if (!this.queue.length) {
      this._setState('idle');
      this.bridge.emit('tts:error', { reason: 'no-content' });
      return;
    }
    this._setState('playing');
    // Arm the sleep timer on a fresh play, but NEVER reset a deadline that is
    // already running: auto-advancing to the next chapter (Continue to next
    // chapter) calls play() again, and re-arming there would push the deadline
    // forward on every chapter and let playback run all night. A fresh play
    // after stop()/interrupt() has no deadline (those disarm), so it arms here.
    if (this._sleepDurationMs && !this._sleepDeadlineMs) this._armSleepTimer(this._sleepDurationMs);
    this._emitCurrentVerse();
    this._speakCurrent();
  }

  pause() {
    if (this.state !== 'playing' && this.state !== 'loading') return;
    this._setState('paused');
    if (this.mode === 'prepared' && this._prepared && this._prepared.player) {
      try { this._prepared.player.pause(); } catch (e) { /* ignore */ }
      return;
    }
    const engine = this.manager.engine;
    if (engine && engine.pause) engine.pause();
    // In-flight look-ahead fill stops at the next state check; buffered audio
    // is kept so resume continues without a gap.
  }

  async resume() {
    if (this.state !== 'paused') return;
    if (this.mode === 'prepared' && this._prepared && this._prepared.player) {
      // Prepared session is already loaded on the element; just resume it and
      // do NOT touch the Piper worker.
      this._prepared.player.resume();
      this._setState('playing');
      this._emitCurrentVerse();
      return;
    }
    this.manager.unlock();
    const engine = this.manager.engine;
    // The engine may have been disposed during the idle/pause grace period
    // (mobile memory release); re-load it before resuming.
    const needsRestart = !engine ||
      !engine.loaded ||
      (engine.needsRestart && engine.needsRestart()) ||
      (engine.isBusy && !engine.isBusy());
    if (engine && engine.clearRestart) engine.clearRestart();
    if (needsRestart) {
      const gen = this._generation;
      this._setState('loading');
      const ok = await this.manager.ensureEngine();
      if (gen !== this._generation) return;
      if (!ok) {
        this._setState('idle');
        this.bridge.emit('tts:error', { reason: 'no-engine' });
        return;
      }
      this._setState('playing');
      this._emitCurrentVerse();
      this._speakCurrent();
    } else if (engine.resume) {
      engine.resume();
      // The resident engine resumes the same audio directly; restore the
      // playing state so the play button and status stop showing "Paused".
      this._setState('playing');
    }
  }

  stop() {
    const gen = ++this._generation;
    this._disarmSleepTimer();
    this._setState('stopping');
    if (this.mode === 'prepared') {
      this._teardownPrepared();
    }
    const engine = this.manager.engine;
    if (engine && engine.cancel) engine.cancel();
    this._buffer = [];
    this._fillPromise = null;
    this.queue = [];
    this.index = 0;
    setTimeout(() => {
      if (gen !== this._generation) return;
      this._setState('idle');
      this.bridge.emit('tts:current-verse-cleared');
    }, 0);
  }

  // Hard-sync abort for bounded reads (context-menu Listen): stops playback
  // and settles on idle in the same tick — unlike stop(), there is no
  // deferred idle transition, so a follow-up play() cannot be clobbered by
  // the pending state reset.
  interrupt() {
    ++this._generation;
    this._disarmSleepTimer();
    if (this.mode === 'prepared') this._teardownPrepared();
    this._buffer = [];
    this._fillPromise = null;
    this.queue = [];
    this.index = 0;
    const engine = this.manager.engine;
    if (engine && engine.cancel) engine.cancel();
    if (engine && engine.clearRestart) engine.clearRestart();
    this._setState('idle');
  }

  next() {
    if (!this.isActive) return;
    if (this.mode === 'prepared' && this._prepared && this._prepared.player) {
      const i = this._prepared.player.nextVerse();
      if (i >= 0) this._emitPreparedVerse(i);
      return;
    }
    if (this.index < this.queue.length - 1) {
      this._goToIndex(this.index + 1);
    } else {
      this._onQueueEnd();
    }
  }

  prev() {
    if (!this.isActive) return;
    if (this.mode === 'prepared' && this._prepared && this._prepared.player) {
      const i = this._prepared.player.prevVerse();
      if (i >= 0) this._emitPreparedVerse(i);
      return;
    }
    if (this.index > 0) {
      this._goToIndex(this.index - 1);
    }
  }

  // Foreground navigation target: rebuild playback beginning at that verse.
  _goToIndex(target) {
    this.index = target;
    this._skipToCurrent();
  }

  _skipToCurrent() {
    ++this._generation;
    this._buffer = [];
    this._fillPromise = null;
    const engine = this.manager.engine;
    if (engine && engine.clearRestart) engine.clearRestart();
    if (this.state === 'paused') {
      if (engine && engine.cancel) engine.cancel();
      this._emitCurrentVerse();
      return;
    }
    this._setState('playing');
    this._emitCurrentVerse();
    this._speakCurrent();
  }

  // A voice/speed change mid-playback must take effect immediately: stop the
  // current verse's audio and re-synthesize it with the new options, instead
  // of letting the old voice/rate finish the verse. While paused, only cancel
  // (so resume() re-synthesizes via its engine-restart path).
  restartCurrent() {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    ++this._generation;
    this._buffer = [];
    this._fillPromise = null;
    const engine = this.manager.engine;
    if (engine && engine.cancel) engine.cancel();
    if (engine && engine.clearRestart) engine.clearRestart();
    if (this.state === 'paused') {
      this._emitCurrentVerse();
      return;
    }
    this._setState('playing');
    this._emitCurrentVerse();
    this._speakCurrent();
  }

  async _speakCurrent() {
    const gen = this._generation;
    const item = this.queue[this.index];
    if (!item) {
      this._onQueueEnd();
      return;
    }
    const engine = this.manager.engine;
    const canLookAhead = this._canLookAhead(engine);
    this._verseStartTs = performance.now();
    if (this._prevVerseEndTs != null) {
      console.warn('[TTS] gap between verses ' + (this.index - 1) + '→' + this.index +
        ' = ' + Math.round(this._verseStartTs - this._prevVerseEndTs) + 'ms');
    }
    try {
      const buffered = canLookAhead ? this._takeBuffer(this.index) : null;
      if (buffered) {
        // Current verse is already synthesized — start filling ahead while it
        // plays so the next verse is ready before this one finishes.
        this._startFill(gen);
        await this._playAndMark(engine, buffered.audio, item);
      } else {
        const opts = this.manager.getSynthesisOptions();
        if (canLookAhead) {
          // A look-ahead fill may already be synthesizing this verse (it was
          // slower than the previous verse's playback). Wait for it instead
          // of duplicating the synthesis.
          if (this._fillPromise) await this._fillPromise;
          if (gen !== this._generation) return;
          const filled = this._takeBuffer(this.index);
          if (filled) {
            this._startFill(gen);
            await this._playAndMark(engine, filled.audio, item);
          } else {
            this._emitSynth('start', item);
            const audio = await engine.synthesizeAudio(item, opts);
            this._emitSynth('end', item);
            if (gen !== this._generation) return;
            this._startFill(gen);
            await this._playAndMark(engine, audio, item);
          }
        } else {
          await this.manager.synthesize(item, opts);
        }
      }
      if (gen !== this._generation) return;
      // Sleep timer expiry: never cut a verse short — the current verse has
      // just finished, so stop before synthesizing the next one.
      if (this._sleepDeadlineMs && Date.now() >= this._sleepDeadlineMs) {
        this.stop();
        return;
      }
      this._prevVerseEndTs = performance.now();
      console.warn('[TTS] verse ' + this.index + ' playback done in ' +
        Math.round(this._prevVerseEndTs - this._verseStartTs) + 'ms');
      // iOS stability pass: recycle the Piper worker at verse boundaries (every
      // 15 completed verses). The current verse's audio already finished, so
      // this never interrupts active audio; the next verse synthesizes on the
      // fresh worker and playback continues without the user pressing Play.
      if (engine && typeof engine.onVerseComplete === 'function') {
        await engine.onVerseComplete();
        if (gen !== this._generation) return;
      }
      this.index++;
      this._buffer = this._buffer.filter(e => e.index >= this.index);
      if (this.index >= this.queue.length) {
        this._onQueueEnd();
        return;
      }
      this._emitCurrentVerse();
      this._speakCurrent();
    } catch (err) {
      if (gen !== this._generation) return;
      if (err && err.canceled) {
        if (this.state === 'paused') return;
        return;
      }
      this._setState('error');
      this.bridge.emit('tts:error', {
        reason: 'synthesis-failed',
        error: err && err.message ? err.message : String(err)
      });
    }
  }

  _startFill(gen) {
    if (this._fillPromise) return;
    const engine = this.manager.engine;
    if (!this._canLookAhead(engine)) return;
    this._fillGen = gen;
    this._fillPromise = this._fillBuffer(gen).finally(() => {
      if (this._fillGen === gen) this._fillPromise = null;
    });
  }

  async _fillBuffer(gen) {
    const engine = this.manager.engine;
    if (!this._canLookAhead(engine)) return;
    const opts = this.manager.getSynthesisOptions();
    const voiceId = opts.voice ? opts.voice.id : null;
    while (this._buffer.length < this._lookahead) {
      if (gen !== this._generation) return;
      if (this.state !== 'playing') return;
      const idx = this.index + this._buffer.length + 1;
      const item = this.queue[idx];
      if (!item) return;
      try {
        const audio = await engine.synthesizeAudio(item, opts);
        if (gen !== this._generation) return;
        if (this.state !== 'playing') return;
        this.bridge.emit('tts:synth', { status: 'end', verseId: item.verseId, index: idx });
        this._buffer.push({ index: idx, audio, voiceId });
      } catch (err) {
        // A failed look-ahead item is not fatal: keep the current verse
        // playing and fall back to sequential synthesis for that item.
        if (err && err.canceled) return;
        return;
      }
    }
  }

  _takeBuffer(index) {
    const i = this._buffer.findIndex(e => e.index === index);
    if (i < 0) return null;
    const entry = this._buffer[i];
    // Drop stale pre-synthesized audio if the voice/speed changed after it
    // was generated — synthesize fresh with the current options.
    const opts = this.manager.getSynthesisOptions();
    const voiceId = opts.voice ? opts.voice.id : null;
    if (entry.voiceId !== voiceId) {
      this._buffer.splice(i, 1);
      return null;
    }
    this._buffer.splice(i, 1);
    return entry;
  }

  async _onQueueEnd() {
    if (this.singleShot) {
      this.stop();
      return;
    }
    if (this.manager.shouldContinueToNextChapter()) {
      this._setState('buffering');
      this.manager.loadNextChapterForPlayback();
    } else {
      this.stop();
    }
  }

  _emitCurrentVerse() {
    const item = this.currentItem;
    if (!item) return;
    this.bridge.emit('tts:current-verse', {
      verseId: item.verseId,
      index: this.index,
      total: this.queue.length
    });
  }

  // Synthesis-boundary signal so a caller can show "generating audio" (e.g.
  // the verse context-menu Listen button's spinner). Emitted around the real
  // synthesis of the current verse in _speakCurrent, and on look-ahead fills
  // (which synthesize the next verses off the critical path). Regular chapter
  // playback emits these too; consumers gate on their own pending state.
  _emitSynth(status, item) {
    this.bridge.emit('tts:synth', {
      status,
      verseId: item ? item.verseId : null,
      index: this.index
    });
  }

  _setState(state) {
    if (this.state === state) {
      this.bridge.emit('tts:state', { state, verseId: this.currentItem ? this.currentItem.verseId : null });
      return;
    }
    this.state = state;
    this.bridge.emit('tts:state', { state, verseId: this.currentItem ? this.currentItem.verseId : null });
  }
};