window.ReadingLog = class ReadingLog {
  constructor(bridge) {
    this.bridge = bridge;
    this._state = bridge.state;
    this._entries = [];
    this._listeners = new Map();
  }

  on(event, callback) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(callback);
  }

  off(event, callback) {
    const set = this._listeners.get(event);
    if (set) set.delete(callback);
  }

  _emit(event, data) {
    const set = this._listeners.get(event);
    if (set) set.forEach(cb => { try { cb(data); } catch (e) { console.warn('[ReadingLog] handler error:', e); } });
  }

  async init() {
    await this._state.ready();
    try {
      this._entries = await window.idb.getAll('reading_log');
    } catch (e) {
      console.warn('[ReadingLog] init failed:', e);
      this._entries = [];
    }
  }

  async recordReading({ plan_id, date, segments, verse_count }) {
    const entry = {
      id: window.UUID.generate(),
      date: date || this._today(),
      plan_id: plan_id || null,
      segments: segments || [],
      verse_count: verse_count || 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      deleted: false
    };
    this._entries.push(entry);
    await window.idb.put('reading_log', entry);
    this._state.setModuleTimestamp('readingLog');
    this._emit('reading-recorded', entry);
    return entry;
  }

  getEntriesForDate(date) {
    return this._entries.filter(e => !e.deleted && e.date === date);
  }

  getEntriesForDateRange(startDate, endDate) {
    return this._entries.filter(e => {
      if (e.deleted) return false;
      return e.date >= startDate && e.date <= endDate;
    });
  }

  getEntriesForPlan(plan_id) {
    return this._entries.filter(e => !e.deleted && e.plan_id === plan_id);
  }

  hasReadOnDate(date) {
    return this._entries.some(e => !e.deleted && e.date === date);
  }

  computeStreak() {
    let currentStreak = 0;
    let bestStreak = 0;
    let tempStreak = 0;

    const dates = new Set();
    for (const e of this._entries) {
      if (!e.deleted) dates.add(e.date);
    }
    if (dates.size === 0) return { current: 0, best: 0 };

    const sorted = Array.from(dates).sort().reverse();
    const today = this._today();

    for (const date of sorted) {
      const diff = this._daysBetween(date, today);
      if (currentStreak === 0 && diff > 0) break;
      if (currentStreak === 0 && diff === 0) { currentStreak = 1; continue; }
      if (currentStreak > 0 && diff !== currentStreak) break;
      currentStreak++;
    }

    let consecutive = 0;
    const forward = Array.from(dates).sort();
    for (let i = 0; i < forward.length; i++) {
      if (i === 0 || this._daysBetween(forward[i], forward[i - 1]) === 1) {
        consecutive++;
      } else {
        bestStreak = Math.max(bestStreak, consecutive);
        consecutive = 1;
      }
    }
    bestStreak = Math.max(bestStreak, consecutive);

    return { current: currentStreak, best: bestStreak };
  }

  _today() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  _daysBetween(dateA, dateB) {
    const a = new Date(dateA + 'T00:00:00');
    const b = new Date(dateB + 'T00:00:00');
    return Math.round((b - a) / 86400000);
  }
};
