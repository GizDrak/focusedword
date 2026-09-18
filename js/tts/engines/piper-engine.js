// piper-engine.js — Piper neural TTS engine.
//
// Bridges the main thread to a dedicated classic worker (piper-worker.js)
// that drives the vendored eSpeak-ng phonemizer plus a vendored
// onnxruntime-web build. The ORT build is platform-split (see
// TTSCapabilities.ortRuntime): iOS keeps 1.18.0 (wasm-only, non-threaded
// binary), Android/desktop use 1.29.0 (threaded-only, ES-module glue; single-
// threaded when the page is not cross-origin isolated). Piper is the app's
// neural TTS engine on every device class; output is 22050 Hz mono Float32 PCM
// played through AudioOutput — the contract PlaybackController's look-ahead
// expects.
//
// Lifecycle guarantees (docs/tts.md):
//   - One engine resident at a time; TTSManager disposes the old engine
//     before loading the next one on the engine ladder, and releases the
//     Piper engine on stop / pause-idle when running on mobile (iOS memory).
//   - One synthesis in flight; skip/stop cancels cleanly and rejects the
//     pending synthesize() with {canceled:true}.

window.PiperEngine = class PiperEngine extends window.BaseTTSEngine {
  constructor(bridge) {
    super(bridge);
    this._worker = null;
    this._audio = null;
    this._msgId = 0;
    this._gen = 0;
    this._pending = null;
    this._initWait = null;
    this._voice = null;
    this._dtype = 'fp32';
    this._sampleRate = 22050;
    this._lastProgressPct = -1;
    // Mobile stability pass: periodic full worker recreation (every RECYCLE_EVERY
    // completed verses) to cap peak ORT-wasm + phonemizer memory, and a
    // diagnostic breadcrumb trail through sessionStorage (currently off).
    this._activeVoice = null;        // { model, sid } the worker was INIT'd with
    this._completedVerses = 0;       // completed Piper verses (drives recycling)
    this._completedSyntheses = 0;    // completed synthesis results (diagnostics)
    this._recycling = false;
    this._bench = null;              // in-flight benchmark request
    this._benchPromise = null;
  }

  get id() {
    return 'piper';
  }

  get label() {
    return 'Piper';
  }

  // Where each model pack lives in OPFS (tts/piper/<lang>/<model>/<file>),
  // written by tts-pack-service on download-on-select. Mirrors the pack
  // manifest `files[]` names so the main thread can read the bytes the worker
  // requests (MODEL_REQUEST round-trip).
  static get OPFS_ROOT() {
    return 'tts/piper';
  }

  static get MODEL_INFO() {
    return {
      'vctk-medium': { lang: 'en_gb', file: 'en_GB-vctk-medium.onnx' },
      'libritts_r-medium': { lang: 'en_us', file: 'en_US-libritts_r-medium.onnx' },
      // Original-language word pronunciation (word-study overlay). These are
      // deliberately NOT in VOICES: they exist for short phrase playback only,
      // never as selectable narrator voices.
      'he_IL-saspeech-medium': { lang: 'he_il', file: 'he_IL-saspeech-medium.onnx' },
      'el_GR-rapunzelina-medium': { lang: 'el_gr', file: 'el_GR-rapunzelina-medium.onnx' }
    };
  }

  // Curated narrator voices, eight American + four British per the multi-speaker
  // packs. Each descriptor carries the model key + speaker id (Piper model sid)
  // the worker needs, plus a stable voiceURI that becomes the application voice
  // id (piper:<uri>). `gender` is shown in the voice picker; `speaker` is the
  // source dataset id (LibriTTS-R speaker / VCTK p-id) for reference — the
  // model uses `sid`.
  static get VOICES() {
    return [
      // LibriTTS-R (en-US)
      { voiceURI: 'libritts-emma', name: 'Emma', gender: 'Female', speaker: 3922, lang: 'en-US', model: 'libritts_r-medium', sid: 0 },
      { voiceURI: 'libritts-claire', name: 'Claire', gender: 'Female', speaker: 192, lang: 'en-US', model: 'libritts_r-medium', sid: 98 },
      { voiceURI: 'libritts-aaron', name: 'Aaron', gender: 'Male', speaker: 7874, lang: 'en-US', model: 'libritts_r-medium', sid: 50 },
      { voiceURI: 'libritts-grant', name: 'Grant', gender: 'Male', speaker: 7460, lang: 'en-US', model: 'libritts_r-medium', sid: 104 },
      { voiceURI: 'libritts-naomi', name: 'Naomi', gender: 'Female', speaker: 7484, lang: 'en-US', model: 'libritts_r-medium', sid: 208 },
      { voiceURI: 'libritts-wesley', name: 'Wesley', gender: 'Male', speaker: 7313, lang: 'en-US', model: 'libritts_r-medium', sid: 386 },
      { voiceURI: 'libritts-marcus', name: 'Marcus', gender: 'Male', speaker: 7956, lang: 'en-US', model: 'libritts_r-medium', sid: 491 },
      { voiceURI: 'libritts-nathan', name: 'Nathan', gender: 'Male', speaker: 4290, lang: 'en-US', model: 'libritts_r-medium', sid: 497 },
      // VCTK (en-GB)
      { voiceURI: 'vctk-henry', name: 'Henry', gender: 'Male', speaker: 'p287', lang: 'en-GB', model: 'vctk-medium', sid: 23 },
      { voiceURI: 'vctk-james', name: 'James', gender: 'Male', speaker: 'p258', lang: 'en-GB', model: 'vctk-medium', sid: 57 },
      { voiceURI: 'vctk-amelia', name: 'Amelia', gender: 'Female', speaker: 's5', lang: 'en-GB', model: 'vctk-medium', sid: 73 },
      { voiceURI: 'vctk-eleanor', name: 'Eleanor', gender: 'Female', speaker: 'p228', lang: 'en-GB', model: 'vctk-medium', sid: 90 }
    ];
  }

  isAvailable() {
    return typeof Worker !== 'undefined' &&
      typeof Promise !== 'undefined' &&
      typeof Float32Array !== 'undefined' &&
      typeof BigInt64Array !== 'undefined' &&
      typeof fetch !== 'undefined';
  }

  // opts may carry { model, sid } — the voice the manager resolved for this
  // engine — so the warm-up session uses the SAME model that is actually
  // installed/downloaded in OPFS. Without it, the worker would warm the
  // static VOICES[0] default, which may not be the pack that was downloaded.
  // Pick the playback backend: a real <audio> element on platforms that need
  // OS media controls / screen-off playback (see TTSCapabilities), else the
  // AudioContext path. Both expose the same contract.
  _makeAudio() {
    const caps = window.TTSCapabilities;
    if (caps && typeof caps.usesMediaElementOutput === 'function' &&
        caps.usesMediaElementOutput() && window.MediaElementAudioOutput) {
      return new window.MediaElementAudioOutput();
    }
    return new window.AudioOutput();
  }

  async load(opts) {
    if (this.loaded) return true;
    if (!this.isAvailable()) return false;
    this._audio = this._audio || this._makeAudio();
    this._completedVerses = 0;
    this._completedSyntheses = 0;
    this._recycling = false;
    try {
      await this._spawnWorker(opts);
      this.loaded = true;
      return true;
    } catch (err) {
      this._terminateWorker();
      throw err;
    }
  }

  // iOS: create + resume the AudioContext synchronously inside the gesture
  // that starts playback (synthesis happens long after the tap, so the
  // context must already be running). Called by TTSManager.unlock().
  unlockAudio() {
    this._audio = this._audio || this._makeAudio();
    this._audio.unlock();
  }

  _spawnWorker(opts) {
    this._terminateWorker();
    const defaultVoice = this._defaultVoice();
    const model = (opts && opts.model) || (defaultVoice ? defaultVoice.model : 'vctk-medium');
    const sid = (opts && Number.isInteger(opts.sid)) ? opts.sid : (defaultVoice ? defaultVoice.sid : 0);
    this._activeVoice = { model, sid };
    return new Promise((resolve, reject) => {
      let settled = false;
      let worker;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Piper worker init timed out'));
      }, 120000);

      const cleanup = () => {
        clearTimeout(timeout);
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
      };
      const onMessage = (event) => {
        const msg = event.data || {};
        if (settled) return;
        if (msg.type === 'INIT_OK') {
          settled = true;
          cleanup();
          this._dtype = msg.dtype || 'fp32';
          this._sampleRate = msg.sampleRate || 22050;
          this._device = msg.device || 'wasm';
          console.warn('[TTS] Piper ACTIVE BACKEND: ' + (msg.device === 'webgpu' ? 'WebGPU' : 'WASM'));
          console.warn('[TTS] Piper dtype: ' + this._dtype);
          console.warn('[TTS] Piper model: ' + (msg.model || 'unknown'));
          resolve();
          return;
        }
        if (msg.type === 'INIT_ERR') {
          settled = true;
          cleanup();
          const detail = msg.detail && msg.detail.error
            ? msg.detail.error
            : (msg.error || 'unknown');
          console.error('[TTS] Piper init failed: ' + detail);
          reject(new Error('Piper init failed: ' + detail));
        }
      };
      const onError = (event) => {
        if (settled) return;
        settled = true;
        cleanup();
        const detail = event && event.message ? event.message : 'worker error';
        reject(new Error('Piper worker error: ' + detail));
      };

      // Classic worker (not module): the phonemizer UMD needs importScripts.
      worker = new Worker('/js/tts/piper-worker.js');
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      this._worker = worker;
      this._wireRuntime(worker);
      const caps = window.TTSCapabilities;
      const tuning = (caps && typeof caps.ortTuning === 'function') ? caps.ortTuning() : null;
      const ort = (caps && typeof caps.ortRuntime === 'function') ? caps.ortRuntime() : null;
      worker.postMessage({
        type: 'INIT',
        id: ++this._msgId,
        model,
        sid,
        tuning,
        ort
      });
    });
  }

  _defaultVoice() {
    const list = window.PiperEngine.VOICES;
    return list[0] || null;
  }

  // Dev/QA: run one synthesis under a specific ORT tuning and resolve with its
  // RTF, so candidate settings can be A/B'd on a real device. Rebuilds the
  // worker's session; never runs concurrently with synthesis (serialized via a
  // dedicated promise). `tuning` may omit fields to inherit the defaults from
  // TTSCapabilities.ortTuning().
  async runBenchmark(tuning, text) {
    if (!this._worker) throw new Error('Piper engine not loaded');
    if (this._benchPromise) return this._benchPromise;
    const caps = window.TTSCapabilities;
    const base = (caps && typeof caps.ortTuning === 'function') ? caps.ortTuning() : {};
    const merged = Object.assign({}, base, tuning || {});
    this._benchPromise = new Promise((resolve, reject) => {
      const id = ++this._msgId;
      const timeout = setTimeout(() => {
        this._bench = null;
        reject(new Error('Piper benchmark timed out'));
      }, 180000);
      this._bench = {
        id,
        resolve: (r) => { clearTimeout(timeout); resolve(r); },
        reject: (e) => { clearTimeout(timeout); reject(e); }
      };
      this._worker.postMessage({
        type: 'BENCHMARK',
        id,
        text: text || null,
        tuning: merged
      });
    }).finally(() => { this._bench = null; this._benchPromise = null; });
    return this._benchPromise;
  }

  _wireRuntime(worker) {
    worker.addEventListener('message', (event) => {
      const msg = event.data || {};
      // The worker requests model bytes over MODEL_REQUEST (it cannot read
      // OPFS itself); the main thread reads OPFS and transfers the .onnx back.
      if (msg.type === 'MODEL_REQUEST') {
        this._onModelRequest(msg);
        return;
      }
      this._onWorkerMessage(msg);
    });
    worker.addEventListener('error', (event) => {
      const detail = event && event.message ? event.message : 'worker crashed';
      if (this._initWait) {
        const wait = this._initWait;
        this._initWait = null;
        wait.reject(new Error('Piper worker error: ' + detail));
      }
      if (this._pending) {
        const p = this._pending;
        this._pending = null;
        p.reject(new Error('Piper worker error: ' + detail));
      }
    });
  }

  // Reads a model pack's bytes from OPFS (on the main thread, where the pack
  // service proved OPFS access) and hands the .onnx to the worker via a
  // transferred ArrayBuffer, plus the .onnx.json metadata when present.
  async _loadModelBytes(model) {
    const info = window.PiperEngine.MODEL_INFO[model];
    if (!info) throw new Error('unknown piper model "' + model + '"');
    if (!navigator.storage || !navigator.storage.getDirectory) {
      throw new Error('OPFS unavailable on this device');
    }
    const root = await navigator.storage.getDirectory();
    let dir = root;
    for (const seg of (window.PiperEngine.OPFS_ROOT + '/' + info.lang + '/' + model).split('/')) {
      if (!seg) continue;
      dir = await dir.getDirectoryHandle(seg);
    }
    const onnxHandle = await dir.getFileHandle(info.file);
    const onnx = await (await onnxHandle.getFile()).arrayBuffer();
    let json = null;
    try {
      const jsonHandle = await dir.getFileHandle(info.file + '.json');
      json = await (await jsonHandle.getFile()).text();
    } catch (e) { /* json optional */ }
    return { onnx, json };
  }

  async _onModelRequest(msg) {
    const worker = this._worker;
    if (!worker) return;
    try {
      const { onnx, json } = await this._loadModelBytes(msg.model);
      worker.postMessage({ type: 'MODEL_BYTES', id: msg.id, model: msg.model, onnx, json }, [onnx]);
    } catch (err) {
      try {
        worker.postMessage({
          type: 'MODEL_ERR',
          id: msg.id,
          model: msg.model,
          error: err && err.message ? err.message : String(err)
        });
      } catch (e) { /* worker gone */ }
    }
  }

  _emitProgress(data) {
    const p = data || {};
    if (p.status === 'progress' && /\.onnx$/.test(p.file || '')) {
      const pct = p.total ? Math.floor((p.loaded / p.total) * 4) : -1;
      if (pct > this._lastProgressPct) {
        this._lastProgressPct = pct;
        console.warn('[piper] model download ' + Math.round((p.loaded || 0) / 1048576) + 'MB / ' + Math.round((p.total || 0) / 1048576) + 'MB');
      }
    } else if (p.status === 'initiate' || p.status === 'done') {
      console.warn('[piper] asset ' + p.status + ': ' + (p.file || '?') + (p.total != null ? ' (' + Math.round(p.total / 1024) + 'KB)' : ''));
    }
    this.bridge.emit('tts:load-progress', p);
  }

  _onWorkerMessage(msg) {
    if (msg.type === 'DIAG') {
      this._onDiag(msg);
      return;
    }
    if (msg.type === 'BREADCRUMB') {
      this._onBreadcrumb(msg);
      return;
    }
    if (msg.type === 'BENCHMARK_RESULT') {
      const bench = this._bench;
      if (bench && bench.id === msg.id) {
        this._bench = null;
        if (msg.ok) bench.resolve(msg);
        else bench.reject(new Error(msg.error || 'benchmark failed'));
      }
      return;
    }
    const pending = this._pending;
    if (!pending || msg.gen !== pending.gen) return;
    if (msg.type === 'AUDIO') {
      this._pending = null;
      this._completedSyntheses++;
      pending.resolve({ pcm: msg.pcm, sampleRate: msg.sampleRate || 22050 });
    } else if (msg.type === 'ERR') {
      this._pending = null;
      pending.reject(new Error(msg.error || 'synthesis failed'));
    }
  }

  // Persists a worker breadcrumb to the sessionStorage diagnostics trail so an
  // unexpected iOS process reload can be reconstructed (workers have no
  // sessionStorage access, so the main thread funnels it).
  _onBreadcrumb(msg) {
    if (msg.stage && window.TTSDiagnostics) {
      window.TTSDiagnostics.mark(msg.stage, {
        verseId: msg.verseId || null,
        completed: this._completedSyntheses,
        ...(msg.info || {})
      });
    }
  }

  _markStage(stage, data) {
    if (window.TTSDiagnostics) window.TTSDiagnostics.mark(stage, data);
  }

  // Structured init diagnostics from the worker.
  _onDiag(msg) {
    const { stage, status, error, info } = msg;
    console.warn('[TTS] Piper [wasm:fp32] ' + stage + ' ' + status + (error ? ' — ' + error : ''));
    this.bridge.emit('tts:diag', {
      stage,
      device: msg.device || 'wasm',
      dtype: msg.dtype || 'fp32',
      status,
      error: error || null,
      info: info || null
    });
  }

  getVoices() {
    return window.PiperEngine.VOICES.slice();
  }

  async getCapabilities() {
    const available = await this.isAvailable();
    return {
      engine: this.id,
      available,
      group: 'natural',
      speed: true,
      pause: true,
      voiceSelection: true,
      streaming: false,
      voices: this.getVoices().map(v => ({ uri: v.voiceURI, name: v.name, lang: v.lang }))
    };
  }

  async synthesize(chunk, opts = {}) {
    const audio = await this.synthesizeAudio(chunk, opts);
    await this.playAudio(audio);
    return { spoken: true };
  }

  // Synthesizes text into PCM WITHOUT playing it, so PlaybackController can
  // look ahead (pre-buffer the next verse while the current one plays).
  async synthesizeAudio(chunk, opts = {}) {
    if (!this.loaded || !this._worker) {
      throw new Error('Piper engine not loaded');
    }
    if (this._pending) this._failPending({ canceled: true });
    const gen = ++this._gen;
    const voice = this._resolveVoice(opts);
    const rate = this._clampRate(opts.rate);
    // Per-voice synthesis defaults (piper-voice-config.js): the 1.0x
    // lengthScale, plus noiseScale/noiseW/sentenceSilence. The worker derives
    // lengthScale = lengthScale / rate and applies the rest verbatim, so 1.0x
    // speaks at the tuned speed and every other speed scales from there.
    const cfg = this._voiceConfig(voice);
    const verseId = (chunk && chunk.verseId) || null;
    const result = await this._requestSynthesis(chunk.text, voice, rate, gen, verseId, cfg);
    return { pcm: result.pcm, sampleRate: result.sampleRate };
  }

  // Resolves the per-voice tuning for the active voice. Returns
  // { lengthScale, noiseScale, noiseW, sentenceSilence }; voices with no entry
  // fall back to lengthScale 1.0 (native speed) and null noise/silence (the
  // worker then uses the pack's own .onnx.json defaults).
  _voiceConfig(voice) {
    const fallback = { lengthScale: 1, noiseScale: null, noiseW: null, sentenceSilence: 0 };
    const table = window.PIPER_VOICE_CONFIG;
    if (!table || !voice) return fallback;
    const info = window.PiperEngine.VOICES.find(
      v => v.model === voice.model && v.sid === voice.sid
    );
    const key = info ? String(info.name).toLowerCase() : null;
    const entry = key ? table[key] : null;
    if (!entry || typeof entry !== 'object') return fallback;
    const num = (v, def) => (Number.isFinite(Number(v)) ? Number(v) : def);
    return {
      lengthScale: num(entry.lengthScale, 1),
      noiseScale: entry.noiseScale == null ? null : num(entry.noiseScale, null),
      noiseW: entry.noiseW == null ? null : num(entry.noiseW, null),
      sentenceSilence: num(entry.sentenceSilence, 0)
    };
  }

  // Plays previously synthesized PCM via the shared output. On the media-element
  // path this becomes a one-unit track so the audible route is always a WAV
  // Blob through HTMLAudioElement.
  async playAudio(audio, cue) {
    if (!audio || !(audio.pcm instanceof Float32Array) || !audio.pcm.length) {
      throw new Error('Piper playAudio() received invalid audio');
    }
    await this._audio.play(audio.pcm, audio.sampleRate || 22050, cue ? { cue } : {});
  }

  _resolveVoice(opts) {
    const v = opts && opts.voice;
    if (v && v.engine === 'piper') {
      const raw = (v.raw && typeof v.raw === 'object') ? v.raw : null;
      let model = raw && raw.model;
      if (!model) {
        const uri = raw ? raw.voiceURI : (v.uri || v.voiceURI);
        if (uri) model = this._modelForURI(uri);
      }
      const sid = raw && Number.isInteger(raw.sid) ? raw.sid : 0;
      this._voice = { model: model || 'vctk-medium', sid };
      return this._voice;
    }
    if (!this._voice) this._voice = { model: 'vctk-medium', sid: 0 };
    return this._voice;
  }

  _modelForURI(uri) {
    const v = window.PiperEngine.VOICES.find(x => x.voiceURI === uri);
    return v ? v.model : 'vctk-medium';
  }

  _requestSynthesis(text, voice, rate, gen, verseId, voiceConfig) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this._pending && this._pending.gen === gen) {
          this._pending = null;
          reject(new Error('Piper synthesis timed out'));
        }
      }, 180000);
      const wrapped = {
        gen,
        resolve: (value) => { clearTimeout(timeout); resolve(value); },
        reject: (err) => { clearTimeout(timeout); reject(err); }
      };
      this._pending = wrapped;
      const id = ++this._msgId;
      const cfg = voiceConfig || {};
      this._worker.postMessage({
        type: 'SYNTHESIZE',
        id,
        gen,
        text,
        verseId: verseId || null,
        voice: voice ? { model: voice.model, sid: voice.sid } : null,
        rate,
        lengthScaleBase: (Number.isFinite(cfg.lengthScale) && cfg.lengthScale > 0) ? cfg.lengthScale : 1,
        noiseScale: Number.isFinite(cfg.noiseScale) ? cfg.noiseScale : null,
        noiseW: Number.isFinite(cfg.noiseW) ? cfg.noiseW : null,
        sentenceSilence: Number.isFinite(cfg.sentenceSilence) ? cfg.sentenceSilence : 0
      });
    });
  }

  pause() {
    this._audio.suspend();
    if (this._pending) {
      const p = this._pending;
      this._pending = null;
      p.reject({ canceled: true });
      this._postCancel(p.gen);
    }
  }

  resume() {
    this._audio.resume();
  }

  needsRestart() {
    return false;
  }

  clearRestart() {}

  isBusy() {
    return this._audio ? this._audio.active : false;
  }

  // Media Session clock: seconds elapsed / total of the active PCM buffer.
  // Null when nothing is playing, so the lock-screen progress bar is skipped.
  playbackPosition() {
    return this._audio ? this._audio.position : null;
  }

  playbackDuration() {
    return this._audio ? this._audio.duration : null;
  }

  cancel() {
    if (this._pending) this._failPending({ canceled: true });
    this._postCancel(this._gen);
    this._audio.stop();
  }

  _failPending(reason) {
    const p = this._pending;
    if (!p) return;
    this._pending = null;
    p.reject(reason);
    this._postCancel(p.gen);
  }

  // Mobile stability pass: count completed verses; every RECYCLE_EVERY-th verse
  // (only on memory-constrained mobile devices) fully recycles the worker —
  // releases the ONNX session, terminates the worker, and spawns a fresh one on
  // the SAME voice — so peak ORT-wasm + phonemizer memory never grows unbounded.
  // PlaybackController calls this at a verse boundary (audio already finished),
  // never mid-verse.
  async onVerseComplete() {
    this._completedVerses++;
    if (!this._isMobile()) return false;
    if (this._recycling) return false;
    if (this._completedVerses % this.constructor.RECYCLE_EVERY !== 0) return false;
    await this._recycleWorker();
    return true;
  }

  static get RECYCLE_EVERY() {
    return 15;
  }

  _isMobile() {
    const caps = window.TTSCapabilities;
    return !!(caps && typeof caps.isMobile === 'function' && caps.isMobile());
  }

  async _recycleWorker() {
    this._recycling = true;
    const verses = this._completedVerses;
    this._markStage('worker-recycle-start', { verses, recycle: this.constructor.RECYCLE_EVERY });
    try {
      // A verse just completed, so there is no active audio to interrupt; only
      // abort any in-flight look-ahead synthesis so it cannot hit a dying worker.
      this._failPending({ canceled: true });
      const voice = this._activeVoice || { model: 'vctk-medium', sid: 0 };
      await this._terminateWorkerAndWait();
      await this._spawnWorker(voice);
    } finally {
      this._recycling = false;
      this._markStage('worker-recycle-end', { verses });
    }
  }

  // Posts DISPOSE to the current worker and waits until it acknowledges
  // (DISPOSED, after releasing its ONNX session) or a safety timeout, then
  // terminates it — so a replacement worker is NEVER spawned while the old one
  // is still alive (exactly one Piper worker exists at a time).
  _terminateWorkerAndWait() {
    const worker = this._worker;
    this._worker = null;
    if (!worker) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { worker.terminate(); } catch (e) { /* ignore */ }
        resolve();
      };
      const onMsg = (event) => {
        const m = event.data || {};
        if (m.type === 'DISPOSED') done();
      };
      worker.addEventListener('message', onMsg);
      const timer = setTimeout(done, 2000);
      try {
        worker.postMessage({ type: 'DISPOSE', id: ++this._msgId });
      } catch (e) {
        done();
      }
    });
  }

  _postCancel(gen) {
    if (!this._worker) return;
    try {
      this._worker.postMessage({ type: 'CANCEL', id: ++this._msgId, gen });
    } catch (e) { /* worker gone */ }
  }

  async dispose() {
    this.cancel();
    this._terminateWorker();
    if (this._audio) {
      await this._audio.close();
      this._audio = null;
    }
    await super.dispose();
  }

  _terminateWorker() {
    const worker = this._worker;
    this._worker = null;
    if (!worker) return;
    try {
      worker.postMessage({ type: 'DISPOSE', id: ++this._msgId });
    } catch (e) { /* ignore */ }
    setTimeout(() => {
      try { worker.terminate(); } catch (e) { /* ignore */ }
    }, 500);
  }

  _clampRate(rate) {
    const n = Number(rate);
    if (!n || Number.isNaN(n)) return 1;
    return Math.min(2, Math.max(0.4, n));
  }
};