// tts-pack-service.js — download/install/verify of Piper voice model packs.
//
// Piper's voice model packs are NOT bundled with the app. They are published
// as zips on the Focused Word repo (exactly like the study databases) and
// downloaded in the background when a Natural Voice is selected, then stored
// in OPFS under /tts/piper/<lang>/<model>/... so Piper's worker can read the
// .onnx + .onnx.json entirely offline. Once a pack is installed, TTS needs no
// network — mirroring the "select a translation -> it downloads" flow in
// scripture-repos-ui.js.
//
// This mirrors scripture-repository-service (fetch + timeout + size cap +
// SHA-256) and bible-db (verified zip extraction via window.ZipReader +
// OPFS persistence), but writes generic files to OPFS instead of a SQLite
// SAH pool — the worker reads the raw bytes back with the generic
// FileSystemDirectoryHandle API.
//
// Repo pack layout (the .manifest.json `files[]` array):
//   MODEL_CARD                      (informational; extracted, unused)
//   en_GB-vctk-medium.onnx          (the VITS model the worker runs)
//   en_GB-vctk-medium.onnx.json     (audio.sample_rate, inference.*, espeak.*)

window.TTSPackService = class TTSPackService {
  static get REPO_BASE() {
    return 'https://repo.focusedword.com/tts';
  }

  // The zips are ~70 MB each; cap comfortably above that.
  static get MAX_DOWNLOAD_SIZE() {
    return 130 * 1024 * 1024;
  }

  // OPFS layout root shared with piper-worker.js.
  static get OPFS_ROOT() {
    return 'tts/piper';
  }

  // Pack install records live in the existing IndexedDB `metadata` key-value
  // store under a 'tts-pack:' prefix — deliberately NOT a new object store, so
  // no IndexedDB version bump (and no multi-tab versionchange block) is needed
  // to add TTS support.
  static get META_STORE() {
    return 'metadata';
  }

  static _metaKey(model) {
    return 'tts-pack:' + model;
  }

  // Static catalog: which packs the app curates and where they live on the
  // repo. Voice curation (which speakers to expose) stays in
  // PiperEngine.VOICES; this maps model key -> repo assets + OPFS path bits.
  static PACKS = {
    'vctk-medium': {
      model: 'vctk-medium',
      lang: 'en_gb',
      label: 'British Voices',
      locale: 'en-GB',
      zipUrl: this.REPO_BASE + '/vctk-medium.zip',
      manifestUrl: this.REPO_BASE + '/vctk-medium.manifest.json'
    },
    'libritts_r-medium': {
      model: 'libritts_r-medium',
      lang: 'en_us',
      label: 'American Voices',
      locale: 'en-US',
      zipUrl: this.REPO_BASE + '/libritts_r-medium.zip',
      manifestUrl: this.REPO_BASE + '/libritts_r-medium.manifest.json'
    },
    // Original-language packs for the word-study overlay's original-word
    // pronunciation. Installed on demand (download-on-play) and never shown in
    // the narrator voice picker.
    'he_IL-saspeech-medium': {
      model: 'he_IL-saspeech-medium',
      lang: 'he_il',
      label: 'Hebrew',
      locale: 'he-IL',
      zipUrl: this.REPO_BASE + '/he_IL-saspeech-medium.zip',
      manifestUrl: this.REPO_BASE + '/he_IL-saspeech-medium.manifest.json'
    },
    'el_GR-rapunzelina-medium': {
      model: 'el_GR-rapunzelina-medium',
      lang: 'el_gr',
      label: 'Greek',
      locale: 'el-GR',
      zipUrl: this.REPO_BASE + '/el_GR-rapunzelina-medium.zip',
      manifestUrl: this.REPO_BASE + '/el_GR-rapunzelina-medium.manifest.json'
    }
  };

  constructor(bridge) {
    this.bridge = bridge;
    this._inflight = new Map(); // model -> shared install Promise (dedupe)
  }

  packFor(model) {
    return window.TTSPackService.PACKS[model] || null;
  }

  isDownloading(model) {
    return this._inflight.has(model);
  }

  // Resolves when the pack is installed in OPFS, downloading it first if
  // necessary. Dedupes concurrent callers onto a single download so the
  // background download kicked off by setVoice() and the play-path
  // ensureEngine() share one fetch.
  ensureInstalled(model, opts = {}) {
    const existing = this._inflight.get(model);
    if (existing) return existing;
    const promise = (async () => {
      if (await this.isInstalled(model)) return this._meta(model);
      return this.downloadAndInstall(model, opts);
    })().finally(() => {
      if (this._inflight.get(model) === promise) this._inflight.delete(model);
    });
    this._inflight.set(model, promise);
    return promise;
  }

  // A pack is installed only when its meta record exists AND the onnx file
  // actually resolves in OPFS — never trust the flag alone.
  async isInstalled(model) {
    const pack = this.packFor(model);
    if (!pack) return false;
    const rec = await this._meta(model);
    if (!rec || rec.installed !== true || !rec.onnx) return false;
    try {
      const handle = await this._getFileHandle(pack, rec.onnx, { create: false });
      const file = await handle.getFile();
      return file.size > 0;
    } catch (e) {
      return false;
    }
  }

  async getInstalledModels() {
    try {
      const all = await window.idb.getAll('metadata');
      return (all || [])
        .filter((r) => r && r.key && r.key.indexOf('tts-pack:') === 0 && r.installed === true)
        .map((r) => r.model);
    } catch (e) {
      return [];
    }
  }

  async downloadAndInstall(model, opts = {}) {
    const pack = this.packFor(model);
    if (!pack) throw new Error('unknown TTS pack "' + model + '"');
    const manifest = await this._fetchManifest(pack);
    const zipBytes = await this._downloadZip(pack, manifest, opts);

    const written = [];
    const onnxEntry = (manifest.files || []).find((f) => /\.onnx$/.test(f.name));
    try {
      for (const f of manifest.files || []) {
        const bytes = await window.ZipReader.extract(zipBytes, { expectedName: f.name });
        if (f.size != null && bytes.byteLength !== f.size) {
          throw new Error('pack entry ' + f.name + ' size mismatch (got ' + bytes.byteLength + ', want ' + f.size + ')');
        }
        if (f.sha256) {
          const actual = await this._sha256Hex(bytes);
          if (!actual || actual !== f.sha256.toLowerCase()) {
            throw new Error('pack entry ' + f.name + ' checksum mismatch');
          }
        }
        await this._opfsWrite(pack, f.name, bytes);
        written.push(f.name);
      }
    } catch (err) {
      await this._removeFiles(pack, written);
      throw err;
    }

    const record = {
      key: window.TTSPackService._metaKey(model),
      id: model,
      model,
      lang: pack.lang,
      installed: true,
      onnx: onnxEntry ? onnxEntry.name : null,
      zipSha256: manifest.zipSha256 || null,
      installedAt: Date.now()
    };
    try {
      await window.idb.put('metadata', record);
    } catch (e) {
      await this._removeFiles(pack, written);
      throw e;
    }
    if (this.bridge) this.bridge.emit('tts:pack-status', { model, installed: true });
    return record;
  }

  async removePack(model) {
    const pack = this.packFor(model);
    if (!pack) return;
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await this._opfsDir(root, pack, false);
      if (dir) await dir.remove({ recursive: true });
    } catch (e) {
      // Directory not present — nothing to remove.
    }
    try {
      await window.idb.delete('metadata', window.TTSPackService._metaKey(model));
    } catch (e) { /* ignore */ }
    if (this.bridge) this.bridge.emit('tts:pack-status', { model, installed: false });
  }

  // ─── internals ───────────────────────────────────────────────────────

  async _fetchManifest(pack) {
    const resp = await fetch(pack.manifestUrl, { cache: 'no-store' });
    if (!resp.ok) throw new Error('TTS pack manifest fetch failed: ' + resp.status);
    const manifest = await resp.json();
    if (!manifest || !Array.isArray(manifest.files)) {
      throw new Error('TTS pack manifest is invalid for ' + pack.model);
    }
    return manifest;
  }

  async _downloadZip(pack, manifest, opts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 600000);
    const signal = opts.signal;
    const onAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    try {
      const url = this._versionedUrl(pack.zipUrl, manifest);
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) throw new Error('Download failed: ' + resp.status);
      const declared = manifest.zipSize || Number(resp.headers.get('Content-Length')) || 0;
      const reader = resp.body.getReader();
      const chunks = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > window.TTSPackService.MAX_DOWNLOAD_SIZE) {
          reader.cancel();
          throw new Error('Download exceeds maximum file size');
        }
        chunks.push(value);
        if (opts.onProgress && declared) {
          opts.onProgress({
            received,
            total: declared,
            pct: Math.min(100, Math.round((received * 100) / declared))
          });
        }
      }
      const all = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        all.set(chunk, offset);
        offset += chunk.byteLength;
      }
      if (manifest.zipSize != null && all.byteLength !== manifest.zipSize) {
        throw new Error('Download size mismatch (got ' + all.byteLength + ', want ' + manifest.zipSize + ')');
      }
      if (manifest.zipSha256) {
        const actual = await this._sha256Hex(all);
        if (!actual || actual !== manifest.zipSha256.toLowerCase()) {
          throw new Error('Download checksum mismatch for ' + pack.model);
        }
      }
      return all;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }

  async _opfsWrite(pack, fileName, bytes) {
    const root = await navigator.storage.getDirectory();
    const dir = await this._opfsDir(root, pack, true);
    const handle = await dir.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(bytes);
    } finally {
      await writable.close();
    }
  }

  async _removeFiles(pack, names) {
    if (!names.length) return;
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await this._opfsDir(root, pack, false);
      if (!dir) return;
      for (const name of names) {
        try { await dir.removeEntry(name); } catch (e) { /* already gone */ }
      }
    } catch (e) { /* best-effort cleanup */ }
  }

  async _getFileHandle(pack, fileName, { create = false } = {}) {
    const root = await navigator.storage.getDirectory();
    const dir = await this._opfsDir(root, pack, create);
    return dir.getFileHandle(fileName, { create });
  }

  async _opfsDir(root, pack, create) {
    let dir = root;
    const segments = (window.TTSPackService.OPFS_ROOT + '/' + pack.lang + '/' + pack.model).split('/');
    for (const seg of segments) {
      if (!seg) continue;
      dir = await dir.getDirectoryHandle(seg, { create });
    }
    return dir;
  }

  async _meta(model) {
    try {
      return await window.idb.get('metadata', window.TTSPackService._metaKey(model));
    } catch (e) {
      return null;
    }
  }

  _versionedUrl(url, manifest) {
    if (!url || !manifest) return url;
    const version = manifest.zipSha256 || manifest.version || null;
    if (!version) return url;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(String(version));
  }

  async _sha256Hex(bytes) {
    if (!crypto.subtle || !crypto.subtle.digest) return null;
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
};