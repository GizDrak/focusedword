# SQLite WASM — Vendored Build Notices

This directory contains a vendored build of SQLite compiled to WebAssembly,
used by the browser runtime.

- `index.mjs` — SQLite OO1 / Worker1 API (from `sqlite/sqlite-wasm`).
- `sqlite3.wasm` — the compiled WebAssembly binary.

## Provenance

- Upstream: https://github.com/sqlite/sqlite-wasm
- Tracked version in `index.mjs`: SQLite **3.53.0** (tag `version-3.53.0`)

## Licenses

### SQLite

SQLite is in the Public Domain.

```
SQLite is in the Public Domain.
https://www.sqlite.org/copyright.html
```

### Emscripten

The build was produced with the Emscripten toolchain. Emscripten is made
available under the MIT license and the University of Illinois/NCSA Open
Source License. The relevant license headers are embedded in `index.mjs`
(near the top of the file).

- Emscripten license: https://emscripten.org/docs/introducing_emscripten/emscripten_license.html
- MIT: https://opensource.org/licenses/MIT

No modifications were made to the upstream build beyond the standard
distribution packaging.
