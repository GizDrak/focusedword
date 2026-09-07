// StudyCompat — translation compatibility for study features.
//
// Word Classes, Word Study, and Clear Reading only work with the BSB
// translation; Verse Topics is translation-agnostic. When the active
// translation is anything else, the BSB-only features are toggled off and
// their controls are disabled (see SettingsModule._syncStudyCompatUI).
// Toggling off remembers what was on in localStorage so switching back to
// BSB restores the previous configuration.
window.StudyCompat = {
  BSB_ONLY_KEYS: ['wordClasses', 'wordStudyEnabled', 'wordStudyMode', 'clearReadingEnabled'],
  SNAPSHOT_KEY: 'focused-word:study-bsb-snapshot',

  isBsb(translation) {
    return (translation || 'BSB') === 'BSB';
  },

  _readSnapshot() {
    try {
      const raw = localStorage.getItem(this.SNAPSHOT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      return null;
    }
  },

  _writeSnapshot(snap) {
    try {
      if (snap && Object.keys(snap).length) {
        localStorage.setItem(this.SNAPSHOT_KEY, JSON.stringify(snap));
      } else {
        localStorage.removeItem(this.SNAPSHOT_KEY);
      }
    } catch (e) {
      // storage unavailable (private mode, quota) — toggling still works,
      // only the restore is lost.
    }
  },

  // Enforces the rules for the current translation. Returns true when any
  // study state changed. Emits nothing — callers decide whether to refresh.
  enforce(bridge) {
    const state = bridge.state;
    const bsb = this.isBsb(state.get('currentTranslation'));
    if (!bsb) {
      const on = this.BSB_ONLY_KEYS.filter(k => state.get(k) === true);
      if (!on.length) return false;
      const snap = this._readSnapshot() || {};
      for (const k of on) snap[k] = true;
      this._writeSnapshot(snap);
      const batch = {};
      for (const k of on) batch[k] = false;
      state.batch(batch);
      return true;
    }
    const snap = this._readSnapshot();
    if (!snap) return false;
    this._writeSnapshot(null);
    const batch = {};
    for (const k of this.BSB_ONLY_KEYS) {
      if (snap[k] === true && state.get(k) !== true) batch[k] = true;
    }
    if (!Object.keys(batch).length) return false;
    state.batch(batch);
    return true;
  },

  _syncSettingsUI(bridge) {
    try {
      const settings = bridge.get && bridge.get('settings');
      if (settings && typeof settings._syncStudyCompatUI === 'function') {
        settings._syncStudyCompatUI();
      }
    } catch (e) {
      console.warn('[StudyCompat] settings UI sync failed:', e);
    }
  },

  // Applies enforcement for the current translation: flips state, then
  // syncs the settings UI. Never reloads the chapter here — every
  // translation-switch flow re-renders itself after db.init completes, and
  // an eager load would race the core close/open and poison the verse
  // caches with empty results (blank page). Returns true when any study
  // state changed.
  apply(bridge) {
    const changed = this.enforce(bridge);
    this._syncSettingsUI(bridge);
    return changed;
  },

  // Registers the central listener (translation switches from the nav menu,
  // split dropdowns, or Focused Sync) and enforces once at startup for a
  // persisted non-BSB translation. Reloading is left to each flow's own
  // post-init render; the first chapter load picks the state up naturally.
  watch(bridge) {
    bridge.state.onChange('currentTranslation', () => this.apply(bridge));
    this.apply(bridge);
  }
};
