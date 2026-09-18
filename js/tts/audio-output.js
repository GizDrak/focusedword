// audio-output.js — Web Audio PCM playback wrapper.
//
// Owns a single AudioContext (created lazily on first play, resumed within
// the user-gesture call chain when possible) and plays mono Float32 PCM
// buffers. Tracks the active source so stop()/suspend() are clean and
// exposes a completion promise for sequential playback loops.
//
// iOS quirk: a fresh AudioContext starts suspended and resume() only succeeds
// while still inside a user-gesture handler. Playback begins long after the
// tap (the neural engine synthesizes first), so call unlock() synchronously
// from the gesture that starts Read Aloud — it creates + resumes the context
// inside the gesture and the promise settles later.

window.AudioOutput = class AudioOutput {
  constructor() {
    this._ctx = null;
    this._source = null;
    this._rejectCurrent = null;
    this._unlockBound = false;
    // True while the user has explicitly paused playback. The global unlock
    // safety net must not resume the context during an intentional pause.
    this._intentionallySuspended = false;
    // Outstanding (played but not yet ended) buffer sources. Tracked to catch
    // a Web Audio leak: an ended source still connected to the graph is
    // retained by Safari/WebKit, so disconnect() must run on natural end too.
    this._outstandingSources = 0;
    this._leakWarned = false;
    // Media Session position clock: duration of the active buffer and the
    // AudioContext time playback started at. The context clock freezes while
    // suspended, so a paused position reads as-is.
    this._activeDuration = 0;
    this._activeStartedAt = null;
  }

  get active() {
    return !!this._source;
  }

  // Seconds of the active buffer already played, or null when nothing is
  // playing / the clock is unavailable. Clamped to the buffer duration.
  get position() {
    if (!this._source || this._activeStartedAt == null || !(this._activeDuration > 0)) return null;
    const now = (this._ctx && typeof this._ctx.currentTime === 'number') ? this._ctx.currentTime : 0;
    return Math.max(0, Math.min(now - this._activeStartedAt, this._activeDuration));
  }

  // Duration (seconds) of the active buffer, or null when idle.
  get duration() {
    if (!this._source || !(this._activeDuration > 0)) return null;
    return this._activeDuration;
  }

  // Request the iOS "playback" audio session so Web Audio keeps playing when
  // the Ring/Silent switch is on. No-op where navigator.audioSession is absent.
  _applyAudioSession() {
    try {
      if ('audioSession' in navigator) {
        navigator.audioSession.type = 'playback';
      }
    } catch (err) {
      console.warn('[TTS] Unable to set audio session:', err);
    }
  }

  _ensureContext() {
    if (this._ctx) return this._ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('Web Audio API unavailable');
    this._applyAudioSession();
    this._ctx = new Ctx();
    return this._ctx;
  }

  // iOS: create (and resume, if suspended) the AudioContext synchronously so
  // the call happens inside the user gesture. Safe to call repeatedly. Also
  // binds a one-time safety net that resumes the context on any later tap.
  unlock() {
    try {
      const ctx = this._ensureContext();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (e) { /* Web Audio unavailable — playback will fail visibly */ }
    this._intentionallySuspended = false;
    this._bindGlobalUnlock();
  }

  _bindGlobalUnlock() {
    if (this._unlockBound) return;
    this._unlockBound = true;
    const tryUnlock = () => {
      // Never resume a context the user deliberately paused — only the
      // initial iOS gesture lock or a browser-initiated suspension.
      if (this._ctx && this._ctx.state === 'suspended' && !this._intentionallySuspended) {
        this._ctx.resume().catch(() => {});
      }
    };
    for (const ev of ['pointerdown', 'keydown', 'touchend']) {
      try {
        window.addEventListener(ev, tryUnlock, { passive: true });
      } catch (e) { /* ignore */ }
    }
  }

  // Resolves when playback finishes naturally. Rejects with {canceled:true}
  // if stop() is called first.
  async play(pcm, sampleRate) {
    const ctx = this._ensureContext();
    if (this._source) this._stopSource();
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }
    const buffer = ctx.createBuffer(1, pcm.length, sampleRate || 24000);
    buffer.copyToChannel(pcm instanceof Float32Array ? pcm : new Float32Array(pcm), 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    this._source = source;
    this._outstandingSources++;
    this._warnIfLeaking();
    try {
      await new Promise((resolve, reject) => {
        this._rejectCurrent = reject;
        source.onended = () => {
          if (this._source === source) {
            this._source = null;
            this._clearPositionClock();
          }
          this._outstandingSources = Math.max(0, this._outstandingSources - 1);
          // Disconnect the finished node: an ended source left connected to
          // the graph is retained (with its AudioBuffer) by WebKit, so over
          // long playback the Web Audio heap grows until the tab is evicted.
          try { source.disconnect(); } catch (e) { /* ignore */ }
          resolve();
        };
        // The buffer length / sample rate give the Media Session duration;
        // the context clock gives the elapsed position (see getters above).
        this._activeDuration = buffer.duration != null
          ? buffer.duration
          : (pcm.length / (sampleRate || 24000));
        this._activeStartedAt = ctx.currentTime;
        source.start();
      });
    } finally {
      this._rejectCurrent = null;
      if (this._source === source) {
        this._source = null;
        this._clearPositionClock();
      }
      source.onended = null;
    }
  }

  _clearPositionClock() {
    this._activeDuration = 0;
    this._activeStartedAt = null;
  }

  // iOS crash guard: if outstanding sources ever climb well past the look-ahead
  // depth, disconnect() isn't running on the natural-end path — warn once so a
  // leak regressing the iOS eviction fix is caught in the field.
  _warnIfLeaking() {
    if (this._outstandingSources <= 16) return;
    if (this._leakWarned) return;
    this._leakWarned = true;
    console.warn('[TTS] outstanding audio sources = ' + this._outstandingSources +
      ' (expected <= 4) — BufferSource disconnect may be failing');
  }

  suspend() {
    if (this._ctx && this._ctx.state === 'running') {
      this._intentionallySuspended = true;
      this._ctx.suspend().catch(() => {});
    }
  }

  resume() {
    this._intentionallySuspended = false;
    this._applyAudioSession();
    if (this._ctx && this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
  }

  stop() {
    this._stopSource();
    this.resume();
  }

  _stopSource() {
    const source = this._source;
    if (!source) return;
    this._source = null;
    this._clearPositionClock();
    this._outstandingSources = Math.max(0, this._outstandingSources - 1);
    if (this._rejectCurrent) {
      const reject = this._rejectCurrent;
      this._rejectCurrent = null;
      reject({ canceled: true });
    }
    try {
      source.onended = null;
      source.stop();
      source.disconnect();
    } catch (e) { /* ignore */ }
  }

  async close() {
    this._stopSource();
    if (this._ctx) {
      const ctx = this._ctx;
      this._ctx = null;
      try { await ctx.close(); } catch (e) { /* ignore */ }
    }
  }
};
