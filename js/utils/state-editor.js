window.StateEditor = class StateEditor {
  constructor({ element, content = '', onUpdate, attributes = {} }) {
    this._markdownState = content;
    this._onUpdate = onUpdate;
    this._history = [content];
    this._historyIndex = 0;
    this._lastCursorIndex = 0;
    this._container = element;
    console.log('[StateEditor] constructor', { contentLength: content.length });

    for (const [k, v] of Object.entries(attributes)) {
      element.setAttribute(k, v);
    }

    if (getComputedStyle(element).position === 'static') {
      element.style.position = 'relative';
    }

    this.previewElement = document.createElement('div');
    element.appendChild(this.previewElement);

    const cs = getComputedStyle(element);
    this.ghostLayer = document.createElement('div');
    this.ghostLayer.contentEditable = 'true';
    this.ghostLayer.style.cssText = [
      'position: absolute',
      'top: 0',
      'left: 0',
      'width: 100%',
      'height: 100%',
      'color: transparent',
      'caret-color: black',
      'background: transparent',
      `font-family: ${cs.fontFamily}`,
      `font-size: ${cs.fontSize}`,
      `line-height: ${cs.lineHeight}`,
      `padding-top: ${cs.paddingTop}`,
      `padding-right: ${cs.paddingRight}`,
      `padding-bottom: ${cs.paddingBottom}`,
      `padding-left: ${cs.paddingLeft}`,
      'border: none',
      'outline: none',
      'overflow: hidden',
      'user-select: text',
      '-webkit-user-select: text'
    ].join('; ');
    this.ghostLayer.tabIndex = 0;
    this.ghostLayer.setAttribute('aria-label', attributes['aria-label'] || 'Editor');

    element.appendChild(this.ghostLayer);

    const ast = this._parseToAST(content);
    this._currentAST = ast;
    this._renderAST(ast);
    this._rebuildGhost();

    this._boundBeforeInput = (e) => this._onBeforeInput(e);
    this.ghostLayer.addEventListener('beforeinput', this._boundBeforeInput);
    this._boundInput = (e) => this._onInput(e);
    this.ghostLayer.addEventListener('input', this._boundInput);

    this._lastRange = { start: 0, end: 0 };
    this._boundSelectionChange = () => {
      const sel = window.getSelection();
      if (sel.rangeCount && this.ghostLayer.contains(sel.anchorNode)) {
        const start = this._getNodeMarkdownIndex(sel.anchorNode, sel.anchorOffset);
        const end = this._getNodeMarkdownIndex(sel.focusNode, sel.focusOffset);
        this._lastRange = {
          start: Math.min(start, end),
          end: Math.max(start, end)
        };
        this._lastCursorIndex = this._lastRange.end;
      }
    };
    document.addEventListener('selectionchange', this._boundSelectionChange);
  }

  /* ---------- AST Parser ---------- */

  _parseToAST(markdownString) {
    if (!markdownString) {
      console.log('[StateEditor] parseToAST empty');
      return { type: 'document', startIndex: 0, endIndex: 0, children: [
        { type: 'paragraph', startIndex: 0, endIndex: 0, children: [
          { type: 'text', value: '', startIndex: 0, endIndex: 0 }
        ]}
      ]};
    }

    const md = markdownString;
    const lines = md.split('\n');
    const lineStarts = [];
    let pos = 0;
    for (let li = 0; li < lines.length; li++) {
      lineStarts.push(pos);
      pos += lines[li].length + 1;
    }

    const children = [];
    let i = 0;

    while (i < lines.length) {
      const trimmed = lines[i].trim();
      const lineStart = lineStarts[i];

      if (trimmed === '') {
        let blankCount = 0;
        while (i < lines.length && lines[i].trim() === '') {
          blankCount++;
          i++;
        }
        for (let b = 0; b < blankCount; b++) {
          const blankIdx = i - blankCount + b;
          const start = lineStarts[blankIdx];
          children.push({
            type: 'paragraph',
            startIndex: start,
            endIndex: start,
            children: []
          });
        }
        continue;
      }

      if (/^---+/.test(trimmed)) {
        const endIdx = lineStart + lines[i].length;
        children.push({ type: 'thematicBreak', startIndex: lineStart, endIndex: endIdx });
        i++;
        continue;
      }

      const hMatch = trimmed.match(/^(#{1,3})(?:\s+(.*))?$/);
      if (hMatch) {
        const level = hMatch[1].length;
        const content = hMatch[2] || '';
        const contentStart = lineStart + lines[i].length - content.length;
        const endIdx = lineStart + lines[i].length;
        children.push({
          type: 'heading', level,
          startIndex: lineStart, endIndex: endIdx,
          children: this._parseInline(content, contentStart)
        });
        i++;
        continue;
      }

      const bqMatch = trimmed.match(/^>(?:\s+(.*))?$/);
      if (bqMatch) {
        const content = bqMatch[1] || '';
        const contentStart = lineStart + lines[i].length - content.length;
        const endIdx = lineStart + lines[i].length;
        children.push({
          type: 'blockquote',
          startIndex: lineStart, endIndex: endIdx,
          children: this._parseInline(content, contentStart)
        });
        i++;
        continue;
      }

      if (/^-(?:\s+|$)/.test(trimmed)) {
        const listStart = lineStart;
        const items = [];
        while (i < lines.length && /^-(?:\s+|$)/.test(lines[i].trim())) {
          const content = lines[i].trim().replace(/^-\s*/, '');
          const ulMatch = lines[i].match(/^-\s*/);
          const contentStart = lineStarts[i] + (ulMatch ? ulMatch[0].length : 0);
          items.push({
            type: 'listItem',
            startIndex: lineStarts[i],
            endIndex: lineStarts[i] + lines[i].length,
            children: this._parseInline(content, contentStart)
          });
          i++;
        }
        const listEnd = items.length ? items[items.length - 1].endIndex : listStart;
        children.push({
          type: 'list', ordered: false,
          startIndex: listStart, endIndex: listEnd,
          children: items
        });
        continue;
      }

      if (/^\d+\.\s*/.test(trimmed)) {
        const listStart = lineStart;
        const items = [];
        while (i < lines.length && /^\d+\.\s*/.test(lines[i].trim())) {
          const content = lines[i].trim().replace(/^\d+\.\s*/, '');
          const olMatch = lines[i].match(/^\d+\.\s*/);
          const contentStart = lineStarts[i] + (olMatch ? olMatch[0].length : 0);
          items.push({
            type: 'listItem',
            startIndex: lineStarts[i],
            endIndex: lineStarts[i] + lines[i].length,
            children: this._parseInline(content, contentStart)
          });
          i++;
        }
        const listEnd = items.length ? items[items.length - 1].endIndex : listStart;
        children.push({
          type: 'list', ordered: true,
          startIndex: listStart, endIndex: listEnd,
          children: items
        });
        continue;
      }

      const paraLines = [];
      const paraStart = lineStart;
      while (i < lines.length) {
        const l = lines[i];
        const t = l.trim();
        if (t === '' || /^(#{1,3}(?:\s|$)|>(?:\s|$)|---|-(?:\s|$)|\d+\.(?:\s|$))/.test(t)) break;
        paraLines.push(l);
        i++;
      }
      if (paraLines.length) {
        const text = paraLines.join('\n');
        const lastLine = lineStarts[i] !== undefined ? lineStarts[i] - 1 : md.length;
        const endIdx = paraLines.length === 1
          ? lineStart + paraLines[0].length
          : lastLine;
        children.push({
          type: 'paragraph',
          startIndex: paraStart, endIndex: endIdx,
          children: this._parseInline(text, paraStart)
        });
      }
    }

    const docEnd = children.length ? children[children.length - 1].endIndex : 0;
    const result = { type: 'document', startIndex: 0, endIndex: docEnd, children };
    console.log('[StateEditor] parseToAST done', { childCount: children.length, docEnd });
    return result;
  }

  _parseInline(text, offset) {
    const nodes = [];
    let i = 0;

    while (i < text.length) {
      const absPos = offset + i;

      if (text[i] === '*' && text[i + 1] === '*') {
        const close = text.indexOf('**', i + 2);
        if (close !== -1) {
          const inner = text.slice(i + 2, close);
          const innerStart = offset + i + 2;
          nodes.push({
            type: 'strong',
            startIndex: absPos,
            endIndex: offset + close + 2,
            children: this._parseInline(inner, innerStart)
          });
          i = close + 2;
          continue;
        }
      }

      if (text[i] === '*' && text[i + 1] !== '*') {
        const close = text.indexOf('*', i + 1);
        if (close !== -1 && text[close + 1] !== '*') {
          const inner = text.slice(i + 1, close);
          const innerStart = offset + i + 1;
          nodes.push({
            type: 'em',
            startIndex: absPos,
            endIndex: offset + close + 1,
            children: this._parseInline(inner, innerStart)
          });
          i = close + 1;
          continue;
        }
      }

      if (text[i] === '`') {
        const close = text.indexOf('`', i + 1);
        if (close !== -1) {
          const inner = text.slice(i + 1, close);
          nodes.push({
            type: 'code',
            startIndex: absPos,
            endIndex: offset + close + 1,
            children: [{ type: 'text', value: inner, startIndex: offset + i + 1, endIndex: offset + close }]
          });
          i = close + 1;
          continue;
        }
      }

      if (text[i] === '<' && text.startsWith('<sup>', i)) {
        const close = text.indexOf('</sup>', i + 5);
        if (close !== -1) {
          const inner = text.slice(i + 5, close);
          nodes.push({
            type: 'superscript',
            startIndex: absPos,
            endIndex: offset + close + 6,
            children: [{ type: 'text', value: inner, startIndex: offset + i + 5, endIndex: offset + close }]
          });
          i = close + 6;
          continue;
        }
      }

      if (text[i] === '<' && text.startsWith('<br>', i)) {
        nodes.push({
          type: 'lineBreak',
          startIndex: absPos,
          endIndex: absPos + 4
        });
        i += 4;
        continue;
      }

      let start = i;
      while (i < text.length) {
        const c = text[i];
        if (c === '*' || c === '`' || (c === '<' && (text.startsWith('<sup>', i) || text.startsWith('<br>', i)))) break;
        i++;
      }
      if (i > start) {
        nodes.push({
          type: 'text',
          value: text.slice(start, i),
          startIndex: offset + start,
          endIndex: offset + i
        });
      } else {
        i++;
      }
    }

    const lastNode = nodes[nodes.length - 1];
    if (lastNode && (lastNode.type === 'strong' || lastNode.type === 'em' || lastNode.type === 'code' || lastNode.type === 'superscript')) {
      nodes.push({ type: 'text', value: '', startIndex: lastNode.endIndex, endIndex: lastNode.endIndex });
    }

    if (nodes.length === 0) {
      nodes.push({ type: 'text', value: '', startIndex: offset, endIndex: offset });
    }
    return nodes;
  }

  /* ---------- AST Renderer ---------- */

  _renderAST(ast) {
    console.log('[StateEditor] renderAST', { childCount: ast.children.length });
    this._posMap = [];
    const fragment = document.createDocumentFragment();

    for (const child of ast.children) {
      fragment.appendChild(this._createBlockDOM(child));
    }

    this.previewElement.innerHTML = '';
    this.previewElement.appendChild(fragment);
    console.log('[StateEditor] renderAST done', { innerHTML: this.previewElement.innerHTML.slice(0, 300) });
  }

  /* ---------- Patch DOM Reconciler ---------- */

  _patchDOM(ast) {
    console.log('[StateEditor] patchDOM', { oldBlocks: this.previewElement.childNodes.length, newBlocks: ast.children.length });
    const newPosMap = [];
    const oldBlocks = Array.from(this.previewElement.childNodes);
    const newBlocks = ast.children;
    let oi = 0, ni = 0;

    while (oi < oldBlocks.length && ni < newBlocks.length) {
      const oldNode = oldBlocks[oi];
      const newAst = newBlocks[ni];
      const oldKey = oldNode._mdIndex ?? -1;
      const newKey = newAst.startIndex;

      if (oldKey === newKey) {
        this._patchBlock(newAst, oldNode, newPosMap);
        oi++; ni++;
      } else if (oldKey < newKey) {
        oldNode.remove();
        oi++;
      } else {
        this.previewElement.insertBefore(this._createBlockDOM(newAst, newPosMap), oldNode);
        ni++;
      }
    }

    while (oi < oldBlocks.length) oldBlocks[oi++].remove();
    while (ni < newBlocks.length) this.previewElement.appendChild(this._createBlockDOM(newBlocks[ni++], newPosMap));

    this._posMap = newPosMap;
    console.log('[StateEditor] patchDOM done', { innerHTML: this.previewElement.innerHTML.slice(0, 300), posMap: this._posMap.map(e => ({ nodeType: e.node.nodeType, tag: e.node.tagName, text: e.node.textContent?.slice(0, 15), mdStart: e.mdStart, mdEnd: e.mdEnd })) });
  }

  _patchBlock(newAst, oldDom, posMap) {
    const expected = this._blockTag(newAst);
    if (oldDom.tagName !== expected) {
      oldDom.replaceWith(this._createBlockDOM(newAst, posMap));
      return;
    }

    oldDom._mdIndex = newAst.startIndex;

    if (newAst.type === 'paragraph' && (!newAst.children || !newAst.children.length)) {
      oldDom.innerHTML = '';
      oldDom.appendChild(document.createElement('br'));
      posMap.push({ node: oldDom, mdStart: newAst.startIndex, mdEnd: newAst.startIndex });
      const tn = document.createTextNode('');
      tn._mdIndex = newAst.startIndex;
      oldDom.appendChild(tn);
      return;
    }

    if (!newAst.children || !newAst.children.length) return;

    if (newAst.children.some(c => c.type === 'text' && c.value.includes('\n'))) {
      this._replaceBlockChildren(oldDom, newAst.children, posMap);
      return;
    }

    this._patchInlines(newAst.children, oldDom, posMap);
  }

  _patchInlines(newAstChildren, parentEl, posMap) {
    const oldChildren = Array.from(parentEl.childNodes);
    let oi = 0, ni = 0;

    while (oi < oldChildren.length && ni < newAstChildren.length) {
      const oldNode = oldChildren[oi];
      const newAst = newAstChildren[ni];
      const prevAst = ni > 0 ? newAstChildren[ni - 1] : null;

      if (this._inlineMatch(newAst, oldNode)) {
        this._patchInline(newAst, oldNode, posMap, prevAst);
        oi++; ni++;
      } else if (oi + 1 < oldChildren.length && this._inlineMatch(newAst, oldChildren[oi + 1])) {
        oldNode.remove();
        oi++;
      } else {
        parentEl.insertBefore(this._inlineToDOM(newAst, posMap, prevAst), oldNode);
        ni++;
      }
    }

    while (oi < oldChildren.length) oldChildren[oi++].remove();
    while (ni < newAstChildren.length) {
      const prevAst = ni > 0 ? newAstChildren[ni - 1] : null;
      parentEl.appendChild(this._inlineToDOM(newAstChildren[ni++], posMap, prevAst));
    }
  }

  _inlineMatch(newAst, oldDom) {
    if (!newAst || !oldDom) return false;
    if (newAst.type === 'text') return oldDom.nodeType === Node.TEXT_NODE;
    if (newAst.type === 'lineBreak') return oldDom.tagName === 'BR';
    if (newAst.type === 'strong') return oldDom.tagName === 'STRONG';
    if (newAst.type === 'em') return oldDom.tagName === 'EM';
    if (newAst.type === 'code') return oldDom.tagName === 'CODE';
    if (newAst.type === 'superscript') return oldDom.tagName === 'SUP';
    return false;
  }

  _patchInline(newAst, oldDom, posMap, prevAst) {
    switch (newAst.type) {
      case 'text': {
        if (prevAst && (prevAst.type === 'strong' || prevAst.type === 'em')) {
          oldDom.replaceWith(this._inlineToDOM(newAst, posMap, prevAst));
          break;
        }
        if (oldDom.textContent !== newAst.value) oldDom.textContent = newAst.value;
        oldDom._mdIndex = newAst.startIndex;
        posMap.push({ node: oldDom, mdStart: newAst.startIndex, mdEnd: newAst.endIndex });
        break;
      }
      case 'strong':
      case 'em':
      case 'code':
      case 'superscript': {
        if (newAst.children) this._patchInlines(newAst.children, oldDom, posMap);
        break;
      }
      case 'lineBreak': {
        if (oldDom.tagName !== 'BR') oldDom.replaceWith(document.createElement('br'));
        break;
      }
    }
  }

  _replaceBlockChildren(parentEl, newAstChildren, posMap) {
    parentEl.innerHTML = '';
    for (let ci = 0; ci < newAstChildren.length; ci++) {
      const child = newAstChildren[ci];
      const prevAst = ci > 0 ? newAstChildren[ci - 1] : null;
      if (child.type === 'text' && child.value.includes('\n')) {
        const parts = child.value.split('\n');
        let pos = child.startIndex;
        for (let pi = 0; pi < parts.length; pi++) {
          if (pi > 0) parentEl.appendChild(document.createElement('br'));
          const tn = document.createTextNode(parts[pi]);
          tn._mdIndex = pos;
          posMap.push({ node: tn, mdStart: pos, mdEnd: pos + parts[pi].length });
          if (pi === 0 && prevAst && (prevAst.type === 'strong' || prevAst.type === 'em')) {
            const span = document.createElement('span');
            span.className = 'editor-format-break';
            span.style.fontWeight = 'normal';
            span.style.fontStyle = 'normal';
            span.appendChild(tn);
            parentEl.appendChild(span);
          } else {
            parentEl.appendChild(tn);
          }
          pos += parts[pi].length + 1;
        }
      } else {
        parentEl.appendChild(this._inlineToDOM(child, posMap, prevAst));
      }
    }
  }

  _blockTag(astNode) {
    switch (astNode.type) {
      case 'paragraph': return 'P';
      case 'heading': return 'H' + astNode.level;
      case 'blockquote': return 'BLOCKQUOTE';
      case 'list': return astNode.ordered ? 'OL' : 'UL';
      case 'listItem': return 'LI';
      case 'thematicBreak': return 'HR';
      default: return 'DIV';
    }
  }

  _createBlockDOM(astNode, posMap) {
    const pm = posMap || this._posMap || [];
    switch (astNode.type) {
      case 'paragraph': {
        const p = document.createElement('p');
        p._mdIndex = astNode.startIndex;
        if (astNode.children && astNode.children.length) {
          for (let ci = 0; ci < astNode.children.length; ci++) {
            const child = astNode.children[ci];
            const prevAst = ci > 0 ? astNode.children[ci - 1] : null;
            if (child.type === 'text' && child.value.includes('\n')) {
              const parts = child.value.split('\n');
              let pos = child.startIndex;
              for (let pi = 0; pi < parts.length; pi++) {
                if (pi > 0) p.appendChild(document.createElement('br'));
                const tn = document.createTextNode(parts[pi]);
                tn._mdIndex = pos;
                pm.push({ node: tn, mdStart: pos, mdEnd: pos + parts[pi].length });
                if (pi === 0 && prevAst && (prevAst.type === 'strong' || prevAst.type === 'em')) {
                  const span = document.createElement('span');
                  span.className = 'editor-format-break';
                  span.style.fontWeight = 'normal';
                  span.style.fontStyle = 'normal';
                  span.appendChild(tn);
                  p.appendChild(span);
                } else {
                  p.appendChild(tn);
                }
                pos += parts[pi].length + 1;
              }
            } else {
              p.appendChild(this._inlineToDOM(child, pm, prevAst));
            }
          }
      } else {
        p.appendChild(document.createElement('br'));
        pm.push({ node: p, mdStart: astNode.startIndex, mdEnd: astNode.startIndex });
        const tn = document.createTextNode('');
        tn._mdIndex = astNode.startIndex;
        p.appendChild(tn);
      }
      return p;
      }
      case 'heading': {
        const h = document.createElement('h' + astNode.level);
        h._mdIndex = astNode.startIndex;

        const prefix = document.createElement('span');
        prefix.textContent = '#'.repeat(astNode.level) + ' ';
        prefix.style.opacity = '0.3';
        prefix.style.fontWeight = 'normal';
        h.appendChild(prefix);

        for (let ci = 0; ci < astNode.children.length; ci++) {
          const child = astNode.children[ci];
          const prevAst = ci > 0 ? astNode.children[ci - 1] : null;
          h.appendChild(this._inlineToDOM(child, pm, prevAst));
        }
        return h;
      }
      case 'blockquote': {
        const bq = document.createElement('blockquote');
        bq._mdIndex = astNode.startIndex;
        for (let ci = 0; ci < astNode.children.length; ci++) {
          const child = astNode.children[ci];
          const prevAst = ci > 0 ? astNode.children[ci - 1] : null;
          bq.appendChild(this._inlineToDOM(child, pm, prevAst));
        }
        return bq;
      }
      case 'list': {
        const el = document.createElement(astNode.ordered ? 'ol' : 'ul');
        for (const child of astNode.children) el.appendChild(this._createBlockDOM(child, pm));
        return el;
      }
      case 'listItem': {
        const li = document.createElement('li');
        li._mdIndex = astNode.startIndex;
        for (let ci = 0; ci < astNode.children.length; ci++) {
          const child = astNode.children[ci];
          const prevAst = ci > 0 ? astNode.children[ci - 1] : null;
          li.appendChild(this._inlineToDOM(child, pm, prevAst));
        }
        return li;
      }
      case 'thematicBreak':
        return document.createElement('hr');
      default:
        return document.createTextNode('');
    }
  }

  _inlineToDOM(astNode, posMap, prevAstNode) {
    const pm = posMap || this._posMap || [];

    const createSyntaxSpan = (text) => {
      const span = document.createElement('span');
      span.textContent = text;
      span.style.opacity = '0.3';
      span.style.fontWeight = 'normal';
      span.style.fontStyle = 'normal';
      return span;
    };

    switch (astNode.type) {
      case 'text': {
        const tn = document.createTextNode(astNode.value);
        tn._mdIndex = astNode.startIndex;
        pm.push({ node: tn, mdStart: astNode.startIndex, mdEnd: astNode.endIndex });
        if (prevAstNode && (prevAstNode.type === 'strong' || prevAstNode.type === 'em')) {
          const span = document.createElement('span');
          span.className = 'editor-format-break';
          span.style.fontWeight = 'normal';
          span.style.fontStyle = 'normal';
          span.appendChild(tn);
          return span;
        }
        return tn;
      }
      case 'strong': {
        const el = document.createElement('strong');
        el.appendChild(createSyntaxSpan('**'));
        for (const child of astNode.children) el.appendChild(this._inlineToDOM(child, pm));
        el.appendChild(createSyntaxSpan('**'));
        return el;
      }
      case 'em': {
        const el = document.createElement('em');
        el.appendChild(createSyntaxSpan('*'));
        for (const child of astNode.children) el.appendChild(this._inlineToDOM(child, pm));
        el.appendChild(createSyntaxSpan('*'));
        return el;
      }
      case 'code': {
        const el = document.createElement('code');
        el.appendChild(createSyntaxSpan('`'));
        const tn = document.createTextNode(astNode.children?.[0]?.value || '');
        const mdIdx = astNode.children?.[0]?.startIndex ?? 0;
        tn._mdIndex = mdIdx;
        pm.push({ node: tn, mdStart: mdIdx, mdEnd: mdIdx + tn.textContent.length });
        el.appendChild(tn);
        el.appendChild(createSyntaxSpan('`'));
        return el;
      }
      case 'superscript': {
        const el = document.createElement('sup');
        el.appendChild(createSyntaxSpan('<sup>'));
        const tn = document.createTextNode(astNode.children?.[0]?.value || '');
        const mdIdx = astNode.children?.[0]?.startIndex ?? 0;
        tn._mdIndex = mdIdx;
        pm.push({ node: tn, mdStart: mdIdx, mdEnd: mdIdx + tn.textContent.length });
        el.appendChild(tn);
        el.appendChild(createSyntaxSpan('</sup>'));
        return el;
      }
      case 'lineBreak':
        return document.createElement('br');
      default:
        return document.createTextNode('');
    }
  }

  /* ---------- Ghost Layer Builder ---------- */

  _rebuildGhost() {
    this.ghostLayer.innerHTML = '';
    if (!this._currentAST) return;
    const md = this._markdownState;
    const children = this._currentAST.children;
    const previewBlocks = this.previewElement.children;

    for (let i = 0; i < children.length; i++) {
      const ast = children[i];
      const ghostBlock = document.createElement('div');
      ghostBlock.style.color = 'transparent';
      ghostBlock.style.caretColor = 'black';
      ghostBlock.style.whiteSpace = 'pre-wrap';
      ghostBlock.style.overflow = 'hidden';
      ghostBlock.style.border = 'none';
      ghostBlock.style.outline = 'none';

      if (i < previewBlocks.length) {
        const pb = previewBlocks[i];
        const cs = getComputedStyle(pb);
        ghostBlock.style.fontSize = cs.fontSize;
        ghostBlock.style.fontWeight = cs.fontWeight;
        ghostBlock.style.fontFamily = cs.fontFamily;
        ghostBlock.style.lineHeight = cs.lineHeight;
        ghostBlock.style.marginTop = cs.marginTop;
        ghostBlock.style.marginBottom = cs.marginBottom;
        ghostBlock.style.paddingTop = cs.paddingTop;
        ghostBlock.style.paddingBottom = cs.paddingBottom;
        ghostBlock.style.paddingLeft = cs.paddingLeft;
        ghostBlock.style.paddingRight = cs.paddingRight;
      }

      const nextStart = i + 1 < children.length ? children[i + 1].startIndex : md.length;
      ghostBlock.textContent = md.slice(ast.startIndex, nextStart);
      if (!ghostBlock.firstChild) {
        ghostBlock.appendChild(document.createTextNode(''));
      }
      this.ghostLayer.appendChild(ghostBlock);
    }
  }

  /* ---------- Event Handlers ---------- */

  _onBeforeInput(e) {
    const { inputType, data } = e;
    const cursorIdx = this._getCursorMarkdownIndex();
    console.log('[StateEditor] beforeInput', { inputType, data, cursorIdx, mdLen: this._markdownState.length });

    if (inputType === 'insertText') {
      if (data === '\n' || data === '\r') {
        e.preventDefault();
        this._handleLineBreak(cursorIdx);
        return;
      }
      if (!e.isComposing) {
        e.preventDefault();
        this._handleCharacterInput(cursorIdx, data);
        return;
      }
      return;
    }

    if (inputType === 'insertParagraph' || inputType === 'insertLineBreak') {
      e.preventDefault();
      this._handleLineBreak(cursorIdx);
      return;
    }

    if (inputType === 'insertFromPaste') {
      e.preventDefault();
      const text = e.dataTransfer?.getData('text/plain')
        || e.clipboardData?.getData('text/plain')
        || data || '';
      this._markdownState =
        this._markdownState.slice(0, cursorIdx) +
        text +
        this._markdownState.slice(cursorIdx);
      this._commit(cursorIdx + text.length);
      return;
    }
  }

  _handleLineBreak(cursorIdx) {
    let md = this._markdownState;
    let lineStart = cursorIdx;
    while (lineStart > 0 && md[lineStart - 1] !== '\n') lineStart--;
    const textBefore = md.slice(lineStart, cursorIdx);

    const listMatch = textBefore.match(/^(\s*(?:-\s|\d+\.\s))/);
    let listPrefix = '';
    if (listMatch) {
      listPrefix = listMatch[1];
      if (textBefore.trim() === listPrefix.trim()) {
        this._markdownState = md.slice(0, lineStart) + '\n' + md.slice(cursorIdx);
        this._commit(lineStart + 1);
        return;
      }
    }

    const boldCount = (textBefore.match(/\*\*/g) || []).length;
    const isBoldOpen = boldCount % 2 !== 0;

    const textWithoutBold = textBefore.replace(/\*\*/g, '');
    const italicCount = (textWithoutBold.match(/\*/g) || []).length;
    const isItalicOpen = italicCount % 2 !== 0;

    let suffix = '';
    let prefix = listPrefix;

    if (isBoldOpen) { suffix = '**' + suffix; prefix = prefix + '**'; }
    if (isItalicOpen) { suffix = '*' + suffix; prefix = prefix + '*'; }

    let rest = md.slice(cursorIdx);
    let stripLen = 0;
    for (let i = 0; i < suffix.length && i < rest.length && suffix[i] === rest[i]; i++) {
      stripLen++;
    }
    rest = rest.slice(stripLen);
    this._markdownState = md.slice(0, cursorIdx) + suffix + '\n' + prefix + rest;
    this._commit(cursorIdx + suffix.length + 1 + prefix.length);
  }

  _handleCharacterInput(cursorIdx, data) {
    this._markdownState =
      this._markdownState.slice(0, cursorIdx) +
      data +
      this._markdownState.slice(cursorIdx);
    this._commit(cursorIdx + data.length);
  }

  _onInput(e) {
    console.log('[StateEditor] input', { inputType: e.inputType, data: e.data });
    this._markdownState = this.ghostLayer.textContent || '';
    this._commit(this._getCursorMarkdownIndex());
  }

  _commit(cursorState) {
    const newIndex = typeof cursorState === 'number' ? cursorState : (cursorState?.end ?? 0);
    console.log('[StateEditor] commit', { cursorState, newIndex, mdLen: this._markdownState.length, mdState: this._markdownState });
    const domText = this.previewElement.textContent;
    if (domText !== this._markdownState.replace(/\n/g, '')) {
      console.log('[StateEditor] commit DIVERGENCE', { domText, mdText: this._markdownState.replace(/\n/g, '') });
    }
    const ast = this._parseToAST(this._markdownState);
    this._currentAST = ast;
    this._patchDOM(ast);
    this._rebuildGhost();
    this._restoreCursorFromIndex(cursorState);
    this._lastCursorIndex = newIndex;
    this._history = this._history.slice(0, this._historyIndex + 1);
    this._history.push(this._markdownState);
    this._historyIndex = this._history.length - 1;
    if (this._onUpdate) this._onUpdate();
  }

  /* ---------- Cursor ---------- */

  _getCursorMarkdownIndex() {
    const range = this._getSelectionMarkdownRange();
    return range ? range.start : this._lastCursorIndex;
  }

  _getNodeMarkdownIndex(node, offset) {
    const blocks = Array.from(this.ghostLayer.children);
    const astChildren = this._currentAST?.children || [];
    for (let i = 0; i < blocks.length && i < astChildren.length; i++) {
      const block = blocks[i];
      if (block.contains(node)) {
        const ast = astChildren[i];
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null, false);
        let charIndex = ast.startIndex;
        let textNode;
        while ((textNode = walker.nextNode())) {
          if (textNode === node) return charIndex + offset;
          charIndex += (textNode.textContent || '').length;
        }
        return charIndex;
      }
    }
    return this._lastCursorIndex;
  }

  _getSelectionMarkdownRange() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return this._lastRange;
    const range = sel.getRangeAt(0);
    if (!this.ghostLayer.contains(range.startContainer)) return this._lastRange;

    const start = this._getNodeMarkdownIndex(range.startContainer, range.startOffset);
    const end = this._getNodeMarkdownIndex(range.endContainer, range.endOffset);
    return { start: Math.min(start, end), end: Math.max(start, end) };
  }

  _restoreCursorFromIndex(cursorState) {
    // Support both single indices and {start, end} objects
    const startIdx = typeof cursorState === 'number' ? cursorState : (cursorState?.start ?? this._lastCursorIndex);
    const endIdx = typeof cursorState === 'number' ? cursorState : (cursorState?.end ?? this._lastCursorIndex);

    // Force focus back to the editor so the selection actually applies
    this.ghostLayer.focus();

    const getPos = (index) => {
      const clamped = Math.max(0, Math.min(index, this._markdownState.length));
      const blocks = Array.from(this.ghostLayer.children);
      const astChildren = this._currentAST?.children || [];

      for (let i = 0; i < blocks.length && i < astChildren.length; i++) {
        const block = blocks[i];
        const ast = astChildren[i];
        const blockStart = ast.startIndex;
        const blockEnd = i + 1 < astChildren.length ? astChildren[i + 1].startIndex : this._markdownState.length;

        // Use index < blockEnd to ensure newlines bump to the correct block
        if (clamped >= blockStart && (clamped < blockEnd || i === blocks.length - 1)) {
          const offsetInBlock = clamped - blockStart;
          const textNode = block.firstChild;
          if (textNode && textNode.nodeType === Node.TEXT_NODE) {
            return { node: textNode, offset: Math.min(offsetInBlock, textNode.textContent.length) };
          }
        }
      }

      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock && lastBlock.firstChild && lastBlock.firstChild.nodeType === Node.TEXT_NODE) {
        return { node: lastBlock.firstChild, offset: lastBlock.firstChild.textContent.length };
      }
      return { node: this.ghostLayer, offset: 0 };
    };

    const startPos = getPos(startIdx);
    const endPos = getPos(endIdx);

    if (startPos.node && endPos.node) {
      const range = document.createRange();
      range.setStart(startPos.node, startPos.offset);
      range.setEnd(endPos.node, endPos.offset);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  /* ---------- Public API ---------- */

  getContent() {
    console.log('[StateEditor] getContent', { len: this._markdownState.length });
    return this._markdownState;
  }

  setContent(content) {
    console.log('[StateEditor] setContent', { len: content?.length });
    this._markdownState = content || '';
    const ast = this._parseToAST(this._markdownState);
    this._currentAST = ast;
    this._renderAST(ast);
    this._rebuildGhost();
    this._history = [this._markdownState];
    this._historyIndex = 0;
    this._container.scrollTop = 0;
  }

  focus(where) {
    this.ghostLayer.focus();
    if (where === 'start') {
      this._restoreCursorFromIndex(0);
    } else if (where === 'end') {
      this._restoreCursorFromIndex(this._markdownState.length);
    } else {
      this._restoreCursorFromIndex(this._lastCursorIndex);
    }
  }

  blur() {
    this.ghostLayer.blur();
  }

  undo() {
    if (this._historyIndex > 0) {
      console.log('[StateEditor] undo', { from: this._markdownState, to: this._history[this._historyIndex - 1] });
      this._historyIndex--;
      this._markdownState = this._history[this._historyIndex];
      const ast = this._parseToAST(this._markdownState);
      this._currentAST = ast;
      this._renderAST(ast);
      this._rebuildGhost();
      this._restoreCursorFromIndex(this._markdownState.length);
      if (this._onUpdate) this._onUpdate();
    }
  }

  redo() {
    if (this._historyIndex < this._history.length - 1) {
      console.log('[StateEditor] redo', { from: this._markdownState, to: this._history[this._historyIndex + 1] });
      this._historyIndex++;
      this._markdownState = this._history[this._historyIndex];
      const ast = this._parseToAST(this._markdownState);
      this._currentAST = ast;
      this._renderAST(ast);
      this._rebuildGhost();
      this._restoreCursorFromIndex(this._markdownState.length);
      if (this._onUpdate) this._onUpdate();
    }
  }

  toggleBold() { this._toggleFormat('**'); }
  toggleItalic() { this._toggleFormat('*'); }

  toggleHeading(level) {
    const range = this._getSelectionMarkdownRange() || { start: this._getCursorMarkdownIndex(), end: this._getCursorMarkdownIndex() };
    const md = this._markdownState;

    let lineStart = range.start;
    while (lineStart > 0 && md[lineStart - 1] !== '\n') lineStart--;
    let lineEnd = range.start;
    while (lineEnd < md.length && md[lineEnd] !== '\n') lineEnd++;

    const line = md.slice(lineStart, lineEnd);
    const prefixStr = '#'.repeat(level);

    const matchOld = line.match(/^#+\s+/);
    const oldPrefixLen = matchOld ? matchOld[0].length : 0;
    let newPrefixLen = 0;

    if (line.startsWith(prefixStr + ' ')) {
      const rest = line.slice(prefixStr.length + 1);
      this._markdownState = md.slice(0, lineStart) + rest + md.slice(lineEnd);
      newPrefixLen = 0;
    } else if (/^#+\s/.test(line)) {
      const match = line.match(/^#+\s+/)[0];
      const rest = line.slice(match.length);
      this._markdownState = md.slice(0, lineStart) + prefixStr + ' ' + rest + md.slice(lineEnd);
      newPrefixLen = prefixStr.length + 1;
    } else {
      this._markdownState = md.slice(0, lineStart) + prefixStr + ' ' + line + md.slice(lineEnd);
      newPrefixLen = prefixStr.length + 1;
    }

    const diff = newPrefixLen - oldPrefixLen;
    this._commit({
      start: Math.max(lineStart, range.start + diff),
      end: Math.max(lineStart, range.end + diff)
    });
  }

  toggleBulletList() { this._toggleLinePrefix('- '); }
  toggleOrderedList() { this._toggleLinePrefix('1. '); }
  toggleBlockquote() { this._toggleLinePrefix('> '); }

  insertHorizontalRule() {
    const cursorIdx = this._getCursorMarkdownIndex();
    const md = this._markdownState;
    console.log('[StateEditor] insertHorizontalRule', { cursorIdx });
    this._markdownState = md.slice(0, cursorIdx) + '\n---\n\n' + md.slice(cursorIdx);
    this._commit(cursorIdx + 5);
  }

  clearFormatting() {
    const range = this._getSelectionMarkdownRange();
    const cursorIdx = range ? range.start : this._getCursorMarkdownIndex();
    const md = this._markdownState;
    console.log('[StateEditor] clearFormatting', { cursorIdx, range });

    let lineStart = cursorIdx;
    while (lineStart > 0 && md[lineStart - 1] !== '\n') lineStart--;
    let lineEnd = cursorIdx;
    while (lineEnd < md.length && md[lineEnd] !== '\n') lineEnd++;

    const line = md.slice(lineStart, lineEnd);
    const cleaned = line
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/^#+\s+/, '')
      .replace(/^>\s+/, '')
      .replace(/^-\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/<\/?sup>/g, '');

    this._markdownState = md.slice(0, lineStart) + cleaned + md.slice(lineEnd);
    this._commit(lineStart);
  }

  /* ---------- Internal Format Helpers ---------- */

  _toggleFormat(prefix) {
    let range = this._getSelectionMarkdownRange();
    if (!range) {
      const idx = this._getCursorMarkdownIndex();
      range = { start: idx, end: idx };
    }
    console.log('[StateEditor] toggleFormat', { prefix, range });

    if (range.start === range.end) {
      const r = this._findWordRange(range.start);
      if (r) {
        this._toggleInline(prefix, r.start, r.end);
      } else {
        const md = this._markdownState;
        this._markdownState = md.slice(0, range.start) + prefix + '\u200B' + prefix + md.slice(range.start);
        this._commit(range.start + prefix.length + 1);
      }
      return;
    }
    this._toggleInline(prefix, range.start, range.end);
  }

  _toggleInline(prefix, start, end) {
    const md = this._markdownState;
    const len = prefix.length;
    const before = md.slice(Math.max(0, start - len), start);
    const after = md.slice(end, Math.min(md.length, end + len));
    console.log('[StateEditor] toggleInline', { prefix, start, end, before, after });

    if (before === prefix && after === prefix) {
      this._markdownState = md.slice(0, start - len) + md.slice(start, end) + md.slice(end + len);
      this._commit({ start: start - len, end: end - len });
    } else {
      this._markdownState = md.slice(0, start) + prefix + md.slice(start, end) + prefix + md.slice(end);
      this._commit({ start: start + len, end: end + len });
    }
  }

  _findWordRange(index) {
    const md = this._markdownState;
    let start = index;
    if (start < md.length && (md[start] === '*' || md[start] === '`')) start++;
    while (start > 0 && /\S/.test(md[start - 1]) && md[start - 1] !== '*' && md[start - 1] !== '`') start--;
    let end = start;
    while (end < md.length && /\S/.test(md[end]) && md[end] !== '*' && md[end] !== '`') end++;
    if (start === end) return null;
    return { start, end };
  }

  _toggleLinePrefix(prefix) {
    const range = this._getSelectionMarkdownRange() || { start: this._getCursorMarkdownIndex(), end: this._getCursorMarkdownIndex() };
    const md = this._markdownState;
    console.log('[StateEditor] toggleLinePrefix', { prefix, range });

    let lineStart = range.start;
    while (lineStart > 0 && md[lineStart - 1] !== '\n') lineStart--;
    let lineEnd = range.end;
    while (lineEnd < md.length && md[lineEnd] !== '\n') lineEnd++;

    const linesText = md.slice(lineStart, lineEnd);
    const lines = linesText.split('\n');

    const allHavePrefix = lines.every(l => l.trim() === '' || l.startsWith(prefix));
    const transformed = lines.map(l => {
      if (l.trim() === '') return l;
      if (allHavePrefix) {
        return l.slice(prefix.length);
      } else {
        return prefix + l;
      }
    });

    this._markdownState = md.slice(0, lineStart) + transformed.join('\n') + md.slice(lineEnd);
    const cursorTarget = allHavePrefix ? lineStart : lineEnd + prefix.length;
    this._commit(cursorTarget);
  }
};
