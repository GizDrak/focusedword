window.WordStudyService = class WordStudyService {
  constructor() {
    this._dataDb = null;
    this._lexDb = null;
    this._dataInitPromise = null;
    this._lexInitPromise = null;
    this._dataReady = false;
    this._lexReady = false;
    this._cache = new Map();
    this._pendingStudies = new Map();
    this._spanCache = new Map();
    this._cacheLimit = 1500;
    this._spanCacheLimit = 32;
  }

  _setLru(map, key, value, limit) {
    map.set(key, value);
    while (map.size > limit) {
      const oldest = map.keys().next().value;
      map.delete(oldest);
    }
  }

  get dataReady() { return this._dataReady; }
  get lexReady() { return this._lexReady; }

  isEnabled() {
    return this._dataReady || !!this._dataInitPromise;
  }

  async initDataDb() {
    if (this._dataReady) return true;
    if (this._dataInitPromise) return this._dataInitPromise;
    this._dataInitPromise = (async () => {
      try {
        const url = (typeof AppConfig !== 'undefined' && AppConfig.WORD_STUDY_DATA_DB)
          ? AppConfig.WORD_STUDY_DATA_DB
          : 'https://repo.focusedword.com/study/bsb_word_data.sqlite';
        const db = await BibleDB.createDbFromBytes(url);
        if (!db) {
          this._dataInitPromise = null;
          return false;
        }
        this._dataDb = db;
        this._dataReady = true;
        return true;
      } catch (e) {
        console.error('[WordStudyService] bsb_word_data init error:', e);
        this._dataInitPromise = null;
        return false;
      }
    })();
    return this._dataInitPromise;
  }

  async initLexDb() {
    if (this._lexReady) return true;
    if (this._lexInitPromise) return this._lexInitPromise;
    this._lexInitPromise = (async () => {
      try {
        const url = (typeof AppConfig !== 'undefined' && AppConfig.LEXICON_DATA_DB)
          ? AppConfig.LEXICON_DATA_DB
          : 'https://repo.focusedword.com/study/lexicon_data.sqlite';
        const db = await BibleDB.createDbFromBytes(url);
        if (!db) {
          this._lexInitPromise = null;
          return false;
        }
        this._lexDb = db;
        this._lexReady = true;
        return true;
      } catch (e) {
        console.error('[WordStudyService] lexicon_data init error:', e);
        this._lexInitPromise = null;
        return false;
      }
    })();
    return this._lexInitPromise;
  }

  async checkForBackgroundUpdates(bridge) {
    let updatedAny = false;
    try {
      const dataUrl = (typeof AppConfig !== 'undefined' && AppConfig.WORD_STUDY_DATA_DB)
        ? AppConfig.WORD_STUDY_DATA_DB
        : 'https://repo.focusedword.com/study/bsb_word_data.sqlite';
      const lexUrl = (typeof AppConfig !== 'undefined' && AppConfig.LEXICON_DATA_DB)
        ? AppConfig.LEXICON_DATA_DB
        : 'https://repo.focusedword.com/study/lexicon_data.sqlite';

      if (this._dataReady) {
        const dataRes = await BibleDB.checkForUpdates(dataUrl);
        if (dataRes.updated && dataRes.bytes) {
          const newDb = BibleDB._deserialize(dataRes.bytes);
          if (newDb) {
            const oldDb = this._dataDb;
            this._dataDb = newDb;
            if (oldDb && oldDb !== newDb) {
              try { oldDb.close(); } catch (e) {}
            }
            this._spanCache.clear();
            this._cache.clear();
            updatedAny = true;
          }
        }
      }

      if (this._lexReady) {
        const lexRes = await BibleDB.checkForUpdates(lexUrl);
        if (lexRes.updated && lexRes.bytes) {
          const newDb = BibleDB._deserialize(lexRes.bytes);
          if (newDb) {
            const oldDb = this._lexDb;
            this._lexDb = newDb;
            if (oldDb && oldDb !== newDb) {
              try { oldDb.close(); } catch (e) {}
            }
            this._cache.clear();
            updatedAny = true;
          }
        }
      }

      if (updatedAny && bridge) {
        const wc = bridge.get('word-class-service');
        if (wc && typeof wc.revalidateCrosswalk === 'function') {
          wc.revalidateCrosswalk();
        }
        bridge.emit('render:refresh');
      }
      return updatedAny;
    } catch (e) {
      console.warn('[WordStudyService] background update check failed:', e);
      return false;
    }
  }

  async getWordStudy(verseId, wordPosition) {
    const cacheKey = `${verseId}:${wordPosition}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    if (this._pendingStudies.has(cacheKey)) return this._pendingStudies.get(cacheKey);

    const pending = this._doStudy(verseId, wordPosition);
    this._pendingStudies.set(cacheKey, pending);
    try {
      const result = await pending;
      if (result) this._setLru(this._cache, cacheKey, result, this._cacheLimit);
      return result;
    } finally {
      this._pendingStudies.delete(cacheKey);
    }
  }

  async _doStudy(verseId, wordPosition) {
    if (!this._dataReady) {
      const ok = await this.initDataDb();
      if (!ok) return null;
    }

    const occ = await this._getOccurrence(verseId, wordPosition);
    if (!occ) return null;

    const result = { occurrence: occ };

    if (!occ.strongs || !occ.strongs_prefix) {
      return result;
    }

    if (!this._lexReady) {
      const ok = await this.initLexDb();
      if (!ok) return result;
    }

    result.lemma = await this._getLemma(occ.strongs, occ.strongs_prefix);
    result.lexicon = await this._getLexicon(occ.strongs, occ.strongs_prefix);
    result.stats = await this._getStats(occ.strongs, occ.strongs_prefix);
    result.tipnr = await this._getTipnr(occ.strongs, occ.strongs_prefix);
    result.pronunciation = await this._getPronunciation(occ.strongs, occ.strongs_prefix);
    result.etymology = await this._getEtymology(occ.strongs, occ.strongs_prefix);
    result.kjvRenderings = await this._getKjvRenderings(occ.strongs, occ.strongs_prefix);
    result.partOfSpeech = await this._getPartOfSpeech(occ.strongs, occ.strongs_prefix);
    result.seeAlso = await this._getSeeAlso(occ.strongs, occ.strongs_prefix);

    if (occ.id) {
      result.occurrence_pronunciation = await this._getOccurrencePronunciation(occ.id);
    }

    if (occ.parsing_short) {
      result.morphology = await this._getMorphology(occ.parsing_short);
    }

    return result;
  }

  async _getOccurrence(verseId, wordPosition) {
    try {
      const rows = [];
      this._dataDb.exec({
        sql: `SELECT id, verse_id, word_position, book, chapter, verse, language,
                     strongs, strongs_prefix, original_text, translit,
                     parsing_short, parsing_full, translation_text
              FROM bible_word_data
              WHERE verse_id = ? AND word_position = ?`,
        bind: [verseId, wordPosition],
        rowMode: 'object',
        resultRows: rows,
      });
      return rows[0] || null;
    } catch (e) {
      console.error('[WordStudyService] _getOccurrence error:', e);
      return null;
    }
  }

  async _getLemma(strongs, prefix) {
    if (!this._lexDb) return null;
    try {
      const rows = [];
      this._lexDb.exec({
        sql: `SELECT estrong, word, translit, morph, gloss, source
              FROM lexicon_entries
              WHERE strongs = ? AND strongs_prefix = ?
              ORDER BY CASE source
                WHEN 'TBESH' THEN 1
                WHEN 'TBESG' THEN 2
                WHEN 'TFLSJ' THEN 3
                WHEN 'TFLSJ_extra' THEN 4
                ELSE 99
              END
              LIMIT 1`,
        bind: [strongs, prefix],
        rowMode: 'object',
        resultRows: rows,
      });
      return rows[0] || null;
    } catch (e) {
      console.error('[WordStudyService] _getLemma error:', e);
      return null;
    }
  }

  async _getLexicon(strongs, prefix) {
    if (!this._lexDb) return [];
    try {
      const rows = [];
      this._lexDb.exec({
        sql: `SELECT estrong, word, translit, morph, gloss, meaning, source, dstrong
              FROM lexicon_entries
              WHERE strongs = ? AND strongs_prefix = ?
              ORDER BY CASE source
                WHEN 'TBESH' THEN 1
                WHEN 'TBESG' THEN 2
                WHEN 'TFLSJ' THEN 3
                WHEN 'TFLSJ_extra' THEN 4
                ELSE 99
              END, estrong`,
        bind: [strongs, prefix],
        rowMode: 'object',
        resultRows: rows,
      });
      return rows;
    } catch (e) {
      console.error('[WordStudyService] _getLexicon error:', e);
      return [];
    }
  }

  async _getStats(strongs, prefix) {
    if (!this._lexDb) return null;
    try {
      const rows = [];
      this._lexDb.exec({
        sql: `SELECT occurrence_count, verse_count
              FROM strongs_stats
              WHERE strongs = ? AND strongs_prefix = ?`,
        bind: [strongs, prefix],
        rowMode: 'object',
        resultRows: rows,
      });
      return rows[0] || null;
    } catch (e) {
      console.error('[WordStudyService] _getStats error:', e);
      return null;
    }
  }

  async _getMorphology(parsingShort) {
    if (!this._lexDb) return null;
    try {
      const rows = [];
      this._lexDb.exec({
        sql: `SELECT code, function, form, gender, morphology, description, example
              FROM morph_codes
              WHERE code = ?`,
        bind: [parsingShort],
        rowMode: 'object',
        resultRows: rows,
      });
      return rows[0] || null;
    } catch (e) {
      console.error('[WordStudyService] _getMorphology error:', e);
      return null;
    }
  }

  async _getTipnr(strongs, prefix) {
    if (!this._lexDb) return [];
    try {
      const rows = [];
      this._lexDb.exec({
        sql: `SELECT name, name_type
              FROM tipnr_names
              WHERE strongs = ? AND strongs_prefix = ?`,
        bind: [strongs, prefix],
        rowMode: 'object',
        resultRows: rows,
      });
      return rows;
    } catch (e) {
      console.error('[WordStudyService] _getTipnr error:', e);
      return [];
    }
  }

  async getOccurrences(strongs, prefix, limit, offset) {
    if (!this._dataReady) {
      const ok = await this.initDataDb();
      if (!ok) return [];
    }
    try {
      const rows = [];
      this._dataDb.exec({
        sql: `SELECT book, chapter, verse, COUNT(*) AS occ_count
              FROM bible_word_data
              WHERE strongs = ? AND strongs_prefix = ?
              GROUP BY book, chapter, verse
              ORDER BY MIN(word_position)
              LIMIT ? OFFSET ?`,
        bind: [strongs, prefix, limit, offset],
        rowMode: 'object',
        resultRows: rows,
      });
      return rows;
    } catch (e) {
      console.error('[WordStudyService] getOccurrences error:', e);
      return [];
    }
  }

  async getTotalOccurrenceVerses(strongs, prefix) {
    if (!this._dataReady) return 0;
    try {
      const rows = [];
      this._dataDb.exec({
        sql: `SELECT COUNT(DISTINCT book || ':' || chapter || ':' || verse) AS cnt
              FROM bible_word_data
              WHERE strongs = ? AND strongs_prefix = ?`,
        bind: [strongs, prefix],
        rowMode: 'object',
        resultRows: rows,
      });
      return rows[0]?.cnt || 0;
    } catch (e) {
      console.error('[WordStudyService] getTotalOccurrenceVerses error:', e);
      return 0;
    }
  }

  async _getPronunciation(strongs, prefix) {
    if (!this._lexDb) return null;
    try {
      const rows = [];
      this._lexDb.exec({
        sql: `SELECT pronunciation, ipa, dic_mod, kind, source
              FROM word_pronunciations
              WHERE strongs = ? AND strongs_prefix = ? AND is_preferred = 1
              LIMIT 1`,
        bind: [strongs, prefix],
        rowMode: 'object',
        resultRows: rows,
      });
      return rows[0] || null;
    } catch (e) {
      console.error('[WordStudyService] _getPronunciation error:', e);
      return null;
    }
  }

  async _getOccurrencePronunciation(bwdId) {
    if (!this._dataReady || !bwdId) return null;
    try {
      const rows = [];
      this._dataDb.exec({
        sql: `SELECT ipa, ipa_mod, sbl, dic, dic_mod
              FROM occurrence_pronunciations
              WHERE bwd_id = ?
              LIMIT 1`,
        bind: [bwdId],
        rowMode: 'object',
        resultRows: rows,
      });
      return rows[0] || null;
    } catch (e) {
      console.error('[WordStudyService] _getOccurrencePronunciation error:', e);
      return null;
    }
  }

  async _getEtymology(strongs, prefix) {
    if (!this._lexDb) return null;
    try {
      const rows = [];
      this._lexDb.exec({
        sql: 'SELECT etymology FROM strongs_etymology WHERE strongs = ? AND strongs_prefix = ? LIMIT 1',
        bind: [strongs, prefix],
        rowMode: 'object',
        resultRows: rows,
      });
      return rows[0] || null;
    } catch (e) {
      console.error('[WordStudyService] _getEtymology error:', e);
      return null;
    }
  }

  async _getKjvRenderings(strongs, prefix) {
    if (!this._lexDb) return [];
    try {
      const rows = [];
      this._lexDb.exec({
        sql: 'SELECT rendering FROM strongs_kjv_renderings WHERE strongs = ? AND strongs_prefix = ?',
        bind: [strongs, prefix],
        rowMode: 'object',
        resultRows: rows,
      });
      const words = [];
      for (const r of rows) {
        try {
          const parsed = JSON.parse(typeof r.rendering === 'string' ? r.rendering : '[]');
          if (Array.isArray(parsed)) {
            for (const p of parsed) if (p.word) words.push(p.word);
          } else if (parsed.word) {
            words.push(parsed.word);
          }
        } catch {}
      }
      return [...new Set(words)];
    } catch (e) {
      console.error('[WordStudyService] _getKjvRenderings error:', e);
      return [];
    }
  }

  async _getPartOfSpeech(strongs, prefix) {
    if (!this._lexDb) return null;
    try {
      const rows = [];
      this._lexDb.exec({
        sql: 'SELECT pos FROM strongs_pos WHERE strongs = ? AND strongs_prefix = ? LIMIT 1',
        bind: [strongs, prefix],
        rowMode: 'object',
        resultRows: rows,
      });
      return rows[0] || null;
    } catch (e) {
      console.error('[WordStudyService] _getPartOfSpeech error:', e);
      return null;
    }
  }

  async _getSeeAlso(strongs, prefix) {
    if (!this._lexDb) return [];
    try {
      const rows = [];
      this._lexDb.exec({
        sql: 'SELECT see_strongs, see_prefix FROM strongs_see_also WHERE strongs = ? AND strongs_prefix = ?',
        bind: [strongs, prefix],
        rowMode: 'object',
        resultRows: rows,
      });
      return rows;
    } catch (e) {
      console.error('[WordStudyService] _getSeeAlso error:', e);
      return [];
    }
  }

  async getChapterStudySpans(bookCode, chapter, cleanTextVerses, wordClassService) {
    const cacheKey = `spans:${bookCode}.${chapter}`;
    if (this._spanCache.has(cacheKey)) return this._spanCache.get(cacheKey);
    if (!this._dataReady) { const ok = await this.initDataDb(); if (!ok) return {}; }

    if (wordClassService && typeof wordClassService.setWordData === 'function') {
      wordClassService.setWordData(this._dataDb);
    }

    let result = {};
    try {
      result = await wordClassService.getChapterWordPositions(bookCode, chapter);
    } catch (e) {
      console.warn('[WordStudyService] getChapterStudySpans error:', e);
    }

    this._setLru(this._spanCache, cacheKey, result, this._spanCacheLimit);
    return result;
  }

  static sanitizeMeaning(html) {
    if (!html) return '';
    const el = document.createElement('div');
    el.innerHTML = html;
    const allowedTags = new Set(['b', 'i', 'em', 'strong', 'br', 'span']);

    // Walk the tree repeatedly until no more disallowed elements remain
    // This handles children promoted by unwrapping earlier passes.
    const clean = () => {
      let changed = false;
      const iter = (node) => {
        if (node.nodeType !== 1) return;
        const tag = node.tagName.toLowerCase();
        const parent = node.parentNode;
        if (!parent) return;

        // Malformed <ref='Book.C.V.'> — tag name contains the attribute
        const refMatch = tag.match(/^ref\s*=\s*['"]([^'"]+)['"]$/i);
        if (refMatch) {
          const ref = refMatch[1];
          const span = document.createElement('span');
          span.className = 'ws-ref';
          span.dataset.ref = ref;
          const txt = node.textContent || ref;
          const m = txt.match(/^([^.;]+[.;]?)/);
          span.textContent = m ? m[1].replace(/[.;]+$/, '') : txt;
          parent.replaceChild(span, node);
          changed = true;
          return;
        }

        // Proper <ref> tag
        if (tag === 'ref') {
          const ref = node.getAttribute('ref') || node.getAttribute('data-ref') || '';
          const span = document.createElement('span');
          span.className = 'ws-ref';
          if (ref) span.dataset.ref = ref;
          const txt = node.textContent || ref;
          const m = txt.match(/^([^.;]+[.;]?)/);
          span.textContent = m ? m[1].replace(/[.;]+$/, '') : txt;
          parent.replaceChild(span, node);
          changed = true;
          return;
        }

        if (!allowedTags.has(tag)) {
          while (node.firstChild) parent.insertBefore(node.firstChild, node);
          parent.removeChild(node);
          changed = true;
          return;
        }
        if (tag === 'a') {
          parent.replaceChild(document.createTextNode(node.textContent), node);
          changed = true;
          return;
        }
        for (const attr of [...node.attributes]) {
          const an = attr.name.toLowerCase();
          if (an !== 'data-ref' && an !== 'lang') node.removeAttribute(attr.name);
        }
        let child = node.firstChild;
        while (child) {
          const next = child.nextSibling;
          iter(child);
          child = next;
        }
      };
      for (const child of [...el.childNodes]) iter(child);
      return changed;
    };

    while (clean()) { /* re-run until stable */ }
    return el.innerHTML;
  }

  invalidateCache() {
    this._cache.clear();
  }

  invalidateChapterSpanCache(bookCode, chapter) {
    this._spanCache.delete(`spans:${bookCode}.${chapter}`);
  }

  destroy() {
    if (this._dataDb) { try { this._dataDb.close(); } catch (e) {} this._dataDb = null; }
    if (this._lexDb) { try { this._lexDb.close(); } catch (e) {} this._lexDb = null; }
    this._dataReady = false;
    this._lexReady = false;
    this._dataInitPromise = null;
    this._lexInitPromise = null;
    this._cache.clear();
    this._pendingStudies.clear();
    this._spanCache.clear();
  }
};
