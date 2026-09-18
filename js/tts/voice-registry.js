window.VoiceRegistry = class VoiceRegistry {
  constructor(bridge) {
    this.bridge = bridge;
    this._voices = new Map();
    this._listeners = new Set();
  }

  syncEngine(engineId, descriptors, engineLabel) {
    for (const [id, v] of Array.from(this._voices)) {
      if (v.engine === engineId) this._voices.delete(id);
    }
    for (const d of descriptors || []) {
      if (!d.uri) continue;
      const voice = {
        id: engineId + ':' + encodeURIComponent(d.uri),
        engine: engineId,
        engineLabel: engineLabel || engineId,
        name: d.name || d.uri,
        locale: d.lang || '',
        group: d.group || this._groupForEngine(engineId),
        raw: d.raw || null
      };
      this._voices.set(voice.id, voice);
    }
    this._notify();
  }

  _groupForEngine(engineId) {
    // Piper is the app's only neural engine; its curated narrators are the
    // Natural Voices. Device/system voices sit in their own group.
    if (engineId === 'piper') return 'natural';
    return 'device';
  }

  groupLabel(group) {
    if (group === 'natural') return 'Natural Voices';
    return 'Device Voices';
  }

  getVoices(filter = {}) {
    let list = Array.from(this._voices.values());
    if (filter.engine) list = list.filter(v => v.engine === filter.engine);
    if (filter.group) list = list.filter(v => v.group === filter.group);
    if (filter.locale) {
      const prefix = filter.locale.toLowerCase();
      list = list.filter(v => (v.locale || '').toLowerCase().startsWith(prefix));
    }
    return this._sort(list);
  }

  getGroupedVoices() {
    const groups = new Map();
    for (const v of this.getVoices()) {
      if (!groups.has(v.group)) groups.set(v.group, []);
      groups.get(v.group).push(v);
    }
    return groups;
  }

  _sort(list) {
    return list.sort((a, b) => {
      const ae = (a.locale || '').toLowerCase().startsWith('en') ? 0 : 1;
      const be = (b.locale || '').toLowerCase().startsWith('en') ? 0 : 1;
      if (ae !== be) return ae - be;
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  getVoice(id) {
    return this._voices.get(id) || null;
  }

  getDefaultVoice(engineId) {
    // Prefer the first voice registered for the engine (the curated narrator),
    // falling back to the first English voice, then any voice.
    const pick = (list) => list.length ? list[0] : null;
    if (engineId) {
      const voices = Array.from(this._voices.values()).filter(v => v.engine === engineId);
      return pick(voices) ||
        pick(this.getVoices({ engine: engineId, locale: 'en' })) ||
        pick(this.getVoices({ engine: engineId }));
    }
    return pick(Array.from(this._voices.values())) ||
      pick(this.getVoices({ locale: 'en' })) ||
      pick(this.getVoices());
  }

  onVoicesChanged(cb) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _notify() {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[voice-registry] listener error:', e); }
    }
  }
};
