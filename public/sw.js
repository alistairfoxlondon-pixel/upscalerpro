/* PixelForge minimal service worker: static assets only. */
const VERSION = 'up-v3';
const ASSET_CACHE = `${VERSION}-assets`;
const PAGE_CACHE = `${VERSION}-pages`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGE_CACHE).then((c) => c.addAll(['/']).catch(() => undefined))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // hashed build assets: cache-first
  if (url.pathname.startsWith('/_next/static/') || url.pathname === '/icon.svg' || url.pathname.startsWith('/icon-')) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // documents: network-first with cache fallback (stays fresh across deploys)
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(PAGE_CACHE);
          cache.put(req, res.clone());
          return res;
        } catch {
          const cache = await caches.open(PAGE_CACHE);
          return (await cache.match(req)) || new Response('Offline', { status: 503 });
        }
      })()
    );
  }
});
