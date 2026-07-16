window.ReadingGuideBar = class ReadingGuideBar {
  constructor(bridge) {
    this.bridge = bridge;
    this._state = bridge.state;
    this._activePlan = null;
    this._todayUnits = [];
    this._currentUnitIndex = -1;
    this._visible = false;
    this._el = null;
  }

  init() {
    this._createEl();
    this._bindEvents();
  }

  _createEl() {
    if (document.getElementById('reading-guide-bar')) return;
    const el = document.createElement('div');
    el.id = 'reading-guide-bar';
    el.className = 'reading-guide-bar hidden';
    el.innerHTML = `
      <div class="rgb-content" id="rgb-content">
        <div class="rgb-nav" id="rgb-nav">
          <button class="rgb-arrow" id="rgb-prev" aria-label="Previous passage">
            <svg viewBox="-32 -32 1088 1088" width="14" height="14" fill="currentColor">
              <g transform="translate(0, 960) scale(1, -1)">
                <path d="M780.8 862.72l-48.213 48.213-434.133-434.133 434.133-434.133 48.213 48.213-385.92 385.92z"/>
              </g>
            </svg>
          </button>
          <div class="rgb-steps" id="rgb-steps"></div>
          <button class="rgb-arrow" id="rgb-next" aria-label="Next passage">
            <svg viewBox="-32 -32 1088 1088" width="14" height="14" fill="currentColor">
              <g transform="translate(0, 960) scale(1, -1)">
                <path d="M307.2 862.72l48.213 48.213 434.133-434.133-434.133-434.133-48.213 48.213 385.92 385.92z"/>
              </g>
            </svg>
          </button>
        </div>
        <button class="rgb-complete" id="rgb-complete">Mark Complete</button>
        <button class="rgb-close" id="rgb-close" aria-label="Close guide">
          <svg viewBox="-32 -32 1088 1088" width="12" height="12" fill="currentColor">
            <g transform="translate(0, 960) scale(1, -1)">
              <path d="M319.033 185.458l-48.242 48.242 434.176 434.176 48.242-48.242zM704.967 185.458l-434.176 434.176 48.242 48.242 434.176-434.176z"/>
            </g>
          </svg>
        </button>
      </div>
    `;
    document.body.appendChild(el);
    this._el = el;
  }

  _bindEvents() {
    document.getElementById('rgb-prev').addEventListener('click', () => this._navigateStep(-1));
    document.getElementById('rgb-next').addEventListener('click', () => this._navigateStep(1));
    document.getElementById('rgb-close').addEventListener('click', () => this.hide());
    document.getElementById('rgb-complete').addEventListener('click', () => this._completeToday());

    this.bridge.on('nav:chapter-loaded', () => this._checkChapter());
  }

  showForPlan(plan, scheduleEntry) {
    this._activePlan = plan;
    if (!scheduleEntry) return;
    const progress = plan.progress || {};
    const units = progress.reading_units || [];
    this._todayUnits = scheduleEntry.unit_indices.map(i => units[i]).filter(Boolean);
    this._currentUnitIndex = 0;
    this._render();
    this._el.classList.remove('hidden');
    this._visible = true;
  }

  hide() {
    this._activePlan = null;
    this._todayUnits = [];
    this._currentUnitIndex = -1;
    this._visible = false;
    if (this._el) this._el.classList.add('hidden');
  }

  _render() {
    const stepsEl = document.getElementById('rgb-steps');
    const completeBtn = document.getElementById('rgb-complete');
    const prevBtn = document.getElementById('rgb-prev');
    const nextBtn = document.getElementById('rgb-next');

    let html = '';
    for (let i = 0; i < this._todayUnits.length; i++) {
      const unit = this._todayUnits[i];
      const isCurrent = i === this._currentUnitIndex;
      const label = window.PassageRef.formatPassage(unit);
      html += `<button class="rgb-step ${isCurrent ? 'rgb-step-current' : ''}" data-step="${i}">${window.HTMLEscape(label || '')}</button>`;
    }
    stepsEl.innerHTML = html;

    stepsEl.querySelectorAll('.rgb-step').forEach(btn => {
      btn.addEventListener('click', () => {
        const step = parseInt(btn.dataset.step, 10);
        this._goToStep(step);
      });
    });

    const isLast = this._currentUnitIndex >= this._todayUnits.length - 1;
    completeBtn.classList.toggle('rgb-complete-visible', isLast);
    prevBtn.disabled = this._currentUnitIndex <= 0;
    nextBtn.disabled = this._currentUnitIndex >= this._todayUnits.length - 1;
  }

  _navigateStep(delta) {
    const next = this._currentUnitIndex + delta;
    if (next < 0 || next >= this._todayUnits.length) return;
    this._goToStep(next);
  }

  async _goToStep(index) {
    if (index < 0 || index >= this._todayUnits.length) return;
    this._currentUnitIndex = index;
    this._render();

    const unit = this._todayUnits[index];
    if (unit) {
      const nav = this.bridge.get('navigation');
      if (nav) {
        await nav.loadChapter(unit.book_id, unit.chapter);
      }
    }
  }

  async _checkChapter() {
    if (!this._visible) return;
    const currentBook = this._state.get('currentBook');
    const currentChapter = this._state.get('currentChapter');
    const idx = this._todayUnits.findIndex(u => u.book_id === currentBook && u.chapter <= currentChapter && (u.chapter_end || u.chapter) >= currentChapter);
    if (idx >= 0 && idx !== this._currentUnitIndex) {
      this._currentUnitIndex = idx;
      this._render();
    }
  }

  async _completeToday() {
    if (!this._activePlan) return;
    const planId = this._activePlan.id;
    const today = this._today();
    const progress = this._activePlan.progress || {};
    const schedule = progress.schedule || [];
    const todaySchedule = schedule.find(s => s.date === today);
    const readingUnits = progress.reading_units || [];

    if (todaySchedule) {
      const completions = progress.completions || {};
      for (const idx of todaySchedule.unit_indices) {
        completions[idx] = { date: today, completed_at: Date.now() };
      }
      const completedWeight = Object.keys(completions).reduce((sum, key) => {
        const idx = parseInt(key, 10);
        const unit = readingUnits[idx];
        return sum + (unit ? (unit.weight || 1) : 0);
      }, 0);

      this._state.updatePlan(planId, {
        progress: {
          ...progress,
          completions,
          schedule: schedule.map(s => s.date === today ? { ...s, status: 'completed' } : s),
          metrics: {
            ...progress.metrics,
            completed_weight: completedWeight
          }
        }
      });

      const rl = this.bridge.get('reading-log');
      if (rl) {
        const segments = todaySchedule.unit_indices.map(idx => {
          const u = readingUnits[idx];
          return u ? { book_id: u.book_id, chapter: u.chapter, chapters: [u.chapter, u.chapter_end || u.chapter] } : null;
        }).filter(Boolean);
        const verseCount = todaySchedule.unit_indices.reduce((sum, idx) => {
          const u = readingUnits[idx];
          return sum + (u ? (u.verse_end || 31) - (u.verse_start || 1) + 1 : 0);
        }, 0);
        await rl.recordReading({ plan_id: planId, date: today, segments, verse_count: Math.max(verseCount, 1) });
      }
    }

    this.hide();
  }

  _today() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
};
