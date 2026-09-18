window.TTSManager = class TTSManager {
  // Background-audio GENERATION feature switch. When false the "Background
  // audio" block is hidden from the Read Aloud panel, preparation cannot be
  // started, and prepared playback is never preferred — normal live Read Aloud
  // is used everywhere. Flip to true to re-enable once the feature is reliable;
  // the implementation (PreparationService / PreparedAudioStore / PreparedPlayer)
  // stays in place.
  static PREPARED_AUDIO_ENABLED = false;

  constructor(bridge) {
    this.bridge = bridge;
    this.capabilities = new window.TTSCapabilities(bridge);
    this.registry = new window.VoiceRegistry(bridge);
    this.controller = new window.PlaybackController(bridge, this);
    this.engines = new Map();
    this.engine = null;
    this._continuing = false;
    this._pauseDisposeTimer = null;
    // Downloads/installs Piper voice packs into OPFS on demand (mirrors how
    // picking a Bible translation that isn't downloaded starts its download).
    this.packs = window.TTSPackService ? new window.TTSPackService(bridge) : null;
    // A voice descriptor forced onto the CURRENT queue only (word-study
    // original-word pronunciation uses a language-specific Piper model).
    // Cleared by every queue-resetting entry point (start/speakVerses), so it
    // can never leak into chapter playback.
    this._queueVoiceOverride = null;
    // Queue-scoped playback speed override (e.g. word-study speaks word
    // details slowly). Read by getSynthesisOptions() while set and cleared by
    // every queue-resetting entry point, like _queueVoiceOverride.
    this._queueRateOverride = null;
    // PREPARED BACKGROUND AUDIO (opt-in): OPFS store + the generator. Present
    // only when the pieces loaded; the feature hides itself otherwise.
    this.preparedStore = window.PreparedAudioStore ? new window.PreparedAudioStore(bridge) : null;
    this.preparation = window.PreparationService ? new window.PreparationService(bridge, this) : null;
    this.preparedFormat = 'wav';
    // A loaded prepared session (from _loadCompatiblePrepared), cached so play()
    // does not re-read OPFS on every tap. Cleared on config change / clear.
    this._preparedLoad = null;
    // Force normal Piper playback (the "normal Read Aloud" path) even when a
    // prepared session exists — set by tests/QA or when the user opts to play
    // normal audio instead. Note: the whole feature is also off unless
    // PREPARED_AUDIO_ENABLED is true.
    this.skipPrepared = false;
  }

  async init() {
    this.registerEngine(new window.PiperEngine(this.bridge));
    this.registerEngine(new window.SystemTTSEngine(this.bridge));
    this.bridge.on('nav:chapter-loaded', () => this._onChapterLoaded());
    this.bridge.on('tts:state', (p) => this._onPlaybackState(p && p.state));
    this._checkEvictionMarker();
    // Restore the persisted sleep-timer preference into the controller. The
    // panel only reflects the saved value into its <select>; without this an
    // iOS background reload (which drops the controller's in-memory duration)
    // would silently leave the timer off while the UI still shows it set.
    const savedSleep = this.bridge.state.get('ttsSleepTimer');
    if (typeof savedSleep === 'number' && isFinite(savedSleep) && savedSleep > 0) {
      this.controller.setSleepTimer(savedSleep);
    }
    // Pre-register the static Piper voice list so the picker shows Natural
    // Voices before the neural engine is ever loaded (it loads lazily on
    // first play). Device voices are appended once the system engine loads.
    const piper = this.engines.get('piper');
    if (piper) await this._syncRegistry(piper);
    const system = this.engines.get('system');
    if (system && await system.isAvailable()) {
      const loaded = await system.load().catch(() => false);
      if (loaded) {
        this.engine = system;
        await this._syncRegistry(system);
      }
    }
    this._scheduleIdlePreload();
    this._initPrepared();
  }

  registerEngine(engine) {
    this.engines.set(engine.id, engine);
  }

  // Prepared background audio: drop any orphaned scratch output from an
  // interrupted run, then load the active session's metadata so the settings
  // status can show it. Preparation is NEVER auto-started here (opt-in only).
  _initPrepared() {
    const store = this.preparedStore;
    if (!store) return;
    // Cleanup always runs: an interrupted earlier run can leave scratch bytes
    // behind, and that storage should be reclaimed whether or not the feature
    // is currently enabled from the UI.
    store.cleanupOrphans().catch(() => {});
    if (!this.preparedAudioEnabled) return;
    // A voice/speed/translation change invalidates a prepared session.
    if (this.bridge.state && this.bridge.state.onChange) {
      this.bridge.state.onChange(['ttsVoice', 'ttsSpeed', 'currentTranslation'], () => {
        this._preparedLoad = null;
        this.bridge.emit('tts:prepared-changed', { active: false, reason: 'config-changed' });
      });
    }
    this.refreshPreparedStatus().catch(() => {});
  }

  // Recompute and emit the prepared-audio status for the UI/status views.
  async refreshPreparedStatus() {
    if (!this.preparedAudioEnabled || !this.preparation) return { prepared: false };
    const usage = await this.preparation.usage().catch(() => ({ preparedBytes: 0 }));
    const { compatible, session } = await this.preparation.compatibleActive();
    const state = session && (compatible || session.actualDuration > 0)
      ? { prepared: true, compatible, session: this._preparedSummary(session), usage }
      : { prepared: false, usage };
    this.bridge.emit('tts:prepared-status', state);
    return state;
  }

  _preparedSummary(s) {
    return {
      id: s.id,
      format: s.format,
      byteSize: s.byteSize,
      actualDuration: s.actualDuration,
      targetDuration: s.targetDuration,
      verseCount: s.verses ? s.verses.length : 0,
      startRef: s.startRef,
      endRef: s.endRef,
      compatible: true
    };
  }

  // ── Prepared background audio (opt-in) ─────────────────────────────────────
  // Gated by PREPARED_AUDIO_ENABLED: when the feature is switched off, the
  // panel block is hidden and none of these entry points do anything, so
  // playback always takes the live path.

  get preparedAudioEnabled() {
    return window.TTSManager.PREPARED_AUDIO_ENABLED === true;
  }

  prepareBackgroundAudio(minutes) {
    if (!this.preparedAudioEnabled || !this.preparation) return null;
    const seconds = Math.max(60, Math.round((Number(minutes) || 30) * 60));
    // Preparation needs the Piper engine (real synthesis). Ensure the pack is
    // installed and the engine loaded; ensureEngine() handles both.
    return this.preparation.prepare(seconds);
  }

  cancelPreparation() {
    if (!this.preparedAudioEnabled) return false;
    return this.preparation ? this.preparation.cancel('user') : false;
  }

  async clearPreparedAudio() {
    this._preparedLoad = null;
    if (this.preparation) await this.preparation.clear();
    await this.refreshPreparedStatus();
  }

  preparedStatus() {
    return this.preparation ? this.preparation.status : { phase: 'idle' };
  }

  // Load (and cache) the compatible prepared session for playback. Returns
  // { session, url, blob } or null. Revokes a previously cached URL when it is
  // replaced. Called by PlaybackController.play() via _loadCompatiblePrepared.
  async _loadCompatiblePrepared() {
    if (!this.preparedAudioEnabled || !this.preparation) return null;
    if (this.skipPrepared) return null;
    if (this._preparedLoad) return this._preparedLoad;
    const { compatible } = await this.preparation.compatibleActive();
    if (!compatible) return null;
    const loaded = await this.preparation.loadActive();
    if (!loaded) return null;
    this._preparedLoad = loaded;
    return loaded;
  }

  // iOS: an AudioContext must be created + resumed synchronously inside the
  // user gesture that starts playback — synthesis runs long after the tap.
  // Call this from the tap-driven entry points before any await.
  unlock() {
    const piper = this.engines.get('piper');
    if (piper && piper.unlockAudio) piper.unlockAudio();
  }

  // Warm the engine (model download + worker init + warm-up generation) off
  // the playback critical path so the first Play does not wait on it. Called
  // when the Read Aloud panel first opens, right after a voice is selected, and
  // once at app idle (see init()). Harmless if already loaded. Never runs
  // mid-playback: swapping engines would dispose the active narrator.
  // Not async: the in-flight promise is returned as-is so concurrent callers
  // share one load instead of spawning duplicate engine work.
  preload() {
    if (this._preloading) return this._preloading;
    if (this._engineSettled) return true;
    if (this.controller.isActive) return false;
    this._preloading = this.ensureEngine().catch(err => {
      console.warn('[tts-manager] preload failed:', err && err.message ? err.message : err);
      return false;
    });
    return this._preloading;
  }

  // Best-effort idle warm-up: after the app has settled, load the Piper engine
  // so the first Read Aloud tap is already warm (model read + ONNX session
  // create + warm-up take ~20s on Android). Skipped when a pack still needs
  // downloading (ensureEngine handles that), when playback is active, or when
  // the device class would immediately release it (iOS). Runs in idle time so
  // it never competes with startup.
  _scheduleIdlePreload() {
    // iOS releases the engine the moment playback stops, so warming it here
    // would only burn memory/battery for nothing.
    if (this._releaseOnIdle()) return;
    const run = () => { this.preload(); };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 15000 });
    } else {
      setTimeout(run, 8000);
    }
  }

  async ensureEngine(opts = {}) {
    // The ladder defines preference order (piper -> system): the first
    // engine that loads wins, even if a lower-preference engine is already
    // loaded (e.g. system, which init() loads eagerly). A loaded engine
    // earlier in the ladder short-circuits immediately.
    const ladder = this._engineLadder();
    let piperVoice = null;
    for (const engine of ladder) {
      if (!(await engine.isAvailable())) continue;
      // Piper voices download on select; before the engine loads (or is
      // re-used for a different model) make sure the resolved pack is in OPFS.
      // On failure the pack is simply not available right now — fall through
      // the ladder to system rather than letting synthesis fail. The resolved
      // { model, sid } is passed to load() so the worker warms the SAME model
      // that was downloaded (not a different static default). When an explicit
      // opts.voice is given (speakPhrase), warm THAT model instead of the
      // saved narrator voice; the caller is responsible for its pack.
      if (engine.id === 'piper') {
        try {
          piperVoice = (opts && opts.voice)
            ? { model: opts.voice.model, sid: Number.isInteger(opts.voice.sid) ? opts.voice.sid : 0 }
            : await this._ensurePiperPack();
        } catch (err) {
          console.warn('[tts-manager] Piper voice pack unavailable:', err && err.message ? err.message : err);
          continue;
        }
      }
      if (engine.loaded) {
        if (this.engine !== engine) {
          this.engine = engine;
          await this._syncRegistry(engine);
        }
        this._engineSettled = true;
        this._markActivity('active');
        this.bridge.emit('tts:engine', engine.id);
        return true;
      }
      // Only one engine is resident at a time: cancel and dispose the
      // current engine before the next one loads.
      if (this.engine && this.engine !== engine) {
        if (this.engine.cancel) this.engine.cancel();
        await this.engine.dispose().catch(() => {});
        this.engine = null;
      }
      const loaded = await engine.load(engine.id === 'piper' && piperVoice
        ? { model: piperVoice.model, sid: piperVoice.sid }
        : undefined
      ).catch(err => {
        console.warn('[tts-manager] engine "' + engine.id + '" failed to load:', err && err.message ? err.message : err);
        return false;
      });
      if (loaded) {
        this.engine = engine;
        await this._syncRegistry(engine);
        this._engineSettled = true;
        this._markActivity('active');
        this.bridge.emit('tts:engine', engine.id);
        return true;
      }
    }
    return false;
  }

  _engineLadder() {
    // Piper is the app's only neural engine; system speech remains as the
    // fallback for devices without Worker/WASM support.
    return ['piper', 'system']
      .map(id => this.engines.get(id))
      .filter(Boolean);
  }

  // Ensures the currently resolved Piper voice's model pack is installed in
  // OPFS, downloading it in the background when needed, and returns the
  // resolved { model, sid } so ensureEngine() can warm the worker on exactly
  // that model (never a different default). No-op (null) when the pack service
  // is unavailable (unit tests / degraded runtime) or a non-Piper voice is set.
  async _ensurePiperPack() {
    const packs = this.packs;
    if (!packs) return null;
    // Prefer an explicitly selected Piper voice; otherwise fall back to the
    // engine-scoped resolved voice (the natural default).
    const saved = this.bridge.state.get('ttsVoice');
    const savedVoice = saved ? this.registry.getVoice(saved) : null;
    let voice = null;
    if (savedVoice && savedVoice.engine === 'piper') {
      voice = savedVoice;
    } else {
      voice = this.getResolvedVoice();
      if (!voice || voice.engine !== 'piper') return null;
    }
    const model = (voice.raw && voice.raw.model) || null;
    if (!model) return null;
    const sid = (voice.raw && Number.isInteger(voice.raw.sid)) ? voice.raw.sid : 0;
    let installed = true;
    try {
      installed = await packs.isInstalled(model);
    } catch (e) {
      installed = true; // pack service/idb unavailable -> assume installed
    }
    if (!installed) {
      await packs.ensureInstalled(model, {
        onProgress: (p) => this.bridge.emit('tts:pack-progress', { model, ...p })
      });
    }
    return { model, sid };
  }

  async _syncRegistry(engine) {
    const raws = engine.getVoices ? engine.getVoices() : [];
    const descriptors = raws.map(v => ({
      uri: v.voiceURI,
      name: v.name,
      lang: v.lang,
      raw: v
    }));
    this.registry.syncEngine(engine.id, descriptors, engine.label);
  }

  start(fromVerse) {
    this.unlock();
    this._queueVoiceOverride = null;
    this._queueRateOverride = null;
    const items = this._buildQueueFromChapter();
    if (!items.length) {
      this.bridge.emit('tts:error', { reason: 'no-content' });
      return;
    }
    this.controller.setQueue(items, fromVerse);
    this.controller.play();
  }

  toggle() {
    this.unlock();
    const state = this.controller.state;
    if (state === 'playing' || state === 'buffering' || state === 'loading') {
      this.controller.pause();
    } else if (state === 'paused') {
      this.controller.resume();
    } else {
      this.start(this.bridge.state.get('currentVerse'));
    }
  }

  nextVerse() {
    if (this.controller.isActive) this.controller.next();
  }

  prevVerse() {
    if (this.controller.isActive) this.controller.prev();
  }

  async benchmarkOracle(tuning, text) {
    const engine = this.engines.get('piper');
    if (!engine) throw new Error('Piper engine not registered');
    if (!engine.loaded) {
      const ok = await this.ensureEngine();
      if (!ok) throw new Error('Piper engine unavailable');
    }
    if (typeof engine.runBenchmark !== 'function') throw new Error('Benchmark unsupported');
    return engine.runBenchmark(tuning, text);
  }

  // Rough per-verse playback estimate (seconds) used only for background-track
  // sizing. Prefers a measured rate when one is available, else chars/second.
  estimateVerseSeconds(item) {
    const text = (item && item.text) || '';
    const rate = Number(this.getSynthesisOptions().rate) || 1;
    return (text.length / 16) / Math.max(0.5, rate);
  }

  stopPlayback() {
    if (this.controller.isActive || this.controller.state === 'stopping') {
      this.controller.stop();
    }
  }

  // Speak an explicit, bounded list of verses — the verse context-menu Listen
  // action. Interrupts any ongoing chapter playback, plays exactly these items
  // (honoring the current voice/speed, or the app defaults if the Read Aloud
  // panel was never opened), then stops: the Continue-to-next-chapter toggle
  // never applies to a short read. The model pack downloads in the background
  // through play() → ensureEngine() → _ensurePiperPack().
  speakVerses(items, opts = {}) {
    if (!items || !items.length) return;
    this.unlock();
    this._queueVoiceOverride = null;
    this._queueRateOverride = (opts && typeof opts.rate === 'number' && opts.rate > 0)
      ? opts.rate
      : null;
    const cont = this.controller;
    cont.interrupt();
    cont.setQueue(items);
    cont.singleShot = true;
    cont.play();
  }

  // Speak an explicit, bounded list of items with a FORCED voice — the
  // word-study overlay's original-word pronunciation, which must use a
  // language-specific Piper model (he_IL/el_GR) regardless of the saved
  // narrator voice. Downloads the model pack on demand, warms piper on it, and
  // plays exactly these items, then stops. Returns a promise so the caller can
  // clear a busy state; failures surface through tts:error.
  async speakPhrase(items, phraseVoice = {}) {
    if (!items || !items.length) return false;
    this.unlock();
    this._queueRateOverride = null;
    const model = phraseVoice.model || null;
    try {
      const piper = this.engines.get('piper');
      if (piper && !(await piper.isAvailable())) {
        this.bridge.emit('tts:error', { reason: 'no-piper', error: 'Piper TTS unavailable' });
        return false;
      }
      if (model && this.packs) {
        await this.packs.ensureInstalled(model, {
          onProgress: (p) => this.bridge.emit('tts:pack-progress', { model, ...p })
        });
      }
      if (!(await this.ensureEngine(model ? { voice: { model, sid: 0 } } : {}))) {
        this.bridge.emit('tts:error', { reason: 'no-engine' });
        return false;
      }
      this._queueVoiceOverride = model
        ? {
            id: 'piper:' + model,
            engine: 'piper',
            name: phraseVoice.name || 'Original Word',
            lang: phraseVoice.lang || 'und',
            raw: { model, sid: 0 }
          }
        : null;
      const cont = this.controller;
      cont.interrupt();
      cont.setQueue(items);
      cont.singleShot = true;
      cont.play();
      return true;
    } catch (err) {
      this.bridge.emit('tts:error', {
        reason: 'phrase-failed',
        error: err && err.message ? err.message : String(err)
      });
      return false;
    }
  }

  // iOS keeps no neural engine resident between sessions: it evicts the tab
  // when the TTS memory (ORT wasm heap + model buffer + phonemizer data,
  // ~150-200MB) is retained indefinitely. Release the engine on stop; on pause
  // release after a grace period so quick Play/Pause toggles stay warm.
  // Android and desktop keep the engine resident: Android has the RAM to spare,
  // and re-initializing costs ~20s (78MB model read + ONNX session create +
  // warm-up), so a replay would otherwise feel like it hung. This is the whole
  // reason the platform split (Android used to release like iOS) was revisited.
  _onPlaybackState(state) {
    if (this._pauseDisposeTimer) {
      clearTimeout(this._pauseDisposeTimer);
      this._pauseDisposeTimer = null;
    }
    if (!this._releaseOnIdle()) return;
    if (state === 'idle' || state === 'error') {
      this._scheduleEngineRelease(0, 'stopped');
    } else if (state === 'paused') {
      this._scheduleEngineRelease(10000, 'paused-idle');
    }
  }

  // Only iOS releases the resident Piper engine (tab eviction under retained
  // TTS memory). Android/desktop stay warm so replays skip the ~20s re-init.
  _releaseOnIdle() {
    const caps = this.capabilities;
    if (caps && typeof caps.isIOS === 'function') return caps.isIOS();
    return caps && caps.deviceClass && caps.deviceClass() === 'mobile';
  }

  _scheduleEngineRelease(ms, reason) {
    this._pauseDisposeTimer = setTimeout(() => {
      this._pauseDisposeTimer = null;
      this._releaseEngine(reason);
    }, ms);
  }

  async _releaseEngine(reason) {
    const state = this.controller.state;
    if (state === 'playing' || state === 'loading' || state === 'buffering') return;
    const engine = this.engine;
    if (!engine || !engine.loaded) return;
    if (engine.cancel) engine.cancel();
    await engine.dispose().catch(() => {});
    this.engine = null;
    this._engineSettled = false;
    this._markActivity('released:' + reason);
    console.warn('[tts-manager] released ' + engine.id + ' engine (' + reason + ') to reduce mobile memory pressure');
  }

  // sessionStorage outlives an iOS tab reload, so it can distinguish a clean
  // engine release from a mid-playback eviction/OOM reload (diagnostic only).
  _checkEvictionMarker() {
    try {
      const m = sessionStorage.getItem('focused-word:tts-activity');
      if (m === 'active') {
        console.warn('[tts-manager] page reloaded while the neural engine was resident — likely iOS tab eviction under memory pressure');
      }
      sessionStorage.removeItem('focused-word:tts-activity');
    } catch (e) { /* ignore */ }
  }

  _markActivity(value) {
    try {
      sessionStorage.setItem('focused-word:tts-activity', String(value));
    } catch (e) { /* ignore */ }
  }

  setVoice(voiceId) {
    this.bridge.state.set('ttsVoice', voiceId);
    // Selecting a Natural Voice starts its pack download in the background —
    // exactly like picking an undownloaded Bible translation. ensureEngine()
    // (play/preload) joins the same in-flight download via ensureInstalled().
    const voice = this.registry.getVoice(voiceId);
    if (voice && voice.engine === 'piper' && this.packs) {
      const model = (voice.raw && voice.raw.model) || null;
      if (model) {
        this.packs.ensureInstalled(model, {
          onProgress: (p) => this.bridge.emit('tts:pack-progress', { model, ...p })
        }).then(() => {
          // Warm the freshly downloaded pack so the first Play skips the ~20s
          // model read + ONNX session create. The pack is new, so the resident
          // (old-model) engine — if any — must be rebuilt; release it first.
          if (this.engine && this.engine.id === 'piper') {
            return this._releaseEngine('voice-changed').then(() => { this.preload(); });
          }
          this.preload();
        }).catch((err) => {
          console.warn('[tts-manager] pack download for "' + model + '" failed:', err && err.message ? err.message : err);
          this.bridge.emit('tts:pack-error', { model, error: (err && err.message) ? err.message : String(err) });
        });
      }
    }
  }

  setSpeed(rate) {
    const n = Number(rate);
    if (!n || Number.isNaN(n)) return;
    this.bridge.state.set('ttsSpeed', Math.min(2, Math.max(0.4, n)));
  }

  getActiveEngineId() {
    // After ensureEngine() has settled the real narrator, trust it. Before
    // that (init eagerly loads `system` as a fallback) prefer the ladder
    // leader so the picker shows the voices that will actually speak.
    if (this._engineSettled && this.engine) return this.engine.id;
    return this.getPreferredEngineId();
  }

  getPreferredEngineId() {
    // The ladder IS the preference order; genuine availability is enforced at
    // load time in ensureEngine(). isAvailable() is async (returns a Promise,
    // always truthy), so it cannot be used synchronously here.
    const first = this._engineLadder()[0];
    return first ? first.id : null;
  }

  getResolvedVoice() {
    const engineId = this.getActiveEngineId();
    const saved = this.bridge.state.get('ttsVoice');
    let voice = saved ? this.registry.getVoice(saved) : null;
    // Only honor a saved voice that belongs to the active engine. A voice
    // from another engine (e.g. a Device Voice while piper is active) must
    // never be passed to the active engine — fall back to its own default.
    if (!voice || (engineId && voice.engine !== engineId)) {
      voice = this.registry.getDefaultVoice(engineId);
      if (this.engine && saved && voice && voice.id !== saved) {
        this.bridge.state.set('ttsVoice', voice.id);
      }
    }
    return voice;
  }

  getSynthesisOptions() {
    const opts = {
      rate: this._queueRateOverride || this.bridge.state.get('ttsSpeed') || 1,
      voice: this.getResolvedVoice()
    };
    // A queue-scoped voice override (word-study original-word pronunciation)
    // replaces the saved narrator voice for exactly this queue.
    if (this._queueVoiceOverride) opts.voice = this._queueVoiceOverride;
    return opts;
  }

  async synthesize(item, opts) {
    const engine = this.engine;
    if (!engine) throw new Error('No TTS engine available');
    const chunk = {
      text: item.text,
      verseId: item.verseId,
      chunkIndex: 0,
      chunkCount: 1
    };
    return engine.synthesize(chunk, opts);
  }

  shouldContinueToNextChapter() {
    return this.bridge.state.get('ttsContinueNextChapter') === true;
  }

  loadNextChapterForPlayback() {
    this._continuing = true;
    this.bridge.emit('nav:advance-chapter', { direction: 'next', autoAdvance: true });
    setTimeout(() => {
      if (!this._continuing) return;
      this._continuing = false;
      if (this.controller.state === 'buffering') this.controller.stop();
    }, 8000);
  }

  _onChapterLoaded() {
    if (this._continuing) {
      this._continuing = false;
      if (this.controller.state === 'idle' || this.controller.state === 'stopping') return;
      const items = this._buildQueueFromChapter();
      if (!items.length) {
        this.controller.stop();
        return;
      }
      this.controller.setQueue(items, 1);
      this.controller.play();
      return;
    }
    if (this.controller.isActive) {
      this.controller.stop();
    }
  }

  // Dev/QA: A/B the ORT throughput candidates on the current device and print a
  // ranked table. Run from the console:
  //   const t = bridge.get('tts');
  //   await t.benchmarkOrtTunings();
  // or with custom candidates: t.benchmarkOrtTunings([{threads:2},{cpuMemArena:false}])
  // Each candidate merges over TTSCapabilities.ortTuning(). Nothing here runs
  // unless called; results also emit on 'tts:benchmark'.
  async benchmarkOrtTunings(candidates) {
    const caps = this.capabilities;
    const base = (caps && typeof caps.ortTuning === 'function') ? caps.ortTuning() : {};
    const list = Array.isArray(candidates) && candidates.length ? candidates : [
      { threads: 1, cpuMemArena: false, memPattern: false },
      { threads: 1, cpuMemArena: true, memPattern: true },
      { threads: 2, cpuMemArena: true, memPattern: true },
      { threads: 4, cpuMemArena: true, memPattern: true },
      { threads: 1, cpuMemArena: true, memPattern: false },
      { threads: 1, cpuMemArena: false, memPattern: true }
    ];
    const text = 'In the beginning God created the heaven and the earth. ' +
      'And the earth was without form, and void; and darkness was upon the face of the deep.';
    const results = [];
    for (const cand of list) {
      const tuning = Object.assign({}, base, cand);
      try {
        const r = await this.benchmarkOracle(tuning, text);
        results.push({ tuning, rtf: r.rtf, synthMs: r.synthMs, audioMs: r.audioMs, ok: true });
      } catch (err) {
        results.push({ tuning, ok: false, error: err && err.message ? err.message : String(err) });
      }
      this.bridge.emit('tts:benchmark', results[results.length - 1]);
    }
    const ranked = results.slice().sort((a, b) => (a.ok ? a.rtf : Infinity) - (b.ok ? b.rtf : Infinity));
    if (typeof console !== 'undefined' && console.table) {
      console.table(ranked.map(x => ({
        threads: x.tuning.threads,
        arena: x.tuning.cpuMemArena,
        pattern: x.tuning.memPattern,
        rtf: x.ok ? Number(x.rtf.toFixed(3)) : 'fail',
        synthMs: x.ok ? Math.round(x.synthMs) : '',
        error: x.error || ''
      })));
    }
    return ranked;
  }

  _buildQueueFromChapter() {
    const nav = this.bridge.get('navigation');
    const verses = (nav && nav.currentVerses) || [];
    const items = [];
    for (const v of verses) {
      if (!(v.verse > 0)) continue;
      const text = (v.clean_text || '').trim();
      if (!text) continue;
      items.push({
        verseId: { book: v.book_id, chapter: v.chapter, verse: v.verse },
        text
      });
    }
    return items;
  }
};
