window.Debug = class Debug {
  constructor() {
    this.errors = [];
    this.maxErrors = 200;
    this._originalConsole = {
      error: console.error.bind(console),
      warn: console.warn.bind(console)
    };
    this._bindGlobal();
  }

  _bindGlobal() {
    window.addEventListener('error', (e) => {
      this.capture(e.error || e, { module: 'global', event: 'uncaught' });
    });
    window.addEventListener('unhandledrejection', (e) => {
      this.capture(e.reason, { module: 'global', event: 'unhandledrejection' });
    });
  }

  capture(error, context = {}) {
    const entry = {
      ts: Date.now(),
      msg: error?.message || String(error),
      stack: error?.stack || null,
      module: context.module || 'unknown',
      event: context.event || null,
      data: context.data || null
    };
    this.errors.push(entry);
    if (this.errors.length > this.maxErrors) this.errors.shift();
    this._originalConsole.error(`[${entry.module}] ${entry.msg}`, entry.stack || '');
  }

  warn(message, context = {}) {
    this._originalConsole.warn(`[${context.module || 'app'}] ${message}`);
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

  getErrors() {
    return this.errors.slice();
  }

  clearErrors() {
    this.errors = [];
  }
};
