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
    if (this._isCrossRefTap(e)) return;
    if (this._isFootnoteTap(e)) return;
    if (this._isSectionHeadingRefTap(e)) return;
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

  _isCrossRefTap(e) {
    if (e.target.closest('.crossref-indicator')) return true;
    const vc = e.target.closest('.verse-container');
    if (!vc) return false;
    const ind = vc.querySelector('.crossref-indicator');
    if (!ind) return false;
    const r = ind.getBoundingClientRect();
    const pad = 24;
    return e.clientX >= r.left - pad && e.clientX <= r.right + pad &&
           e.clientY >= r.top - pad && e.clientY <= r.bottom + pad;
  }

  _isFootnoteTap(e) {
    return !!e.target.closest('.footnote-caller');
  }

  _isSectionHeadingRefTap(e) {
    return !!e.target.closest('.token-section-heading-ref');
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
    document.body.classList.add('selection-mode');
    document.getElementById('content').classList.add('verse-selecting');
    this.selectedVerses.add(verseContainer);
    verseContainer.classList.add('temp-selected');
    // To revert to old sidebar indicator, replace with: this._addOldUnderline(verseContainer);
    this._addUnderline(verseContainer);
    this._emitVerseSelection();
  }

  _toggleVerseSelection(container) {
    if (this.selectedVerses.has(container)) {
      this.selectedVerses.delete(container);
      container.classList.remove('temp-selected');
      // To revert: this._removeOldUnderline(container);
      this._removeUnderline(container);
    } else {
      this.selectedVerses.add(container);
      container.classList.add('temp-selected');
      // To revert: this._addOldUnderline(container);
      this._addUnderline(container);
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
      .map(v => {
        const vt = v.querySelector('.verse-text');
        if (!vt) return '';
        const parts = Array.from(vt.childNodes).filter(n => n.nodeType === Node.TEXT_NODE || (n.classList && !n.classList.contains('verse-num')));
        return parts.map(n => n.textContent).join('').trim();
      })
      .filter(Boolean)
      .join(' ');

    this.bridge.emit('selection:active', {
      mode: 'verse',
      text,
      rect,
      verses: Array.from(this.selectedVerses)
    });
  }

  _addUnderline(verseContainer) {
    var verseText = verseContainer.querySelector('.verse-text');
    if (!verseText) return;
    var color = getComputedStyle(verseText).getPropertyValue('--accent-gold').trim() || '#8B5CF6';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 32" preserveAspectRatio="none"><path d="M3,23 C130,16 220,29 330,21 C420,15 500,27 570,20 C582,18 590,19 597,17" stroke="' + color + '" stroke-width="7" fill="none" stroke-linecap="round"/></svg>';
    var dataUri = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
    var isInline = getComputedStyle(verseText).display === 'inline';
    if (isInline) {
      verseText.style.backgroundImage = dataUri;
    } else {
      var tokens = verseText.querySelectorAll('.token-text');
      if (tokens.length) {
        for (var i = 0; i < tokens.length; i++) {
          tokens[i].style.backgroundImage = dataUri;
        }
      } else {
        verseText.style.backgroundImage = dataUri;
      }
    }
  }

  _removeUnderline(verseContainer) {
    var verseText = verseContainer.querySelector('.verse-text');
    if (!verseText) return;
    var isInline = getComputedStyle(verseText).display === 'inline';
    if (isInline) {
      verseText.style.backgroundImage = '';
    } else {
      var tokens = verseText.querySelectorAll('.token-text');
      if (tokens.length) {
        for (var i = 0; i < tokens.length; i++) {
          tokens[i].style.backgroundImage = '';
        }
      } else {
        verseText.style.backgroundImage = '';
      }
    }
  }

  _removeAllUnderlines() {
    var self = this;
    self.selectedVerses.forEach(function (vc) {
      var vt = vc.querySelector('.verse-text');
      if (!vt) return;
      var isInline = getComputedStyle(vt).display === 'inline';
      if (isInline) {
        vt.style.backgroundImage = '';
      } else {
        var tokens = vt.querySelectorAll('.token-text');
        if (tokens.length) {
          for (var i = 0; i < tokens.length; i++) {
            tokens[i].style.backgroundImage = '';
          }
        } else {
          vt.style.backgroundImage = '';
        }
      }
    });
  }

  // ======== Old selection style (border-left sidebar indicator) ========
  // These are preserved as callable alternatives. To switch back
  // from the SVG underline to the old sidebar indicator:
  //   1. Swap the calls in _enterSelectionMode, _toggleVerseSelection,
  //      and clearSelection to point to these methods instead.
  //   2. Uncomment the old CSS block in styles.css.
  _addOldUnderline(_verseContainer) {}
  _removeOldUnderline(_verseContainer) {}
  _removeAllOldUnderlines() {}

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
    document.body.classList.remove('selection-mode');
    const content = document.getElementById('content');
    if (content) content.classList.remove('verse-selecting');
    // To revert: this._removeAllOldUnderlines();
    this._removeAllUnderlines();
    this.selectedVerses.forEach(v => v.classList.remove('temp-selected'));
    this.selectedVerses.clear();
    this._dismissWordSelection();
  }

  clearTempSelection() {
    this.clearSelection();
  }
};
