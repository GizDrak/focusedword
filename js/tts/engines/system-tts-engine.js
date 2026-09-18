window.SystemTTSEngine = class SystemTTSEngine extends window.BaseTTSEngine {
  constructor(bridge) {
    super(bridge);
    this._voices = [];
    this._currentUtterance = null;
    this._rejectCurrent = null;
    this._canceled = false;
    this._resumeFromStart = false;
  }

  get id() {
    return 'system';
  }

  get label() {
    return 'Device Voice';
  }

  async isAvailable() {
    return typeof window.speechSynthesis !== 'undefined' &&
      typeof window.SpeechSynthesisUtterance !== 'undefined';
  }

  async load() {
    if (this.loaded) return true;
    if (!(await this.isAvailable())) return false;
    this._refreshVoices();
    await this._waitForVoices(3000);
    this.loaded = true;
    return true;
  }

  _refreshVoices() {
    try {
      this._voices = window.speechSynthesis.getVoices() || [];
    } catch (e) {
      this._voices = [];
    }
  }

  _waitForVoices(timeoutMs) {
    if (this._voices.length) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.speechSynthesis.removeEventListener('voiceschanged', finish);
        this._refreshVoices();
        resolve();
      };
      window.speechSynthesis.addEventListener('voiceschanged', finish);
      setTimeout(finish, timeoutMs);
    });
  }

  getVoices() {
    return this._voices;
  }

  async getCapabilities() {
    const available = await this.isAvailable();
    return {
      engine: this.id,
      available,
      group: 'device',
      speed: true,
      pause: true,
      voiceSelection: this._voices.length > 0,
      streaming: false,
      voices: this._voices.map(v => ({ uri: v.voiceURI, name: v.name, lang: v.lang }))
    };
  }

  async synthesize(chunk, opts = {}) {
    if (!(await this.isAvailable())) {
      throw new Error('speechSynthesis unavailable');
    }
    this.cancel();
    this._canceled = false;
    if (window.speechSynthesis.paused) {
      try { window.speechSynthesis.resume(); } catch (e) { /* ignore */ }
    }
    // Piper inserts real silence for {{pause:N}} (word-study phrases); the
    // system engine can't, so turn each token into a clause pause instead.
    const text = String(chunk.text).replace(/\{\{pause:[0-9.]+\}\}/g, ', ');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this._clampRate(opts.rate);
    const rawVoice = opts.voice && opts.voice.raw ? opts.voice.raw : null;
    if (rawVoice) {
      utterance.voice = rawVoice;
      utterance.lang = rawVoice.lang;
    }
    return new Promise((resolve, reject) => {
      utterance.onstart = () => {
        if (typeof opts.onStart === 'function') opts.onStart();
      };
      utterance.onend = () => {
        this._clearCurrent();
        if (this._canceled) {
          reject({ canceled: true });
        } else {
          resolve({ spoken: true });
        }
      };
      utterance.onerror = (e) => {
        this._clearCurrent();
        const err = e && e.error;
        if (this._canceled || err === 'interrupted' || err === 'canceled') {
          reject({ canceled: true });
        } else {
          reject(new Error('speechSynthesis error: ' + (err || 'unknown')));
        }
      };
      this._currentUtterance = utterance;
      this._rejectCurrent = (reason) => {
        this._clearCurrent();
        reject(reason);
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  pause() {
    try {
      window.speechSynthesis.pause();
    } catch (e) { /* ignore */ }
    if (!window.speechSynthesis.paused && this._currentUtterance) {
      this._resumeFromStart = true;
      try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    }
  }

  resume() {
    try {
      window.speechSynthesis.resume();
    } catch (e) { /* ignore */ }
  }

  needsRestart() {
    return this._resumeFromStart;
  }

  clearRestart() {
    this._resumeFromStart = false;
  }

  isBusy() {
    try {
      return !!(window.speechSynthesis.speaking || window.speechSynthesis.pending);
    } catch (e) {
      return false;
    }
  }

  cancel() {
    const hadPending = !!this._currentUtterance;
    this._canceled = true;
    if (hadPending && this._rejectCurrent) {
      const reject = this._rejectCurrent;
      this._clearCurrent();
      reject({ canceled: true });
    }
    try {
      window.speechSynthesis.cancel();
    } catch (e) { /* ignore */ }
  }

  _clearCurrent() {
    this._currentUtterance = null;
    this._rejectCurrent = null;
  }

  async dispose() {
    this.cancel();
    this._voices = [];
    await super.dispose();
  }

  _clampRate(rate) {
    const n = Number(rate);
    if (!n || Number.isNaN(n)) return 1;
    return Math.min(2, Math.max(0.4, n));
  }
};
