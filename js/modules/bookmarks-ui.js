window.BookmarksUI = class BookmarksUI {
  constructor(bridge) {
    this.bridge = bridge;
    this._cleanupFocus = null;
    this._activeFilterSet = null;
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

    document.getElementById('library-close').addEventListener('click', () => this.closeSlideUp());
    document.getElementById('library-backdrop').addEventListener('click', () => this.closeSlideUp());

    document.getElementById('library-tab-bm').addEventListener('click', () => this.renderBookmarksTab());
    document.getElementById('library-tab-hl').addEventListener('click', () => this.renderHighlightsTab());
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
    if (tabBm.classList.contains('active')) {
      this.renderBookmarksTab();
    } else {
      this.renderHighlightsTab();
    }
  }

  async renderBookmarksTab() {
    this._tabBmEl().classList.add('active');
    this._tabHlEl().classList.remove('active');
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
        <button class="bm-delete" data-id="${item.id}">✕</button>`;
      el.querySelector('.bm-content').addEventListener('click', () => this._navigateToItem(item));
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
    bar.className = 'bm-set-filter';

    const allChip = document.createElement('button');
    allChip.className = 'bm-set-chip' + (!this._activeFilterSet ? ' active' : '');
    allChip.textContent = 'All';
    allChip.addEventListener('click', () => {
      this._activeFilterSet = null;
      this.bridge.state.set('activeBookmarkSet', null);
      this.renderBookmarksTab();
    });
    bar.appendChild(allChip);

    for (const s of sets) {
      const chip = document.createElement('button');
      chip.className = 'bm-set-chip' + (this._activeFilterSet === s.id ? ' active' : '');
      const dot = document.createElement('span');
      dot.className = 'bm-set-dot';
      dot.style.background = s.color || '#8B5CF6';
      chip.appendChild(dot);

      const label = document.createElement('span');
      label.className = 'bm-set-label';
      label.textContent = s.name;
      chip.appendChild(label);

      let longPressTimer = null;
      const startLongPress = (e) => {
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          this._showSetMenu(s, chip);
        }, 500);
      };
      const cancelLongPress = () => {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      };

      chip.addEventListener('pointerdown', startLongPress);
      chip.addEventListener('pointerup', cancelLongPress);
      chip.addEventListener('pointercancel', cancelLongPress);
      chip.addEventListener('pointermove', cancelLongPress);

      chip.addEventListener('click', () => {
        this._activeFilterSet = s.id;
        this.bridge.state.set('activeBookmarkSet', s.id);
        this.renderBookmarksTab();
      });

      chip.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._showSetMenu(s, chip);
      });

      bar.appendChild(chip);
    }

    const addBtn = document.createElement('button');
    addBtn.className = 'bm-set-chip bm-set-add';
    addBtn.textContent = '+';
    addBtn.title = 'New set';
    addBtn.addEventListener('click', () => this._showNewSetForm());
    bar.appendChild(addBtn);

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

    const prevFilter = body.querySelector('.bm-set-filter');
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

  _renameSet(set) {
    const body = this._bodyEl();
    const filterBar = body.querySelector('.bm-set-filter');
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
        <button class="bm-delete" data-id="${item.id}">✕</button>`;
      el.querySelector('.bm-content').addEventListener('click', () => this._navigateToItem(item));
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
