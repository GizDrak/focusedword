window.WordStudyUI = class WordStudyUI {
  constructor(bridge) {
    this.bridge = bridge;
    this._open = false;
    this._verseId = null;
    this._wordPosition = null;
    this._previousFocus = null;
    this._lastTokenClass = null;
    this._lastWcConcordance = null;
    this._init();
  }

  _init() {
    this.overlay = document.getElementById('wordstudy-overlay');
    this.panel = document.getElementById('wordstudy-panel');
    this.body = document.getElementById('wordstudy-body');
    this.title = document.getElementById('wordstudy-title');

    this.closeButton = document.getElementById('wordstudy-close');
    if (this.closeButton) this.closeButton.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', () => this.close());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._open) this.close();
    });

    this.bridge.on('wordstudy:show', (detail) => this._show(detail));
    this.bridge.state.onChange('wordStudyMode', (_, val) => {
      if (!val) this.close();
    });
    this.bridge.on('nav:chapter-loaded', () => {
      if (this._open) this.close();
    });
  }

  async _show(detail) {
    const { verseId, wordPosition, tokenId } = detail;
    this._verseId = verseId;
    this._wordPosition = wordPosition;
    this._tokenId = tokenId || null;
    this._previousFocus = document.activeElement;

    this.body.innerHTML = '<div class="wordstudy-loading">Loading word study…</div>';
    this.panel.inert = false;
    this.panel.setAttribute('aria-hidden', 'false');
    this.overlay.setAttribute('aria-hidden', 'false');
    this.panel.classList.add('open');
    this.overlay.classList.add('open');
    this._open = true;
    if (this.closeButton) this.closeButton.focus();

    const ws = this.bridge.get('word-study-service');
    if (!ws) {
      this._renderError('Word study service not available');
      return;
    }

    const wordStudyPromise = ws.getWordStudy(verseId, wordPosition);

    let tokenClassPromise = null;
    if (this.bridge.state?.get('wordClasses') === true && this.bridge.state?.get('currentTranslation') === 'BSB') {
      const wc = this.bridge.get('word-class-service');
      if (wc && wc.isReady) {
        tokenClassPromise = wc.getTokenClassificationFromWordPosition(verseId, wordPosition, this._tokenId).catch(() => null);
      }
    }

    const promises = [wordStudyPromise];
    if (tokenClassPromise) promises.push(tokenClassPromise);

    const [result, tokenClass] = await Promise.all(promises);
    if (this._verseId !== verseId || this._wordPosition !== wordPosition) return;

    if (!result) {
      this._renderError('Unable to load word data');
      return;
    }

    this._render(result, tokenClass || null);
  }

  _render(result, tokenClass) {
    this._lastResult = result;
    this._lastTokenClass = tokenClass || null;
    const occ = result.occurrence || {};
    const lemma = result.lemma;
    const lexicon = result.lexicon || [];
    const stats = result.stats;
    const tipnr = result.tipnr || [];
    const morph = result.morphology || {};

    const originalText = occ.original_text || '';
    const translit = occ.translit || '';
    const translationText = occ.translation_text || '';
    const bookName = occ.book || '';
    const chapter = occ.chapter || '';
    const verse = occ.verse || '';
    const loc = bookName && chapter ? `${bookName} ${chapter}:${verse}` : '';
    const wordDir = /^(Hebrew|Aramaic)$/i.test(occ.language || '') ? 'rtl' : 'ltr';
    const strongId = occ.strongs && occ.strongs_prefix
      ? `${occ.strongs_prefix}${occ.strongs}`
      : '';

    const pronunciation = result.pronunciation || {};
    const occurrencePron = result.occurrence_pronunciation || {};
    const pronunciationDisplay = pronunciation.dic_mod || pronunciation.pronunciation || '';
    const occPronDisplay = occurrencePron.dic_mod || occurrencePron.dic || '';

    const partOfSpeech = result.partOfSpeech || {};
    const posText = partOfSpeech.pos || '';
    const etymology = result.etymology || {};
    const etymologyText = etymology.etymology || '';
    const kjvRenderings = result.kjvRenderings || [];
    const seeAlso = result.seeAlso || [];

    this.title.textContent = originalText || translationText || 'Word Study';
    const grammar = occ.parsing_full || morph.morphology || morph.description || occ.parsing_short || '';
    const displayGrammar = grammar.replace(/\s+-\s+/g, ' • ');
    const grammarWithPos = [displayGrammar, posText].filter(Boolean).join(' · ');

    const parts = ['<div class="ws-card">'];
    parts.push(`<section class="ws-hero">
      <div class="ws-hero-word">
        ${originalText ? `<div class="ws-original-word" dir="${wordDir}">${this._esc(originalText)}</div>` : ''}
        <div class="ws-reading-line">
          ${translit ? `<span class="ws-translit">${this._esc(translit)}${pronunciationDisplay ? ` [${this._esc(pronunciationDisplay)}]` : ''}</span>` : ''}
          ${translit && translationText ? '<span class="ws-divider" aria-hidden="true"></span>' : ''}
          ${translationText ? `<span class="ws-translation">${this._esc(translationText)}</span>` : ''}
        </div>
        ${occPronDisplay ? `<div class="ws-occ-pron">pron. ${this._esc(occPronDisplay)}</div>` : ''}
      </div>
      <div class="ws-hero-meta">
        ${grammarWithPos ? `<div class="ws-morph">${this._esc(grammarWithPos)}</div>` : ''}
        ${strongId ? `<span class="ws-strong">${this._esc(strongId)}</span>` : ''}
      </div>
    </section>`);

    parts.push(`<section class="ws-stat-grid" aria-label="Word statistics">
      ${strongId && stats ? `<button class="ws-stat-item ws-stat-clickable" data-action="occurrences"><div class="ws-stat-copy"><strong class="ws-stat-value">${this._esc(stats.occurrence_count)}x in ${this._esc(stats.verse_count)} verses</strong><span class="ws-stat-label">Occurrences</span></div></button>` : this._stat(stats ? `${stats.occurrence_count}x in ${stats.verse_count} verses` : '—', 'Occurrences')}
      ${this._stat(occ.language || '—', 'Language')}
      ${this._stat(loc || '—', 'Location')}
    </section>`);

    if (originalText) {
      parts.push(`<section class="ws-word-row ws-form-row">
        <div class="ws-row-label"><span class="ws-section-heading">FORM</span></div>
        <div class="ws-row-content">
          <span class="ws-form-word" dir="${wordDir}">${this._esc(originalText)}</span>
          ${translit ? `<span class="ws-divider" aria-hidden="true"></span><span class="ws-form-translit">${this._esc(translit)}</span>` : ''}
          ${translationText ? `<span class="ws-divider" aria-hidden="true"></span><span class="ws-form-gloss">${this._esc(translationText)}</span>` : ''}
        </div>
      </section>`);
    }

    if (lemma && lemma.word) {
      parts.push(`<section class="ws-word-row ws-lemma-row">
        <div class="ws-row-label"><span class="ws-section-heading">LEMMA</span></div>
        <div class="ws-row-content">
          <span class="ws-lemma-word" dir="${wordDir}">${this._esc(lemma.word)}</span>
          ${lemma.translit ? `<span class="ws-divider" aria-hidden="true"></span><span class="ws-lemma-translit">${this._esc(lemma.translit)}</span>` : ''}
          ${lemma.gloss ? `<span class="ws-divider" aria-hidden="true"></span><span class="ws-lemma-gloss">${this._esc(lemma.gloss)}</span>` : ''}
        </div>
      </section>`);
    }

    // --- Word Class ---
    if (tokenClass) {
      const v2Entries = Array.isArray(tokenClass.entries) ? tokenClass.entries : null;
      if (v2Entries && v2Entries.length) {
        parts.push('<section class="ws-word-class"><div class="ws-lexicon-title">WORD CLASS</div>');
        for (const entry of v2Entries) {
          const axisLabel = WordClassService.getAxisLabel(entry.axis);
          const definition = entry.definition ? ' title="' + this._esc(entry.definition) + '"' : '';
          parts.push('<div class="ws-wc-row ws-wc-clickable" tabindex="0" role="button"' + definition + ' data-wc-axis="' + this._esc(entry.axis) + '" data-wc-value="' + this._esc(entry.value) + '"><span class="ws-wc-label">' + this._esc(axisLabel) + '</span><span class="ws-wc-value"><span class="ws-wc-dot" style="background:' + this._esc(entry.color || '#888') + '"></span>' + this._esc(entry.label) + '</span></div>');
        }
        parts.push('</section>');
      }
    }

    // --- Etymology ---
    if (etymologyText) {
      parts.push(`<section class="ws-etymology"><div class="ws-lexicon-title">ETYMOLOGY</div><div class="ws-dict-note">${this._esc(etymologyText.replace(/;$/, ''))}</div></section>`);
    }

    // --- KJV Renderings ---
    if (kjvRenderings.length) {
      parts.push(`<section class="ws-kjv"><div class="ws-lexicon-title">KJV RENDERINGS</div><div class="ws-kjv-list">${this._esc(kjvRenderings.join(', '))}</div></section>`);
    }

    // --- See Also ---
    if (seeAlso.length) {
      parts.push(`<section class="ws-see-also"><div class="ws-lexicon-title">SEE ALSO</div><div class="ws-see-list">`);
      for (const sa of seeAlso) {
        const targetStrongId = `${sa.see_prefix}${sa.see_strongs}`;
        parts.push(`<button class="ws-see-btn" data-see-strongs="${this._esc(sa.see_strongs)}" data-see-prefix="${this._esc(sa.see_prefix)}">${this._esc(targetStrongId)}</button>`);
      }
      parts.push(`</div></section>`);
    }

    // --- Proper Name ---
    if (tipnr.length) {
      const tipnrParts = tipnr.map(t =>
        `<div class="ws-tipnr-entry">${this._esc(t.name)} — ${this._esc(t.name_type || 'Other')}</div>`
      ).join('');
      parts.push(`<section class="ws-proper-name"><div class="ws-lexicon-title">PROPER NAME</div>${tipnrParts}</section>`);
    }

    // --- LEXICON with tabs ---
    if (lexicon.length) {
      const sourceGroups = {};
      for (const entry of lexicon) {
        const src = entry.source || 'Other';
        if (!sourceGroups[src]) sourceGroups[src] = [];
        sourceGroups[src].push(entry);
      }

      const sourceKeys = Object.keys(sourceGroups);

      parts.push(`<section class="ws-lexicon"><div class="ws-lexicon-title">LEXICON</div>`);

      // Tab strip
      parts.push(`<div class="ws-tabs" role="tablist">`);
      sourceKeys.forEach((src, i) => {
        parts.push(`<button class="ws-tab${i === 0 ? ' active' : ''}" role="tab" aria-selected="${i === 0 ? 'true' : 'false'}" aria-controls="ws-lex-panel-${i}" id="ws-lex-tab-${i}" tabindex="${i === 0 ? '0' : '-1'}">${this._esc(this._lexiconSourceLabel(src))}</button>`);
      });
      parts.push(`</div>`);

      // Panels
      sourceKeys.forEach((src, i) => {
        const entries = sourceGroups[src];
        parts.push(`<div class="ws-tabpanel${i === 0 ? ' active' : ''}" id="ws-lex-panel-${i}" role="tabpanel" aria-labelledby="ws-lex-tab-${i}"${i !== 0 ? ' hidden' : ''}>`);
        for (const entry of entries) {
          parts.push('<article class="ws-lex-entry">');
          if (entry.gloss && entry.gloss !== translationText) {
            parts.push(`<div class="ws-lex-gloss">${this._esc(entry.gloss)}</div>`);
          }
          if (entry.meaning) {
            parts.push(`<div class="ws-lex-meaning">${this._formatDefinition(WordStudyService.sanitizeMeaning(entry.meaning))}</div>`);
          }
          parts.push('</article>');
        }
        parts.push(`</div>`);
      });
      parts.push('</section>');
    }

    parts.push('</div>');
    this.body.innerHTML = parts.join('');
    if (lexicon.length) this._initTabs();
    const occBtn = this.body.querySelector('[data-action="occurrences"]');
    if (occBtn) occBtn.addEventListener('click', () => this._showOccurrences());
    this._wireLexiconRefs();
    this._wireSeeAlso();
    this._wireWcConcordance();
  }

  _wireWcConcordance() {
    this.body.querySelectorAll('.ws-wc-clickable').forEach(row => {
      const handler = () => {
        const axis = row.dataset.wcAxis;
        const value = row.dataset.wcValue;
        if (axis && value) {
          this._showWcConcordance({ axis, value });
        }
      };
      row.addEventListener('click', handler);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
      });
    });
  }

  _wireSeeAlso() {
    this.body.querySelectorAll('[data-see-strongs]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const strongs = btn.dataset.seeStrongs;
        const prefix = btn.dataset.seePrefix;
        if (!strongs || !prefix) return;
        await this._showWordStudy(strongs, prefix);
      });
    });
  }

  async _showWordStudy(strongs, prefix) {
    const ws = this.bridge.get('word-study-service');
    if (!ws) return;
    const rows = [];
    try {
      ws._dataDb.exec({
        sql: 'SELECT verse_id, word_position FROM bible_word_data WHERE strongs = ? AND strongs_prefix = ? ORDER BY word_position LIMIT 1',
        bind: [strongs, prefix],
        rowMode: 'object',
        resultRows: rows,
      });
    } catch {}
    if (!rows.length) return;
    const { verse_id, word_position } = rows[0];
    this.close();
    this.bridge.emit('wordstudy:show', { verseId: verse_id, wordPosition: word_position });
  }

  _wireLexiconRefs() {
    this.body.querySelectorAll('.ws-ref').forEach(el => {
      const ref = el.dataset.ref;
      if (!ref) return;
      const parsed = this._parseRef(ref);
      if (!parsed) return;
      const btn = document.createElement('button');
      btn.className = 'ws-ref-btn';
      btn.textContent = el.textContent;
      btn.dataset.book = parsed.book;
      btn.dataset.chapter = parsed.chapter;
      btn.dataset.verse = parsed.verse;
      btn.addEventListener('click', () => {
        const bookId = BookMap.codeToId(parsed.book);
        if (!bookId) return;
        this.close();
        this.bridge.get('navigation')?.navigateTo(bookId, parsed.chapter, parsed.verse);
      });
      el.parentNode.replaceChild(btn, el);
    });
  }

  _parseRef(ref) {
    const m = ref.match(/^([A-Za-z0-9]+)\.(\d+)\.(\d+)/);
    if (!m) return null;
    return {
      book: m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase(),
      chapter: parseInt(m[2], 10),
      verse: parseInt(m[3], 10),
    };
  }

  _renderError(msg) {
    this.body.innerHTML = `<div class="wordstudy-error">${this._esc(msg)}</div>`;
  }

  _formatDefinition(html) {
    if (!html) return '';
    const el = document.createElement('div');
    el.innerHTML = html;
    const raw = el.innerHTML.replace(/<br\s*\/?>/gi, '\u0000');
    const lines = raw.split('\u0000');
    const parts = [];

    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;

      if (/^(\(AS\)|From Abbott-Smith|Aramaic (of|equivalent)|Also means)/i.test(t)) {
        parts.push(`<div class="ws-dict-note">${t}</div>`);
        continue;
      }

      let m = t.match(/^(\d+(?:[a-z]\d*)*[a-z]?)\s*\)\s*/);
      if (!m) m = t.match(/^_{1,2}(\d+)\.\s*/);
      if (!m) m = t.match(/^<b>\s*_{1,2}(\d+)\s*<\/b>/i);

      if (m) {
        const num = m[1];
        const text = t.slice(m[0].length);
        const depth = this._defDepth(num);
        parts.push(`<div class="ws-dict-row" style="--def-depth:${depth}"><span class="ws-dict-num">${num}.</span><span class="ws-dict-text">${text}</span></div>`);
        continue;
      }

      parts.push(`<div class="ws-dict-prose">${t}</div>`);
    }

    if (!parts.length) return html;
    return parts.join('');
  }

  _defDepth(numStr) {
    let depth = 0;
    for (let i = 1; i < numStr.length; i++) {
      if (/\d/.test(numStr[i]) !== /\d/.test(numStr[i - 1])) depth++;
    }
    return depth;
  }

  _stat(value, label) {
    return `<div class="ws-stat-item"><div class="ws-stat-copy"><strong class="ws-stat-value">${this._esc(String(value))}</strong><span class="ws-stat-label">${label}</span></div></div>`;
  }

  _buildConcordanceParams(params, offset) {
    return { axis: params.axis, value: params.value, limit: 50, offset: offset || 0 };
  }

  _wcConcordanceTitle(params) {
    return WordClassService.getAxisLabel(params.axis) + ' · ' + WordClassService.getAxisLabel(params.value, params.axis);
  }

  async _showWcConcordance(params) {
    const wc = this.bridge.get('word-class-service');
    if (!wc || !wc.isReady) return;

    this._lastWcConcordance = params;

    this.body.innerHTML = '<div class="wordstudy-loading">Loading concordance…</div>';

    const result = await wc.getConcordance(this._buildConcordanceParams(params, 0));
    if (this._verseId !== this._verseId) return;

    const title = this._wcConcordanceTitle(params);

    const parts = ['<div class="ws-card"><section class="ws-occ-header">'];
    parts.push('<button class="ws-occ-back" data-action="back-from-wc" aria-label="Back to word study">');
    parts.push('<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg></button>');
    parts.push('<div class="ws-occ-title">' + this._esc(title) + ' · ' + result.total + ' verses</div></section>');
    parts.push('<section class="ws-occ-list" role="list">');

    if (!result.rows.length) {
      parts.push('<div class="wordstudy-error">No matching verses</div>');
    } else {
      await this._appendWcRows(parts, result.rows, result.total);
    }

    parts.push('</section></div>');
    this.body.innerHTML = parts.join('');
    this._wireWcEvents();
  }

  async _appendWcRows(parts, rows, total) {
    const chapterMap = {};
    for (const r of rows) {
      const key = r.bookCode + ':' + r.chapter;
      if (!chapterMap[key]) chapterMap[key] = [];
      chapterMap[key].push(r);
    }

    const textCache = {};
    const db = this.bridge.db;
    for (const [key, group] of Object.entries(chapterMap)) {
      const [book, ch] = key.split(':');
      try {
        const verses = await db.getChapterTokens(book, parseInt(ch, 10));
        for (const v of verses) {
          textCache[key + ':' + v.verse] = v.clean_text?.trim() || '';
        }
      } catch (e) {
        for (const r of group) {
          textCache[r.bookCode + ':' + r.chapter + ':' + r.verse] = '';
        }
      }
    }

    for (const r of rows) {
      const ref = this._bookName(r.bookCode) + ' ' + r.chapter + ':' + r.verse;
      const text = textCache[r.bookCode + ':' + r.chapter + ':' + r.verse] || '';
      parts.push('<button class="ws-occ-row" data-action="wc-navigate" data-book="' + this._esc(r.bookCode) + '" data-chapter="' + r.chapter + '" data-verse="' + r.verse + '">');
      parts.push('<div class="ws-occ-ref">' + this._esc(ref) + '</div>');
      parts.push('<div class="ws-occ-text">' + this._esc(text.length > 120 ? text.slice(0, 120) + '…' : text) + '</div>');
      parts.push('</button>');
    }

    if (total > rows.length) {
      parts.push('<button class="ws-occ-load-more" data-action="wc-load-more" data-offset="' + rows.length + '">Load ' + Math.min(50, total - rows.length) + ' more</button>');
    }
  }

  _wireWcEvents() {
    this.body.querySelector('[data-action="back-from-wc"]')?.addEventListener('click', () => {
      if (this._lastResult) this._render(this._lastResult, this._lastTokenClass);
    });
    this.body.querySelector('[data-action="wc-load-more"]')?.addEventListener('click', async (e) => {
      e.currentTarget.textContent = 'Loading…';
      e.currentTarget.disabled = true;
      const offset = parseInt(e.currentTarget.dataset.offset, 10);

      const wcRow = e.currentTarget.closest('.ws-card');
      const wc = this.bridge.get('word-class-service');
      if (!wc || !wc.isReady) return;

      const wp = this._lastWcConcordance;
      if (!wp) { e.currentTarget.remove(); return; }
      const result = await wc.getConcordance(this._buildConcordanceParams(wp, offset));
      if (!result.rows.length) { e.currentTarget.remove(); return; }

      const list = this.body.querySelector('.ws-occ-list');
      e.currentTarget.remove();
      const temp = [];
      await this._appendWcRows(temp, result.rows, result.total);
      for (let i = 0; i < temp.length; i++) {
        list.insertAdjacentHTML('beforeend', temp[i]);
      }
      this._wireWcEvents();
    });
    this.body.querySelectorAll('[data-action="wc-navigate"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const book = btn.dataset.book;
        const chapter = parseInt(btn.dataset.chapter, 10);
        const verse = parseInt(btn.dataset.verse, 10);
        const bookId = BookMap.codeToId(book);
        if (!bookId) return;
        this.close();
        this.bridge.get('navigation')?.navigateTo(bookId, chapter, verse);
      });
    });
  }

  async _showOccurrences() {
    const result = this._lastResult;
    if (!result) return;
    const occ = result.occurrence || {};
    const strongs = occ.strongs;
    const prefix = occ.strongs_prefix;
    const strongId = `${prefix}${strongs}`;

    this.body.innerHTML = '<div class="wordstudy-loading">Loading occurrences…</div>';

    const ws = this.bridge.get('word-study-service');
    if (!ws) { this._renderError('Service not available'); return; }

    const totalVerses = await ws.getTotalOccurrenceVerses(strongs, prefix) || result.stats?.verse_count || 0;
    const rows = await ws.getOccurrences(strongs, prefix, 50, 0);
    if (this._lastResult !== result) return;

    const parts = [`<div class="ws-card"><section class="ws-occ-header">
      <button class="ws-occ-back" data-action="back-to-study" aria-label="Back to word study">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <div class="ws-occ-title">${this._esc(strongId)} · ${totalVerses} verses</div>
    </section><section class="ws-occ-list" role="list">`];

    if (!rows.length) {
      parts.push('<div class="wordstudy-error">No occurrences found</div>');
    } else {
      await this._appendOccurrenceRows(parts, rows, totalVerses);
    }

    parts.push('</section></div>');
    this.body.innerHTML = parts.join('');
    this._wireOccurrenceEvents();
  }

  async _appendOccurrenceRows(parts, rows, totalVerses) {
    const chapterMap = {};
    for (const r of rows) {
      const key = `${r.book}:${r.chapter}`;
      if (!chapterMap[key]) chapterMap[key] = [];
      chapterMap[key].push(r);
    }

    const textCache = {};
    const db = this.bridge.db;
    for (const [key, group] of Object.entries(chapterMap)) {
      const [book, ch] = key.split(':');
      try {
        const verses = await db.getChapterTokens(book, parseInt(ch, 10));
        for (const v of verses) {
          textCache[`${key}:${v.verse}`] = v.clean_text?.trim() || '';
        }
      } catch (e) {
        for (const r of group) {
          textCache[`${key}:${r.verse}`] = '';
        }
      }
    }

    for (const r of rows) {
      const ref = `${this._bookName(r.book)} ${r.chapter}:${r.verse}`;
      const text = textCache[`${r.book}:${r.chapter}:${r.verse}`] || '';
      parts.push(`<button class="ws-occ-row" data-action="navigate" data-book="${this._esc(r.book)}" data-chapter="${r.chapter}" data-verse="${r.verse}">
        <div class="ws-occ-ref">${this._esc(ref)}${r.occ_count > 1 ? ` <span class="ws-occ-badge">${r.occ_count}×</span>` : ''}</div>
        <div class="ws-occ-text">${this._esc(text.length > 120 ? text.slice(0, 120) + '…' : text)}</div>
      </button>`);
    }

    if (totalVerses > rows.length) {
      parts.push(`<button class="ws-occ-load-more" data-action="load-more-occs" data-offset="${rows.length}">Load ${Math.min(50, totalVerses - rows.length)} more</button>`);
    }
  }

  _wireOccurrenceEvents() {
    this.body.querySelector('[data-action="back-to-study"]')?.addEventListener('click', () => {
      if (this._lastResult) this._render(this._lastResult, this._lastTokenClass);
    });
    this.body.querySelector('[data-action="load-more-occs"]')?.addEventListener('click', async (e) => {
      e.currentTarget.textContent = 'Loading…';
      e.currentTarget.disabled = true;
      const result = this._lastResult;
      if (!result) return;
      const occ = result.occurrence || {};
      const offset = parseInt(e.currentTarget.dataset.offset, 10);
      const ws = this.bridge.get('word-study-service');
      if (!ws) return;
      const rows = await ws.getOccurrences(occ.strongs, occ.strongs_prefix, 50, offset);
      if (this._lastResult !== result) return;
      const totalVerses = await ws.getTotalOccurrenceVerses(occ.strongs, occ.strongs_prefix) || result.stats?.verse_count || 0;
      const list = this.body.querySelector('.ws-occ-list');
      e.currentTarget.remove();
      const temp = [];
      await this._appendOccurrenceRows(temp, rows, totalVerses);
      for (let i = 1; i < temp.length; i++) {
        list.insertAdjacentHTML('beforeend', temp[i]);
      }
      this._wireOccurrenceEvents();
    });
    this.body.querySelectorAll('[data-action="navigate"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const book = btn.dataset.book;
        const chapter = parseInt(btn.dataset.chapter, 10);
        const verse = parseInt(btn.dataset.verse, 10);
        const bookId = BookMap.codeToId(book);
        if (!bookId) return;
        this.close();
        this.bridge.get('navigation')?.navigateTo(bookId, chapter, verse);
      });
    });
  }

  _bookName(code) {
    const m = BookMap.asCodeMap()[code];
    return m ? m.name : code;
  }

  _lexiconSourceLabel(src) {
    const labels = {
      'TBESH': 'Hebrew Brief (BDB)',
      'TBESG': 'Greek Brief (Abbott-Smith)',
      'TFLSJ': 'Full LSJ Greek',
      'TFLSJ_extra': 'LSJ Extra',
      'TBESG_person': 'Person (Abbott-Smith)',
    };
    return labels[src] || src;
  }

  _initTabs() {
    const tablist = this.body.querySelector('.ws-tabs');
    if (!tablist) return;
    const tabs = tablist.querySelectorAll('.ws-tab');
    const panels = this.body.querySelectorAll('.ws-tabpanel');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => this._selectTab(tab, tabs, panels));
      tab.addEventListener('keydown', (e) => {
        let target = null;
        if (e.key === 'ArrowRight') {
          target = tabs[(Array.from(tabs).indexOf(tab) + 1) % tabs.length];
        } else if (e.key === 'ArrowLeft') {
          target = tabs[(Array.from(tabs).indexOf(tab) - 1 + tabs.length) % tabs.length];
        } else if (e.key === 'Home') {
          target = tabs[0];
        } else if (e.key === 'End') {
          target = tabs[tabs.length - 1];
        }
        if (target) {
          e.preventDefault();
          this._selectTab(target, tabs, panels);
          target.focus();
        }
      });
    });
  }

  _selectTab(tab, tabs, panels) {
    tabs.forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
      t.setAttribute('tabindex', '-1');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    tab.setAttribute('tabindex', '0');

    const panelId = tab.getAttribute('aria-controls');
    panels.forEach(p => {
      p.classList.remove('active');
      p.hidden = true;
    });
    const panel = document.getElementById(panelId);
    if (panel) {
      panel.classList.add('active');
      panel.hidden = false;
    }
  }

  _esc(s) {
    if (!s) return '';
    const el = document.createElement('span');
    el.textContent = s;
    return el.innerHTML;
  }

  close() {
    if (!this._open) return;
    this.panel.classList.remove('open');
    this.overlay.classList.remove('open');
    this.panel.inert = true;
    this.panel.setAttribute('aria-hidden', 'true');
    this.overlay.setAttribute('aria-hidden', 'true');
    this._open = false;
    this._verseId = null;
    this._wordPosition = null;
    this._tokenId = null;
    if (this._previousFocus && this._previousFocus.isConnected) this._previousFocus.focus();
    this._previousFocus = null;
  }
};
