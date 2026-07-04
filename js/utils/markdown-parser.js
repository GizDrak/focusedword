window.MarkdownParser = {
  _escapeHtml(str) {
    return window.HTMLEscape(str);
  },

  parse(text) {
    if (!text) return '';
    let result = '';
    let i = 0;
    while (i < text.length) {
      if (text[i] === '*' && text[i + 1] === '*') {
        const close = text.indexOf('**', i + 2);
        if (close !== -1) {
          result += '<strong>' + this._escapeHtml(text.slice(i + 2, close)) + '</strong>';
          i = close + 2;
          continue;
        }
      }
      if (text[i] === '*') {
        const close = text.indexOf('*', i + 1);
        if (close !== -1 && text[close + 1] !== '*') {
          result += '<em>' + this._escapeHtml(text.slice(i + 1, close)) + '</em>';
          i = close + 1;
          continue;
        }
      }
      result += this._escapeHtml(text[i]);
      i++;
    }
    return result;
  }
};
