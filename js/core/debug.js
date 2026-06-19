window.Debug = class Debug {
  constructor() {
    this._log = [];
    this.maxEntries = 200;
    this._originalConsole = {
      error: console.error.bind(console),
      warn: console.warn.bind(console)
    };
    this._bindGlobal();
    this._interceptConsole();
  }

  _bindGlobal() {
    window.addEventListener('error', (e) => {
      this._addEntry('error', e.error || e, { module: 'global', event: 'uncaught' });
    });
    window.addEventListener('unhandledrejection', (e) => {
      this._addEntry('error', e.reason, { module: 'global', event: 'unhandledrejection' });
    });
  }

  _interceptConsole() {
    console.error = (...args) => {
      this._addEntry('error', args.map(a => (a?.message || String(a))).join(' '), { module: this._guessModule() });
      this._originalConsole.error(...args);
    };
    console.warn = (...args) => {
      this._addEntry('warn', args.map(a => (a?.message || String(a))).join(' '), { module: this._guessModule() });
      this._originalConsole.warn(...args);
    };
  }

  _guessModule() {
    const err = new Error();
    const stack = err.stack || '';
    const lines = stack.split('\n');
    for (let i = 2; i < lines.length; i++) {
      const m = lines[i].match(/([a-z0-9_-]+)\.js[:\d]/i);
      if (m) return m[1];
    }
    return 'unknown';
  }

  _addEntry(level, error, context = {}) {
    const entry = {
      ts: Date.now(),
      level,
      msg: error?.message || String(error),
      stack: error?.stack || null,
      module: context.module || 'unknown',
      event: context.event || null,
      data: context.data || null
    };
    this._log.push(entry);
    if (this._log.length > this.maxEntries) this._log.shift();
  }

  capture(error, context = {}) {
    this._addEntry('error', error, context);
  }

  warn(message, context = {}) {
    this._addEntry('warn', message, context);
  }

  wrap(moduleName, fn, ...args) {
    try {
      const result = fn(...args);
      if (result && typeof result.then === 'function') {
        return result.catch((err) => {
          this.capture(err, { module: moduleName });
          throw err;
        });
      }
      return result;
    } catch (error) {
      this.capture(error, { module: moduleName });
      throw error;
    }
  }

  getLogs(level) {
    if (!level) return this._log.slice();
    return this._log.filter(e => e.level === level);
  }

  clearLogs() {
    this._log = [];
  }
};
