window.PredefinedLoader = {
  _cache: {},

  manifest: [
    { id: '1year-Traditional', name: 'Whole Bible (Traditional)', duration: '1 year', days: 365, description: 'Read through the entire Bible in one year, following the traditional canonical order.', file: '1year-Traditional.csv' },
    { id: '1year-Chronological', name: 'Chronological', duration: '1 year', days: 365, description: 'Bible in the approximate order events occurred.', file: '1year-Chronological.csv' },
    { id: '1year-Alternate', name: 'Alternate OT/NT', duration: '1 year', days: 365, description: 'Alternates between Old and New Testament books each day.', file: '1year-Alternate.csv' },
    { id: '1year-Traditional-OT-NT', name: 'OT + NT Together', duration: '1 year', days: 365, description: 'Read from the Old and New Testaments each day.', file: '1year-Traditional-OT-NT.csv' },
    { id: '1year-MCheyne', name: 'M\'Cheyne', duration: '1 year', days: 365, description: 'Robert Murray M\'Cheyne\'s classic plan — 4 passages per day from different parts of Scripture.', file: '1year-M\'Cheyne-chapters.csv' }
  ],

  getPlanMeta(id) {
    return this.manifest.find(p => p.id === id) || null;
  },

  async loadPlan(id) {
    if (this._cache[id]) return this._cache[id];
    const meta = this.getPlanMeta(id);
    if (!meta) throw new Error('Unknown plan: ' + id);
    const resp = await fetch('/assets/plans/' + meta.file);
    if (!resp.ok) throw new Error('Failed to load plan: ' + meta.file);
    const csv = await resp.text();
    const plan = this._parseCSV(csv, id);
    this._cache[id] = plan;
    return plan;
  },

  _parseCSV(csv, id) {
    const lines = csv.split(/\r?\n/).filter(Boolean);
    const entries = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const match = line.match(/^"([^"]+)","([^"]+)"$/);
      if (!match) continue;
      const date = match[1];
      const passageText = match[2];
      const passages = window.PassageRef.parsePassage(passageText);
      entries.push({ date, passages: passages || [] });
    }
    return { id, entries };
  },

  async loadChronologicalOrder() {
    try {
      const chron = await this.loadPlan('1year-Chronological');
      const orderMap = {};
      const seen = new Set();
      for (const entry of chron.entries) {
        for (const p of entry.passages) {
          const key = p.book_id;
          if (!seen.has(key)) {
            seen.add(key);
            orderMap[key] = { book_id: p.book_id, known_chapter: p.chapter };
          }
        }
      }
      return orderMap;
    } catch (e) {
      console.warn('[PredefinedLoader] Could not load chronological order:', e);
      return null;
    }
  }
};
