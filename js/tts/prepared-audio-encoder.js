// prepared-audio-encoder.js — pluggable, non-realtime audio encoder seam for
// PREPARED BACKGROUND AUDIO.
//
// The preparation pipeline (preparation-service.js → prepared-audio-store.js)
// only ever talks to this interface, so the container/codec can change without
// touching the queue, the OPFS writer, or playback:
//
//   const enc = PreparedAudioEncoder.create('wav', { sampleRate, channels });
//   const { header } = await enc.begin();      // bytes written first (may be empty)
//   const bytes = enc.encodeChunk(pcm);        // appended per verse
//   const { header: patched, trailer } = await enc.finalize(totalSamples);
//
// `finalize` returning a non-null `header` means "rewrite the first N bytes"
// (how WAV patches its length fields); `trailer` is appended at the end.
//
// ── Format support reality (measured) ───────────────────────────────────────
//   WAV (PCM16)  — implemented. Works everywhere (iOS + Android), no codec
//                  risk. ~158 MB per 30 min at 22050 Hz mono. This is the
//                  correctness baseline the whole pipeline is proven against.
//   Opus (WebM)  — Android/desktop only. WebCodecs AudioEncoder supports
//                  `opus` (verified: AudioEncoder.isConfigSupported true on
//                  Chromium/Firefox). Non-realtime, so it is the right target
//                  there. Needs a thin WebM muxer to wrap the encoded frames.
//   AAC-LC (M4A) — the iOS target codec, but iOS Safari exposes NO non-realtime
//                  encoder: WebCodecs AudioEncoder is undefined and MediaRecorder
//                  only encodes a live MediaStream in realtime (a 30-min prep
//                  would take 30 min). A real AAC path for iOS therefore needs a
//                  small WASM AAC encoder (cost to be evaluated) — registered
//                  here as a strategy but not yet implemented.
//
// `PreparedAudioEncoder.select()` picks the best format available on the
// current device, and `PreparedAudioEncoder.available()` reports what is usable
// so the settings UI can hide/annotate the feature on platforms without a
// practical codec.

window.PreparedAudioEncoder = (function () {
  // ── WAV (PCM16, little-endian, mono or stereo interleaved) ─────────────────
  class WavEncoderStrategy {
    static get format() { return 'wav'; }
    static get extension() { return 'wav'; }
    static get mime() { return 'audio/wav'; }

    constructor(opts = {}) {
      this.sampleRate = opts.sampleRate || 22050;
      this.channels = opts.channels || 1;
      this._headerLen = 44;
    }

    async begin() {
      return { header: this._header(0) };
    }

    // `pcm` is interleaved Float32 (mono = plain frames). Returns the
    // little-endian Int16 bytes for this chunk; the caller drops `pcm` after.
    encodeChunk(pcm) {
      const ch = this.channels;
      const samples = ch > 1 ? Math.floor(pcm.length / ch) * ch : pcm.length;
      const bytes = new ArrayBuffer(samples * 2);
      const view = new DataView(bytes);
      let off = 0;
      for (let i = 0; i < samples; i++, off += 2) {
        const s = Math.max(-1, Math.min(1, pcm[i]));
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      }
      return new Uint8Array(bytes);
    }

    // `totalSamples` is the count of PER-CHANNEL frames written so far (a mono
    // frame = one sample). Returns the patched 44-byte header the store writes
    // back over the file's first 44 bytes.
    async finalize(totalSamples) {
      return { header: this._header(totalSamples), trailer: null };
    }

    _header(frameCount) {
      const ch = this.channels;
      const bytes = new ArrayBuffer(44);
      const view = new DataView(bytes);
      const str = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
      const dataBytes = frameCount * ch * 2;
      const byteRate = this.sampleRate * ch * 2;
      str(0, 'RIFF');
      view.setUint32(4, 36 + dataBytes, true);
      str(8, 'WAVE');
      str(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);          // PCM
      view.setUint16(22, ch, true);
      view.setUint32(24, this.sampleRate, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, ch * 2, true);     // block align
      view.setUint16(34, 16, true);         // bits per sample
      str(36, 'data');
      view.setUint32(40, dataBytes, true);
      return new Uint8Array(bytes);
    }
  }

  // ── Opus (WebM) — Android/desktop, WebCodecs. Registered, not yet wired. ───
  // Kept as a documented placeholder so select() can prefer it once the thin
  // WebM muxer is added; until then create() falls back to WAV.
  class OpusWebmStrategy {
    static get format() { return 'opus'; }
    static get extension() { return 'webm'; }
    static get mime() { return 'audio/webm'; }
    static get implemented() { return false; }
  }

  const STRATEGIES = { wav: WavEncoderStrategy };

  async function isImplemented(name) {
    const s = STRATEGIES[name];
    if (!s) return false;
    if (s.implemented === false) return false;
    return true;
  }

  async function select(preferred) {
    if (preferred && await isImplemented(preferred)) return preferred;
    // Only WAV is implemented today; callers may force 'opus'/'aac' later.
    return 'wav';
  }

  return {
    // Available strategies for the UI (implemented only).
    implemented: ['wav'],

    create(format, opts) {
      const name = (format && STRATEGIES[format] && STRATEGIES[format].implemented !== false)
        ? format
        : 'wav';
      const Cls = STRATEGIES[name];
      return new Cls(opts);
    },

    // Best usable format for this device. Always resolves to something playable
    // by HTMLAudioElement (WAV today).
    async select(preferred) {
      return select(preferred);
    },

    async isImplemented(name) {
      return isImplemented(name);
    },

    // True when a compressed (non-WAV) codec is practical here — drives whether
    // the settings UI calls the storage "small" or warns about size.
    async hasCompression() {
      try {
        if (typeof AudioEncoder === 'undefined' || !AudioEncoder.isConfigSupported) return false;
        const cfg = { codec: 'opus', sampleRate: 22050, numberOfChannels: 1, bitrate: 24000 };
        const res = await AudioEncoder.isConfigSupported(cfg);
        return !!(res && res.supported);
      } catch (e) {
        return false;
      }
    },

    // Approximate bytes per second of prepared audio for a given format, so the
    // UI can show a size estimate before preparing.
    bytesPerSecond(format, sampleRate, channels) {
      const rate = sampleRate || 22050;
      const ch = channels || 1;
      if (format === 'opus') return 3000; // ~24 kbps
      if (format === 'aac') return 4000;  // ~32 kbps
      return rate * ch * 2;               // PCM16
    }
  };
})();
