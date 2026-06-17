window.CharResolver = {
  resolveCharPosition: function resolveCharPosition(bandY, useRangeFromPoint) {
    const midX = window.innerWidth / 2;

    if (!useRangeFromPoint && document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(midX, bandY);
      if (pos) {
        return { node: pos.offsetNode, offset: pos.offset };
      }
    }

    const range = document.caretRangeFromPoint(midX, bandY);
    if (range) {
      return { node: range.startContainer, offset: range.startOffset };
    }

    return null;
  },

  getLineRange: function getLineRange(node, offset) {
    if (!node) return null;

    const range = document.createRange();
    range.setStart(node, offset);
    range.setEnd(node, offset);
    const rects = range.getClientRects();
    if (!rects.length) return null;

    const targetY = rects[0].top;

    const lineRange = document.createRange();
    lineRange.setStart(node, offset);
    lineRange.setEnd(node, offset);

    let backwardOffset = offset;
    while (backwardOffset > 0) {
      lineRange.setStart(node, backwardOffset - 1);
      const r = lineRange.getClientRects();
      if (!r.length || r[0].top !== targetY) {
        lineRange.setStart(node, backwardOffset);
        break;
      }
      backwardOffset--;
      lineRange.setStart(node, backwardOffset);
    }

    let forwardOffset = offset;
    while (forwardOffset < node.textContent.length) {
      lineRange.setEnd(node, forwardOffset + 1);
      const r = lineRange.getClientRects();
      if (!r.length || r[r.length - 1].top !== targetY) {
        lineRange.setEnd(node, forwardOffset);
        break;
      }
      forwardOffset++;
      lineRange.setEnd(node, forwardOffset);
    }

    return lineRange;
  },

  findActiveVerse: function findActiveVerse(containers, bandY) {
    if (!containers || !containers.length) return null;

    const hit = document.elementFromPoint(window.innerWidth / 2, bandY);
    if (hit) {
      const verseEl = hit.closest && hit.closest('.verse-container');
      if (verseEl && containers.indexOf(verseEl) !== -1) return verseEl;
    }

    let active = containers[0];
    for (let i = 0; i < containers.length; i++) {
      const top = containers[i].getBoundingClientRect().top;
      if (top <= bandY) {
        active = containers[i];
      } else {
        break;
      }
    }
    return active;
  }
};
