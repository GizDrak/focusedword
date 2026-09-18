// piper-worker.js — dedicated classic worker for the Piper TTS engine.
//
// Piper is the app's neural TTS engine (docs/tts.md), running entirely
// offline on tablets/Android/iOS and desktop. This worker drives two
// vendored runtimes:
//
//   1. piper_phonemize (eSpeak-ng WASM, /js/vendor/piper/) converts text to
//      phoneme ids. It is a classic UMD factory (createPiperPhonemize)
//      driven as a CLI through module.callMain(); the JSON result record is
//      printed to stdout and captured via the print callback.
//   2. onnxruntime-web runs the Piper VITS ONNX model with the wasm execution
//      provider. The build is platform-split (main thread picks it; see
//      TTSCapabilities.ortRuntime):
//        - iOS           -> 1.18.0 wasm-only UMD (ort.wasm.min.js), whose
//                           numThreads=1 path selects the NON-threaded
//                           ort-wasm-simd.wasm — no SharedArrayBuffer needed.
//        - Android/desk  -> 1.29.0 (ort.min.js + ES-module glue), threaded-only.
//                           With cross-origin isolation it uses real threads;
//                           without it ORT clamps numThreads to 1 and runs the
//                           threaded binary single-threaded (still instantiates).
//      The chosen { api, wasmPaths } arrives in INIT as `ort`; DEFAULT_ORT
//      keeps a direct worker runnable on 1.18.
//
// Because importScripts() only works in a classic worker, this file is
// launched as a classic Worker (no { type: 'module' }); the ORT UMD build is
// loaded with importScripts() and read back from the self.ort global.
//
// Model bytes are NOT read in this worker: OPFS directory handles are not
// reliably exposed in every browser's worker context, so the worker asks the
// MAIN thread (which wrote the pack to OPFS in the first place) for the model
// bytes with a MODEL_REQUEST round-trip and receives a transferable ArrayBuffer.
//
// Protocol:
//   main -> worker  INIT          { id, model, sid }   model key + speaker to warm
//   worker -> main  MODEL_REQUEST { id, model }        worker needs the .onnx bytes
//   main -> worker  MODEL_BYTES   { id, model, onnx, json }   (onnx transferred)
//   main -> worker  MODEL_ERR     { id, model, error }
//   worker -> main  DIAG          { id, stage, device, dtype, status, error, info }
//   worker -> main  BREADCRUMB    { stage, verseId, info }   sessionStorage diag (main persists)
//   worker -> main  INIT_OK       { id, device, dtype, sampleRate, model }
//   worker -> main  INIT_ERR      { id, error, detail }
//   main -> worker  SYNTHESIZE    { id, gen, text, verseId, voice:{model,sid}, rate, lengthScaleBase, noiseScale, noiseW, sentenceSilence }
//   worker -> main  AUDIO         { id, gen, pcm, sampleRate }   (pcm transferred)
//   worker -> main  ERR           { id, gen, error }
//   main -> worker  CANCEL        { id, gen }
//   main -> worker  DISPOSE       { id }
//   worker -> main  DISPOSED      { id }   session released + worker closing
//
// Audio is mono Float32 PCM at the model's sample rate (22050 Hz) — the
// contract PlaybackController expects from the Piper engine. The ORT session
// is created once per worker (low-memory options: no CPU arena, no memory
// pattern, sequential execution) and reused for every verse until the worker
// is recycled; temporary tensors are released after each synthesis.

// The phonemizer is a classic UMD factory; importScripts exposes the global
// createPiperPhonemize() used in loadPhonemizer() below.
importScripts('/js/vendor/piper/piper_phonemize.js');

const PHONEMIZER_DIR = '/js/vendor/piper/';
const SAMPLE_RATE = 22050;
// The ORT build to load is chosen by the main thread (TTSCapabilities.ortRuntime)
// and arrives in INIT as `ort` ({ api, wasmPaths, threaded, version }). iOS uses
// the 1.18 wasm-only UMD (non-threaded binary); Android/desktop use 1.29
// (threaded-only, ES-module glue). Defaults here keep a direct/no-config worker
// runnable against the 1.18 build.
const DEFAULT_ORT = {
  version: '1.18',
  api: '/js/vendor/onnxruntime/1.18/ort.wasm.min.js',
  threaded: false,
  wasmPaths: '/js/vendor/onnxruntime/1.18/'
};
let ortConfig = null;
// Piper VITS models are trained with a maximum phoneme sequence length.
// Bible verses occasionally exceed it, so text is split into sentence
// groups and each group is synthesized separately, then concatenated.
const MAX_PHONEMES = 400;
const WARMUP_TEXT = 'Hello.';

// Curated voice packs. The .onnx/.onnx.json bytes are fetched from the MAIN
// thread (MODEL_REQUEST round-trip — see header), which reads them from OPFS.
// The inference params below are fallbacks used when the pack's .onnx.json is
// missing/unparseable (authoritative values come from that file).
const MODELS = {
  'vctk-medium': {
    espeakVoice: 'en-gb-x-rp',
    noiseScale: 0.333,
    noiseW: 0.333,
    sampleRate: 22050
  },
  'libritts_r-medium': {
    espeakVoice: 'en-us',
    noiseScale: 0.333,
    noiseW: 0.333,
    sampleRate: 22050
  },
  'he_IL-saspeech-medium': {
    espeakVoice: 'he',
    noiseScale: 0.667,
    noiseW: 0.8,
    sampleRate: 22050
  },
  'el_GR-rapunzelina-medium': {
    espeakVoice: 'el',
    noiseScale: 0.667,
    noiseW: 0.8,
    sampleRate: 22050
  }
};
const DEFAULT_MODEL = 'vctk-medium';
const DEFAULT_SID = 0;

let phonemizer = null;
let phonemizerModule = null;
let phonemizeStdout = [];
let phonemizeStderr = [];
let ortNs = null;
let session = null;
let sessionMeta = null;   // { model, sampleRate, noiseScale, noiseW, espeakVoice }
// ORT throughput configuration, supplied by the main thread (TTS capabilities).
// Applied at loadOrt()/ensureSession(). Kept in one object so a benchmark can
// swap it and rebuild the session.
let ortTuning = {
  threads: 1,
  cpuMemArena: false,
  memPattern: false,
  executionMode: 'sequential',
  graphOptimizationLevel: 'all'
};
let initInProgress = false;
let busy = false;
let activeGen = null;     // generation of the job currently in runOne()
let activeVerseId = null; // verseId of the job currently in runOne()
let cancelActive = false; // true when CANCEL targeted the active generation
const queue = [];

function post(msg, transfer) {
  self.postMessage(msg, transfer || []);
}

function diag(stage, status, error, info) {
  post({
    type: 'DIAG',
    stage,
    device: 'wasm',
    dtype: 'fp32',
    status,
    error: error || null,
    info: info || null
  });
}

// Breadcrumbs have NO sessionStorage access in a worker, so they are posted to
// the main thread, which persists them (see tts-diagnostics.js). Each breadcrumb
// is tagged with the verse being synthesized.
function postBreadcrumb(stage, info) {
  post({
    type: 'BREADCRUMB',
    stage,
    verseId: activeVerseId || null,
    info: info || null
  });
}

function clampRate(rate) {
  const n = Number(rate);
  if (!n || Number.isNaN(n)) return 1;
  return Math.min(2, Math.max(0.4, n));
}

// Clamp the FINAL Piper length_scale, not the incoming rate. The engine folds
// the per-voice 1.0x baseline into lengthScaleBase (piper-voice-config.js), and
// its values sit near the app's 2.5 ceiling, so clamping the combined rate to
// 2.0 would pin those voices short of their baseline. Bounds 0.5..2.5 cover
// every configured voice at every UI speed (0.4x..2.0x).
function clampLengthScale(scale) {
  const n = Number(scale);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(2.5, Math.max(0.5, n));
}

// Per-voice noise/silence overrides come from piper-voice-config.js. Each is
// optional: null means "use the pack's .onnx.json default" (noise) or "none"
// (silence). noise_scale = voice variation/stability, noise_w = cadence/timing
// variation, sentence_silence = extra digital silence after each sentence (s).
function clampNoise(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(2, Math.max(0, n));
}

function clampSentenceSilence(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(2, n);
}

function threadCount() {
  // The main thread decides thread count from cross-origin isolation
  // (COOP+COEP => SharedArrayBuffer) + hardwareConcurrency. ORT 1.18.0 selects
  // its binary from numThreads: 1 -> ort-wasm-simd.wasm (non-threaded, no SAB
  // needed — required on iOS), >1 -> ort-wasm-simd-threaded.wasm (needs SAB +
  // a worker the threaded build spawns via a blob: URL, so the CSP must allow
  // `worker-src blob:`). ORT 1.29 is threaded-only and its own isolation check
  // forces numThreads back to 1 when SAB is unavailable, so we never request
  // threads the environment cannot honour.
  const n = Number(ortTuning && ortTuning.threads);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(8, n);
}

async function loadPhonemizer() {
  diag('import-phonemizer', 'start');
  const t0 = performance.now();
  const module = await createPiperPhonemize({
    locateFile: (path) => PHONEMIZER_DIR + path,
    print: (msg) => { phonemizeStdout.push(String(msg)); },
    printErr: (msg) => { phonemizeStderr.push(String(msg)); }
  });
  // The factory returns moduleArg.ready, which resolves to the Module; keep
  // both the arg (callMain target) and the resolved Module (terminate()).
  const mod = await createPiperPhonemize({
    locateFile: (path) => PHONEMIZER_DIR + path,
    print: (msg) => { phonemizeStdout.push(String(msg)); },
    printErr: (msg) => { phonemizeStderr.push(String(msg)); }
  });
  phonemizerModule = (mod && mod.ready) ? await mod.ready : mod;
  diag('import-phonemizer', 'ok', null, { ms: Math.round(performance.now() - t0) });
  return mod;
}

async function loadOrt() {
  diag('import-ort', 'start');
  const t0 = performance.now();
  const cfg = ortConfig || DEFAULT_ORT;
  // Both builds expose a global `ort` (IIFE: `var ort=(()=>{...})()`), loaded
  // with importScripts() so it works in this classic worker on every browser
  // including iOS. `ort` is redeclared here as a block-scoped const, so the
  // global's `var ort` must be read via globalThis/self (the prior binding wins
  // at evaluation time and throws "Identifier 'ort' has already been declared"
  // otherwise).
  importScripts(cfg.api);
  const ort = globalThis.ort || self.ort;
  if (!ort || !ort.env || !ort.InferenceSession || !ort.Tensor) {
    throw new Error(cfg.api + ' missing env/InferenceSession/Tensor exports');
  }
  const runtime = {
    version: cfg.version,
    env: ort.env,
    InferenceSession: ort.InferenceSession,
    Tensor: ort.Tensor
  };
  // 1.18 (wasm-only UMD): wasmPaths is a directory string and ORT auto-selects
  // the binary from numThreads (1 -> ort-wasm-simd.wasm non-threaded, >1 ->
  // ort-wasm-simd-threaded.wasm). 1.29: wasmPaths is an object naming the ES
  // module glue + binary explicitly (threaded-only build).
  runtime.env.wasm.wasmPaths = cfg.wasmPaths;
  runtime.env.wasm.numThreads = threadCount();
  runtime.env.wasm.proxy = false;
  diag('import-ort', 'ok', null, {
    ms: Math.round(performance.now() - t0),
    version: cfg.version,
    threads: threadCount(),
    proxy: false
  });
  return runtime;
}

function modelInfo(modelKey) {
  const m = MODELS[modelKey];
  if (!m) throw new Error('unknown piper model "' + modelKey + '"');
  return m;
}

// Asks the main thread for a model pack's bytes (MODEL_REQUEST round-trip).
// The main thread reads OPFS — where the pack service wrote the files — and
// transfers the .onnx ArrayBuffer back, avoiding OPFS access inside the worker
// (not reliably available in every browser's worker context).
const modelRequests = new Map();
let modelRequestId = 0;

function requestModel(modelKey) {
  return new Promise((resolve, reject) => {
    const id = ++modelRequestId;
    const timeout = setTimeout(() => {
      modelRequests.delete(id);
      reject(new Error('model fetch timed out for ' + modelKey));
    }, 120000);
    modelRequests.set(id, {
      resolve: (payload) => { clearTimeout(timeout); resolve(payload); },
      reject: (err) => { clearTimeout(timeout); reject(err); }
    });
    post({ type: 'MODEL_REQUEST', id, model: modelKey });
  });
}

async function ensureSession(modelKey) {
  if (session && sessionMeta && sessionMeta.model === modelKey) return;
  const m = modelInfo(modelKey);
  diag('model-fetch', 'start', null, { model: modelKey });
  const t0 = performance.now();
  const { onnx, json } = await requestModel(modelKey);
  diag('model-fetch', 'ok', null, { model: modelKey, bytes: onnx.byteLength, ms: Math.round(performance.now() - t0) });

  // Read the authoritative inference metadata from the pack's .onnx.json,
  // falling back to the hardcoded MODELS values if it is absent/unparseable.
  const meta = {
    model: modelKey,
    sampleRate: m.sampleRate,
    noiseScale: m.noiseScale,
    noiseW: m.noiseW,
    espeakVoice: m.espeakVoice
  };
  if (json) {
    try {
      const cfg = JSON.parse(json);
      if (cfg) {
        if (cfg.audio && typeof cfg.audio.sample_rate === 'number') meta.sampleRate = cfg.audio.sample_rate;
        if (typeof cfg.sample_rate === 'number') meta.sampleRate = cfg.sample_rate;
        if (cfg.inference && typeof cfg.inference.noise_scale === 'number') meta.noiseScale = cfg.inference.noise_scale;
        if (cfg.inference && typeof cfg.inference.noise_w === 'number') meta.noiseW = cfg.inference.noise_w;
        if (cfg.espeak && typeof cfg.espeak.voice === 'string') meta.espeakVoice = cfg.espeak.voice;
        if (typeof cfg.num_speakers === 'number') meta.numSpeakers = cfg.num_speakers;
      }
    } catch (e) { /* fall back to MODELS metadata */ }
  }

  diag('session-create', 'start', null, { model: modelKey });
  const t1 = performance.now();
  // Session options from the main thread's tuning (ORT throughput knobs).
  // Memory arena + pattern reuse allocations across runs, which is faster but
  // retains memory for the session's lifetime — enabled off-iOS (recycled every
  // 15 verses) and disabled on iOS. executionMode stays sequential: the Piper
  // VITS graph is a chain, so parallel execution yields little and adds risk.
  const tuning = ortTuning || {};
  const sessionOptions = {
    executionProviders: ['wasm'],
    enableCpuMemArena: tuning.cpuMemArena !== false,
    enableMemPattern: tuning.memPattern !== false,
    executionMode: tuning.executionMode === 'parallel' ? 'parallel' : 'sequential',
    graphOptimizationLevel: (typeof tuning.graphOptimizationLevel === 'string')
      ? tuning.graphOptimizationLevel
      : 'all'
  };
  const next = await ortNs.InferenceSession.create(onnx, sessionOptions);
  if (session && session.release) {
    try { await session.release(); } catch (e) { /* ignore */ }
  }
  session = next;
  sessionMeta = meta;
  diag('session-create', 'ok', null, {
    model: modelKey,
    ms: Math.round(performance.now() - t1),
    threads: threadCount(),
    cpuMemArena: sessionOptions.enableCpuMemArena,
    memPattern: sessionOptions.enableMemPattern
  });
}

function splitSentences(text) {
  const parts = text.split(/([.!?][\u201d\u2019'")\]]*)\s+/);
  const sentences = [];
  for (let i = 0; i < parts.length; i += 2) {
    const t = (parts[i] || '').trim();
    const p = (parts[i + 1] || '').trim();
    const s = (t + p).trim();
    if (s) sentences.push(s);
  }
  return sentences;
}

function phonemizeOne(text) {
  phonemizeStdout.length = 0;
  phonemizeStderr.length = 0;
  const input = JSON.stringify([{ text }]);
  postBreadcrumb('phonemize-start', { chars: text.length });
  try {
    phonemizer.callMain(['-l', sessionMeta.espeakVoice, '--input', input, '--espeak_data', '/espeak-ng-data']);
  } catch (e) {
    // callMain throws on abnormal exit even when output was produced; the
    // stdout buffer still holds the result, so fall through to parse it.
  }
  const ids = [];
  for (const line of phonemizeStdout) {
    try {
      const rec = JSON.parse(line);
      if (rec && Array.isArray(rec.phoneme_ids)) {
        for (const id of rec.phoneme_ids) ids.push(id);
      }
    } catch (e) { /* not a JSON record */ }
  }
  if (!ids.length) {
    const detail = phonemizeStderr.join(' ').slice(0, 300);
    throw new Error('phonemizer produced no output' + (detail ? ': ' + detail : ''));
  }
  postBreadcrumb('phonemize-end', { ids: ids.length, heapBytes: phonemizerHeapBytes() });
  return ids;
}

// Best-effort size of the phonemizer's Emscripten WASM heap, so peak
// phonemizer memory can be watched on iOS. Returns null when not accessible.
function phonemizerHeapBytes() {
  try {
    const m = phonemizerModule || phonemizer;
    if (!m) return null;
    const heap = m.HEAPU8 || m.HEAP8 || m.HEAP16 || m.HEAP32;
    return heap && heap.buffer ? heap.buffer.byteLength : null;
  } catch (e) {
    return null;
  }
}

// Return a list of phoneme-id arrays, each within MAX_PHONEMES, so the
// model never receives an over-long sequence.
function phonemizeGroups(text) {
  const all = phonemizeOne(text);
  if (all.length <= MAX_PHONEMES) return [all];
  // Fall back to per-sentence phonemization, greedily grouping sentences so
  // each group stays within the model limit.
  const sentences = splitSentences(text);
  const groups = [];
  let current = [];
  for (const s of sentences) {
    const ids = phonemizeOne(s);
    if (current.length + ids.length > MAX_PHONEMES && current.length) {
      groups.push(current);
      current = [];
    }
    current = current.concat(ids);
    if (current.length > MAX_PHONEMES) {
      // A single sentence exceeded the limit; synthesize it directly and
      // trust the model's dynamic shape (best effort).
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups.length ? groups : [all];
}

async function runInference(phonemeIds, sid, lengthScale, noiseScale, noiseW) {
  const seq = new BigInt64Array(phonemeIds.length);
  for (let i = 0; i < phonemeIds.length; i++) seq[i] = BigInt(phonemeIds[i]);
  const feeds = {
    input: new ortNs.Tensor('int64', seq, [1, phonemeIds.length]),
    input_lengths: new ortNs.Tensor('int64', BigInt64Array.from([BigInt(phonemeIds.length)]), [1]),
    scales: new ortNs.Tensor('float32', Float32Array.from([noiseScale, lengthScale, noiseW]), [3])
  };
  // Single-speaker models (e.g. he_IL-saspeech, el_GR-rapunzelina) have no
  // `sid` input in their ONNX graph; feeding it makes ORT reject the run with
  // "invalid input 'sid'". Trust the live session's declared inputs first, then
  // the parsed pack config (num_speakers > 1), and only feed sid when the model
  // is known multi-speaker or the inputs are unqueryable (legacy behaviour).
  let multiSpeaker;
  if (Array.isArray(session.inputNames) && session.inputNames.length) {
    multiSpeaker = session.inputNames.indexOf('sid') !== -1;
  } else if (typeof sessionMeta.numSpeakers === 'number') {
    multiSpeaker = sessionMeta.numSpeakers > 1;
  } else {
    multiSpeaker = true;
  }
  if (multiSpeaker) {
    feeds.sid = new ortNs.Tensor('int64', BigInt64Array.from([BigInt(sid)]), [1]);
  }
  postBreadcrumb('ort-start', { phonemes: phonemeIds.length, multiSpeaker });
  let results = null;
  try {
    results = await session.run(feeds);
  } finally {
    // Explicitly release the temporary input tensors after each synthesis:
    // they hold large allocations in the ORT wasm heap and would otherwise
    // stay resident for the worker's entire lifetime.
    disposeTensor(feeds.input);
    disposeTensor(feeds.input_lengths);
    disposeTensor(feeds.scales);
    if (feeds.sid) disposeTensor(feeds.sid);
  }
  const out = results && results.output;
  if (!out || !out.data) throw new Error('piper model returned no output');
  // ALWAYS copy the output: the tensor is released below and its wasm-backed
  // buffer must not be referenced afterwards (the transferred PCM owns a copy).
  const pcm = new Float32Array(out.data);
  disposeTensor(out);
  postBreadcrumb('ort-end', { frames: pcm.length });
  return pcm;
}

function disposeTensor(t) {
  if (t && typeof t.dispose === 'function') {
    try { t.dispose(); } catch (e) { /* ignore */ }
  }
}

async function synthesizeGroup(phonemeIds, sid, lengthScale, noiseScale, noiseW) {
  return runInference(phonemeIds, sid, lengthScale, noiseScale, noiseW);
}

// Inline pause token: {{pause:N}} (N seconds) inserts real digital silence
// between the surrounding words. Used by the word-study overlay so the spoken
// details read slowly, each followed by a breath — punctuation alone cannot
// produce a reliable pause in Piper (the model fixes the length and some
// markers are swallowed entirely by the phonemizer).
const PAUSE_TOKEN_RE = /\{\{pause:([0-9.]+)\}\}/;

function splitWithPauses(text) {
  const out = [];
  for (const part of String(text).split(/(\{\{pause:[0-9.]+\}\})/)) {
    if (!part) continue;
    const m = part.match(PAUSE_TOKEN_RE);
    out.push(m ? { pause: parseFloat(m[1]) } : { text: part });
  }
  return out;
}

function silenceSamples(seconds, sampleRate) {
  const n = Math.max(0, Math.round((seconds || 0) * sampleRate));
  return new Float32Array(n);
}

async function synthesizeGroups(groups, sid, lengthScale, shouldAbort, noiseScale, noiseW) {
  if (groups.length === 1) return synthesizeGroup(groups[0], sid, lengthScale, noiseScale, noiseW);
  // Concatenate PCM across groups, honouring mid-run cancellation between
  // groups so Stop/Pause releases the thread promptly on long verses.
  const parts = [];
  for (const g of groups) {
    if (shouldAbort && shouldAbort()) return null;
    parts.push(await synthesizeGroup(g, sid, lengthScale, noiseScale, noiseW));
  }
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Float32Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  // Drop the per-group PCM references so nothing outlives this synthesis.
  parts.length = 0;
  return out;
}

async function generate(text, sid, rate, shouldAbort, voice = null) {
  // voice = { lengthScaleBase, noiseScale, noiseW, sentenceSilence } from
  // piper-voice-config.js. lengthScale is the voice's 1.0x value divided by the
  // app speed, so 1.0x speaks at the tuned speed and all other speeds scale from
  // there. noiseScale/noiseW override the pack's .onnx.json defaults when set;
  // sentenceSilence (seconds) is inserted as real digital silence after each
  // sentence (the vendored phonemizer exposes no such flag).
  const v = voice || {};
  const base = (Number.isFinite(v.lengthScaleBase) && v.lengthScaleBase > 0) ? v.lengthScaleBase : 1;
  const lengthScale = clampLengthScale(base / clampRate(rate));
  const noiseScaleOverride = clampNoise(v.noiseScale);
  const noiseWOverride = clampNoise(v.noiseW);
  const sentenceSilence = clampSentenceSilence(v.sentenceSilence);
  const noiseScale = noiseScaleOverride != null ? noiseScaleOverride : sessionMeta.noiseScale;
  const noiseW = noiseWOverride != null ? noiseWOverride : sessionMeta.noiseW;
  const sampleRate = (sessionMeta && sessionMeta.sampleRate) || SAMPLE_RATE;
  const chunks = [];
  for (const part of splitWithPauses(text)) {
    if (shouldAbort && shouldAbort()) return null;
    if (part.pause) {
      chunks.push(silenceSamples(part.pause, sampleRate));
      continue;
    }
    if (!part.text) continue;
    // Sentence silence: synthesize each sentence separately and append the
    // configured silence after it. 0 keeps the single-pass path.
    if (sentenceSilence > 0) {
      for (const sentence of splitSentences(part.text)) {
        if (shouldAbort && shouldAbort()) return null;
        const pcm = await synthesizeGroups(phonemizeGroups(sentence), sid, lengthScale, shouldAbort, noiseScale, noiseW);
        if (pcm === null) return null;
        chunks.push(pcm);
        chunks.push(silenceSamples(sentenceSilence, sampleRate));
      }
    } else {
      const pcm = await synthesizeGroups(phonemizeGroups(part.text), sid, lengthScale, shouldAbort, noiseScale, noiseW);
      if (pcm === null) return null;
      chunks.push(pcm);
    }
  }
  if (!chunks.length) return null;
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  chunks.length = 0;
  return out;
}

async function validateSession(modelKey, sid) {
  await ensureSession(modelKey);
  await generate(WARMUP_TEXT, sid, 1);
}

async function disposeSession() {
  activeGen = null;
  cancelActive = false;
  if (session && session.release) {
    try { await session.release(); } catch (e) { /* ignore */ }
  }
  session = null;
  sessionMeta = null;
  ortNs = null;
  if (phonemizerModule && typeof phonemizerModule.terminate === 'function') {
    try { phonemizerModule.terminate(); } catch (e) { /* ignore */ }
  }
  phonemizer = null;
  phonemizerModule = null;
}

async function init(id, modelKey, sid, tuning, ort) {
  if (initInProgress) return;
  initInProgress = true;
  if (ort && typeof ort === 'object' && typeof ort.api === 'string') {
    ortConfig = {
      version: typeof ort.version === 'string' ? ort.version : null,
      api: ort.api,
      threaded: ort.threaded === true,
      wasmPaths: ort.wasmPaths || DEFAULT_ORT.wasmPaths
    };
  }
  if (tuning && typeof tuning === 'object') {
    ortTuning = {
      threads: Number.isInteger(tuning.threads) ? tuning.threads : 1,
      cpuMemArena: tuning.cpuMemArena !== false,
      memPattern: tuning.memPattern !== false,
      executionMode: tuning.executionMode === 'parallel' ? 'parallel' : 'sequential',
      graphOptimizationLevel: (typeof tuning.graphOptimizationLevel === 'string')
        ? tuning.graphOptimizationLevel : 'all'
    };
  }
  try {
    phonemizer = await loadPhonemizer();
    ortNs = await loadOrt();
    diag('warmup-generate', 'start', null, { model: modelKey, sid });
    const t0 = performance.now();
    await validateSession(modelKey, sid);
    diag('warmup-generate', 'ok', null, { ms: Math.round(performance.now() - t0) });
    post({ type: 'INIT_OK', id, device: 'wasm', dtype: 'fp32', sampleRate: sessionMeta.sampleRate, model: sessionMeta.model });
    pump();
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    const detail = { error: msg, stack: err && err.stack ? String(err.stack) : null };
    console.warn('[piper-worker] init failed:', msg);
    if (err && err.stack) console.warn(err.stack.split('\n').slice(0, 6).join('\n'));
    diag('backend-failed', 'fail', msg, { stack: detail.stack });
    await disposeSession();
    post({ type: 'INIT_ERR', id, error: msg, detail });
  } finally {
    initInProgress = false;
  }
}

async function runOne(job) {
  const t0 = performance.now();
  try {
    activeGen = job.gen;
    activeVerseId = job.verseId || null;
    cancelActive = false;
    const voice = job.voice || {};
    const modelKey = voice.model || DEFAULT_MODEL;
    const sid = Number.isInteger(voice.sid) ? voice.sid : DEFAULT_SID;
    await ensureSession(modelKey);
    if (cancelActive) return;
    const pcm = await generate(job.text, sid, Number(job.rate) || 1, () => cancelActive, {
      lengthScaleBase: job.lengthScaleBase,
      noiseScale: job.noiseScale,
      noiseW: job.noiseW,
      sentenceSilence: job.sentenceSilence
    });
    if (cancelActive || pcm === null) return;
    const synthMs = performance.now() - t0;
    const sampleRate = (sessionMeta && sessionMeta.sampleRate) || SAMPLE_RATE;
    const audioMs = (pcm.length / sampleRate) * 1000;
    const heapBytes = phonemizerHeapBytes();
    console.warn('[TTS] verse synth len=' + job.text.length +
      ' chars synthMs=' + Math.round(synthMs) +
      ' audioMs=' + Math.round(audioMs) +
      ' rtf=' + (synthMs / Math.max(1, audioMs)).toFixed(2) +
      (heapBytes != null ? ' phonemizerHeap=' + Math.round(heapBytes / 1048576) + 'MB' : ''));
    // Transfer the PCM buffer (never structured-clone it): cloning would copy
    // the whole verse's audio through the messaging layer and double peak memory.
    postBreadcrumb('pcm-transfer', { frames: pcm.length, sampleRate });
    post({ type: 'AUDIO', id: job.id, gen: job.gen, pcm, sampleRate }, [pcm.buffer]);
  } catch (err) {
    if (cancelActive) return;
    post({ type: 'ERR', id: job.id, gen: job.gen, error: err && err.message ? err.message : String(err) });
  } finally {
    activeGen = null;
    activeVerseId = null;
    cancelActive = false;
  }
}

// Dev/QA on-device benchmark: synthesize a fixed text under one tuning and
// report RTF. Sequenced off the normal queue so it never overlaps a real job.
//   main -> worker  BENCHMARK { id, text, tuning:{threads,cpuMemArena,memPattern,executionMode} }
//   worker -> main  BENCHMARK_RESULT { id, ok, tuning, synthMs, audioMs, rtf, sampleRate, error? }
async function runBenchmark(msg) {
  const id = msg.id;
  const text = (typeof msg.text === 'string' && msg.text) ? msg.text : WARMUP_TEXT;
  const tuning = {
    threads: Number.isInteger(msg.tuning && msg.tuning.threads) ? msg.tuning.threads : ortTuning.threads,
    cpuMemArena: !(msg.tuning && msg.tuning.cpuMemArena === false),
    memPattern: !(msg.tuning && msg.tuning.memPattern === false),
    executionMode: (msg.tuning && msg.tuning.executionMode === 'parallel') ? 'parallel' : 'sequential',
    graphOptimizationLevel: (msg.tuning && typeof msg.tuning.graphOptimizationLevel === 'string')
      ? msg.tuning.graphOptimizationLevel : 'all'
  };
  try {
    ortTuning = tuning;
    // Force session rebuild so the new tuning takes effect.
    if (session && session.release) {
      try { await session.release(); } catch (e) { /* ignore */ }
    }
    session = null;
    sessionMeta = null;
    if (!ortNs) ortNs = await loadOrt();
    await ensureSession(DEFAULT_MODEL);
    // Warm-up (excluded from the measurement): ORT lazily allocates on first run.
    await generate(WARMUP_TEXT, DEFAULT_SID, 1);
    const t0 = performance.now();
    const pcm = await generate(text, DEFAULT_SID, 1);
    const synthMs = performance.now() - t0;
    const sampleRate = (sessionMeta && sessionMeta.sampleRate) || SAMPLE_RATE;
    const audioMs = pcm ? (pcm.length / sampleRate) * 1000 : 0;
    post({
      type: 'BENCHMARK_RESULT',
      id,
      ok: true,
      tuning,
      synthMs,
      audioMs,
      rtf: audioMs > 0 ? synthMs / audioMs : null,
      chars: text.length,
      sampleRate
    });
  } catch (err) {
    post({
      type: 'BENCHMARK_RESULT',
      id,
      ok: false,
      tuning,
      error: err && err.message ? err.message : String(err)
    });
  }
}

function pump() {
  if (busy || !session || !queue.length) return;
  busy = true;
  const job = queue.shift();
  runOne(job).finally(() => {
    busy = false;
    pump();
  });
}

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  switch (msg.type) {
    case 'INIT':
      init(msg.id, msg.model || DEFAULT_MODEL, msg.sid != null ? msg.sid : DEFAULT_SID, msg.tuning, msg.ort);
      break;
    case 'BENCHMARK':
      runBenchmark(msg);
      break;
    case 'SYNTHESIZE':
      queue.push(msg);
      pump();
      break;
    case 'CANCEL':
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].gen === msg.gen) queue.splice(i, 1);
      }
      // The in-flight run cannot be preempted mid-wasm-call, but flag it so
      // the remaining phoneme groups are skipped and late audio is dropped.
      if (activeGen === msg.gen) cancelActive = true;
      break;
    case 'MODEL_BYTES': {
      const entry = modelRequests.get(msg.id);
      if (entry) {
        modelRequests.delete(msg.id);
        entry.resolve({ onnx: msg.onnx, json: msg.json || null });
      }
      break;
    }
    case 'MODEL_ERR': {
      const entry = modelRequests.get(msg.id);
      if (entry) {
        modelRequests.delete(msg.id);
        entry.reject(new Error(msg.error || 'model fetch failed'));
      }
      break;
    }
    case 'DISPOSE':
      queue.length = 0;
      (async () => {
        await disposeSession();
        // Acknowledge before closing so the main thread can terminate this
        // worker and safely spawn its replacement (worker recycling) without
        // ever having two workers alive at once.
        post({ type: 'DISPOSED', id: msg.id });
        self.close();
      })();
      break;
    default:
      break;
  }
});