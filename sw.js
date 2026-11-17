// Service worker de Mis Cuotas: funciona sin conexión y recibe los avisos push.
const VERSION = 'mis-cuotas-v1';
const ARCHIVOS = [
  './', './index.html', './manifest.webmanifest', './css/estilos.css',
  './js/app.js', './js/config.js', './js/supabase.js', './js/calculos.js',
  './js/estado.js', './js/utilidades.js', './js/componentes.js',
  './js/pantallas/login.js', './js/pantallas/inicio.js', './js/pantallas/compras.js',
  './js/pantallas/detalle.js', './js/pantallas/nueva.js', './js/pantallas/ajustes.js',
  './iconos/icono-192.png', './iconos/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Archivos de la app: primero la red (para recibir actualizaciones), si no hay conexión, la copia guardada.
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copia = res.clone(); caches.open(VERSION).then((c) => c.put(req, copia)); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
    );
    return;
  }

  // Librería de Supabase desde el CDN: se guarda para poder abrir la app sin conexión.
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(
      caches.match(req).then((guardada) => {
        const red = fetch(req).then((res) => {
          if (res.ok) { const copia = res.clone(); caches.open(VERSION).then((c) => c.put(req, copia)); }
          return res;
        });
        return guardada || red;
      }),
    );
  }
  // Las llamadas a Supabase (datos) siempre van a la red.
});

// ---------- Avisos push ----------
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { titulo: 'Mis Cuotas', cuerpo: e.data?.text() }; }

  const tareas = [
    self.registration.showNotification(d.titulo || 'Mis Cuotas', {
      body: d.cuerpo || '',
      tag: d.tag || undefined,
      icon: './iconos/icono-192.png',
      badge: './iconos/icono-192.png',
      data: { url: d.url || './#/inicio' },
    }),
  ];
  if (typeof d.badge === 'number' && self.navigator.setAppBadge) {
    tareas.push((d.badge > 0 ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge()).catch(() => {}));
  }
  e.waitUntil(Promise.all(tareas));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = new URL(e.notification.data?.url || './#/inicio', self.registration.scope).href;
  e.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const v of ventanas) {
      if (v.url.startsWith(self.registration.scope)) {
        await v.focus();
        v.postMessage({ tipo: 'navegar', url: destino });
        return;
      }
    }
    await self.clients.openWindow(destino);
  })());
});