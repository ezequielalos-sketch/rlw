// Service worker de RLW: guarda la app para abrirla sin conexión.
// La página va primero a la red (para recibir las actualizaciones) y, si no hay conexión o tarda más de 4 s,
// usa la copia guardada. Las búsquedas en Apple y Wikipedia y el audio de los episodios van siempre a la red:
// la app ya guarda sus búsquedas por su cuenta y los audios son demasiado grandes para guardarlos.
const VERSION = 'rlw-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
const FONT_HOSTS = ['api.fontshare.com', 'cdn.fontshare.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    event.respondWith(req.mode === 'navigate' ? pageFirstFromNetwork(event) : fromCacheFirst(req));
  } else if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(fontFromCache(event));
  }
});

const timeout = ms => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

async function pageFirstFromNetwork(event) {
  const cache = await caches.open(VERSION);
  const network = fetch(event.request).then(res => {
    if (res.ok) cache.put('./index.html', res.clone());
    return res;
  });
  event.waitUntil(network.catch(() => null));
  try {
    return await Promise.race([network, timeout(4000)]);
  } catch (err) {
    const saved = await cache.match('./index.html');
    return saved || network;
  }
}

async function fromCacheFirst(req) {
  const saved = await caches.match(req, { ignoreSearch: true });
  if (saved) return saved;
  const res = await fetch(req);
  if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
  return res;
}

async function fontFromCache(event) {
  const cache = await caches.open(VERSION);
  const saved = await cache.match(event.request);
  const network = fetch(event.request).then(res => {
    if (res.ok || res.type === 'opaque') cache.put(event.request, res.clone());
    return res;
  });
  event.waitUntil(network.catch(() => null));
  if (saved) return saved;
  try { return await network; } catch (err) { return Response.error(); }
}
