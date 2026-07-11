const CACHE_NAME = 'focused-word-v51';
const DB_CACHE = 'bible-database-cache';

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
  '/js/modules/typography.js',
  '/js/modules/split-mode.js',
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
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/android/launchericon-512x512-maskable-v2.png',
  '/assets/icons/ios/1024.png',
  '/assets/icons/ios/180.png',
  '/assets/icons/icon-dark.svg',
  '/assets/icons/icon-light.svg',
  '/assets/icons/ui/closed-bible-icon.svg',
  '/assets/icons/ui/open-bible-icon.svg',
  '/assets/favicon.svg',
  '/whats_new.md',
  '/assets/lists/bible-wordlist.json',
  '/scripture/en/bible_chapters.json',
  // Local fonts
  '/assets/fonts/san/inter-v20-latin-regular.woff2',
  '/assets/fonts/san/inter-v20-latin-italic.woff2',
  '/assets/fonts/san/inter-v20-latin-700.woff2',
  '/assets/fonts/san/roboto-v51-latin-regular.woff2',
  '/assets/fonts/san/roboto-v51-latin-italic.woff2',
  '/assets/fonts/san/roboto-v51-latin-700.woff2',
  '/assets/fonts/san/atkinson-hyperlegible-v12-latin-regular.woff2',
  '/assets/fonts/san/atkinson-hyperlegible-v12-latin-italic.woff2',
  '/assets/fonts/san/atkinson-hyperlegible-v12-latin-700.woff2',
  '/assets/fonts/serif/merriweather-v33-latin-regular.woff2',
  '/assets/fonts/serif/merriweather-v33-latin-italic.woff2',
  '/assets/fonts/serif/merriweather-v33-latin-700.woff2',
  '/assets/fonts/serif/lora-v37-latin-regular.woff2',
  '/assets/fonts/serif/lora-v37-latin-italic.woff2',
  '/assets/fonts/serif/lora-v37-latin-700.woff2',
  '/assets/fonts/serif/crimson-pro-v28-latin-regular.woff2',
  '/assets/fonts/serif/crimson-pro-v28-latin-italic.woff2',
  '/assets/fonts/serif/crimson-pro-v28-latin-700.woff2',
  '/assets/fonts/mono/ibm-plex-mono-v20-latin-regular.woff2',
  '/assets/fonts/mono/ibm-plex-mono-v20-latin-italic.woff2',
  '/assets/fonts/mono/ibm-plex-mono-v20-latin-700.woff2',
  '/assets/fonts/handwritten/caveat-v23-latin-regular.woff2',
  '/assets/fonts/handwritten/caveat-v23-latin-700.woff2',
  '/assets/fonts/display/comic-neue-v9-latin-regular.woff2',
  '/assets/fonts/display/comic-neue-v9-latin-italic.woff2',
  '/assets/fonts/display/comic-neue-v9-latin-700.woff2',
  '/assets/fonts/display/lexend-v26-latin-regular.woff2',
  '/assets/fonts/display/lexend-v26-latin-700.woff2'
];

const APP_SHELL_CACHE_KEYS = new Set(APP_SHELL);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        APP_SHELL.map(url => cache.add(url).catch(() => {}))
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => {
          if (key === CACHE_NAME) return false;
          if (key === DB_CACHE) return false;
          return true;
        }).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Focused Word';
  const options = {
    body: data.body || '',
    icon: '/assets/icons/android/launchericon-192x192.png',
    badge: '/assets/icons/android/launchericon-192x192.png',
    data: data.url ? { url: data.url } : undefined
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(urlToOpen);
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const path = url.pathname;

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        if (APP_SHELL_CACHE_KEYS.has(path)) {
          fetch(event.request).then((r) => {
            if (r.ok) caches.open(CACHE_NAME).then((c) => c.put(event.request, r));
          }).catch(() => {});
        }
        return cached;
      }

      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return new Response('', { status: 204, statusText: 'No Content' });
      });
    })
  );
});
