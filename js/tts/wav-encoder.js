// wav-encoder.js — Float32 PCM → 16-bit mono WAV encoding shared by the
// media-element output and the background track builder.
//
// Pure functions, no DOM/audio objects, so they can be unit-tested directly.
// `encodeSegments` concatenates several PCM buffers with configurable silence
// between them and returns both the WAV bytes and a per-verse timetable of
// [start, speechEnd, end) offsets (seconds) — the table that turns a single
// long physical media resource back into verse-level highlighting.

window.WavEncoder = {
  // Speech PCM (-1..1) as a 16-bit mono WAV ArrayBuffer. `rate` Hz.
  encode(pcm, rate) {
    const sampleRate = rate || 24000;
    const bytes = new ArrayBuffer(44 + pcm.length * 2);
    const view = new DataView(bytes);
    this._writeHeader(view, sampleRate, pcm.length);
    let off = 44;
    for (let i = 0; i < pcm.length; i++, off += 2) {
      const s = Math.max(-1, Math.min(1, pcm[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return bytes;
  },

  // Just the 44-byte WAV header for `sampleCount` mono 16-bit samples at `rate`.
  // Used by the incremental chapter builder, which concatenates headerless PCM
  // parts at the end (Blob parts are referenced, never copied, so the full WAV
  // is never materialized as one ArrayBuffer).
  header(rate, sampleCount) {
    const sampleRate = rate || 22050;
    const bytes = new ArrayBuffer(44);
    this._writeHeader(new DataView(bytes), sampleRate, sampleCount);
    return bytes;
  },

  // Headerless little-endian Int16 PCM bytes for one Float32 buffer.
  pcmData(pcm) {
    const bytes = new ArrayBuffer(pcm.length * 2);
    const view = new DataView(bytes);
    let off = 0;
    for (let i = 0; i < pcm.length; i++, off += 2) {
      const s = Math.max(-1, Math.min(1, pcm[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return bytes;
  },

  // Concatenate `segments` ({ ref, pcm, sampleRate }) into ONE 16-bit mono WAV,
  // inserting `gapSeconds` of silence BETWEEN segments and `tailSeconds` after
  // the last. Returns:
  //   { wav, timetable, duration, sampleRate }
  // where each timetable entry is { ref, start, speechEnd, end } in seconds.
  // Segments are assumed to share one sample rate (the first segment's).
  encodeSegments(segments, gapSeconds, tailSeconds) {
    const rate = (segments[0] && segments[0].sampleRate) || 24000;
    const gap = Math.max(0, Math.round((gapSeconds || 0) * rate));
    const tail = Math.max(0, Math.round((tailSeconds || 0) * rate));
    const gaps = Math.max(0, segments.length - 1) * gap;
    let speech = 0;
    for (const seg of segments) speech += seg.pcm.length;
    const total = speech + gaps + tail;

    const bytes = new ArrayBuffer(44 + total * 2);
    const view = new DataView(bytes);
    this._writeHeader(view, rate, total);

    let off = 44;
    const timetable = [];
    for (let s = 0; s < segments.length; s++) {
      const seg = segments[s];
      const start = (off - 44) / 2;
      const pcm = seg.pcm;
      for (let i = 0; i < pcm.length; i++, off += 2) {
        const v = Math.max(-1, Math.min(1, pcm[i]));
        view.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      }
      const speechEnd = (off - 44) / 2;
      off += gap * 2; // silence before the next segment (zero-filled)
      timetable.push({
        ref: seg.ref != null ? seg.ref : null,
        start: start / rate,
        speechEnd: speechEnd / rate,
        end: (start + pcm.length + (s < segments.length - 1 ? gap : 0)) / rate
      });
    }
    // Remaining `tail` samples stay zero.
    return { wav: bytes, timetable, duration: total / rate, sampleRate: rate };
  },

  _writeHeader(view, rate, sampleCount) {
    const str = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
    str(0, 'RIFF');
    view.setUint32(4, 36 + sampleCount * 2, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);   // PCM
    view.setUint16(22, 1, true);   // mono
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);   // block align
    view.setUint16(34, 16, true);  // bits per sample
    str(36, 'data');
    view.setUint32(40, sampleCount * 2, true);
  }
};
