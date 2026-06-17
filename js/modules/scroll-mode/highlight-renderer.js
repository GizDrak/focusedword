window.HighlightRenderer = class HighlightRenderer {
  constructor() {
    this._supportsCustomHighlight = 'highlights' in CSS;
    this._lastRange = null;
    this._highlightStyleInjected = false;

    if (this._supportsCustomHighlight) {
      try {
        CSS.highlights.set('reading-position', new Highlight());
      } catch (e) {
        this._supportsCustomHighlight = false;
      }
    }
  }

  _injectHighlightStyle() {
    if (this._highlightStyleInjected) return;
    this._highlightStyleInjected = true;
    const style = document.createElement('style');
    style.id = 'reading-tracker-highlight-style';
    style.textContent = `::highlight(reading-position) { background-color: var(--reading-highlight-color, rgba(255, 230, 0, 0.4)); }`;
    document.head.appendChild(style);
  }

  _rangesEqual(a, b) {
    if (!a || !b) return a === b;
    return a.startContainer === b.startContainer &&
           a.startOffset === b.startOffset &&
           a.endContainer === b.endContainer &&
           a.endOffset === b.endOffset;
  }

  highlight(range) {
    if (this._rangesEqual(range, this._lastRange)) return;
    this._lastRange = range;

    this.clear();

    if (this._supportsCustomHighlight) {
      this._injectHighlightStyle();
      const hl = CSS.highlights.get('reading-position');
      if (hl) {
        hl.clear();
        hl.add(range);
      }
    } else {
      const mark = document.createElement('mark');
      mark.className = 'reading-highlight';
      try {
        const span = document.createElement('span');
        span.appendChild(range.cloneContents());
        mark.appendChild(span);
      } catch (e) {
        return;
      }
      const rects = range.getClientRects();
      if (!rects.length) return;
      const container = range.startContainer.parentElement;
      if (!container) return;

      const parentRect = container.getBoundingClientRect();
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        const hlEl = document.createElement('div');
        hlEl.className = 'reading-highlight-char';
        hlEl.style.cssText = `
          position: absolute;
          pointer-events: none;
          left: ${r.left - parentRect.left}px;
          top: ${r.top - parentRect.top}px;
          width: ${r.width}px;
          height: ${r.height}px;
          background: var(--reading-highlight-color, rgba(255, 230, 0, 0.4));
          z-index: 1;
        `;
        container.appendChild(hlEl);
      }
    }
  }

  clear() {
    this._lastRange = null;

    if (this._supportsCustomHighlight) {
      const hl = CSS.highlights.get('reading-position');
      if (hl) hl.clear();
    }

    document.querySelectorAll('.reading-highlight, .reading-highlight-char').forEach(el => el.remove());
  }

  destroy() {
    this.clear();
    const style = document.getElementById('reading-tracker-highlight-style');
    if (style) style.remove();
    if (this._supportsCustomHighlight) {
      try {
        CSS.highlights.delete('reading-position');
      } catch (e) {}
    }
  }
};
