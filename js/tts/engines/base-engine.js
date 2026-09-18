window.BaseTTSEngine = class BaseTTSEngine {
  constructor(bridge) {
    this.bridge = bridge;
    this.loaded = false;
  }

  get id() {
    return 'base';
  }

  get label() {
    return 'Base';
  }

  async load() {
    throw new Error('BaseTTSEngine.load() not implemented');
  }

  async synthesize(chunk, opts) {
    throw new Error('BaseTTSEngine.synthesize() not implemented');
  }

  async dispose() {
    this.loaded = false;
  }

  async isAvailable() {
    return false;
  }

  async getCapabilities() {
    return {
      engine: this.id,
      available: false,
      group: 'device',
      speed: true,
      pause: true,
      voiceSelection: false,
      streaming: false,
      voices: []
    };
  }

  getVoices() {
    return [];
  }

  setVoice() {}

  pause() {}

  resume() {}

  needsRestart() {
    return false;
  }

  clearRestart() {}

  isBusy() {
    return false;
  }

  cancel() {}
};
