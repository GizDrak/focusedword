// prepared-audio-store.js — OPFS persistence for PREPARED BACKGROUND AUDIO.
//
// Layout (under the app's OPFS root):
//
//   /tts-prepared/
//     preparing/            scratch while a session is being generated
//       session.json
//       audio.<fmt>
//     active/               the ONE finalized, playable session
//       session.json
//       audio.<fmt>
//
// Atomic-ish write protocol (a crash/cancel must never leave a corrupt "ready"
// session):
//   1. begin(session)        -> writes preparing/session.json + a 0-frame
//                               audio header (WAV) via a writable kept open.
//   2. append(chunk)         -> writes encoded bytes at the current offset.
//   3. finalize(session)     -> patches the header (seek 0), updates meta,
//                               closes the writer, then PROMOTES:
//                               remove any old active/, move preparing/* up.
//   4. abort()               -> closes + removes preparing/ (cleanup).
//
// This class is the only place that knows the OPFS layout. It is intentionally
// storage-only: it never synthesizes, encodes, or plays.

window.PreparedAudioStore = class PreparedAudioStore {
  static get ROOT() { return 'tts-prepared'; }
  static get PREPARING() { return 'preparing'; }
  static get ACTIVE() { return 'active'; }
  static get META_FILE() { return 'session.json'; }

  constructor(bridge) {
    this.bridge = bridge;
    this._writer = null;
    this._activeDir = null;
    this._audioName = null;
  }

  _available() {
    return typeof navigator !== 'undefined' &&
      !!navigator.storage && typeof navigator.storage.getDirectory === 'function';
  }

  async _root(create) {
    if (!this._available()) throw new Error('OPFS unavailable');
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(window.PreparedAudioStore.ROOT, { create: !!create });
  }

  async _dir(name, create) {
    const root = await this._root(create);
    return root.getDirectoryHandle(name, { create: !!create });
  }

  // ── Writing ────────────────────────────────────────────────────────────────

  // Start a new preparing session. `headerBytes` is the encoder's initial
  // header (WAV) or empty (compressed formats write their container at close).
  async begin(session, headerBytes) {
    await this.abort(); // never stack two preparing sessions
    const dir = await this._dir(window.PreparedAudioStore.PREPARING, true);
    this._audioName = 'audio.' + (session.format || 'wav');
    const fh = await dir.getFileHandle(this._audioName, { create: true });
    this._writer = await fh.createWritable();
    if (headerBytes && headerBytes.byteLength) await this._writer.write(headerBytes);
    session.byteSize = headerBytes ? headerBytes.byteLength : 0;
    await this._writeMeta(dir, session);
    this._activeDir = dir;
    return session;
  }

  // Append one encoded chunk. `sampleFrames` is the per-channel frame count so
  // the caller can advance its running total; the store only tracks bytes.
  async append(bytes, session) {
    if (!this._writer) throw new Error('PreparedAudioStore.append: no open session');
    await this._writer.write(bytes);
    session.byteSize += bytes.byteLength;
    // Meta is written on finalize() (and periodically by the service, which
    // calls updateMeta) — not per chunk, to keep OPFS writes cheap.
    return session.byteSize;
  }

  // Persist just the metadata (progress: verses/actualDuration so far). Cheap
  // enough to call every few verses.
  async updateMeta(session) {
    if (!this._activeDir) return;
    await this._writeMeta(this._activeDir, session);
  }

  // Patch the header (seek 0), rewrite final metadata, close, and promote
  // preparing/ -> active/.
  async finalize(session, headerBytes) {
    if (!this._writer) throw new Error('PreparedAudioStore.finalize: no open session');
    if (headerBytes && headerBytes.byteLength) {
      try {
        if (typeof this._writer.seek === 'function') {
          await this._writer.seek(0);
          await this._writer.write(headerBytes);
        }
      } catch (e) { /* header patch unsupported — leave the initial header */ }
    }
    await this._writer.close();
    this._writer = null;

    const prepDir = await this._dir(window.PreparedAudioStore.PREPARING, true);
    await this._writeMeta(prepDir, session);
    await this._promote(session);
    this._activeDir = null;
    return session;
  }

  async _promote(session) {
    const root = await this._root(true);
    // Drop the previous active session first (only one active is kept).
    try { await root.removeEntry(window.PreparedAudioStore.ACTIVE, { recursive: true }); } catch (e) { /* none */ }
    const prep = await root.getDirectoryHandle(window.PreparedAudioStore.PREPARING, { create: true });
    // DirectoryHandle.move() is supported on Chromium/Firefox (verified). On a
    // browser without it, fall back to a copy-then-delete.
    try {
      await prep.move(root, window.PreparedAudioStore.ACTIVE);
    } catch (e) {
      await this._copyDir(prep, window.PreparedAudioStore.ACTIVE);
      await root.removeEntry(window.PreparedAudioStore.PREPARING, { recursive: true });
    }
  }

  async _copyDir(srcDir, destName) {
    const root = await this._root(true);
    const dest = await root.getDirectoryHandle(destName, { create: true });
    for await (const [name, handle] of srcDir.entries()) {
      if (handle.kind === 'file') {
        const file = await handle.getFile();
        const out = await dest.getFileHandle(name, { create: true });
        const w = await out.createWritable();
        await w.write(await file.arrayBuffer());
        await w.close();
      } else {
        await this._copyDir(handle, name);
      }
    }
  }

  // Cancel the in-flight preparation: close the writer and delete preparing/.
  async abort() {
    if (this._writer) {
      try { await this._writer.abort(); } catch (e) {
        try { await this._writer.close(); } catch (e2) { /* ignore */ }
      }
      this._writer = null;
    }
    this._activeDir = null;
    try {
      const root = await this._root(false);
      if (root) await root.removeEntry(window.PreparedAudioStore.PREPARING, { recursive: true });
    } catch (e) { /* nothing to clean */ }
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  // Load the active session metadata + a Blob URL for its audio. Returns
  // { session, url, blob } or null. Caller revokes the URL when done.
  async loadActive() {
    if (!this._available()) return null;
    try {
      const root = await this._root(false);
      if (!root) return null;
      const dir = await root.getDirectoryHandle(window.PreparedAudioStore.ACTIVE, { create: false });
      const metaFile = await (await dir.getFileHandle(window.PreparedAudioStore.META_FILE)).getFile();
      const session = JSON.parse(await metaFile.text());
      const audioName = 'audio.' + (session.format || 'wav');
      const audioFile = await (await dir.getFileHandle(audioName)).getFile();
      const blob = new Blob([await audioFile.arrayBuffer()], { type: this._mime(session.format) });
      const url = URL.createObjectURL(blob);
      return { session, url, blob };
    } catch (e) {
      return null;
    }
  }

  async hasActive() {
    if (!this._available()) return false;
    try {
      const root = await this._root(false);
      if (!root) return false;
      const dir = await root.getDirectoryHandle(window.PreparedAudioStore.ACTIVE, { create: false });
      await dir.getFileHandle(window.PreparedAudioStore.META_FILE).catch(() => { throw new Error('no meta'); });
      return true;
    } catch (e) {
      return false;
    }
  }

  // Metadata only (no audio bytes read into memory).
  async activeMeta() {
    if (!this._available()) return null;
    try {
      const root = await this._root(false);
      if (!root) return null;
      const dir = await root.getDirectoryHandle(window.PreparedAudioStore.ACTIVE, { create: false });
      const file = await (await dir.getFileHandle(window.PreparedAudioStore.META_FILE)).getFile();
      return JSON.parse(await file.text());
    } catch (e) {
      return null;
    }
  }

  // Remove BOTH active and preparing trees (the "Clear prepared audio" action).
  async clear() {
    await this.abort();
    try {
      const root = await this._root(false);
      if (root) await root.removeEntry(window.PreparedAudioStore.ACTIVE, { recursive: true });
    } catch (e) { /* none */ }
    if (this.bridge) this.bridge.emit('tts:prepared-changed', { active: false });
  }

  // Startup cleanup: drop an interrupted preparing/ tree (a crash mid-prepare
  // must never be mistaken for a ready session). The active session is left
  // intact — it survives restarts until cleared/replaced/invalidated.
  async cleanupOrphans() {
    if (!this._available()) return;
    try {
      const root = await this._root(false);
      if (!root) return;
      await root.removeEntry(window.PreparedAudioStore.PREPARING, { recursive: true }).catch(() => {});
    } catch (e) { /* ignore */ }
  }

  // Estimated bytes used by prepared audio (active + preparing), plus the
  // browser's own estimate for context.
  async usage() {
    let preparedBytes = 0;
    try {
      const root = await this._root(false);
      if (root) {
        for (const name of [window.PreparedAudioStore.ACTIVE, window.PreparedAudioStore.PREPARING]) {
          try {
            const dir = await root.getDirectoryHandle(name, { create: false });
            for await (const [, handle] of dir.entries()) {
              if (handle.kind === 'file') preparedBytes += (await handle.getFile()).size;
            }
          } catch (e) { /* absent */ }
        }
      }
    } catch (e) { /* ignore */ }
    let quota = null;
    let used = null;
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        quota = est.quota || null;
        used = est.usage || null;
      }
    } catch (e) { /* ignore */ }
    return { preparedBytes, quota, used };
  }

  _mime(format) {
    if (format === 'opus') return 'audio/webm';
    if (format === 'aac') return 'audio/mp4';
    return 'audio/wav';
  }

  async _writeMeta(dir, session) {
    session.updatedAt = Date.now();
    const fh = await dir.getFileHandle(window.PreparedAudioStore.META_FILE, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(session));
    await w.close();
  }
};
