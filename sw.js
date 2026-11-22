/* AstroTPV · Service Worker: caché del programa para funcionar 100 % sin conexión */
const VERSION = 'astrotpv-v1.2.0';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/core.js', './js/db.js', './js/ui.js', './js/app.js',
  './js/views/sell.js', './js/views/tables.js', './js/views/products.js', './js/views/cash.js',
  './js/views/tickets.js', './js/views/reports.js', './js/views/settings.js',
  './icons/icon.svg', './icons/mark.svg', './fonts/Outfit.ttf', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Estrategia: caché primero (arranque instantáneo y offline) + actualización en segundo plano
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { e.waitUntil(network); return cached; }
    const res = await network;
    if (res) return res;
    if (req.mode === 'navigate') return cache.match('./index.html');
    return new Response('', { status: 504, statusText: 'Sin conexión' });
  }));
});
