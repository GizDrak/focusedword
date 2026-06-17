window.SearchModule = class SearchModule {
  constructor(bridge) {
    this.bridge = bridge;
    this._bookCache = null;
    this._searchTimer = null;
    this._currentPage = 1;
    this._lastQuery = '';
    this._pageSize = 25;
  }

  init() {
    this._ensureBookCache();
    this._setupUI();
  }

  async search(query, { page = 1, pageSize = 25 } = {}) {
    const ftsQuery = this._sanitizeQuery(query);
    if (!ftsQuery) return { results: [], total: 0, page, pageSize };

    const db = this.bridge.db.getCoreDb();
    const offset = (page - 1) * pageSize;

    try {
      const total = db.selectValue(
        'SELECT COUNT(*) FROM bible_search WHERE bible_search MATCH ?',
        [ftsQuery]
      ) ?? 0;
      if (!total) return { results: [], total: 0, page, pageSize };

      const rows = [];
      db.exec({
        sql: `SELECT bv.book, bv.chapter, bv.verse, bv.clean_text, bv.json_tokens
         FROM bible_search
         JOIN bible_verses bv ON bible_search.verse_id = bv.id
         WHERE bible_search MATCH ?
         ORDER BY bm25(bible_search)
         LIMIT ? OFFSET ?`,
        bind: [ftsQuery, pageSize, offset],
        rowMode: 'object',
        resultRows: rows
      });

      const results = rows.map(r => {
        const bookInfo = this._bookCache[r.book] || {};
        return {
          verse: r.verse,
          book: r.book,
          chapter: r.chapter,
          bookId: bookInfo.id || BookMap.codeToId(r.book) || 0,
          bookName: bookInfo.name || r.book,
          cleanText: r.clean_text || '',
          tokens: JSON.parse(r.json_tokens || '[]')
        };
      });

      return { results, total, page, pageSize };
    } catch (e) {
      console.error('[search] query failed:', e, { query, ftsQuery });
      return { results: [], total: 0, page, pageSize };
    }
  }

  _sanitizeQuery(input) {
    const maxLength = (typeof AppConfig !== 'undefined' && AppConfig.SEARCH_MAX_LENGTH) ? AppConfig.SEARCH_MAX_LENGTH : 100;
    const s = input.trim().slice(0, maxLength);
    if (!s) return '';

    const phrases = [];
    const stripped = s.replace(/"([^"]*)"/g, (_, p) => {
      if (p.trim()) phrases.push('"' + p.trim() + '"');
      return '';
    });

    const cleaned = stripped
      .replace(/[*^()+\-,:]/g, ' ')
      .replace(/\b(OR|AND|NOT|NEAR)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const words = cleaned ? cleaned.split(/\s+/).filter(Boolean) : [];

    if (words.length >= 2) {
      phrases.unshift('"' + words.join(' ') + '"');
    }

    const terms = words.length > 0 ? `(${words.join(' ')})` : '';

    const result = [...phrases, terms].filter(Boolean).join(' OR ');

    return result;
  }

  _ensureBookCache() {
    if (this._bookCache) return;
    this._bookCache = {};
    for (const b of BookMap.getBooks()) {
      this._bookCache[b.code] = { id: b.id, name: b.name, code: b.code };
    }
  }

  _escapeHtml(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return str.replace(/[&<>"']/g, ch => map[ch]);
  }

  _setupUI() {
    const discoverTab = document.querySelector('.tab-item[data-tab="discover"]');
    const backdrop = document.getElementById('discover-backdrop');
    const panel = document.getElementById('discover-panel');
    const input = document.getElementById('discover-input');
    const results = document.getElementById('discover-results');
    if (!discoverTab || !backdrop || !panel || !input) return;

    const hide = () => {
      backdrop.classList.add('hidden');
      panel.classList.add('hidden');
      results.innerHTML = '';
      input.value = '';
      this._currentPage = 1;
      this._lastQuery = '';
    };

    discoverTab.addEventListener('click', (e) => {
      e.stopPropagation();
      const mp = document.getElementById('mode-popup');
      if (mp && mp.classList.contains('open')) { mp.classList.remove('open'); mp.classList.add('hidden'); }
      const mrp = document.getElementById('more-popup');
      if (mrp && mrp.classList.contains('open')) { mrp.classList.remove('open'); mrp.classList.add('hidden'); }
      backdrop.classList.remove('hidden');
      panel.classList.remove('hidden');
      requestAnimationFrame(() => input.focus());
    });

    backdrop.addEventListener('click', hide);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.classList.contains('hidden')) {
        hide();
      }
    });

    input.addEventListener('input', () => {
      clearTimeout(this._searchTimer);
      this._currentPage = 1;
      this._lastQuery = input.value.trim();
      const query = this._lastQuery;
      if (!query) {
        results.innerHTML = '';
        return;
      }
      this._searchTimer = setTimeout(async () => {
        const { results: hits } = await this.search(query, { page: 1, pageSize: this._pageSize });
        this._renderResults(hits, query, results, hide);
      }, 250);
    });
  }

  _renderResults(hits, query, container, hide) {
    const isLoadMore = container.querySelector('.search-load-more') !== null;
    const loadMoreBtn = container.querySelector('.search-load-more');
    if (loadMoreBtn) loadMoreBtn.remove();

    if (!hits.length && !isLoadMore) {
      container.innerHTML = '<div class="search-empty">No results found</div>';
      return;
    }

    const highlightTerms = query.split(/\s+/)
      .map(t => t.replace(/["*^()+\-,:]/g, ''))
      .filter(Boolean);

    container.innerHTML = '';

    const frag = document.createDocumentFragment();
    for (const r of hits) {
      let text = this._escapeHtml(r.cleanText);
      if (highlightTerms.length) {
        const escaped = highlightTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        text = text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
      }
      const btn = document.createElement('button');
      btn.className = 'search-result-item';
      btn.innerHTML = '<span class="search-result-ref">' + this._escapeHtml(r.bookName) + ' ' + r.chapter + ':' + r.verse + '</span><span class="search-result-text">' + text + '</span>';
      btn.addEventListener('click', () => {
        hide();
        this.bridge.call('navigation', 'navigateTo', r.bookId, r.chapter, r.verse);
      });
      frag.appendChild(btn);
    }
    container.appendChild(frag);

    if (hits.length === this._pageSize) {
      const more = document.createElement('button');
      more.className = 'search-load-more';
      more.textContent = 'Load More';
      more.addEventListener('click', async () => {
        this._currentPage++;
        more.textContent = 'Loading...';
        more.disabled = true;
        const { results: moreHits } = await this.search(query, { page: this._currentPage, pageSize: this._pageSize });
        more.remove();
        this._renderResults(moreHits, query, container, hide);
      });
      container.appendChild(more);
    }
  }
};
