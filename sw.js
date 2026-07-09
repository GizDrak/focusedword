const CACHE_NAME = 'focused-word-v31';
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/core/scripture-repository-service.js',
  '/js/modules/scripture-repos-ui.js',
  '/js/app.js',
  '/js/core/config.js',
  '/js/utils/uuid.js',
  '/js/utils/html.js',
  '/js/utils/idb-migration.js',
  '/js/utils/bionic.js',
  '/js/utils/markdown-parser.js',
  '/js/utils/tag-cache-utils.js',
  '/js/utils/legacy-migration.js',
  '/js/utils/tag-search.js',
  '/js/utils/token-renderer.js',
  '/js/utils/simple-editor.js',
  '/js/data/book-map.js',
  '/js/data/db.js',
  '/js/data/cross-references.js',
  '/js/data/highlight-store.js',
  '/js/data/note-store.js',
  '/js/data/selection.js',
  '/js/core/debug.js',
  '/js/core/idb-service.js',
  '/js/core/state-store.js',
  '/js/core/sync-service.js',
  '/js/core/verse-manager.js',
  '/js/core/bridge.js',
  '/js/modules/install-prompt.js',
  '/js/core/view-manager.js',
  '/js/core/render-manager.js',
  '/js/modules/chapter-summary.js',
  '/js/modules/search.js',
  '/js/modules/navigation.js',
  '/js/modules/color-theme.js',
  '/js/modules/settings.js',
  '/js/modules/settings-sync-ui.js',
  '/js/modules/bookmarks-ui.js',
  '/js/modules/interaction-manager.js',
  '/js/modules/highlight-manager.js',
  '/js/modules/notes-ui.js',
  '/js/modules/cross-refs-ui.js',
  '/js/modules/footnotes-ui.js',
  '/js/modules/renderers/base.js',
  '/js/modules/renderers/swipe.js',
  '/js/modules/renderers/spotlight.js',
  '/js/modules/renderers/speed.js',
  '/js/modules/renderers/scroll.js',
  '/js/modules/scroll-mode/band-engine.js',
  '/js/modules/scroll-mode/char-resolver.js',
  '/js/modules/scroll-mode/line-estimator.js',
  '/js/modules/scroll-mode/highlight-renderer.js',
  '/js/modules/scroll-mode/block-resolver.js',
  '/js/modules/scroll-mode/reading-tracker.js',
  '/js/modules/scroll-mode/switcher.js',
  '/js/vendor/sqlite-wasm/index.mjs',
  '/js/vendor/sqlite-wasm/sqlite3.wasm',
  '/manifest.json',
  '/assets/icons/android/launchericon-192x192.png',
  '/assets/icons/android/launchericon-512x512.png',
  '/assets/icons/ios/1024.png',
  '/assets/icons/ios/180.png',
  '/assets/icons/icon-dark.svg',
  '/assets/icons/icon-light.svg',
  '/assets/icons/ui/closed-bible-icon.svg',
  '/assets/icons/ui/open-bible-icon.svg',
  '/whats_new.md'
];

const CACHE_FIRST_PATTERNS = [
  /\/scripture\/en\/.*\.(db|sqlite|json)$/,
  /^https:\/\/fonts\.googleapis\.com\//,
  /^https:\/\/fonts\.gstatic\.com\//
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        APP_SHELL.map(url =>
          cache.add(url).catch(() => {})
        )
      );
    }).then(() => self.skipWaiting()).catch((error) => {
      console.error('Service Worker installation failed to cache files:', error);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const path = url.pathname;

  if (url.origin !== self.location.origin) return;

  if (CACHE_FIRST_PATTERNS.some(pattern => pattern.test(url.href) || pattern.test(path))) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const cacheCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheCopy));
          return response;
        });
      }).catch(() => fetch(event.request))
    );
  } else {
    event.respondWith(
      fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => {
        return caches.match(event.request).catch(() => null).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('', { status: 204, statusText: 'No Content' });
        });
      })
    );
  }
});
