window.HomePlanWidget = class HomePlanWidget {
  constructor(bridge) {
    this.bridge = bridge;
    this._state = bridge.state;
    this._el = null;
    this._enabled = true;
  }

  init() {
    this._createEl();
    this._bindEvents();
    this._state.onChange('currentBook currentChapter', () => this._checkVisibility());
    this._checkVisibility();
  }

  _createEl() {
    if (document.getElementById('home-plan-widget')) return;
    const contentEl = document.getElementById('content');
    if (!contentEl) return;
    const el = document.createElement('div');
    el.id = 'home-plan-widget';
    el.className = 'home-plan-widget hidden';
    el.innerHTML = `
      <div class="hpw-content" id="hpw-content">
        <div class="hpw-icon">
          <svg viewBox="-32 -32 1088 1088" width="16" height="16" fill="currentColor">
            <g transform="translate(0, 960) scale(1, -1)">
              <path d="M149.06 938.667h726.617c46.933 0 85.333-38.4 85.333-85.333v-699.734c0-46.933-38.4-85.333-85.333-85.333h-726.617c-46.933 0-85.333 38.4-85.333 85.333v699.734c0 46.933 38.4 85.333 85.333 85.333zM192.393 153.6h640v640h-640zM320.393 384h384v-64h-384zM320.393 533.333h256v-64h-256zM320.393 682.667h384v-64h-384z"/>
            </g>
          </svg>
        </div>
        <div class="hpw-info">
          <div class="hpw-plan-name" id="hpw-plan-name"></div>
          <div class="hpw-passages" id="hpw-passages"></div>
        </div>
        <button class="hpw-read-btn" id="hpw-read-btn">Read</button>
        <button class="hpw-close-btn" id="hpw-close-btn" aria-label="Dismiss">
          <svg viewBox="-32 -32 1088 1088" width="10" height="10" fill="currentColor">
            <g transform="translate(0, 960) scale(1, -1)">
              <path d="M319.033 185.458l-48.242 48.242 434.176 434.176 48.242-48.242zM704.967 185.458l-434.176 434.176 48.242 48.242 434.176-434.176z"/>
            </g>
          </svg>
        </button>
      </div>
    `;
    if (contentEl) contentEl.insertBefore(el, contentEl.firstChild);
    this._el = el;
    if (window.UISkins) {
      window.UISkins.decorate(el, 'reading-plan-card');
      window.UISkins.decorate(document.querySelector('.hpw-plan-name'), 'reading-plan-title');
      window.UISkins.decorate(document.querySelector('.hpw-passages'), 'reading-plan-passages');
      window.UISkins.decorate(document.getElementById('hpw-read-btn'), 'reading-plan-action');
      window.UISkins.decorate(document.getElementById('hpw-close-btn'), 'reading-plan-dismiss');
    }
  }

  _bindEvents() {
    document.getElementById('hpw-read-btn').addEventListener('click', () => this._startReading());
    document.getElementById('hpw-close-btn').addEventListener('click', () => this._dismiss());
    window.addEventListener('sync-module-updated', (e) => {
      if (e.detail === 'plans') this._checkVisibility();
    });
  }

  _checkVisibility() {
    if (!this._enabled) return;
    const activePlan = this._getActivePlanWithTodaysReading();
    if (activePlan) {
      this._show(activePlan.plan, activePlan.scheduleEntry, activePlan.todayUnits);
    } else {
      this._el.classList.add('hidden');
    }
  }

  _getActivePlanWithTodaysReading() {
    const plans = this._state.plans || [];
    const today = this._today();
    for (const plan of plans) {
      if (plan.status !== 'active' || plan.deleted) continue;
      const progress = plan.progress || {};
      const schedule = progress.schedule || [];
      const todayEntry = schedule.find(s => s.date === today);
      if (todayEntry && todayEntry.unit_indices.length > 0) {
        const units = progress.reading_units || [];
        const todayUnits = todayEntry.unit_indices.map(i => units[i]).filter(Boolean);
        if (todayUnits.length > 0) return { plan, scheduleEntry: todayEntry, todayUnits };
      }
    }
    return null;
  }

  _show(plan, scheduleEntry, todayUnits) {
    const nameEl = document.getElementById('hpw-plan-name');
    const passagesEl = document.getElementById('hpw-passages');
    nameEl.textContent = plan.name || 'Reading Plan';
    passagesEl.textContent = todayUnits.map(u => window.PassageRef.formatPassage(u)).join('; ');
    this._el.classList.remove('hidden');

    this._currentPlan = plan;
    this._currentScheduleEntry = scheduleEntry;
  }

  async _startReading() {
    if (!this._currentPlan) return;
    const plan = this._state.plans.find(p => p.id === this._currentPlan.id);
    if (!plan) return;
    const progress = plan.progress || {};
    const units = progress.reading_units || [];
    const today = this._today();
    const schedule = (progress.schedule || []).find(s => s.date === today);
    if (!schedule || !schedule.unit_indices.length) return;
    const plansUI = this.bridge.get('plans-ui');
    if (plansUI) {
      await plansUI._navigateToTodaysReading(plan);
    }
  }

  _dismiss() {
    this._el.classList.add('hidden');
    this._currentPlan = null;
    this._currentScheduleEntry = null;
  }

  setEnabled(v) {
    this._enabled = v;
    if (!v) this._el.classList.add('hidden');
    else this._checkVisibility();
  }

  _today() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
};
