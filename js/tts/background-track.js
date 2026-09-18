// background-track.js — builds ONE long continuous WAV ("background track")
// out of several verses' already-synthesized PCM, plus a verse timetable.
//
// Why this exists: on Android a locked screen stops JavaScript and Piper, so
// anything we expect to keep playing must already be inside the media resource
// that is playing when the device sleeps. A single continuous WAV does that;
// switching src/Blob verse-by-verse does not. This builder turns N verse PCM
// buffers into one WAV + a timetable, so `HTMLAudioElement.currentTime` can be
// mapped back to a verse for highlighting and navigation while visible.
//
// A track owns one Blob URL and one WAV ArrayBuffer. Once it is no longer the
// active resource the controller calls release() to revoke the URL and drop the
// bytes, so old tracks never pile up in memory.

window.BackgroundTrack = class BackgroundTrack {
  // Seconds of silence inserted between verses inside a track. This is the
  // reading-pace knob (independent of Piper's length_scale), tunable in one
  // place.
  static get INTER_VERSE_SECONDS() {
    return 0.4;
  }

  // Wrap an ALREADY-URL-backed continuous resource + timetable (used by
  // PREPARED BACKGROUND AUDIO, whose bytes live in OPFS and were turned into a
  // Blob URL by the store). The track does NOT own the URL: release() will not
  // revoke it, because the prepared store/player manages that lifecycle.
  static fromUrl(url, timetable, opts = {}) {
    const t = Object.create(window.BackgroundTrack.prototype);
    t.refs = (timetable || []).map(e => e.ref);
    t.queueStart = Number.isInteger(opts.queueStart) ? opts.queueStart : 0;
    t.timetable = timetable || [];
    t.duration = Number.isFinite(opts.duration) ? opts.duration
      : (t.timetable.length ? t.timetable[t.timetable.length - 1].end : 0);
    t.sampleRate = opts.sampleRate || 22050;
    t.gapSeconds = opts.gapSeconds || 0;
    t.wav = null;
    t._blob = null;
    t._url = url || null;
    t._ownsUrl = false;
    t._headerData = null;
    return t;
  }

  // Build a track from ordered units. Each unit is
  //   { ref, verseId, pcm, sampleRate }
  // `ref` is the verse reference string stored in the timetable. `tailSeconds`
  // appends silence after the last verse (a small guard so an in-flight seek
  // does not hit the very end).
  //
  // The units' Float32 PCM is consumed into the WAV and deliberately NOT
  // retained (the timetable keeps only refs), so a built track does not hold a
  // second copy of every verse buffer.
  constructor(units, opts = {}) {
    this.refs = units.map(u => u.ref);
    this.queueStart = Number.isInteger(opts.queueStart) ? opts.queueStart : 0;
    const gap = opts.gapSeconds != null ? opts.gapSeconds : this.constructor.INTER_VERSE_SECONDS;
    const tail = opts.tailSeconds != null ? opts.tailSeconds : 0;
    const segments = units.map(u => ({ ref: u.ref, pcm: u.pcm, sampleRate: u.sampleRate || 22050 }));
    const encoded = window.WavEncoder.encodeSegments(segments, gap, tail);
    this.wav = encoded.wav;
    this.timetable = encoded.timetable;
    this.duration = encoded.duration;
    this.sampleRate = encoded.sampleRate;
    this.gapSeconds = gap;
    this._url = null;
  }

  get verseCount() {
    return this.timetable.length;
  }

  // Lazily create (and cache) the Blob URL for this track. Revoked by release().
  url() {
    if (this._url) return this._url;
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
    const blob = this._blob || new Blob([this.wav], { type: 'audio/wav' });
    this._url = URL.createObjectURL(blob);
    return this._url;
  }

  // Drop the Blob URL and the WAV bytes. The timetable/refs are cheap and kept
  // so a released track can still be reasoned about, but PCM is not retained.
  // A track created by fromUrl() does NOT own its URL (the prepared player
  // keeps it for the whole session), so release() leaves that URL alone.
  release() {
    if (this._ownsUrl === false) {
      this.wav = null;
      return;
    }
    if (this._url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      try { URL.revokeObjectURL(this._url); } catch (e) { /* ignore */ }
    }
    this._url = null;
    this.wav = null;
    this._blob = null;
  }

  get released() {
    return this._url == null && this.wav == null && this._blob == null;
  }

  // Timetable index whose [start, end) contains `seconds`, or -1. Clamps to the
  // first entry before the start and the last entry within the tail.
  indexAt(seconds) {
    if (!(seconds >= 0) || !this.timetable.length) return -1;
    let lo = 0;
    let hi = this.timetable.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const e = this.timetable[mid];
      if (seconds < e.start) {
        hi = mid - 1;
      } else if (seconds >= e.end) {
        lo = mid + 1;
      } else {
        found = mid;
        break;
      }
    }
    if (found >= 0) return found;
    // In a gap, in the tail, or before the first start: snap sensibly.
    if (seconds < this.timetable[0].start) return 0;
    for (let i = this.timetable.length - 1; i >= 0; i--) {
      if (seconds >= this.timetable[i].start) return i;
    }
    return -1;
  }

  // Timetable entry for `seconds`, or null.
  entryAt(seconds) {
    const i = this.indexAt(seconds);
    return i >= 0 ? this.timetable[i] : null;
  }

  // Start offset (seconds) of the timerable verse with this ref, or -1.
  offsetForRef(ref) {
    for (const e of this.timetable) {
      if (e.ref === ref) return e.start;
    }
    return -1;
  }
};
