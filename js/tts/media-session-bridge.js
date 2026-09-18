// media-session-bridge.js — Lock Screen / Control Center integration.
//
// Projects the Read Aloud playback session onto the OS media UI via the
// Media Session API: title ("John 3:16"), artwork, play/pause state and the
// hardware transport buttons. This is progressive enhancement — everything is
// guarded, and an environment without `navigator.mediaSession` simply gets no
// lock-screen card (in-app playback is unaffected).
//
// A single media session stays alive for the whole run: verse/chapter advances
// only swap the metadata, they never tear the session down. Position/duration
// is only available when the active engine plays real PCM (Piper); the system
// speech engine surfaces metadata and controls but no progress bar.

window.MediaSessionBridge = class MediaSessionBridge {
  constructor(bridge) {
    this.bridge = bridge;
    this._offs = [];
    this._positionTimer = null;
    this._lastPosition = null;
  }

  get manager() {
    return this.bridge.get('tts');
  }

  get session() {
    return (typeof navigator !== 'undefined' && navigator.mediaSession) || null;
  }

  init() {
    const session = this.session;
    if (!session || typeof window.MediaMetadata !== 'function') return;
    this._offs.push(this.bridge.on('tts:current-verse', (p) => this._onCurrentVerse(p)));
    this._offs.push(this.bridge.on('tts:state', (p) => this._onState(p)));
    this._bindActions();
  }

  dispose() {
    for (const off of this._offs) {
      try { off(); } catch (e) { /* ignore */ }
    }
    this._offs = [];
    this._stopPositionTimer();
  }

  _bindActions() {
    const session = this.session;
    const manager = this.manager;
    if (!session || !manager) return;
    const c = () => manager.controller;
    const handlers = {
      // 'play' must only start/resume — never pause the way toggle() would.
      play: () => {
        const controller = c();
        if (!controller) return;
        if (controller.state === 'paused') controller.resume();
        else if (controller.state === 'idle') manager.start(this.bridge.state.get('currentVerse'));
      },
      pause: () => {
        const controller = c();
        if (controller) controller.pause();
      },
      // Lock-screen previous/next: the controller seeks within the ALREADY
      // prepared/loaded resource using the timetable. It never invokes Piper
      // from a media control (there is no synthesis on these paths in prepared
      // mode; in live mode next/prev only move the existing queue).
      previoustrack: () => manager.prevVerse(),
      nexttrack: () => manager.nextVerse(),
      // ±10s seek within the active media resource (prepared or track mode).
      seekbackward: (details) => this._seekBy(-(details && details.seekOffset ? details.seekOffset : 10)),
      seekforward: (details) => this._seekBy(details && details.seekOffset ? details.seekOffset : 10),
      seekto: (details) => {
        if (details && typeof details.seekTime === 'number') this._seekTo(details.seekTime);
      }
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try {
        session.setActionHandler(action, handler);
      } catch (e) { /* action unsupported on this platform */ }
    }
  }

  // Seek the active media resource by a relative offset. Works for the
  // prepared session (one long resource); a no-op otherwise (nothing long to
  // seek within on the live path).
  _seekBy(deltaSeconds) {
    const controller = this.manager && this.manager.controller;
    if (!controller) return;
    const prepared = controller._prepared && controller._prepared.player;
    if (controller.mode === 'prepared' && prepared) {
      const t = prepared.currentTime;
      if (t != null) this._seekTo(t + deltaSeconds);
    }
  }

  _seekTo(seconds) {
    const controller = this.manager && this.manager.controller;
    if (!controller) return;
    const prepared = controller._prepared && controller._prepared.player;
    if (controller.mode === 'prepared' && prepared) {
      const s = Math.max(0, seconds);
      // Seek the element, then resync the highlighted verse from the timetable.
      if (prepared._out && prepared._out.seekTo(s)) {
        const i = prepared.currentIndex();
        if (i >= 0) controller._emitPreparedVerse(i);
      }
    }
  }

  _onCurrentVerse(payload) {
    const item = this.manager && this.manager.controller
      ? this.manager.controller.currentItem
      : null;
    const verseId = (item && item.verseId) || (payload && payload.verseId) || null;
    if (!verseId) return;
    const title = this._formatReference(verseId);
    try {
      this.session.metadata = new window.MediaMetadata({
        title,
        artist: 'Focused Word',
        album: 'Bible Reading',
        artwork: [
          { src: '/assets/icons/pwa/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/assets/icons/pwa/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      });
    } catch (e) { /* metadata assignment unavailable */ }
    // A new verse invalidates the previous position sample.
    this._lastPosition = null;
  }

  _onState(payload) {
    const state = payload && payload.state ? payload.state : 'idle';
    const session = this.session;
    if (!session) return;
    const playing = state === 'playing' || state === 'loading' || state === 'buffering';
    const paused = state === 'paused';
    try {
      session.playbackState = playing ? 'playing' : (paused ? 'paused' : 'none');
    } catch (e) { /* ignore */ }
    if (playing) this._startPositionTimer();
    else this._stopPositionTimer();
  }

  _formatReference(verseId) {
    const chapter = verseId.chapter;
    const verse = verseId.verse;
    let book = '';
    if (window.BookMap && typeof window.BookMap.getName === 'function') {
      const name = window.BookMap.getName(verseId.book);
      book = name && typeof window.BookMap.denormalizeName === 'function'
        ? window.BookMap.denormalizeName(name)
        : (name || '');
    }
    if (!book) book = this.bridge.state.get('currentBookName') || '';
    const where = [book, chapter].filter(Boolean).join(' ');
    return verse ? where + ':' + verse : where;
  }

  _startPositionTimer() {
    if (this._positionTimer) return;
    this._positionTimer = setInterval(() => this._updatePosition(), 1000);
    this._updatePosition();
  }

  _stopPositionTimer() {
    if (!this._positionTimer) return;
    clearInterval(this._positionTimer);
    this._positionTimer = null;
    this._lastPosition = null;
  }

  // Position state describes the PHYSICAL media resource. For a PREPARED
  // session the clock is the prepared player's (the one long continuous
  // resource); otherwise it is the active verse's PCM clock. Skipped silently
  // for system speech.
  _updatePosition() {
    const session = this.session;
    if (!session || typeof session.setPositionState !== 'function') return;
    const controller = this.manager && this.manager.controller;
    let duration = null;
    let position = null;
    if (controller && controller.mode === 'prepared' && controller._prepared && controller._prepared.player) {
      duration = controller._prepared.player.duration;
      position = controller._prepared.player.currentTime;
    }
    if (!(duration > 0)) {
      const engine = this.manager && this.manager.engine;
      if (engine && typeof engine.playbackDuration === 'function') {
        duration = engine.playbackDuration();
        position = typeof engine.playbackPosition === 'function' ? engine.playbackPosition() : null;
      }
    }
    if (!(duration > 0) || !(position >= 0)) return;
    const clamped = Math.min(position, duration);
    if (this._lastPosition === clamped) return;
    try {
      session.setPositionState({ duration, playbackRate: 1, position: clamped });
      this._lastPosition = clamped;
    } catch (e) { /* invalid state or unsupported */ }
  }
};
