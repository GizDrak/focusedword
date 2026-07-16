window.UrlValidator = {
  isValidHttpUrl(str) {
    try {
      const u = new URL(str);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch { return false; }
  },
  isLocalhost(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
  },
  isAllowedEndpoint(str) {
    if (!this.isValidHttpUrl(str)) return false;
    const u = new URL(str);
    if (u.protocol === 'https:') return true;
    if (u.protocol === 'http:' && this.isLocalhost(u.hostname)) return true;
    return false;
  },
  normalizeUrl(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/\/+$/, '');
  },
  isValidSyncKey(str) {
    return typeof str === 'string' && str.length >= 8 && str.length <= 256
      && /^[a-z0-9-]+$/.test(str.toLowerCase().trim());
  },
  VALID_HIGHLIGHT_COLORS: new Set(['#FFD700', '#48BB78', '#63B3ED', '#ED8936', '#9F7AEA', '#F56565']),
  VALID_CATEGORY_COLORS: new Set(['#D0A96C', '#4A90D9', '#5BAA6A', '#8B5CF6', '#E879A8', '#E54D4D', '#E8944A', '#3BB5A0', '#6366F1', '#94A3B8']),
  VALID_BOOKMARK_SET_COLORS: new Set(['#8B5CF6', '#4A90D9', '#5BAA6A', '#D0A96C', '#E879A8', '#E54D4D', '#E8944A', '#3BB5A0', '#6366F1', '#94A3B8', '#FFD700', '#48BB78', '#63B3ED', '#ED8936', '#9F7AEA', '#F56565']),
  escapeAttr(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"'`=]/g, (c) => '&#' + c.charCodeAt(0) + ';');
  },
  safeTag(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[<>&]/g, (c) => '&#' + c.charCodeAt(0) + ';').replace(/\s+/g, ' ').trim();
  }
};
