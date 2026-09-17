/* ============================================================
   Service Worker — Calculadora de Polarización BJT (PWA)
   Estrategia: cache-first para el app shell y los recursos
   propios; red como respaldo y offline.html como último recurso.
   ============================================================ */
const VERSION = 'v1.0.0';
const CACHE_NAME = 'calc-bjt-' + VERSION;

/* App shell completo: HTML, manifiesto, MathJax local, iconos y
   los 15 diagramas de circuitos. */
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './offline.html',
  './js/mathjax-tex-svg.js',
  './img/01_polarizacion_fija.png',
  './img/02_realimentacion_emisor.png',
  './img/03_realimentacion_colector.png',
  './img/04_realimentacion_colector_emisor.png',
  './img/05_divisor_rc.png',
  './img/06_divisor_rc_rb.png',
  './img/07_divisor_re.png',
  './img/08_divisor_re_rb.png',
  './img/09_divisor_rc_re.png',
  './img/10_divisor_rc_re_rb.png',
  './img/11_dos_fuentes_base_colector.png',
  './img/12_dos_fuentes_colector_emisor.png',
  './img/13_dos_fuentes_base_emisor.png',
  './img/14_dos_fuentes_base_colector_emisor.png',
  './img/15_par_darlington.png',
  './img/favicon.svg',
  './img/favicon.ico',
  './img/favicon-16.png',
  './img/favicon-32.png',
  './img/apple-touch-icon.png',
  './img/icon-72.png',
  './img/icon-96.png',
  './img/icon-128.png',
  './img/icon-144.png',
  './img/icon-152.png',
  './img/icon-192.png',
  './img/icon-384.png',
  './img/icon-512.png',
  './img/maskable-192.png',
  './img/maskable-512.png'
];

/* ---------- Instalación: precarga tolerante ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Si un recurso falla (p. ej. primera visita intermitente),
    // no se rompe la instalación: se recuperará en la primera carga.
    await Promise.allSettled(
      APP_SHELL.map(async (url) => {
        const cached = await cache.match(url, { ignoreSearch: true });
        if (cached) return;
        await cache.add(new Request(url, { cache: 'reload' }));
      })
    );
    await self.skipWaiting();
  })());
});

/* ---------- Activación: limpiar cachés antiguas ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

/* ---------- Mensajes desde la página ---------- */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/* ---------- Estrategias de respuesta ---------- */
async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const net = await fetch(request);
    if (net && net.ok && new URL(request.url).origin === self.location.origin) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, net.clone());
    }
    return net;
  } catch (err) {
    return new Response('', {
      status: 504,
      statusText: 'Sin conexión (offline)'
    });
  }
}

async function navigationHandler(request) {
  try {
    const net = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put('./index.html', net.clone());
    return net;
  } catch (err) {
    const cached =
      (await caches.match(request)) ||
      (await caches.match('./index.html', { ignoreSearch: true }));
    return cached || (await caches.match('./offline.html'));
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    // Navegación: red primero (para actualizarse), caché si no hay red.
    event.respondWith(navigationHandler(req));
    return;
  }

  if (url.origin === self.location.origin) {
    // Recursos propios: caché primero (app 100% offline).
    event.respondWith(cacheFirst(req));
    return;
  }

  // Recursos externos (si algún día se usan): red con caché de respaldo.
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: false });
    if (cached) return cached;
    try {
      return await fetch(req);
    } catch (err) {
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
