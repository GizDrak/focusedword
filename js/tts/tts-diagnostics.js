// tts-diagnostics.js — lightweight TTS stage breadcrumbs.
//
// sessionStorage survives an unexpected iOS tab/process reload, so the latest
// synthesis stage is persisted there to diagnose evictions/OOM mid-playback.
// Web Workers have NO sessionStorage access, so the Piper worker posts
// BREADCRUMB messages to the main thread, which funnels them through here;
// PlaybackController writes its own playback stages directly.
//
// Stores the latest stage (for a quick reload-time check) plus a small bounded
// history (for reconstructing the sequence that led to the reload).
//
// Tagging is currently DISABLED (enabled = false): mark() becomes a no-op, so
// no breadcrumbs are persisted. Flip it back to true to resume the trail.

window.TTSDiagnostics = {
  KEY: 'focused-word:tts-stage',
  HISTORY_KEY: 'focused-word:tts-stage-history',
  HISTORY_LIMIT: 40,
  enabled: false,

  mark(stage, data) {
    if (!this.enabled) return;
    try {
      const entry = { stage, at: Date.now(), ...(data || {}) };
      sessionStorage.setItem(this.KEY, JSON.stringify(entry));
      const history = this._readHistory();
      history.push(entry);
      while (history.length > this.HISTORY_LIMIT) history.shift();
      sessionStorage.setItem(this.HISTORY_KEY, JSON.stringify(history));
    } catch (e) { /* sessionStorage may be blocked; diagnostics are best-effort */ }
  },

  get() {
    try { return JSON.parse(sessionStorage.getItem(this.KEY) || 'null'); } catch (e) { return null; }
  },

  history() {
    try { return JSON.parse(sessionStorage.getItem(this.HISTORY_KEY) || '[]'); } catch (e) { return []; }
  },

  clear() {
    try {
      sessionStorage.removeItem(this.KEY);
      sessionStorage.removeItem(this.HISTORY_KEY);
    } catch (e) { /* ignore */ }
  },

  _readHistory() {
    try { return JSON.parse(sessionStorage.getItem(this.HISTORY_KEY) || '[]'); } catch (e) { return []; }
  }
};