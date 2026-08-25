const _CHAPTER_COUNTS = { 1: 50, 2: 40, 3: 27, 4: 36, 5: 34, 6: 24, 7: 21, 8: 4, 9: 31, 10: 24,
  11: 22, 12: 25, 13: 29, 14: 36, 15: 10, 16: 13, 17: 10, 18: 42, 19: 150, 20: 31,
  21: 12, 22: 8, 23: 66, 24: 52, 25: 5, 26: 48, 27: 12, 28: 14, 29: 3, 30: 9,
  31: 1, 32: 4, 33: 7, 34: 3, 35: 3, 36: 3, 37: 2, 38: 14, 39: 4,
  40: 28, 41: 16, 42: 24, 43: 21, 44: 28, 45: 16, 46: 16, 47: 13, 48: 6, 49: 6,
  50: 4, 51: 4, 52: 5, 53: 3, 54: 6, 55: 4, 56: 3, 57: 1, 58: 13, 59: 5,
  60: 5, 61: 3, 62: 5, 63: 1, 64: 1, 65: 1, 66: 22 };

window.PlansUI = class PlansUI {
  constructor(bridge) {
    this.bridge = bridge;
    this._state = bridge.state;
    this._open = false;
    this._view = 'list';
    this._editingPlanId = null;
    this._compressed = false;
    this._cleanupFocus = null;
    this._readingPlan = null;
    this._todayUnits = [];
    this._readingStep = 0;
    this._activeScheduleDate = null;
    this._wizard = null;
    this._wizardStep = 0;
    this._wizardType = 'generator';
    this._readingDaysAutoAdjusted = false;
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const today = `${y}-${m}-${day}`;
    const nextYear = `${y + 1}-${m}-${day}`;
    this._wizardDefaults = {
      content: 'whole-bible',
      exclude: [],
      order: 'canonical',
      pace_type: 'days',
      pace_value: 365,
      target_date: nextYear,
      reading_days: [0,1,2,3,4,5,6],
      recalculation: 'keep_deadline',
      max_minutes: 20,
      split_chapters: false,
      longer_weekends: false,
      reading_ahead: 'reduce_workload',
      psalm: false,
      proverb: false
    };
  }

  init() {
    this._createPanel();
    this._bindEvents();
    this._setupAutoCompress();
    window.addEventListener('sync-module-updated', (e) => {
      if (e.detail === 'plans') this._onSyncPlans();
    });
  }

  _alertDialog(options) {
    if (window.dialogService) return window.dialogService.alert(options);
    window.alert(options.message || '');
    return Promise.resolve(true);
  }

  _setupAutoCompress() {
    const content = document.getElementById('content');
    if (!content) return;
    const handler = () => {
      if (this._open && !this._compressed) this.compress();
    };
    content.addEventListener('pointerdown', handler);
    content.addEventListener('focusin', handler);
    content.setAttribute('tabindex', '-1');
  }

  _createPanel() {
    if (document.getElementById('plans-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'plans-panel';
    panel.className = 'plans-panel hidden';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Plans');
    panel.innerHTML = `
      <div class="plans-header" id="plans-header">
        <div class="ph-normal" id="ph-normal">
          <button class="plans-back-btn hidden" id="plans-back-btn" aria-label="Back">
            <svg viewBox="-32 -32 1088 1088" width="18" height="18" fill="currentColor">
              <g transform="translate(0, 960) scale(1, -1)">
                <path d="M780.8 862.72l-48.213 48.213-434.133-434.133 434.133-434.133 48.213 48.213-385.92 385.92z"/>
              </g>
            </svg>
          </button>
          <h2 class="plans-title" id="plans-title">Plans</h2>
          <button class="plans-add-btn" id="plans-add-btn" aria-label="Create plan">
            <svg viewBox="-32 -32 1088 1088" width="18" height="18" fill="currentColor">
              <g transform="translate(0, 960) scale(1, -1)">
                <path d="M938.667 512c0-29.44-23.893-53.333-53.333-53.333h-320v-320c0-29.44-23.893-53.333-53.333-53.333s-53.333 23.893-53.333 53.333v320h-320c-29.44 0-53.333 23.893-53.333 53.333s23.893 53.333 53.333 53.333h320v320c0 29.44 23.893 53.333 53.333 53.333s53.333-23.893 53.333-53.333v-320h320c29.44 0 53.333-23.893 53.333-53.333z"/>
              </g>
            </svg>
          </button>
          <button class="plans-close-btn" id="plans-close-btn" aria-label="Close">
            <svg viewBox="-32 -32 1088 1088" width="14" height="14" fill="currentColor">
              <g transform="translate(0, 960) scale(1, -1)">
                <path d="M512 938.667c282.674-0.127 511.777-229.308 511.777-512 0-141.273-57.217-269.182-149.741-361.818l0.005 0.005c-93.237-96.47-223.79-156.365-368.331-156.365-282.77 0-512 229.23-512 512 0 144.485 59.848 274.992 156.107 368.082l0.143 0.137c92.141 92.633 219.696 149.961 360.641 149.961 0.492 0 0.984-0.001 1.476-0.002h-0.076zM512-17.066c245.067 0 443.733 198.666 443.733 443.733s-198.666 443.733-443.733 443.733c-245.067 0-443.733-198.666-443.733-443.733v0c0.285-244.952 198.78-443.448 443.705-443.733h0.028zM319.033 185.458l-48.242 48.242 434.176 434.176 48.242-48.242zM704.967 185.458l-434.176 434.176 48.242 48.242 434.176-434.176z"/>
              </g>
            </svg>
          </button>
        </div>
        <div class="ph-wizard hidden" id="ph-wizard">
          <button class="plans-back-btn" id="pw-header-back" aria-label="Back">
            <svg viewBox="-32 -32 1088 1088" width="18" height="18" fill="currentColor">
              <g transform="translate(0, 960) scale(1, -1)">
                <path d="M780.8 862.72l-48.213 48.213-434.133-434.133 434.133-434.133 48.213 48.213-385.92 385.92z"/>
              </g>
            </svg>
          </button>
          <div class="pw-header-steps" id="pw-header-steps">
            <div class="pw-steps" id="pw-header-dots"></div>
            <div class="pw-step-label" id="pw-header-label"></div>
          </div>
          <button class="plans-close-btn" id="pw-header-close" aria-label="Close">
            <svg viewBox="-32 -32 1088 1088" width="14" height="14" fill="currentColor">
              <g transform="translate(0, 960) scale(1, -1)">
                <path d="M512 938.667c282.674-0.127 511.777-229.308 511.777-512 0-141.273-57.217-269.182-149.741-361.818l0.005 0.005c-93.237-96.47-223.79-156.365-368.331-156.365-282.77 0-512 229.23-512 512 0 144.485 59.848 274.992 156.107 368.082l0.143 0.137c92.141 92.633 219.696 149.961 360.641 149.961 0.492 0 0.984-0.001 1.476-0.002h-0.076zM512-17.066c245.067 0 443.733 198.666 443.733 443.733s-198.666 443.733-443.733 443.733c-245.067 0-443.733-198.666-443.733-443.733v0c0.285-244.952 198.78-443.448 443.705-443.733h0.028zM319.033 185.458l-48.242 48.242 434.176 434.176 48.242-48.242zM704.967 185.458l-434.176 434.176 48.242 48.242 434.176-434.176z"/>
              </g>
            </svg>
          </button>
        </div>
        <div class="ph-reading hidden" id="ph-reading">
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
          <button class="rgb-complete" id="rgb-complete">Done</button>
          <button class="plans-close-btn" id="rgb-close" aria-label="Close guide">
            <svg viewBox="-32 -32 1088 1088" width="12" height="12" fill="currentColor">
              <g transform="translate(0, 960) scale(1, -1)">
                <path d="M319.033 185.458l-48.242 48.242 434.176 434.176 48.242-48.242zM704.967 185.458l-434.176 434.176 48.242 48.242 434.176-434.176z"/>
              </g>
            </svg>
          </button>
        </div>
      </div>
      <div class="plans-body" id="plans-body">
        <div class="plans-list-view" id="plans-list-view">
          <div class="plans-list" id="plans-list"></div>
        </div>
        <div class="plans-detail-view hidden" id="plans-detail-view"></div>
        <div class="plans-wizard-view hidden" id="plans-wizard-view"></div>
      </div>
    `;
    document.body.appendChild(panel);
    if (window.UISkins) window.UISkins.decorate(panel, 'plans-panel');
  }

  _bindEvents() {
    document.getElementById('plans-close-btn').addEventListener('click', () => this.close());
    document.getElementById('rgb-close').addEventListener('click', () => this.close());
    document.getElementById('pw-header-close').addEventListener('click', () => this.close());
    document.getElementById('plans-back-btn').addEventListener('click', () => this._showView('list'));
    document.getElementById('pw-header-back').addEventListener('click', () => {
      if (this._wizardStep > 0) { this._wizardStep--; this._renderWizardStep(); }
      else this._showView('list');
    });
    document.getElementById('plans-add-btn').addEventListener('click', () => this._showWizard());
    document.getElementById('rgb-prev').addEventListener('click', () => this._readingStepNav(-1));
    document.getElementById('rgb-next').addEventListener('click', () => this._readingStepNav(1));
    document.getElementById('rgb-complete').addEventListener('click', () => this._readingComplete());
    this.bridge.on('nav:chapter-loaded', () => this._readingCheckChapter());

    const panel = document.getElementById('plans-panel');
    panel.addEventListener('click', (e) => {
      if (this._compressed && !this._readingPlan && !e.target.closest('.plans-close-btn')) {
        this.expand();
        return;
      }
      const planItem = e.target.closest('.plans-list-item');
      const readBtn = e.target.closest('.plans-item-read');
      const completeBtn = e.target.closest('.plans-item-complete');
      const swipeDelete = e.target.closest('.plans-list-item-delete');

      if (swipeDelete) {
        e.stopPropagation();
        const planId = swipeDelete.dataset.id;
        const plan = this._state.plans.find(p => p.id === planId);
        if (plan) this._deletePlanWithUndo(plan);
        return;
      }
      if (readBtn) {
        e.stopPropagation();
        this._closeOpenSwipe();
        const planId = readBtn.closest('.plans-list-item').dataset.planId;
        const plan = this._state.plans.find(p => p.id === planId);
        if (plan) this._navigateToTodaysReading(plan);
        return;
      }
      if (completeBtn) {
        e.stopPropagation();
        this._closeOpenSwipe();
        const planId = completeBtn.closest('.plans-list-item').dataset.planId;
        const plan = this._state.plans.find(p => p.id === planId);
        if (plan) this._markTodayComplete(plan);
        return;
      }
      if (planItem) {
        this._closeOpenSwipe();
        const planId = planItem.dataset.planId;
        if (planId) this._openPlanDetail(planId);
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.plans-list-item-row')) {
        this._closeOpenSwipe();
      }
    });
  }

  async _showView(view) {
    this._view = view;
    const listView = document.getElementById('plans-list-view');
    const detailView = document.getElementById('plans-detail-view');
    const wizardView = document.getElementById('plans-wizard-view');
    const backBtn = document.getElementById('plans-back-btn');
    const addBtn = document.getElementById('plans-add-btn');
    const title = document.getElementById('plans-title');
    const phNormal = document.getElementById('ph-normal');
    const phWizard = document.getElementById('ph-wizard');

    listView.classList.toggle('hidden', view !== 'list');
    detailView.classList.toggle('hidden', view !== 'detail');
    wizardView.classList.toggle('hidden', view !== 'wizard');
    backBtn.classList.toggle('hidden', view === 'list');
    addBtn.classList.toggle('hidden', view !== 'list');

    phNormal.classList.toggle('hidden', view === 'wizard');
    phWizard.classList.toggle('hidden', view !== 'wizard');

    if (view === 'list') {
      title.textContent = 'Plans';
      await this._renderList();
    }
  }

  async _renderList() {
    const container = document.getElementById('plans-list');
    await this._state.ready();
    const plans = (this._state.plans || []).filter(p => !p.deleted);
    const rl = this.bridge.get('reading-log');
    const today = this._today();

    if (plans.length === 0) {
      container.innerHTML = `
        <div class="plans-empty">
          <p>No reading plans yet.</p>
          <button class="plans-empty-create-btn" id="plans-empty-create">Create a Plan</button>
        </div>
      `;
      document.getElementById('plans-empty-create')?.addEventListener('click', () => this._showWizard());
      return;
    }

    const streak = rl ? rl.computeStreak() : null;
    let html = '';
    if (streak && streak.current > 0) {
      html += `<div class="plans-streak-bar">${streak.current}-day reading streak${streak.best > streak.current ? ` (best: ${streak.best})` : ''}</div>`;
    }

    const statusOrder = { active: 0, paused: 1, completed: 2 };
    const sorted = [...plans].sort((a, b) => (statusOrder[a.status] || 9) - (statusOrder[b.status] || 9));

    let lastGroup = null;
    for (const plan of sorted) {
      if (plan.deleted) continue;
      if (plan.status !== lastGroup) {
        lastGroup = plan.status;
        if (lastGroup === 'paused') html += `<div class="plans-section-label">Paused</div>`;
        else if (lastGroup === 'completed') html += `<div class="plans-section-label">Completed</div>`;
      }
      html += this._renderPlanItem(plan, today);
    }
    container.innerHTML = html;
    this._initSwipeRows(container);
  }

  _initSwipeRows(container) {
    container.querySelectorAll('.plans-list-item-row').forEach(row => {
      if (row.dataset.swipeInitialized) return;
      row.dataset.swipeInitialized = '1';
      this._initSwipe(row);
    });
  }

  _initSwipe(row) {
    const swipeEl = row.querySelector('.plans-list-item-swipeable');
    const deleteBtn = row.querySelector('.plans-list-item-delete');
    if (!swipeEl || !deleteBtn) return;
    let startX = 0;
    let currentX = 0;
    let isSwiping = false;
    const maxSwipe = 80;

    const reset = () => {
      isSwiping = false;
      if (!swipeEl.isConnected) return;
      swipeEl.style.transition = 'transform 0.2s ease';
    };

    swipeEl.addEventListener('touchstart', (e) => {
      this._closeOpenSwipe();
      startX = e.touches[0].clientX;
      currentX = startX;
      isSwiping = false;
      swipeEl.style.transition = 'none';
    }, { passive: true });

    swipeEl.addEventListener('touchmove', (e) => {
      const deltaX = startX - e.touches[0].clientX;
      if (Math.abs(deltaX) > 10) isSwiping = true;
      currentX = e.touches[0].clientX;
      const tx = Math.min(Math.max(deltaX, 0), maxSwipe);
      swipeEl.style.transform = `translateX(-${tx}px)`;
    }, { passive: true });

    swipeEl.addEventListener('touchend', () => {
      const deltaX = startX - currentX;
      if (isSwiping && deltaX > maxSwipe * 0.4) {
        swipeEl.style.transition = 'transform 0.2s ease';
        swipeEl.style.transform = `translateX(-${maxSwipe}px)`;
        row.dataset.swiped = 'open';
        this._openSwipeRow = row;
      } else {
        swipeEl.style.transform = 'translateX(0)';
        delete row.dataset.swiped;
        if (this._openSwipeRow === row) this._openSwipeRow = null;
      }
      setTimeout(reset, 250);
    });

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const planId = deleteBtn.dataset.id;
      const plan = this._state.plans.find(p => p.id === planId);
      if (plan) this._deletePlanWithUndo(plan);
    });
  }

  _closeOpenSwipe() {
    if (this._openSwipeRow) {
      const s = this._openSwipeRow.querySelector('.plans-list-item-swipeable');
      if (s) {
        s.style.transition = 'transform 0.2s ease';
        s.style.transform = 'translateX(0)';
      }
      delete this._openSwipeRow.dataset.swiped;
      this._openSwipeRow = null;
    }
  }

  _getEarliestUncompletedEntry(plan) {
    const progress = plan.progress || {};
    const schedule = progress.schedule || [];
    const completedSet = new Set(Object.keys(progress.completions || {}).map(Number));
    for (const entry of schedule) {
      if (entry.status !== 'completed' && entry.unit_indices && entry.unit_indices.some(idx => !completedSet.has(idx))) {
        return entry;
      }
    }
    return null;
  }

  _renderPlanItem(plan, today) {
    const progress = plan.progress || {};
    const metrics = progress.metrics || {};
    const schedule = progress.schedule || [];
    const readingUnits = progress.reading_units || [];
    const pct = metrics.total_weight > 0 ? Math.round((metrics.completed_weight / metrics.total_weight) * 100) : 0;
    const totalDays = schedule.length;
    const completedDays = schedule.filter(s => s.status === 'completed').length;
    const completedIndices = new Set(Object.keys(progress.completions || {}).map(Number));
    const hasMoreReadings = readingUnits.some(u => !completedIndices.has(u.index));

    const activeEntry = this._getEarliestUncompletedEntry(plan);
    const activePassages = activeEntry ? activeEntry.unit_indices.map(i => readingUnits[i]).filter(Boolean) : [];
    const isBehind = activeEntry && activeEntry.date < today;
    const isToday = activeEntry && activeEntry.date === today;
    const isFuture = activeEntry && activeEntry.date > today;
    const activeText = activePassages.length > 0 ? this._formatPassageList(activePassages) : null;

    const name = window.HTMLEscape(plan.name || 'Unnamed Plan');
    const escapedId = window.HTMLEscape(plan.id);
    const dayCount = totalDays > 0 ? `Day ${completedDays + 1} of ${totalDays}` : '';
    const statusBadge = plan.status === 'paused' ? `<span class="plans-item-badge plans-badge-paused">Paused</span>` : '';
    const isPausedOrCompleted = plan.status !== 'active';

    let displayTag = '';
    if (!isPausedOrCompleted && activeEntry && activePassages.length > 0) {
      if (isBehind) {
        displayTag = `<span class="plans-item-catchup-tag" style="font-size:0.75rem;opacity:0.85;margin-right:6px">Catch-up:</span>`;
      }
    }

    return `
      <div class="plans-list-item-row" data-id="${escapedId}">
        <div class="plans-list-item-swipeable">
          <div class="plans-list-item" data-plan-id="${escapedId}">
            <div class="plans-item-row1">
              <span class="plans-item-name">${name} ${statusBadge}</span>
            </div>
            ${activeText && !isPausedOrCompleted ? `<div class="plans-item-today">${displayTag}${window.HTMLEscape(activeText)}</div>` : ''}
            <div class="plans-item-row2">
              <div class="plans-item-progress">
                <div class="plans-progress-bar">
                  <div class="plans-progress-fill" style="width:${pct}%"></div>
                </div>
                <span class="plans-progress-text">${pct}%</span>
              </div>
              ${dayCount ? `<span class="plans-item-days">${dayCount}</span>` : ''}
            </div>
            ${!isPausedOrCompleted && activeEntry && (isBehind || isToday) && activePassages.length > 0 ? `
            <div class="plans-item-actions-row">
              <button class="plans-item-read">${isBehind ? 'Catch Up' : 'Read Today'}</button>
              <button class="plans-item-complete">Mark Done</button>
            </div>` : !isPausedOrCompleted && activeEntry && isFuture && activePassages.length > 0 ? `
            <div class="plans-item-actions-row">
              <button class="plans-item-read">Read Next Day</button>
            </div>` : !isPausedOrCompleted && hasMoreReadings ? `
            <div class="plans-item-actions-row">
              <button class="plans-item-read">Read Next Day</button>
            </div>` : ''}
          </div>
        </div>
        <button class="plans-list-item-delete" data-id="${escapedId}">Delete</button>
      </div>
    `;
  }

  _renderPreviewBar() {
    const w = this._wizard;
    if (!w || this._wizardStep === 0) return '';
    const contentName = window.BookGroups._displayName(w.content) || '';
    const orderLabels = { canonical: 'Canonical', chronological: 'Chronological', mixed: 'Mixed' };
    const paceLabels = { days: w.pace_value ? `${w.pace_value}d` : '', date: w.target_date || '', none: 'No deadline' };
    const dayCount = (w.reading_days || []).length;
    const scheduleLabel = dayCount === 7 ? 'Every day' : dayCount === 5 ? 'Weekdays' : dayCount === 2 ? 'Weekends' : `${dayCount} days/wk`;
    const parts = [];
    if (w.content && this._wizardStep > 0) parts.push(window.HTMLEscape(contentName));
    if (w.order && this._wizardStep > 1) parts.push(orderLabels[w.order] || '');
    if (w.pace_type && this._wizardStep > 2) parts.push(paceLabels[w.pace_type] || '');
    if (dayCount && this._wizardStep > 3) parts.push(scheduleLabel);
    return parts.length ? parts.join(' · ') : '';
  }

  async _openPlanDetail(planId) {
    this._editingPlanId = planId;
    const plan = this._state.plans.find(p => p.id === planId);
    if (!plan) return;
    document.getElementById('plans-title').textContent = plan.name || 'Plan';

    const today = this._today();
    const progress = plan.progress || {};
    const metrics = progress.metrics || {};
    const schedule = progress.schedule || [];
    const readingUnits = progress.reading_units || [];
    const pct = metrics.total_weight > 0 ? Math.round((metrics.completed_weight / metrics.total_weight) * 100) : 0;
    const totalDays = schedule.length;
    const completedDays = schedule.filter(s => s.status === 'completed').length;
    const completedIndices = new Set(Object.keys(progress.completions || {}).map(Number));
    const hasMoreReadings = readingUnits.some(u => !completedIndices.has(u.index));

    const activeEntry = this._getEarliestUncompletedEntry(plan);
    const activePassages = activeEntry ? activeEntry.unit_indices.map(i => readingUnits[i]).filter(Boolean) : [];
    const isBehind = activeEntry && activeEntry.date < today;
    const isToday = activeEntry && activeEntry.date === today;
    const isFuture = activeEntry && activeEntry.date > today;
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    const nextEntry = schedule.find(a => {
      if (!activeEntry) return a.date > today;
      return a.date > activeEntry.date && a.unit_indices.some(idx => !completedIndices.has(idx));
    });
    const nextDateLabel = nextEntry ? (() => { const d = new Date(nextEntry.date + 'T12:00:00'); return dayNames[d.getDay()] + ' ' + d.getDate(); })() : '';

    const firstScheduleDate = activeEntry && activeEntry.date < today ? activeEntry.date : today;
    const upcomingSchedule = schedule.filter(s => s.date >= firstScheduleDate).slice(0, 14);

    let calHtml = '';
    if (upcomingSchedule.length > 0) {
      calHtml = `<div class="plans-calendar"><div class="plans-cal-header">`;
      for (const a of upcomingSchedule.slice(0, 7)) {
        const d = new Date(a.date + 'T12:00:00');
        const isTodayCell = a.date === today;
        const isDone = a.status === 'completed';
        const isMissed = a.date < today && !isDone;
        const mid = isTodayCell ? 'plans-cal-today' : isDone ? 'plans-cal-done' : isMissed ? 'plans-cal-missed' : '';
        calHtml += `<div class="plans-cal-cell ${mid}">
          <span class="plans-cal-dow">${dayNames[d.getDay()]}</span>
          <span class="plans-cal-date">${String(d.getDate()).padStart(2, '0')}</span>
          <span class="plans-cal-dot ${mid}"></span>
        </div>`;
      }
      calHtml += `</div></div>`;
    }

    let readingSectionHtml = '';
    if (activeEntry && activePassages.length > 0) {
      const activeDateStr = (() => {
        const d = new Date(activeEntry.date + 'T12:00:00');
        return dayNames[d.getDay()] + ' ' + d.getDate();
      })();
      const sectionLabel = isBehind
        ? `Catch-Up Reading (Scheduled for ${activeDateStr})`
        : isToday
        ? `Today's Reading`
        : `Next reading: ${activeDateStr}`;
      const actionBtnText = isBehind ? 'Catch Up' : isToday ? 'Read Today' : 'Read Ahead';

      readingSectionHtml = `
        <div class="plans-detail-today">
          <span class="plans-today-label">${window.HTMLEscape(sectionLabel)}</span>
          <div class="plans-today-passages">${this._formatPassageList(activePassages)}</div>
          <div class="plans-today-actions">
            <button class="plans-read-btn" id="plans-start-reading">${actionBtnText}</button>
            <button class="plans-done-btn" id="plans-mark-done">Mark Complete</button>
          </div>
        </div>`;
    } else if (!hasMoreReadings) {
      readingSectionHtml = `
        <div class="plans-detail-today">
          <span class="plans-today-label">All readings completed!</span>
        </div>`;
    } else if (plan.status === 'active') {
      readingSectionHtml = `
        <div class="plans-detail-today">
          <span class="plans-today-label">No reading scheduled for today.</span>
        </div>`;
    }

    const detailView = document.getElementById('plans-detail-view');
    detailView.innerHTML = `
      <div class="plans-detail">
        <div class="plans-detail-header">
          <h3>${window.HTMLEscape(plan.name || 'Unnamed Plan')}</h3>
          <span class="plans-status-badge plans-status-${plan.status}">${plan.status || 'unknown'}</span>
        </div>
        <div class="plans-detail-progress">
          <div class="plans-progress-bar plans-progress-bar-lg">
            <div class="plans-progress-fill" style="width:${pct}%"></div>
          </div>
          <span class="plans-progress-text">${pct}% complete</span>
          ${totalDays > 0 ? `<span class="plans-est-completion">Day ${completedDays + 1} of ${totalDays}</span>` : ''}
          ${metrics.estimated_completion ? `<span class="plans-est-completion">Est. completion: ${metrics.estimated_completion}</span>` : ''}
        </div>
        ${readingSectionHtml}
        ${calHtml ? `<div class="plans-detail-upcoming">${calHtml}</div>` : ''}
        ${upcomingSchedule.length > 0 ? `
        <div class="plans-detail-list">
          ${upcomingSchedule.map(a => {
            const d = new Date(a.date + 'T12:00:00');
            const isTodayItem = a.date === today;
            const isDone = a.status === 'completed';
            const isMissedItem = a.date < today && !isDone;
            return `<div class="plans-list-item-plain ${isTodayItem ? 'plans-plain-today' : ''} ${isDone ? 'plans-plain-done' : ''} ${isMissedItem ? 'plans-plain-missed' : ''}">
              <span class="plans-plain-date">${isTodayItem ? 'Today' : `${dayNames[d.getDay()]} ${d.getDate()}`}${isMissedItem ? ' (Catch up)' : ''}</span>
              <span class="plans-plain-passages">${a.unit_indices.map(i => readingUnits[i] ? window.PassageRef.formatPassage(readingUnits[i]) : '?').join(', ')}</span>
              <span class="plans-plain-status">${isDone ? '✓' : ''}</span>
            </div>`;
          }).join('')}
        </div>` : ''}
      </div>
      <div class="plans-detail-footer">
        ${plan.status === 'paused' ? '<button class="plans-footer-btn plans-footer-secondary" id="plans-resume-btn">▶ Resume</button>' : plan.status === 'active' ? '<button class="plans-footer-btn plans-footer-secondary" id="plans-pause-btn">⏸ Pause</button>' : ''}
        <button class="plans-footer-btn plans-footer-secondary" id="plans-edit-btn">✎ Edit</button>
        <button class="plans-footer-btn plans-footer-danger" id="plans-delete-btn">✕ Delete</button>
      </div>
    `;

    document.getElementById('plans-start-reading')?.addEventListener('click', () => this._navigateToTodaysReading(plan));
    document.getElementById('plans-next-reading')?.addEventListener('click', () => this._navigateToTodaysReading(plan));
    document.getElementById('plans-mark-done')?.addEventListener('click', async () => {
      await this._markTodayComplete(plan);
      this._openPlanDetail(planId);
    });
    document.getElementById('plans-pause-btn')?.addEventListener('click', async () => {
      this._state.updatePlan(planId, { status: 'paused', paused_at: Date.now() });
      await this._renderList();
      this._openPlanDetail(planId);
    });
    document.getElementById('plans-resume-btn')?.addEventListener('click', async () => {
      this._state.updatePlan(planId, { status: 'active', paused_at: null });
      await this._renderList();
      this._openPlanDetail(planId);
    });
    document.getElementById('plans-edit-btn')?.addEventListener('click', () => this._editPlan(planId));
    document.getElementById('plans-delete-btn')?.addEventListener('click', () => {
      this._deletePlanWithUndo(plan);
      this._showView('list');
    });

    this._showView('detail');
  }

  _formatPassageList(passages) {
    if (!passages || !passages.length) return '';
    return passages.map(p => window.PassageRef.formatPassage(p)).join('; ');
  }

  async _navigateToTodaysReading(plan) {
    if (!this._open) {
      this._open = true;
      this._compressed = false;
      this._stopReadingMode();
      document.getElementById('plans-panel').classList.remove('hidden', 'compressed');
    }
    const progress = plan.progress || {};
    const readingUnits = progress.reading_units || [];
    const completedSet = new Set(Object.keys(progress.completions || {}).map(Number));
    const today = this._today();
    const activeEntry = this._getEarliestUncompletedEntry(plan);
    let targetUnit = null;
    let selectedEntry = null;

    if (activeEntry && activeEntry.unit_indices && activeEntry.unit_indices.length > 0) {
      const firstUncompleted = activeEntry.unit_indices.find(idx => !completedSet.has(idx));
      if (firstUncompleted !== undefined) {
        targetUnit = readingUnits[firstUncompleted];
        selectedEntry = activeEntry;
      }
    }
    if (!targetUnit) return;

    if (selectedEntry) {
      this._todayUnits = selectedEntry.unit_indices.map(i => readingUnits[i]).filter(Boolean);
    } else {
      this._todayUnits = readingUnits.filter(u => !completedSet.has(u.index));
    }
    this._readingStep = this._todayUnits.findIndex(u => u.book_id === targetUnit.book_id && u.chapter === targetUnit.chapter);
    if (this._readingStep < 0) this._readingStep = 0;
    this._readingPlan = plan;
    this._activeScheduleDate = selectedEntry ? selectedEntry.date : today;
    this._renderReadingSteps();
    document.getElementById('ph-normal').classList.add('hidden');
    document.getElementById('ph-reading').classList.remove('hidden');
    this.compress();

    const nav = this.bridge.get('navigation');
    if (nav) {
      await nav.navigateTo(targetUnit.book_id, targetUnit.chapter, targetUnit.verse_start || targetUnit.verse || 1);
    }
  }

  _stopReadingMode() {
    this._readingPlan = null;
    this._todayUnits = [];
    this._readingStep = 0;
    this._activeScheduleDate = null;
    document.getElementById('ph-normal').classList.remove('hidden');
    document.getElementById('ph-reading').classList.add('hidden');
  }

  _onSyncPlans() {
    if (this._readingPlan) {
      const freshPlan = this._state.plans.find(p => p.id === this._readingPlan.id);
      if (!freshPlan) {
        this._stopReadingMode();
        return;
      }
      this._readingPlan = freshPlan;
      const progress = freshPlan.progress || {};
      const readingUnits = progress.reading_units || [];
      const activeEntry = this._getEarliestUncompletedEntry(freshPlan);
      if (activeEntry && activeEntry.unit_indices.length > 0) {
        this._todayUnits = activeEntry.unit_indices.map(i => readingUnits[i]).filter(Boolean);
        this._activeScheduleDate = activeEntry.date;
      } else {
        this._todayUnits = readingUnits.filter(u => u && !u.deleted).slice(0, 10);
      }
      if (!this._todayUnits.length) {
        this._stopReadingMode();
        return;
      }
      const cur = this._todayUnits[this._readingStep];
      if (cur) {
        this._readingStep = this._todayUnits.findIndex(u => u.book_id === cur.book_id && u.chapter === cur.chapter);
        if (this._readingStep < 0) this._readingStep = 0;
      } else {
        this._readingStep = 0;
      }
      this._renderReadingSteps();
    }
    if (this._view === 'detail' && this._editingPlanId) {
      const plan = this._state.plans.find(p => p.id === this._editingPlanId);
      if (plan) {
        this._openPlanDetail(this._editingPlanId);
      } else {
        this._showView('list');
      }
    } else if (this._view === 'list') {
      this._renderList();
    }
  }

  _renderReadingSteps() {
    const stepsEl = document.getElementById('rgb-steps');
    const completeBtn = document.getElementById('rgb-complete');
    const prevBtn = document.getElementById('rgb-prev');
    const nextBtn = document.getElementById('rgb-next');
    if (!stepsEl) return;

    let html = '';
    for (let i = 0; i < this._todayUnits.length; i++) {
      const unit = this._todayUnits[i];
      const isCurrent = i === this._readingStep;
      const label = window.PassageRef.formatPassage(unit);
      html += `<button class="rgb-step ${isCurrent ? 'rgb-step-current' : ''}" data-step="${i}">${window.HTMLEscape(label || '')}</button>`;
    }
    stepsEl.innerHTML = html;

    stepsEl.querySelectorAll('.rgb-step').forEach(btn => {
      btn.addEventListener('click', () => this._readingGoToStep(parseInt(btn.dataset.step, 10)));
    });

    const isLast = this._readingStep >= this._todayUnits.length - 1;
    completeBtn.classList.toggle('rgb-complete-visible', isLast);
    prevBtn.disabled = this._readingStep <= 0;
    nextBtn.disabled = this._readingStep >= this._todayUnits.length - 1;
  }

  _readingStepNav(delta) {
    const next = this._readingStep + delta;
    if (next < 0 || next >= this._todayUnits.length) return;
    this._readingGoToStep(next);
  }

  async _readingGoToStep(index) {
    if (index < 0 || index >= this._todayUnits.length) return;
    this._readingStep = index;
    this._renderReadingSteps();
    const unit = this._todayUnits[index];
    if (unit) {
      const nav = this.bridge.get('navigation');
      if (nav) await nav.navigateTo(unit.book_id, unit.chapter, unit.verse_start || unit.verse || 1);
    }
  }

  _readingCheckChapter() {
    if (!this._readingPlan || !this._todayUnits.length) return;
    const currentBook = this._state.get('currentBook');
    const currentChapter = this._state.get('currentChapter');
    const idx = this._todayUnits.findIndex(u =>
      u.book_id === currentBook && u.chapter <= currentChapter && (u.chapter_end || u.chapter) >= currentChapter
    );
    if (idx >= 0 && idx !== this._readingStep) {
      this._readingStep = idx;
      this._renderReadingSteps();
    }
  }

  async _readingComplete() {
    const plan = this._readingPlan;
    if (!plan) return;
    const today = this._today();
    const scheduleDate = this._activeScheduleDate || today;
    const progress = plan.progress || {};
    const schedule = progress.schedule || [];
    const readingUnits = progress.reading_units || [];
    const scheduleEntry = schedule.find(s => s.date === scheduleDate);
    if (!scheduleEntry) return;

    const completions = { ...(progress.completions || {}) };
    for (const idx of scheduleEntry.unit_indices) {
      completions[idx] = { date: today, completed_at: Date.now() };
    }
    const completedWeight = Object.keys(completions).reduce((sum, key) => {
      const unit = readingUnits[parseInt(key, 10)];
      return sum + (unit ? (unit.weight || 1) : 0);
    }, 0);

    this._state.updatePlan(plan.id, {
      progress: {
        ...progress,
        completions,
        schedule: schedule.map(s => s.date === scheduleDate ? { ...s, status: 'completed' } : s),
        metrics: { ...(progress.metrics || {}), completed_weight: completedWeight }
      }
    });

    const rl = this.bridge.get('reading-log');
    if (rl) {
      const segments = scheduleEntry.unit_indices.map(idx => {
        const u = readingUnits[idx];
        return u ? { book_id: u.book_id, chapter: u.chapter, chapters: [u.chapter, u.chapter_end || u.chapter] } : null;
      }).filter(Boolean);
      const verseCount = scheduleEntry.unit_indices.reduce((sum, idx) => {
        const u = readingUnits[idx];
        return sum + (u ? (u.verse_end || 31) - (u.verse_start || 1) + 1 : 0);
      }, 0);
      await rl.recordReading({ plan_id: plan.id, date: today, segments, verse_count: Math.max(verseCount, 1) });
    }

    this._stopReadingMode();
    this.expand();
    this._openPlanDetail(plan.id);
  }

  compress() {
    if (!this._open || this._compressed) return;
    this._compressed = true;
    const panel = document.getElementById('plans-panel');
    if (panel) panel.classList.add('compressed');
  }

  expand() {
    if (!this._open || !this._compressed) return;
    this._compressed = false;
    const panel = document.getElementById('plans-panel');
    if (panel) panel.classList.remove('compressed');
  }

  async _showWizard() {
    const wizardView = document.getElementById('plans-wizard-view');
    wizardView.innerHTML = `
      <div class="plans-wizard">
        <h3>Create a Reading Plan</h3>
        <p class="plans-wizard-intro">Choose how you'd like to create your plan.</p>
        <div class="plans-wizard-options">
          <div class="plans-wizard-option" id="wizard-option-predefined">
            <h4>Predefined Plan</h4>
            <p>Choose from ready-made plans: whole Bible in a year, chronological, 90-day New Testament, and more.</p>
          </div>
          <div class="plans-wizard-option" id="wizard-option-generator">
            <h4>Custom Generator</h4>
            <p>Select which books to read, choose the order, set your pace and reading days.</p>
          </div>
        </div>
      </div>
    `;

    document.getElementById('wizard-option-predefined').addEventListener('click', () => this._showWizardPredefined());
    document.getElementById('wizard-option-generator').addEventListener('click', () => this._showWizardGenerator());

    this._showView('wizard');
    document.getElementById('plans-title').textContent = 'New Plan';
  }

  async _showWizardPredefined() {
    this._wizardType = 'predefined';
    this._wizard = {
      predefinedPlan: '1year-Traditional',
      duration: '1year',
      psalm: false,
      proverb: false
    };
    this._wizardStep = 0;
    this._renderWizardStep();
  }

  async _showWizardGenerator() {
    const today = this._today();
    const nextYear = this._addDays(today, 365);
    this._wizardType = 'generator';
    this._wizard = { ...this._wizardDefaults, target_date: nextYear };
    this._wizardStep = 0;
    this._renderWizardStep();
  }

  async _createFromPredefined(planId, options) {
    options = options || {};
    const dur = options.duration || '1year';
    const addPsalm = options.psalm || false;
    const addProverb = options.proverb || false;

    const factorMap = { '3months': 0.25, '6months': 0.5, '1year': 1, '2years': 2, '3years': 3 };
    const scale = factorMap[dur] || 1;

    try {
      const meta = window.PredefinedLoader.getPlanMeta(planId);
      if (!meta) throw new Error('Unknown plan: ' + planId);

      const plan = await window.PredefinedLoader.loadPlan(planId);
      const sourceEntries = plan.entries;

      let mergedEntries;
      if (scale < 1) {
        const groupSize = Math.round(1 / scale);
        mergedEntries = [];
        for (let i = 0; i < sourceEntries.length; i += groupSize) {
          const group = sourceEntries.slice(i, i + groupSize);
          const merged = { passages: [] };
          for (const g of group) merged.passages = merged.passages.concat(g.passages);
          mergedEntries.push(merged);
        }
      } else if (scale > 1) {
        mergedEntries = [];
        for (const entry of sourceEntries) {
          for (let s = 0; s < scale; s++) {
            const chunks = this._splitPassages(entry.passages, scale, s);
            if (chunks.length) mergedEntries.push({ passages: chunks });
          }
        }
      } else {
        mergedEntries = sourceEntries;
      }

      if (addPsalm || addProverb) {
        let psalmIdx = 0;
        let provIdx = 0;
        for (const entry of mergedEntries) {
          if (addPsalm) {
            const ch = (psalmIdx % 150) + 1;
            entry.passages.push({ book_id: 19, chapter: ch, chapter_end: ch, verse: 1, verse_end: null, _extra: true });
            psalmIdx++;
          }
          if (addProverb) {
            const ch = (provIdx % 31) + 1;
            entry.passages.push({ book_id: 20, chapter: ch, chapter_end: ch, verse: 1, verse_end: null, _extra: true });
            provIdx++;
          }
        }
      }

      const readingUnits = [];
      for (const entry of mergedEntries) {
        for (const p of entry.passages) {
          const versesPerChapter = 25;
          const numChapters = Math.max(1, (p.chapter_end || p.chapter) - p.chapter + 1);
          const weight = Math.max(1, Math.round(numChapters * versesPerChapter * 28 / (200 * 5) * 10) / 10);
          readingUnits.push({
            index: readingUnits.length,
            book_id: p.book_id,
            chapter: p.chapter,
            chapter_end: p.chapter_end || p.chapter,
            verse_start: p.verse || 1,
            verse_end: p.verse_end || null,
            weight
          });
        }
      }

      const startDate = this._today();
      const effectiveDays = mergedEntries.length;
      const endDate = this._addDays(startDate, effectiveDays);
      const schedule = [];
      for (let i = 0; i < mergedEntries.length; i++) {
        const entryDate = this._addDays(startDate, i);
        const entry = mergedEntries[i];
        const unitIndices = [];
        for (const p of entry.passages) {
          const idx = readingUnits.findIndex(u => u.book_id === p.book_id && u.chapter === p.chapter && !unitIndices.includes(u.index));
          if (idx >= 0) unitIndices.push(readingUnits[idx].index);
        }
        schedule.push({ date: entryDate, unit_indices: unitIndices, status: 'pending' });
      }

      const totalWeight = readingUnits.reduce((s, u) => s + (u.weight || 1), 0);
      const durLabels = { '3months': '3 Months', '6months': '6 Months', '1year': '1 Year', '2years': '2 Years', '3years': '3 Years' };
      const extras = [];
      if (addPsalm) extras.push('+Psalm');
      if (addProverb) extras.push('+Proverb');
      const extraLabel = extras.length ? ' ' + extras.join(' ') : '';
      const planName = meta.name + ' (' + (durLabels[dur] || '1 Year') + ')' + extraLabel;

      const planData = {
        name: planName,
        type: 'predefined',
        predefined: { plan_id: planId },
        start_date: startDate,
        status: 'active',
        progress: {
          reading_units: readingUnits,
          completions: {},
          schedule,
          metrics: {
            total_weight: totalWeight,
            completed_weight: 0,
            estimated_completion: endDate
          }
        }
      };

      const created = this._state.addPlan(planData);
      this._openPlanDetail(created.id);
    } catch (e) {
      console.error('[PlansUI] Failed to create plan:', e);
      await this._alertDialog({ title: 'Plan creation failed', message: e.message });
    }
  }

  _splitPassages(passages, scale, sliceIdx) {
    if (!passages.length) return [];
    const totalUnits = passages.reduce((sum, p) => sum + Math.max(1, (p.chapter_end || p.chapter) - p.chapter + 1), 0);
    const perSlice = Math.max(1, Math.ceil(totalUnits / scale));
    const result = [];
    let acc = 0;
    for (const p of passages) {
      const chCount = Math.max(1, (p.chapter_end || p.chapter) - p.chapter + 1);
      const start = Math.max(0, sliceIdx * perSlice - acc);
      const end = Math.min(chCount, (sliceIdx + 1) * perSlice - acc);
      if (start < end) {
        result.push({
          book_id: p.book_id,
          chapter: p.chapter + start,
          chapter_end: p.chapter + end - 1,
          verse: 1,
          verse_end: null
        });
      }
      acc += chCount;
    }
    return result;
  }

  _renderWizardStep() {
    const wizardView = document.getElementById('plans-wizard-view');
    const isPredefined = this._wizardType === 'predefined';
    const labels = isPredefined
      ? ['Plan', 'Duration', 'Extras', 'Review']
      : ['What to read', 'Order', 'Pace', 'Schedule', 'Flexibility', 'Review'];
    const maxStep = labels.length - 1;

    const dotsEl = document.getElementById('pw-header-dots');
    const labelEl = document.getElementById('pw-header-label');
    if (dotsEl) {
      let dotsHtml = '';
      for (let i = 0; i < labels.length; i++) {
        const active = i <= this._wizardStep;
        const current = i === this._wizardStep;
        const clickable = i < this._wizardStep;
        dotsHtml += `<button class="pw-step-dot ${active ? 'pw-step-active' : ''} ${current ? 'pw-step-current' : ''}" data-step="${i}" ${clickable ? '' : 'disabled'} aria-label="Step ${i + 1}: ${labels[i]}"></button>`;
        if (i < labels.length - 1) dotsHtml += `<span class="pw-step-line ${i < this._wizardStep ? 'pw-step-done' : ''}"></span>`;
      }
      dotsEl.innerHTML = dotsHtml;
      dotsEl.querySelectorAll('.pw-step-dot:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
          this._wizardStep = parseInt(btn.dataset.step, 10);
          this._renderWizardStep();
        });
      });
    }
    if (labelEl) labelEl.textContent = `Step ${this._wizardStep + 1} of ${labels.length}: ${labels[this._wizardStep]}`;

    let html = `<div class="plans-wizard-gen"><div class="pw-preview-bar">${this._renderPreviewBar()}</div><div class="pw-body">`;

    if (this._wizardStep !== 3) {
      this._readingDaysAutoAdjusted = false;
    }

    if (this._wizardType === 'predefined') {
      switch (this._wizardStep) {
        case 0: html += this._renderPredefinedStepPlan(); break;
        case 1: html += this._renderPredefinedStepDuration(); break;
        case 2: html += this._renderPredefinedStepExtras(); break;
        case 3: html += this._renderPredefinedStepReview(); break;
      }
    } else {
      switch (this._wizardStep) {
        case 0: html += this._renderStepContent(); break;
        case 1: html += this._renderStepOrder(); break;
        case 2: html += this._renderStepPace(); break;
        case 3: if (!this._readingDaysAutoAdjusted) { this._autoAdjustReadingDays(); this._readingDaysAutoAdjusted = true; } html += this._renderStepSchedule(); break;
        case 4: html += this._renderStepFlexibility(); break;
        case 5: html += this._renderStepReview(); break;
      }
    }

    html += `</div><div class="pw-footer">`;
    if (this._wizardStep > 0) html += `<button class="pw-btn pw-btn-secondary" id="pw-back">Back</button>`;
    if (this._wizardStep < maxStep) {
      html += `<button class="pw-btn pw-btn-primary" id="pw-next">Next</button>`;
    } else {
      const btnLabel = isPredefined ? 'Create Plan' : 'Generate Plan';
      html += `<button class="pw-btn pw-btn-primary" id="pw-generate">${btnLabel}</button>`;
    }
    html += `</div></div>`;
    wizardView.innerHTML = html;

    document.getElementById('pw-back')?.addEventListener('click', () => { this._wizardStep--; this._renderWizardStep(); });
    document.getElementById('pw-next')?.addEventListener('click', () => { this._wizardStep++; this._renderWizardStep(); });
    document.getElementById('pw-generate')?.addEventListener('click', () => {
      if (this._wizardType === 'predefined') this._createFromPredefinedWizard();
      else this._createFromGenerator();
    });
    this._bindWizardEvents();
  }

  _renderStepContent() {
    const groups = window.BookGroups.getAllGroups();
    let html = `<div class="pw-content-group">`;
    for (const g of groups) {
      const checked = g.id === (this._wizard.content || 'whole-bible') ? 'checked' : '';
      html += `<label class="pw-option ${checked ? 'pw-option-selected' : ''}">
        <input type="radio" name="wc-content" value="${g.id}" ${checked}>
        <span class="pw-option-label">${window.HTMLEscape(g.name)}</span>
      </label>`;
    }
    html += `</div>`;
    return html;
  }

  _renderStepOrder() {
    const groupBooks = window.BookGroups.getGroup(this._wizard.content) || [];
    const uniqueBooks = new Set(groupBooks).size;
    const hasOT = groupBooks.some(b => b <= 39);
    const hasNT = groupBooks.some(b => b >= 40);
    const canMix = hasOT && hasNT;
    const canChron = uniqueBooks >= 2;
    if (!canMix && this._wizard.order === 'mixed') this._wizard.order = 'canonical';
    if (!canChron && this._wizard.order === 'chronological') this._wizard.order = 'canonical';

    const orders = [{ id: 'canonical', label: 'Canonical', desc: 'Genesis through Revelation in the traditional order' }];
    if (canChron) orders.push({ id: 'chronological', label: 'Chronological', desc: 'Books arranged by the approximate order of events' });
    if (canMix) orders.push({ id: 'mixed', label: 'Mixed Rotation', desc: 'One passage from the OT, one from Wisdom, one from the NT each day' });
    let html = `<div class="pw-options">`;
    for (const o of orders) {
      const checked = o.id === (this._wizard.order || 'canonical') ? 'checked' : '';
      html += `<label class="pw-option ${checked ? 'pw-option-selected' : ''}">
        <input type="radio" name="wc-order" value="${o.id}" ${checked}>
        <span class="pw-option-label">${window.HTMLEscape(o.label)}</span>
        <span class="pw-option-desc">${window.HTMLEscape(o.desc)}</span>
      </label>`;
    }
    html += `</div>`;
    return html;
  }

  _renderStepPace() {
    const pacePresets = [
      { value: 7, label: '7 days (1 week)' },
      { value: 30, label: '30 days (1 month)' },
      { value: 60, label: '60 days (2 months)' },
      { value: 90, label: '90 days (3 months)' },
      { value: 180, label: '180 days (6 months)' },
      { value: 365, label: '365 days (1 year)' },
      { value: 730, label: '730 days (2 years)' },
      { value: 0, label: 'Custom' }
    ];
    const isDays = this._wizard.pace_type === 'days';
    const isDate = this._wizard.pace_type === 'date';
    const isNone = this._wizard.pace_type === 'none';
    const matchedPreset = pacePresets.find(p => p.value === this._wizard.pace_value);
    const selectLabel = matchedPreset ? matchedPreset.label : (this._wizard.pace_value ? `${this._wizard.pace_value} days` : '365 days (1 year)');
    const isCustom = isDays && !matchedPreset;

    let html = `<div class="pw-pace">`;

    // Days option with embedded select
    html += `<label class="pw-option ${isDays ? 'pw-option-selected' : ''}">
      <input type="radio" name="wc-pace" value="days" ${isDays ? 'checked' : ''}>
      <span class="pw-option-row">
        <span class="pw-option-label">Days</span>
        <span class="pw-option-select-wrap">
          <select class="pw-pace-select" id="wc-pace-select" ${isDays ? '' : 'disabled'}>
            ${pacePresets.map(p => `<option value="${p.value}" ${p.value === this._wizard.pace_value ? 'selected' : ''}>${window.HTMLEscape(p.label)}</option>`).join('')}
          </select>
        </span>
      </span>
      <span class="pw-option-desc">Finish in a specific number of days</span>
      ${isCustom ? `<div class="pw-pace-custom"><input type="number" id="wc-pace-days" value="${this._wizard.pace_value || 365}" min="1" max="3650" class="pw-input" placeholder="Number of days"></div>` : ''}
    </label>`;

    // Date option with embedded date input
    html += `<label class="pw-option ${isDate ? 'pw-option-selected' : ''}">
      <input type="radio" name="wc-pace" value="date" ${isDate ? 'checked' : ''}>
      <span class="pw-option-row">
        <span class="pw-option-label">Target date</span>
        <span class="pw-option-select-wrap">
          <input type="date" class="pw-pace-date" id="wc-pace-date" value="${this._wizard.target_date || this._addDays(this._today(), 365)}" ${isDate ? '' : 'disabled'}>
        </span>
      </span>
      <span class="pw-option-desc">Finish by a specific calendar date</span>
    </label>`;

    // No deadline
    html += `<label class="pw-option ${isNone ? 'pw-option-selected' : ''}">
      <input type="radio" name="wc-pace" value="none" ${isNone ? 'checked' : ''}>
      <span class="pw-option-label">No deadline</span>
      <span class="pw-option-desc">Read at my own pace</span>
    </label>`;

    const timeOpts = [20, 40, 60, 80, 100, 120];
    const curMin = this._wizard.max_minutes || 20;
    const matchedMin = timeOpts.reduce((a, b) => Math.abs(b - curMin) < Math.abs(a - curMin) ? b : a);
    html += `<div class="pw-pace-limit">
      <label class="pw-check-label">Daily Reading Time:
        <select id="wc-pace-time">
          ${timeOpts.map(t => `<option value="${t}" ${t === matchedMin ? 'selected' : ''}>${t} minutes</option>`).join('')}
        </select>
      </label>
    </div>`;
    html += `<div class="pw-pace-opts">
      <label class="pw-check-label"><input type="checkbox" id="wc-split" ${this._wizard.split_chapters ? 'checked' : ''}> Split long chapters into verse ranges for balanced daily reading</label>
      <label class="pw-check-label"><input type="checkbox" id="wc-longer-weekends" ${this._wizard.longer_weekends ? 'checked' : ''}> Allow longer readings on weekends</label>
    </div>`;
    html += `</div>`;
    return html;
  }

  _renderStepSchedule() {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let presets = [
      { id: 'all', label: 'Every day' },
      { id: 'weekdays', label: 'Weekdays' },
      { id: 'weekends', label: 'Weekends' }
    ];
    const current = this._wizard.reading_days || [0,1,2,3,4,5,6];
    const isAll = current.length === 7;
    const isWeekdays = current.length === 5 && !current.includes(0) && !current.includes(6);
    const isWeekends = current.length === 2 && current.includes(0) && current.includes(6);
    let html = `<div class="pw-schedule"><div class="pw-presets">`;
    for (const p of presets) {
      const active = (p.id === 'all' && isAll) || (p.id === 'weekdays' && isWeekdays) || (p.id === 'weekends' && isWeekends);
      html += `<button class="pw-preset-btn ${active ? 'pw-preset-active' : ''}" data-preset="${p.id}">${p.label}</button>`;
    }
    html += `</div><div class="pw-days">`;
    for (let i = 0; i < 7; i++) {
      const checked = current.includes(i) ? 'checked' : '';
      html += `<label class="pw-day-label"><input type="checkbox" class="pw-day-cb" value="${i}" ${checked}> ${dayNames[i]}</label>`;
    }
    html += `</div>${this._getScheduleEstimate()}</div>`;
    return html;
  }

  _renderStepFlexibility() {
    const modes = [
      { id: 'keep_deadline', label: 'Keep my completion date', desc: 'Missed readings are distributed across remaining days' },
      { id: 'keep_workload', label: 'Keep my normal workload', desc: 'The completion date moves later instead of increasing daily readings' },
      { id: 'ask', label: 'Ask when adjustment is significant', desc: 'Minor changes auto-adjust, but the app asks before major shifts' }
    ];
    let html = `<div class="pw-flex">`;
    for (const m of modes) {
      const checked = m.id === (this._wizard.recalculation || 'keep_deadline') ? 'checked' : '';
      html += `<label class="pw-option ${checked ? 'pw-option-selected' : ''}">
        <input type="radio" name="wc-recalc" value="${m.id}" ${checked}>
        <span class="pw-option-label">${m.label}</span>
        <span class="pw-option-desc">${m.desc}</span>
      </label>`;
    }
    html += `<div class="pw-flex-extra"><h4>Add-ons</h4>`;
    html += `<label class="pw-check-label"><input type="checkbox" id="wc-psalm" ${this._wizard.psalm ? 'checked' : ''}> + Daily Psalm (cycles through Psalms 1\u2013150)</label>`;
    html += `<label class="pw-check-label"><input type="checkbox" id="wc-proverb" ${this._wizard.proverb ? 'checked' : ''}> + Daily Proverb (cycles through Proverbs 1\u201331)</label>`;

    const aheadOpts = [
      { id: 'reduce_workload', label: 'Adjust future readings' },
      { id: 'finish_earlier', label: 'Finish earlier' }
    ];
    html += `<h4>When I read ahead</h4>`;
    for (const ao of aheadOpts) {
      const checked = ao.id === (this._wizard.reading_ahead || 'reduce_workload') ? 'checked' : '';
      html += `<label class="pw-option-inline ${checked ? 'pw-option-selected' : ''}">
        <input type="radio" name="wc-ahead" value="${ao.id}" ${checked}>
        <span class="pw-option-label">${ao.label}</span>
      </label>`;
    }
    html += `</div></div>`;
    return html;
  }

  _renderStepReview() {
    const contentName = window.BookGroups._displayName(this._wizard.content) || 'Whole Bible';
    const orderNames = { canonical: 'Canonical (Genesis to Revelation)', chronological: 'Chronological (by event order)', mixed: 'Mixed Rotation' };
    const paceLabels = { days: `${this._wizard.pace_value} days`, date: `by ${this._wizard.target_date}`, none: 'No deadline (my own pace)' };
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const daysLabel = (this._wizard.reading_days || []).map(d => dayNames[d]).join(', ');
    const recalcLabels = { keep_deadline: 'Keep completion date', keep_workload: 'Keep normal workload', ask: 'Ask before significant adjustments' };
    const aheadLabels = { reduce_workload: 'Adjust future readings', finish_earlier: 'Finish earlier' };

    return `
      <div class="pw-review">
        <div class="pw-review-row"><span class="pw-review-label">Content</span><span class="pw-review-value">${window.HTMLEscape(contentName)}</span></div>
        <div class="pw-review-row"><span class="pw-review-label">Order</span><span class="pw-review-value">${orderNames[this._wizard.order] || 'Canonical'}</span></div>
        <div class="pw-review-row"><span class="pw-review-label">Pace</span><span class="pw-review-value">${paceLabels[this._wizard.pace_type] || 'My own pace'}${this._wizard.pace_type !== 'none' ? `, ${this._wizard.max_minutes || 20} min/day` : ''}${this._wizard.split_chapters ? ', split chapters' : ''}${this._wizard.longer_weekends ? ', longer weekends' : ''}</span></div>
        <div class="pw-review-row"><span class="pw-review-label">Schedule</span><span class="pw-review-value">${daysLabel || 'Every day'}</span></div>
        <div class="pw-review-row"><span class="pw-review-label">Recalculation</span><span class="pw-review-value">${recalcLabels[this._wizard.recalculation] || 'Keep deadline'}</span></div>
        <div class="pw-review-row"><span class="pw-review-label">Reading ahead</span><span class="pw-review-value">${aheadLabels[this._wizard.reading_ahead] || 'Reduce workload'}</span></div>
        ${this._wizard.psalm || this._wizard.proverb ? `<div class="pw-review-row"><span class="pw-review-label">Extras</span><span class="pw-review-value">${this._wizard.psalm ? '+Psalm ' : ''}${this._wizard.proverb ? '+Proverb' : ''}</span></div>` : ''}
      </div>
    `;
  }

  _renderPredefinedStepPlan() {
    const manifest = window.PredefinedLoader.manifest;
    let html = `<div class="pw-options">`;
    for (const p of manifest) {
      const checked = p.id === this._wizard.predefinedPlan ? 'checked' : '';
      html += `<label class="pw-option ${checked ? 'pw-option-selected' : ''}">
        <input type="radio" name="pw-pd-plan" value="${p.id}" ${checked}>
        <span class="pw-option-label">${window.HTMLEscape(p.name)}</span>
        <span class="pw-option-desc">${window.HTMLEscape(p.description)}</span>
      </label>`;
    }
    html += `</div>`;
    return html;
  }

  _renderPredefinedStepDuration() {
    const options = [
      { value: '3months', label: '3 months', desc: 'Fast-paced — read the whole Bible in 3 months' },
      { value: '6months', label: '6 months', desc: 'Moderate pace — read the whole Bible in 6 months' },
      { value: '1year', label: '1 year', desc: 'Classic pace — read the whole Bible in a year' },
      { value: '2years', label: '2 years', desc: 'Gentle pace — approximately 1\u20132 chapters per day' },
      { value: '3years', label: '3 years', desc: 'Relaxed pace — short daily readings' }
    ];
    let html = `<div class="pw-options">`;
    for (const o of options) {
      const checked = o.value === this._wizard.duration ? 'checked' : '';
      html += `<label class="pw-option ${checked ? 'pw-option-selected' : ''}">
        <input type="radio" name="pw-pd-dur" value="${o.value}" ${checked}>
        <span class="pw-option-label">${o.label}</span>
        <span class="pw-option-desc">${o.desc}</span>
      </label>`;
    }
    html += `</div>`;
    return html;
  }

  _renderPredefinedStepExtras() {
    return `
      <div class="pw-options">
        <label class="pw-option ${!this._wizard.psalm && !this._wizard.proverb ? 'pw-option-selected' : ''}">
          <input type="radio" name="pw-pd-extra" value="none" ${!this._wizard.psalm && !this._wizard.proverb ? 'checked' : ''}>
          <span class="pw-option-label">No extras</span>
          <span class="pw-option-desc">Just the plan readings, nothing added</span>
        </label>
        <label class="pw-option ${this._wizard.psalm ? 'pw-option-selected' : ''}">
          <input type="radio" name="pw-pd-extra" value="psalm" ${this._wizard.psalm ? 'checked' : ''}>
          <span class="pw-option-label">+ Daily Psalm</span>
          <span class="pw-option-desc">Cycles through all 150 Psalms, one per day</span>
        </label>
        <label class="pw-option ${this._wizard.proverb ? 'pw-option-selected' : ''}">
          <input type="radio" name="pw-pd-extra" value="proverb" ${this._wizard.proverb ? 'checked' : ''}>
          <span class="pw-option-label">+ Daily Proverb</span>
          <span class="pw-option-desc">Cycles through all 31 Proverbs, one per day</span>
        </label>
        <label class="pw-option ${this._wizard.psalm && this._wizard.proverb ? 'pw-option-selected' : ''}">
          <input type="radio" name="pw-pd-extra" value="both" ${this._wizard.psalm && this._wizard.proverb ? 'checked' : ''}>
          <span class="pw-option-label">+ Psalm + Proverb</span>
          <span class="pw-option-desc">Add both a Psalm and a Proverb to each day</span>
        </label>
      </div>
    `;
  }

  _renderPredefinedStepReview() {
    const meta = window.PredefinedLoader.getPlanMeta(this._wizard.predefinedPlan);
    const durLabels = { '3months': '3 Months', '6months': '6 Months', '1year': '1 Year', '2years': '2 Years', '3years': '3 Years' };
    const days = { '3months': 91, '6months': 183, '1year': 365, '2years': 730, '3years': 1095 };
    const extras = [];
    if (this._wizard.psalm) extras.push('Daily Psalm');
    if (this._wizard.proverb) extras.push('Daily Proverb');
    return `
      <div class="pw-review">
        <div class="pw-review-row"><span class="pw-review-label">Plan</span><span class="pw-review-value">${window.HTMLEscape(meta ? meta.name : '')}</span></div>
        <div class="pw-review-row"><span class="pw-review-label">Duration</span><span class="pw-review-value">${durLabels[this._wizard.duration] || '1 Year'}</span></div>
        <div class="pw-review-row"><span class="pw-review-label">Readings</span><span class="pw-review-value">${days[this._wizard.duration] || 365}</span></div>
        <div class="pw-review-row"><span class="pw-review-label">Extras</span><span class="pw-review-value">${extras.length ? extras.join(' + ') : 'None'}</span></div>
      </div>
    `;
  }

  async _createFromPredefinedWizard() {
    await this._createFromPredefined(this._wizard.predefinedPlan, {
      duration: this._wizard.duration,
      psalm: this._wizard.psalm,
      proverb: this._wizard.proverb
    });
  }

  _bindWizardEvents() {
    const w = this._wizard;
    const wizardView = document.getElementById('plans-wizard-view');
    if (!wizardView) return;

    if (!wizardView.dataset.wizardBound) {
      wizardView.dataset.wizardBound = '1';
      wizardView.addEventListener('click', (e) => {
        const isPredefined = this._wizardType === 'predefined';
        const radioSteps = isPredefined
          ? { 'pw-pd-plan': 1, 'pw-pd-dur': 2, 'pw-pd-extra': 3 }
          : { 'wc-content': 1, 'wc-order': 2, 'wc-pace': -1, 'wc-recalc': 0, 'wc-ahead': 0 };
        const w = this._wizard;
        const option = e.target.closest('.pw-option, .pw-option-inline');
        if (!option) return;
        const input = option.querySelector('input[type="radio"]');
        if (!input) return;
        const step = radioSteps[input.name];
        if (step === undefined) return;

        if (input.name === 'wc-pace') {
          w.pace_type = input.value;
          this._renderWizardStep();
        } else if (input.name === 'wc-recalc') {
          w.recalculation = input.value;
        } else if (input.name === 'wc-ahead') {
          w.reading_ahead = input.value;
        } else if (input.name === 'pw-pd-extra') {
          w.psalm = input.value === 'psalm' || input.value === 'both';
          w.proverb = input.value === 'proverb' || input.value === 'both';
          this._renderWizardStep();
        } else {
          const val = input.value;
          if (input.name === 'wc-content') w.content = val;
          else if (input.name === 'wc-order') w.order = val;
          else if (input.name === 'pw-pd-plan') w.predefinedPlan = val;
          else if (input.name === 'pw-pd-dur') w.duration = val;
          this._renderWizardStep();
        }
        this._updateWizardUI();
      });
    }

    document.getElementById('wc-pace-select')?.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      if (val > 0) { w.pace_value = val; this._renderWizardStep(); }
      else { w.pace_value = 30; this._renderWizardStep(); }
    });
    document.getElementById('wc-pace-days')?.addEventListener('change', (e) => {
      w.pace_value = parseInt(e.target.value, 10) || 30;
      this._renderWizardStep();
    });
    document.getElementById('wc-pace-date')?.addEventListener('change', (e) => {
      w.target_date = e.target.value;
      this._renderWizardStep();
    });
    document.querySelectorAll('.pw-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const presets = { all: [0,1,2,3,4,5,6], weekdays: [1,2,3,4,5], weekends: [0,6] };
        const days = presets[btn.dataset.preset];
        if (days) { w.reading_days = days; this._renderWizardStep(); }
      });
    });
    document.querySelectorAll('.pw-day-cb').forEach(el => {
      el.addEventListener('change', () => {
        w.reading_days = Array.from(document.querySelectorAll('.pw-day-cb:checked')).map(cb => parseInt(cb.value, 10));
        this._updateWizardUI();
      });
    });
    document.getElementById('wc-pace-time')?.addEventListener('change', (e) => { w.max_minutes = parseInt(e.target.value, 10) || 20; });
    document.getElementById('wc-split')?.addEventListener('change', (e) => { w.split_chapters = e.target.checked; });
    document.getElementById('wc-longer-weekends')?.addEventListener('change', (e) => { w.longer_weekends = e.target.checked; });
    document.getElementById('wc-psalm')?.addEventListener('change', (e) => { w.psalm = e.target.checked; });
    document.getElementById('wc-proverb')?.addEventListener('change', (e) => { w.proverb = e.target.checked; });
  }

  _getScheduleEstimate() {
    const w = this._wizard;
    if (!w.content || w.pace_type === 'none') return '';
    const books = window.BookGroups.getGroup(w.content) || [];
    const totalUnits = books.reduce((sum, b) => sum + (_CHAPTER_COUNTS[b] || 10), 0);
    if (totalUnits === 0) return '';
    const readingDaysPerWeek = (w.reading_days || []).length;
    if (readingDaysPerWeek === 0) return '';

    let totalDays;
    if (w.pace_type === 'days') {
      totalDays = w.pace_value || 365;
    } else if (w.pace_type === 'date' && w.target_date) {
      const target = new Date(w.target_date + 'T12:00:00');
      const today = new Date(this._today() + 'T12:00:00');
      totalDays = Math.max(1, Math.ceil((target - today) / 86400000));
    } else {
      return '';
    }

    const readingDaysTotal = Math.round((totalDays / 7) * readingDaysPerWeek);
    if (readingDaysTotal === 0) return '';
    const perDay = Math.ceil(totalUnits / readingDaysTotal);
    return `<div class="pw-schedule-estimate">~${perDay} chapters per reading day</div>`;
  }

  _autoAdjustReadingDays() {
    const w = this._wizard;
    if (!w.content) return;
    const books = window.BookGroups.getGroup(w.content) || [];
    const totalUnits = books.reduce((sum, b) => sum + (_CHAPTER_COUNTS[b] || 10), 0);
    if (totalUnits === 0) return;

    let totalDays;
    if (w.pace_type === 'days') {
      totalDays = w.pace_value || 365;
    } else if (w.pace_type === 'date' && w.target_date) {
      const target = new Date(w.target_date + 'T12:00:00');
      const today = new Date(this._today() + 'T12:00:00');
      totalDays = Math.max(1, Math.ceil((target - today) / 86400000));
    } else {
      return;
    }

    const weeks = Math.max(1, totalDays / 7);
    const optimalDays = Math.min(7, Math.max(1, Math.round(totalUnits / weeks)));
    if (optimalDays !== (w.reading_days || []).length) {
      const weekdayOrder = [1, 2, 3, 4, 5, 0, 6];
      w.reading_days = weekdayOrder.slice(0, optimalDays);
    }
  }

  _advanceWizard(minStep) {
    const maxStep = this._wizardType === 'predefined' ? 3 : 5;
    const nextStep = Math.max(this._wizardStep + 1, minStep);
    if (nextStep <= maxStep) {
      this._wizardStep = nextStep;
      this._renderWizardStep();
    }
  }

  _updateWizardUI() {
    document.querySelectorAll('.pw-option, .pw-option-inline').forEach(el => {
      const input = el.querySelector('input[type="radio"]');
      el.classList.toggle('pw-option-selected', input?.checked);
    });
  }

  async _createFromGenerator() {
    const w = this._wizard;
    const books = window.BookGroups.getGroup(w.content) || Array.from({ length: 66 }, (_, i) => i + 1);
    const content = { books };

    let target;
    let endDate = null;
    if (w.pace_type === 'days') {
      target = { type: 'days', value: w.pace_value || 365 };
      endDate = this._addDays(this._today(), w.pace_value || 365);
    } else if (w.pace_type === 'date') {
      target = { type: 'date', value: w.target_date };
      endDate = w.target_date;
    } else {
      target = { type: 'none' };
    }

    try {
      const generator = new window.PlanGenerator(this.bridge);
      const readingUnits = await generator.generateUnits({
        content, order: w.order,
        split_chapters: w.split_chapters || false,
        max_minutes: w.max_minutes || 15
      });
      const startDate = this._today();
      const indexedUnits = readingUnits.map((u, i) => ({ ...u, index: i }));
      let schedule = window.PlanScheduler.generateSchedule({
        start_date: startDate,
        generator: { target, reading_days: w.reading_days, workload_limits: { max_minutes: w.max_minutes || 25 } },
        progress: { reading_units: indexedUnits, completions: {}, schedule: [] }
      });

      if (w.psalm || w.proverb) {
        let psalmIdx = 0;
        let provIdx = 0;
        for (const day of schedule) {
          if (w.psalm) {
            const ch = (psalmIdx % 150) + 1;
            indexedUnits.push({
              index: indexedUnits.length,
              book_id: 19, chapter: ch, chapter_end: ch,
              verse_start: 1, verse_end: null, weight: 1.5
            });
            day.unit_indices.push(indexedUnits.length - 1);
            psalmIdx++;
          }
          if (w.proverb) {
            const ch = (provIdx % 31) + 1;
            indexedUnits.push({
              index: indexedUnits.length,
              book_id: 20, chapter: ch, chapter_end: ch,
              verse_start: 1, verse_end: null, weight: 1.0
            });
            day.unit_indices.push(indexedUnits.length - 1);
            provIdx++;
          }
        }
      }

      const totalWeight = indexedUnits.reduce((s, u) => s + (u.weight || 1), 0);

      const planData = {
        name: this._generateWizardName(),
        type: 'generator',
        generator: {
          content,
          order: w.order,
          target,
          reading_days: w.reading_days,
          recalculation: w.recalculation || 'keep_deadline',
          workload_limits: { max_weight: null, split_chapters: w.split_chapters || false, longer_weekends: w.longer_weekends || false, max_minutes: w.max_minutes || 25 },
          reading_ahead: w.reading_ahead || 'reduce_workload'
        },
        start_date: startDate,
        status: 'active',
        progress: {
          reading_units: indexedUnits,
          completions: {},
          schedule,
          metrics: {
            total_weight: totalWeight,
            completed_weight: 0,
            estimated_completion: endDate
          }
        }
      };

      const created = this._state.addPlan(planData);
      this._openPlanDetail(created.id);
    } catch (e) {
      console.error('[PlansUI] Generator error:', e);
      await this._alertDialog({ title: 'Plan generation failed', message: e.message });
    }
  }

  _generateWizardName() {
    const contentName = window.BookGroups._displayName(this._wizard.content) || 'Whole Bible';
    const orderLabels = { canonical: '', chronological: 'Chronological ', mixed: 'Mixed ' };
    const paceLabels = { days: this._wizard.pace_value ? `in ${this._wizard.pace_value} days` : '', date: `until ${this._wizard.target_date}`, none: '' };
    const orderPart = orderLabels[this._wizard.order] || '';
    const pacePart = paceLabels[this._wizard.pace_type] || '';
    const extras = [];
    if (this._wizard.psalm) extras.push('+Psalm');
    if (this._wizard.proverb) extras.push('+Proverb');
    const extraPart = extras.length ? ' (' + extras.join(' ') + ')' : '';
    return `${orderPart}${contentName}${pacePart ? ' ' + pacePart : ''}${extraPart}`.trim() || 'Custom Plan';
  }

  _deletePlanWithUndo(plan) {
    this._state.deletePlan(plan.id);
    this._renderList();
    this._showUndoToast(plan);
  }

  _showUndoToast(plan) {
    const existing = document.getElementById('plans-undo-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'plans-undo-toast';
    toast.className = 'plans-undo-toast';
    toast.innerHTML = `
      <span class="plans-undo-msg">Plan deleted</span>
      <button class="plans-undo-btn" id="plans-undo-btn">Undo</button>
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('open'));

    const cleanup = () => {
      toast.classList.remove('open');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    };

    document.getElementById('plans-undo-btn').addEventListener('click', () => {
      this._state.updatePlan(plan.id, { deleted: false });
      this._renderList();
      cleanup();
    });

    this._undoTimer = setTimeout(cleanup, 8000);
  }

  async _markTodayComplete(plan) {
    const progress = plan.progress || {};
    const schedule = progress.schedule || [];
    const readingUnits = progress.reading_units || [];
    const today = this._today();
    const activeEntry = this._getEarliestUncompletedEntry(plan);
    if (!activeEntry || activeEntry.status === 'completed') return;

    const completions = { ...(progress.completions || {}) };
    for (const idx of activeEntry.unit_indices) {
      completions[idx] = { date: today, completed_at: Date.now() };
    }
    const completedWeight = Object.keys(completions).reduce((sum, key) => {
      const unit = readingUnits[parseInt(key, 10)];
      return sum + (unit ? (unit.weight || 1) : 0);
    }, 0);

    this._state.updatePlan(plan.id, {
      progress: {
        ...progress,
        completions,
        schedule: schedule.map(s => s.date === activeEntry.date ? { ...s, status: 'completed' } : s),
        metrics: { ...(progress.metrics || {}), completed_weight: completedWeight }
      }
    });

    const rl = this.bridge.get('reading-log');
    if (rl) {
      const segments = activeEntry.unit_indices.map(idx => {
        const u = readingUnits[idx];
        return u ? { book_id: u.book_id, chapter: u.chapter, chapters: [u.chapter, u.chapter_end || u.chapter] } : null;
      }).filter(Boolean);
      const verseCount = activeEntry.unit_indices.reduce((sum, idx) => {
        const u = readingUnits[idx];
        return sum + (u ? (u.verse_end || 31) - (u.verse_start || 1) + 1 : 0);
      }, 0);
      await rl.recordReading({ plan_id: plan.id, date: today, segments, verse_count: Math.max(verseCount, 1) });
    }

    await this._renderList();
  }

  async _editPlan(planId) {
    const plan = this._state.plans.find(p => p.id === planId);
    if (!plan) return;

    const today = this._today();
    const nextYear = this._addDays(today, 365);
    const gen = plan.generator || {};
    const target = gen.target || {};
    const wl = gen.workload_limits || {};

    const wizardView = document.getElementById('plans-wizard-view');
    wizardView.innerHTML = `
      <div class="plans-editor">
        <h3>Edit Plan</h3>
        <div class="plans-editor-body">
          <div class="plans-editor-section">
            <label class="pw-check-label">Pace
              <select id="edit-pace" class="pw-input" style="max-width:200px">
                <option value="days" ${target.type === 'days' ? 'selected' : ''}>Finish in N days</option>
                <option value="date" ${target.type === 'date' ? 'selected' : ''}>Finish by date</option>
                <option value="none" ${target.type === 'none' ? 'selected' : ''}>No deadline</option>
              </select>
            </label>
          </div>
          <div class="plans-editor-section" id="edit-pace-value">
            ${target.type === 'days' ? `<label class="pw-check-label">Days: <input type="number" id="edit-pace-days" value="${target.value || 365}" min="1" class="pw-input-inline"></label>` : ''}
            ${target.type === 'date' ? `<label class="pw-check-label">Target date: <input type="date" id="edit-pace-date" value="${target.value || nextYear}" class="pw-input" style="max-width:200px"></label>` : ''}
          </div>
          <div class="plans-editor-section">
            <label class="pw-check-label">Reading days
              <div class="pw-days" style="margin-top:4px">
                ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((n, i) =>
                  `<label class="pw-day-label"><input type="checkbox" class="pw-day-cb" value="${i}" ${(gen.reading_days || []).includes(i) ? 'checked' : ''}> ${n}</label>`
                ).join('')}
              </div>
            </label>
          </div>
          <div class="plans-editor-section">
            <label class="pw-check-label">Recalculation
              <select id="edit-recalc" class="pw-input" style="max-width:200px">
                <option value="keep_deadline" ${gen.recalculation === 'keep_deadline' ? 'selected' : ''}>Keep deadline</option>
                <option value="keep_workload" ${gen.recalculation === 'keep_workload' ? 'selected' : ''}>Keep workload</option>
                <option value="ask" ${gen.recalculation === 'ask' ? 'selected' : ''}>Ask me</option>
              </select>
            </label>
          </div>
          <div class="plans-editor-section">
            <label class="pw-check-label">Max minutes/day: <input type="number" id="edit-max-min" value="${wl.max_minutes || 25}" min="5" max="120" class="pw-input-inline"></label>
          </div>
        </div>
        <div class="pw-footer">
          <button class="pw-btn pw-btn-secondary" id="edit-cancel-btn">Cancel</button>
          <button class="pw-btn pw-btn-primary" id="edit-save-btn">Save Changes</button>
        </div>
      </div>
    `;

    this._showView('wizard');
    document.getElementById('plans-title').textContent = 'Edit Plan';

    document.getElementById('edit-pace')?.addEventListener('change', (e) => {
      const val = e.target.value;
      const container = document.getElementById('edit-pace-value');
      if (val === 'days') container.innerHTML = `<label class="pw-check-label">Days: <input type="number" id="edit-pace-days" value="${target.value || 365}" min="1" class="pw-input-inline"></label>`;
      else if (val === 'date') container.innerHTML = `<label class="pw-check-label">Target date: <input type="date" id="edit-pace-date" value="${target.value || nextYear}" class="pw-input" style="max-width:200px"></label>`;
      else container.innerHTML = '';
    });

    document.getElementById('edit-cancel-btn').addEventListener('click', () => this._openPlanDetail(planId));
    document.getElementById('edit-save-btn').addEventListener('click', async () => {
      const paceType = document.getElementById('edit-pace').value;
      let newTarget;
      if (paceType === 'days') newTarget = { type: 'days', value: parseInt(document.getElementById('edit-pace-days')?.value, 10) || 365 };
      else if (paceType === 'date') newTarget = { type: 'date', value: document.getElementById('edit-pace-date')?.value || nextYear };
      else newTarget = { type: 'none' };

      const dayCbs = document.querySelectorAll('.pw-day-cb:checked');
      const readingDays = Array.from(dayCbs).map(cb => parseInt(cb.value, 10));
      const recalculation = document.getElementById('edit-recalc').value;
      const maxMin = parseInt(document.getElementById('edit-max-min')?.value, 10) || 25;

      const updates = {
        generator: {
          ...gen,
          target: newTarget,
          reading_days: readingDays,
          recalculation,
          workload_limits: { ...wl, max_minutes: maxMin }
        },
        progress: {
          ...plan.progress,
          schedule: window.PlanScheduler.generateSchedule({
            ...plan,
            generator: { ...gen, target: newTarget, reading_days: readingDays }
          })
        }
      };

      this._state.updatePlan(planId, updates);
      this._openPlanDetail(planId);
    });
  }

  async open() {
    if (this._open) return;
    this._open = true;
    this._compressed = false;
    this._stopReadingMode();
    const panel = document.getElementById('plans-panel');
    panel.classList.remove('hidden', 'compressed');
    await this._showView('list');
    const firstFocus = panel.querySelector('button, [href], input, select, textarea');
    if (firstFocus) setTimeout(() => firstFocus.focus(), 50);
  }

  close() {
    if (!this._open) return;
    this._open = false;
    this._compressed = false;
    this._stopReadingMode();
    const panel = document.getElementById('plans-panel');
    panel.classList.remove('compressed');
    panel.classList.add('hidden');
  }

  _today() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  _addDays(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
};
