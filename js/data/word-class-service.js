window.WordClassService = class WordClassService {
  // v2 annotation backend -------------------------------------------------
  // Display coloring follows the database's recommended precedence:
  // referent first, grammar as fallback. Unresolved tokens stay uncolored.
  static AXIS_DISPLAY_PRECEDENCE = ['referent', 'grammar']

  static AXIS_DEFAULTS = {
    'referent:deity': '#D6C900',
    'referent:people_group': '#00C5E5',
    'referent:person': '#FF7BC1',
    'referent:place': '#FF8F31',
    'referent:quantity': '#00DD9D',
    'referent:spiritual_being': '#FF747A',
    'referent:time': '#D583F8',
    'referent:animal': '#D49838',
    'referent:concept': '#9EB92E',
    'referent:nature': '#22C373',
    'referent:object': '#7F9FC0',
    'referent:theological': '#40A9FF',
    'grammar:adjective': '#BAC45B',
    'grammar:adverb': '#00B2F1',
    'grammar:conjunction': '#DE9277',
    'grammar:determiner': '#BDB89B',
    'grammar:noun': '#F57050',
    'grammar:numeral': '#FFA200',
    'grammar:particle': '#95AAA5',
    'grammar:preposition': '#8D9EFF',
    'grammar:pronoun': '#00D4D5',
    'grammar:proper_noun': '#E773D1',
    'grammar:verb': '#E9AC00',
  }

  // Display-name overrides for axis values whose title-cased form is not
  // user-friendly (e.g. `deity` reads better as "God"). A bare axis name key
  // overrides the axis heading itself (the referent axis is shown as "Class").
  static AXIS_LABELS = {
    referent: 'Class',
    'referent:deity': 'God',
    'referent:object': 'Materials',
    'referent:spiritual_being': 'Spiritual Beings',
  }

  // Referent values that are too fuzzy to earn their own color. They are
  // treated as transparent for display: the token resolves to its grammar
  // axis (Noun) and is omitted from the referent settings group and the
  // word-study referent row. Their raw data still lives in the DB.
  static REFERENT_NOUN_FALLBACK = ['body_part']

  // Referent values merged into a canonical display value. `plant` collapses
  // into `nature` and `substance` into `object` (displayed as "Materials"),
  // so both labels and colors read as one group. Raw per-token data in the DB
  // is unchanged; only display output is normalized. Display resolution
  // happens through normalizeAxisValue().
  static REFERENT_VALUE_MERGE = { plant: 'nature', substance: 'object' }

  // Per-axis on/off defaults. Referent is the primary display axis; grammar
  // is opt-in, so it starts disabled. Absent persisted state falls back here.
  static AXIS_DEFAULT_ENABLED = {
    referent: true,
    grammar: false,
  }

  // Clear Reading is a separate dimming layer, not a color axis. Every value
  // gets an opacity weight per mode — including content and pronouns, which
  // are slightly dimmed too so the per-category toggles and soft/strong modes
  // always have a visible effect. `negation` is emphasized (full opacity +
  // bold) rather than dimmed. Weights are applied on top of the referent/
  // grammar color for the same token.
  static CLEAR_READING_VALUES = [
    { value: 'content', definition: 'Carries primary semantic content' },
    { value: 'pronoun', definition: 'Participant reference without lexical noun' },
    { value: 'connector', definition: 'Joins clauses or phrases' },
    { value: 'relation', definition: 'Marks grammatical relation' },
    { value: 'article', definition: 'Definite or indefinite reference marker' },
    { value: 'negation', definition: 'Negates proposition or constituent' },
  ]

  // Opacity per value per mode. A value absent here (or a toggle
  // turned off) renders at full opacity. `negation` opts into emphasis.
  static CLEAR_READING_WEIGHTS = {
    soft: { content: 0.90, pronoun: 0.90, connector: 0.70, relation: 0.50, article: 0.40, negation: 1.0 },
    strong: { content: 0.80, pronoun: 0.80, connector: 0.55, relation: 0.35, article: 0.25, negation: 1.0 },
  }

  static CLEAR_READING_LABELS = {
    content: 'Content',
    pronoun: 'Pronoun',
    connector: 'Connector',
    relation: 'Relation',
    article: 'Article',
    negation: 'Negation',
  }

  static getClearReadingLabel(value) {
    return WordClassService.CLEAR_READING_LABELS[value] || value
  }

  static getClearReadingWeight(value, mode, toggles) {
    const weights = WordClassService.CLEAR_READING_WEIGHTS[mode]
    const weight = weights && weights[value] != null ? weights[value] : 1.0
    if (toggles && toggles[value] === false) return { opacity: 1.0, fontWeight: null }
    return {
      opacity: weight,
      fontWeight: value === 'negation' && weight === 1.0 ? 600 : null,
    }
  }

  constructor() {
    this._db = null
    this._isReady = false
    this._initPromise = null
    this._chapterCache = new Map()
    this._posCache = new Map()
    this._clearReadingCache = new Map()
    this._bridge = null
    this._vocab = null
    this._wordDataRows = null
    this._wordDataSha256 = null
    this._wordDataDb = null
    this._wordDataValid = null
    this._manifest = null
    this._manifestPromise = null
  }

  get isReady() { return this._isReady }
  get manifest() { return this._manifest }

  async preloadVocabulary() {
    if (this._vocab || !AppConfig.WORD_ANNOTATIONS_V2_VOCABULARY) return this._vocab
    try {
      const resp = await fetch(AppConfig.WORD_ANNOTATIONS_V2_VOCABULARY)
      if (!resp.ok) return null
      const payload = await resp.json()
      const groups = {}
      for (const row of payload.axes || []) {
        if (!groups[row.axis]) groups[row.axis] = []
        groups[row.axis].push({ value: row.value, definition: row.definition })
      }
      this._vocab = { axes: WordClassService.AXIS_DISPLAY_PRECEDENCE.map(axis => ({ axis, values: groups[axis] || [] })) }
      return this._vocab
    } catch (e) {
      console.warn('[WordClassService] vocabulary preload failed:', e)
      return null
    }
  }

  // --- v2 axis helpers ----------------------------------------------------

  static getAxisKey(axis, value) { return axis + ':' + value }

  // CSS custom property that holds a word-class color, so inline styles can
  // reference the OKLCH palette defined in styles.css (which carries a hex
  // fallback for older engines). Returns a var() token, e.g.
  // `var(--wc-referent-deity)`.
  static getAxisCssVar(axis, value) {
    return 'var(--wc-' + axis + '-' + String(value).replace(/_/g, '-') + ')'
  }

  static getAxisDefaultColor(axis, value) {
    return WordClassService.AXIS_DEFAULTS[WordClassService.getAxisKey(axis, value)] || '#888888'
  }

  static getAxisColor(axis, value, overrides) {
    const key = WordClassService.getAxisKey(axis, value)
    if (overrides && overrides[key]) return overrides[key]
    if (WordClassService.AXIS_DEFAULTS[key]) return WordClassService.getAxisCssVar(axis, value)
    return WordClassService.getAxisDefaultColor(axis, value)
  }

  static getAxisLabel(value, axis) {
    if (!value) return ''
    if (axis) {
      const override = WordClassService.AXIS_LABELS[WordClassService.getAxisKey(axis, value)]
      if (override) return override
    }
    const axisNameOverride = WordClassService.AXIS_LABELS[value]
    if (axisNameOverride) return axisNameOverride
    return value.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  static isAxisEnabled(axisSettings, axis) {
    if (axisSettings && axisSettings.axes && axisSettings.axes[axis] !== undefined) {
      return axisSettings.axes[axis] !== false
    }
    return WordClassService.AXIS_DEFAULT_ENABLED[axis] !== false
  }

  static isValueEnabled(axisSettings, axis, value) {
    const key = WordClassService.getAxisKey(axis, value)
    const values = axisSettings && axisSettings.values
    // An explicitly enabled value renders even when its axis master is off
    // (e.g. turning on just "Verb" without enabling all of Grammar).
    if (values && values[key] === true) return true
    if (values && values[key] === false) return false
    return WordClassService.isAxisEnabled(axisSettings, axis)
  }

  async init(bridge) {
    if (this._isReady) return true
    if (this._initPromise) return this._initPromise
    if (bridge.state.get('currentTranslation') !== 'BSB') return false

    this._bridge = bridge

    this._initPromise = (async () => {
      try {
        if (AppConfig.WORD_ANNOTATIONS_V2_ENABLED !== false) {
          const manifest = await this._fetchManifest()
          const db = await BibleDB.createDbFromBytes(AppConfig.WORD_ANNOTATIONS_V2_DB, manifest && manifest.sha256)
          if (db && this._validateV2(db, manifest)) {
            this._db = db
            this._isReady = true
            return true
          }
          if (db) { try { db.close() } catch (e) {} }
        }
        console.warn('[WordClassService] BSB_token_annotations_v2.sqlite unavailable or failed validation')
        this._initPromise = null
        return false
      } catch (e) {
        console.error('[WordClassService] init error:', e)
        this._initPromise = null
        return false
      }
    })()

    return this._initPromise
  }

  async checkForBackgroundUpdate(bridge) {
    if (!this._isReady || !AppConfig.WORD_ANNOTATIONS_V2_ENABLED || !AppConfig.WORD_ANNOTATIONS_V2_DB) return false
    try {
      this._manifestPromise = null
      const manifest = await this._fetchManifest()
      const expectedSha = manifest && manifest.sha256
      const verifiedSha = expectedSha
        ? await BibleDB._getVerifiedSha(AppConfig.WORD_ANNOTATIONS_V2_DB)
        : null
      if (expectedSha && verifiedSha === expectedSha) return false

      // A changed manifest is authoritative. Skip conditional validators so a
      // stale intermediary cannot return the old database for a new version.
      const updateResult = await BibleDB.checkForUpdates(
        AppConfig.WORD_ANNOTATIONS_V2_DB,
        Boolean(expectedSha && verifiedSha !== expectedSha),
      )
      if (!updateResult.updated || !updateResult.bytes) return false

      if (expectedSha) {
        const actualSha = await BibleDB._sha256Hex(updateResult.bytes)
        if (actualSha !== BibleDB.SHA_UNAVAILABLE && actualSha !== expectedSha) {
          console.warn('[WordClassService] downloaded database hash mismatch:', actualSha)
          return false
        }
      }
      const newDb = BibleDB._deserialize(updateResult.bytes)
      if (newDb && this._validateV2(newDb, manifest)) {
        const oldDb = this._db
        this._db = newDb
        if (oldDb && oldDb !== newDb) {
          try { oldDb.close() } catch (e) {}
        }
        if (bridge) {
          bridge.emit('render:refresh')
        }
        if (expectedSha && expectedSha !== BibleDB.SHA_UNAVAILABLE) {
          await BibleDB._setVerifiedSha(AppConfig.WORD_ANNOTATIONS_V2_DB, expectedSha)
        }
        return true
      }
      if (newDb) {
        try { newDb.close() } catch (e) {}
      }
      return false
    } catch (e) {
      console.warn('[WordClassService] background update check failed:', e)
      return false
    }
  }

  _fetchManifest() {
    if (this._manifestPromise) return this._manifestPromise
    if (!AppConfig.WORD_ANNOTATIONS_V2_MANIFEST) return Promise.resolve(null)
    this._manifestPromise = (async () => {
      try {
        const resp = await fetch(AppConfig.WORD_ANNOTATIONS_V2_MANIFEST, { cache: 'no-store' })
        if (!resp.ok) {
          console.warn('[WordClassService] manifest fetch failed:', resp.status)
          return null
        }
        const manifest = await resp.json()
        this._manifest = manifest
        return manifest
      } catch (e) {
        console.warn('[WordClassService] manifest load error:', e)
        return null
      }
    })()
    return this._manifestPromise
  }

  _validateV2(db, manifest) {
    try {
      const tables = new Set()
      const rows = []
      db.exec({ sql: "SELECT name FROM sqlite_master WHERE type = 'table'", rowMode: 'object', resultRows: rows })
      for (const r of rows) tables.add(r.name)
      for (const t of ['tokens', 'token_annotations', 'axis_values', 'source_word_map', 'token_source_links', 'metadata']) {
        if (!tables.has(t)) {
          console.warn('[WordClassService] v2 database missing table:', t)
          return false
        }
      }

      const metaRows = []
      db.exec({ sql: 'SELECT key, value FROM metadata', rowMode: 'object', resultRows: metaRows })
      const meta = {}
      for (const r of metaRows) meta[r.key] = r.value

      if (meta.canonical_schema_version !== '2') {
        console.warn('[WordClassService] v2 database has unsupported schema version:', meta.canonical_schema_version)
        return false
      }
      if (meta.focused_schema_version !== '1') {
        console.warn('[WordClassService] v2 database has unsupported focused schema version:', meta.focused_schema_version)
        return false
      }
      if (meta.accepted_only !== 'true') {
        console.warn('[WordClassService] v2 database is not accepted-only:', meta.accepted_only)
        return false
      }
      if (meta.unresolved_representation !== 'absent') {
        console.warn('[WordClassService] v2 database unresolved_representation is not "absent":', meta.unresolved_representation)
        return false
      }
      // The authoritative schema gate is the database metadata above
      // (meta.focused_schema_version === '1'). The manifest field is
      // optional belt-and-suspenders: reject only when it is present and
      // disagrees, so an export that omits it still loads.
      if (manifest && manifest.focused_schema_version != null && manifest.focused_schema_version !== 1) {
        console.warn('[WordClassService] v2 manifest focused schema version mismatch:', manifest.focused_schema_version)
        return false
      }
      if (meta.recommended_display_precedence) {
        try {
          const precedence = JSON.parse(meta.recommended_display_precedence)
          if (Array.isArray(precedence) && precedence.length) WordClassService.AXIS_DISPLAY_PRECEDENCE = precedence
        } catch (e) { /* keep default */ }
      }
      if (meta.word_data_rows != null) this._wordDataRows = parseInt(meta.word_data_rows, 10)
      if (meta.word_data_sha256) this._wordDataSha256 = meta.word_data_sha256

      const vocabRows = []
      db.exec({
        sql: "SELECT axis, value, definition FROM axis_values WHERE axis IN (?, ?) ORDER BY axis, value",
        bind: [WordClassService.AXIS_DISPLAY_PRECEDENCE[0], WordClassService.AXIS_DISPLAY_PRECEDENCE[1]],
        rowMode: 'object',
        resultRows: vocabRows,
      })
      const groups = {}
      const seenValues = new Set()
      for (const r of vocabRows) {
        const key = r.axis + ':' + r.value
        if (seenValues.has(key)) continue
        seenValues.add(key)
        if (!groups[r.axis]) groups[r.axis] = []
        groups[r.axis].push({ value: r.value, definition: r.definition })
      }
      this._vocab = { axes: WordClassService.AXIS_DISPLAY_PRECEDENCE.map(a => ({ axis: a, values: groups[a] || [] })) }

      return true
    } catch (e) {
      console.warn('[WordClassService] v2 database validation error:', e)
      return false
    }
  }

  _cacheKey(bookCode, chapter) {
    return bookCode + '.' + chapter
  }

  _axisOverrides() {
    const s = this._bridge?.state?.get('wordClassAxisSettings')
    return (s && s.colors) || null
  }

  _axisSettings() {
    return this._bridge?.state?.get('wordClassAxisSettings') || null
  }

  _vocabDef(axis, value) {
    if (!this._vocab) return ''
    const group = this._vocab.axes.find(a => a.axis === axis)
    const v = group && group.values.find(x => x.value === value)
    return v ? v.definition : ''
  }

  static normalizeAxisValue(axis, value) {
    if (axis === 'referent' && value && WordClassService.REFERENT_VALUE_MERGE[value]) {
      return WordClassService.REFERENT_VALUE_MERGE[value]
    }
    return value
  }

  _resolveDisplay(axes) {
    for (const axis of WordClassService.AXIS_DISPLAY_PRECEDENCE) {
      const value = axes[axis]
      if (axis === 'referent' && value && WordClassService.REFERENT_NOUN_FALLBACK.includes(value)) continue
      if (value) return { axis, value: WordClassService.normalizeAxisValue(axis, value) }
    }
    return null
  }

  // --- chapter spans ------------------------------------------------------

  async getChapterRenderSpans(bookCode, chapter) {
    return this._getChapterRenderSpansV2(bookCode, chapter)
  }

  async _getChapterRenderSpansV2(bookCode, chapter) {
    const key = this._cacheKey(bookCode, chapter)
    if (this._chapterCache.has(key)) return this._chapterCache.get(key)
    if (!this._db) return {}

    const result = {}
    try {
      const rows = []
      this._db.exec({
        sql: `SELECT t.token_id, t.verse_id, t.surface, t.word_index, t.char_start, t.char_end, ta.axis, ta.value
              FROM tokens t
              JOIN token_annotations ta ON ta.token_id = t.token_id
              WHERE t.verse_id LIKE ?
              ORDER BY t.token_index, ta.axis`,
        bind: [key + '.%'],
        rowMode: 'object',
        resultRows: rows,
      })

      const perVerse = {}
      for (const r of rows) {
        const verseNum = parseInt(r.verse_id.split('.').pop(), 10)
        if (!perVerse[verseNum]) perVerse[verseNum] = new Map()
        const map = perVerse[verseNum]
        let tok = map.get(r.token_id)
        if (!tok) {
          tok = { tokenId: r.token_id, surface: r.surface, wordIndex: r.word_index, charStart: r.char_start, charEnd: r.char_end, axes: {} }
          map.set(r.token_id, tok)
        }
        tok.axes[r.axis] = r.value
      }

      for (const [verseNum, map] of Object.entries(perVerse)) {
        const out = []
        for (const tok of map.values()) {
          const display = this._resolveDisplay(tok.axes)
          if (!display) continue
          out.push({
            tokenId: tok.tokenId,
            surface: tok.surface,
            wordIndex: tok.wordIndex,
            charStart: tok.charStart,
            charEnd: tok.charEnd,
            axis: display.axis,
            value: display.value,
          })
        }
        result[verseNum] = out
      }
    } catch (e) {
      console.error('[WordClassService] getChapterRenderSpans error:', e)
    }
    this._chapterCache.set(key, result)
    return result
  }

  getChapterWordClasses(bookCode, chapter) {
    return this.getChapterRenderSpans(bookCode, chapter)
  }

  // Clear Reading spans: one value per word token (the DB carries full
  // coverage). Unlike render spans they are not filtered by display precedence
  // or value toggles — every token's role is returned so the renderer can
  // dim/emphasize it.
  async getClearReadingSpans(bookCode, chapter) {
    return this._getClearReadingSpansV2(bookCode, chapter)
  }

  async _getClearReadingSpansV2(bookCode, chapter) {
    const key = this._cacheKey(bookCode, chapter)
    if (this._clearReadingCache.has(key)) return this._clearReadingCache.get(key)
    if (!this._db) return {}

    const result = {}
    try {
      const rows = []
      this._db.exec({
        sql: `SELECT t.token_id, t.verse_id, t.surface, t.word_index, t.char_start, t.char_end, ta.value
              FROM tokens t
              JOIN token_annotations ta ON ta.token_id = t.token_id
              WHERE t.verse_id LIKE ? AND ta.axis = 'discourse'
              ORDER BY t.token_index`,
        bind: [key + '.%'],
        rowMode: 'object',
        resultRows: rows,
      })
      for (const r of rows) {
        const verseNum = parseInt(r.verse_id.split('.').pop(), 10)
        if (!result[verseNum]) result[verseNum] = []
        result[verseNum].push({
          tokenId: r.token_id,
          surface: r.surface,
          wordIndex: r.word_index,
          charStart: r.char_start,
          charEnd: r.char_end,
          value: r.value,
        })
      }
    } catch (e) {
      console.error('[WordClassService] getClearReadingSpans error:', e)
    }
    this._clearReadingCache.set(key, result)
    return result
  }

  async ensureReady(bridge) {
    if (this._isReady) return true
    if (bridge.state.get('currentTranslation') !== 'BSB') return false
    return this.init(bridge)
  }

  // --- word study crosswalk -----------------------------------------------

  // Validate the loaded bsb_word_data.sqlite against the v2 metadata before
  // trusting the embedded crosswalk. Without a match the links are treated as
  // unresolved.
  setWordData(db) {
    if (!db) {
      this._wordDataDb = null
      this._wordDataValid = false
      return
    }
    this._wordDataDb = db
    try {
      const rows = []
      db.exec({ sql: 'SELECT COUNT(*) AS cnt FROM bible_word_data', rowMode: 'object', resultRows: rows })
      const actual = rows[0]?.cnt ?? -1
      if (this._wordDataRows != null && actual === this._wordDataRows) {
        this._wordDataValid = true
      } else {
        console.warn('[WordClassService] bsb_word_data.sqlite rows mismatch (got', actual, 'expected', this._wordDataRows, ') — crosswalk disabled')
        this._wordDataValid = false
      }
    } catch (e) {
      console.warn('[WordClassService] bsb_word_data validation error:', e)
      this._wordDataValid = false
    }
  }

  async getChapterWordPositions(bookCode, chapter) {
    return this._getChapterWordPositionsV2(bookCode, chapter)
  }

  async _getChapterWordPositionsV2(bookCode, chapter) {
    const key = this._cacheKey(bookCode, chapter)
    if (this._posCache.has(key)) return this._posCache.get(key)
    if (!this._db) return {}
    if (this._wordDataValid !== true) {
      console.warn('[WordClassService] word study crosswalk not validated — no source links resolved')
      return {}
    }

    const result = {}
    try {
      const rows = []
      this._db.exec({
        sql: `SELECT t.token_id, t.verse_id, t.surface, t.word_index, t.char_start, t.char_end,
                     swm.client_word_position
              FROM tokens t
              JOIN token_source_links tsl ON tsl.token_id = t.token_id
              JOIN source_word_map swm ON swm.source_word_id = tsl.source_word_id
              WHERE t.verse_id LIKE ?
              ORDER BY t.token_index`,
        bind: [key + '.%'],
        rowMode: 'object',
        resultRows: rows,
      })
      for (const r of rows) {
        const verseNum = parseInt(r.verse_id.split('.').pop(), 10)
        if (!result[verseNum]) result[verseNum] = []
        result[verseNum].push({
          tokenId: r.token_id,
          surface: r.surface,
          wordIndex: r.word_index,
          charStart: r.char_start,
          charEnd: r.char_end,
          wordPosition: r.client_word_position,
        })
      }
    } catch (e) {
      console.error('[WordClassService] getChapterWordPositions error:', e)
    }
    this._posCache.set(key, result)
    return result
  }

  // --- word study panel ---------------------------------------------------

  async getTokenClassificationFromWordPosition(verseId, wordPosition, tokenId) {
    if (!this._isReady) return null
    return this._getTokenClassificationV2(verseId, wordPosition, tokenId)
  }

  async _getTokenClassificationV2(verseId, wordPosition, tokenId) {
    let tid = tokenId
    if (!tid) {
      const rows = []
      try {
        this._db.exec({
          sql: `SELECT tsl.token_id
                FROM token_source_links tsl
                JOIN source_word_map swm ON swm.source_word_id = tsl.source_word_id
                WHERE swm.verse_id = ? AND swm.client_word_position = ?
                LIMIT 1`,
          bind: [verseId, wordPosition],
          rowMode: 'object',
          resultRows: rows,
        })
      } catch (e) {
        console.warn('[WordClassService] token lookup by word position error:', e)
      }
      tid = rows[0]?.token_id || null
    }
    if (!tid) return null

    const tokRows = []
    try {
      this._db.exec({
        sql: 'SELECT token_id, verse_id, surface, char_start, char_end FROM tokens WHERE token_id = ?',
        bind: [tid],
        rowMode: 'object',
        resultRows: tokRows,
      })
    } catch (e) {
      console.warn('[WordClassService] token fetch error:', e)
      return null
    }
    if (!tokRows.length) return null

    const t = tokRows[0]
    const annRows = []
    try {
      this._db.exec({
        sql: 'SELECT axis, value FROM token_annotations WHERE token_id = ?',
        bind: [tid],
        rowMode: 'object',
        resultRows: annRows,
      })
    } catch (e) {
      console.warn('[WordClassService] token annotations error:', e)
      return null
    }

    if (!annRows.length && wordPosition != null) {
      const linked = []
      try {
        this._db.exec({
          sql: `SELECT tsl.token_id
                FROM token_source_links tsl
                JOIN source_word_map swm ON swm.source_word_id = tsl.source_word_id
                JOIN token_annotations ta ON ta.token_id = tsl.token_id
                WHERE swm.verse_id = ? AND swm.client_word_position = ?
                LIMIT 1`,
          bind: [verseId, wordPosition],
          rowMode: 'object',
          resultRows: linked,
        })
      } catch (e) { /* ignore */ }
      if (linked[0] && linked[0].token_id !== tid) {
        return this._getTokenClassificationV2(verseId, wordPosition, linked[0].token_id)
      }
    }

    const axes = {}
    for (const a of annRows) axes[a.axis] = a.value

    const entries = this._buildAxisEntries(axes)
    const display = this._resolveDisplay(axes)

    return {
      tokenId: t.token_id,
      verseId: t.verse_id,
      surface: t.surface,
      wordPosition,
      axes,
      display: display ? { axis: display.axis, value: display.value } : null,
      entries,
    }
  }

  _buildAxisEntries(axes) {
    const entries = []
    const ordered = []
    for (const axis of WordClassService.AXIS_DISPLAY_PRECEDENCE) {
      if (axes[axis]) ordered.push(axis)
    }
    for (const axis of Object.keys(axes).sort()) {
      if (!ordered.includes(axis)) ordered.push(axis)
    }
    for (const axis of ordered) {
      const rawValue = axes[axis]
      if (!rawValue) continue
      if (axis === 'referent' && WordClassService.REFERENT_NOUN_FALLBACK.includes(rawValue)) continue
      const value = WordClassService.normalizeAxisValue(axis, rawValue)
      entries.push({
        axis,
        value,
        key: WordClassService.getAxisKey(axis, value),
        label: WordClassService.getAxisLabel(value, axis),
        definition: this._vocabDef(axis, value),
        color: WordClassService.getAxisColor(axis, value, this._axisOverrides()),
      })
    }
    return entries
  }

  // --- concordance --------------------------------------------------------

  async getConcordance(params = {}) {
    if (!this._isReady) return { rows: [], total: 0 }
    if (params.axis && params.value != null) {
      return this._getConcordanceV2(params.axis, params.value, params.limit, params.offset)
    }
    return { rows: [], total: 0 }
  }

  // Display values may be merged (e.g. `nature`) from multiple raw DB values
  // (e.g. `plant`). Look up all raw values the display value maps from.
  _concordanceDbValues(axis, displayValue) {
    if (axis !== 'referent') return [displayValue]
    const raw = []
    for (const [rawValue, normalized] of Object.entries(WordClassService.REFERENT_VALUE_MERGE)) {
      if (normalized === displayValue) raw.push(rawValue)
    }
    if (!raw.length) return [displayValue]
    return raw
  }

  async _getConcordanceV2(axis, value, limit, offset) {
    const lim = Math.min(limit || 50, 200)
    const off = offset || 0
    const dbValues = this._concordanceDbValues(axis, value)
    const placeholders = dbValues.map(() => '?').join(', ')
    const binds = dbValues.slice()
    try {
      const countRows = []
      this._db.exec({
        sql: `SELECT COUNT(DISTINCT t.verse_id) AS cnt
              FROM token_annotations ta
              JOIN tokens t ON t.token_id = ta.token_id
              WHERE ta.axis = ? AND ta.value IN (${placeholders})`,
        bind: [axis, ...binds],
        rowMode: 'object',
        resultRows: countRows,
      })
      const total = countRows[0]?.cnt || 0

      const rows = []
      this._db.exec({
        sql: `SELECT DISTINCT t.verse_id
              FROM token_annotations ta
              JOIN tokens t ON t.token_id = ta.token_id
              WHERE ta.axis = ? AND ta.value IN (${placeholders})
              ORDER BY t.verse_id
              LIMIT ? OFFSET ?`,
        bind: [axis, ...binds, lim, off],
        rowMode: 'object',
        resultRows: rows,
      })
      const mapped = rows.map(r => {
        const parts = r.verse_id.split('.')
        return { verseId: r.verse_id, bookCode: parts[0], chapter: parseInt(parts[1], 10), verse: parseInt(parts[2], 10) }
      })
      return { rows: mapped, total }
    } catch (e) {
      console.warn('[WordClassService] getConcordance error:', e)
      return { rows: [], total: 0 }
    }
  }

  // --- vocabulary / settings ----------------------------------------------

  getVocabulary() {
    return this._vocab
  }

  // Shape consumed by the Study settings panel and the More… submenu.
  getAxisSettings() {
    const vocab = this.getVocabulary()
    if (!vocab) return null
    const settings = this._axisSettings()
    const overrides = (settings && settings.colors) || null
    return vocab.axes.map(group => ({
      axis: group.axis,
      label: WordClassService.getAxisLabel(group.axis),
      enabled: WordClassService.isAxisEnabled(settings, group.axis),
      values: this._normalizeAxisSettingsValues(group.axis, group.values)
        .filter(v => !(group.axis === 'referent' && WordClassService.REFERENT_NOUN_FALLBACK.includes(v.value)))
        .map(v => ({
          value: v.value,
          key: WordClassService.getAxisKey(group.axis, v.value),
          label: WordClassService.getAxisLabel(v.value, group.axis),
          definition: v.definition,
          enabled: WordClassService.isValueEnabled(settings, group.axis, v.value),
          color: WordClassService.getAxisColor(group.axis, v.value, overrides),
          hex: WordClassService.getAxisDefaultColor(group.axis, v.value),
        })),
    }))
  }

  // Collapse merged referent values (e.g. `plant` -> `nature`) in the settings
  // vocabulary so each display value appears once, keeping the first definition
  // encountered. Raw DB rows drive colors via normalizeAxisValue's target.
  _normalizeAxisSettingsValues(axis, values) {
    const seen = new Set()
    const out = []
    for (const v of values) {
      const nv = WordClassService.normalizeAxisValue(axis, v.value)
      if (nv === v.value && seen.has(v.value)) continue
      if (nv !== v.value && seen.has(nv)) continue
      seen.add(nv)
      out.push({ ...v, value: nv })
    }
    return out
  }

  invalidateChapterCache(bookCode, chapter) {
    const key = this._cacheKey(bookCode, chapter)
    this._chapterCache.delete(key)
    this._posCache.delete(key)
    this._clearReadingCache.delete(key)
  }

  invalidateAllCache() {
    this._chapterCache.clear()
    this._posCache.clear()
    this._clearReadingCache.clear()
  }

  destroy() {
    if (this._db) {
      try { this._db.close() } catch (e) { /* ignore */ }
      this._db = null
    }
    this._chapterCache.clear()
    this._posCache.clear()
    this._clearReadingCache.clear()
    this._isReady = false
    this._initPromise = null
    this._bridge = null
    this._vocab = null
    this._wordDataDb = null
    this._wordDataValid = null
    this._manifest = null
    this._manifestPromise = null
  }
}
