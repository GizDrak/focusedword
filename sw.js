const CACHE_NAME = 'focused-word-v6';
const APP_SHELL = [
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/utils/bionic.js',
  '/js/data/db.js',
  '/js/core/debug.js',
  '/js/core/state-store.js',
  '/js/core/bridge.js',
  '/js/data/selection.js',
  '/js/modules/chapter-summary.js',
  '/js/modules/renderers/base.js',
  '/js/modules/renderers/all.js',
  '/js/modules/renderers/swipe.js',
  '/js/modules/renderers/spotlight.js',
  '/js/modules/renderers/speed.js',
  '/js/modules/renderers/scroll.js',
  '/js/modules/navigation.js',
  '/js/modules/color-theme.js',
  '/js/modules/settings.js',
  '/js/modules/bookmarks-ui.js',
  '/js/modules/interaction-manager.js',
  '/js/data/highlight-store.js',
  '/js/modules/highlight-manager.js',
  '/manifest.json',
  '/assets/icon.svg',
  '/assets/favicon.svg',
  '/assets/icons/icon-48.png',
  '/assets/icons/icon-72.png',
  '/assets/icons/icon-96.png',
  '/assets/icons/icon-144.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];

const CACHE_FIRST_PATTERNS = [
  /\/scripture\/en\/.*\.(db|json)$/,
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/sql\.js@1\.14\.1\/dist\//,
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
    }).then(() => self.skipWaiting())
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

  if (CACHE_FIRST_PATTERNS.some(pattern => pattern.test(url.href) || pattern.test(path))) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          const cacheCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheCopy));
          return response;
        });
      })
    );
  } else {
    event.respondWith(
      fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => {
        return caches.match(event.request).then((cached) => {
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
