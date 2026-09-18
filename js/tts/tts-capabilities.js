window.TTSCapabilities = class TTSCapabilities {
  // Platforms whose Read Aloud audio is played through a real <audio> element
  // (WAV per verse) instead of an AudioContext. A real media element holds
  // Chrome/Android's audio wake lock, so playback continues with the screen
  // off, and it anchors the OS media notification / lock-screen controls.
  // Web Audio is the default on every other platform (the long-standing,
  // known-good path). Add 'ios' / 'desktop' here to opt them in later.
  static get MEDIA_ELEMENT_OUTPUT_ENABLED() {
    return ['android'];
  }

  constructor(bridge) {
    this.bridge = bridge;
  }

  systemAvailable() {
    return typeof window.speechSynthesis !== 'undefined' &&
      typeof window.SpeechSynthesisUtterance !== 'undefined';
  }

  webgpuAvailable() {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
  }

  // iOS/iPadOS detection (iPhone/iPad/iPod UA, plus iPadOS 13+ which reports
  // itself as MacIntel with a touchscreen). Drives the iOS-only navigator
  // audioSession path. Static so engines/controllers can consult it without an
  // instance.
  static isIOS() {
    if (typeof navigator === 'undefined') return false;
    try {
      const ua = (navigator.userAgent || '').toLowerCase();
      if (/(iphone|ipod|ipad)/.test(ua)) return true;
      const platform = navigator.platform || '';
      if ((/mac/i.test(platform)) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1) {
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  isIOS() {
    return window.TTSCapabilities.isIOS();
  }

  // Which onnxruntime-web build the Piper worker should load. Every platform
  // uses 1.18.0 — the wasm-only UMD build (ort.wasm.min.js) whose numThreads=1
  // path selects the NON-threaded ort-wasm-simd.wasm.
  //
  // 1.29.0 (ort.min.js + ES-module glue, threaded-only) is still vendored under
  // ../1.29/ for future testing, but is NOT the default anywhere: on-device A/B
  // showed it is ~3s slower to init on Android (23s vs 20s — a larger 14MB
  // threaded wasm + separate .mjs to compile), gives no synthesis speedup
  // (1 thread == 2 threads), and its multi-thread mode dies at the 15-verse
  // mobile worker recycle (~2 min in) — the pthread pool cannot be cleanly torn
  // down, so the replacement session fails. 1.18 is faster, smaller, needs no
  // SharedArrayBuffer, and is stable.
  //
  // ?ttsOrtVersion=1.29 force-loads the newer build for experiments (no UI).
  static get ORT_BASE() {
    return '/js/vendor/onnxruntime/';
  }

  static ortRuntime() {
    let version = '1.18';
    // URL-only dev override (there is no in-app control). The installed PWA
    // drops the query string, so this is a desktop/browser experiment knob.
    try {
      const qp = new URLSearchParams(window.location.search).get('ttsOrtVersion');
      if (qp === '1.18' || qp === '1.29') version = qp;
    } catch (e) { /* ignore */ }
    const base = window.TTSCapabilities.ORT_BASE + version + '/';
    if (version === '1.18') {
      return {
        version,
        base,
        api: base + 'ort.wasm.min.js',
        threaded: false,
        wasmPaths: base
      };
    }
    return {
      version,
      base,
      api: base + 'ort.min.js',
      threaded: true,
      wasmPaths: {
        mjs: base + 'ort-wasm-simd-threaded.mjs',
        wasm: base + 'ort-wasm-simd-threaded.wasm'
      }
    };
  }

  ortRuntime() {
    return window.TTSCapabilities.ortRuntime();
  }

  // ORT (onnxruntime-web) tuning for the Piper worker. Throughput knobs:
  //   threads    — always 1. The vendored 1.18 build is the non-threaded one
  //                (numThreads 1 -> ort-wasm-simd.wasm); a value >1 would make
  //                ORT pick the threaded binary, which needs SharedArrayBuffer
  //                and a blob: thread-pool worker. On-device testing showed
  //                threading gives no synthesis speedup anyway (init-bound).
  //   cpuMemArena / memPattern — ORT's per-run allocation reuse. BOTH ARE OFF
  //                on every platform: this is the known-good iOS-stability
  //                configuration, and it is also required elsewhere — on-device
  //                testing showed `enableMemPattern: true` makes Piper fail on
  //                the SECOND synthesis of a session ("failed to call OrtRun()"
  //                style crash) even single-threaded. Measured directly:
  //                  arena ON  pattern ON  -> crashes on verse 2
  //                  arena OFF pattern ON  -> crashes on verse 2
  //                  arena ON  pattern OFF -> 4/4 verses OK
  //                  arena OFF pattern OFF -> 4/4 verses OK
  //                The knobs remain overridable for benchmarking, but the
  //                default must stay safe.
  //   executionMode / graphOptimizationLevel — sequential + full graph opt.
  //
  // No in-app override: the Read Aloud ORT QA control was removed (it lived only
  // to settle the 1.18-vs-1.29 question). ?ttsOrtThreads=N remains a dev URL
  // knob; ?ttsOrtVersion=1.29 force-loads the newer build for experiments.
  static ortTuning() {
    const t = {
      threads: 1,
      cpuMemArena: false,
      memPattern: false,
      executionMode: 'sequential',
      graphOptimizationLevel: 'all'
    };
    try {
      const qp = new URLSearchParams(window.location.search).get('ttsOrtThreads');
      if (qp != null) {
        const n = parseInt(qp, 10);
        if (Number.isInteger(n) && n >= 1) t.threads = Math.min(8, n);
      }
    } catch (e) { /* ignore */ }
    return t;
  }

  // Android detection (UA carries "Android"; Chrome/WebView on Android always
  // include it). Drives the media-element playback path.
  static isAndroid() {
    if (typeof navigator === 'undefined') return false;
    try {
      return /android/i.test(navigator.userAgent || '');
    } catch (e) { /* ignore */ }
    return false;
  }

  isAndroid() {
    return window.TTSCapabilities.isAndroid();
  }

  // Which playback backend to use: 'element' = real <audio> element (OS media
  // notification + screen-off playback), 'webaudio' = AudioContext. Governed
  // by the MEDIA_ELEMENT_OUTPUT_ENABLED platform allowlist so a platform can be
  // switched by editing that list alone.
  static preferredAudioOutput() {
    // Dev/QA override so the element path can be exercised on any device:
    // ?ttsAudioOutput=element|webaudio or the localStorage key
    // 'focused-word:tts-audio-output'.
    if (typeof window !== 'undefined') {
      try {
        const qp = new URLSearchParams(window.location.search).get('ttsAudioOutput');
        if (qp === 'element' || qp === 'webaudio') return qp;
        const saved = localStorage.getItem('focused-word:tts-audio-output');
        if (saved === 'element' || saved === 'webaudio') return saved;
      } catch (e) { /* ignore */ }
    }
    const platform = window.TTSCapabilities.isIOS() ? 'ios'
      : (window.TTSCapabilities.isAndroid() ? 'android' : 'desktop');
    return window.TTSCapabilities.MEDIA_ELEMENT_OUTPUT_ENABLED.indexOf(platform) !== -1
      ? 'element'
      : 'webaudio';
  }

  preferredAudioOutput() {
    return window.TTSCapabilities.preferredAudioOutput();
  }

  // Static so the engine can consult it off the class (window.TTSCapabilities)
  // without an instance.
  static usesMediaElementOutput() {
    return window.TTSCapabilities.preferredAudioOutput() === 'element';
  }

  usesMediaElementOutput() {
    return window.TTSCapabilities.usesMediaElementOutput();
  }

  // Memory-constrained (mobile) detection. Drives the engine-release policy
  // (tab eviction under ~200MB retained TTS memory), single-threaded ORT WASM,
  // and the Piper neural stability policies (single-verse look-ahead + periodic
  // worker recycling). Static so engines/controllers can consult it without an
  // instance. Uses pointer media + touch capability + UA client hints, never a
  // device-name table.
  static isMobile() {
    if (typeof window === 'undefined') return false;
    return window.TTSCapabilities._deviceClass() === 'mobile';
  }

  isMobile() {
    return window.TTSCapabilities.isMobile();
  }

  deviceClass() {
    return window.TTSCapabilities._deviceClass();
  }

  static _deviceClass() {
    if (typeof window === 'undefined') return 'desktop';
    // Dev/QA override for exercising the Piper (mobile) path on a desktop
    // without a real tablet: ?ttsDeviceClass=mobile on the URL or the
    // localStorage key 'focused-word:tts-device-class'.
    try {
      const qp = new URLSearchParams(window.location.search).get('ttsDeviceClass');
      if (qp === 'mobile' || qp === 'desktop') return qp;
      const saved = localStorage.getItem('focused-word:tts-device-class');
      if (saved === 'mobile' || saved === 'desktop') return saved;
    } catch (e) { /* ignore */ }
    try {
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (coarse) return 'mobile';
    } catch (e) { /* ignore */ }
    try {
      if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) return 'mobile';
    } catch (e) { /* ignore */ }
    try {
      const uad = navigator.userAgentData;
      if (uad && uad.mobile) return 'mobile';
    } catch (e) { /* ignore */ }
    return 'desktop';
  }

  getProfile() {
    try {
      const raw = localStorage.getItem('focused-word:tts-capability-profile');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  saveProfile(profile) {
    try {
      profile.testedAt = Date.now();
      localStorage.setItem('focused-word:tts-capability-profile', JSON.stringify(profile));
    } catch (e) {
      console.error('[tts-capabilities] save failed:', e);
    }
  }
};
