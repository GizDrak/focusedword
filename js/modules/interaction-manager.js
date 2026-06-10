window.InteractionManager = class InteractionManager {
  constructor(bridge) {
    this.bridge = bridge;
    this.selectionMode = false;
    this.selectedVerses = new Set();
    this._pointerStartX = 0;
    this._pointerStartY = 0;
    this._pointerStartTime = 0;
    this._tempSelection = null;
    this._multiVerseRange = null;
    this._selectionCreatedTime = 0;
    this.init();
  }

  init() {
    document.addEventListener('contextmenu', (e) => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return;
      e.preventDefault();
    });

    const content = document.getElementById('content');
    content.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    content.addEventListener('pointerup', (e) => this._onPointerUp(e));

    this.bridge.on('nav:chapter-loaded', () => this.clearSelection());

    document.addEventListener('click', (e) => {
      if (!this.selectionMode) return;
      if (e.target.closest('.verse-container')) return;
      if (e.target.closest('.highlight-toolbar')) return;
      if (e.target.closest('.bookmark-set-picker')) return;
      this.clearSelection();
    }, true);
  }

  _onPointerDown(e) {
    this._pointerStartX = e.clientX;
    this._pointerStartY = e.clientY;
    this._pointerStartTime = Date.now();

    if (e.target.closest('.highlight-toolbar')) return;

    if (this.selectionMode) return;

    if (this._multiVerseRange) {
      if (Date.now() - this._selectionCreatedTime < 150) return;
      if (e.target.closest('.highlight-toolbar')) return;
      this._dismissWordSelection();
      return;
    }

    if (!this._tempSelection) return;

    if (Date.now() - this._selectionCreatedTime < 150) return;
    if (e.target.closest('.temp-selection') || e.target.closest('.highlight-toolbar')) return;
    this._dismissWordSelection();
  }

  _onPointerUp(e) {
    if (e.target.closest('.highlight-toolbar')) return;

    const dx = Math.abs(e.clientX - this._pointerStartX);
    const dy = Math.abs(e.clientY - this._pointerStartY);

    if (this.selectionMode) {
      const verseContainer = e.target.closest('.verse-container');
      if (verseContainer && dx < 10 && dy < 10) {
        if (this._isSpotlightEdgeTap(e)) return;
        this._toggleVerseSelection(verseContainer);
      } else if (!verseContainer) {
        this.clearSelection();
      }
      return;
    }

    if (dx < 10 && dy < 10) {
      const verseContainer = e.target.closest('.verse-container');
      if (verseContainer) {
        if (this._isSpotlightEdgeTap(e)) return;
        this._enterSelectionMode(verseContainer);
        return;
      }
    }

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !sel.toString().trim()) return;

    const range = sel.getRangeAt(0);
    const startNode = range.startContainer;
    const startVerseText = startNode.nodeType === Node.TEXT_NODE
      ? startNode.parentElement?.closest('.verse-text')
      : startNode.closest?.('.verse-text');

    if (!startVerseText) {
      sel.removeAllRanges();
      return;
    }

    const text = sel.toString().trim();
    const endNode = range.endContainer;
    const endVerseText = endNode.nodeType === Node.TEXT_NODE
      ? endNode.parentElement?.closest('.verse-text')
      : endNode.closest?.('.verse-text');

    if (endVerseText && endVerseText !== startVerseText) {
      this._multiVerseRange = range;
      sel.removeAllRanges();
      this._selectionCreatedTime = Date.now();
      this.bridge.emit('selection:active', {
        mode: 'word',
        text,
        rect: range.getBoundingClientRect(),
        tempEl: null,
        multiVerse: true,
        range
      });
      return;
    }

    const span = document.createElement('span');
    span.className = 'temp-selection';
    try {
      range.surroundContents(span);
    } catch (_) {
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    }

    sel.removeAllRanges();

    this._tempSelection = span;
    this._selectionCreatedTime = Date.now();
    this.bridge.emit('selection:active', {
      mode: 'word',
      text,
      rect: span.getBoundingClientRect(),
      tempEl: span
    });
  }

  _isSpotlightEdgeTap(e) {
    if (!this.bridge.state?.get('spotlightMode')) return false;
    const contentRect = document.getElementById('content').getBoundingClientRect();
    const relX = (e.clientX - contentRect.left) / contentRect.width;
    return relX < 0.3 || relX > 0.7;
  }

  _enterSelectionMode(verseContainer) {
    if (this.selectionMode) return;
    this.selectionMode = true;
    this.selectedVerses.add(verseContainer);
    verseContainer.classList.add('temp-selected');
    this._toggleVerseSelectingClass();
    this._emitVerseSelection();
  }

  _toggleVerseSelection(container) {
    if (this.selectedVerses.has(container)) {
      this.selectedVerses.delete(container);
      container.classList.remove('temp-selected');
    } else {
      this.selectedVerses.add(container);
      container.classList.add('temp-selected');
    }
    if (this.selectedVerses.size === 0) {
      this.clearSelection();
    } else {
      this._emitVerseSelection();
    }
  }

  _emitVerseSelection() {
    const firstVerse = Array.from(this.selectedVerses)[0];
    const rect = firstVerse.getBoundingClientRect();
    const text = Array.from(this.selectedVerses)
      .map(v => v.querySelector('.verse-text')?.textContent?.trim() || '')
      .filter(Boolean)
      .join(' ');

    this.bridge.emit('selection:active', {
      mode: 'verse',
      text,
      rect,
      verses: Array.from(this.selectedVerses)
    });
  }

  _dismissWordSelection() {
    this._multiVerseRange = null;
    if (this._tempSelection) {
      const parent = this._tempSelection.parentNode;
      if (parent) {
        this._tempSelection.replaceWith(...this._tempSelection.childNodes);
        parent.normalize();
      }
      this._tempSelection = null;
    }
    this._selectionCreatedTime = 0;
    this._clearedAt = Date.now();
    this.bridge.emit('selection:cleared', {});
  }

  clearSelection() {
    this.selectionMode = false;
    this.selectedVerses.forEach(v => v.classList.remove('temp-selected'));
    this.selectedVerses.clear();
    this._dismissWordSelection();
    this._toggleVerseSelectingClass();
  }

  _toggleVerseSelectingClass() {
    const content = document.getElementById('content');
    if (this.selectionMode && this.bridge.state?.get('spotlightMode')) {
      content.classList.add('verse-selecting');
    } else {
      content.classList.remove('verse-selecting');
    }
  }

  clearTempSelection() {
    this.clearSelection();
  }
};
