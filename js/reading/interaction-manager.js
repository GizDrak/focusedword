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
    this._selectionAnchor = null;
    this._selectionRoot = null;
    this._longPressTimer = null;
    this._longPressHandled = false;
    this._longPressTarget = null;
    this._longPressMoveCancel = null;
    this.init();
  }

  init() {
    document.addEventListener('contextmenu', (e) => {
      if (this.selectionMode) {
        e.preventDefault();
        return;
      }
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return;
      e.preventDefault();
    });

    const selectionContainers = ['content', 'panel-right-body']
      .map(id => document.getElementById(id))
      .filter(Boolean);

    for (const container of selectionContainers) {
      container.addEventListener('pointerdown', (e) => this._onPointerDown(e));
      container.addEventListener('pointerup', (e) => this._onPointerUp(e));
      container.addEventListener('click', (e) => this._onWordStudyClick(e), true);
      container.addEventListener('selectstart', (e) => {
        if (this.selectionMode) e.preventDefault();
      });
    }

    document.addEventListener('selectionchange', () => {
      if (this.selectionMode) {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.rangeCount) {
          sel.removeAllRanges();
        }
      }
    });

    this.bridge.on('nav:chapter-loaded', () => this.clearSelection());

    document.addEventListener('click', (e) => {
      if (!this.selectionMode) return;
      if (e.target.closest('.verse-container:not(.section-heading-container)')) return;
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

    if (this.selectionMode) {
      const vc = e.target.closest('.verse-container:not(.section-heading-container)');
      if (!vc) return;
      if (e.target.closest('.footnote-caller') ||
          e.target.closest('.crossref-indicator') ||
          e.target.closest('.token-cross-ref') ||
          e.target.closest('.token-section-heading-ref')) {
        return;
      }
      if (this._isSideZone(e)) return;
      if (!e.target.closest('.verse-text') && !e.target.closest('.verse-num')) return;

      this._clearLongPressTimer();
      this._longPressTarget = vc;
      this._longPressHandled = false;
      e.preventDefault();

      const sel = window.getSelection();
      if (sel) sel.removeAllRanges();

      const root = e.currentTarget;
      root.style.webkitUserSelect = 'none';
      root.style.userSelect = 'none';

      const onMove = (me) => {
        const dx = Math.abs(me.clientX - this._pointerStartX);
        const dy = Math.abs(me.clientY - this._pointerStartY);
        if (dx > 10 || dy > 10) this._clearLongPressTimer();
      };
      root.addEventListener('pointermove', onMove);
      this._longPressMoveCancel = () => root.removeEventListener('pointermove', onMove);

      this._longPressTimer = setTimeout(() => {
        this._longPressTimer = null;
        this._longPressHandled = true;
        if (this._longPressMoveCancel) {
          this._longPressMoveCancel();
          this._longPressMoveCancel = null;
        }
        if (this._selectionAnchor && this._longPressTarget) {
          this._performRangeSelection(this._longPressTarget);
        }
        this._longPressTarget = null;
      }, 500);
      return;
    }

    if (this._multiVerseRange) {
      if (Date.now() - this._selectionCreatedTime < 150) return;
      if (e.target.closest('.highlight-toolbar')) return;
      if (e.target.closest('#wckey-panel')) return;
      this._dismissWordSelection();
      return;
    }

    if (!this._tempSelection) return;

    if (Date.now() - this._selectionCreatedTime < 150) return;
    if (e.target.closest('.temp-selection') || e.target.closest('.highlight-toolbar')) return;
    if (e.target.closest('#wckey-panel')) return;
    this._dismissWordSelection();
  }

  _isSideZone(e) {
    if (!this.bridge.state?.get('spotlightMode')) return false;
    const el = this._selectionRoot || e.currentTarget || document.getElementById('content');
    const r = el.getBoundingClientRect();
    const side = Math.min(80, Math.max(56, window.innerWidth * 0.15));
    const relX = e.clientX - r.left;
    return relX < side || relX > r.width - side;
  }

  _onPointerUp(e) {
    const dx = Math.abs(e.clientX - this._pointerStartX);
    const dy = Math.abs(e.clientY - this._pointerStartY);

    if (this.selectionMode) {
      if (this._longPressHandled) {
        this._longPressHandled = false;
        this._clearLongPressTimer();
        return;
      }
      this._clearLongPressTimer();
      const verseContainer = e.target.closest('.verse-container:not(.section-heading-container)');
      if (verseContainer && dx < 10 && dy < 10) {
        if (e.target.closest('.footnote-caller') ||
            e.target.closest('.crossref-indicator') ||
            e.target.closest('.token-cross-ref') ||
            e.target.closest('.token-section-heading-ref')) {
          return;
        }
        if (this._isSideZone(e)) return;
        if (!e.target.closest('.verse-text') && !e.target.closest('.verse-num')) return;
        this._toggleVerseSelection(verseContainer);
      } else if (!verseContainer) {
        this.clearSelection();
      }
      return;
    }

    if (dx < 10 && dy < 10) {
      const verseContainer = e.target.closest('.verse-container:not(.section-heading-container)');
      if (verseContainer) {
        if (this._wordStudyMode) return;
        if (e.target.closest('.footnote-caller') ||
            e.target.closest('.crossref-indicator') ||
            e.target.closest('.token-cross-ref') ||
            e.target.closest('.token-section-heading-ref')) {
          return;
        }
        if (this._isSideZone(e)) return;
        if (!e.target.closest('.verse-text') && !e.target.closest('.verse-num')) return;
        this._enterSelectionMode(verseContainer);
        return;
      }
    }

    var isDesktop = window.matchMedia('(any-hover: hover) and (any-pointer: fine)').matches;
    if (isDesktop && (dx >= 10 || dy >= 10)) return;

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
    const edgeThreshold = window.innerWidth * 0.15;
    if (e.clientX < edgeThreshold || e.clientX > window.innerWidth - edgeThreshold) return true;
    const contentRect = document.getElementById('content').getBoundingClientRect();
    const relX = (e.clientX - contentRect.left) / contentRect.width;
    return relX < 0.3 || relX > 0.7;
  }

  _enterSelectionMode(verseContainer) {
    if (this.selectionMode) return;
    this.selectionMode = true;
    document.body.classList.add('selection-mode');
    const root = verseContainer.closest('#content, #panel-right-body') || document.getElementById('content');
    root.classList.add('verse-selecting');
    this._selectionRoot = root;
    this.selectedVerses.add(verseContainer);
    verseContainer.classList.add('temp-selected');
    this._addSelectionStyle(verseContainer);
    this._selectionAnchor = verseContainer;
    this._emitVerseSelection();
  }

  _toggleVerseSelection(container) {
    if (this.selectedVerses.has(container)) {
      this.selectedVerses.delete(container);
      container.classList.remove('temp-selected');
      this._removeSelectionStyle(container);
    } else {
      this.selectedVerses.add(container);
      container.classList.add('temp-selected');
      this._addSelectionStyle(container);
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

    const firstContainer = this.selectedVerses.values().next().value;
    const inRightPanel = firstContainer && firstContainer.closest('#panel-right-body');
    let translationId;
    if (inRightPanel) {
      const splitMode = this.bridge.get('split-mode');
      if (splitMode) translationId = splitMode._rightTranslation;
    }

    this.bridge.emit('selection:active', {
      mode: 'verse',
      text,
      rect,
      verses: Array.from(this.selectedVerses),
      translationId
    });
  }

  /* SVG underline style — preserved for potential revert */
  _addSvgUnderline(verseContainer) {
    var verseText = verseContainer.querySelector('.verse-text');
    if (!verseText) return;
    var color = getComputedStyle(verseText).getPropertyValue('--accent-color').trim() || '#8B5CF6';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 32" preserveAspectRatio="none"><path d="M3,23 C130,16 220,29 330,21 C420,15 500,27 570,20 C582,18 590,19 597,17" stroke="' + color + '" stroke-width="7" fill="none" stroke-linecap="round"/></svg>';
    var dataUri = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
    var isInline = getComputedStyle(verseText).display === 'inline';
    if (isInline) {
      verseText.style.backgroundImage = dataUri;
    } else {
      var texts = verseText.querySelectorAll('.token-text');
      for (var i = 0; i < texts.length; i++) {
        texts[i].style.backgroundImage = dataUri;
      }
      var poetryLines = verseText.querySelectorAll('.poetry-line');
      for (var i = 0; i < poetryLines.length; i++) {
        poetryLines[i].style.backgroundImage = dataUri;
      }
    }
  }

  _removeSvgUnderline(verseContainer) {
    var verseText = verseContainer.querySelector('.verse-text');
    if (!verseText) return;
    var isInline = getComputedStyle(verseText).display === 'inline';
    if (isInline) {
      verseText.style.backgroundImage = '';
    } else {
      var texts = verseText.querySelectorAll('.token-text');
      for (var i = 0; i < texts.length; i++) {
        texts[i].style.backgroundImage = '';
      }
      var poetryLines = verseText.querySelectorAll('.poetry-line');
      for (var i = 0; i < poetryLines.length; i++) {
        poetryLines[i].style.backgroundImage = '';
      }
    }
  }

  _removeAllSvgUnderlines() {
    var self = this;
    self.selectedVerses.forEach(function (vc) {
      var vt = vc.querySelector('.verse-text');
      if (!vt) return;
      var isInline = getComputedStyle(vt).display === 'inline';
      if (isInline) {
        vt.style.backgroundImage = '';
      } else {
        var texts = vt.querySelectorAll('.token-text');
        for (var i = 0; i < texts.length; i++) {
          texts[i].style.backgroundImage = '';
        }
        var poetryLines = vt.querySelectorAll('.poetry-line');
        for (var i = 0; i < poetryLines.length; i++) {
          poetryLines[i].style.backgroundImage = '';
        }
      }
    });
  }

  /* Card-style selection visual — no text node mutation, stable layout */
  _addSelectionStyle(verseContainer) {}
  _removeSelectionStyle(verseContainer) {}
  _removeAllSelectionStyles() {}

  _clearLongPressTimer() {
    if (this._longPressTimer) {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
    }
    if (this._longPressMoveCancel) {
      this._longPressMoveCancel();
      this._longPressMoveCancel = null;
    }
    const root = this._selectionRoot || document.getElementById('content');
    if (root) {
      root.style.webkitUserSelect = '';
      root.style.userSelect = '';
    }
    this._longPressTarget = null;
  }

  _performRangeSelection(targetContainer) {
    const root = this._selectionRoot || document.getElementById('content');
    const allContainers = Array.from(root.querySelectorAll('.verse-container[data-verse]'));
    const anchorIdx = allContainers.indexOf(this._selectionAnchor);
    const targetIdx = allContainers.indexOf(targetContainer);
    if (anchorIdx === -1 || targetIdx === -1) return;

    const start = Math.min(anchorIdx, targetIdx);
    const end = Math.max(anchorIdx, targetIdx);
    const toSelect = allContainers.slice(start, end + 1);

    for (const container of toSelect) {
      if (!this.selectedVerses.has(container)) {
        this.selectedVerses.add(container);
        container.classList.add('temp-selected');
        this._addSelectionStyle(container);
      }
    }
    this._emitVerseSelection();
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
    document.body.classList.remove('selection-mode');
    ['content', 'panel-right-body'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('verse-selecting');
    });
    this._removeAllSelectionStyles();
    this.selectedVerses.forEach(v => v.classList.remove('temp-selected'));
    this.selectedVerses.clear();
    this._dismissWordSelection();
    this._selectionAnchor = null;
    this._selectionRoot = null;
    this._clearLongPressTimer();
    this._longPressHandled = false;
  }

  clearTempSelection() {
    this.clearSelection();
  }

  get _wordStudyMode() {
    return this.bridge.state && this.bridge.state.get('wordStudyMode');
  }

  _onWordStudyClick(e) {
    if (!this._wordStudyMode) return;
    const target = this._resolveWordStudyTarget(e);
    if (!target) return;
    const verseContainer = target.closest('.verse-container:not(.section-heading-container)');
    if (!verseContainer) return;
    e.stopPropagation();
    e.preventDefault();
    e._wordStudyHandled = true;
    this._handleWordStudyTap(verseContainer, target);
  }

  _resolveWordStudyTarget(e) {
    let el = null;
    if (e.composedPath) {
      for (const p of e.composedPath()) {
        if (p.nodeType !== 1) continue;
        if (p.classList && p.classList.contains('word-study-target')) { el = p; break; }
      }
    }
    if (!el && e.target && e.target.closest) {
      el = e.target.closest('.word-study-target');
    }
    if (!el && e.target && typeof e.target.getAttribute === 'function' && e.target.getAttribute('data-wp')) {
      el = e.target;
    }
    if (!el && e.clientX !== undefined && e.clientY !== undefined) {
      const fp = document.elementFromPoint(e.clientX, e.clientY);
      if (fp) el = fp.closest('.word-study-target');
    }
    return el;
  }

  _handleWordStudyTap(verseContainer, target) {
    const wordPosition = parseInt(target.dataset.wp || target.getAttribute('data-wp'), 10);
    if (!wordPosition) return;

    const verseNumEl = verseContainer.querySelector('.verse-num');
    if (!verseNumEl) return;

    const verseNum = parseInt(verseNumEl.textContent, 10);
    if (!verseNum) return;

    const nav = this.bridge.get('navigation');
    const verseData = nav && nav.currentVerses.find(v => v.verse === verseNum);
    if (!verseData) return;

    const bookCode = verseData.book_code || '';
    const chapter = this.bridge.state.get('currentChapter');
    const verseId = `${bookCode}.${chapter}.${verseNum}`;

    const tokenId = target.dataset.tokenId || target.getAttribute('data-token-id') || null;

    this.bridge.emit('wordstudy:show', {
      verseId,
      wordPosition,
      tokenId,
      rect: target.getBoundingClientRect(),
    });
  }
}

function _addTokenTextUnderline(tokenText, dataUri) {
  tokenText.style.backgroundImage = dataUri;
}

function _removeTokenTextUnderline(tokenText) {
  tokenText.style.backgroundImage = '';
}

function _addPoetryLineUnderline(lineEl, dataUri) {
  lineEl.style.backgroundImage = dataUri;
}

function _removePoetryLineUnderline(lineEl) {
  lineEl.style.backgroundImage = '';
}
