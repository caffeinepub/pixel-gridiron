// Pixel Gridiron Service Worker v21
// Full debug update: precache, offline fallback, error handling, event stubs
const CACHE_VERSION = 'pixel-gridiron-v21';
const CACHE_NAME = CACHE_VERSION;

// Critical assets to precache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/generated/icon-192-transparent.dim_192x192.png',
  '/assets/generated/icon-512-transparent.dim_512x512.png',
];

self.addEventListener('install', (event) => {
  console.log('[SW v21] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW v21] Precaching critical assets');
        // Use individual adds so one failure doesn't break the whole install
        return Promise.allSettled(
          PRECACHE_ASSETS.map((url) =>
            cache.add(url).catch((err) => {
              console.warn('[SW v21] Precache miss:', url, err.message);
            })
          )
        );
      })
      .then(() => {
        console.log('[SW v21] Install complete, skipping waiting');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW v21] Install failed:', err);
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW v21] Activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        const oldCaches = cacheNames.filter((name) => name !== CACHE_NAME);
        if (oldCaches.length) {
          console.log('[SW v21] Deleting old caches:', oldCaches);
        }
        return Promise.all(oldCaches.map((name) => caches.delete(name)));
      })
      .then(() => {
        console.log('[SW v21] Claiming all clients');
        return self.clients.claim();
      })
      .catch((err) => {
        console.error('[SW v21] Activate failed:', err);
      })
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests for same-origin
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation requests: network-first with offline fallback to index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          console.log('[SW v21] Offline - serving cached index.html');
          return caches.match('/index.html').then((r) => r || new Response('Offline', { status: 503 }));
        })
    );
    return;
  }

  // Static assets: cache-first, update in background (stale-while-revalidate)
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone()).catch((err) => {
                console.warn('[SW v21] Cache put failed:', err.message);
              });
            }
            return response;
          })
          .catch((err) => {
            console.warn('[SW v21] Fetch failed for', event.request.url, err.message);
            // Return a minimal error response so the game doesn't hard-crash
            return new Response('', { status: 408, statusText: 'Network timeout' });
          });

        // Return cached immediately, update cache in background
        return cached || fetchPromise;
      });
    })
  );
});

// Background sync stub (for future leaderboard sync)
self.addEventListener('sync', (event) => {
  console.log('[SW v21] Background sync event:', event.tag);
  if (event.tag === 'leaderboard-sync') {
    // Future: sync offline leaderboard submissions
    event.waitUntil(Promise.resolve());
  }
});

// Push notification stub (for future game events)
self.addEventListener('push', (event) => {
  console.log('[SW v21] Push event received');
  const data = event.data ? event.data.json() : { title: 'Pixel Gridiron', body: 'New event!' };
  event.waitUntil(
    self.registration.showNotification(data.title || 'Pixel Gridiron', {
      body: data.body || '',
      icon: '/assets/generated/icon-192-transparent.dim_192x192.png',
      badge: '/assets/generated/icon-192-transparent.dim_192x192.png',
    })
  );
});

// Message handler for skip-waiting from app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW v21] Message: SKIP_WAITING');
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: CACHE_VERSION });
  }
});
