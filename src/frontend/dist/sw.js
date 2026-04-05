// Pixel Gridiron Service Worker v24
// Versioned cache: wipes all old caches on first load.
const CACHE_VERSION = 'pixel-gridiron-v24';
const CACHE_NAME = CACHE_VERSION;

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  console.log('[SW v24] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return Promise.allSettled(
          PRECACHE_ASSETS.map((url) =>
            cache.add(url).catch((err) => {
              console.warn('[SW v24] Precache miss:', url, err.message);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
      .catch((err) => console.error('[SW v24] Install failed:', err))
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW v24] Activating, wiping old caches...');
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
      .catch((err) => console.error('[SW v24] Activate failed:', err))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation: network-first, offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((c) => c.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() =>
          caches.match('/index.html').then((r) => r || new Response('Offline', { status: 503 }))
        )
    );
    return;
  }

  // Assets: cache-first, network fallback
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        const network = fetch(event.request)
          .then((res) => {
            if (res.ok) cache.put(event.request, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => new Response('', { status: 408 }));
        return cached || network;
      })
    )
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') event.ports[0]?.postMessage({ version: CACHE_VERSION });
});
