// piper-voice-config.js — per-voice Piper synthesis defaults.
//
// Each curated narrator gets its own inference settings, tuned by ear in the
// calibration tool's voice-audition page (tools/tts-calibration/preview) and
// used verbatim by the app at the 1.0x speed setting:
//
//   lengthScale      articulation speed (Piper scales[1])
//   noiseScale       voice variation / stability (scales[0])
//   noiseW           cadence / timing variation (scales[2])
//   sentenceSilence  seconds of real silence appended after each sentence
//
// The app's speed selector scales ONLY the speed: at speed R the worker sends
// lengthScale = this.lengthScale / R (piper-worker.js), so 1.0x speaks at the
// tuned value and every other speed is derived from it. noiseScale / noiseW /
// sentenceSilence are timbre/pace and stay fixed across speeds.
//
// Key = lowercased display name (matches PiperEngine.VOICES[].name). Voices
// absent from this map (e.g. the word-study he_IL/el_GR models) fall back to
// the pack's own `.onnx.json` defaults and zero sentence silence.
window.PIPER_VOICE_CONFIG = {
  emma:    { lengthScale: 1.45,  noiseScale: 0.6,   noiseW: 0.2,   sentenceSilence: 0.7 },
  claire:  { lengthScale: 1.44,  noiseScale: 0.55,  noiseW: 0.25,  sentenceSilence: 0.7 },
  aaron:   { lengthScale: 1.47,  noiseScale: 0.48,  noiseW: 0.28,  sentenceSilence: 0.8 },
  grant:   { lengthScale: 1.5,   noiseScale: 0.2,   noiseW: 0.5,   sentenceSilence: 0.5 },
  naomi:   { lengthScale: 1.393, noiseScale: 0.49,  noiseW: 0.229, sentenceSilence: 0.5 },
  wesley:  { lengthScale: 1.4,   noiseScale: 0.2,   noiseW: 0.4,   sentenceSilence: 0.5 },
  marcus:  { lengthScale: 1.607, noiseScale: 0.6,   noiseW: 0.4,   sentenceSilence: 0.5 },
  nathan:  { lengthScale: 1.6,   noiseScale: 0.31,  noiseW: 0.44,  sentenceSilence: 0.5 },
  henry:   { lengthScale: 1.6,   noiseScale: 0.48,  noiseW: 0.111, sentenceSilence: 0.68 },
  james:   { lengthScale: 1.667, noiseScale: 0.379, noiseW: 0.15,  sentenceSilence: 0.6 },
  amelia:  { lengthScale: 1.48,  noiseScale: 0.485, noiseW: 0.16,  sentenceSilence: 0.6 },
  eleanor: { lengthScale: 1.488, noiseScale: 0.44,  noiseW: 0.286, sentenceSilence: 0.5 }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.PIPER_VOICE_CONFIG;
}
