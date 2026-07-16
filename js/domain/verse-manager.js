window.VerseManager = class VerseManager {
  constructor(stateStore) {
    this._stateStore = stateStore;
    this._locked = false;
    this._failsafeTimer = null;
  }

  setIntentional(verse) {
    this._locked = true;
    if (this._failsafeTimer) {
      clearTimeout(this._failsafeTimer);
    }
    this._failsafeTimer = setTimeout(() => {
      this.releaseLock();
    }, 1500);
    this._stateStore.batch({ currentVerse: verse });
  }

  setPassive(verse) {
    if (this._locked) return;
    this._stateStore.batch({ currentVerse: verse });
  }

  releaseLock() {
    this._locked = false;
    if (this._failsafeTimer) {
      clearTimeout(this._failsafeTimer);
      this._failsafeTimer = null;
    }
  }
};
