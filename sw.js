const CACHE_NAME = 'obr-cache-v2';
const BASE_PATH = '/RESCATE-OBR';

const ALL_FILES = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/app.js`,
  `${BASE_PATH}/styles.css`,
  `${BASE_PATH}/icono.png`,
  `${BASE_PATH}/sw.js`,
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800;900&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cachea todo de golpe, si algo falla continúa
      return Promise.allSettled(ALL_FILES.map(url => 
        cache.add(url).catch(err => console.warn('No se pudo cachear:', url, err))
      ));
    })
  );
  // Forzar la activación inmediata del nuevo Service Worker (evita el estado "waiting")
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
    ))
  );
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  // Firebase: solo red (mejorado para devolver error 503 en lugar de {} vacío)
  if (url.hostname.includes('firestore') || url.hostname.includes('googleapis') || url.hostname.includes('rtdb')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(
        JSON.stringify({ error: 'offline' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // RECURSOS EXTERNOS (CDNs): stale-while-revalidate
  // Detecta dominios de CDNs: cdnjs, unpkg, fonts.googleapis.com, etc.
  if (url.hostname.includes('cdnjs') || url.hostname.includes('unpkg') || 
      url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          const fetchPromise = fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {
            // Si falla la red y no hay caché, devolver un error controlado
            if (!cachedResponse) {
              return new Response('Recurso no disponible offline', { status: 503 });
            }
            return cachedResponse;
          });
          // Devuelve la caché inmediatamente si existe, sino espera la red
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // RECURSOS LOCALES (app propia): Cache First con fallback a index.html
  // Esto incluye: index.html, app.js, styles.css, icono.png, sw.js, y rutas base
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Si es navegación y falla todo, mostrar index.html
        if (event.request.mode === 'navigate') {
          return caches.match(`${BASE_PATH}/index.html`);
        }
        // Para otros recursos, devolver un error 404 silencioso
        return new Response('Recurso no encontrado', { status: 404 });
      });
    })
  );
});

// Notificar a los clientes cuando haya una nueva versión (opcional)
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Cuando el SW toma control, avisa a la página para que refresque (ya se maneja desde index.html)
self.addEventListener('controllerchange', () => {
  // Esto lo maneja el script en index.html
});
