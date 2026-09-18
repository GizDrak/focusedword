// prepared-player.js — plays a PREPARED BACKGROUND AUDIO session.
//
// Wraps ONE persistent HTMLAudioElement (via MediaElementAudioOutput) over the
// single already-encoded continuous resource for the session. The whole point
// is that the resource that is playing when the device locks needs no further
// JavaScript: no src switching, no ended-handler handoff, no Piper.
//
// It exposes verse-level behavior entirely by MAPPING audio.currentTime through
// the session timetable:
//   - position/duration describe the CURRENT verse (for Media Session)
//   - onSegment fires as playback crosses into a verse (for highlighting)
//   - seekToRef / nextVerse / prevVerse seek within the resource
//   - verseAt(seconds) recovers the verse after a lock (visibilitychange)
//
// It does not synthesize, encode, or touch OPFS. It is a thin, testable shell
// over MediaElementAudioOutput + the timetable.

window.PreparedPlayer = class PreparedPlayer {
  // session: prepared session metadata (with `verses` timetable).
  // url:     object URL for the continuous audio resource (owned by caller).
  constructor(session, url) {
    this.session = session;
    this.url = url;
    this.verses = session.verses || [];
    this._out = (window.MediaElementAudioOutput ? new window.MediaElementAudioOutput() : null);
    this._track = null;
    this._index = -1;
    this._onVerse = null;
    this._prepared = false;
  }

  get available() {
    return !!this._out;
  }

  // Create the element inside a user gesture (autoplay policy) — call from the
  // tap that starts prepared playback.
  unlock() {
    if (this._out) this._out.unlock();
  }

  // Build the track wrapper once (does not revoke the URL on release).
  _trackFor() {
    if (this._track) return this._track;
    this._track = window.BackgroundTrack.fromUrl(this.url, this.verses, {
      duration: this.session.actualDuration,
      sampleRate: 22050,
      queueStart: 0
    });
    return this._track;
  }

  // Begin at the verse with this ref (falls back to the first verse). `onVerse`
  // is called with the timetable index on every verse transition. Resolves when
  // the resource ends.
  async playFromRef(ref, onVerse) {
    if (!this._out) throw new Error('HTMLAudioElement unavailable');
    const start = this._indexForRef(ref);
    return this.playFromIndex(start, onVerse);
  }

  async playFromIndex(index, onVerse) {
    if (!this._out) throw new Error('HTMLAudioElement unavailable');
    const i = (index >= 0 && index < this.verses.length) ? index : 0;
    this._onVerse = typeof onVerse === 'function' ? onVerse : null;
    this._index = i;
    const entry = this.verses[i];
    this._prepared = true;
    const track = this._trackFor();
    if (this._onVerse) this._onVerse(i, this.verses[i]);
    return this._out.playTrack(track, {
      startAt: entry ? entry.start : 0,
      onSegment: (segIndex) => {
        if (segIndex === this._index) return;
        this._index = segIndex;
        if (this._onVerse) this._onVerse(segIndex, this.verses[segIndex]);
      }
    });
  }

  resume() {
    if (this._out) this._out.resume();
  }

  pause() {
    if (this._out) this._out.suspend();
  }

  stop() {
    if (this._out) this._out.stop();
    this._prepared = false;
  }

  async close() {
    if (this._out) await this._out.close();
  }

  get playing() {
    return this._prepared && !!this._out && this._out.active;
  }

  // The verse index whose [start,end) contains the CURRENT media position, or
  // -1. Used after a lock (timeupdate may not have fired while frozen).
  currentIndex() {
    if (!this._out) return -1;
    const t = this._out.currentTime;
    if (!(t >= 0)) return -1;
    const i = window.PreparedSession.indexAt(this.verses, t);
    return i;
  }

  currentEntry() {
    const i = this.currentIndex();
    return i >= 0 ? this.verses[i] : null;
  }

  // Seek to the start of verse `ref`. Returns the index or -1.
  seekToRef(ref) {
    const i = this._indexForRef(ref);
    if (i < 0) return -1;
    const entry = this.verses[i];
    if (this._out && this._out.seekTo(entry.start)) {
      this._index = i;
      return i;
    }
    return -1;
  }

  // Next verse: seek to the following timetable entry. Returns its index or -1.
  nextVerse() {
    const i = Math.min(this.verses.length - 1, this._index + 1);
    if (i === this._index) return -1;
    const entry = this.verses[i];
    if (this._out && this._out.seekTo(entry.start)) {
      this._index = i;
      return i;
    }
    return -1;
  }

  // Previous verse: restart the current verse if already into it, else step
  // back one (standard media "previous" behavior).
  prevVerse(restartThresholdSeconds = 3) {
    if (!this._out) return -1;
    const t = this._out.currentTime || 0;
    const cur = this.verses[this._index];
    if (cur && (t - cur.start) > restartThresholdSeconds) {
      if (this._out.seekTo(cur.start)) return this._index;
    }
    const i = Math.max(0, this._index - 1);
    const entry = this.verses[i];
    if (this._out.seekTo(entry.start)) {
      this._index = i;
      return i;
    }
    return -1;
  }

  // Media clocks for the Media Session position state.
  get currentTime() { return this._out ? this._out.currentTime : null; }
  get duration() {
    if (this._out && typeof this._out.trackDuration === 'number' && this._out.trackDuration > 0) {
      return this._out.trackDuration;
    }
    return this.session.actualDuration || null;
  }

  _indexForRef(ref) {
    if (!ref) return 0;
    for (let i = 0; i < this.verses.length; i++) {
      if (this.verses[i].ref === ref) return i;
    }
    return 0;
  }
};
