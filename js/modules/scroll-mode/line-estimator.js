window.LineEstimator = {
  estimateLineCount: function estimateLineCount(text, containerWidthPx, fontSizePx) {
    if (!text || containerWidthPx <= 0) return 1;
    const charsPerLine = Math.floor(containerWidthPx / (fontSizePx * 0.55));
    if (charsPerLine <= 0) return 1;

    const words = text.split(' ');
    let lines = 1;
    let lineLen = 0;

    for (const word of words) {
      if (lineLen + word.length + 1 > charsPerLine) {
        lines++;
        lineLen = word.length;
      } else {
        lineLen += word.length + 1;
      }
    }
    return lines;
  },

  isLikelySingleLine: function isLikelySingleLine(text, containerWidthPx, fontSizePx) {
    return this.estimateLineCount(text, containerWidthPx, fontSizePx) === 1;
  }
};
