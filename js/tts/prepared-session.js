// prepared-session.js — the PREPARED BACKGROUND AUDIO session model.
//
// A session is one temporary, locally-generated continuous audio resource that
// covers an ordered run of verses (usually several chapters) from a single
// starting reference, plus the verse TIMETABLE that maps media time back to a
// verse. It is the unit the preparation service writes, the store persists, and
// prepared playback reads.
//
// This module is deliberately pure (no DOM, no OPFS, no audio) so it can be
// unit-tested and reasoned about. It owns:
//   - the session shape + versioning (PREPARED_SESSION_VERSION)
//   - the config hash that answers "does this prepared audio still match the
//     user's current voice / speed / translation / text source?"
//   - timetable helpers (indexAt / entryAt / offsetForRef) reused by playback
//
// IMPORTANT (config invalidation): prepared audio is only valid for the exact
// parameters that produced it. Any of voice, speaker, speed/length_scale, the
// noise controls, the translation, or the speech text source changing makes an
// existing session INCOMPATIBLE — it must not be played, and the app should
// offer/perform re-preparation.

window.PreparedSession = (function () {
  const VERSION = 1;

  // Hash the parameters that determine the rendered audio. Two sessions with
  // the same hash are interchangeable; different hashes are not. Kept small and
  // deterministic (a cheap 32-bit FNV-1a over a canonical string) — collisions
  // are harmless here (worst case: a session is reused when it maybe shouldn't
  // be, and the user simply hears the old voice until they re-prepare).
  function configHash(parts) {
    const canonical = [
      'v' + VERSION,
      'tr:' + norm(parts.translationId),
      'vo:' + norm(parts.voiceId),
      'sp:' + norm(parts.speakerId),
      'ls:' + num(parts.lengthScale),
      'ns:' + num(parts.noiseScale),
      'nw:' + num(parts.noiseW),
      'ss:' + num(parts.sentenceSilence),
      'src:' + norm(parts.textSource)
    ].join('|');
    let h = 0x811c9dc5;
    for (let i = 0; i < canonical.length; i++) {
      h ^= canonical.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  function norm(v) {
    return v == null ? '' : String(v);
  }

  function num(v) {
    const n = Number(v);
    // Round to 3 dp so a float round-trip through JSON never changes the hash.
    return Number.isFinite(n) ? (Math.round(n * 1000) / 1000).toString() : '';
  }

  // Compute the live config the app would prepare/play with right now, from the
  // engine + manager + state. Kept here so both prepare and playback compare
  // against the SAME derivation.
  function liveConfig(manager, bridge) {
    const state = bridge && bridge.state;
    const voice = (manager && manager.getResolvedVoice && manager.getResolvedVoice()) || null;
    const raw = (voice && voice.raw) || {};
    const settings = (manager && manager.getSynthesisOptions && manager.getSynthesisOptions()) || {};
    // Per-voice synthesis defaults (lengthScale/noiseScale/noiseW/sentenceSilence)
    // are resolved by the engine; mirror by asking it if present, else fall back
    // to the UI rate.
    let cfg = { lengthScale: null, noiseScale: null, noiseW: null, sentenceSilence: null };
    const engine = manager && manager.engines ? manager.engines.get('piper') : null;
    if (engine && typeof engine._voiceConfig === 'function' && raw.model != null) {
      const resolved = engine._voiceConfig({ model: raw.model, sid: raw.sid });
      cfg = {
        lengthScale: resolved.lengthScale,
        noiseScale: resolved.noiseScale,
        noiseW: resolved.noiseW,
        sentenceSilence: resolved.sentenceSilence
      };
    }
    const rate = (settings && Number(settings.rate)) ? Number(settings.rate) : 1;
    return {
      translationId: state ? state.get('currentTranslation') : null,
      voiceId: voice ? voice.id : null,
      speakerId: raw.sid != null ? raw.sid : null,
      model: raw.model || null,
      rate,
      // Fold the UI rate into lengthScale so a speed change invalidates too.
      lengthScale: cfg.lengthScale != null ? (cfg.lengthScale / rate) : (1 / rate),
      noiseScale: cfg.noiseScale,
      noiseW: cfg.noiseW,
      sentenceSilence: cfg.sentenceSilence,
      textSource: state ? state.get('currentTranslation') : null
    };
  }

  // Build an empty session skeleton (the service fills verses/durations as it
  // generates; the store persists it).
  function create(fields) {
    const now = Date.now();
    const s = {
      version: VERSION,
      id: fields.id || ('prep-' + now.toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36)),
      createdAt: now,
      updatedAt: now,

      translationId: fields.translationId || null,

      startRef: fields.startRef || null,   // "JHN.3.16"
      endRef: fields.endRef || null,       // last verse included

      targetDuration: fields.targetDuration || 0,  // requested seconds
      actualDuration: 0,                            // finalized seconds

      voiceId: fields.voiceId || null,
      speakerId: fields.speakerId != null ? fields.speakerId : null,
      model: fields.model || null,

      lengthScale: fields.lengthScale != null ? fields.lengthScale : null,
      noiseScale: fields.noiseScale != null ? fields.noiseScale : null,
      noiseW: fields.noiseW != null ? fields.noiseW : null,
      sentenceSilence: fields.sentenceSilence != null ? fields.sentenceSilence : null,

      format: fields.format || 'wav',
      filePath: fields.filePath || null,
      byteSize: 0,

      configHash: fields.configHash || null,

      verses: [] // [{ ref, start, speechEnd, end }]
    };
    return s;
  }

  // Is a persisted session usable with the CURRENT live config? Returns
  // { compatible, reason }.
  function compatibility(session, liveCfg) {
    if (!session || !session.configHash) return { compatible: false, reason: 'no-session' };
    const want = configHash(liveCfg);
    if (session.configHash !== want) return { compatible: false, reason: 'config-changed' };
    return { compatible: true, reason: null };
  }

  // ── Timetable helpers (mirrors BackgroundTrack's semantics) ────────────────

  function indexAt(verses, seconds) {
    if (!verses || !verses.length || !(seconds >= 0)) return -1;
    let lo = 0;
    let hi = verses.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const e = verses[mid];
      if (seconds < e.start) hi = mid - 1;
      else if (seconds >= e.end) lo = mid + 1;
      else { found = mid; break; }
    }
    if (found >= 0) return found;
    if (seconds < verses[0].start) return 0;
    for (let i = verses.length - 1; i >= 0; i--) {
      if (seconds >= verses[i].start) return i;
    }
    return -1;
  }

  function entryAt(verses, seconds) {
    const i = indexAt(verses, seconds);
    return i >= 0 ? verses[i] : null;
  }

  function offsetForRef(verses, ref) {
    if (!verses) return -1;
    for (const e of verses) {
      if (e.ref === ref) return e.start;
    }
    return -1;
  }

  // Ref format used throughout: "<BOOKCODE>.<chapter>.<verse>" (e.g. JHN.3.16).
  function refFor(bookCode, chapter, verse) {
    return bookCode + '.' + chapter + '.' + verse;
  }

  // Parse the ref back to { bookCode, chapter, verse } or null.
  function parseRef(ref) {
    if (!ref || typeof ref !== 'string') return null;
    const parts = ref.split('.');
    if (parts.length !== 3) return null;
    const chapter = parseInt(parts[1], 10);
    const verse = parseInt(parts[2], 10);
    if (!Number.isFinite(chapter) || !Number.isFinite(verse)) return null;
    return { bookCode: parts[0], chapter, verse };
  }

  return {
    VERSION,
    configHash,
    liveConfig,
    create,
    compatibility,
    indexAt,
    entryAt,
    offsetForRef,
    refFor,
    parseRef
  };
})();
