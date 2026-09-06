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
    this._manifestPromises = {};
    this._manifests = {};
    this._registerMigrationOpeners();
  }

  _registerMigrationOpeners() {
    try {
      if (BibleDB && typeof BibleDB._registerStudyDbOpener === 'function') {
        const svc = this;
        if (AppConfig.WORD_STUDY_DATA_DB) {
          BibleDB._registerStudyDbOpener('word-data', AppConfig.WORD_STUDY_DATA_DB, async () =>
            svc._openStudyDb('data'));
        }
        if (AppConfig.LEXICON_DATA_DB) {
          BibleDB._registerStudyDbOpener('lexicon', AppConfig.LEXICON_DATA_DB, async () =>
            svc._openStudyDb('lexicon'));
        }
      }
    } catch (e) { /* ignore */ }
  }

  _resourceConfig(kind) {
    if (kind === 'data') {
      return {
        dbPath: (typeof AppConfig !== 'undefined' && AppConfig.WORD_STUDY_DATA_DB)
          ? AppConfig.WORD_STUDY_DATA_DB
          : 'https://repo.focusedword.com/study/BSB_word_data.sqlite',
        zipUrl: (typeof AppConfig !== 'undefined' && AppConfig.WORD_STUDY_DATA_DB_ZIP) || null,
        manifestUrl: (typeof AppConfig !== 'undefined' && AppConfig.WORD_STUDY_DATA_DB_MANIFEST) || null,
        label: 'word-data',
      };
    }
    return {
      dbPath: (typeof AppConfig !== 'undefined' && AppConfig.LEXICON_DATA_DB)
        ? AppConfig.LEXICON_DATA_DB
        : 'https://repo.focusedword.com/study/lexicon_data.sqlite',
      zipUrl: (typeof AppConfig !== 'undefined' && AppConfig.LEXICON_DATA_DB_ZIP) || null,
      manifestUrl: (typeof AppConfig !== 'undefined' && AppConfig.LEXICON_DATA_DB_MANIFEST) || null,
      label: 'lexicon',
    };
  }

  _fetchManifest(url, kind) {
    if (this._manifestPromises[kind]) return this._manifestPromises[kind];
    if (!url) return Promise.resolve(null);
    this._manifestPromises[kind] = (async () => {
      try {
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) {
          console.warn('[WordStudyService] manifest fetch failed:', url, resp.status);
          return null;
        }
        const manifest = await resp.json();
        this._manifests[kind] = manifest;
        return manifest;
      } catch (e) {
        console.warn('[WordStudyService] manifest load error:', url, e);
        return null;
      }
    })();
    return this._manifestPromises[kind];
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

  async _openStudyDb(kind) {
    const cfg = this._resourceConfig(kind);
    if (!cfg.dbPath) return null;
    const manifest = await this._fetchManifest(cfg.manifestUrl, kind);
    const zip = cfg.zipUrl && manifest ? { url: cfg.zipUrl, manifest } : null;
    if (BibleDB && typeof BibleDB.openStudyDb === 'function') {
      return BibleDB.openStudyDb({
        dbPath: cfg.dbPath,
        expectedSha256: manifest ? manifest.sha256 : null,
        label: cfg.label,
        zip,
      });
    }
    return BibleDB.createDbFromBytes(cfg.dbPath, manifest ? manifest.sha256 : null, zip ? { zip } : undefined);
  }

  async _acceptDb(dbPath, bytes, sha256, label) {
    if (!bytes || !bytes.byteLength) return null;
    if (BibleDB && typeof BibleDB.acceptStudyDbBytes === 'function') {
      return BibleDB.acceptStudyDbBytes({ dbPath: dbPath, bytes, expectedSha256: sha256 || null, label });
    }
    return BibleDB._deserialize(bytes);
  }

  async initDataDb() {
    if (this._dataReady) return true;
    if (this._dataInitPromise) return this._dataInitPromise;
    this._dataInitPromise = (async () => {
      try {
        const db = await this._openStudyDb('data');
        if (!db) {
          this._dataInitPromise = null;
          return false;
        }
        this._dataDb = db;
        this._dataReady = true;
        return true;
      } catch (e) {
        console.error('[WordStudyService] BSB_word_data init error:', e);
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
        const db = await this._openStudyDb('lexicon');
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
      // Startup calls this check while the initial database loads are still
      // in flight. Wait for those loads instead of silently skipping them.
      if (!this._dataReady && this._dataInitPromise) await this._dataInitPromise;
      if (!this._lexReady && this._lexInitPromise) await this._lexInitPromise;

      if (this._dataReady) updatedAny = (await this._checkResourceUpdate('data')) || updatedAny;
      if (this._lexReady) updatedAny = (await this._checkResourceUpdate('lexicon')) || updatedAny;

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

  // Manifest-driven background update for one distribution. When the repo
  // serves a zip, the downloaded container is verified (zip + sqlite hashes)
  // before the inflated payload is accepted.
  async _checkResourceUpdate(kind) {
    const cfg = this._resourceConfig(kind);
    if (!cfg.dbPath) return false;
    try {
      this._manifestPromises[kind] = null;
      const manifest = await this._fetchManifest(cfg.manifestUrl, kind);
      if (cfg.zipUrl && !manifest) {
        console.warn('[WordStudyService] manifest unavailable for', cfg.zipUrl, '— skipping update (fail closed)');
        return false;
      }
      const expectedSha = manifest ? manifest.sha256 : null;
      const verifiedSha = expectedSha
        ? await BibleDB._getVerifiedSha(cfg.dbPath)
        : null;
      if (expectedSha && verifiedSha === expectedSha) return false;

      // A changed manifest is authoritative. Skip conditional validators so a
      // stale intermediary cannot return the old database for a new version.
      const updateResult = await BibleDB.checkForUpdates(
        cfg.zipUrl || cfg.dbPath,
        Boolean(expectedSha && verifiedSha !== expectedSha),
        cfg.zipUrl ? BibleDB._versionedResourceUrl(cfg.zipUrl, manifest) : cfg.dbPath,
      );
      if (!updateResult.updated || !updateResult.bytes) return false;

      let bytes = updateResult.bytes;
      if (cfg.zipUrl) {
        const resolved = await BibleDB.extractZipResource(updateResult.bytes, manifest);
        if (!resolved || !resolved.bytes) {
          console.warn('[WordStudyService] downloaded zip failed verification:', cfg.zipUrl);
          return false;
        }
        bytes = resolved.bytes;
      } else if (expectedSha) {
        const actualSha = await BibleDB._sha256Hex(bytes);
        if (actualSha !== BibleDB.SHA_UNAVAILABLE && actualSha !== expectedSha) {
          console.warn('[WordStudyService] downloaded database hash mismatch:', actualSha);
          return false;
        }
      }

      const newDb = await this._acceptDb(cfg.dbPath, bytes, expectedSha, cfg.label);
      if (newDb) {
        const current = kind === 'data' ? this._dataDb : this._lexDb;
        if (kind === 'data') this._dataDb = newDb;
        else this._lexDb = newDb;
        if (current && current !== newDb) {
          try { current.close(); } catch (e) {}
        }
        this._spanCache.clear();
        this._cache.clear();
        if (expectedSha && expectedSha !== BibleDB.SHA_UNAVAILABLE) {
          await BibleDB._setVerifiedSha(cfg.dbPath, expectedSha);
        }
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[WordStudyService] update check failed for', kind, e);
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
    this._manifestPromises = {};
    this._manifests = {};
  }
};
