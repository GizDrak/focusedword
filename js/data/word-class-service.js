window.WordClassService = class WordClassService {
  // Display coloring follows the guide's recommended precedence:
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

  // Token table column that stores the class_value reference for each axis.
  static AXIS_COLUMNS = {
    referent: 'referent_id',
    grammar: 'grammar_id',
    discourse: 'discourse_id',
    event_semantics: 'event_semantics_id',
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
    this._studyDb = null
    this._isReady = false
    this._initPromise = null
    this._chapterCache = new Map()
    this._posCache = new Map()
    this._clearReadingCache = new Map()
    this._verseRangeCache = new Map()
    this._verseOrdinalCache = new Map()
    this._bridge = null
    this._vocab = null
    this._classesMeta = null
    this._axisIds = null
    this._manifest = null
    this._studyManifest = null
    this._manifestPromises = {}
    this._registerMigrationOpeners()
  }

  _registerMigrationOpeners() {
    try {
      if (BibleDB && typeof BibleDB._registerStudyDbOpener === 'function') {
        const svc = this
        BibleDB._registerStudyDbOpener('word-classes', AppConfig.WORD_CLASSES_DB, async () => {
          const manifest = await svc._fetchManifest(AppConfig.WORD_CLASSES_DB_MANIFEST, 'classes')
          return BibleDB.openStudyDb({
            dbPath: AppConfig.WORD_CLASSES_DB,
            expectedSha256: manifest && manifest.sha256,
            validate: (candidate) => svc._validate(candidate, manifest),
            label: 'word-classes',
            zip: AppConfig.WORD_CLASSES_DB_ZIP && manifest ? { url: AppConfig.WORD_CLASSES_DB_ZIP, manifest } : null,
          })
        })
        if (AppConfig.WORD_STUDY_DB) {
          BibleDB._registerStudyDbOpener('word-study', AppConfig.WORD_STUDY_DB, async () => {
            const manifest = await svc._fetchManifest(AppConfig.WORD_STUDY_DB_MANIFEST, 'study')
            return BibleDB.openStudyDb({
              dbPath: AppConfig.WORD_STUDY_DB,
              expectedSha256: manifest && manifest.sha256,
              validate: (candidate) => svc._validateStudy(candidate, manifest),
              label: 'word-study',
              zip: AppConfig.WORD_STUDY_DB_ZIP && manifest ? { url: AppConfig.WORD_STUDY_DB_ZIP, manifest } : null,
            })
          })
        }
      }
    } catch (e) { /* ignore */ }
  }

  get isReady() { return this._isReady }
  get manifest() { return this._manifest }
  get studyManifest() { return this._studyManifest }

  // The vocabulary ships inside the database (class_value/axis tables), so
  // this is only an accessor now; it resolves once the database has loaded.
  async preloadVocabulary() {
    return this._vocab
  }

  // --- axis helpers -------------------------------------------------------

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

  async _openDb(dbPath, sha256, validate, label, zip = null) {
    if (BibleDB && typeof BibleDB.openStudyDb === 'function') {
      return BibleDB.openStudyDb({ dbPath, expectedSha256: sha256 || null, validate: validate || null, label, zip: zip || null })
    }
    return BibleDB.createDbFromBytes(dbPath, sha256 || null, zip ? { zip } : undefined)
  }

  async _acceptDbBytes(dbPath, bytes, sha256, validate, label) {
    if (!bytes || !bytes.byteLength) return null
    if (BibleDB && typeof BibleDB.acceptStudyDbBytes === 'function') {
      return BibleDB.acceptStudyDbBytes({ dbPath, bytes, expectedSha256: sha256 || null, validate: validate || null, label })
    }
    const db = await BibleDB._deserialize(bytes)
    return db
  }

  async init(bridge) {
    if (this._isReady) return true
    if (this._initPromise) return this._initPromise
    if (bridge.state.get('currentTranslation') !== 'BSB') return false

    this._bridge = bridge

    this._initPromise = (async () => {
      try {
        const manifest = await this._fetchManifest(AppConfig.WORD_CLASSES_DB_MANIFEST, 'classes')
        const db = await this._openDb(
          AppConfig.WORD_CLASSES_DB,
          manifest && manifest.sha256,
          (candidate) => this._validate(candidate, manifest),
          'word-classes',
          AppConfig.WORD_CLASSES_DB_ZIP && manifest ? { url: AppConfig.WORD_CLASSES_DB_ZIP, manifest } : null
        )
        if (db && this._validate(db, manifest)) {
          this._db = db
          await this._openStudyCompanion()
          this._isReady = true
          return true
        }
        if (db) { try { db.close() } catch (e) {} }
        console.warn('[WordClassService] word classes database unavailable or failed validation')
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

  // The word-study companion (crosswalk) is optional: word-class coloring
  // works without it, only the study links degrade (guide §8).
  async _openStudyCompanion() {
    try {
      const manifest = await this._fetchManifest(AppConfig.WORD_STUDY_DB_MANIFEST, 'study')
      const db = await this._openDb(
        AppConfig.WORD_STUDY_DB,
        manifest && manifest.sha256,
        (candidate) => this._validateStudy(candidate, manifest),
        'word-study',
        AppConfig.WORD_STUDY_DB_ZIP && manifest ? { url: AppConfig.WORD_STUDY_DB_ZIP, manifest } : null
      )
      if (db && this._validateStudy(db, manifest)) {
        this._studyDb = db
      } else {
        if (db) { try { db.close() } catch (e) {} }
        console.warn('[WordClassService] word study database unavailable or failed companion check — crosswalk disabled')
      }
    } catch (e) {
      console.warn('[WordClassService] word study database load failed — crosswalk disabled:', e)
    }
  }

  async checkForBackgroundUpdate(bridge) {
    if (!this._isReady) {
      if (!this._initPromise) return false
      await this._initPromise
    }
    if (!this._isReady || !AppConfig.WORD_CLASSES_DB) return false
    try {
      const classesUpdated = await this._checkCompanionUpdate('classes', bridge)
      let studyUpdated = false
      if (AppConfig.WORD_STUDY_DB) {
        studyUpdated = await this._checkCompanionUpdate('study', bridge)
      }
      return classesUpdated || studyUpdated
    } catch (e) {
      console.warn('[WordClassService] background update check failed:', e)
      return false
    }
  }

  async _checkCompanionUpdate(kind, bridge) {
    const isClasses = kind === 'classes'
    const dbPath = isClasses ? AppConfig.WORD_CLASSES_DB : AppConfig.WORD_STUDY_DB
    const zipUrl = isClasses ? AppConfig.WORD_CLASSES_DB_ZIP : AppConfig.WORD_STUDY_DB_ZIP
    const manifestUrl = isClasses ? AppConfig.WORD_CLASSES_DB_MANIFEST : AppConfig.WORD_STUDY_DB_MANIFEST
    if (!dbPath) return false
    try {
      this._manifestPromises[kind] = null
      const manifest = await this._fetchManifest(manifestUrl, kind)
      if (zipUrl && !manifest) {
        console.warn('[WordClassService] manifest unavailable for', zipUrl, '— skipping update (fail closed)')
        return false
      }
      const expectedSha = manifest && manifest.sha256
      const verifiedSha = expectedSha
        ? await BibleDB._getVerifiedSha(dbPath)
        : null
      if (expectedSha && verifiedSha === expectedSha) return false

      // A changed manifest is authoritative. Skip conditional validators so a
      // stale intermediary cannot return the old database for a new version.
      const updateResult = await BibleDB.checkForUpdates(
        zipUrl || dbPath,
        Boolean(expectedSha && verifiedSha !== expectedSha),
      )
      if (!updateResult.updated || !updateResult.bytes) return false

      let bytes = updateResult.bytes
      if (zipUrl) {
        const resolved = await BibleDB.extractZipResource(updateResult.bytes, manifest)
        if (!resolved || !resolved.bytes) {
          console.warn('[WordClassService] downloaded zip failed verification:', zipUrl)
          return false
        }
        bytes = resolved.bytes
      } else if (expectedSha) {
        const actualSha = await BibleDB._sha256Hex(updateResult.bytes)
        if (actualSha !== BibleDB.SHA_UNAVAILABLE && actualSha !== expectedSha) {
          console.warn('[WordClassService] downloaded database hash mismatch:', actualSha)
          return false
        }
      }

      const validate = (candidate) => (isClasses
        ? this._validate(candidate, manifest)
        : this._validateStudy(candidate, manifest))
      const newDb = await this._acceptDbBytes(
        dbPath,
        bytes,
        expectedSha || null,
        validate,
        isClasses ? 'word-classes' : 'word-study'
      )
      if (newDb && validate(newDb)) {
        if (isClasses) {
          const oldDb = this._db
          this._db = newDb
          if (oldDb && oldDb !== newDb) {
            try { oldDb.close() } catch (e) {}
          }
        } else {
          const oldDb = this._studyDb
          this._studyDb = newDb
          if (oldDb && oldDb !== newDb) {
            try { oldDb.close() } catch (e) {}
          }
        }
        this.invalidateAllCache()
        if (bridge) {
          bridge.emit('render:refresh')
        }
        if (expectedSha && expectedSha !== BibleDB.SHA_UNAVAILABLE) {
          await BibleDB._setVerifiedSha(dbPath, expectedSha)
        }
        return true
      }
      if (newDb) {
        try { newDb.close() } catch (e) {}
      }
      return false
    } catch (e) {
      console.warn('[WordClassService] update check failed for', kind, e)
      return false
    }
  }

  _fetchManifest(url, kind) {
    if (this._manifestPromises[kind]) return this._manifestPromises[kind]
    if (!url) return Promise.resolve(null)
    this._manifestPromises[kind] = (async () => {
      try {
        const resp = await fetch(url, { cache: 'no-store' })
        if (!resp.ok) {
          console.warn('[WordClassService] manifest fetch failed:', resp.status)
          return null
        }
        const manifest = await resp.json()
        if (kind === 'classes') this._manifest = manifest
        else this._studyManifest = manifest
        return manifest
      } catch (e) {
        console.warn('[WordClassService] manifest load error:', e)
        return null
      }
    })()
    return this._manifestPromises[kind]
  }

  _validate(db, manifest) {
    try {
      const tables = new Set()
      const rows = []
      db.exec({ sql: "SELECT name FROM sqlite_master WHERE type = 'table'", rowMode: 'object', resultRows: rows })
      for (const r of rows) tables.add(r.name)
      for (const t of ['token', 'class_value', 'axis', 'verse', 'book', 'metadata']) {
        if (!tables.has(t)) {
          console.warn('[WordClassService] classes database missing table:', t)
          return false
        }
      }

      const meta = this._readMeta(db)
      if (meta.translation_id !== 'BSB') {
        console.warn('[WordClassService] classes database translation mismatch:', meta.translation_id)
        return false
      }
      if (meta.resource_type !== 'word-classes') {
        console.warn('[WordClassService] classes database resource_type mismatch:', meta.resource_type)
        return false
      }
      if (String(meta.runtime_schema_version) !== '1') {
        console.warn('[WordClassService] classes database unsupported runtime schema version:', meta.runtime_schema_version)
        return false
      }
      if (!meta.compatibility_id) {
        console.warn('[WordClassService] classes database missing compatibility_id')
        return false
      }
      if (manifest) {
        if (manifest.runtimeSchemaVersion != null && String(manifest.runtimeSchemaVersion) !== String(meta.runtime_schema_version)) {
          console.warn('[WordClassService] classes manifest runtime schema mismatch:', manifest.runtimeSchemaVersion)
          return false
        }
        if (manifest.translationId != null && manifest.translationId !== meta.translation_id) {
          console.warn('[WordClassService] classes manifest translation mismatch:', manifest.translationId)
          return false
        }
      }

      this._classesMeta = meta

      this._axisIds = {}
      const axisRows = []
      db.exec({ sql: 'SELECT axis_id, name FROM axis', rowMode: 'object', resultRows: axisRows })
      for (const r of axisRows) this._axisIds[r.name] = r.axis_id

      const vocabRows = []
      db.exec({
        sql: `SELECT a.name AS axis, cv.value, cv.definition
              FROM class_value cv JOIN axis a ON a.axis_id = cv.axis_id
              WHERE a.name IN (?, ?)`,
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
      console.warn('[WordClassService] classes database validation error:', e)
      return false
    }
  }

  _validateStudy(db, manifest) {
    try {
      const tables = new Set()
      const rows = []
      db.exec({ sql: "SELECT name FROM sqlite_master WHERE type = 'table'", rowMode: 'object', resultRows: rows })
      for (const r of rows) tables.add(r.name)
      for (const t of ['crosswalk', 'verse', 'book', 'metadata']) {
        if (!tables.has(t)) {
          console.warn('[WordClassService] study database missing table:', t)
          return false
        }
      }

      const meta = this._readMeta(db)
      if (meta.translation_id !== 'BSB') {
        console.warn('[WordClassService] study database translation mismatch:', meta.translation_id)
        return false
      }
      if (meta.resource_type !== 'word-study') {
        console.warn('[WordClassService] study database resource_type mismatch:', meta.resource_type)
        return false
      }
      if (String(meta.runtime_schema_version) !== '1') {
        console.warn('[WordClassService] study database unsupported runtime schema version:', meta.runtime_schema_version)
        return false
      }
      if (manifest) {
        if (manifest.runtimeSchemaVersion != null && String(manifest.runtimeSchemaVersion) !== String(meta.runtime_schema_version)) {
          console.warn('[WordClassService] study manifest runtime schema mismatch:', manifest.runtimeSchemaVersion)
          return false
        }
        if (manifest.translationId != null && manifest.translationId !== meta.translation_id) {
          console.warn('[WordClassService] study manifest translation mismatch:', manifest.translationId)
          return false
        }
      }

      // Companion lock (guide §7): the crosswalk is only valid for the exact
      // classes build it was generated against.
      const classesMeta = this._classesMeta
      if (classesMeta) {
        for (const key of ['translation_id', 'compatibility_id', 'runtime_schema_version', 'source_classes_master_sha256']) {
          if (classesMeta[key] && meta[key] !== classesMeta[key]) {
            console.warn('[WordClassService] study database companion mismatch on', key, '— crosswalk disabled')
            return false
          }
        }
      }

      return true
    } catch (e) {
      console.warn('[WordClassService] study database validation error:', e)
      return false
    }
  }

  _readMeta(db) {
    const metaRows = []
    db.exec({ sql: 'SELECT key, value FROM metadata', rowMode: 'object', resultRows: metaRows })
    const meta = {}
    for (const r of metaRows) meta[r.key] = r.value
    return meta
  }

  // --- verse id mapping ----------------------------------------------------
  // Callers address verses with "BOOK.CHAPTER.VERSE" strings while the runtime
  // databases use integer verse_id ordinals. These helpers translate between
  // the two and cache the (per-version stable) mappings.

  _verseRangeForChapter(bookCode, chapter) {
    const key = bookCode + '.' + chapter
    if (this._verseRangeCache.has(key)) return this._verseRangeCache.get(key)
    let range = null
    try {
      const rows = []
      this._db.exec({
        sql: `SELECT MIN(v.verse_id) AS lo, MAX(v.verse_id) AS hi
              FROM verse v JOIN book b ON b.book_id = v.book_id
              WHERE b.book_code = ? AND v.chapter = ?`,
        bind: [bookCode, chapter],
        rowMode: 'object',
        resultRows: rows,
      })
      if (rows[0] && rows[0].lo != null) range = { lo: rows[0].lo, hi: rows[0].hi }
    } catch (e) {
      console.warn('[WordClassService] verse range lookup failed:', e)
    }
    this._verseRangeCache.set(key, range)
    return range
  }

  async _verseOrdinal(verseId) {
    if (typeof verseId === 'number') return verseId
    if (this._verseOrdinalCache.has(verseId)) return this._verseOrdinalCache.get(verseId)
    const parts = String(verseId || '').split('.')
    if (parts.length !== 3 || !this._db) return null
    let ordinal = null
    try {
      const rows = []
      this._db.exec({
        sql: `SELECT v.verse_id
              FROM verse v JOIN book b ON b.book_id = v.book_id
              WHERE b.book_code = ? AND v.chapter = ? AND v.verse = ?`,
        bind: [parts[0], parseInt(parts[1], 10), parseInt(parts[2], 10)],
        rowMode: 'object',
        resultRows: rows,
      })
      if (rows[0]) ordinal = rows[0].verse_id
    } catch (e) {
      console.warn('[WordClassService] verse ordinal lookup failed:', e)
    }
    this._verseOrdinalCache.set(verseId, ordinal)
    return ordinal
  }

  async _refsForOrdinals(ids) {
    const out = []
    const wanted = (ids || []).filter(id => id != null)
    if (!wanted.length || !this._db) return out
    const byId = {}
    try {
      const rows = []
      const placeholders = wanted.map(() => '?').join(', ')
      this._db.exec({
        sql: `SELECT v.verse_id, b.book_code, v.chapter, v.verse
              FROM verse v JOIN book b ON b.book_id = v.book_id
              WHERE v.verse_id IN (${placeholders})`,
        bind: wanted,
        rowMode: 'object',
        resultRows: rows,
      })
      for (const r of rows) byId[r.verse_id] = r
    } catch (e) {
      console.warn('[WordClassService] verse ref lookup failed:', e)
      return out
    }
    for (const id of wanted) {
      const r = byId[id]
      if (r) out.push({
        verseId: `${r.book_code}.${r.chapter}.${r.verse}`,
        bookCode: r.book_code,
        chapter: r.chapter,
        verse: r.verse,
      })
    }
    return out
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
    const key = this._cacheKey(bookCode, chapter)
    if (this._chapterCache.has(key)) return this._chapterCache.get(key)
    if (!this._db) return {}

    const result = {}
    try {
      const range = this._verseRangeForChapter(bookCode, chapter)
      if (!range) return result
      const rows = []
      this._db.exec({
        sql: `SELECT t.token_id, v.verse AS verse_num, t.surface, t.word_index, t.char_start, t.char_end,
                     a.name AS axis, cv.value
              FROM token t
              JOIN verse v ON v.verse_id = t.verse_id
              JOIN class_value cv ON cv.value_id IN (t.referent_id, t.grammar_id, t.discourse_id, t.event_semantics_id)
              JOIN axis a ON a.axis_id = cv.axis_id
              WHERE t.verse_id BETWEEN ? AND ?
              ORDER BY t.token_index`,
        bind: [range.lo, range.hi],
        rowMode: 'object',
        resultRows: rows,
      })

      const perVerse = {}
      for (const r of rows) {
        const verseNum = r.verse_num
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
    const key = this._cacheKey(bookCode, chapter)
    if (this._clearReadingCache.has(key)) return this._clearReadingCache.get(key)
    if (!this._db) return {}

    const result = {}
    try {
      const range = this._verseRangeForChapter(bookCode, chapter)
      if (!range) return result
      const rows = []
      this._db.exec({
        sql: `SELECT t.token_id, v.verse AS verse_num, t.surface, t.word_index, t.char_start, t.char_end, cv.value
              FROM token t
              JOIN verse v ON v.verse_id = t.verse_id
              JOIN class_value cv ON cv.value_id = t.discourse_id
              WHERE t.verse_id BETWEEN ? AND ?
              ORDER BY t.token_index`,
        bind: [range.lo, range.hi],
        rowMode: 'object',
        resultRows: rows,
      })
      for (const r of rows) {
        const verseNum = r.verse_num
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

  // --- word study crosswalk ------------------------------------------------

  // Kept for API compatibility: the crosswalk now lives in the dedicated
  // BSB_word_study.sqlite companion and no longer depends on bsb_word_data
  // row fingerprints (guide §6/§11).
  setWordData(db) {
    this._wordDataDb = db || null
  }

  async getChapterWordPositions(bookCode, chapter) {
    const key = this._cacheKey(bookCode, chapter)
    if (this._posCache.has(key)) return this._posCache.get(key)
    if (!this._db || !this._studyDb) return {}

    const result = {}
    try {
      const range = this._verseRangeForChapter(bookCode, chapter)
      if (!range) return result

      const cwRows = []
      this._studyDb.exec({
        sql: `SELECT cw.token_id, v.verse AS verse_num, cw.client_word_position
              FROM crosswalk cw JOIN verse v ON v.verse_id = cw.verse_id
              WHERE cw.verse_id BETWEEN ? AND ?`,
        bind: [range.lo, range.hi],
        rowMode: 'object',
        resultRows: cwRows,
      })
      if (!cwRows.length) {
        this._posCache.set(key, result)
        return result
      }

      const tokenRows = []
      this._db.exec({
        sql: `SELECT token_id, surface, word_index, char_start, char_end, token_index
              FROM token
              WHERE verse_id BETWEEN ? AND ?`,
        bind: [range.lo, range.hi],
        rowMode: 'object',
        resultRows: tokenRows,
      })
      const tokenById = new Map()
      for (const r of tokenRows) tokenById.set(r.token_id, r)

      const perVerse = {}
      for (const r of cwRows) {
        const tok = tokenById.get(r.token_id)
        if (!tok) continue
        if (!perVerse[r.verse_num]) perVerse[r.verse_num] = []
        perVerse[r.verse_num].push({
          tokenId: r.token_id,
          surface: tok.surface,
          wordIndex: tok.word_index,
          charStart: tok.char_start,
          charEnd: tok.char_end,
          wordPosition: r.client_word_position,
          _order: tok.token_index,
        })
      }
      for (const [verseNum, list] of Object.entries(perVerse)) {
        list.sort((a, b) => (a._order ?? 0) - (b._order ?? 0))
        for (const item of list) delete item._order
        result[verseNum] = list
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
    return this._getTokenClassification(verseId, wordPosition, tokenId, 0)
  }

  async _getTokenClassification(verseId, wordPosition, tokenId, depth) {
    let tid = tokenId != null ? tokenId : null
    let ordinal = null
    if (tid == null) {
      ordinal = await this._verseOrdinal(verseId)
      if (!ordinal || !this._studyDb) return null
      const rows = []
      try {
        this._studyDb.exec({
          sql: 'SELECT token_id FROM crosswalk WHERE verse_id = ? AND client_word_position = ? LIMIT 1',
          bind: [ordinal, wordPosition],
          rowMode: 'object',
          resultRows: rows,
        })
      } catch (e) {
        console.warn('[WordClassService] token lookup by word position error:', e)
      }
      tid = rows[0]?.token_id ?? null
    }
    if (tid == null) return null

    const tokRows = []
    try {
      this._db.exec({
        sql: `SELECT token_id, verse_id, surface, char_start, char_end,
                     referent_id, grammar_id, discourse_id, event_semantics_id
              FROM token WHERE token_id = ?`,
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
    const axes = this._axesForToken(t)

    // A crosswalk position can resolve to several tokens (e.g. a multi-word
    // phrase). If the first carries no classification, try its siblings.
    if (!Object.keys(axes).length && wordPosition != null && depth < 1 && this._studyDb) {
      if (ordinal == null) ordinal = await this._verseOrdinal(verseId)
      if (ordinal) {
        const linked = []
        try {
          this._studyDb.exec({
            sql: `SELECT token_id FROM crosswalk
                  WHERE verse_id = ? AND client_word_position = ? AND token_id != ?
                  LIMIT 1`,
            bind: [ordinal, wordPosition, tid],
            rowMode: 'object',
            resultRows: linked,
          })
        } catch (e) { /* ignore */ }
        if (linked[0] && linked[0].token_id != null) {
          return this._getTokenClassification(verseId, wordPosition, linked[0].token_id, depth + 1)
        }
      }
    }

    const refs = await this._refsForOrdinals([t.verse_id])
    const display = this._resolveDisplay(axes)
    return {
      tokenId: t.token_id,
      verseId: refs[0] ? refs[0].verseId : t.verse_id,
      surface: t.surface,
      wordPosition,
      axes,
      display: display ? { axis: display.axis, value: display.value } : null,
      entries: this._buildAxisEntries(axes),
    }
  }

  _axesForToken(t) {
    const ids = {
      referent: t.referent_id,
      grammar: t.grammar_id,
      discourse: t.discourse_id,
      event_semantics: t.event_semantics_id,
    }
    const present = Object.values(ids).filter(id => id != null)
    if (!present.length) return {}
    const rows = []
    try {
      const placeholders = present.map(() => '?').join(', ')
      this._db.exec({
        sql: `SELECT cv.value_id, cv.value, a.name AS axis
              FROM class_value cv JOIN axis a ON a.axis_id = cv.axis_id
              WHERE cv.value_id IN (${placeholders})`,
        bind: present,
        rowMode: 'object',
        resultRows: rows,
      })
    } catch (e) {
      console.warn('[WordClassService] token class lookup error:', e)
      return {}
    }
    const byId = {}
    for (const r of rows) byId[r.value_id] = r
    const axes = {}
    for (const [axis, id] of Object.entries(ids)) {
      const cv = id != null ? byId[id] : null
      if (cv) axes[cv.axis] = cv.value
    }
    return axes
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
      return this._getConcordance(params.axis, params.value, params.limit, params.offset)
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

  async _getConcordance(axis, value, limit, offset) {
    const column = WordClassService.AXIS_COLUMNS[axis]
    const axisId = this._axisIds ? this._axisIds[axis] : null
    if (!column || !axisId || !this._db) return { rows: [], total: 0 }
    const lim = Math.min(limit || 50, 200)
    const off = offset || 0
    const dbValues = this._concordanceDbValues(axis, value)
    const placeholders = dbValues.map(() => '?').join(', ')
    const binds = dbValues.slice()
    try {
      const countRows = []
      this._db.exec({
        sql: `SELECT COUNT(DISTINCT t.verse_id) AS cnt
              FROM token t
              JOIN class_value cv ON cv.value_id = t.${column}
              WHERE cv.axis_id = ? AND cv.value IN (${placeholders})`,
        bind: [axisId, ...binds],
        rowMode: 'object',
        resultRows: countRows,
      })
      const total = countRows[0]?.cnt || 0

      const rows = []
      this._db.exec({
        sql: `SELECT DISTINCT t.verse_id
              FROM token t
              JOIN class_value cv ON cv.value_id = t.${column}
              WHERE cv.axis_id = ? AND cv.value IN (${placeholders})
              ORDER BY t.verse_id
              LIMIT ? OFFSET ?`,
        bind: [axisId, ...binds, lim, off],
        rowMode: 'object',
        resultRows: rows,
      })
      const refs = await this._refsForOrdinals(rows.map(r => r.verse_id))
      return { rows: refs, total }
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
    if (this._studyDb) {
      try { this._studyDb.close() } catch (e) { /* ignore */ }
      this._studyDb = null
    }
    this._chapterCache.clear()
    this._posCache.clear()
    this._clearReadingCache.clear()
    this._verseRangeCache.clear()
    this._verseOrdinalCache.clear()
    this._isReady = false
    this._initPromise = null
    this._bridge = null
    this._vocab = null
    this._classesMeta = null
    this._axisIds = null
    this._wordDataDb = null
    this._manifest = null
    this._studyManifest = null
    this._manifestPromises = {}
  }
}
