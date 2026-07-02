// ============================================================
// VERSIÓN DE LA CACHÉ (ÚNICO LUGAR DONDE SE DEFINE)
// ============================================================
const CACHE_NAME = 'obr-cache-v90';  // <--- CAMBIAR SOLO AQUÍ PARA ACTUALIZAR
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

// ============================================================
// INSTALL - SOLO INSTALA, NO ACTIVA AUTOMÁTICAMENTE
// ============================================================
self.addEventListener('install', event => {
  console.log('🔧 Instalando SW, versión:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(ALL_FILES.map(url => 
        cache.add(url).catch(err => console.warn('No se pudo cachear:', url, err))
      ));
    })
  );
  // IMPORTANTE: NO llamamos a self.skipWaiting() aquí.
  // El SW se quedará en 'waiting' hasta que la página le indique que se active.
});

// ============================================================
// ACTIVATE - LIMPIAR CACHÉS ANTIGUAS
// ============================================================
self.addEventListener('activate', event => {
  console.log('✅ Activando SW, versión:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
    ))
  );
  event.waitUntil(self.clients.claim());
});

// ============================================================
// FETCH (Estrategia Cache First)
// ============================================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  if (url.hostname.includes('firestore') || url.hostname.includes('googleapis') || url.hostname.includes('rtdb')) {
    event.respondWith(fetch(event.request).catch(() => new Response('{}', { status: 200 })));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match(`${BASE_PATH}/index.html`);
        }
      });
    })
  );
});

// ============================================================
// MANEJO DE MENSAJES - SOLO ACTIVACIÓN POR MENSAJE
// ============================================================
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    console.log('⏩ skipWaiting recibido, activando nuevo SW');
    self.skipWaiting();
  }
});
