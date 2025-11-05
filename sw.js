const CACHE_NAME = 'rangecheck-cache-v2';
const ASSETS = [
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-maskable.svg',
  'js/app.js',
  'js/db.js',
  'js/sync.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : undefined)))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // network for non-GET
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(netRes => {
        const copy = netRes.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return netRes;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-entries') {
    event.waitUntil(self.clients.matchAll().then(clients => {
      clients.forEach(c => c.postMessage({ type: 'SYNC_REQUEST' }));
    }));
  }
});
