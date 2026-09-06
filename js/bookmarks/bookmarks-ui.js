window.BookmarksUI = class BookmarksUI {
  constructor(bridge) {
    this.bridge = bridge;
    this._cleanupFocus = null;
    this._escHandler = null;
    this._activeFilterSet = null;
    this._notesCategoryFilter = '';
  }

  init() {
    this._initEventListeners();
    window.addEventListener('sync-module-updated', async (e) => {
      this.refreshIfOpen();
      const base = this.bridge.get('base-renderer');
      if (!base) return;
      if (e.detail === 'bookmarks') {
        await base.applyBookmarks();
      } else if (e.detail === 'highlights') {
        await base.renderHighlights();
      }
    });
  }

  _confirmDialog(options) {
    if (window.dialogService) return window.dialogService.confirm(options);
    return Promise.resolve(window.confirm(options.message || ''));
  }

  _initEventListeners() {
    document.getElementById('library-close').addEventListener('click', () => this.closeSlideUp());
    document.getElementById('library-backdrop').addEventListener('click', () => this.closeSlideUp());

    document.getElementById('library-tab-bm').addEventListener('click', () => this.renderBookmarksTab());
    document.getElementById('library-tab-hl').addEventListener('click', () => this.renderHighlightsTab());
    const libNotesTab = document.getElementById('library-tab-notes');
    if (libNotesTab) libNotesTab.addEventListener('click', () => this.renderNotesTab());
  }

  _bodyEl() {
    return document.getElementById('library-body');
  }

  _tabBmEl() {
    return document.getElementById('library-tab-bm');
  }

  _tabHlEl() {
    return document.getElementById('library-tab-hl');
  }

  _tabNotesEl() {
    return document.getElementById('library-tab-notes');
  }

  openSlideUp() {
    const panel = document.getElementById('library-panel');
    const backdrop = document.getElementById('library-backdrop');
    backdrop.classList.add('open');
    panel.classList.add('open');
    panel.removeAttribute('aria-hidden');
    panel.inert = false;
    backdrop.removeAttribute('aria-hidden');
    this._activeFilterSet = this.bridge.state.get('activeBookmarkSet');
    this._activeHighlightColor = this.bridge.state.get('activeHighlightColor');
    this.renderBookmarksTab();
    const base = this.bridge.get('base-renderer');
    if (base) {
      this._cleanupFocus = base.trapFocus(panel, document.querySelector('.tab-item[data-tab="bible"]'));
    }
    const handler = (e) => { if (e.key === 'Escape') this.closeSlideUp(); };
    document.addEventListener('keydown', handler);
    this._escHandler = () => document.removeEventListener('keydown', handler);
  }

  closeSlideUp() {
    const panel = document.getElementById('library-panel');
    const backdrop = document.getElementById('library-backdrop');
    panel.classList.remove('open');
    backdrop.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    panel.inert = true;
    backdrop.setAttribute('aria-hidden', 'true');
    if (this._cleanupFocus) { this._cleanupFocus(); this._cleanupFocus = null; }
    if (this._escHandler) { this._escHandler(); this._escHandler = null; }
  }

  refreshIfOpen() {
    const panel = document.getElementById('library-panel');
    if (!panel.classList.contains('open')) return;
    const tabBm = this._tabBmEl();
    const tabNotes = this._tabNotesEl();
    if (tabBm.classList.contains('active')) {
      this.renderBookmarksTab();
    } else if (tabNotes && tabNotes.classList.contains('active')) {
      this.renderNotesTab();
    } else {
      this.renderHighlightsTab();
    }
  }

  async renderBookmarksTab() {
    this._tabBmEl().classList.add('active');
    this._tabHlEl().classList.remove('active');
    this._tabNotesEl()?.classList.remove('active');
    const body = this._bodyEl();

    const [items, sets] = await Promise.all([
      this.bridge.selection.getAllBookmarks(),
      this.bridge.selection.getAllBookmarkSets()
    ]);

    const setMap = {};
    for (const s of sets) setMap[s.id] = s;

    body.innerHTML = '';

    const filterBar = this._renderSetFilter(sets, setMap);
    body.appendChild(filterBar);

    const filtered = this._activeFilterSet
      ? items.filter(item => item.setId === this._activeFilterSet)
      : items;

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'bookmarks-empty';
      empty.textContent = this._activeFilterSet && items.length
        ? 'No bookmarks in this set. Select a different filter or create new bookmarks.'
        : 'No bookmarks yet. Select text to create one.';
      body.appendChild(empty);
      return;
    }

    filtered.sort((a, b) => b.createdAt - a.createdAt);

    const nav = this.bridge.get('navigation');
    const base = this.bridge.get('base-renderer');
    const booksCache = nav ? nav.booksCache : [];

    for (const item of filtered) {
      const el = document.createElement('div');
      el.className = 'bookmark-item';
      el.dataset.uiComponent = 'library-item';
      const ref = booksCache.find(b => b.id === item.bookId)?.name || '';
      const set = item.setId ? setMap[item.setId] : null;

      const verses = item.verses || [item.verse];
      const sorted = [...verses].sort((a, b) => a - b);
      const verseRange = BookmarksUI._formatVerseRange(sorted);
      let text = item.text || '';
      text = text.replace(/^\d+\s*/, '');
      if (text.length > 80) text = text.slice(0, 80) + '...';
      const name = `${ref} ${item.chapter}:${verseRange} ${base ? base.escapeHtml(text) : ''}`;

      let badgeHtml = '';
      if (set) {
        const safeName = (base ? base.escapeHtml(set.name) : set.name).slice(0, 2).toUpperCase();
        const setColor = set.color || '#8B5CF6';
        const safeColor = window.UrlValidator.VALID_BOOKMARK_SET_COLORS.has(setColor) ? setColor : '#8B5CF6';
        badgeHtml = `<span class="bm-set-badge" style="background:${safeColor}">${safeName}</span>`;
      }

      el.innerHTML = `
        ${badgeHtml}
        <div class="bm-color" style="background:var(--accent-color)"></div>
        <div class="bm-content">
          <div class="bm-ref">${name}</div>
        </div>
        ${this._renderTagRow(item)}
        <button class="bm-delete" data-id="${item.id}">✕</button>`;
      el.querySelector('.bm-content').addEventListener('click', () => this._navigateToItem(item));
      const tagRow = el.querySelector('.bm-tag-row');
      if (tagRow) this._wireTagRow(tagRow, item, (id, tags) => this.bridge.selection.updateBookmarkTags(id, tags), 'bookmark');
      el.querySelector('.bm-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.bridge.selection.deleteItem(item.id);
        this.renderBookmarksTab();
        const curBook = this.bridge.state.get('currentBook');
        const curChap = this.bridge.state.get('currentChapter');
        if (item.bookId === curBook && item.chapter === curChap) {
          const br = this.bridge.get('base-renderer');
          if (br) br.applyBookmarks();
        }
      });
      body.appendChild(el);
    }
  }

  _renderSetFilter(sets, setMap) {
    const bar = document.createElement('div');
    bar.className = 'library-select-filter';

    const select = document.createElement('select');
    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = 'All';
    if (!this._activeFilterSet) allOpt.selected = true;
    select.appendChild(allOpt);

    for (const s of sets) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      if (this._activeFilterSet === s.id) opt.selected = true;
      select.appendChild(opt);
    }

    select.addEventListener('change', () => {
      this._activeFilterSet = select.value || null;
      this.bridge.state.set('activeBookmarkSet', this._activeFilterSet);
      this.renderBookmarksTab();
    });
    bar.appendChild(select);

    const addBtn = document.createElement('button');
    addBtn.className = 'filter-icon-btn';
    addBtn.textContent = '+';
    addBtn.title = 'New set';
    addBtn.addEventListener('click', () => this._showNewSetForm());
    bar.appendChild(addBtn);

    if (sets.length) {
      const manageBtn = document.createElement('button');
      manageBtn.className = 'filter-icon-btn';
      manageBtn.textContent = '⋮';
      manageBtn.title = 'Manage sets';
      manageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showSetManagePopover(manageBtn, sets, setMap);
      });
      bar.appendChild(manageBtn);
    }

    return bar;
  }

  _showNewSetForm() {
    const body = this._bodyEl();
    const form = document.createElement('div');
    form.className = 'bm-set-form';

    const label = document.createElement('span');
    label.className = 'bm-set-form-label';
    label.textContent = 'New Set';
    form.appendChild(label);

    const row = document.createElement('div');
    row.className = 'bm-set-form-row';

    const input = document.createElement('input');
    input.className = 'bm-set-input';
    input.type = 'text';
    input.placeholder = 'Set name...';
    input.maxLength = 30;

    const colors = ColorTheme.getSetColors().map(c => c.color);
    let selectedColor = colors[0];
    const colorRow = document.createElement('div');
    colorRow.className = 'bm-set-colors';
    for (const c of colors) {
      const dot = document.createElement('button');
      dot.className = 'bm-set-color-dot' + (c === selectedColor ? ' active' : '');
      dot.style.background = c;
      dot.addEventListener('click', () => {
        colorRow.querySelectorAll('.bm-set-color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        selectedColor = c;
      });
      colorRow.appendChild(dot);
    }

    const saveBtn = document.createElement('button');
    saveBtn.className = 'bm-set-save';
    saveBtn.textContent = 'Save';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'bm-set-cancel';
    cancelBtn.textContent = 'Cancel';

    row.appendChild(input);
    row.appendChild(saveBtn);
    row.appendChild(cancelBtn);
    form.appendChild(row);
    form.appendChild(colorRow);

    const prevFilter = body.querySelector('.library-select-filter');
    if (prevFilter) prevFilter.after(form);
    else body.prepend(form);
    input.focus();

    const closeForm = () => {
      if (form.parentNode) form.parentNode.removeChild(form);
    };

    const doCreate = async () => {
      const name = input.value.trim();
      if (!name) return;
      await this.bridge.selection.saveBookmarkSet(name, selectedColor);
      closeForm();
      this.renderBookmarksTab();
    };

    saveBtn.addEventListener('click', doCreate);
    cancelBtn.addEventListener('click', closeForm);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doCreate();
      if (e.key === 'Escape') closeForm();
    });
  }

  _showSetManagePopover(anchorEl, sets, setMap) {
    const existing = document.querySelector('.bm-set-manage-popover');
    if (existing) existing.remove();

    const popover = document.createElement('div');
    popover.className = 'bm-set-manage-popover';
    popover.setAttribute('popover', 'auto');
    popover.setAttribute('aria-label', 'Manage bookmark sets');
    const rect = anchorEl.getBoundingClientRect();
    const width = 220;
    const anchorName = `--bookmark-set-${Date.now()}`;
    const supportsAnchors = Boolean(
      window.CSS?.supports?.('position-anchor', anchorName) &&
      window.CSS?.supports?.('top', 'anchor(bottom)')
    );
    if (supportsAnchors) {
      anchorEl.style.anchorName = anchorName;
      popover.style.positionAnchor = anchorName;
      popover.style.top = 'anchor(bottom)';
      popover.style.left = 'anchor(left)';
      popover.style.marginTop = '4px';
    } else {
      popover.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + 'px';
      popover.style.top = rect.bottom + 4 + 'px';
    }

    let controller = null;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (controller?.isOpen()) controller.hide();
      if (anchorEl.style.anchorName === anchorName) anchorEl.style.anchorName = '';
      if (popover.parentNode) popover.remove();
      if (this._bookmarkSetManageCleanup === cleanup) this._bookmarkSetManageCleanup = null;
      if (this._bookmarkSetManageController === controller) this._bookmarkSetManageController = null;
    };

    for (const s of sets) {
      const row = document.createElement('div');
      row.className = 'bm-set-manage-item';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'name';
      nameSpan.textContent = s.name;
      row.appendChild(nameSpan);

      const renameBtn = document.createElement('button');
      renameBtn.textContent = '✏️';
      renameBtn.title = `Rename ${s.name}`;
      renameBtn.setAttribute('aria-label', `Rename ${s.name}`);
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cleanup();
        this._renameSet(s);
      });
      row.appendChild(renameBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'danger';
      delBtn.textContent = '🗑';
      delBtn.title = `Delete ${s.name}`;
      delBtn.setAttribute('aria-label', `Delete ${s.name}`);
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        cleanup();
        const confirmed = await this._confirmDialog({
          title: 'Delete bookmark set',
          message: `Delete "${s.name}"? Bookmarks in this set will become unassigned.`,
          confirmLabel: 'Delete Set',
          danger: true
        });
        if (!confirmed) return;
        await this.bridge.selection.deleteBookmarkSet(s.id);
        if (this._activeFilterSet === s.id) {
          this._activeFilterSet = null;
          this._activeHighlightColor = null;
          this.bridge.state.set('activeBookmarkSet', null);
        }
        this.renderBookmarksTab();
      });
      row.appendChild(delBtn);

      popover.appendChild(row);
    }

    document.body.appendChild(popover);

    controller = window.PopoverService
      ? window.PopoverService.create(popover, { onChange: (open) => { if (!open) cleanup(); } })
      : null;
    this._bookmarkSetManageController = controller;
    this._bookmarkSetManageCleanup = cleanup;

    const hide = (e) => {
      if (!popover.contains(e.target) && e.target !== anchorEl) {
        cleanup();
        document.removeEventListener('click', hide);
      }
    };
    if (controller) controller.show();
    if (!controller?.native) setTimeout(() => document.addEventListener('click', hide), 10);
  }

  _renameSet(set) {
    const body = this._bodyEl();
    const filterBar = body.querySelector('.library-select-filter');
    const form = document.createElement('div');
    form.className = 'bm-set-form';

    const label = document.createElement('span');
    label.className = 'bm-set-form-label';
    label.textContent = 'Rename "' + set.name + '"';
    form.appendChild(label);

    const swatchRow = document.createElement('div');
    swatchRow.className = 'accent-swatches';
    const COLORS = ColorTheme.getSetColors();
    const selectedColor = { current: set.color || '#8B5CF6' };
    for (const c of COLORS) {
      const btn = document.createElement('button');
      btn.className = 'accent-swatch' + (c.color === selectedColor.current ? ' active' : '');
      btn.style.background = c.color;
      btn.setAttribute('aria-label', c.label);
      btn.addEventListener('click', () => {
        selectedColor.current = c.color;
        swatchRow.querySelectorAll('.accent-swatch').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      swatchRow.appendChild(btn);
    }
    form.appendChild(swatchRow);

    const row = document.createElement('div');
    row.className = 'bm-set-form-row';
    const input = document.createElement('input');
    input.className = 'bm-set-input';
    input.type = 'text';
    input.value = set.name;
    input.maxLength = 30;
    const saveBtn = document.createElement('button');
    saveBtn.className = 'bm-set-save';
    saveBtn.textContent = 'Save';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'bm-set-cancel';
    cancelBtn.textContent = 'Cancel';
    row.appendChild(input);
    row.appendChild(saveBtn);
    row.appendChild(cancelBtn);
    form.appendChild(row);

    if (filterBar) filterBar.after(form);
    else body.prepend(form);
    input.focus();
    input.select();

    const closeForm = () => {
      if (form.parentNode) form.parentNode.removeChild(form);
    };
    const doRename = async () => {
      const name = input.value.trim();
      if (!name) return;
      await this.bridge.selection.updateBookmarkSet(set.id, { name, color: selectedColor.current });
      closeForm();
      this.renderBookmarksTab();
    };
    saveBtn.addEventListener('click', doRename);
    cancelBtn.addEventListener('click', closeForm);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doRename();
      if (e.key === 'Escape') closeForm();
    });
  }

  _renderHighlightColorFilter(items) {
    const COLORS = [
      { color: '#FFD700', label: 'Yellow' },
      { color: '#48BB78', label: 'Green' },
      { color: '#63B3ED', label: 'Blue' },
      { color: '#ED8936', label: 'Orange' },
      { color: '#9F7AEA', label: 'Purple' },
      { color: '#F56565', label: 'Red' }
    ];

    const counts = {};
    for (const item of items) {
      counts[item.color] = (counts[item.color] || 0) + 1;
    }

    const bar = document.createElement('div');
    bar.className = 'hl-color-filter';

    const allChip = document.createElement('button');
    allChip.className = 'hl-color-chip' + (!this._activeHighlightColor ? ' active' : '');
    allChip.textContent = 'All';
    const allCount = document.createElement('span');
    allCount.className = 'hl-color-count';
    allCount.textContent = ` (${items.length})`;
    allChip.appendChild(allCount);
    allChip.addEventListener('click', () => {
      this._activeHighlightColor = null;
      this.bridge.state.set('activeHighlightColor', null);
      this.renderHighlightsTab();
    });
    bar.appendChild(allChip);

    for (const c of COLORS) {
      const count = counts[c.color] || 0;
      if (!count) continue;
      const chip = document.createElement('button');
      chip.className = 'hl-color-chip' + (this._activeHighlightColor === c.color ? ' active' : '');
      const dot = document.createElement('span');
      dot.className = 'hl-color-dot';
      dot.style.background = c.color;
      chip.appendChild(dot);
      const countEl = document.createElement('span');
      countEl.className = 'hl-color-count';
      countEl.textContent = `${count}`;
      chip.appendChild(countEl);
      chip.addEventListener('click', () => {
        this._activeHighlightColor = c.color;
        this.bridge.state.set('activeHighlightColor', c.color);
        this.renderHighlightsTab();
      });
      bar.appendChild(chip);
    }

    return bar;
  }

  async renderHighlightsTab() {
    this._tabHlEl().classList.add('active');
    this._tabBmEl().classList.remove('active');
    this._tabNotesEl()?.classList.remove('active');
    const body = this._bodyEl();

    const hm = this.bridge.get('highlight-manager');
    if (!hm) {
      body.innerHTML = '<div class="bookmarks-empty">Highlight system unavailable.</div>';
      return;
    }
    const allItems = await hm.store.getAll();
    if (!allItems.length) {
      body.innerHTML = '<div class="bookmarks-empty">No highlights yet. Select text or tap a verse to create one.</div>';
      return;
    }

    body.innerHTML = '';
    const filterBar = this._renderHighlightColorFilter(allItems);
    body.appendChild(filterBar);

    const items = this._activeHighlightColor
      ? allItems.filter(item => item.color === this._activeHighlightColor)
      : allItems;

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'bookmarks-empty';
      empty.textContent = 'No highlights with this color.';
      body.appendChild(empty);
      return;
    }

    const nav = this.bridge.get('navigation');
    const base = this.bridge.get('base-renderer');
    const booksCache = nav ? nav.booksCache : [];
    const state = this.bridge.state;

    for (const item of items) {
      const el = document.createElement('div');
      el.className = 'bookmark-item';
      el.dataset.uiComponent = 'library-item';
      const ref = booksCache.find(b => b.id === item.bookId)?.name || '';
      let text = item.text || '';
      text = text.replace(/^\d+\s*/, '');
      if (text.length > 80) {
        text = text.slice(0, 80) + '...';
      }
      const verseLabel = item.verseEnd && item.verseEnd !== item.verse
        ? `${item.verse}–${item.verseEnd}`
        : `${item.verse}`;
      const name = `${ref} ${item.chapter}:${verseLabel} ${base ? base.escapeHtml(text) : ''}`;
      const hlColor = window.UrlValidator.VALID_HIGHLIGHT_COLORS.has(item.color) ? item.color : '#FFD700';
      el.innerHTML = `
        <div class="bm-color" style="background:${hlColor}"></div>
        <div class="bm-content">
          <div class="bm-ref">${name}</div>
        </div>
        ${this._renderTagRow(item)}
        <button class="bm-delete" data-id="${item.id}">✕</button>`;
      el.querySelector('.bm-content').addEventListener('click', () => this._navigateToItem(item));
      const tagRow = el.querySelector('.bm-tag-row');
      if (tagRow) this._wireTagRow(tagRow, item, (id, tags) => hm.store.updateTags(id, tags), 'highlight');
      el.querySelector('.bm-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        await hm.store.delete(item.id);
        this.renderHighlightsTab();
        if (item.bookId === state.get('currentBook') && item.chapter === state.get('currentChapter')) {
          const baseRenderer = this.bridge.get('base-renderer');
          if (baseRenderer) baseRenderer.renderHighlights();
        }
      });
      body.appendChild(el);
    }
  }

  async renderNotesTab() {
    const tabNotes = this._tabNotesEl();
    if (tabNotes) tabNotes.classList.add('active');
    this._tabBmEl().classList.remove('active');
    this._tabHlEl().classList.remove('active');

    const body = this._bodyEl();
    body.innerHTML = '';
    const notesUI = this.bridge.get('notes-ui');
    const noteStore = this.bridge.get('note-store');
    if (!noteStore) {
      body.innerHTML = '<div class="bookmarks-empty">Notes system unavailable.</div>';
      return;
    }

    const cats = noteStore.getAllCategories().filter(c => !c.deleted);
    if (this._notesCategoryFilter && !cats.some(c => c.id === this._notesCategoryFilter)) {
      this._notesCategoryFilter = '';
    }

    const filterBar = document.createElement('div');
    filterBar.className = 'library-select-filter';

    const select = document.createElement('select');
    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = 'All Categories';
    if (!this._notesCategoryFilter) allOpt.selected = true;
    select.appendChild(allOpt);

    for (const cat of cats) {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      if (this._notesCategoryFilter === cat.id) opt.selected = true;
      select.appendChild(opt);
    }

    select.addEventListener('change', () => {
      this._notesCategoryFilter = select.value;
      this.renderNotesTab();
    });
    filterBar.appendChild(select);
    body.appendChild(filterBar);

    let notes = noteStore.getAllNotes();
    if (this._notesCategoryFilter) {
      notes = notes.filter(n => n.categoryId === this._notesCategoryFilter);
    }
    if (!notes.length) {
      const empty = document.createElement('div');
      empty.className = 'bookmarks-empty';
      empty.textContent = this._notesCategoryFilter
        ? 'No notes in this category.'
        : 'No notes yet. Select a verse and tap 📝 to create one.';
      body.appendChild(empty);
      return;
    }
    notes.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));

    const base = this.bridge.get('base-renderer');

    for (const note of notes) {
      const el = document.createElement('div');
      el.className = 'bookmark-item';
      el.dataset.uiComponent = 'library-item';

      let catColor = 'var(--accent-color)';
      if (note.categoryId) {
        const ncat = cats.find(c => c.id === note.categoryId);
        if (ncat && ncat.color) catColor = ncat.color;
      }

      const title = note.title || 'Untitled';
      const excerpt = note.excerpt || '';
      const date = new Date(note.updated_at || note.createdAt || Date.now());
      const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const tags = (note.tags || []).map(t => {
        const st = window.UrlValidator.safeTag(t);
        return `<span class="note-tag-chip" data-tag="${st}">#${st}</span>`;
      }).join('');
      let catLabel = '';
      if (!this._notesCategoryFilter && note.categoryId) {
        const ncat = cats.find(c => c.id === note.categoryId);
        if (ncat) catLabel = `<span class="bm-cat-label">${window.HTMLEscape(ncat.name)}</span>`;
      }
      const safeCatColor = window.UrlValidator.VALID_CATEGORY_COLORS.has(catColor) ? catColor : 'var(--accent-color)';
      el.innerHTML = `
        <div class="bm-color" style="background:${safeCatColor}"></div>
        <div class="bm-content">
          <div class="bm-ref">${base ? base.escapeHtml(title) : title}</div>
          ${excerpt ? '<div class="bm-excerpt">' + (base ? base.escapeHtml(excerpt) : excerpt) + '</div>' : ''}
          <div class="bm-meta">
            <span class="bm-date">${dateStr}</span>
            ${catLabel}
            ${tags ? '<span class="bm-tags">' + tags + '</span>' : ''}
          </div>
        </div>
        <button class="bm-delete" data-id="${note.id}">✕</button>`;

      el.addEventListener('click', (e) => {
        const chip = e.target.closest('.note-tag-chip');
        if (chip) {
          e.stopPropagation();
          const tag = chip.dataset.tag;
          if (tag && notesUI) notesUI._openTagSearch(tag.toLowerCase());
          return;
        }
        if (e.target.closest('.bm-delete')) return;
        this.closeSlideUp();
        if (notesUI) notesUI.loadNote(note);
      });

      el.querySelector('.bm-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        const ns = this.bridge.get('note-store');
        if (!ns) return;
        ns.deleteNote(note.id);
        if (notesUI) {
          notesUI._showUndoToast('Deleted "' + title + '"', () => {
            ns.updateNote(note.id, { deleted: false });
            this.renderNotesTab();
          });
        }
        this.renderNotesTab();
      });

      body.appendChild(el);
    }
  }

  _renderTagRow(item) {
    const tags = item.tags || [];
    const chips = tags.map(t => {
      const st = window.UrlValidator.safeTag(t);
      const at = window.UrlValidator.escapeAttr(t);
      return `<span class="note-tag-chip bm-tag-chip" data-tag="${at}">#${st}</span>`;
    }).join('');
    return `<div class="bm-tag-row" data-id="${item.id}">${chips}<button class="bm-tag-add-btn" title="Edit tags">+</button></div>`;
  }

  _wireTagRow(rowEl, item, persistFn, type) {
    if (!rowEl) return;
    rowEl.querySelectorAll('.bm-tag-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const tag = chip.dataset.tag;
        if (!tag) return;
        const nu = this.bridge.get('notes-ui');
        if (nu) nu._openTagSearch(tag.toLowerCase());
      });
    });
    const addBtn = rowEl.querySelector('.bm-tag-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._openTagPopup(e.currentTarget, item, persistFn, type);
      });
    }
  }

  _openTagPopup(anchorEl, item, persistFn, type) {
    this._closeTagPopup();

    const popup = document.createElement('div');
    popup.className = 'bm-tag-popup';

    const header = document.createElement('div');
    header.className = 'bm-tag-popup-header';
    header.innerHTML = '<span class="bm-tag-popup-title">Tags</span><button class="bm-tag-popup-close">✕</button>';
    header.querySelector('.bm-tag-popup-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this._closeTagPopup();
    });
    popup.appendChild(header);

    const body = document.createElement('div');
    body.className = 'bm-tag-popup-body';

    const chipsRow = document.createElement('div');
    chipsRow.className = 'bm-tag-popup-chips';
    body.appendChild(chipsRow);

    const inputRow = document.createElement('div');
    inputRow.className = 'bm-tag-popup-input-row';
    const prefix = document.createElement('span');
    prefix.className = 'bm-tag-popup-prefix';
    prefix.textContent = '#';
    inputRow.appendChild(prefix);
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'bm-tag-popup-input';
    input.placeholder = 'add tag...';
    input.maxLength = 30;
    inputRow.appendChild(input);
    body.appendChild(inputRow);

    const suggContainer = document.createElement('div');
    suggContainer.className = 'bm-tag-popup-suggestions';
    body.appendChild(suggContainer);

    popup.appendChild(body);
    document.body.appendChild(popup);

    const rowEl = anchorEl.closest('.bm-tag-row');
    this._tagPopupState = { popup, rowEl, item, persistFn, type, input, chipsRow, suggContainer, existingTags: [...(item.tags || [])] };
    this._renderPopupChips();
    this._positionTagPopup(popup, anchorEl);

    setTimeout(() => input.focus(), 50);

    const normalize = (v) => v.trim().replace(/^#/, '').toLowerCase().replace(/[^a-z0-9-]/g, '');

    const persistAndRefresh = (tags) => {
      item.tags = tags;
      if (type === 'bookmark') {
        this.bridge.state.updateBookmark(item.id, { tags });
      } else {
        this.bridge.state.updateHighlight(item.id, { tags });
      }
      this._refreshTagRow(rowEl, item, persistFn, type);
      this._renderPopupChips();
      this._renderPopupSuggestions('');
    };

    const addTag = (raw) => {
      const val = normalize(raw);
      if (!val) return;
      const s = this._tagPopupState;
      if (s.existingTags.includes(val)) return;
      s.existingTags.push(val);
      persistAndRefresh(s.existingTags);
      input.value = '';
      input.focus();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag(input.value);
      } else if (e.key === 'Escape') {
        this._closeTagPopup();
      }
    });

    input.addEventListener('input', () => {
      this._renderPopupSuggestions(normalize(input.value));
    });

    this._tagPopupAddTag = addTag;
  }

  _renderPopupChips() {
    const s = this._tagPopupState;
    if (!s) return;
    const tags = s.existingTags;
    s.chipsRow.innerHTML = tags.map(t => {
      const display = '#' + window.UrlValidator.safeTag(t);
      const attrVal = window.UrlValidator.escapeAttr(t);
      return `<span class="bm-tag-popup-chip"><span>${display}</span><button class="bm-tag-popup-chip-remove" data-tag="${attrVal}">✕</button></span>`;
    }).join('');
    s.chipsRow.querySelectorAll('.bm-tag-popup-chip-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tag = btn.dataset.tag;
        const idx = s.existingTags.indexOf(tag);
        if (idx !== -1) {
          s.existingTags.splice(idx, 1);
          s.item.tags = s.existingTags;
          if (s.type === 'bookmark') {
            this.bridge.state.updateBookmark(s.item.id, { tags: s.existingTags });
          } else {
            this.bridge.state.updateHighlight(s.item.id, { tags: s.existingTags });
          }
          this._refreshTagRow(s.rowEl, s.item, s.persistFn, s.type);
          this._renderPopupChips();
          this._renderPopupSuggestions('');
        }
      });
    });
  }

  _refreshTagRow(rowEl, item, persistFn, type) {
    if (!rowEl) return;
    const tags = item.tags || [];
    const chips = tags.map(t => {
      const st = window.UrlValidator.safeTag(t);
      const at = window.UrlValidator.escapeAttr(t);
      return `<span class="note-tag-chip bm-tag-chip" data-tag="${at}">#${st}</span>`;
    }).join('');
    rowEl.innerHTML = chips + `<button class="bm-tag-add-btn" title="Edit tags">+</button>`;
    this._wireTagRow(rowEl, item, persistFn, type);
  }

  _renderPopupSuggestions(filter) {
    const s = this._tagPopupState;
    if (!s) return;
    const cache = this.bridge.state._tagCountCache;
    const container = s.suggContainer;
    if (!cache) { container.innerHTML = ''; return; }
    let tags = Object.keys(cache).sort((a, b) => a.localeCompare(b));
    if (filter) {
      const lower = filter.toLowerCase();
      tags = tags.filter(t => t.toLowerCase().includes(lower));
    }
    tags = tags.filter(t => !s.existingTags.includes(t));
    if (!tags.length) { container.innerHTML = ''; return; }
    const maxSuggest = 10;
    container.innerHTML = tags.slice(0, maxSuggest).map(t => {
      const st = window.UrlValidator.safeTag(t);
      const at = window.UrlValidator.escapeAttr(t);
      return `<button class="bm-tag-popup-suggestion" data-tag="${at}">#${st}</button>`;
    }).join('');
    container.querySelectorAll('.bm-tag-popup-suggestion').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tag = btn.dataset.tag;
        if (tag && this._tagPopupAddTag) this._tagPopupAddTag(tag);
      });
    });
  }

  _positionTagPopup(popup, anchorEl) {
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      popup.classList.add('bm-tag-popup-mobile');
      const backdrop = document.createElement('div');
      backdrop.className = 'bm-tag-popup-backdrop';
      backdrop.addEventListener('click', () => this._closeTagPopup());
      document.body.appendChild(backdrop);
      if (this._tagPopupState) this._tagPopupState.backdrop = backdrop;
    } else {
      const rect = anchorEl.getBoundingClientRect();
      const popupWidth = 260;
      let left = rect.left + rect.width / 2 - popupWidth / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - popupWidth - 8));
      const top = rect.bottom + 4;
      popup.style.left = left + 'px';
      popup.style.top = top + 'px';
      popup.style.width = popupWidth + 'px';
    }
  }

  _closeTagPopup() {
    if (this._tagPopupState) {
      if (this._tagPopupState.backdrop) {
        this._tagPopupState.backdrop.remove();
      }
      if (this._tagPopupState.popup.parentNode) {
        this._tagPopupState.popup.parentNode.removeChild(this._tagPopupState.popup);
      }
      this._tagPopupState = null;
      this._tagPopupAddTag = null;
    }
  }

  _navigateToItem(item) {
    const state = this.bridge.state;
    const verses = item.verses || [item.verse];
    const verseTarget = item.verseEnd ? item.verse : verses[0];
    state.batch({
      currentBook: item.bookId,
      currentChapter: item.chapter
    });
    window.verseManager.setIntentional(verseTarget);
    this.bridge.call('navigation', 'loadChapter', item.bookId, item.chapter);
    this.closeSlideUp();
  }

  static _formatVerseRange(verses) {
    if (verses.length === 1) return `${verses[0]}`;
    const isConsecutive = verses.every((n, i) => i === 0 || n === verses[i - 1] + 1);
    return isConsecutive
      ? `${verses[0]}–${verses[verses.length - 1]}`
      : verses.join(',');
  }
};
