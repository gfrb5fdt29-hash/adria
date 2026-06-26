/* Senj 2026 PWA – service worker
   Egyszerű, verziózott, statikus tárhelyre (GitHub Pages) optimalizált cache.
   Cache-first app shell + POI-képek, offline működéshez. */
const CACHE_NAME = 'senj-2026-v1';

/* Előcache-elt eszközök: app shell, data.json, ikonok és mind a 114 helyi POI-kép
   (assets/poi/card/, assets/poi/thumb/, assets/poi/sheet/). */
const PRECACHE_ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "data.json",
  "manifest.json",
  "assets/icon.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/maskable-icon-512.png",
  "assets/apple-touch-icon.png",
  "assets/poi/card/gem-002.webp",
  "assets/poi/thumb/gem-002.webp",
  "assets/poi/sheet/gem-002.webp",
  "assets/poi/card/gem-003.webp",
  "assets/poi/thumb/gem-003.webp",
  "assets/poi/sheet/gem-003.webp",
  "assets/poi/card/gem-004.webp",
  "assets/poi/thumb/gem-004.webp",
  "assets/poi/sheet/gem-004.webp",
  "assets/poi/card/gem-005.webp",
  "assets/poi/thumb/gem-005.webp",
  "assets/poi/sheet/gem-005.webp",
  "assets/poi/card/gem-006.webp",
  "assets/poi/thumb/gem-006.webp",
  "assets/poi/sheet/gem-006.webp",
  "assets/poi/card/gem-008.webp",
  "assets/poi/thumb/gem-008.webp",
  "assets/poi/sheet/gem-008.webp",
  "assets/poi/card/gem-009.webp",
  "assets/poi/thumb/gem-009.webp",
  "assets/poi/sheet/gem-009.webp",
  "assets/poi/card/gem-020.webp",
  "assets/poi/thumb/gem-020.webp",
  "assets/poi/sheet/gem-020.webp",
  "assets/poi/card/beach-001.webp",
  "assets/poi/thumb/beach-001.webp",
  "assets/poi/sheet/beach-001.webp",
  "assets/poi/card/beach-002.webp",
  "assets/poi/thumb/beach-002.webp",
  "assets/poi/sheet/beach-002.webp",
  "assets/poi/card/beach-003.webp",
  "assets/poi/thumb/beach-003.webp",
  "assets/poi/sheet/beach-003.webp",
  "assets/poi/card/beach-004.webp",
  "assets/poi/thumb/beach-004.webp",
  "assets/poi/sheet/beach-004.webp",
  "assets/poi/card/beach-005.webp",
  "assets/poi/thumb/beach-005.webp",
  "assets/poi/sheet/beach-005.webp",
  "assets/poi/card/beach-006.webp",
  "assets/poi/thumb/beach-006.webp",
  "assets/poi/sheet/beach-006.webp",
  "assets/poi/card/beach-007.webp",
  "assets/poi/thumb/beach-007.webp",
  "assets/poi/sheet/beach-007.webp",
  "assets/poi/card/beach-008.webp",
  "assets/poi/thumb/beach-008.webp",
  "assets/poi/sheet/beach-008.webp",
  "assets/poi/card/beach-009.webp",
  "assets/poi/thumb/beach-009.webp",
  "assets/poi/sheet/beach-009.webp",
  "assets/poi/card/beach-010.webp",
  "assets/poi/thumb/beach-010.webp",
  "assets/poi/sheet/beach-010.webp",
  "assets/poi/card/food-001.webp",
  "assets/poi/thumb/food-001.webp",
  "assets/poi/sheet/food-001.webp",
  "assets/poi/card/food-002.webp",
  "assets/poi/thumb/food-002.webp",
  "assets/poi/sheet/food-002.webp",
  "assets/poi/card/food-003.webp",
  "assets/poi/thumb/food-003.webp",
  "assets/poi/sheet/food-003.webp",
  "assets/poi/card/food-004.webp",
  "assets/poi/thumb/food-004.webp",
  "assets/poi/sheet/food-004.webp",
  "assets/poi/card/food-005.webp",
  "assets/poi/thumb/food-005.webp",
  "assets/poi/sheet/food-005.webp",
  "assets/poi/card/food-006.webp",
  "assets/poi/thumb/food-006.webp",
  "assets/poi/sheet/food-006.webp",
  "assets/poi/card/food-007.webp",
  "assets/poi/thumb/food-007.webp",
  "assets/poi/sheet/food-007.webp",
  "assets/poi/card/food-008.webp",
  "assets/poi/thumb/food-008.webp",
  "assets/poi/sheet/food-008.webp",
  "assets/poi/card/food-009.webp",
  "assets/poi/thumb/food-009.webp",
  "assets/poi/sheet/food-009.webp",
  "assets/poi/card/food-010.webp",
  "assets/poi/thumb/food-010.webp",
  "assets/poi/sheet/food-010.webp",
  "assets/poi/card/shop-001.webp",
  "assets/poi/thumb/shop-001.webp",
  "assets/poi/sheet/shop-001.webp",
  "assets/poi/card/shop-002.webp",
  "assets/poi/thumb/shop-002.webp",
  "assets/poi/sheet/shop-002.webp",
  "assets/poi/card/shop-003.webp",
  "assets/poi/thumb/shop-003.webp",
  "assets/poi/sheet/shop-003.webp",
  "assets/poi/card/shop-004.webp",
  "assets/poi/thumb/shop-004.webp",
  "assets/poi/sheet/shop-004.webp",
  "assets/poi/card/shop-005.webp",
  "assets/poi/thumb/shop-005.webp",
  "assets/poi/sheet/shop-005.webp",
  "assets/poi/card/shop-009.webp",
  "assets/poi/thumb/shop-009.webp",
  "assets/poi/sheet/shop-009.webp",
  "assets/poi/card/shop-010.webp",
  "assets/poi/thumb/shop-010.webp",
  "assets/poi/sheet/shop-010.webp",
  "assets/poi/card/shop-011.webp",
  "assets/poi/thumb/shop-011.webp",
  "assets/poi/sheet/shop-011.webp",
  "assets/poi/card/shop-012.webp",
  "assets/poi/thumb/shop-012.webp",
  "assets/poi/sheet/shop-012.webp",
  "assets/poi/card/shop-013.webp",
  "assets/poi/thumb/shop-013.webp",
  "assets/poi/sheet/shop-013.webp"
];

/* Telepítés: app shell és képek előcache-elése. */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

/* Aktiválás: régi verziójú cache-ek törlése. */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* Lekérés: csak azonos eredetű GET kérések. Cache-first, hálózati tartalékkal.
   Navigációs kéréseknél offline esetén az index.html-t adjuk vissza. */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // külső (pl. Google Maps) ne menjen cache-en át

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html').then((r) => r || caches.match('index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Sikeres, azonos eredetű válasz cache-elése későbbi offline használathoz.
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
