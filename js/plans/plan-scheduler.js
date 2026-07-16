window.PlanScheduler = {
  generateSchedule(plan, readingLogEntries) {
    const progress = plan.progress || {};
    const readingUnits = progress.reading_units || [];
    const completions = progress.completions || {};
    const generator = plan.generator || {};
    const startDate = plan.start_date || this._today();
    const readingDays = generator.reading_days || [0, 1, 2, 3, 4, 5, 6];
    const target = generator.target || { type: 'none' };
    const existingSchedule = progress.schedule || [];

    const completedIndices = new Set(Object.keys(completions).map(Number));
    const uncompletedUnits = readingUnits.filter(u => !completedIndices.has(u.index));

    if (uncompletedUnits.length === 0) return existingSchedule;

    let scheduleStart = this._today();
    if (existingSchedule.length > 0) {
      const lastCompleted = existingSchedule.filter(a => a.status === 'completed');
      if (lastCompleted.length > 0) {
        const lastDate = lastCompleted[lastCompleted.length - 1].date;
        scheduleStart = this._addDays(lastDate, 1);
      }
    }

    const schedule = [];
    let unitPtr = 0;
    let currentDate = this._maxDate(scheduleStart, this._today());
    const totalRemainingWeight = uncompletedUnits.reduce((s, u) => s + (u.weight || 1), 0);
    const remainingReadingDays = this._countReadingDays(currentDate, target, readingDays);
    const targetWeightPerDay = remainingReadingDays > 0 ? totalRemainingWeight / remainingReadingDays : totalRemainingWeight;

    let safetyCounter = 0;
    while (unitPtr < uncompletedUnits.length && safetyCounter < 36500) {
      safetyCounter++;
      if (this._isReadingDay(currentDate, readingDays)) {
        const indices = [];
        let dayWeight = 0;
        while (unitPtr < uncompletedUnits.length) {
          const unit = uncompletedUnits[unitPtr];
          const unitWeight = unit.weight || 1;
          if (dayWeight + unitWeight > targetWeightPerDay * 1.5 && indices.length > 0) break;
          indices.push(unit.index);
          dayWeight += unitWeight;
          unitPtr++;
        }
        schedule.push({ date: currentDate, unit_indices: indices, status: 'pending' });
      }
      currentDate = this._addDays(currentDate, 1);
    }

    for (const existing of existingSchedule) {
      if (existing.status === 'completed') {
        const idx = schedule.findIndex(s => s.date === existing.date);
        if (idx >= 0) {
          schedule[idx].status = 'completed';
        } else {
          schedule.unshift({ date: existing.date, unit_indices: existing.unit_indices, status: 'completed' });
        }
      }
    }

    schedule.sort((a, b) => a.date.localeCompare(b.date));
    return schedule;
  },

  _countReadingDays(fromDate, target, readingDays) {
    if (target.type === 'none') return 365;
    let endDate;
    if (target.type === 'date' && target.value) {
      endDate = target.value;
    } else if (target.type === 'days' && target.value) {
      endDate = this._addDays(fromDate, target.value);
    } else {
      endDate = this._addDays(fromDate, 365);
    }
    let count = 0;
    let d = fromDate;
    while (d <= endDate) {
      if (this._isReadingDay(d, readingDays)) count++;
      d = this._addDays(d, 1);
    }
    return Math.max(count, 1);
  },

  _isReadingDay(dateStr, readingDays) {
    const d = new Date(dateStr + 'T12:00:00');
    const dow = d.getDay();
    return readingDays.includes(dow);
  },

  _addDays(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  _maxDate(a, b) {
    return a > b ? a : b;
  },

  _today() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
};
