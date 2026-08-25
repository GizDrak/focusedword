const CACHE_NAME = 'focused-word-v82';
const DB_CACHE = 'bible-database-cache';

const REQUIRED_SHELL = [
  '/',
  '/css/styles.css',
  '/js/app/app.js',
  '/manifest.json',
  '/assets/icons/pwa/icon-192.png'
];

const OPTIONAL_SHELL = [
  '/js/repository/scripture-repository-service.js',
  '/js/repository/scripture-repos-ui.js',
  '/js/core/config.js',
  '/js/data/uuid.js',
  '/js/data/html.js',
  '/js/data/bionic.js',
  '/js/data/word-class-service.js',
  '/scripture/BSB_token_annotations_v2.vocabulary.json',
  '/js/text/markdown-parser.js',
  '/js/notes/tag-cache-utils.js',
  '/js/data/legacy-migration.js',
  '/js/core/popover-service.js',
  '/js/notes/tag-search.js',
  '/js/text/token-renderer.js',
  '/js/notes/simple-editor.js',
  '/js/data/book-map.js',
  '/js/data/bible-db.js',
  '/js/data/cross-references.js',
  '/js/data/highlight-store.js',
  '/js/data/note-store.js',
  '/js/data/selection.js',
  '/js/core/debug.js',
  '/js/data/idb-service.js',
  '/js/data/state-store.js',
  '/js/ui/skin-system.js',
  '/js/ui/skins/classic/skin.css',
  '/js/ui/skins/modern/skin.js',
  '/js/ui/skins/modern/skin.css',
  '/js/ui/skins/luminous/skin.js',
  '/js/ui/skins/luminous/skin.css',
  '/js/ui/skins/minimal/skin.js',
  '/js/ui/skins/minimal/skin.css',
  '/js/text/url-validator.js',
  '/js/sync/sync-service.js',
  '/js/domain/verse-manager.js',
  '/js/core/bridge.js',
  '/js/app/install-prompt.js',
  '/js/navigation/view-manager.js',
  '/js/navigation/render-manager.js',
  '/js/app/chapter-summary.js',
  '/js/reading/search.js',
  '/js/navigation/navigation.js',
  '/js/settings/typography.js',
  '/js/app/split-mode.js',
  '/js/settings/color-theme.js',
  '/js/settings/settings.js',
  '/js/settings/settings-sync-ui.js',
  '/js/bookmarks/bookmarks-ui.js',
  '/js/reading/interaction-manager.js',
  '/js/text/highlight-manager.js',
  '/js/notes/notes-ui.js',
  '/js/data/word-study-service.js',
  '/js/word-study/word-study-ui.js',
  '/js/cross-refs/cross-refs-ui.js',
  '/js/footnotes/footnotes-ui.js',
  '/js/reading/renderers/base.js',
  '/js/reading/renderers/swipe.js',
  '/js/reading/renderers/spotlight.js',
  '/js/reading/renderers/speed.js',
  '/js/reading/renderers/scroll.js',
  '/js/reading/scroll-mode/band-engine.js',
  '/js/reading/scroll-mode/char-resolver.js',
  '/js/reading/scroll-mode/line-estimator.js',
  '/js/reading/scroll-mode/highlight-renderer.js',
  '/js/reading/scroll-mode/block-resolver.js',
  '/js/reading/scroll-mode/reading-tracker.js',
  '/js/reading/scroll-mode/switcher.js',
  '/js/vendor/sqlite-wasm/index.mjs',
  '/js/vendor/sqlite-wasm/sqlite3.wasm',
  '/assets/icons/pwa/icon-512.png',
  '/assets/icons/pwa/maskable-icon.png',
  '/assets/icons/app/icon-dark.svg',
  '/assets/icons/app/icon-light.svg',
  '/assets/icons/ui/closed-bible-icon.svg',
  '/assets/favicon.svg',
  '/whats_new.md',
  '/LICENSE.md',
  '/THIRD_PARTY_NOTICES.md',
  '/assets/lists/bible-wordlist.json',
  '/scripture/bible_chapters.json',
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
    // Small chapter metadata is fine to shell-cache, but large scripture
    // databases (.db/.sqlite) are cached by the app in its own
    // 'bible-database-cache' — caching them here too would double the disk
    // footprint (hundreds of MB each).
    /\/scripture\/(?:en\/)?.*\.json$/.test(path)
  );
}

function canonicalUrl(url) {
  if (url.pathname === '/index.html') return '/';
  return url.pathname;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(REQUIRED_SHELL).then(() => {
        return Promise.allSettled(
          OPTIONAL_SHELL.map((url) => cache.add(url))
        ).then((results) => {
          const failures = results.filter(r => r.status === 'rejected');
          for (let i = 0; i < results.length && failures.length; i++) {
            if (results[i].status === 'rejected') {
              console.warn('[SW] Optional cache failed:', OPTIONAL_SHELL[i]);
            }
          }
        });
      });
    }).then(() => self.skipWaiting())
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
    icon: '/assets/icons/pwa/icon-192.png',
    badge: '/assets/icons/pwa/icon-192.png',
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
          const bgRefresh = fetch(event.request).then((r) => {
            if (r.ok) return caches.open(CACHE_NAME).then((c) => c.put('/', r));
          }).catch(() => {});
          event.waitUntil(bgRefresh);
          return cached;
        }
        return fetch(event.request).then((r) => {
          if (r.ok) {
            const copy = r.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((c) => c.put('/', copy)));
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
            const bgRefresh = fetch(event.request).then((r) => {
              if (r.ok) return caches.open(CACHE_NAME).then((c) => c.put(event.request, r));
            }).catch(() => {});
            event.waitUntil(bgRefresh);
          }
          return cached;
        }
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
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
