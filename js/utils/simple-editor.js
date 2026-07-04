window.SimpleEditor = class SimpleEditor {
  static get ALLOWED_TAGS() {
    return {
      p: {}, br: {}, strong: {}, em: {}, b: {}, i: {},
      h1: {}, h2: {}, h3: {},
      ul: {}, ol: {}, li: {},
      blockquote: {},
      hr: {},
      sup: {},
      span: { data: ['data-tag'] }
    };
  }

  constructor({ element, content = '', onUpdate, attributes = {} }) {
    this.element = element;
    this._onUpdate = onUpdate;
    this._history = [];
    this._historyIndex = -1;
    this._isUpdating = false;
    this._snapshotTimer = null;
    this._lastContent = '';

    element.contentEditable = 'true';
    element.innerHTML = this._sanitize(content) || '<p><br></p>';

    for (const [k, v] of Object.entries(attributes)) {
      element.setAttribute(k, v);
    }

    this._boundInput = (e) => this._onInput(e);
    this._boundKeydown = (e) => this._onKeyDown(e);
    this._boundBeforeInput = (e) => this._onBeforeInput(e);
    this._boundPaste = (e) => this._onPaste(e);

    element.addEventListener('input', this._boundInput);
    element.addEventListener('keydown', this._boundKeydown);
    element.addEventListener('beforeinput', this._boundBeforeInput);
    element.addEventListener('paste', this._boundPaste);

    this._lastContent = element.innerHTML;
    this._snapshot();
  }

  setContent(html) {
    this.element.innerHTML = this._sanitize(html) || '<p><br></p>';
    this._normalize();
    this._lastContent = this.element.innerHTML;
    this._snapshot();
    if (this._onUpdate) this._onUpdate();
  }

  getContent() {
    this._normalize();
    return this.element.innerHTML;
  }

  focus(where) {
    const sel = window.getSelection();
    let savedRange = null;
    if (sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      if (this.element.contains(r.commonAncestorContainer)) {
        savedRange = r.cloneRange();
      }
    }

    this.element.focus();

    const newSel = window.getSelection();

    if (where === 'start') {
      this._setCursorAtStart();
    } else if (where === 'end') {
      this._setCursorAtEnd();
    } else if (savedRange) {
      newSel.removeAllRanges();
      newSel.addRange(savedRange);
    } else {
      this._setCursorAtEnd();
    }
  }

  blur() {
    this.element.blur();
  }

  toggleBold() { this._command(() => this._toggleInline('strong')); }
  toggleItalic() { this._command(() => this._toggleInline('em')); }
  toggleSuperscript() { this._command(() => this._toggleInline('sup')); }

  toggleHeading(level) {
    this._command(() => {
      const blocks = this._getSelectedBlocks();
      if (!blocks.length) return;
      const tag = 'H' + Math.min(3, Math.max(1, level));
      const parent = blocks[0].parentNode;
      const ref = blocks[0].nextSibling;
      for (const block of blocks) {
        if (block.tagName !== tag) {
          this._convertBlock(block, tag);
        }
      }
      if (parent) {
        let target = ref ? ref.previousSibling : parent.lastChild;
        while (target && target.nodeType === 3) target = target.previousSibling;
        if (target) {
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(target);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    });
  }

  clearFormatting() {
    this._command(() => {
      const blocks = this._getSelectedBlocks();
      if (!blocks.length) return;
      for (const block of blocks) {
        const inlines = block.querySelectorAll('strong, em, b, i, code');
        for (const el of inlines) {
          const parent = el.parentNode;
          if (!parent) continue;
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          el.remove();
        }
        if (block.tagName === 'LI') {
          this._extractFromList(block);
        } else if (!['P', 'DIV'].includes(block.tagName)) {
          this._convertBlock(block, 'P');
        }
      }
    });
  }

  toggleBulletList() { this._command(() => this._toggleList('ul')); }
  toggleOrderedList() { this._command(() => this._toggleList('ol')); }

  toggleBlockquote() {
    this._command(() => {
      const blocks = this._getSelectedBlocks();
      if (!blocks.length) return;
      const inQuote = blocks.some(b => b.closest && b.closest('blockquote'));
      if (inQuote) {
        for (const b of blocks) {
          const q = b.closest('blockquote');
          if (q) this._unwrapBlock(q);
        }
      } else {
        this._wrapBlocksInTag(blocks, 'blockquote');
      }
    });
  }

  insertHorizontalRule() {
    this._command(() => {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const hr = document.createElement('hr');
      range.deleteContents();
      range.insertNode(hr);
      const p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      hr.parentNode.insertBefore(p, hr.nextSibling);
      const newRange = document.createRange();
      newRange.setStart(p, 0);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    });
    if (this.element.scrollHeight - this.element.scrollTop - this.element.clientHeight < 150) {
      this.element.scrollTop = this.element.scrollHeight;
    }
  }

  undo() {
    if (this._historyIndex <= 0) return;
    this._isUpdating = true;
    const entry = this._history[this._historyIndex - 1];
    if (entry) {
      this._historyIndex--;
      this.element.innerHTML = entry.html;
      this._restoreSelection(entry.anchorPath, entry.focusPath);
    }
    this._isUpdating = false;
    this._lastContent = this.element.innerHTML;
    if (this._onUpdate) this._onUpdate();
  }

  redo() {
    if (this._historyIndex >= this._history.length - 1) return;
    this._isUpdating = true;
    const entry = this._history[this._historyIndex + 1];
    if (entry) {
      this._historyIndex++;
      this.element.innerHTML = entry.html;
      this._restoreSelection(entry.anchorPath, entry.focusPath);
    }
    this._isUpdating = false;
    this._lastContent = this.element.innerHTML;
    if (this._onUpdate) this._onUpdate();
  }

  destroy() {
    this.element.removeEventListener('input', this._boundInput);
    this.element.removeEventListener('keydown', this._boundKeydown);
    this.element.removeEventListener('beforeinput', this._boundBeforeInput);
    this.element.removeEventListener('paste', this._boundPaste);
    this.element.contentEditable = 'false';
    if (this._snapshotTimer) clearTimeout(this._snapshotTimer);
  }

  setReadOnly(flag) {
    this.element.contentEditable = flag ? 'false' : 'true';
    this.element.classList.toggle('editing', !flag);
    if (!flag) {
      requestAnimationFrame(() => {
        this.element.focus();
        this._setCursorAtEnd();
      });
    }
  }

  setCursorAtTag(tagName) {
    const pills = this.element.querySelectorAll('.tag-pill');
    for (const pill of pills) {
      if (pill.dataset.tag === tagName) {
        const range = document.createRange();
        const sel = window.getSelection();
        let next = pill.nextSibling;
        if (next && next.nodeType === Node.TEXT_NODE) {
          range.setStart(next, next.textContent.length);
        } else {
          const sp = document.createTextNode(' ');
          pill.parentNode.insertBefore(sp, next || null);
          range.setStart(sp, 1);
        }
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        pill.scrollIntoView({ block: 'nearest' });
        return;
      }
    }
    this._setCursorAtEnd();
  }

  insertTagAtCursor() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    const offset = range.startOffset;

    if (node.nodeType === Node.TEXT_NODE && sel.isCollapsed) {
      const text = node.textContent;

      let wordEnd = offset;
      while (wordEnd > 0 && /\s/.test(text[wordEnd - 1])) wordEnd--;

      if (wordEnd > 0 && wordEnd === offset) {
        let wordStart = wordEnd;
        while (wordStart > 0 && /[\w-]/.test(text[wordStart - 1])) wordStart--;

        if (wordStart < wordEnd) {
          const word = text.slice(wordStart, wordEnd).toLowerCase();
          if (word && /^[\w-]+$/.test(word)) {
            const pill = document.createElement('span');
            pill.setAttribute('data-tag', word);
            pill.className = 'tag-pill';
            pill.contentEditable = 'false';
            pill.textContent = '#' + word;

            const trailing = wordEnd < text.length ? node.splitText(wordEnd) : null;
            const wordNode = node.splitText(wordStart);
            let parent = node.parentNode;
            const ref = trailing || wordNode.nextSibling;
            wordNode.remove();
            if (!node.textContent) node.remove();
            const INLINE_FMT_2 = new Set(['STRONG', 'B', 'EM', 'I', 'SUP']);
            if (parent && INLINE_FMT_2.has(parent.tagName) && parent.parentNode) {
              const gp = parent.parentNode;
              if (trailing) gp.insertBefore(trailing, parent.nextSibling);
              gp.insertBefore(pill, parent.nextSibling);
              if (!parent.textContent.trim() && !parent.children.length) parent.remove();
              
              // FIX 1: Use a non-breaking space
              const sp = document.createTextNode('\u00A0'); 
              gp.insertBefore(sp, pill.nextSibling || null);
            } else {
              parent.insertBefore(pill, ref);
              
              // FIX 2: Use a non-breaking space
              const space = document.createTextNode('\u00A0'); 
              parent.insertBefore(space, ref || null);
            }

            this._normalize();
            if (pill.parentNode) {
              const next = pill.nextSibling;
              if (next && next.nodeType === Node.TEXT_NODE) {
                const cr = document.createRange();
                const sel2 = window.getSelection();
                
                // FIX 3: Jump the cursor exactly past the non-breaking space
                cr.setStart(next, 1); 
                cr.collapse(true);
                sel2.removeAllRanges();
                sel2.addRange(cr);
              }
            }
            this._snapshot();
            this._lastContent = this.element.innerHTML;
            if (this._onUpdate) this._onUpdate();
            return;
          }
        }
      }
    }

    const r2 = window.getSelection();
    if (!r2.rangeCount) return;
    const rg = r2.getRangeAt(0);
    rg.deleteContents();
    const textNode2 = document.createTextNode('#');
    rg.insertNode(textNode2);
    this._normalize();
    const walker = document.createNodeIterator(this.element, NodeFilter.SHOW_TEXT);
    let n2;
    let cr2 = null;
    while (n2 = walker.nextNode()) {
      const idx = n2.textContent.indexOf('#');
      if (idx !== -1) {
        cr2 = document.createRange();
        cr2.setStart(n2, idx + 1);
        cr2.collapse(true);
        break;
      }
    }
    if (cr2) {
      r2.removeAllRanges();
      r2.addRange(cr2);
    }
    this._snapshot();
    this._lastContent = this.element.innerHTML;
    if (this._onUpdate) this._onUpdate();
  }

  /* ---------- cursor helpers ---------- */

  _setCursorAtStart() {
    const sel = window.getSelection();
    const firstText = this._getDeepestFirstNode(this.element);
    const range = document.createRange();
    if (firstText) {
      range.setStart(firstText, 0);
      range.collapse(true);
    } else {
      const firstBlock = this.element.firstElementChild;
      if (firstBlock) {
        range.setStart(firstBlock, 0);
        range.collapse(true);
      } else {
        range.setStart(this.element, 0);
        range.collapse(true);
      }
    }
    sel.removeAllRanges();
    sel.addRange(range);
  }

  _setCursorAtEnd() {
    const sel = window.getSelection();
    const lastText = this._getDeepestLastNode(this.element);
    const range = document.createRange();

    if (lastText && lastText.nodeType === Node.TEXT_NODE) {

      if (lastText.textContent.endsWith(' ')) {
        lastText.textContent = lastText.textContent.slice(0, -1) + '\u00A0';
      } else if (lastText.textContent === '') {
        lastText.textContent = '\u00A0';
      }

      let node = lastText.parentNode;
      let tagPillNode = null;
      let highestInline = null;

      while (node && node !== this.element) {
        if (node.classList && node.classList.contains('tag-pill')) {
          tagPillNode = node;
        }
        if (['STRONG', 'B', 'EM', 'I', 'SUP'].includes(node.tagName)) {
          highestInline = node;
        }
        node = node.parentNode;
      }

      if (tagPillNode) {
        const breakOutNode = highestInline || tagPillNode;
        let next = breakOutNode.nextSibling;

        if (next && next.nodeType === Node.TEXT_NODE) {
          if (next.textContent === '' || next.textContent === ' ') {
            next.textContent = '\u00A0';
          }
          range.setStart(next, next.textContent.length);
        } else {
          const sp = document.createTextNode('\u00A0');
          breakOutNode.parentNode.insertBefore(sp, next || null);
          range.setStart(sp, 1);
        }

        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }

      range.setStart(lastText, lastText.textContent.length);
      range.collapse(true);
    } else {
      const lastBlock = this.element.lastElementChild;
      if (lastBlock) {
        range.setStart(lastBlock, lastBlock.childNodes.length);
        range.collapse(true);
      } else {
        range.setStart(this.element, this.element.childNodes.length);
        range.collapse(true);
      }
    }

    sel.removeAllRanges();
    sel.addRange(range);
  }

  _getDeepestFirstNode(node) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
    return walker.firstChild();
  }

  _getDeepestLastNode(node) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
    let last = null;
    let current;
    while (current = walker.nextNode()) {
      last = current;
    }
    return last;
  }

  /* ---------- private ---------- */

  _command(fn) {
    this._snapshot();
    fn();
    this._normalize();
    this._snapshot();
    this._lastContent = this.element.innerHTML;
    if (this._onUpdate) this._onUpdate();
  }

  /* ---------- Input / Keyboard / Paste ---------- */

  _onInput(e) {
    if (this._isUpdating) return;

    if (e.data && /[\s,;.:!?)\]}>]/.test(e.data)) {
      const pill = this._applyTagRule();
      if (pill) {
        this._normalize();
        if (pill.parentNode) {
          const next = pill.nextSibling;
          if (next && next.nodeType === Node.TEXT_NODE) {
            const nr = document.createRange();
            const sel = window.getSelection();
            nr.setStart(next, next.textContent.length - 1);
            nr.collapse(true);
            sel.removeAllRanges();
            sel.addRange(nr);
          }
        }
        this._lastContent = this.element.innerHTML;
        if (this._onUpdate) this._onUpdate();
      }
    }

    if (this._snapshotTimer) clearTimeout(this._snapshotTimer);
    this._snapshotTimer = setTimeout(() => {
      const current = this.element.innerHTML;
      if (current !== this._lastContent) {
        this._lastContent = current;
        this._snapshot();
      }
      if (this._onUpdate) this._onUpdate();
    }, 400);
  }

  _onKeyDown(e) {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && e.shiftKey && key === 'z') {
      e.preventDefault();
      this.redo();
      return;
    }
    if (mod && (key === 'y')) {
      e.preventDefault();
      this.redo();
      return;
    }
    if (mod && key === 'z') {
      e.preventDefault();
      this.undo();
      return;
    }
    if (mod && key === 'b') {
      e.preventDefault();
      this.toggleBold();
      return;
    }
    if (mod && key === 'i') {
      e.preventDefault();
      this.toggleItalic();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      const sel = window.getSelection();
      if (sel.rangeCount && sel.isCollapsed) {
        const node = sel.anchorNode;
        const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
        const block = this._findBlock(el);
        if (block) {
          if (block.tagName === 'LI') {
            if (block.textContent.trim() === '' && !block.querySelector('img')) {
              e.preventDefault();
              this._exitList(block);
              return;
            }
            return;
          }
          const quote = block.closest?.('blockquote');
          if (quote && block.textContent.trim() === '' && !block.querySelector('img')) {
            e.preventDefault();
            block.remove();
            const p = document.createElement('p');
            p.appendChild(document.createElement('br'));
            quote.parentNode.insertBefore(p, quote.nextSibling);
            if (!quote.children.length) quote.remove();
            this._normalize();
            const newRange = document.createRange();
            newRange.setStart(p, 0);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
            return;
          }
        }
      }
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      this._scheduleImmediateSnapshot();
    }
  }

  _onBeforeInput(e) {
    if (e.inputType !== 'insertParagraph') return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    const block = this._findBlock(sel.anchorNode);
    if (!block) return;
    if (block.tagName === 'LI' && block.textContent.trim() === '' && !block.querySelector('img')) {
      e.preventDefault();
      this._exitList(block);
      return;
    }
    const quote = block.closest?.('blockquote');
    if (!quote || block.textContent.trim() !== '') return;
    e.preventDefault();
    block.remove();
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    quote.parentNode.insertBefore(p, quote.nextSibling);
    if (!quote.children.length) quote.remove();
    this._normalize();
    const range = document.createRange();
    range.setStart(p, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  _onPaste(e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    const html = (e.clipboardData || window.clipboardData).getData('text/html');
    const content = html ? this._sanitize(html) : this._escapeHtml(text).replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>');
    const wrapped = content ? '<p>' + content + '</p>' : '';
    const sel = window.getSelection();
    if (sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const frag = this._htmlToFragment(wrapped || '<p><br></p>');
      range.insertNode(frag);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    this._normalize();
    this._snapshot();
    this._lastContent = this.element.innerHTML;
    if (this._onUpdate) this._onUpdate();
  }

  _scheduleImmediateSnapshot() {
    if (this._snapshotTimer) clearTimeout(this._snapshotTimer);
    this._snapshotTimer = setTimeout(() => {
      this._normalize();
      const current = this.element.innerHTML;
      if (current !== this._lastContent) {
        this._lastContent = current;
        this._snapshot();
        if (this._onUpdate) this._onUpdate();
      }
    }, 50);
  }

  /* ---------- Tag pill conversion ---------- */

  _applyTagRule() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return false;

    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    let offset = range.startOffset;

    if (node.nodeType !== Node.TEXT_NODE) return false;

    const text = node.textContent;

    let tagEnd = offset;
    while (tagEnd > 0 && /\s/.test(text[tagEnd - 1])) {
      tagEnd--;
    }
    if (tagEnd === 0) return false;

    let cursor = tagEnd;

    while (cursor > 0) {
      const ch = text[cursor - 1];
      if (ch === '#') break;
      if (!/[\w-]/.test(ch)) return false;
      cursor--;
    }

    if (cursor === 0) return false;
    if (text[cursor - 1] !== '#') return false;
    if (cursor > 1 && !/\s/.test(text[cursor - 2])) return false;

    const tagName = text.slice(cursor, tagEnd).toLowerCase();
    if (!tagName || !/^[\w-]+$/.test(tagName)) return false;

    const pill = document.createElement('span');
    pill.setAttribute('data-tag', tagName);
    pill.className = 'tag-pill';
    pill.contentEditable = 'false';
    pill.textContent = '#' + tagName;

    const trailing = tagEnd < text.length ? node.splitText(tagEnd) : null;
    const tagText = node.splitText(cursor - 1);
    tagText.remove();
    let parent = node.parentNode;
    const ref = trailing || node.nextSibling;
    if (!node.textContent) node.remove();
    const INLINE_FMT = new Set(['STRONG', 'B', 'EM', 'I', 'SUP']);
    if (parent && INLINE_FMT.has(parent.tagName) && parent.parentNode) {
      const gp = parent.parentNode;
      if (trailing) gp.insertBefore(trailing, parent.nextSibling);
      gp.insertBefore(pill, parent.nextSibling);
      if (!parent.textContent.trim() && !parent.children.length) parent.remove();
      const sp = document.createTextNode('\u00A0');
      gp.insertBefore(sp, pill.nextSibling || null);
    } else {
      parent.insertBefore(pill, ref);
      const sp = document.createTextNode('\u00A0');
      parent.insertBefore(sp, ref || null);
    }

    return pill;
  }

  /* ---------- Tag pill manipulation ---------- */

  _removeTag(pillEl) {
    this._snapshot();
    pillEl.remove();
    this._normalize();
    this._lastContent = this.element.innerHTML;
    if (this._onUpdate) this._onUpdate();
  }

  _editTag(pillEl) {
    this._snapshot();
    const tag = pillEl.getAttribute('data-tag') || '';
    const text = document.createTextNode('#' + tag);
    const parent = pillEl.parentNode;
    parent.insertBefore(text, pillEl);
    pillEl.remove();
    parent.normalize();
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(text, text.textContent.length);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    this.element.focus();
    this._lastContent = this.element.innerHTML;
    if (this._onUpdate) this._onUpdate();
  }

  /* ---------- History / snapshots ---------- */

  _snapshot() {
    if (this._isUpdating) return;
    const html = this.element.innerHTML;
    if (this._history.length > 0 && this._history[this._historyIndex].html === html) return;

    this._history.length = this._historyIndex + 1;

    const sel = window.getSelection();
    let anchorPath = null;
    let focusPath = null;

    if (sel.rangeCount > 0 && this.element.contains(sel.anchorNode)) {
      anchorPath = this._getNodePath(sel.anchorNode, sel.anchorOffset);
      focusPath = this._getNodePath(sel.focusNode, sel.focusOffset);
    }

    this._history.push({ html, anchorPath, focusPath });
    this._historyIndex = this._history.length - 1;

    if (this._history.length > 50) {
      this._history.shift();
      this._historyIndex--;
    }
  }

  _getNodePath(node, offset) {
    const path = [];
    let current = node;
    let off = offset;
    while (current && current !== this.element) {
      const parent = current.parentNode;
      if (!parent) break;
      const index = Array.prototype.indexOf.call(parent.childNodes, current);
      path.unshift({ index, offset: off });
      current = parent;
      off = null;
    }
    return path;
  }

  _restoreSelection(anchorPath, focusPath) {
    if (!anchorPath || !focusPath) return;
    const sel = window.getSelection();
    try {
      const anchor = this._resolvePath(anchorPath);
      const focus = this._resolvePath(focusPath);
      if (anchor && focus) {
        const range = document.createRange();
        range.setStart(anchor.node, anchor.offset);
        range.setEnd(focus.node, focus.offset);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch (_) {}
  }

  _resolvePath(path) {
    let node = this.element;
    for (let i = 0; i < path.length; i++) {
      const step = path[i];
      if (step.index < node.childNodes.length) {
        node = node.childNodes[step.index];
      } else {
        return null;
      }
    }
    const last = path[path.length - 1];
    return { node, offset: last.offset };
  }

  /* ---------- Inline formatting ---------- */

  _selectWordAtCursor() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    const offset = range.startOffset;
    if (node.nodeType !== Node.TEXT_NODE) return null;
    const text = node.textContent;
    let start = offset;
    while (start > 0 && !/\s/.test(text[start - 1])) start--;
    let end = offset;
    while (end < text.length && !/\s/.test(text[end])) end++;
    if (start === end) return null;
    range.setStart(node, start);
    range.setEnd(node, end);
    sel.removeAllRanges();
    sel.addRange(range);
    return offset - start;
  }

  _toggleInline(tagName) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    let cursorOffset = null;
    if (sel.isCollapsed) {
      cursorOffset = this._selectWordAtCursor();
      if (cursorOffset == null) return;
    }

    const range = sel.getRangeAt(0);

    if (this._isWithinInline(range)) {
      this._unwrapInline(range);
      return;
    }

    const wrapper = document.createElement(tagName);
    try {
      range.surroundContents(wrapper);
    } catch (_) {
      const fragment = range.extractContents();
      this._wrapAllNodes(fragment, tagName);
      range.insertNode(fragment);
      this._normalize();
    }

    sel.removeAllRanges();
    sel.addRange(range);

    if (cursorOffset != null && wrapper.parentNode) {
      const findTextNode = (node) => {
        if (node.nodeType === Node.TEXT_NODE) return node;
        for (let child of node.childNodes) {
          const found = findTextNode(child);
          if (found) return found;
        }
        return null;
      };
      const wordText = findTextNode(wrapper);
      if (wordText) {
        const restoreRange = document.createRange();
        restoreRange.setStart(wordText, Math.min(cursorOffset, wordText.textContent.length));
        restoreRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(restoreRange);
      }
    }
  }

  _isWithinInline(range) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return false;
    let node = sel.anchorNode;
    while (node && node !== this.element) {
      if (node.nodeType === 1 && ['STRONG', 'B', 'EM', 'I', 'SUP'].includes(node.tagName)) return true;
      node = node.parentNode;
    }
    return false;
  }

  _unwrapInline(range) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    let target = sel.anchorNode;
    while (target && target !== this.element) {
      if (target.nodeType === 1 && ['STRONG', 'B', 'EM', 'I', 'SUP'].includes(target.tagName)) break;
      target = target.parentNode;
    }
    if (!target || target === this.element) return;
    const parent = target.parentNode;
    if (!parent) return;

    const fullRange = document.createRange();
    fullRange.selectNodeContents(target);
    const coversAll = range.compareBoundaryPoints(Range.START_TO_START, fullRange) <= 0
                   && range.compareBoundaryPoints(Range.END_TO_END, fullRange) >= 0;

    if (coversAll) {
      while (target.firstChild) parent.insertBefore(target.firstChild, target);
      target.remove();
    } else {
      const startNode = range.startContainer;
      const endNode = range.endContainer;
      const startOffset = range.startOffset;
      const endOffset = range.endOffset;

      if (startNode.nodeType === Node.TEXT_NODE) {
        startNode.splitText(startOffset);
      }
      let eNode = endNode;
      let eOff = endOffset;
      if (startNode === endNode && startNode.nodeType === Node.TEXT_NODE) {
        eNode = startNode.nextSibling;
        eOff = endOffset - startOffset;
      }
      if (eNode.nodeType === Node.TEXT_NODE) {
        eNode.splitText(eOff);
      }

      const selected = startNode.nextSibling ||
        (startNode.nodeType === Node.TEXT_NODE ? null : startNode.childNodes[startOffset]);

      const afterEl = document.createElement(target.tagName);
      let sib = selected.nextSibling;
      while (sib) {
        const next = sib.nextSibling;
        afterEl.appendChild(sib);
        sib = next;
      }

      parent.insertBefore(afterEl, target.nextSibling);
      parent.insertBefore(selected, afterEl);

      if (!target.textContent.trim() && !target.children.length) {
        target.remove();
      }

      const newRange = document.createRange();
      if (selected.nodeType === Node.TEXT_NODE) {
        newRange.setStart(selected, selected.textContent.length);
      } else {
        newRange.setStartAfter(selected);
      }
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
    this._normalize();
  }

  _wrapAllNodes(fragment, tagName) {
    const nodes = [];
    for (let i = 0; i < fragment.childNodes.length; i++) {
      nodes.push(fragment.childNodes[i]);
    }
    const tagUC = tagName.toUpperCase();
    for (const n of nodes) {
      if (n.nodeType === Node.TEXT_NODE && n.textContent.trim()) {
        const w = document.createElement(tagName);
        w.appendChild(n.cloneNode());
        fragment.replaceChild(w, n);
      } else if (n.nodeType === Node.ELEMENT_NODE && n.tagName !== tagUC && !n.classList.contains('tag-pill')) {
        const w = document.createElement(tagName);
        w.appendChild(n.cloneNode(true));
        fragment.replaceChild(w, n);
      }
    }
  }

  /* ---------- Block formatting ---------- */

  _setBlockType(tagName) {
    const blocks = this._getSelectedBlocks();
    if (!blocks.length) return;
    const tagUC = tagName.toUpperCase();
    const allMatch = blocks.every(b => b.tagName === tagUC);
    const parent = blocks[0].parentNode;
    const ref = blocks[0].nextSibling;
    for (const block of blocks) {
      this._convertBlock(block, allMatch ? 'P' : tagUC);
    }
    if (parent) {
      let target = ref ? ref.previousSibling : parent.lastChild;
      while (target && target.nodeType === 3) target = target.previousSibling;
      if (target) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(target);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }

  _getSelectedBlocks() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return [];

    const range = sel.getRangeAt(0);
    const startBlock = this._findBlock(range.startContainer);
    const endBlock = this._findBlock(range.endContainer);
    if (!startBlock || !endBlock) return [];

    if (startBlock === endBlock) return [startBlock];

    const blocks = [];
    let current = startBlock;
    while (current) {
      blocks.push(current);
      if (current === endBlock) break;
      current = current.nextElementSibling;
    }
    if (current !== endBlock) {
      return [startBlock];
    }
    return blocks;
  }

  _findBlock(node) {
    let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
    while (el && el !== this.element) {
      const tag = el.tagName;
      if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE'].includes(tag)) {
        return el;
      }
      el = el.parentNode;
    }
    return null;
  }

  _convertBlock(block, newTag) {
    if (block.tagName === newTag) return;
    if (block.tagName === 'LI' && newTag !== 'LI') {
      this._extractFromList(block);
      return;
    }
    if (block.tagName === 'LI' && newTag === 'LI') return;
    const wrapper = document.createElement(newTag);
    while (block.firstChild) wrapper.appendChild(block.firstChild);
    block.parentNode.replaceChild(wrapper, block);
  }

  _extractFromList(li) {
    const list = li.parentNode;
    const p = document.createElement('p');
    while (li.firstChild) p.appendChild(li.firstChild);
    list.parentNode.insertBefore(p, list);
    li.remove();
    if (!list.children.length) list.remove();
  }

  _exitList(li) {
    const list = li.parentNode;
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    li.remove();
    if (!list.children.length) {
      list.parentNode.insertBefore(p, list);
      list.remove();
    } else {
      list.parentNode.insertBefore(p, list.nextSibling);
    }
    this._normalize();
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(p, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /* ---------- List toggling ---------- */

  _toggleList(listTag) {
    const blocks = this._getSelectedBlocks();
    if (!blocks.length) return;

    const inList = blocks.some(b => b.closest && b.closest(listTag.toLowerCase()));

    if (inList) {
      const seen = new Set();
      for (const b of blocks) {
        const li = b.tagName === 'LI' ? b : b.closest('li');
        if (li && li.parentNode && !seen.has(li)) {
          seen.add(li);
          this._extractFromList(li);
        }
      }
    } else {
      this._wrapBlocksInList(listTag, blocks);
    }
  }

  _wrapBlocksInList(listTag, blocks) {
    const list = document.createElement(listTag);
    for (const block of blocks) {
      const li = document.createElement('li');
      while (block.firstChild) li.appendChild(block.firstChild);
      list.appendChild(li);
    }
    const parent = blocks[0].parentNode;
    parent.insertBefore(list, blocks[0]);
    for (const block of blocks) {
      if (block.parentNode) block.remove();
    }
    const firstLi = list.querySelector('li');
    if (firstLi) {
      const sel = window.getSelection();
      const range = document.createRange();
      const lastText = this._getDeepestLastNode(firstLi);
      if (lastText && lastText.nodeType === Node.TEXT_NODE) {
        range.setStart(lastText, lastText.textContent.length);
      } else {
        range.setStart(firstLi, 0);
      }
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  _wrapBlocksInTag(blocks, tagName) {
    const tag = document.createElement(tagName);
    for (const block of blocks) {
      tag.appendChild(block.cloneNode(true));
    }
    const parent = blocks[0].parentNode;
    parent.insertBefore(tag, blocks[0]);
    for (const block of blocks) {
      if (block.parentNode) block.remove();
    }
  }

  _unwrapBlock(el) {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el);
    }
    el.remove();
  }

  /* ---------- Normalization ---------- */

  _normalize() {
    const el = this.element;

    el.normalize();

    el.querySelectorAll('.tag-pill').forEach(pill => {
      pill.contentEditable = 'false';
    });

    const sel = window.getSelection();
    let savedAnchorPath = null;
    let savedFocusPath = null;
    if (sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      savedAnchorPath = this._getNodePath(sel.anchorNode, sel.anchorOffset);
      savedFocusPath = this._getNodePath(sel.focusNode, sel.focusOffset);
    }

    const all = el.querySelectorAll('*');
    for (const n of all) {
      if (!this._isAllowedTag(n.tagName)) {
        const p = document.createElement('p');
        while (n.firstChild) p.appendChild(n.firstChild);
        n.parentNode.replaceChild(p, n);
      }
    }

    const textNodes = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    let tn;
    while (tn = walker.nextNode()) {
      textNodes.push(tn);
    }
    for (const tn of textNodes) {
      if (!tn.parentNode) continue;
      if (tn.parentNode === el && tn.textContent === '') {
        tn.remove();
        continue;
      }
      if (tn.textContent === '' && !tn.nextSibling && !tn.previousSibling && tn.parentNode === el) {
        const p = document.createElement('p');
        p.appendChild(document.createElement('br'));
        tn.parentNode.replaceChild(p, tn);
      } else if (tn.parentNode === el && tn.textContent.trim()) {
        const p = document.createElement('p');
        tn.parentNode.insertBefore(p, tn);
        p.appendChild(tn);
      }
    }

    const blockquotes = el.querySelectorAll('blockquote');
    for (const bq of blockquotes) {
      const hasBareText = [...bq.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      if (hasBareText) {
        const p = document.createElement('p');
        while (bq.firstChild) p.appendChild(bq.firstChild);
        bq.appendChild(p);
      }
    }

    const empties = el.querySelectorAll('p, h1, h2, h3, li, blockquote');
    for (const e of empties) {
      if (!e.children.length && e.textContent === '') {
        e.innerHTML = '<br>';
      }
    }

    if (!el.children.length) {
      el.innerHTML = '<p><br></p>';
    }

    el.normalize();

    if (savedAnchorPath && savedFocusPath) {
      try {
        const anchor = this._resolvePath(savedAnchorPath);
        const focus = this._resolvePath(savedFocusPath);
        if (anchor && focus) {
          const range = document.createRange();
          range.setStart(anchor.node, anchor.offset);
          range.setEnd(focus.node, focus.offset);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch (_) {}
    }
  }

  _isAllowedTag(tag) {
    return !!SimpleEditor.ALLOWED_TAGS[tag.toLowerCase()];
  }

  /* ---------- Sanitization ---------- */

  _sanitize(html) {
    if (!html) return '';
    const doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = html;
    this._cleanNode(doc.body);
    return doc.body.innerHTML;
  }

  _cleanNode(parent) {
    const children = [...parent.childNodes];
    for (const node of children) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName.toLowerCase();
        if (!this._isAllowedTag(tag)) {
          const fragment = document.createDocumentFragment();
          while (node.firstChild) fragment.appendChild(node.firstChild);
          parent.replaceChild(fragment, node);
          continue;
        }
        for (const attr of [...node.attributes]) {
          const allowed = SimpleEditor.ALLOWED_TAGS[tag];
          if (!allowed || !allowed.data || !allowed.data.includes(attr.name)) {
            if (attr.name !== 'class' || !/^(tag-pill|prose-notes)$/.test(attr.value)) {
              node.removeAttribute(attr.name);
            }
          }
        }
        this._cleanNode(node);
      } else if (node.nodeType === Node.TEXT_NODE) {
        node.textContent = node.textContent.replace(/\x00/g, '');
      }
    }
  }

  _escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  _htmlToFragment(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    return t.content;
  }
};
