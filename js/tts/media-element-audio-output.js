// media-element-audio-output.js — <audio>-element track playback.
//
// Final audible path for the Android/media-element route:
//
//     Piper PCM → WAV Blob → HTMLAudioElement
//
// Why a media element: on Android Chrome a playing media element holds the
// audio wake lock and anchors the OS media notification / lock-screen controls.
// A bare AudioContext does neither, and switching a media element's src or
// letting it hit `ended` while the screen is locked freezes JavaScript before
// the next resource can start. So the controller builds ONE long continuous WAV
// (a BackgroundTrack) containing many verses and this class plays it with a
// single src assignment and a single play() call.
//
// Public contract (kept compatible with AudioOutput's callers):
//   unlock()
//   playTrack(track, opts)   track = BackgroundTrack; resolves when it ends
//   play(pcm, sampleRate)    single-verse convenience (wraps a 1-unit track)
//   stop() / suspend() / resume() / close()
//   active / position / duration  (position & duration describe the CURRENT
//                                  verse via the track timetable)
//
// Playback position/duration always describe the physical media resource when
// no track is loaded, and the current verse when a track timetable is present.

window.MediaElementAudioOutput = class MediaElementAudioOutput {
  constructor() {
    this._el = null;
    this._track = null;
    this._url = null;
    this._resolveCurrent = null;
    this._rejectCurrent = null;
    this._active = false;
    this._intentionallySuspended = false;
    // Timetable navigation (set by playTrack).
    this._timeline = null;      // array of { ref, start, speechEnd, end }
    this._seenIndex = -1;
    this._onSegment = null;
  }

  // Reject an in-flight play promise without touching the element (callers swap
  // src / stop explicitly).
  _supersedePending() {
    if (!this._resolveCurrent) return;
    const reject = this._rejectCurrent;
    this._resolveCurrent = null;
    this._rejectCurrent = null;
    if (reject) reject({ canceled: true });
  }

  get active() {
    return this._active;
  }

  // Seconds of the active verse's SPEECH played (media clock mapped through the
  // timetable). Null when idle.
  get position() {
    if (!this._active || !this._el) return null;
    const t = this._el.currentTime;
    if (typeof t !== 'number' || !isFinite(t)) return 0;
    if (this._timeline && this._timeline.length) {
      const i = Math.max(0, Math.min(this._seenIndex, this._timeline.length - 1));
      const e = this._timeline[i];
      if (e) return Math.max(0, Math.min(t - e.start, e.speechEnd - e.start));
    }
    return t;
  }

  // Duration (seconds) of the active verse's speech, or of the whole resource on
  // the single-verse path.
  get duration() {
    if (!this._active || !this._el) return null;
    if (this._timeline && this._timeline.length) {
      const i = Math.max(0, Math.min(this._seenIndex, this._timeline.length - 1));
      const e = this._timeline[i];
      if (e) return e.speechEnd - e.start;
    }
    const d = this._el.duration;
    return (typeof d === 'number' && isFinite(d) && d > 0) ? d : null;
  }

  // Overall media duration (physical resource), for Media Session position
  // state. Prefers the element's own duration once metadata has loaded.
  get trackDuration() {
    if (!this._el) return null;
    const d = this._el.duration;
    if (typeof d === 'number' && isFinite(d) && d > 0) return d;
    return this._track ? this._track.duration : null;
  }

  get currentTime() {
    if (!this._el) return null;
    const t = this._el.currentTime;
    return (typeof t === 'number' && isFinite(t)) ? t : null;
  }

  get ended() {
    return !!(this._el && this._el.ended);
  }

  _ensureElement() {
    if (this._el) return this._el;
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
    const el = document.createElement('audio');
    el.preload = 'auto';
    try {
      el.setAttribute('playsinline', '');
      el.setAttribute('webkit-playsinline', '');
    } catch (e) { /* ignore */ }
    this._el = el;
    // Attach (off-screen): some Android builds only keep background playback
    // for an element that is in the document.
    try {
      if (typeof document.body === 'object' && document.body &&
          typeof document.body.appendChild === 'function') {
        el.setAttribute('aria-hidden', 'true');
        el.style.position = 'fixed';
        el.style.width = '0';
        el.style.height = '0';
        el.style.opacity = '0';
        document.body.appendChild(el);
      }
    } catch (e) { /* ignore */ }
    return el;
  }

  // Create the element inside the user gesture that starts Read Aloud (autoplay
  // policy). Safe to call repeatedly.
  unlock() {
    try { this._ensureElement(); } catch (e) { /* unavailable */ }
    this._intentionallySuspended = false;
  }

  // Play a long single-verse track. `opts.cue` { ref, verseId } labels it in
  // the timetable. Resolves when it ends. Thin wrapper over playTrack().
  async play(pcm, sampleRate, opts = {}) {
    if (!pcm || !pcm.length) throw new Error('MediaElementAudioOutput.play() received empty PCM');
    const unit = {
      ref: opts.cue ? opts.cue.ref : (opts.ref != null ? opts.ref : 'v0'),
      verseId: opts.cue ? opts.cue.verseId : (opts.verseId || null),
      pcm,
      sampleRate: sampleRate || 22050
    };
    const track = new window.BackgroundTrack([unit], { gapSeconds: 0, tailSeconds: 0 });
    return this.playTrack(track, opts);
  }

  // Play a BackgroundTrack as one continuous resource: one src assignment, one
  // play(). Resolves when the whole track ends (never earlier), so the caller
  // can hand off to an already-prefetched next track in the `ended` tick.
  //
  // opts:
  //   onSegment(i, entry) — fired as playback crosses into timetable verse i
  //   startAt(seconds)   — begin from this media offset
  //   onEnded()          — called (once) when the track ends naturally
  async playTrack(track, opts = {}) {
    if (!track || !window.BackgroundTrack) throw new Error('playTrack() requires a BackgroundTrack');
    const el = this._ensureElement();
    if (!el) throw new Error('HTMLAudioElement unavailable');
    const url = track.url();
    if (!url) throw new Error('Blob URL unavailable');

    this._supersedePending();

    const prevTrack = this._track;
    const prevUrl = this._url;
    this._track = track;
    this._url = url;
    this._timeline = track.timetable;
    this._seenIndex = -1;
    this._onSegment = typeof opts.onSegment === 'function' ? opts.onSegment : null;
    this._active = true;

    const advance = () => {
      if (!this._timeline) return;
      const t = el.currentTime;
      if (typeof t !== 'number' || !isFinite(t)) return;
      const idx = this._indexAt(t);
      if (idx >= 0 && idx !== this._seenIndex) {
        this._seenIndex = idx;
        if (this._onSegment) {
          try { this._onSegment(idx, this._timeline[idx]); } catch (e) { /* ignore */ }
        }
      }
    };
    el.ontimeupdate = advance;
    el.onended = () => {
      const resolve = this._resolveCurrent;
      this._resolveCurrent = null;
      this._rejectCurrent = null;
      if (typeof opts.onEnded === 'function') {
        try { opts.onEnded(); } catch (e) { /* ignore */ }
      }
      if (resolve) resolve();
    };
    el.onerror = () => {
      const reject = this._rejectCurrent;
      this._resolveCurrent = null;
      this._rejectCurrent = null;
      this._active = false;
      if (reject) reject(new Error('audio element playback failed'));
    };

    el.src = url;
    if (prevUrl && prevTrack !== track) this._revoke(prevUrl);
    else if (prevUrl && prevTrack === track) { /* same track re-seek: keep */ }

    const startAt = (opts.startAt && opts.startAt > 0) ? opts.startAt : 0;
    if (startAt) {
      try { el.currentTime = startAt; } catch (e) { /* metadata not ready */ }
    }

    return new Promise((resolve, reject) => {
      this._resolveCurrent = resolve;
      this._rejectCurrent = reject;
      const p = el.play();
      if (p && typeof p.catch === 'function') {
        p.catch((err) => {
          if (this._rejectCurrent !== reject) return;
          this._resolveCurrent = null;
          this._rejectCurrent = null;
          this._active = false;
          reject(err || new Error('audio element play() rejected'));
        });
      }
    });
  }

  // Move playback to a media offset within the CURRENT track (foreground
  // navigation). Returns true when a resource is loaded.
  seekTo(seconds) {
    const el = this._el;
    if (!el || !this._track) return false;
    try {
      el.currentTime = Math.max(0, seconds || 0);
      this._seenIndex = this._indexAt(el.currentTime);
      if (this._onSegment && this._seenIndex >= 0) {
        try { this._onSegment(this._seenIndex, this._timeline[this._seenIndex]); } catch (e) { /* ignore */ }
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  // True while THIS track object is still the loaded resource (guards stale
  // async handoffs without pausing an element that is mid-playback).
  isPlayingTrack(track) {
    return this._track === track;
  }

  _indexAt(seconds) {
    const tt = this._timeline;
    if (!tt || !tt.length) return -1;
    if (seconds < tt[0].start) return 0;
    let lo = 0;
    let hi = tt.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const e = tt[mid];
      if (seconds < e.start) hi = mid - 1;
      else if (seconds >= e.end) lo = mid + 1;
      else return mid;
    }
    for (let i = tt.length - 1; i >= 0; i--) {
      if (seconds >= tt[i].start) return i;
    }
    return tt.length - 1;
  }

  _revoke(url) {
    if (!url || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
    try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
  }

  suspend() {
    if (!this._el || !this._active) return;
    this._intentionallySuspended = true;
    try { this._el.pause(); } catch (e) { /* ignore */ }
  }

  resume() {
    this._intentionallySuspended = false;
    const el = this._el;
    if (el && this._active && el.paused) {
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  }

  stop() {
    this._stopSource();
  }

  _stopSource() {
    if (this._rejectCurrent) {
      const reject = this._rejectCurrent;
      this._resolveCurrent = null;
      this._rejectCurrent = null;
      reject({ canceled: true });
    } else {
      this._resolveCurrent = null;
    }
    this._active = false;
    const el = this._el;
    if (el) {
      try { el.ontimeupdate = null; el.onended = null; el.onerror = null; el.pause(); } catch (e) { /* ignore */ }
    }
    // Revoke the active URL; the controller owns track lifetime and releases it
    // too, but revoking here is idempotent and keeps stop() self-contained.
    if (this._url) this._revoke(this._url);
    this._url = null;
    this._track = null;
    this._timeline = null;
    this._seenIndex = -1;
    this._onSegment = null;
  }

  async close() {
    this._stopSource();
    const el = this._el;
    this._el = null;
    if (el) {
      try {
        el.onended = null;
        el.onerror = null;
        el.ontimeupdate = null;
        el.pause();
        el.removeAttribute('src');
        el.load();
      } catch (e) { /* ignore */ }
    }
  }
};
