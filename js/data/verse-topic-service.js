window.VerseTopicService = class VerseTopicService {
  // Primary verse topics come from verse_color_topics.sqlite. Each verse has
  // exactly one primary topic (100% coverage, no needs_review / no fallback),
  // resolved against the `topic` palette. The renderer marks the verse and
  // attaches a right-edge tab in the topic color; this service only resolves
  // which topic a verse belongs to plus the display color (DB default or a
  // settings override).

  constructor() {
    this.isReady = false
    this._db = null
    this._initPromise = null
    this._manifest = null
    this._manifestPromise = null
    this._topics = []
    this._topicsById = new Map()
    this._chapterCache = new Map()
    this._registerMigrationOpener()
  }

  _registerMigrationOpener() {
    try {
      if (BibleDB && typeof BibleDB._registerStudyDbOpener === 'function') {
        const svc = this
        BibleDB._registerStudyDbOpener('verse-topics', AppConfig.VERSE_TOPICS_DB, async () => {
          const manifest = await svc._fetchManifest()
          const zip = AppConfig.VERSE_TOPICS_DB_ZIP && manifest
            ? { url: AppConfig.VERSE_TOPICS_DB_ZIP, manifest }
            : null
          return BibleDB.openStudyDb({
            dbPath: AppConfig.VERSE_TOPICS_DB,
            expectedSha256: manifest && manifest.sha256,
            validate: (candidate) => svc._validate(candidate),
            label: 'verse-topics',
            zip,
          })
        })
      }
    } catch (e) { /* ignore */ }
  }

  get topics() {
    return this._topics
  }

  getTopicById(topicId) {
    return this._topicsById.get(topicId) || null
  }

  // Display color for a topic: a settings override wins, otherwise the DB
  // default color_hex.
  getTopicColor(topicId, overrides) {
    const overridden = overrides && overrides.colors && overrides.colors[topicId]
    if (overridden) return overridden
    const topic = this.getTopicById(topicId)
    return topic ? topic.color_hex : '#888888'
  }

  _zipConfig(manifest) {
    return AppConfig.VERSE_TOPICS_DB_ZIP && manifest
      ? { url: AppConfig.VERSE_TOPICS_DB_ZIP, manifest }
      : null
  }

  async _openDb(dbPath, sha256, validate, label, zip = null) {
    if (BibleDB && typeof BibleDB.openStudyDb === 'function') {
      return BibleDB.openStudyDb({ dbPath, expectedSha256: sha256 || null, validate: validate || null, label, zip: zip || null });
    }
    return BibleDB.createDbFromBytes(dbPath, sha256 || null, zip ? { zip } : undefined)
  }

  async _acceptDb(dbPath, bytes, sha256, validate, label) {
    if (!bytes || !bytes.byteLength) return null
    if (BibleDB && typeof BibleDB.acceptStudyDbBytes === 'function') {
      return BibleDB.acceptStudyDbBytes({ dbPath, bytes, expectedSha256: sha256 || null, validate: validate || null, label });
    }
    const db = await BibleDB._deserialize(bytes)
    return db
  }

  // Works with any translation: the topics database is keyed by book code +
  // chapter, which all installed translations share.
  async init(bridge) {
    if (this.isReady) return true
    if (this._initPromise) return this._initPromise
    this._bridge = bridge

    this._initPromise = (async () => {
      try {
        if (AppConfig.VERSE_TOPICS_ENABLED !== false) {
          const manifest = await this._fetchManifest()
          const db = await this._openDb(
            AppConfig.VERSE_TOPICS_DB,
            manifest && manifest.sha256,
            (candidate) => this._validate(candidate),
            'verse-topics',
            this._zipConfig(manifest)
          )
          if (db && this._validate(db)) {
            this._db = db
            this._loadTopics()
            this.isReady = true
            return true
          }
          if (db) { try { db.close() } catch (e) {} }
        }
        console.warn('[VerseTopicService] verse_color_topics.sqlite unavailable or failed validation')
        this._initPromise = null
        return false
      } catch (e) {
        console.error('[VerseTopicService] init error:', e)
        this._initPromise = null
        return false
      }
    })()

    return this._initPromise
  }

  // Background refresh: the repo publishes a manifest next to the database;
  // when its sha256 no longer matches the locally verified copy, force a
  // fresh download, validate it, and hot-swap it into the running service.
  async checkForBackgroundUpdate(bridge) {
    if (!this.isReady) {
      if (!this._initPromise) return false
      await this._initPromise
    }
    if (!this.isReady || AppConfig.VERSE_TOPICS_ENABLED === false || !AppConfig.VERSE_TOPICS_DB) return false
    try {
      this._manifestPromise = null
      const manifest = await this._fetchManifest()
      const zipUrl = AppConfig.VERSE_TOPICS_DB_ZIP || null
      if (zipUrl && !manifest) {
        console.warn('[VerseTopicService] manifest unavailable for', zipUrl, '— skipping update (fail closed)')
        return false
      }
      const expectedSha = manifest && manifest.sha256
      const verifiedSha = expectedSha
        ? await BibleDB._getVerifiedSha(AppConfig.VERSE_TOPICS_DB)
        : null
      if (expectedSha && verifiedSha === expectedSha) return false

      // A changed manifest is authoritative. Skip conditional validators so a
      // stale intermediary cannot return the old database for a new version.
      const updateResult = await BibleDB.checkForUpdates(
        zipUrl || AppConfig.VERSE_TOPICS_DB,
        Boolean(expectedSha && verifiedSha !== expectedSha),
        zipUrl ? BibleDB._versionedResourceUrl(zipUrl, manifest) : AppConfig.VERSE_TOPICS_DB,
      )
      if (!updateResult.updated || !updateResult.bytes) return false

      let bytes = updateResult.bytes
      if (zipUrl) {
        const resolved = await BibleDB.extractZipResource(updateResult.bytes, manifest)
        if (!resolved || !resolved.bytes) {
          console.warn('[VerseTopicService] downloaded zip failed verification:', zipUrl)
          return false
        }
        bytes = resolved.bytes
      } else if (expectedSha) {
        const actualSha = await BibleDB._sha256Hex(updateResult.bytes)
        if (actualSha !== BibleDB.SHA_UNAVAILABLE && actualSha !== expectedSha) {
          console.warn('[VerseTopicService] downloaded database hash mismatch:', actualSha)
          return false
        }
      }
      const newDb = await this._acceptDb(
        AppConfig.VERSE_TOPICS_DB,
        bytes,
        expectedSha || null,
        (candidate) => this._validate(candidate),
        'verse-topics'
      )
      if (newDb && this._validate(newDb)) {
        const oldDb = this._db
        this._db = newDb
        this._loadTopics()
        this._chapterCache.clear()
        if (oldDb && oldDb !== newDb) {
          try { oldDb.close() } catch (e) {}
        }
        if (bridge) bridge.emit('render:refresh')
        if (expectedSha && expectedSha !== BibleDB.SHA_UNAVAILABLE) {
          await BibleDB._setVerifiedSha(AppConfig.VERSE_TOPICS_DB, expectedSha)
        }
        return true
      }
      if (newDb) {
        try { newDb.close() } catch (e) {}
      }
      return false
    } catch (e) {
      console.warn('[VerseTopicService] background update check failed:', e)
      return false
    }
  }

  _fetchManifest() {
    if (this._manifestPromise) return this._manifestPromise
    if (!AppConfig.VERSE_TOPICS_MANIFEST) return Promise.resolve(null)
    this._manifestPromise = (async () => {
      try {
        const resp = await fetch(AppConfig.VERSE_TOPICS_MANIFEST, { cache: 'no-store' })
        if (!resp.ok) {
          console.warn('[VerseTopicService] manifest fetch failed:', resp.status)
          return null
        }
        const manifest = await resp.json()
        this._manifest = manifest
        return manifest
      } catch (e) {
        console.warn('[VerseTopicService] manifest load error:', e)
        return null
      }
    })()
    return this._manifestPromise
  }

  _validate(db) {
    try {
      const tables = new Set()
      const rows = []
      db.exec({ sql: "SELECT name FROM sqlite_master WHERE type = 'table'", rowMode: 'object', resultRows: rows })
      for (const r of rows) tables.add(r.name)
      for (const t of ['topic', 'verse', 'verse_primary_topic', 'metadata']) {
        if (!tables.has(t)) {
          console.warn('[VerseTopicService] database missing table:', t)
          return false
        }
      }

      const metaRows = []
      db.exec({ sql: 'SELECT key, value FROM metadata', rowMode: 'object', resultRows: metaRows })
      const meta = {}
      for (const r of metaRows) meta[r.key] = r.value

      if (meta.schema_version !== '1') {
        console.warn('[VerseTopicService] unsupported schema version:', meta.schema_version)
        return false
      }
      return true
    } catch (e) {
      console.error('[VerseTopicService] schema validation error:', e)
      return false
    }
  }

  _loadTopics() {
    this._topics = []
    this._topicsById = new Map()
    const rows = []
    try {
      this._db.exec({
        sql: 'SELECT topic_id, name, description, color_hex, display_order FROM topic ORDER BY display_order',
        rowMode: 'object',
        resultRows: rows,
      })
    } catch (e) {
      console.warn('[VerseTopicService] topic load error:', e)
      return
    }
    for (const r of rows) {
      const topic = {
        topicId: r.topic_id,
        name: r.name,
        description: r.description || '',
        color_hex: r.color_hex || '#888888',
        displayOrder: r.display_order,
      }
      this._topics.push(topic)
      this._topicsById.set(r.topic_id, topic)
    }
  }

  _cacheKey(bookCode, chapter) {
    return bookCode + '.' + chapter
  }

  // Resolves the primary topic for every verse in a chapter. Returns a map of
  // verse number -> { topicId, name, color_hex, description }. Cached.
  async getChapterTopics(bookCode, chapter) {
    if (!this.isReady) return null
    const key = this._cacheKey(bookCode, chapter)
    if (this._chapterCache.has(key)) return this._chapterCache.get(key)

    const result = {}
    const rows = []
    try {
      this._db.exec({
        sql: `SELECT v.verse_number, vpt.topic_id
              FROM verse v
              JOIN verse_primary_topic vpt ON vpt.verse_id = v.verse_id
              WHERE v.book_code = ? AND v.chapter = ?`,
        bind: [bookCode, chapter],
        rowMode: 'object',
        resultRows: rows,
      })
    } catch (e) {
      console.error('[VerseTopicService] getChapterTopics error:', e)
      this._chapterCache.set(key, result)
      return result
    }

    for (const r of rows) {
      const topic = this._topicsById.get(r.topic_id)
      if (!topic) continue
      result[r.verse_number] = {
        topicId: topic.topicId,
        name: topic.name,
        color_hex: topic.color_hex,
        description: topic.description,
      }
    }
    this._chapterCache.set(key, result)
    return result
  }

  // Convert a #RRGGBB hex (or #RGB shorthand) into an rgba() string for the
  // translucent wash behind a verse's text.
  static toRgba(hex, alpha) {
    if (typeof hex !== 'string') return 'rgba(0, 0, 0, 0)'
    let h = hex.trim().replace(/^#/, '')
    if (h.length === 3) {
      h = h.split('').map(c => c + c).join('')
    }
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return 'rgba(0, 0, 0, 0)'
    const n = parseInt(h, 16)
    const r = (n >> 16) & 255
    const g = (n >> 8) & 255
    const b = n & 255
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')'
  }

  // Relative luminance per sRGB (linearised); null for invalid input.
  static _luminance(hex) {
    if (typeof hex !== 'string') return null
    let h = hex.trim().replace(/^#/, '')
    if (h.length === 3) h = h.split('').map(c => c + c).join('')
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
    const n = parseInt(h, 16)
    const lin = (c) => {
      const s = c / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  }

  // High-contrast foreground for a solid block of the topic accent (tab,
  // fold flap, triangle): light accents get a near-black glyph, dark accents
  // get white.
  static contrastFor(hex) {
    const L = this._luminance(hex)
    if (L === null) return '#ffffff'
    return L > 0.45 ? '#14141c' : '#ffffff'
  }

  static slugFor(name) {
    if (typeof name !== 'string') return 'unknown'
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  }
}
