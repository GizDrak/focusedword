
const _NI = {
  plus: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  note: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  undo: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
  redo: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  cat: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
  tag: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
};

const _CAT_COLORS = ['#D0A96C', '#4A90D9', '#5BAA6A', '#8B5CF6', '#E879A8', '#E54D4D', '#E8944A', '#3BB5A0', '#6366F1', '#94A3B8'];

class NotesUI {
  constructor(bridge) {
    this.bridge = bridge;
    this._state = bridge.state;
    this._editor = null;
    this._activeNoteId = null;
    this._dirty = false;
    this._open = false;
    this._compressed = false;
    this._cleanupFocus = null;
    this._sortMode = 'updated';
    this._pendingData = null;
    this._titleInput = null;
    this._autoSaveTimer = null;
    this._openSwipeRow = null;
    this._lastToolTouch = 0;
    this._undoToastTimer = null;
    this._undoToastEl = null;
    this._tagMenuOpen = false;
    this._tagContextPill = null;
    this._tagDismissHandlers = null;
    this._readOnly = true;
  }

  init() {
    this._createPanel();
    this._createEditor();
    this._bindEvents();
    this._setupAutoCompress();
    this._setupKeyboardHandler();
  }

  _confirmDialog(options) {
    if (window.dialogService) return window.dialogService.confirm(options);
    return Promise.resolve(window.confirm(options.message || ''));
  }

  _promptDialog(options) {
    if (window.dialogService) return window.dialogService.prompt(options);
    return Promise.resolve(window.prompt(options.message || '', options.defaultValue || ''));
  }

  _createPanel() {
    const panel = document.createElement('div');
    panel.id = 'notes-panel';
    panel.className = 'notes-panel hidden';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Notes');
    panel.innerHTML = `
      <div class="notes-header">
        <div class="header-bar" data-bar="list">
          <h2 id="notes-title">Notes</h2>
          <div class="notes-header-actions">
            <button class="icon-btn notes-add-btn" title="Add Note" aria-label="Add Note">${_NI.plus}</button>
            <button class="icon-btn notes-close-btn" title="Close" aria-label="Close Notes">✕</button>
          </div>
        </div>
        <div class="header-bar hidden" data-bar="editor">
          <button class="ne-back-btn" id="ne-back-btn" aria-label="Back to list">${_NI.back}</button>
          <button class="ne-icon-btn notes-add-btn" title="Add Note" aria-label="Add Note">${_NI.plus}</button>
          <input type="text" id="ne-title-input" class="ne-title-input" placeholder="Note title..." maxlength="200">
          <span class="ne-cat-btn-wrap">
            <select id="ne-category-select" class="ne-category-select">
              <option value="">Uncategorized</option>
            </select>
            <span class="ne-cat-label" id="ne-cat-label"></span>
          </span>
          <button class="ne-icon-btn ne-edit-toggle-btn" id="ne-edit-toggle-btn" title="Edit">${_NI.pencil}</button>
          <button class="ne-icon-btn ne-delete-btn" id="ne-delete-btn" title="Delete">${_NI.trash}</button>
          <button class="icon-btn notes-close-btn" title="Close" aria-label="Close Notes">✕</button>
        </div>
      </div>
      <div class="notes-body" id="notes-body">
        <div class="notes-list-view" id="notes-list-view">
          <div class="notes-sort-bar" id="notes-sort-bar">
            <div class="nsb-left">
              <button class="sort-btn active" data-sort="updated">Updated</button>
              <button class="sort-btn" data-sort="created">Created</button>
              <button class="sort-btn" data-sort="title">Title A-Z</button>
            </div>
            <div class="nsb-right">
              <select id="ne-cat-filter" class="ne-cat-filter">
                <option value="">All Categories</option>
              </select>
              <button class="nsb-icon-btn" id="nc-manage-btn" title="Manage Categories">${_NI.cat}</button>
              <button class="nsb-icon-btn" id="nts-open-btn" title="Browse tags">${_NI.tag}</button>
            </div>
          </div>
          <div class="notes-list" id="notes-list"></div>
          <div class="notes-empty hidden" id="notes-empty">
            <div class="notes-empty-icon">${_NI.note.replace('width="18" height="18"', 'width="40" height="40"')}</div>
            <p class="notes-empty-text">No notes yet.<br>Select a verse and tap to create one.</p>
          </div>
          <div class="notes-loading hidden" id="notes-loading">
            <div class="notes-skeleton"></div>
            <div class="notes-skeleton"></div>
            <div class="notes-skeleton"></div>
          </div>
        </div>
        <div class="notes-editor-view hidden" id="notes-editor-view">
          <div class="ne-tag-chips" id="ne-tag-chips"></div>
          <span class="ne-save-status" id="ne-save-status"></span>
          <div class="notes-editor" id="notes-editor"></div>
        </div>
        <div class="notes-toolbar hidden" id="notes-toolbar"></div>
        <div class="notes-categories-view hidden" id="notes-categories-view">
          <div class="nc-header">
            <button class="ne-back-btn nc-back-btn" id="nc-back-btn">${_NI.back}</button>
            <h3>Categories</h3>
            <button class="nc-add-btn" id="nc-add-btn">+ Add</button>
          </div>
          <div class="nc-list" id="nc-list"></div>
        </div>
        <div class="notes-tags-view hidden" id="notes-tags-view">
          <div class="nt-header">
            <button class="ne-back-btn nt-back-btn" id="nt-back-btn">${_NI.back}</button>
            <h3>Tags</h3>
          </div>
          <div class="nt-search">
            <input type="text" id="nt-filter-input" class="nt-filter-input" placeholder="Filter tags..." maxlength="100">
          </div>
          <div class="nt-list" id="nt-list"></div>
        </div>
        <div class="notes-tag-search hidden" id="notes-tag-search">
          <div class="nts-header">
            <button class="ne-back-btn nts-back-btn" id="nts-back-btn">${_NI.back}</button>
            <h3 id="nts-title" class="nts-title">Tag</h3>
          </div>
          <div class="nts-results" id="nts-results"></div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    if (window.UISkins) window.UISkins.decorate(panel, 'notes-panel');
  }

  _createEditor() {
    this._titleInput = document.getElementById('ne-title-input');
    const editorEl = document.getElementById('notes-editor');
    this._editor = new SimpleEditor({
      element: editorEl,
      content: '',
      attributes: {
        class: 'notes-editor',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Note editor'
      },
      onUpdate: () => { this._dirty = true; this._scheduleAutoSave(); }
    });
    editorEl.addEventListener('focus', () => {
      setTimeout(() => {
        const sel = window.getSelection();
        if (sel.rangeCount) {
          sel.getRangeAt(0).startContainer.parentElement?.scrollIntoView?.({ block: 'nearest' });
        }
      }, 200);
    });
    this._scrollRAF = null;
    editorEl.addEventListener('input', () => {
      if (this._scrollRAF) cancelAnimationFrame(this._scrollRAF);
      this._scrollRAF = requestAnimationFrame(() => {
        if (editorEl.scrollHeight - editorEl.scrollTop - editorEl.clientHeight < 150) {
          editorEl.scrollTop = editorEl.scrollHeight;
        }
      });
    });
    this._buildToolbar();

    /* ---------- Tag pill long-press / right-click context menu ---------- */

    let longPressTimer = null;
    const TAG_LONG_PRESS_MS = 500;

    editorEl.addEventListener('touchstart', (e) => {
      const pill = e.target.closest('.tag-pill');
      if (!pill || !this._editor || this._readOnly) return;
      this._tagContextPill = pill;
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        e.preventDefault();
        const t = e.changedTouches[0] || e.touches[0];
        this._showTagContextMenu(pill, t.clientX, t.clientY);
      }, TAG_LONG_PRESS_MS);
    }, { passive: false });

    editorEl.addEventListener('touchmove', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }, { passive: true });

    editorEl.addEventListener('touchend', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }, { passive: true });

    editorEl.addEventListener('contextmenu', (e) => {
      const pill = e.target.closest('.tag-pill');
      if (!pill || !this._editor || this._readOnly) return;
      e.preventDefault();
      this._showTagContextMenu(pill, e.clientX, e.clientY);
    });
  }

  _buildToolbar() {
    const toolbar = document.getElementById('notes-toolbar');
    const items = [
      { method: 'undo', label: _NI.undo, title: 'Undo' },
      { method: 'redo', label: _NI.redo, title: 'Redo' },
      { type: 'sep' },
      { method: 'toggleBold', label: '<b>B</b>', title: 'Bold' },
      { method: 'toggleItalic', label: '<i>I</i>', title: 'Italic' },
      { method: 'insertTagAtCursor', label: '#', title: 'Insert Tag' },
      { type: 'sep' },
      { method: 'toggleHeading', args: 1, label: 'H1', title: 'Heading 1' },
      { method: 'toggleHeading', args: 2, label: 'H2', title: 'Heading 2' },
      { method: 'toggleHeading', args: 3, label: 'H3', title: 'Heading 3' },
      { type: 'sep' },
      { method: 'toggleBulletList', label: '≡', title: 'Bullet List' },
      { method: 'toggleOrderedList', label: '1.', title: 'Numbered List' },
      { method: 'toggleBlockquote', label: '“', title: 'Quote' },
      { type: 'sep' },
      { method: 'insertHorizontalRule', label: '—', title: 'Horizontal Rule' },
      { type: 'sep' },
      { method: 'clearFormatting', label: '✕', title: 'Clear Formatting' }
    ];
    for (const item of items) {
      if (item.type === 'sep') {
        const sep = document.createElement('span');
        sep.className = 'ne-tb-sep';
        toolbar.appendChild(sep);
        continue;
      }
      const btn = document.createElement('button');
      btn.innerHTML = item.label;
      btn.title = item.title;
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
      });
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (Date.now() - this._lastToolTouch < 300) return;
        if (item.args !== undefined) this._editor[item.method](item.args);
        else this._editor[item.method]();
      });
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this._lastToolTouch = Date.now();
        if (item.args !== undefined) this._editor[item.method](item.args);
        else this._editor[item.method]();
      }, { passive: false });
      toolbar.appendChild(btn);
    }
  }

  _bindEvents() {
    this._els = {
      listView: document.getElementById('notes-list-view'),
      editorView: document.getElementById('notes-editor-view'),
      categoriesView: document.getElementById('notes-categories-view'),
      tagsView: document.getElementById('notes-tags-view'),
      header: document.querySelector('.notes-header'),
      listBar: document.querySelector('[data-bar="list"]'),
      editorBar: document.querySelector('[data-bar="editor"]'),
      list: document.getElementById('notes-list'),
      empty: document.getElementById('notes-empty'),
      loading: document.getElementById('notes-loading'),
      sortBar: document.getElementById('notes-sort-bar'),
      titleInput: document.getElementById('ne-title-input'),
      categorySelect: document.getElementById('ne-category-select'),
      catLabel: document.getElementById('ne-cat-label'),
      deleteBtn: document.getElementById('ne-delete-btn'),
      backBtn: document.getElementById('ne-back-btn'),
      saveStatus: document.getElementById('ne-save-status'),
      tagChips: document.getElementById('ne-tag-chips'),
      addBtn: document.querySelector('.notes-add-btn'),
      closeBtns: document.querySelectorAll('.notes-close-btn'),
      ncAddBtn: document.getElementById('nc-add-btn'),
      ncList: document.getElementById('nc-list')
    };

    const panelEl = document.getElementById('notes-panel');
    if (panelEl) {
      panelEl.addEventListener('click', (e) => {
        if (this._compressed && this._open && !e.target.closest('.icon-btn')) {
          this.expand();
        }
      });
    }

    document.querySelectorAll('.notes-add-btn').forEach(btn => btn.addEventListener('click', () => this.newNote()));
    this._els.closeBtns.forEach(btn => btn.addEventListener('click', () => this.close()));
    this._els.backBtn.addEventListener('click', () => this._showListView());
    this._els.deleteBtn.addEventListener('click', () => this._deleteCurrentNote());
    const editToggle = document.getElementById('ne-edit-toggle-btn');
    if (editToggle) {
      editToggle.addEventListener('click', (e) => {
        e.preventDefault();
        this._setReadOnly(!this._readOnly);
      });
    }

    this._els.titleInput.addEventListener('input', () => {
      this._dirty = true;
      this._updateTitle(this._els.titleInput.value.trim() || 'New Note');
    });

    this._els.titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._editor?.focus('start');
      }
    });

    this._els.sortBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.sort-btn');
      if (!btn) return;
      this._els.sortBar.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this._sortMode = btn.dataset.sort;
      if (this._renderRAF) cancelAnimationFrame(this._renderRAF);
      this._renderRAF = requestAnimationFrame(() => { this._renderRAF = null; this._renderList(); });
    });

    this._els.categorySelect.addEventListener('change', async () => {
      if (this._els.categorySelect.value === '__add__') {
        const name = await this._promptDialog({
          title: 'New category',
          message: 'Create a category for this note.',
          label: 'Category name',
          required: true,
          requiredMessage: 'Enter a category name.'
        });
        if (name && name.trim()) {
          const color = await this._pickColor(this._nextColor());
          const ns = this.bridge.get('note-store');
          if (ns) {
            ns.createCategory({ name: name.trim(), color: color || null, icon: null });
            this._refreshCategorySelect();
            const cats = ns.getAllCategories();
            const created = cats.find(c => !c.deleted && c.name === name.trim());
            if (created) this._els.categorySelect.value = created.id;
          }
        } else {
          this._els.categorySelect.value = this._activeNoteId
            ? (this.bridge.get('note-store')?.getNoteById(this._activeNoteId)?.categoryId || '')
            : '';
        }
        this._updateCatLabel();
        return;
      }
      this._dirty = true;
      this._updateCatLabel();
    });
    this._els.ncAddBtn.addEventListener('click', () => this._showAddCategory());
    this._els.catFilter = document.getElementById('ne-cat-filter');
    if (this._els.catFilter) {
      this._els.catFilter.addEventListener('change', () => {
        if (this._renderRAF) cancelAnimationFrame(this._renderRAF);
        this._renderRAF = requestAnimationFrame(() => { this._renderRAF = null; this._renderList(); });
      });
    }

    const ncManageBtn = document.getElementById('nc-manage-btn');
    if (ncManageBtn) ncManageBtn.addEventListener('click', () => this.showCategories());
    const tagSearchBtn = document.getElementById('nts-open-btn');
    if (tagSearchBtn) {
      tagSearchBtn.addEventListener('click', () => this.showTags());
    }
    const ncBackBtn = document.getElementById('nc-back-btn');
    if (ncBackBtn) ncBackBtn.addEventListener('click', () => this._showListView());
    const ntsBackBtn = document.getElementById('nts-back-btn');
    if (ntsBackBtn) ntsBackBtn.addEventListener('click', () => this._showListView());
    const ntBackBtn = document.getElementById('nt-back-btn');
    if (ntBackBtn) ntBackBtn.addEventListener('click', () => this._showListView());
    const ntFilterInput = document.getElementById('nt-filter-input');
    if (ntFilterInput) {
      ntFilterInput.addEventListener('input', () => {
        this._renderTagManager(ntFilterInput.value);
      });
      ntFilterInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          ntFilterInput.value = '';
          this._renderTagManager('');
          ntFilterInput.blur();
        }
      });
    }

    const noteStore = this.bridge.get('note-store');
    if (noteStore) {
      this._boundNoteChange = () => {
        if (this._open) {
          this._renderList();
          this._refreshCategorySelect();
          this._refreshCategoryFilter();
        }
      };
      this._boundCategoryChange = () => {
        if (this._open) {
          this._renderList();
          this._refreshCategorySelect();
          this._refreshCategoryFilter();
        }
      };
      noteStore.on('notes-changed', this._boundNoteChange);
      noteStore.on('categories-changed', this._boundCategoryChange);
    }

    document.addEventListener('click', (e) => {
      const ref = e.target.closest('.tag-ref');
      if (ref) {
        const tag = ref.dataset.tag;
        if (tag) {
          e.preventDefault();
          this._openTagSearch(tag.toLowerCase());
        }
        return;
      }
      const pill = e.target.closest('.tag-pill');
      if (pill) {
        if (this._tagMenuOpen) {
          this._tagMenuOpen = false;
          return;
        }
        const tag = pill.dataset.tag;
        if (tag) {
          e.preventDefault();
          this._openTagSearch(tag.toLowerCase());
        }
      }
    });

    if (this._els.list) {
      this._els.list.addEventListener('scroll', () => this._closeOpenSwipe(), { passive: true });
      this._els.list.addEventListener('click', (e) => {
        if (e.target.closest('.note-card-delete-btn, .note-tag-chip')) return;
        const card = e.target.closest('.note-card');
        if (!card) return;
        const swipeable = card.closest('.note-card-swipeable');
        if (swipeable?.dataset.swiped) {
          delete swipeable.dataset.swiped;
          return;
        }
        const row = card.closest('.note-card-row');
        if (!row) return;
        const ns = this.bridge.get('note-store');
        const note = ns?.getNoteById(row.dataset.id);
        if (note) this.loadNote(note);
      });
    }
  }

  _setupAutoCompress() {
    const content = document.getElementById('content');
    if (!content) return;
    content.addEventListener('pointerdown', () => {
      if (this._open) this.compress();
    });
    content.addEventListener('focusin', () => {
      if (this._open) this.compress();
    });
    content.setAttribute('tabindex', '-1');
  }

  _setupKeyboardHandler() {
    const vp = window.visualViewport;
    const editorEl = this._editor?.element || document.getElementById('notes-editor');
    let baselineHeight = window.innerHeight;

    const resetPanel = (panel) => {
      panel.style.height = '';
      panel.style.top = '';
      panel.style.bottom = '';
    };

    const resizePanel = (panel, availableHeight) => {
      if (this._compressed) {
        panel.style.bottom = (window.innerHeight - availableHeight + 50) + 'px';
        panel.style.top = 'auto';
        return;
      }
      const h = Math.min(Math.round(availableHeight * 0.5), 400);
      panel.style.height = h + 'px';
      panel.style.bottom = '0';
      panel.style.top = 'auto';
    };

    const handle = () => {
      if (!this._open) return;
      const panel = document.getElementById('notes-panel');
      if (!panel) return;
      const vh = vp ? vp.height : window.innerHeight;
      const isKeyboardOpen = vh < baselineHeight - 150;
      if (isKeyboardOpen) {
        resizePanel(panel, vh);
      } else {
        resetPanel(panel);
      }
    };

    const onBlur = () => {
      setTimeout(() => {
        const panel = document.getElementById('notes-panel');
        if (!panel) return;
        const vh = vp ? vp.height : window.innerHeight;
        if (vh >= baselineHeight - 150) {
          resetPanel(panel);
        }
      }, 300);
    };

    if (vp) vp.addEventListener('resize', handle);
    window.addEventListener('resize', handle);
    if (editorEl) editorEl.addEventListener('blur', onBlur);

    window.addEventListener('focus', () => {
      baselineHeight = window.innerHeight;
    });
  }

  _showView(view) {
    this._els.listView.classList.toggle('hidden', view !== 'list');
    this._els.editorView.classList.toggle('hidden', view !== 'editor');
    this._els.categoriesView.classList.toggle('hidden', view !== 'categories');
    this._els.tagsView.classList.toggle('hidden', view !== 'tags');
    const ts = document.getElementById('notes-tag-search');
    if (ts) ts.classList.toggle('hidden', view !== 'tag-search');
    const showEditorBar = view === 'editor';
    this._els.listBar?.classList.toggle('hidden', showEditorBar);
    this._els.editorBar?.classList.toggle('hidden', !showEditorBar);
    const tb = document.getElementById('notes-toolbar');
    if (tb) tb.classList.toggle('hidden', view !== 'editor');
  }

  _showListView() {
    if (this._dirty) this._saveCurrentNote();
    this.expand();
    this._activeNoteId = null;
    this._showView('list');
    this._renderList();
    this._updateTitle();
    this._updateAddBtn();
  }

  _showEditorView() { this._showView('editor'); }

  async open() {
    const panel = document.getElementById('notes-panel');
    if (!panel) return;
    await this._state.ready();
    this._open = true;
    panel.classList.remove('hidden');
    panel.classList.remove('compressed');
    this._compressed = false;
    this._renderList();
    this._showView('list');
    this._updateTitle();
    this._refreshCategorySelect();
    this._refreshCategoryFilter();
    const firstFocus = panel.querySelector('button, [href], input, select, textarea');
    if (firstFocus) setTimeout(() => firstFocus.focus(), 50);
  }

  close() {
    const panel = document.getElementById('notes-panel');
    if (!panel) return;
    if (this._dirty) this._saveCurrentNote();
    this._open = false;
    this._activeNoteId = null;
    panel.classList.add('hidden');
    this._editor?.blur();
  }

  compress() {
    const panel = document.getElementById('notes-panel');
    if (!panel || !this._open) return;
    this._compressed = true;
    panel.classList.add('compressed');
    this._els.listBar?.classList.remove('hidden');
    this._els.editorBar?.classList.add('hidden');
    this._updateAddBtn();
  }

  expand() {
    const panel = document.getElementById('notes-panel');
    if (!panel || !this._open) return;
    this._compressed = false;
    panel.classList.remove('compressed');
    if (this._inEditorView()) {
      this._els.listBar?.classList.add('hidden');
      this._els.editorBar?.classList.remove('hidden');
    }
  }

  _inEditorView() {
    return this._els.editorView && !this._els.editorView.classList.contains('hidden');
  }

  newNote(data) {
    if (this._dirty) this._saveCurrentNote();
    const placeholder = data?.content || '';

    if (this._activeNoteId && placeholder) {
      const noteStore = this.bridge.get('note-store');
      if (noteStore) {
        const note = noteStore.getNoteById(this._activeNoteId);
        if (note) {
          const existingMd = note.content || '';
          const updatedMd = existingMd + '\n\n' + placeholder;
          this._editor?.setContent(this._markdownToHtml(updatedMd));
          this._dirty = true;
          this.expand();
          this._showEditorView();
          this._editor?.focus('end');
          this._showSaveStatus('Ready');
          this._updateAddBtn();
          return;
        }
      }
    }

    this._activeNoteId = null;
    this._pendingData = data || null;
    this._open = true;
    this._setReadOnly(false);
    const panel = document.getElementById('notes-panel');
    panel.classList.remove('hidden');
    if (placeholder) {
      this._editor?.setContent(this._markdownToHtml(placeholder));
    } else {
      this._editor?.setContent('');
    }
    this._dirty = !!placeholder;
    this._showEditorView();
    this.expand();
    this._titleInput.value = data?.title || '';
    this._els.categorySelect.value = '';
    this._updateCatLabel();
    if (this._els.tagChips) this._els.tagChips.innerHTML = '';
    this._updateTitle('New Note');
    this._showSaveStatus('Ready');
    this._updateAddBtn();
    if (placeholder) {
      this._editor?.focus('end');
    } else {
      this._els.titleInput.focus();
    }
  }

  loadNote(note, focusTag) {
    if (!this._open) {
      const panel = document.getElementById('notes-panel');
      if (panel) panel.classList.remove('hidden');
      this._open = true;
    }
    this._activeNoteId = note.id;
    this._titleInput.value = note.title || '';
    this._refreshCategorySelect();
    this._els.categorySelect.value = note.categoryId || '';
    this._updateCatLabel();
    this._renderTagChips(note.tags);
    this._editor?.setContent(this._markdownToHtml(note.content || ''));
    this._setReadOnly(true);
    this._dirty = false;
    this._showEditorView();
    this.expand();
    this._updateTitle(note.title || '');
    this._showSaveStatus('Loaded');
    this._updateAddBtn();
    if (focusTag) {
      setTimeout(() => this._editor?.setCursorAtTag(focusTag), 0);
    }
  }

  _renderList() {
    this._closeOpenSwipe();
    const noteStore = this.bridge.get('note-store');
    let notes = noteStore ? [...noteStore.getAllNotes()] : [];
    this._els.loading.classList.add('hidden');
    const catFilter = this._els.catFilter;
    const catVal = catFilter?.value;
    if (catVal) {
      notes = notes.filter(n => n.categoryId === catVal);
    }
    if (notes.length === 0) {
      this._els.list.classList.add('hidden');
      this._els.empty.classList.remove('hidden');
      return;
    }
    this._els.empty.classList.add('hidden');
    this._els.list.classList.remove('hidden');
    notes = this._sortNotes(notes);
    const frag = document.createDocumentFragment();
    for (const n of notes) {
      const temp = document.createElement('div');
      temp.innerHTML = this._renderNoteCard(n);
      while (temp.firstChild) frag.appendChild(temp.firstChild);
    }
    this._els.list.innerHTML = '';
    this._els.list.appendChild(frag);
    this._els.list.querySelectorAll('.note-card-row').forEach(row => {
      this._initSwipe(row);
    });
    this._wireTagChips(this._els.list);
  }

  _sortNotes(notes) {
    const sorted = [...notes];
    switch (this._sortMode) {
      case 'created': sorted.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); break;
      case 'title': sorted.sort((a, b) => (a.title || '').localeCompare(b.title || '')); break;
      default: sorted.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
    }
    return sorted;
  }

  _renderNoteCard(note) {
    const date = new Date(note.updated_at || note.createdAt || Date.now());
    const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const safeTags = (note.tags || []).map(t => {
      const st = window.UrlValidator.safeTag(t);
      const at = window.UrlValidator.escapeAttr(t);
      return `<span class="note-tag-chip" data-tag="${at}">#${st}</span>`;
    }).join('');
    const excerpt = note.excerpt || '';
    const title = note.title || 'Untitled';
    const escapedTitle = window.HTMLEscape(title);
    const escapedExcerpt = window.HTMLEscape(excerpt);
    const categoryName = note.categoryId ? window.HTMLEscape(this._getCategoryName(note.categoryId)) : '';
    const categoryColor = note.categoryId ? this._getCategoryColor(note.categoryId) : '';
    const safeColor = window.UrlValidator.VALID_CATEGORY_COLORS.has(categoryColor) ? categoryColor : '';
    const borderStyle = safeColor ? ` style="border-left:3px solid ${safeColor};"` : '';
    return `
      <div class="note-card-row" data-id="${note.id}">
        <div class="note-card-swipeable">
          <div class="note-card" role="button" tabindex="0" aria-label="${escapedTitle}" data-id="${note.id}"${borderStyle}>
            <div class="note-card-title">${escapedTitle}</div>
            ${excerpt ? `<div class="note-card-excerpt">${escapedExcerpt}</div>` : ''}
            <div class="note-card-meta">
              <span class="note-card-date">${dateStr}</span>
              ${note.categoryId ? `<span class="note-card-category">${safeColor ? `<span class="cat-color-dot" style="background:${safeColor};"></span>` : ''}${categoryName}</span>` : ''}
              ${safeTags ? `<span class="note-card-tags">${safeTags}</span>` : ''}
            </div>
          </div>
        </div>
        <button class="note-card-delete-btn" data-id="${note.id}">${_NI.trash} Delete</button>
      </div>
    `;
  }

  _initSwipe(row) {
    const swipeEl = row.querySelector('.note-card-swipeable');
    const deleteBtn = row.querySelector('.note-card-delete-btn');
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
      this._deleteSwipeNote(row.dataset.id);
    });
  }

  _closeOpenSwipe() {
    if (this._openSwipeRow) {
      const s = this._openSwipeRow.querySelector('.note-card-swipeable');
      if (s) {
        s.style.transition = 'transform 0.2s ease';
        s.style.transform = 'translateX(0)';
      }
      delete this._openSwipeRow.dataset.swiped;
      this._openSwipeRow = null;
    }
  }

  _deleteSwipeNote(id) {
    this._closeOpenSwipe();
    const ns = this.bridge.get('note-store');
    if (!ns) return;
    const note = ns.getNoteById(id);
    if (!note) return;
    const title = window.HTMLEscape(note.title || 'Untitled');
    ns.deleteNote(id);
    this._showUndoToast(
      'Deleted "' + title + '"',
      () => { ns.updateNote(id, { deleted: false }); this._renderList(); }
    );
  }

  _showUndoToast(msg, onUndo) {
    if (this._undoToastTimer) {
      clearTimeout(this._undoToastTimer);
      this._undoToastTimer = null;
    }
    if (this._undoToastEl) {
      this._undoToastEl.remove();
      this._undoToastEl = null;
    }
    const el = document.createElement('div');
    el.className = 'undo-toast';
    el.innerHTML = '<span class="undo-toast-msg">' + msg + '</span><button class="undo-toast-btn">Undo</button>';
    el.querySelector('.undo-toast-btn').addEventListener('click', () => {
      if (this._undoToastTimer) {
        clearTimeout(this._undoToastTimer);
        this._undoToastTimer = null;
      }
      onUndo();
      el.remove();
      this._undoToastEl = null;
    });
    document.body.appendChild(el);
    this._undoToastEl = el;
    this._undoToastTimer = setTimeout(() => {
      el.remove();
      this._undoToastEl = null;
      this._undoToastTimer = null;
    }, 5000);
  }

  _getCategoryName(id) {
    const ns = this.bridge.get('note-store');
    if (!ns) return '';
    const c = ns.getCategoryById(id);
    return c ? c.name : '';
  }

  _getCategoryColor(id) {
    const ns = this.bridge.get('note-store');
    if (!ns) return '';
    const c = ns.getCategoryById(id);
    return c ? c.color || '' : '';
  }

  _nextColor() {
    const ns = this.bridge.get('note-store');
    if (!ns) return _CAT_COLORS[0];
    const cats = ns.getAllCategories().filter(c => !c.deleted && c.color);
    const used = new Set(cats.map(c => c.color));
    return _CAT_COLORS.find(c => !used.has(c)) || _CAT_COLORS[cats.length % _CAT_COLORS.length];
  }

  _pickColor(currentColor) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'nc-color-overlay';
      overlay.innerHTML = `
        <div class="nc-color-picker">
          <div class="nc-color-picker-title">Choose a color</div>
          <div class="nc-color-picker-swatches">
            ${_CAT_COLORS.map((c, i) => `<button class="nc-color-swatch${c === currentColor ? ' selected' : ''}" data-color="${c}" style="background:${c};" aria-label="${c === currentColor ? 'Selected: ' : ''}Color ${i + 1}"></button>`).join('')}
          </div>
          <button class="nc-color-picker-cancel">Cancel</button>
        </div>`;
      const close = result => { overlay.remove(); resolve(result); };
      overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
      overlay.querySelectorAll('.nc-color-swatch').forEach(btn => {
        btn.addEventListener('click', () => close(btn.dataset.color));
      });
      overlay.querySelector('.nc-color-picker-cancel').addEventListener('click', () => close(null));
      document.body.appendChild(overlay);
    });
  }

  _renderTagChips(tags) {
    if (!this._els.tagChips) return;
    if (!tags || !tags.length) { this._els.tagChips.innerHTML = ''; return; }
    this._els.tagChips.innerHTML = tags.map(t => {
      const st = window.UrlValidator.safeTag(t);
      return `<span class="note-tag-chip">#${st}</span>`;
    }).join('');
  }

  _refreshCategorySelect() {
    const ns = this.bridge.get('note-store');
    if (!ns) return;
    const cats = ns.getAllCategories();
    const currentVal = this._els.categorySelect.value;
    this._els.categorySelect.innerHTML = '<option value="">Uncategorized</option>' +
      cats.filter(c => !c.deleted).map(c => `<option value="${c.id}" data-color="${c.color || ''}">${window.HTMLEscape(c.name)}</option>`).join('') +
      '<option value="__add__">+ New Category</option>';
    if (currentVal && cats.some(c => c.id === currentVal && !c.deleted)) {
      this._els.categorySelect.value = currentVal;
    }
    this._updateCatLabel();
  }

  _refreshCategoryFilter() {
    const ns = this.bridge.get('note-store');
    const filter = this._els.catFilter;
    if (!ns || !filter) return;
    const cats = ns.getAllCategories();
    const currentVal = filter.value;
    filter.innerHTML = '<option value="">All Categories</option>' +
      cats.filter(c => !c.deleted).map(c => `<option value="${c.id}">${window.HTMLEscape(c.name)}</option>`).join('');
    if (currentVal && cats.some(c => c.id === currentVal && !c.deleted)) {
      filter.value = currentVal;
    }
  }

  _updateCatLabel() {
    const sel = this._els.categorySelect;
    const label = this._els.catLabel;
    if (!label) return;
    const val = sel?.value;
    if (val) {
      const opt = sel?.querySelector(`option[value="${val}"]`);
      const name = opt ? opt.textContent : '';
      const color = opt ? opt.dataset.color : '';
      const safeColor = window.UrlValidator.VALID_CATEGORY_COLORS.has(color) ? color : '';
      label.innerHTML = safeColor
        ? `<span class="cat-color-dot" style="background:${safeColor};"></span>${window.HTMLEscape(name)}`
        : window.HTMLEscape(name);
      label.classList.add('has-cat');
    } else {
      label.innerHTML = _NI.cat;
      label.classList.remove('has-cat');
    }
  }

  _scheduleAutoSave() {
    if (this._autoSaveTimer) clearTimeout(this._autoSaveTimer);
    if (!this._activeNoteId) {
      this._saveCurrentNote();
      return;
    }
    const ns = this.bridge.get('note-store');
    if (!ns) return;
    const content = this._htmlToMarkdown(this._editor?.getContent?.() || '');
    const title = this._titleInput?.value?.trim() || this._extractTitle(content);
    const categoryId = this._els.categorySelect?.value || null;
    ns.scheduleAutoSave(this._activeNoteId, { content, title, categoryId }, () => {
      this._dirty = false;
      this._showSaveStatus('Saved');
    });
  }

  _showSaveStatus(msg) { this._els.saveStatus.textContent = msg; this._els.saveStatus.className = 'ne-save-status'; }

  _saveCurrentNote() {
    if (this._autoSaveTimer) { clearTimeout(this._autoSaveTimer); this._autoSaveTimer = null; }
    if (!this._dirty) return;
    const noteStore = this.bridge.get('note-store');
    if (!noteStore) return;
    this._showSaveStatus('Saving…');
    let content = this._editor?.getContent?.() || '';
    content = this._htmlToMarkdown(content);
    const title = this._titleInput?.value?.trim() || this._extractTitle(content);
    const categoryId = this._els.categorySelect?.value || null;
    if (this._activeNoteId) {
      noteStore.flushAutoSave(this._activeNoteId, { content, title, categoryId });
    } else {
      const created = noteStore.createNote({ title, content, categoryId });
      if (created) {
        this._activeNoteId = created.id;
        this._updateAddBtn();
      }
    }
    this._dirty = false;
    this._updateTitle(title);
    this._showSaveStatus('Saved');
  }

  async _deleteCurrentNote() {
    if (!this._activeNoteId) return;
    const confirmed = await this._confirmDialog({
      title: 'Delete note',
      message: 'Delete this note? This action cannot be undone.',
      confirmLabel: 'Delete Note',
      danger: true
    });
    if (!confirmed) return;
    const noteStore = this.bridge.get('note-store');
    if (!noteStore) return;
    noteStore.deleteNote(this._activeNoteId);
    this._activeNoteId = null;
    this._dirty = false;
    this._showListView();
  }

  async _showAddCategory() {
    const name = await this._promptDialog({
      title: 'New category',
      message: 'Create a category for organizing notes.',
      label: 'Category name',
      required: true,
      requiredMessage: 'Enter a category name.'
    });
    if (!name || !name.trim()) return;
    const color = await this._pickColor(this._nextColor());
    const ns = this.bridge.get('note-store');
    if (!ns) return;
    ns.createCategory({ name: name.trim(), color: color || null, icon: null });
    this._refreshCategorySelect();
    this._renderCategoryManager();
  }

  _renderCategoryManager() {
    const ns = this.bridge.get('note-store');
    if (!ns) return;
    const cats = ns.getAllCategories().filter(c => !c.deleted);
    if (!cats.length) { this._els.ncList.innerHTML = '<p class="nc-empty">No categories yet.</p>'; return; }
    this._els.ncList.innerHTML = cats.map((c, i) => `
      <div class="nc-item" data-id="${c.id}">
        <span class="nc-color-dot" data-index="${i}" style="background:${c.color || 'var(--border)'};"></span>
        <span class="nc-name">${window.HTMLEscape(c.name)}</span>
        <div class="nc-actions">
          <button class="nc-rename-btn" data-index="${i}">${_NI.pencil}</button>
          <button class="nc-delete-btn" data-index="${i}">${_NI.trash}</button>
        </div>
      </div>
    `).join('');
    this._els.ncList.querySelectorAll('.nc-color-dot').forEach(dot => {
      dot.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = parseInt(dot.dataset.index);
        const cat = cats[idx];
        if (!cat) return;
        const color = await this._pickColor(cat.color || '');
        if (color !== null && color !== (cat.color || '')) {
          ns.updateCategory(cat.id, { color });
          this._refreshCategorySelect();
          this._renderCategoryManager();
        }
      });
    });
    this._els.ncList.querySelectorAll('.nc-rename-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        const cat = cats[idx];
        if (!cat) return;
        const name = await this._promptDialog({
          title: 'Rename category',
          message: 'Choose a new name for this category.',
          label: 'Category name',
          defaultValue: cat.name,
          required: true,
          requiredMessage: 'Enter a category name.'
        });
        if (name && name.trim()) {
          ns.updateCategory(cat.id, { name: name.trim() });
          this._refreshCategorySelect();
          this._renderCategoryManager();
        }
      });
    });
    this._els.ncList.querySelectorAll('.nc-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        const cat = cats[idx];
        if (!cat) return;
        const confirmed = await this._confirmDialog({
          title: 'Delete category',
          message: `Delete category "${cat.name}"? Notes will become uncategorized.`,
          confirmLabel: 'Delete Category',
          danger: true
        });
        if (!confirmed) return;
        ns.deleteCategory(cat.id);
        this._refreshCategorySelect();
        this._renderCategoryManager();
      });
    });
  }

  showCategories() {
    this._showView('categories');
    this._renderCategoryManager();
    this._updateTitle('Categories');
  }

  _updateTitle(title) {
    const el = document.getElementById('notes-title');
    if (!el) return;
    el.textContent = title || (this._activeNoteId ? '' : 'Notes');
  }

  _updateAddBtn() {
    document.querySelectorAll('.notes-add-btn').forEach(btn => {
      btn.classList.toggle('hidden', !!this._activeNoteId);
    });
  }

  _setReadOnly(flag) {
    this._readOnly = flag;
    this._editor?.setReadOnly(flag);
    const tb = document.getElementById('notes-toolbar');
    if (tb) tb.classList.toggle('hidden', flag);
    const btn = document.getElementById('ne-edit-toggle-btn');
    if (btn) {
      btn.title = flag ? 'Edit' : 'Done';
      btn.innerHTML = flag ? _NI.pencil : _NI.check;
    }
  }

  _extractTitle(content) {
    if (!content) return '';
    const firstLine = content.trim().split('\n')[0];
    return firstLine.replace(/^#+\s*/, '').slice(0, 200) || '';
  }

  /* ---------- Tags View ---------- */

  showTags() {
    this._showView('tags');
    this._updateTitle('Tags');
    const input = document.getElementById('nt-filter-input');
    if (input) { input.value = ''; }
    this._renderTagManager('');
    if (!this._state._tagCountCache) {
      this._state.rebuildTagCountCache().then(() => {
        this._renderTagManager(document.getElementById('nt-filter-input')?.value || '');
      });
    }
  }

  _renderTagManager(filterText) {
    const cache = this._state._tagCountCache;
    const container = document.getElementById('nt-list');
    if (!container) return;

    if (!cache) {
      container.innerHTML = '<div class="nt-indexing"><div class="nt-indexing-spinner"></div><p>Indexing tags&hellip;</p></div>';
      return;
    }

    let tags = Object.keys(cache).sort((a, b) => a.localeCompare(b));
    if (filterText) {
      const lower = filterText.toLowerCase();
      tags = tags.filter(t => t.toLowerCase().includes(lower));
    }

    if (!tags.length) {
      container.innerHTML = '<p class="nt-empty">' + (filterText ? 'No tags match your filter.' : 'No tags yet. Add #tag to notes, highlights, or bookmarks.') + '</p>';
      return;
    }

    container.innerHTML = tags.map(tag =>
      '<div class="nt-item" data-tag="' + window.HTMLEscape(tag) + '">' +
        '<span class="nt-tag-name">#' + window.HTMLEscape(tag) + '</span>' +
        '<span class="nt-tag-count">' + cache[tag] + ' item' + (cache[tag] !== 1 ? 's' : '') + '</span>' +
      '</div>'
    ).join('');

    container.querySelectorAll('.nt-item').forEach(el => {
      el.addEventListener('click', () => {
        this._openFullTagSearch(el.dataset.tag);
      });
    });
  }

  /* ---------- Tag Search (progress bar) ---------- */

  async _openTagSearch(tag) {
    if (this._dirty) this._saveCurrentNote();
    await this._state.ready();
    this._searchByTag(tag);
  }

  _searchByTag(tag) {
    const results = window.TagSearch.search(tag, this.bridge);
    this._showTagResults(results);
  }

  _showTagResults(results) {
    const bar = document.getElementById('tag-results-bar');
    const progress = document.getElementById('verse-progress');
    if (!bar || !progress) return;

    let bodyHtml = '';
    const tagName = results.tag || '';

    /* Notes — max 3, sorted by updated_at */
    if (results.notes.length) {
      const sorted = [...results.notes].sort((a, b) => ((b.updated_at || b.createdAt || 0) - (a.updated_at || a.createdAt || 0)));
      const preview = sorted.slice(0, 3);
      bodyHtml += '<div class="trb-group"><div class="trb-group-title">Notes (' + preview.length + (sorted.length > 3 ? ' of ' + sorted.length : '') + ')</div>';
      for (const note of preview) {
        bodyHtml += '<div class="trb-item trb-note" data-id="' + note.id + '">' +
          '<div class="trb-item-title">' + window.HTMLEscape(note.title || 'Untitled') + '</div>' +
          (note.excerpt ? '<div class="trb-item-excerpt">' + window.HTMLEscape(note.excerpt) + '</div>' : '') + '</div>';
      }
      bodyHtml += '</div>';
    }

    /* Highlights — max 3, sorted by createdAt */
    if (results.highlights.length) {
      const sorted = [...results.highlights].sort((a, b) => ((b.createdAt || 0) - (a.createdAt || 0)));
      const preview = sorted.slice(0, 3);
      bodyHtml += '<div class="trb-group"><div class="trb-group-title">Highlights (' + preview.length + (sorted.length > 3 ? ' of ' + sorted.length : '') + ')</div>';
      for (const hl of preview) {
        bodyHtml += '<div class="trb-item trb-highlight" data-book="' + hl.bookId + '" data-chapter="' + hl.chapter + '" data-verse="' + hl.verse + '">' +
          '<div class="trb-item-ref">' + window.HTMLEscape(this._getBookName(hl.bookId)) + ' ' + hl.chapter + ':' + hl.verse + '</div>' +
          '<div class="trb-item-text">' + window.HTMLEscape(hl.text || '') + '</div></div>';
      }
      bodyHtml += '</div>';
    }

    /* Bookmarks — max 3, sorted by createdAt */
    if (results.bookmarks.length) {
      const sorted = [...results.bookmarks].sort((a, b) => ((b.createdAt || 0) - (a.createdAt || 0)));
      const preview = sorted.slice(0, 3);
      bodyHtml += '<div class="trb-group"><div class="trb-group-title">Bookmarks (' + preview.length + (sorted.length > 3 ? ' of ' + sorted.length : '') + ')</div>';
      for (const bm of preview) {
        const bmV = bm.verse ?? (bm.verses?.[0] ?? '');
        bodyHtml += '<div class="trb-item trb-bookmark" data-book="' + bm.bookId + '" data-chapter="' + bm.chapter + '" data-verse="' + bmV + '">' +
          '<div class="trb-item-ref">' + window.HTMLEscape(this._getBookName(bm.bookId)) + ' ' + bm.chapter + ':' + bmV + '</div>' +
          '<div class="trb-item-text">' + window.HTMLEscape(bm.text || '') + '</div></div>';
      }
      bodyHtml += '</div>';
    }

    const totalCount = results.notes.length + results.highlights.length + results.bookmarks.length;

    if (!totalCount) {
      bodyHtml = '<div class="trb-empty">No results for <strong>#' + window.HTMLEscape(tagName) + '</strong></div>';
    } else if (bodyHtml) {
      bodyHtml += '<button class="trb-see-all" data-tag="' + window.HTMLEscape(tagName) + '">See all results →</button>';
    }

    bar.innerHTML =
      '<div class="trb-header">' +
        '<span class="trb-title">#' + window.HTMLEscape(tagName) + '</span>' +
        '<button class="trb-dismiss" id="trb-dismiss-btn">✕</button>' +
      '</div>' +
      '<div class="trb-scroll">' + bodyHtml + '</div>';

    /* ---- wire item clicks ---- */

    bar.querySelectorAll('.trb-note').forEach(el => {
      el.addEventListener('click', () => {
        this._dismissTagResults();
        const bm = this.bridge.get('bookmarks-ui');
        if (bm) { bm.closeModal(); bm.closeSlideUp(); }
        const ns = this.bridge.get('note-store');
        if (!ns) return;
        const note = ns.getNoteById(el.dataset.id);
        if (note) this.loadNote(note, tagName);
      });
    });

    bar.querySelectorAll('.trb-highlight, .trb-bookmark').forEach(el => {
      el.addEventListener('click', () => {
        this._dismissTagResults();
        const bm = this.bridge.get('bookmarks-ui');
        if (bm) { bm.closeModal(); bm.closeSlideUp(); }
        const nav = this.bridge.get('navigation');
        if (nav) {
          const book = parseInt(el.dataset.book);
          const ch = parseInt(el.dataset.chapter);
          const v = parseInt(el.dataset.verse);
          if (book && ch) {
            nav.navigateTo(book, ch, v || 1);
          }
        }
      });
    });

    /* ---- wire "See all" button ---- */

    const seeAllBtn = bar.querySelector('.trb-see-all');
    if (seeAllBtn) {
      seeAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tag = seeAllBtn.dataset.tag;
        if (tag) this._openFullTagSearch(tag);
      });
    }

    /* ---- show ---- */

    progress.classList.add('visible', 'show-tag-results');

    const dismissBtn = document.getElementById('trb-dismiss-btn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._dismissTagResults();
      });
    }

    this._removeTagDismissHandler();
    const clickHandler = (e) => {
      if (!progress.contains(e.target)) {
        this._dismissTagResults();
      }
    };
    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        this._dismissTagResults();
      }
    };
    this._tagDismissHandlers = { clickHandler, keyHandler };
    setTimeout(() => {
      document.addEventListener('click', clickHandler);
      document.addEventListener('keydown', keyHandler);
    }, 0);
  }

  /* ---------- Full Tag Search (panel) ---------- */

  async _openFullTagSearch(tag) {
    this._dismissTagResults();
    if (this._dirty) this._saveCurrentNote();
    const panel = document.getElementById('notes-panel');
    if (!panel) return;
    const bm = this.bridge.get('bookmarks-ui');
    if (bm) { bm.closeModal(); bm.closeSlideUp(); }
    await this._state.ready();
    this._open = true;
    panel.classList.remove('hidden', 'compressed');
    this._updateTitle('#' + tag);
    const results = window.TagSearch.search(tag, this.bridge);
    this._showAllTagResultsInPanel(results);
  }

  _showAllTagResultsInPanel(results) {
    this._showView('tag-search');
    const titleEl = document.getElementById('nts-title');
    if (titleEl) titleEl.textContent = '#' + results.tag;
    const container = document.getElementById('nts-results');
    if (!container) return;

    let html = '';

    if (results.notes.length) {
      html += '<div class="nts-group"><h4 class="nts-group-title">Notes (' + results.notes.length + ')</h4>';
      for (const note of results.notes) {
        html += '<div class="nts-item nts-note" data-id="' + note.id + '">' +
          '<div class="nts-item-title">' + window.HTMLEscape(note.title || 'Untitled') + '</div>' +
          (note.excerpt ? '<div class="nts-item-excerpt">' + window.HTMLEscape(note.excerpt) + '</div>' : '') + '</div>';
      }
      html += '</div>';
    }

    if (results.highlights.length) {
      html += '<div class="nts-group"><h4 class="nts-group-title">Highlights (' + results.highlights.length + ')</h4>';
      for (const hl of results.highlights) {
        html += '<div class="nts-item nts-highlight" data-book="' + hl.bookId + '" data-chapter="' + hl.chapter + '" data-verse="' + hl.verse + '">' +
          '<div class="nts-item-ref">' + window.HTMLEscape(this._getBookName(hl.bookId)) + ' ' + hl.chapter + ':' + hl.verse + '</div>' +
          '<div class="nts-item-text">' + window.HTMLEscape(hl.text || '') + '</div></div>';
      }
      html += '</div>';
    }

    if (results.bookmarks.length) {
      html += '<div class="nts-group"><h4 class="nts-group-title">Bookmarks (' + results.bookmarks.length + ')</h4>';
      for (const bm of results.bookmarks) {
        const bmV = bm.verse ?? (bm.verses?.[0] ?? '');
        html += '<div class="nts-item nts-bookmark" data-book="' + bm.bookId + '" data-chapter="' + bm.chapter + '" data-verse="' + bmV + '">' +
          '<div class="nts-item-ref">' + window.HTMLEscape(this._getBookName(bm.bookId)) + ' ' + bm.chapter + ':' + bmV + '</div>' +
          '<div class="nts-item-text">' + window.HTMLEscape(bm.text || '') + '</div></div>';
      }
      html += '</div>';
    }

    if (!results.notes.length && !results.highlights.length && !results.bookmarks.length) {
      html = '<div class="nts-empty">No results for <strong>#' + window.HTMLEscape(results.tag) + '</strong></div>';
    }

    container.innerHTML = html;

    container.querySelectorAll('.nts-note').forEach(el => {
      el.addEventListener('click', () => {
        const ns = this.bridge.get('note-store');
        if (!ns) return;
        const note = ns.getNoteById(el.dataset.id);
        if (note) this.loadNote(note, results.tag);
      });
    });

    container.querySelectorAll('.nts-highlight, .nts-bookmark').forEach(el => {
      el.addEventListener('click', () => {
        const nav = this.bridge.get('navigation');
        if (nav) {
          const book = parseInt(el.dataset.book);
          const ch = parseInt(el.dataset.chapter);
          const v = parseInt(el.dataset.verse);
          if (book && ch) {
            nav.navigateTo(book, ch, v || 1);
            this.close();
          }
        }
      });
    });
  }

  _dismissTagResults() {
    const progress = document.getElementById('verse-progress');
    const bar = document.getElementById('tag-results-bar');
    if (bar) bar.innerHTML = '';
    if (progress) progress.classList.remove('show-tag-results');
    this._removeTagDismissHandler();
  }

  _removeTagDismissHandler() {
    if (this._tagDismissHandlers) {
      if (this._tagDismissHandlers.clickHandler) {
        document.removeEventListener('click', this._tagDismissHandlers.clickHandler);
      }
      if (this._tagDismissHandlers.keyHandler) {
        document.removeEventListener('keydown', this._tagDismissHandlers.keyHandler);
      }
      this._tagDismissHandlers = null;
    }
  }

  _getBookName(id) {
    return BookMap.getName(id);
  }

  _wireTagChips(container) {
    if (!container) return;
    container.querySelectorAll('.note-tag-chip, .tag-pill, .tag-ref').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        let tag = el.dataset.tag || '';
        if (!tag) {
          const m = (el.textContent || '').match(/#([\w-]+)/);
          if (m) tag = m[1];
        }
        if (tag) this._searchByTag(tag.toLowerCase());
      });
    });
  }

  /* ---------- Tag pill context menu ---------- */

  _showTagContextMenu(pillEl, x, y) {
    this._removeTagContextMenu();
    this._tagMenuOpen = true;
    setTimeout(() => { this._tagMenuOpen = false; }, 200);

    const menu = document.createElement('div');
    menu.className = 'tag-context-menu';
    menu.setAttribute('popover', 'auto');
    menu.setAttribute('aria-label', 'Tag actions');
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    const editBtn = document.createElement('button');
    editBtn.className = 'tag-context-edit';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._editor._editTag(pillEl);
      this._removeTagContextMenu();
      this._dirty = true;
      this._scheduleAutoSave();
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'tag-context-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._editor._removeTag(pillEl);
      this._removeTagContextMenu();
      this._dirty = true;
      this._scheduleAutoSave();
    });

    menu.appendChild(editBtn);
    menu.appendChild(removeBtn);
    document.body.appendChild(menu);

    const controller = window.PopoverService
      ? window.PopoverService.create(menu, {
          onChange: (open) => {
            if (!open && this._tagMenuController === controller) this._removeTagContextMenu();
          }
        })
      : null;
    this._tagMenuController = controller;

    const closeHandler = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'keydown') {
        this._removeTagContextMenu();
        return;
      }
      if (!menu.contains(e.target)) {
        this._removeTagContextMenu();
      }
    };
    if (controller) controller.show();
    if (!controller?.native) setTimeout(() => {
      document.addEventListener('click', closeHandler);
      document.addEventListener('keydown', closeHandler);
      document.addEventListener('touchstart', closeHandler);
      this._tagMenuCloseHandler = closeHandler;
    }, 0);
  }

  _removeTagContextMenu() {
    const el = document.querySelector('.tag-context-menu');
    const controller = this._tagMenuController;
    this._tagMenuController = null;
    if (controller?.isOpen()) controller.hide();
    if (el) el.remove();
    if (this._tagMenuCloseHandler) {
      document.removeEventListener('click', this._tagMenuCloseHandler);
      document.removeEventListener('keydown', this._tagMenuCloseHandler);
      document.removeEventListener('touchstart', this._tagMenuCloseHandler);
      this._tagMenuCloseHandler = null;
    }
  }

  /* ---------- Markdown round-trip ---------- */

  _markdownToHtml(md) {
    if (!md) return '<p></p>';

    md = md.replace(/&nbsp;/g, ' ');

    // Save #tags and any legacy <sup> tags from stored markdown
    md = md.replace(/<sup>(.*?)<\/sup>/g, '\x00SUP\x00$1\x00/SUP\x00');

    const tags = [];
    md = md.replace(/(?<=^|[\s*>])(#[\w-]+)/g, (m) => {
      const idx = tags.length;
      tags.push(m.slice(1).toLowerCase());
      return '\x00TAG' + idx + '\x00';
    });

    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fmt = (s) => esc(s)
      .replace(/\x00SUP\x00(.+?)\x00\/SUP\x00/g, '<sup>$1</sup>')
      .replace(/\*{4,}/g, '')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');

    const lines = md.split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const trimmed = lines[i].trim();

      if (trimmed === '') {
        let blankCount = 0;
        while (i < lines.length && lines[i].trim() === '') {
          blankCount++;
          i++;
        }
        for (let b = 1; b < blankCount; b++) {
          out.push('<p><br></p>');
        }
        continue;
      }

      if (/^---+\s*$/.test(trimmed)) {
        out.push('<hr>');
        i++;
        continue;
      }

      const hMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
      if (hMatch) {
        const level = hMatch[1].length;
        out.push('<h' + level + '>' + fmt(hMatch[2]) + '</h' + level + '>');
        i++;
        continue;
      }

      const bqMatch = trimmed.match(/^>\s+(.+)/);
      if (bqMatch) {
        out.push('<blockquote>' + fmt(bqMatch[1]) + '</blockquote>');
        i++;
        continue;
      }

      if (/^-\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^-\s+/.test(lines[i].trim())) {
          items.push(fmt(lines[i].trim().replace(/^-\s+/, '')));
          i++;
        }
        out.push('<ul><li>' + items.join('</li><li>') + '</li></ul>');
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          items.push(fmt(lines[i].trim().replace(/^\d+\.\s+/, '')));
          i++;
        }
        out.push('<ol><li>' + items.join('</li><li>') + '</li></ol>');
        continue;
      }

      const para = [];
      while (i < lines.length) {
        const l = lines[i];
        const t = l.trim();
        if (t === '' || /^(#{1,3}\s|>|---+\s*$|-\s|\d+\.\s)/.test(t)) break;
        para.push(fmt(l));
        i++;
      }
      if (para.length) {
        out.push('<p>' + para.join('<br>') + '</p>');
      }
    }

    let result = out.join('\n');
    result = result.replace(/\x00TAG(\d+)\x00/g, (_, idx) => {
      const tagName = tags[parseInt(idx)];
      return '<span data-tag="' + tagName + '" class="tag-pill" contenteditable="false">#' + tagName + '</span>';
    });
    result = result.replace(/<\/span>(?=\s*<\/p>)/g, '</span>&nbsp;');
    return result || '<p><br></p>';
  }

  _htmlToMarkdown(html) {
    if (!html) return '';
    let md = html;

    // 1. Strip raw newlines inserted by the browser for source formatting
    md = md.replace(/\n/g, '');

    md = md.replace(/&nbsp;/g, ' ');

    md = md.replace(/<sup>(.*?)<\/sup>/g, '\x00SUP\x00$1\x00/SUP\x00');

    md = md.replace(/<span[^>]*data-tag="([^"]*)"[^>]*>#?\1?<\/span>/gi, '#$1');

    // 2. Convert <br> to actual markdown newlines
    md = md.replace(/<br\s*\/?>/g, '\n');

    md = md.replace(/<strong>(.*?)<\/strong>/g, '**$1**');
    md = md.replace(/<em>(.*?)<\/em>/g, '*$1*');
    md = md.replace(/<code>(.*?)<\/code>/g, '`$1`');

    // 3. Use [\s\S]*? to safely match content that now contains \n characters
    md = md.replace(/<h(\d)>([\s\S]*?)<\/h\1>/g, (_, level, content) => {
      return '#'.repeat(parseInt(level)) + ' ' + content.replace(/<[^>]*>/g, '') + '\n\n';
    });
    md = md.replace(/<blockquote>([\s\S]*?)<\/blockquote>/g, (_, content) => {
      return '> ' + content.replace(/<[^>]*>/g, '') + '\n\n';
    });
    md = md.replace(/<ul>([\s\S]*?)<\/ul>/g, (_, content) => {
      return content.replace(/<li>([\s\S]*?)<\/li>/g, (_, item) => '- ' + item.replace(/<[^>]*>/g, '') + '\n');
    });
    md = md.replace(/<ol>([\s\S]*?)<\/ol>/g, (_, content) => {
      let i = 1;
      return content.replace(/<li>([\s\S]*?)<\/li>/g, (_, item) => i++ + '. ' + item.replace(/<[^>]*>/g, '') + '\n');
    });
    md = md.replace(/<hr\s*\/?>/g, '---\n\n');

    // 4. Correctly intercept empty paragraphs (which are now <p>\n</p>), then process standard paragraphs
    md = md.replace(/<p>[\n\s]*<\/p>/g, '\n');
    md = md.replace(/<p>([\s\S]*?)<\/p>/g, '$1\n\n');

    md = md.replace(/<[^>]*>/g, '').trim();
    md = md.replace(/\x00SUP\x00/g, '<sup>');
    md = md.replace(/\x00\/SUP\x00/g, '</sup>');
    return md;
  }

  destroy() {
    if (this._autoSaveTimer) {
      clearTimeout(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }
    if (this._undoToastTimer) {
      clearTimeout(this._undoToastTimer);
      this._undoToastTimer = null;
    }
    if (this._undoToastEl) {
      this._undoToastEl.remove();
      this._undoToastEl = null;
    }
    this._editor?.destroy();
    this._editor = null;
    const noteStore = this.bridge.get('note-store');
    if (noteStore) {
      if (this._boundNoteChange) {
        noteStore.off('notes-changed', this._boundNoteChange);
        this._boundNoteChange = null;
      }
      if (this._boundCategoryChange) {
        noteStore.off('categories-changed', this._boundCategoryChange);
        this._boundCategoryChange = null;
      }
    }
    const panel = document.getElementById('notes-panel');
    if (panel) panel.remove();
    this._els = null;
    this._state = null;
    this._open = false;
    this._activeNoteId = null;
    this._dirty = false;
  }
}

window.NotesUI = NotesUI;
