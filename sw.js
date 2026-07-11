const CACHE_NAME = 'focused-word-v52';
const DB_CACHE = 'bible-database-cache';

const REQUIRED_SHELL = [
  '/',
  '/css/styles.css',
  '/js/app.js',
  '/manifest.json',
  '/assets/icons/icon-192.png'
];

const OPTIONAL_SHELL = [
  '/js/core/scripture-repository-service.js',
  '/js/modules/scripture-repos-ui.js',
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

const ALL_SHELL = [...REQUIRED_SHELL, ...OPTIONAL_SHELL];
const SHELL_SET = new Set(ALL_SHELL);

function isNavigation(req) {
  return req.mode === 'navigate';
}

function isShellAsset(path) {
  return SHELL_SET.has(path);
}

function isCacheableAsset(path) {
  return (
    path.endsWith('.js') || path.endsWith('.css') || path.endsWith('.svg') ||
    path.endsWith('.png') || path.endsWith('.wasm') || path.endsWith('.json') ||
    path.endsWith('.webp') || path.endsWith('.woff2') ||
    /\/scripture\/en\/.*\.(db|sqlite|json)$/.test(path)
  );
}

function canonicalUrl(url) {
  if (url.pathname === '/index.html') return '/';
  return url.pathname;
}

self.addEventListener('install', (event) => {
  const cacheAndActivate = caches.open(CACHE_NAME).then((cache) => {
    return cache.addAll(REQUIRED_SHELL).then(() => {
      return Promise.allSettled(
        OPTIONAL_SHELL.map((url) =>
          cache.add(url).catch(() => {})
        )
      );
    });
  });

  event.waitUntil(
    cacheAndActivate.then(() => self.skipWaiting()).catch((error) => {
      console.error('[SW] Install failed:', error);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith('focused-word-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
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
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/icon-192.png',
    data: data.url ? { url: data.url } : undefined
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
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
  if (url.origin !== self.location.origin) return;

  const path = canonicalUrl(url);

  if (isNavigation(event.request)) {
    event.respondWith(
      caches.match('/').then((cached) => {
        if (cached) {
          fetch(event.request).then((r) => {
            if (r.ok) caches.open(CACHE_NAME).then((c) => c.put('/', r));
          }).catch(() => {});
          return cached;
        }
        return fetch(event.request).then((r) => {
          if (r.ok) {
            const copy = r.clone();
            caches.open(CACHE_NAME).then((c) => c.put('/', copy));
          }
          return r;
        }).catch(() => {
          return caches.match('/').then((fallback) => {
            if (!fallback) {
              return new Response(
                '<!DOCTYPE html><html><head><title>Offline</title><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#0A0A0A;color:#EDE8DD;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:1rem}</style></head><body><h2>Focused Word</h2><p>Please connect to the internet and try again.</p></body></html>',
                { status: 200, statusText: 'OK', headers: { 'Content-Type': 'text/html; charset=utf-8' } }
              );
            }
            return fallback;
          });
        });
      })
    );
    return;
  }

  if (isShellAsset(path) || isCacheableAsset(path)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          if (isShellAsset(path)) {
            fetch(event.request).then((r) => {
              if (r.ok) caches.open(CACHE_NAME).then((c) => c.put(event.request, r));
            }).catch(() => {});
          }
          return cached;
        }
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        }).catch(() => {
          return new Response('', { status: 204, statusText: 'No Content' });
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request).then((cached) => {
        if (cached) return cached;
        if (path.endsWith('.html')) return caches.match('/');
        return new Response('', { status: 204, statusText: 'No Content' });
      });
    })
  );
});
