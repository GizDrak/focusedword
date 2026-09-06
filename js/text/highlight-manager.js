window.HighlightManager = class HighlightManager {
  constructor(bridge) {
    this.bridge = bridge;
    this.store = new window.HighlightStore(bridge);
    this.defaultColor = '#FFD700';
    this._toolbar = document.getElementById('highlight-toolbar');
    this._tempSelection = null;
    this._multiVerseRange = null;
    this._activeText = '';
    this._activeContainers = null;
    this._activeTranslationId = null;
    this._activeRect = null;
    this._pickerOpen = false;
    this._toolbarMenu = window.PopoverService
      ? window.PopoverService.create(this._toolbar)
      : null;
    const picker = document.getElementById('bookmark-set-picker');
    this._pickerMenu = window.PopoverService && picker
      ? window.PopoverService.create(picker, {
          onChange: (open) => {
            if (!open && this._pickerOpen) {
              this._pickerOpen = false;
              this._completeBookmark(this.bridge.state.get('activeBookmarkSet'));
            }
          }
        })
      : null;
    this.init();
  }

  init() {
    this.bridge.on('selection:active', (p) => this._onSelectionActive(p));
    this.bridge.on('selection:cleared', () => this._onSelectionCleared());

    this._toolbar.querySelectorAll('.hl-swatch').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._applyPrecisionHighlight(btn.dataset.color);
      });
    });

    document.getElementById('btn-remove-hl').addEventListener('click', (e) => {
      e.stopPropagation();
      this._removePrecisionHighlight();
    });

    document.getElementById('btn-bookmark').addEventListener('click', (e) => {
      e.stopPropagation();
      this._addBookmark();
    });

    document.getElementById('btn-copy').addEventListener('click', (e) => {
      e.stopPropagation();
      this._copyText();
    });

    document.getElementById('btn-note').addEventListener('click', (e) => {
      e.stopPropagation();
      this._addNote();
    });

    const reposition = () => {
      if (this._activeRect && !this._toolbar.classList.contains('hidden')) {
        this._positionToolbar(this._activeRect);
      }
    };
    this._repositionToolbar = reposition;
    window.addEventListener('resize', reposition);
    window.addEventListener('orientationchange', reposition);
    document.addEventListener('scroll', reposition, true);
  }

  _onSelectionActive(payload) {
    if (payload.mode === 'verse') {
      this._activeContainers = payload.verses;
      this._activeText = payload.text;
    } else {
      if (payload.multiVerse) {
        this._multiVerseRange = payload.range;
      } else {
        this._tempSelection = payload.tempEl;
      }
      this._activeText = payload.text;
    }
    this._activeTranslationId = payload.translationId || null;
    this._activeRect = payload.rect || null;
    if (this._toolbarMenu) this._toolbarMenu.show();
    else this._toolbar.classList.remove('hidden');
    this._positionToolbar(this._activeRect);
    requestAnimationFrame(() => this._positionToolbar(this._activeRect));
  }

  _positionToolbar(rect) {
    if (!rect) return;
    const touchLayout = window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 700;
    if (touchLayout) {
      this._toolbar.classList.remove('is-anchored');
      this._toolbar.style.left = '';
      this._toolbar.style.top = '';
      this._toolbar.style.right = '';
      this._toolbar.style.bottom = '';
      return;
    }

    this._toolbar.classList.add('is-anchored');
    const toolbarRect = this._toolbar.getBoundingClientRect();
    const width = toolbarRect.width || 280;
    const height = toolbarRect.height || 52;
    const left = Math.max(8, Math.min(
      rect.left + (rect.width - width) / 2,
      window.innerWidth - width - 8
    ));
    const above = rect.top - height - 8;
    const top = above >= 8
      ? above
      : Math.min(window.innerHeight - height - 8, rect.bottom + 8);
    this._toolbar.style.left = `${left}px`;
    this._toolbar.style.top = `${Math.max(8, top)}px`;
    this._toolbar.style.right = 'auto';
    this._toolbar.style.bottom = 'auto';
  }

  _hideToolbar() {
    if (this._toolbarMenu) this._toolbarMenu.hide();
    else this._toolbar.classList.add('hidden');
    this._toolbar.classList.remove('is-anchored');
    this._toolbar.style.left = '';
    this._toolbar.style.top = '';
    this._toolbar.style.right = '';
    this._toolbar.style.bottom = '';
  }

  _onSelectionCleared() {
    this._tempSelection = null;
    this._multiVerseRange = null;
    this._activeContainers = null;
    this._activeText = '';
    this._activeTranslationId = null;
    this._activeRect = null;
    this._hideToolbar();
  }

  async _applyPrecisionHighlight(color) {
    if (this._activeContainers && this._activeContainers.length) {
      const state = this.bridge.state;
      const bookId = state.get('currentBook');
      const chapter = state.get('currentChapter');

      const verseNums = [];
      for (const container of this._activeContainers) {
        const vne = container.querySelector('.verse-num');
        if (!vne) continue;
        verseNums.push(parseInt(vne.textContent));
      }
      verseNums.sort((a, b) => a - b);
      if (!verseNums.length) return;

      for (const vn of verseNums) {
        const existing = await this.store.getByVerse(bookId, chapter, vn);
        for (const h of existing) await this.store.delete(h.id);
      }

      const verseStart = verseNums[0];
      const verseEnd = verseNums[verseNums.length - 1];
      const text = this._activeText || '';
      await this.store.save({
        bookId, chapter,
        verse: verseStart,
        verseEnd,
        type: 'full',
        color,
        text
      });

      for (const container of this._activeContainers) {
        container.classList.add('highlighted');
        container.style.setProperty('--hl-color', color);
      }

      const interaction = this.bridge.get('interaction-manager');
      if (interaction) interaction.clearSelection();
      this._activeContainers = null;
      this._activeText = '';
      this._hideToolbar();
      return;
    }
    if (!this._tempSelection || !this._activeText) return;

    const container = this._tempSelection.closest('.verse-container');
    if (!container) return;

    const verseNumEl = container.querySelector('.verse-num');
    if (!verseNumEl) return;
    const verseNum = parseInt(verseNumEl.textContent);
    if (!verseNum) return;

    const verseText = container.querySelector('.verse-text');
    if (!verseText) return;

    const startOffset = this._calcOffsetFromSpan(verseText, this._tempSelection);
    const endOffset = startOffset + this._activeText.length;

    const state = this.bridge.state;
    const bookId = state.get('currentBook');
    const chapter = state.get('currentChapter');

    const existing = await this.store.getByVerse(bookId, chapter, verseNum);
    const overlapping = existing.filter(
      h => h.type === 'partial' && h.startOffset < endOffset && h.endOffset > startOffset
    );
    for (const h of overlapping) {
      await this.store.delete(h.id);
    }

    await this.store.save({
      bookId,
      chapter,
      verse: verseNum,
      type: 'partial',
      startOffset,
      endOffset,
      color,
      text: this._activeText
    });

    const interaction = this.bridge.get('interaction-manager');
    if (interaction) interaction.clearTempSelection();
    this._tempSelection = null;
    this._activeText = '';
    this._hideToolbar();

    await this._renderHighlightsForSingleVerse(bookId, chapter, verseNum);
  }

  async _removePrecisionHighlight() {
    const state = this.bridge.state;
    const bookId = state.get('currentBook');
    const chapter = state.get('currentChapter');

    // Collect verse numbers from either verse mode or word mode
    let verseNums = [];

    if (this._activeContainers && this._activeContainers.length) {
      for (const container of this._activeContainers) {
        const vne = container.querySelector('.verse-num');
        if (!vne) continue;
        const verseNum = parseInt(vne.textContent);
        if (isNaN(verseNum)) continue;
        verseNums.push(verseNum);
        container.classList.remove('highlighted');
        container.style.removeProperty('--hl-color');
      }
      verseNums.sort((a, b) => a - b);
      if (verseNums.length) {
        const existing = await this.store.getForChapter(bookId, chapter);
        const rangeHl = existing.find(h =>
          h.type === 'full' && h.verseEnd &&
          h.verse <= verseNums[0] && h.verseEnd >= verseNums[verseNums.length - 1]
        );
        if (rangeHl) await this.store.delete(rangeHl.id);
      }
    } else {
      if (!this._tempSelection || !this._activeText) return;

      const container = this._tempSelection.closest('.verse-container');
      if (!container) return;

      const verseNumEl = container.querySelector('.verse-num');
      if (!verseNumEl) return;
      const verseNum = parseInt(verseNumEl.textContent);
      if (!verseNum) return;

      const verseText = container.querySelector('.verse-text');
      if (!verseText) return;

      const startOffset = this._calcOffsetFromSpan(verseText, this._tempSelection);
      const endOffset = startOffset + this._activeText.length;

      const existing = await this.store.getByVerse(bookId, chapter, verseNum);
      const overlapping = existing.filter(
        h => h.type === 'partial' && h.startOffset < endOffset && h.endOffset > startOffset
      );
      for (const h of overlapping) {
        await this.store.delete(h.id);
      }

      verseNums.push(verseNum);
    }

    // Remove bookmarks for selected verses
    if (verseNums.length) {
      const chapterBm = await this.bridge.selection.getBookmarksForChapter(bookId, chapter);
      const toRemove = new Set();
      for (const vn of verseNums) {
        for (const b of chapterBm) {
          if ((b.verses || [b.verse]).includes(vn)) toRemove.add(b.id);
        }
      }
      for (const id of toRemove) {
        await this.bridge.selection.deleteItem(id);
      }
      const baseRenderer = this.bridge.get('base-renderer');
      if (baseRenderer) baseRenderer.applyBookmarks();
    }

    const interaction = this.bridge.get('interaction-manager');
    if (this._activeContainers && this._activeContainers.length) {
      if (interaction) interaction.clearSelection();
    } else {
      if (interaction) interaction.clearTempSelection();
    }
    this._activeContainers = null;
    this._tempSelection = null;
    this._activeText = '';
    this._hideToolbar();

    // Re-render highlights for the affected verses
    for (const vn of verseNums) {
      await this._renderHighlightsForSingleVerse(bookId, chapter, vn);
    }
  }

  async _addBookmark() {
    if (!this._activeText) return;

    const verses = this._collectVerses();
    if (!verses.length) return;

    this._pendingBookmark = {
      bookId: this.bridge.state.get('currentBook'),
      chapter: this.bridge.state.get('currentChapter'),
      verses,
      text: this._activeText
    };
    this._showBookmarkSetPicker();
  }

  _collectVerses() {
    if (this._activeContainers) {
      return Array.from(this._activeContainers).map(c => {
        const vne = c.querySelector('.verse-num');
        return vne ? parseInt(vne.textContent) : null;
      }).filter(v => v !== null);
    }
    if (this._tempSelection) {
      const container = this._tempSelection.closest('.verse-container');
      if (!container) return [];
      const vne = container.querySelector('.verse-num');
      if (!vne) return [];
      return [parseInt(vne.textContent)];
    }
    if (this._multiVerseRange) {
      const range = this._multiVerseRange;
      const allContainers = document.querySelectorAll('#content .verse-container');
      const startNode = range.startContainer;
      const endNode = range.endContainer;
      const startContainer = startNode.nodeType === Node.TEXT_NODE
        ? startNode.parentElement?.closest('.verse-container')
        : startNode.closest?.('.verse-container');
      const endContainer = endNode.nodeType === Node.TEXT_NODE
        ? endNode.parentElement?.closest('.verse-container')
        : endNode.closest?.('.verse-container');
      if (!startContainer || !endContainer) return [];

      const startIdx = Array.from(allContainers).indexOf(startContainer);
      const endIdx = Array.from(allContainers).indexOf(endContainer);
      if (startIdx === -1 || endIdx === -1) return [];

      const verses = [];
      for (let i = startIdx; i <= endIdx; i++) {
        const vne = allContainers[i].querySelector('.verse-num');
        if (vne) verses.push(parseInt(vne.textContent));
      }
      return verses;
    }
    return [];
  }

  _showBookmarkSetPicker() {
    const picker = document.getElementById('bookmark-set-picker');
    if (!picker) return;
    const options = document.getElementById('bsp-options');
    if (!options) return;

    this._hideBookmarkSetPicker();

    const toolbarRect = this._toolbar.getBoundingClientRect();
    const pickerW = 200;
    const pickerH = 260;
    picker.style.left = Math.max(8, toolbarRect.left - pickerW - 8) + 'px';
    picker.style.top = Math.max(8, Math.min(window.innerHeight - pickerH - 8, toolbarRect.bottom - pickerH)) + 'px';

    this.bridge.selection.getAllBookmarkSets().then(sets => {
      options.innerHTML = '';

      const noSet = document.createElement('button');
      noSet.className = 'bsp-option';
      noSet.textContent = 'No Set';
      noSet.addEventListener('click', () => this._completeBookmark(null));
      options.appendChild(noSet);

      if (sets.length) {
        const sep = document.createElement('div');
        sep.className = 'bsp-sep';
        options.appendChild(sep);
      }

      for (const s of sets) {
        const btn = document.createElement('button');
        btn.className = 'bsp-option';
        const badge = document.createElement('span');
        badge.className = 'bsp-badge';
        badge.style.background = s.color || '#8B5CF6';
        badge.textContent = s.name.slice(0, 2).toUpperCase();
        btn.appendChild(badge);
        btn.appendChild(document.createTextNode(' ' + s.name));
        btn.addEventListener('click', () => this._completeBookmark(s.id));
        options.appendChild(btn);
      }

      const newSep = document.createElement('div');
      newSep.className = 'bsp-sep';
      options.appendChild(newSep);

      const newBtn = document.createElement('button');
      newBtn.className = 'bsp-option bsp-new';
      newBtn.textContent = '+ New Set';
      newBtn.addEventListener('click', (e) => { e.stopPropagation(); this._showNewSetInput(); });
      options.appendChild(newBtn);
    });

    this._pickerOpen = true;
    if (this._pickerMenu) this._pickerMenu.show();
    else picker.classList.remove('hidden');

    this._pickerHideHandler = (e) => {
      if (!picker.contains(e.target) && e.target !== this._toolbar) {
        const activeSet = this.bridge.state.get('activeBookmarkSet');
        this._completeBookmark(activeSet);
      }
    };
    if (!this._pickerMenu?.native) setTimeout(() => document.addEventListener('click', this._pickerHideHandler), 10);
  }

  _showNewSetInput() {
    this._hideBookmarkSetPicker();

    const COLORS = ColorTheme.getSetColors();

    const overlay = document.createElement('div');
    overlay.className = 'new-set-overlay';

    const box = document.createElement('div');
    box.className = 'new-set-box';

    const title = document.createElement('div');
    title.className = 'new-set-title';
    title.textContent = 'New Set';
    box.appendChild(title);

    const input = document.createElement('input');
    input.className = 'new-set-input';
    input.type = 'text';
    input.placeholder = 'Set name...';
    input.maxLength = 30;
    box.appendChild(input);

    const swatchRow = document.createElement('div');
    swatchRow.className = 'accent-swatches';
    const selectedColor = { current: COLORS[0].color };
    for (const c of COLORS) {
      const btn = document.createElement('button');
      btn.className = 'accent-swatch' + (c === COLORS[0] ? ' active' : '');
      btn.style.background = c.color;
      btn.setAttribute('aria-label', c.label);
      btn.addEventListener('click', () => {
        selectedColor.current = c.color;
        swatchRow.querySelectorAll('.accent-swatch').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      swatchRow.appendChild(btn);
    }
    box.appendChild(swatchRow);

    const actions = document.createElement('div');
    actions.className = 'new-set-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'new-set-btn new-set-cancel';
    cancelBtn.textContent = 'Cancel';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'new-set-btn new-set-save';
    saveBtn.textContent = 'Save';
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    box.appendChild(actions);

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    input.focus();

    const cleanup = () => overlay.remove();

    const doCreate = async () => {
      const name = input.value.trim();
      if (!name) return;
      cleanup();
      const id = await this.bridge.selection.saveBookmarkSet(name, selectedColor.current);
      this._completeBookmark(id);
    };

    saveBtn.addEventListener('click', doCreate);
    cancelBtn.addEventListener('click', () => {
      cleanup();
      this._pendingBookmark = null;
      this._hideToolbar();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doCreate();
      if (e.key === 'Escape') {
        cleanup();
        this._pendingBookmark = null;
        this._hideToolbar();
      }
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        this._pendingBookmark = null;
        this._hideToolbar();
      }
    });
  }

  async _completeBookmark(setId) {
    this._hideBookmarkSetPicker();
    if (!this._pendingBookmark) return;

    const pb = this._pendingBookmark;
    this._pendingBookmark = null;

    await this.bridge.selection.saveBookmark(
      pb.bookId, pb.chapter, pb.verses, pb.text, setId
    );

    const interaction = this.bridge.get('interaction-manager');
    if (interaction) interaction.clearSelection();
    this._tempSelection = null;
    this._multiVerseRange = null;
    this._activeContainers = null;
    this._activeText = '';
    this._hideToolbar();
  }

  _hideBookmarkSetPicker() {
    const picker = document.getElementById('bookmark-set-picker');
    this._pickerOpen = false;
    if (this._pickerMenu) this._pickerMenu.hide();
    else if (picker) picker.classList.add('hidden');
    if (this._pickerHideHandler) {
      document.removeEventListener('click', this._pickerHideHandler);
      this._pickerHideHandler = null;
    }
  }

  _getCurrentTranslationAbbr() {
    const activeId = this._activeTranslationId;
    if (activeId) {
      const manifest = this.bridge.translationManifest;
      if (manifest) {
        const entry = manifest.find(t => t.id === activeId);
        if (entry) return entry.shortname || activeId;
      }
      return activeId.replace(/_(?:v)?\d+$/i, '');
    }
    const id = this.bridge.state.get('currentTranslation') || '';
    const manifest = this.bridge.translationManifest;
    if (manifest && manifest.length) {
      const entry = manifest.find(t => t.id === id);
      if (entry) return entry.shortname || entry.id;
    }
    return id.replace(/_(?:v)?\d+$/i, '');
  }

  _extractCleanVerseText(verseText) {
    if (!verseText) return '';
    const walker = document.createTreeWalker(verseText, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);

    const isExcluded = (node) => {
      let parent = node.parentNode;
      while (parent && parent !== verseText) {
        if (parent.tagName === 'SUP' ||
            (parent.classList && (parent.classList.contains('footnote-caller') ||
                parent.classList.contains('crossref-indicator') ||
                parent.classList.contains('token-section-heading-ref') ||
                parent.classList.contains('verse-num')))) {
          return true;
        }
        parent = parent.parentNode;
      }
      return false;
    };

    const OPENING = /[\u2018\u201c\u201b\u00ab([{]/;
    const CLOSING = /[\u2019\u201d\u00bb)\]},.!?:;]/;
    let out = '';
    let lastChar = '';
    let lastTextParent = null;
    let boundaryPending = false;
    let prevWasBionic = false;

    for (const node of nodes) {
      if (node.nodeType === 1) {
        boundaryPending = true;
        continue;
      }
      if (isExcluded(node)) {
        boundaryPending = true;
        continue;
      }
      const raw = node.textContent;
      if (!raw) {
        boundaryPending = true;
        continue;
      }
      const parent = node.parentElement;
      const parentChanged = lastTextParent && parent !== lastTextParent;
      const adjacentText = lastTextParent && parent === lastTextParent && !boundaryPending;
      const first = raw[0];
      if (lastChar && !/\s/.test(lastChar) && !/\s/.test(first) &&
          (boundaryPending || parentChanged || adjacentText) &&
          !prevWasBionic && !OPENING.test(lastChar) && !CLOSING.test(first)) {
        out += ' ';
      }
      out += raw.replace(/\u00A0/g, ' ');
      lastChar = raw[raw.length - 1];
      lastTextParent = parent;
      prevWasBionic = !!(parent && parent.tagName === 'B');
      boundaryPending = false;
    }
    return out.replace(/\s{2,}/g, ' ').trim();
  }

  _cleanCopiedText(text) {
    if (!text) return text;
    return text
      .replace(/\u00A0/g, ' ')
      .replace(/^(\d+)(?=[^\s.,;:!?)\]}"\u2019\u201d])/, '$1 ')
      .replace(/([;:,])(?=[A-Za-z\u2018\u201c\u00ab])/g, '$1 ');
  }

  _copyText() {
    const interaction = this.bridge.get('interaction-manager');
    const state = this.bridge.state;
    let text = '';

    if (interaction && interaction.selectedVerses && interaction.selectedVerses.size) {
      const containers = Array.from(interaction.selectedVerses);
      const verseNums = [];
      const cleanTexts = [];

      for (const c of containers) {
        const vn = c.querySelector('.verse-num');
        const vt = c.querySelector('.verse-text');
        if (!vn || !vt) continue;
        const num = parseInt(vn.textContent);
        if (isNaN(num)) continue;
        verseNums.push(num);
        cleanTexts.push(this._extractCleanVerseText(vt));
      }

      if (cleanTexts.length) {
        const body = cleanTexts.join(' ');
        verseNums.sort((a, b) => a - b);
        let verseRef;
        if (verseNums.length === 1) {
          verseRef = `${verseNums[0]}`;
        } else {
          const isConsecutive = verseNums.every((n, i) => i === 0 || n === verseNums[i - 1] + 1);
          verseRef = isConsecutive
            ? `${verseNums[0]}–${verseNums[verseNums.length - 1]}`
            : verseNums.join(',');
        }
        const bookName = state.get('currentBookName') || '';
        const chapter = state.get('currentChapter') || '';
        const translation = this._getCurrentTranslationAbbr();
        text = `${body} ${bookName} ${chapter}:${verseRef} ${translation}`.trim();
      }
    }

    if (!text) text = this._cleanCopiedText(this._activeText || '');
    if (!text) return;

    let copied = false;
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      ta.style.width = '1px';
      ta.style.height = '1px';
      ta.style.opacity = '0';
      ta.style.pointerEvents = 'none';
      ta.readOnly = true;
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      copied = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (_) { console.error('[highlights] copy fallback failed:'); }

    if (!copied && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => { console.warn('[highlights] clipboard write failed'); });
    }

    if (interaction) interaction.clearSelection();
    this._tempSelection = null;
    this._multiVerseRange = null;
    this._activeContainers = null;
    this._activeText = '';
    this._activeTranslationId = null;
    this._hideToolbar();
  }

  _addNote() {
    const state = this.bridge.state;
    const bookName = state.get('currentBookName') || '';
    const chapter = state.get('currentChapter') || '';
    const interaction = this.bridge.get('interaction-manager');
    let ref = '';
    let text = '';

    if (interaction && interaction.selectedVerses && interaction.selectedVerses.size) {
      const containers = Array.from(interaction.selectedVerses);
      const verseNums = [];
      const cleanTexts = [];
      for (const c of containers) {
        const vn = c.querySelector('.verse-num');
        const vt = c.querySelector('.verse-text');
        if (!vn || !vt) continue;
        const num = parseInt(vn.textContent);
        if (isNaN(num)) continue;
        verseNums.push(num);
        const body = this._extractCleanVerseText(vt);
        if (body) cleanTexts.push('\x00SUP\x00' + num + '\x00/SUP\x00 ' + body);
      }
      if (verseNums.length) {
        verseNums.sort((a, b) => a - b);
        if (verseNums.length === 1) {
          ref = `[${bookName} ${chapter}:${verseNums[0]}]`;
        } else {
          const cons = verseNums.every((n, i) => i === 0 || n === verseNums[i - 1] + 1);
          ref = cons
            ? `[${bookName} ${chapter}:${verseNums[0]}-${verseNums[verseNums.length - 1]}]`
            : `[${bookName} ${chapter}:${verseNums[0]}]`;
        }
        text = cleanTexts.join(' ');
      }
    }

    if (!text) text = this._cleanCopiedText(this._activeText || '');

    let content = '';
    if (ref || text) {
      content = (ref || '') + (text ? '\n> ' + text : '');
    }

    if (interaction) interaction.clearSelection();
    this._tempSelection = null;
    this._multiVerseRange = null;
    this._activeContainers = null;
    this._activeText = '';
    this._activeTranslationId = null;
    this._hideToolbar();

    const notesUI = this.bridge.get('notes-ui');
    if (notesUI) {
      notesUI.newNote({ content });
    }
  }

  _calcOffsetFromSpan(parentEl, span) {
    const walker = document.createTreeWalker(parentEl, NodeFilter.SHOW_TEXT, null, false);
    let pos = 0;
    let node;
    let maxNodes = 5000;
    while ((node = walker.nextNode()) && maxNodes-- > 0) {
      if (span.contains(node)) break;
      pos += node.textContent.length;
    }
    return pos;
  }

  _applyPartialHighlight(container, hl) {
    const vt = container.querySelector('.verse-text');
    if (!vt) return;
    vt.normalize();

    const textNodes = [];
    const walker = document.createTreeWalker(vt, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while (node = walker.nextNode()) textNodes.push(node);

    let pos = 0;
    let startNode = null, startOff = 0;
    let endNode = null, endOff = 0;
    let started = false;

    for (const tn of textNodes) {
      const len = tn.textContent.length;
      const nodeStart = pos;
      const nodeEnd = pos + len;

      if (!started) {
        if (hl.startOffset >= nodeStart && hl.startOffset < nodeEnd) {
          started = true;
          startNode = tn;
          startOff = hl.startOffset - nodeStart;
          if (hl.endOffset <= nodeEnd) {
            endNode = tn;
            endOff = hl.endOffset - nodeStart;
            break;
          }
        }
      } else {
        if (hl.endOffset <= nodeEnd) {
          endNode = tn;
          endOff = hl.endOffset - nodeStart;
          break;
        }
      }
      pos += len;
    }

    if (startNode) {
      const span = document.createElement('span');
      span.className = window.HighlightStore.colorToClass(hl.color);
      const range = document.createRange();
      range.setStart(startNode, Math.min(startOff, startNode.textContent.length));
      const finalNode = endNode || startNode;
      const finalOff = endNode ? endOff : Math.min(startOff, startNode.textContent.length);
      range.setEnd(finalNode, Math.min(finalOff, finalNode.textContent.length));
      try {
        range.surroundContents(span);
      } catch (_) {
        const frag = range.extractContents();
        span.appendChild(frag);
        range.insertNode(span);
      }
    }
  }

  async _renderHighlightsForSingleVerse(bookId, chapter, verseNum) {
    const containers = document.querySelectorAll('#content .verse-container');
    const container = Array.from(containers).find(
      el => parseInt(el.querySelector('.verse-num')?.textContent) === verseNum
    );
    if (!container) return;

    container.classList.remove('highlighted');
    container.style.removeProperty('--hl-color');
    const els = container.querySelectorAll('mark, span.temp-selection, span.hl-yellow, span.hl-green, span.hl-blue, span.hl-orange, span.hl-purple, span.hl-red');
    for (const el of els) el.replaceWith(...el.childNodes);
    container.normalize();

    const highlights = await this.store.getByVerse(bookId, chapter, verseNum);

    const fullHl = highlights.find(h => h.type === 'full');
    if (fullHl) {
      container.classList.add('highlighted');
      container.style.setProperty('--hl-color', fullHl.color);
    }

    const partials = highlights.filter(h => h.type === 'partial');
    for (const hl of partials) {
      this._applyPartialHighlight(container, hl);
    }
  }

  async renderHighlightsForChapter(bookId, chapter) {
    if (!bookId || !chapter) {
      bookId = this.bridge.state.get('currentBook');
      chapter = this.bridge.state.get('currentChapter');
    }
    const highlights = await this.store.getForChapter(bookId, chapter);
    const containers = this.bridge.state.get('continuousChapters') === true
      ? document.querySelectorAll('#content .verse-container[data-book="' + bookId + '"][data-chapter="' + chapter + '"]')
      : document.querySelectorAll('#content .verse-container');

    for (const c of containers) {
      c.classList.remove('highlighted');
      c.style.removeProperty('--hl-color');
      const els = c.querySelectorAll('mark, span.temp-selection, span.hl-yellow, span.hl-green, span.hl-blue, span.hl-orange, span.hl-purple, span.hl-red');
      for (const el of els) el.replaceWith(...el.childNodes);
      c.normalize();
    }

    for (const hl of highlights) {
      if (hl.type === 'full' && hl.verseEnd) {
        for (const c of containers) {
          const vn = parseInt(c.querySelector('.verse-num')?.textContent);
          if (vn >= hl.verse && vn <= hl.verseEnd) {
            c.classList.add('highlighted');
            c.style.setProperty('--hl-color', hl.color);
          }
        }
      } else if (hl.type === 'full') {
        const c = Array.from(containers).find(
          el => parseInt(el.querySelector('.verse-num')?.textContent) === hl.verse
        );
        if (!c) continue;
        c.classList.add('highlighted');
        c.style.setProperty('--hl-color', hl.color);
      } else if (hl.type === 'partial') {
        const c = Array.from(containers).find(
          el => parseInt(el.querySelector('.verse-num')?.textContent) === hl.verse
        );
        if (!c) continue;
        this._applyPartialHighlight(c, hl);
      }
    }
  }
};
