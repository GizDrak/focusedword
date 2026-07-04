window.BookmarksUI = class BookmarksUI {
  constructor(bridge) {
    this.bridge = bridge;
    this._cleanupFocus = null;
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

  _initEventListeners() {
    document.getElementById('bookmarks-close').addEventListener('click', () => this.closeModal());
    document.getElementById('bookmarks-backdrop').addEventListener('click', () => this.closeModal());

    document.getElementById('bookmarks-tab-bm').addEventListener('click', () => this.renderBookmarksTab());
    document.getElementById('bookmarks-tab-hl').addEventListener('click', () => this.renderHighlightsTab());
    const bmNotesTab = document.getElementById('bookmarks-tab-notes');
    if (bmNotesTab) bmNotesTab.addEventListener('click', () => this.renderNotesTab());

    document.getElementById('library-close').addEventListener('click', () => this.closeSlideUp());
    document.getElementById('library-backdrop').addEventListener('click', () => this.closeSlideUp());

    document.getElementById('library-tab-bm').addEventListener('click', () => this.renderBookmarksTab());
    document.getElementById('library-tab-hl').addEventListener('click', () => this.renderHighlightsTab());
    const libNotesTab = document.getElementById('library-tab-notes');
    if (libNotesTab) libNotesTab.addEventListener('click', () => this.renderNotesTab());
  }

  _bodyEl() {
    const panel = document.getElementById('library-panel');
    if (panel.classList.contains('open')) return document.getElementById('library-body');
    return document.getElementById('bookmarks-body');
  }

  _tabBmEl() {
    const panel = document.getElementById('library-panel');
    if (panel.classList.contains('open')) return document.getElementById('library-tab-bm');
    return document.getElementById('bookmarks-tab-bm');
  }

  _tabHlEl() {
    const panel = document.getElementById('library-panel');
    if (panel.classList.contains('open')) return document.getElementById('library-tab-hl');
    return document.getElementById('bookmarks-tab-hl');
  }

  _tabNotesEl() {
    const panel = document.getElementById('library-panel');
    if (panel.classList.contains('open')) return document.getElementById('library-tab-notes');
    return document.getElementById('bookmarks-tab-notes');
  }

  open() {
    const modal = document.getElementById('bookmarks-modal');
    const backdrop = document.getElementById('bookmarks-backdrop');
    modal.classList.add('open');
    backdrop.classList.add('open');
    this._activeFilterSet = this.bridge.state.get('activeBookmarkSet');
    this._activeHighlightColor = this.bridge.state.get('activeHighlightColor');
    this.renderBookmarksTab();
    const base = this.bridge.get('base-renderer');
    if (base) {
      this._cleanupFocus = base.trapFocus(modal, document.querySelector('.tab-item[data-tab="bible"]'));
    }
  }

  openSlideUp() {
    const panel = document.getElementById('library-panel');
    const backdrop = document.getElementById('library-backdrop');
    backdrop.classList.add('open');
    panel.classList.add('open');
    this._activeFilterSet = this.bridge.state.get('activeBookmarkSet');
    this._activeHighlightColor = this.bridge.state.get('activeHighlightColor');
    this.renderBookmarksTab();
  }

  closeModal() {
    const modal = document.getElementById('bookmarks-modal');
    const backdrop = document.getElementById('bookmarks-backdrop');
    modal.classList.remove('open');
    backdrop.classList.remove('open');
    if (this._cleanupFocus) { this._cleanupFocus(); this._cleanupFocus = null; }
  }

  closeSlideUp() {
    const panel = document.getElementById('library-panel');
    const backdrop = document.getElementById('library-backdrop');
    panel.classList.remove('open');
    backdrop.classList.remove('open');
  }

  refreshIfOpen() {
    const modal = document.getElementById('bookmarks-modal');
    const panel = document.getElementById('library-panel');
    const isOpen = modal.classList.contains('open') || panel.classList.contains('open');
    if (!isOpen) return;
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
        badgeHtml = `<span class="bm-set-badge" style="background:${set.color || '#8B5CF6'}">${safeName}</span>`;
      }

      el.innerHTML = `
        ${badgeHtml}
        <div class="bm-color" style="background:var(--accent-gold)"></div>
        <div class="bm-content">
          <div class="bm-ref">${name}</div>
        </div>
        ${this._renderTagRow(item)}
        <button class="bm-delete" data-id="${item.id}">✕</button>`;
      el.querySelector('.bm-content').addEventListener('click', () => this._navigateToItem(item));
      const tagRow = el.querySelector('.bm-tag-row');
      if (tagRow) this._wireTagRow(tagRow, item, (id, tags) => this.bridge.selection.updateBookmarkTags(id, tags));
      el.querySelector('.bm-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        this._updateTagCache(item.tags || [], []);
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

  _showSetMenu(set, chipEl) {
    const existing = document.querySelector('.bm-set-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'bm-set-menu';
    const rect = chipEl.getBoundingClientRect();
    menu.style.left = Math.min(rect.left, window.innerWidth - 160) + 'px';
    menu.style.top = rect.bottom + 'px';

    const renameBtn = document.createElement('button');
    renameBtn.className = 'bm-set-menu-item';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', () => {
      menu.remove();
      this._renameSet(set);
    });
    menu.appendChild(renameBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'bm-set-menu-item bm-set-menu-danger';
    delBtn.textContent = 'Delete Set';
    delBtn.addEventListener('click', async () => {
      menu.remove();
      if (!confirm(`Delete "${set.name}"? Bookmarks in this set will become unassigned.`)) return;
      await this.bridge.selection.deleteBookmarkSet(set.id);
      if (this._activeFilterSet === set.id) {
    this._activeFilterSet = null;
    this._activeHighlightColor = null;
        this.bridge.state.set('activeBookmarkSet', null);
      }
      this.renderBookmarksTab();
    });
    menu.appendChild(delBtn);

    document.body.appendChild(menu);
    const hide = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', hide);
      }
    };
    setTimeout(() => document.addEventListener('click', hide), 10);
  }

  _showSetManagePopover(anchorEl, sets, setMap) {
    const existing = document.querySelector('.bm-set-manage-popover');
    if (existing) existing.remove();

    const popover = document.createElement('div');
    popover.className = 'bm-set-manage-popover';
    const rect = anchorEl.getBoundingClientRect();
    popover.style.left = Math.min(rect.left, window.innerWidth - 220) + 'px';
    popover.style.top = rect.bottom + 4 + 'px';

    for (const s of sets) {
      const row = document.createElement('div');
      row.className = 'bm-set-manage-item';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'name';
      nameSpan.textContent = s.name;
      row.appendChild(nameSpan);

      const renameBtn = document.createElement('button');
      renameBtn.textContent = '✏️';
      renameBtn.title = 'Rename';
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        popover.remove();
        this._renameSet(s);
      });
      row.appendChild(renameBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'danger';
      delBtn.textContent = '🗑';
      delBtn.title = 'Delete';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        popover.remove();
        if (!confirm(`Delete "${s.name}"? Bookmarks in this set will become unassigned.`)) return;
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

    const hide = (e) => {
      if (!popover.contains(e.target) && e.target !== anchorEl) {
        popover.remove();
        document.removeEventListener('click', hide);
      }
    };
    setTimeout(() => document.addEventListener('click', hide), 10);
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
      el.innerHTML = `
        <div class="bm-color" style="background:${item.color}"></div>
        <div class="bm-content">
          <div class="bm-ref">${name}</div>
        </div>
        ${this._renderTagRow(item)}
        <button class="bm-delete" data-id="${item.id}">✕</button>`;
      el.querySelector('.bm-content').addEventListener('click', () => this._navigateToItem(item));
      const tagRow = el.querySelector('.bm-tag-row');
      if (tagRow) this._wireTagRow(tagRow, item, (id, tags) => hm.store.updateTags(id, tags));
      el.querySelector('.bm-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        this._updateTagCache(item.tags || [], []);
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

      let catColor = 'var(--accent-gold)';
      if (note.categoryId) {
        const ncat = cats.find(c => c.id === note.categoryId);
        if (ncat && ncat.color) catColor = ncat.color;
      }

      const title = note.title || 'Untitled';
      const excerpt = note.excerpt || '';
      const date = new Date(note.updated_at || note.createdAt || Date.now());
      const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const tags = (note.tags || []).map(t => `<span class="note-tag-chip" data-tag="${t}">#${t}</span>`).join('');
      let catLabel = '';
      if (!this._notesCategoryFilter && note.categoryId) {
        const ncat = cats.find(c => c.id === note.categoryId);
        if (ncat) catLabel = `<span class="bm-cat-label">${ncat.name}</span>`;
      }
      el.innerHTML = `
        <div class="bm-color" style="background:${catColor}"></div>
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
        this.closeModal();
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
    const chips = tags.map(t => `<span class="note-tag-chip bm-tag-chip" data-tag="${t}">#${t}</span>`).join('');
    return `<div class="bm-tag-row" data-id="${item.id}">${chips}<input type="text" class="bm-tag-input" placeholder="+#tag" maxlength="30"></div>`;
  }

  _updateTagCache(oldTags, newTags) {
    const cache = this.bridge.state._tagCountCache;
    if (cache) {
      window.TagCacheUtils.applyDiff(cache, oldTags, newTags);
      window.TagCacheUtils.persistCache(cache);
    }
  }

  _wireTagRow(rowEl, item, persistFn) {
    if (!rowEl) return;
    const input = rowEl.querySelector('.bm-tag-input');
    if (!input) return;
    const id = rowEl.dataset.id;
    if (!id) return;

    const rebuildRow = () => {
      const tags = item.tags || [];
      const chips = tags.map(t => `<span class="note-tag-chip bm-tag-chip" data-tag="${t}">#${t}</span>`).join('');
      rowEl.innerHTML = chips + `<input type="text" class="bm-tag-input" placeholder="+#tag" maxlength="30">`;
      this._wireTagRow(rowEl, item, persistFn);
    };

    const updateTags = (newTags) => {
      const oldTags = [...(item.tags || [])];
      item.tags = newTags;
      persistFn(id, newTags);
      this._updateTagCache(oldTags, newTags);
      rebuildRow();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = input.value.trim().replace(/^#/, '').toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (!val) return;
        input.value = '';
        const tags = [...(item.tags || [])];
        if (tags.includes(val)) return;
        tags.push(val);
        updateTags(tags);
      }
    });

    rowEl.addEventListener('click', (e) => {
      const chip = e.target.closest('.bm-tag-chip');
      if (!chip) return;
      e.stopPropagation();
      const tag = chip.dataset.tag;
      if (!tag) return;
      const nu = this.bridge.get('notes-ui');
      if (nu) nu._openTagSearch(tag.toLowerCase());
    });

    let longPressTimer = null;
    rowEl.addEventListener('touchstart', (e) => {
      const chip = e.target.closest('.bm-tag-chip');
      if (!chip) return;
      const tag = chip.dataset.tag;
      if (!tag) return;
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        e.preventDefault();
        const t = e.changedTouches[0] || e.touches[0];
        this._showTagChipMenu(chip, tag, item, updateTags, t.clientX, t.clientY);
      }, 500);
    }, { passive: false });

    rowEl.addEventListener('touchmove', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }, { passive: true });

    rowEl.addEventListener('touchend', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }, { passive: true });

    rowEl.addEventListener('contextmenu', (e) => {
      const chip = e.target.closest('.bm-tag-chip');
      if (!chip) return;
      e.preventDefault();
      const tag = chip.dataset.tag;
      if (!tag) return;
      this._showTagChipMenu(chip, tag, item, updateTags, e.clientX, e.clientY);
    });
  }

  _showTagChipMenu(chipEl, tag, item, updateTags, x, y) {
    const existing = document.querySelector('.tag-context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'tag-context-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'tag-context-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tags = (item.tags || []).filter(t => t !== tag);
      updateTags(tags);
      menu.remove();
    });
    menu.appendChild(removeBtn);

    document.body.appendChild(menu);

    let closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeHandler);
        document.removeEventListener('touchstart', closeHandler);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', closeHandler);
      document.addEventListener('touchstart', closeHandler);
    }, 0);
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
    this.closeModal();
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
