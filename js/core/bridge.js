window.Bridge = class Bridge {
  constructor(debug) {
    this.debug = debug;
    this._handlers = new Map();
    this._modules = new Map();
    this._services = {};
    this._debugLog = false;
  }

  on(event, handler) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const handlers = this._handlers.get(event);
    if (handlers) handlers.delete(handler);
  }

  emit(event, payload) {
    if (this._debugLog) {
      this.debug.warn(`emit: ${event}`, { module: 'bridge', data: payload });
    }
    const handlers = this._handlers.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (e) {
        this.debug.capture(e, { module: 'bridge', event, data: payload });
      }
    }
  }

  register(name, module) {
    if (this._modules.has(name)) {
      this.debug.warn(`Module "${name}" already registered, overwriting`, { module: 'bridge' });
    }
    this._modules.set(name, module);
    if (typeof module.onRegister === 'function') {
      module.onRegister(this);
    }
  }

  get(name) {
    return this._modules.get(name);
  }

  call(moduleName, method, ...args) {
    const mod = this._modules.get(moduleName);
    if (!mod) {
      this.debug.capture(new Error(`Module "${moduleName}" not found`), { module: 'bridge' });
      return;
    }
    const fn = mod[method];
    if (typeof fn !== 'function') {
      this.debug.capture(new Error(`Method "${method}" not found on module "${moduleName}"`), { module: 'bridge' });
      return;
    }
    return this.debug.wrap(moduleName + '.' + method, () => fn.apply(mod, args));
  }

  get state() { return this._services.state; }
  set state(s) { this._services.state = s; }

  get db() { return this._services.db; }
  set db(d) { this._services.db = d; }

  get bionic() { return this._services.bionic; }
  set bionic(b) { this._services.bionic = b; }

  get selection() { return this._services.selection; }
  set selection(s) { this._services.selection = s; }
};
