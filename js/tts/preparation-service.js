// preparation-service.js — generates PREPARED BACKGROUND AUDIO.
//
// Walks an ordered verse sequence forward from the current reading position
// (remaining chapter -> next chapter -> ...), synthesizes each verse with the
// existing Piper worker, encodes it to a temporary audio file in OPFS, records
// the verse TIMETABLE, then DISCARDS the verse's Float32 PCM before moving on.
// It stops once the generated AUDIO DURATION reaches the requested target.
//
// Memory contract (esp. iOS): at no point is an hour of Float32 PCM resident.
// The pipeline is strictly one verse at a time:
//     Piper verse -> PCM -> encodeChunk -> OPFS append -> timetable -> drop PCM
//
// Priority / sharing the worker: the Piper worker handles ONE synthesis at a
// time, and normal Read Aloud owns it while playing. Preparation therefore
// YIELDS: before each verse it waits until playback is idle, and if the user
// starts playing mid-verse the engine's own cancel() supersedes the prep
// request (the controller calls synthesizeAudio next), which prep catches and
// backs off from. When playback stops, preparation resumes where it left off.
//
// Cancellation: change of translation / voice / speed / location, or an explicit
// cancel, aborts the run and deletes the partial preparing/ output.

window.PreparationService = class PreparationService {
  constructor(bridge, manager) {
    this.bridge = bridge;
    this.manager = manager;
    this._running = false;
    this._cancel = false;
    this._session = null;
    this._idleResolve = null;
    this._idleOff = null;
    // Progress snapshot for the UI / settings status line.
    this.status = { phase: 'idle' }; // idle | preparing | ready | error
  }

  get running() {
    return this._running;
  }

  // Start (or restart) preparing `targetSeconds` of audio from the current
  // reading position. Returns the finalized session, or null if cancelled.
  async prepare(targetSeconds) {
    if (this._running) return null;
    // Feedback FIRST: loading the engine can take ~20s (pack read + ONNX
    // session create + warm-up) and, if the voice pack is missing, a full
    // download. Without an immediate status the UI would look dead.
    this._running = true;
    this._cancel = false;
    this.status = { phase: 'starting' };
    this.bridge.emit('tts:prepare-status', this.status);
    this._diagnostics('prepareStarted', { targetDuration: targetSeconds });

    // Preparation REQUIRES the Piper neural engine: it synthesizes to audio
    // files, which the system voice cannot do. Resolve the Piper voice
    // explicitly, make sure its model pack is INSTALLED (downloading it if
    // needed, exactly like normal playback), then warm the engine on it — so
    // the ladder can never quietly settle on the system engine.
    const piperVoice = this._resolvePiperVoice();
    if (!piperVoice) {
      this._running = false;
      this._fail('No Natural Voice selected — choose one in the Voice list first');
      return null;
    }
    try {
      await this._ensurePack(piperVoice);
    } catch (e) {
      this._running = false;
      this._fail('Couldn\'t download the voice — check your connection and try again');
      return null;
    }
    try {
      await this.manager.ensureEngine({ voice: piperVoice });
    } catch (e) {
      console.warn('[preparation] ensureEngine failed:', e && e.message ? e.message : e);
    }
    const engine = this.manager.engine;
    if (!engine || engine.id !== 'piper') {
      this._running = false;
      this._fail('Piper voice unavailable — check that the voice pack is installed');
      return null;
    }

    const store = this.manager.preparedStore;
    if (!store) {
      this._running = false;
      this._fail('Prepared audio storage unavailable');
      return null;
    }

    const live = window.PreparedSession.liveConfig(this.manager, this.bridge);
    const start = this._currentPosition(); // { bookId, bookCode, chapter, verse, bookName }
    if (!start) {
      this._running = false;
      this._fail('No current reading position');
      return null;
    }

    const session = window.PreparedSession.create({
      translationId: live.translationId,
      startRef: window.PreparedSession.refFor(start.bookCode, start.chapter, start.verse),
      targetDuration: targetSeconds,
      voiceId: live.voiceId,
      speakerId: live.speakerId,
      model: live.model,
      lengthScale: live.lengthScale,
      noiseScale: live.noiseScale,
      noiseW: live.noiseW,
      sentenceSilence: live.sentenceSilence,
      configHash: window.PreparedSession.configHash(live),
      format: this.manager.preparedFormat || 'wav'
    });
    this._session = session;

    const encoder = window.PreparedAudioEncoder.create(session.format, { sampleRate: 22050, channels: 1 });
    const seq = await this._resolveQueue(start);
    if (!seq.length) {
      this._running = false;
      this._fail('Nothing to prepare');
      return null;
    }

    this._acquireWakeLock();
    try {
      const { header } = await encoder.begin();
      await store.begin(session, header);

      let frames = 0;         // per-channel frames written
      let seconds = 0;        // actual encoded duration
      let gapFrames = 0;

      for (let i = 0; i < seq.length; i++) {
        if (this._cancel) throw this._canceled();
        // Yield to interactive playback.
        await this._awaitIdle();
        if (this._cancel) throw this._canceled();

        const item = seq[i];
        let audio;
        try {
          audio = await engine.synthesizeAudio(item, this.manager.getSynthesisOptions());
        } catch (err) {
          if (err && err.canceled) {
            // Playback (or another cancel) took the worker — back off and retry
            // this verse once playback is idle, unless we were told to stop.
            if (this._cancel) throw this._canceled();
            i--; // re-attempt the same verse
            await this._awaitIdle();
            continue;
          }
          throw err;
        }
        if (this._cancel) throw this._canceled();

        const pcm = audio.pcm;
        if (!pcm || !pcm.length) continue;

        // Inter-verse silence so chapter/verse boundaries breathe.
        if (i > 0 && PreparationService.GAP_SECONDS > 0) {
          const gap = new Float32Array(Math.round(PreparationService.GAP_SECONDS * 22050));
          const gbytes = encoder.encodeChunk(gap);
          await store.append(gbytes, session);
          frames += gap.length;
        }

        const startSec = frames / 22050;
        const bytes = encoder.encodeChunk(pcm);
        await store.append(bytes, session);
        frames += pcm.length;
        seconds = frames / 22050;

        session.verses.push({
          ref: item.verseId ? window.PreparedSession.refFor(item.verseId.book, item.verseId.chapter, item.verseId.verse) : null,
          start: startSec,
          speechEnd: seconds,
          end: seconds // patched with the following gap's start below
        });
        session.actualDuration = seconds;
        session.endRef = session.verses[session.verses.length - 1].ref;
        // Drop the Float32 reference immediately (Blob/OPFS holds the encoded
        // bytes; only the compact Int16 copy ever lives past this line).
        audio = null;

        this._emitProgress(seconds, targetSeconds, session);
        if (i % 5 === 0) await store.updateMeta(session).catch(() => {});

        if (seconds >= targetSeconds) break;
      }

      if (this._cancel) throw this._canceled();

      // Fix up each entry's `end` to include its trailing gap (so gap time maps
      // to the preceding verse), then finalize.
      for (let i = 1; i < session.verses.length; i++) {
        session.verses[i - 1].end = session.verses[i].start;
      }
      const { header: patched } = await encoder.finalize(frames);
      await store.finalize(session, patched);
      this._diagnostics('prepareCompleted', {
        actualDuration: session.actualDuration, verses: session.verses.length, bytes: session.byteSize
      });
      this.status = { phase: 'ready', session };
      this._running = false;
      this._releaseWakeLock();
      this.bridge.emit('tts:prepared-changed', { active: true, session: this._summary(session) });
      this.bridge.emit('tts:prepare-status', this.status);
      return session;
    } catch (err) {
      await store.abort().catch(() => {});
      this._running = false;
      this._releaseWakeLock();
      if (err && err.canceled) {
        this._diagnostics('prepareCanceled', {});
        this.status = { phase: 'idle' };
        this.bridge.emit('tts:prepare-status', this.status);
        return null;
      }
      this._fail(err && err.message ? err.message : String(err));
      return null;
    } finally {
      this._session = null;
    }
  }

  // Cancel an in-flight preparation (user, or an incompatible change).
  cancel(reason) {
    if (!this._running) return false;
    this._cancel = true;
    this._diagnostics('prepareCanceled', { reason: reason || 'user' });
    // Nudge the engine so an in-flight verse settles immediately.
    const engine = this.manager.engine;
    if (engine && engine.cancel) engine.cancel();
    this._wakeSynth();
    return true;
  }

  // Load the currently active prepared session (metadata + audio URL) at
  // startup / on demand. Returns { session, url, blob } or null.
  async loadActive() {
    const store = this.manager.preparedStore;
    if (!store) return null;
    return store.loadActive();
  }

  async activeMeta() {
    const store = this.manager.preparedStore;
    return store ? store.activeMeta() : null;
  }

  // Is a prepared session playable with the CURRENT config?
  async compatibleActive() {
    const meta = await this.activeMeta();
    if (!meta) return { compatible: false, reason: 'none', session: null };
    const live = window.PreparedSession.liveConfig(this.manager, this.bridge);
    const c = window.PreparedSession.compatibility(meta, live);
    return { compatible: c.compatible, reason: c.reason, session: meta };
  }

  async clear() {
    const store = this.manager.preparedStore;
    if (!store) return;
    await store.clear();
    this.status = { phase: 'idle' };
    this.bridge.emit('tts:prepare-status', this.status);
  }

  async usage() {
    const store = this.manager.preparedStore;
    return store ? store.usage() : { preparedBytes: 0, quota: null, used: null };
  }

  // ── internals ────────────────────────────────────────────────────────────

  // The Piper voice preparation must synthesize with: the explicitly selected
  // Natural Voice, else the engine-scoped default. Returns { model, sid } or
  // null when no Piper voice is registered. System voices are never valid here
  // — preparation writes audio files, which system speech cannot do.
  _resolvePiperVoice() {
    const manager = this.manager;
    const registry = manager && manager.registry;
    if (!registry) return null;
    const savedId = this.bridge.state.get('ttsVoice');
    let voice = savedId ? registry.getVoice(savedId) : null;
    if (!voice || voice.engine !== 'piper') {
      voice = registry.getDefaultVoice('piper');
    }
    if (!voice || voice.engine !== 'piper') return null;
    const model = voice.raw && voice.raw.model;
    if (!model) return null;
    const sid = voice.raw && Number.isInteger(voice.raw.sid) ? voice.raw.sid : 0;
    return { model, sid };
  }

  // Make sure the Piper voice's model pack is in OPFS, downloading it (with
  // progress surfaced through the existing pack-status line) when needed.
  async _ensurePack(voice) {
    const packs = this.manager.packs;
    if (!packs || !voice || !voice.model) return;
    let installed = false;
    try {
      installed = await packs.isInstalled(voice.model);
    } catch (e) {
      installed = true; // pack service/idb unavailable -> let the engine try
    }
    if (installed) return;
    await packs.ensureInstalled(voice.model, {
      onProgress: (p) => this.bridge.emit('tts:pack-progress', { model: voice.model, ...p })
    });
  }

  _currentPosition() {
    const state = this.bridge.state;
    const bookId = state.get('currentBook');
    const chapter = state.get('currentChapter');
    const verse = state.get('currentVerse') || 1;
    if (!bookId || !chapter) return null;
    const bookCode = this.bridge.db && this.bridge.db.idToCode ? this.bridge.db.idToCode(bookId) : null;
    if (!bookCode) return null;
    return { bookId, bookCode, chapter, verse, bookName: state.get('currentBookName') || '' };
  }

  // Build the ordered verse queue across chapter boundaries from `start`,
  // loading at most a generous cap of chapters. Stops early once enough verses
  // to likely exceed a 90-minute request are collected (the duration check is
  // authoritative, but this avoids loading the whole Bible).
  async _resolveQueue(start) {
    const db = this.bridge.db;
    if (!db) return [];
    const books = await db.getBooks();
    let bookIdx = books.findIndex(b => b.id === start.bookId);
    if (bookIdx < 0) return [];
    const out = [];
    let chapter = start.chapter;
    let fromVerse = start.verse;
    const maxVerses = PreparationService.MAX_QUEUE_VERSES;
    while (bookIdx < books.length && out.length < maxVerses) {
      const book = books[bookIdx];
      const code = db.idToCode(book.id);
      const rows = await db.getChapterTokens(code, chapter);
      for (const r of rows) {
        if (chapter === start.chapter && r.verse < fromVerse) continue;
        const text = (r.clean_text || '').trim();
        if (!text) continue;
        out.push({ verseId: { book: code, chapter, verse: r.verse }, text, bookId: book.id, bookCode: code });
      }
      // Advance: same book next chapter, else next book chapter 1.
      const total = await db.getChapterCount(book.id);
      if (chapter < total) {
        chapter += 1;
      } else {
        bookIdx += 1;
        chapter = 1;
      }
      fromVerse = 1;
    }
    return out;
  }

  // Resolve when interactive playback is not active (so preparation owns the
  // worker). Event-driven via the tts:state bridge event; also polled as a
  // safety net in case a state transition is missed.
  _awaitIdle() {
    const controller = this.manager.controller;
    const isActive = () => controller && controller.isActive;
    if (!isActive()) return Promise.resolve();
    return new Promise((resolve) => {
      this._idleResolve = resolve;
      this._idleOff = this.bridge.on('tts:state', (p) => {
        const s = p && p.state;
        if (s === 'idle' || s === 'stopping' || s === 'error') this._wakeSynth();
      });
      this._idleTimer = setInterval(() => {
        if (!isActive()) this._wakeSynth();
      }, 500);
    }).then(() => {
      this._wakeSynth();
      if (this._idleTimer) { clearInterval(this._idleTimer); this._idleTimer = null; }
      if (this._idleOff) { try { this._idleOff(); } catch (e) { /* ignore */ } this._idleOff = null; }
    });
  }

  _wakeSynth() {
    if (this._idleResolve) {
      const r = this._idleResolve;
      this._idleResolve = null;
      r();
    }
  }

  _emitProgress(seconds, target, session) {
    this.status = {
      phase: 'preparing',
      generatedSeconds: seconds,
      targetSeconds: target,
      verseCount: session.verses.length,
      currentRef: session.endRef,
      startRef: session.startRef,
      endRef: session.endRef,
      percent: target > 0 ? Math.min(100, Math.round((seconds / target) * 100)) : 0
    };
    this.bridge.emit('tts:prepare-status', this.status);
  }

  _fail(message) {
    this.status = { phase: 'error', error: message };
    this._diagnostics('prepareFailed', { error: message });
    this.bridge.emit('tts:prepare-status', this.status);
    this.bridge.emit('tts:error', { reason: 'prepare-failed', error: message });
  }

  _summary(session) {
    return {
      id: session.id,
      format: session.format,
      byteSize: session.byteSize,
      actualDuration: session.actualDuration,
      targetDuration: session.targetDuration,
      verseCount: session.verses.length,
      startRef: session.startRef,
      endRef: session.endRef,
      configHash: session.configHash
    };
  }

  _canceled() {
    const e = new Error('preparation canceled');
    e.canceled = true;
    return e;
  }

  _diagnostics(stage, data) {
    if (window.TTSDiagnostics) window.TTSDiagnostics.mark(stage, data);
  }

  _acquireWakeLock() {
    // Preparation is the one place a Screen Wake Lock IS the right tool: keep
    // the device awake so generation completes. Best-effort only.
    try {
      if (typeof navigator === 'undefined' || !navigator.wakeLock || typeof navigator.wakeLock.request !== 'function') {
        this.bridge.emit('tts:wake-lock', { state: 'unavailable' });
        return null;
      }
      navigator.wakeLock.request('screen').then((lock) => {
        this._wakeLockSentinel = lock;
        this.bridge.emit('tts:wake-lock', { state: 'acquired' });
      }).catch(() => {
        this.bridge.emit('tts:wake-lock', { state: 'failed' });
      });
    } catch (e) { /* ignore */ }
    return true;
  }

  _releaseWakeLock() {
    const lock = this._wakeLockSentinel;
    this._wakeLockSentinel = null;
    if (lock && typeof lock.release === 'function') {
      try { lock.release(); } catch (e) { /* ignore */ }
      this.bridge.emit('tts:wake-lock', { state: 'released' });
    }
  }
};

PreparationService.GAP_SECONDS = 0.4;
PreparationService.MAX_QUEUE_VERSES = 900;
