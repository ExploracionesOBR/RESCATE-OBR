// ============================================================
// VERSIÓN DE LA CACHÉ (ÚNICO LUGAR DONDE SE DEFINE)
// ============================================================
const CACHE_NAME = 'obr-cache-v30';  // <--- CAMBIAR SOLO AQUÍ PARA ACTUALIZAR
const BASE_PATH = '/RESCATE-OBR';

// Archivos a cachear
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
// INSTALL - CON VERIFICACIÓN DE VERSIÓN
// ============================================================
self.addEventListener('install', event => {
  console.log('🔧 Intentando instalar SW, versión:', CACHE_NAME);

  // Verificar si ya existe una versión anterior y si es la misma
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Si la caché ya existe, significa que ya tenemos esta versión
      // No hacemos nada y saltamos la instalación
      return cache.keys().then(keys => {
        if (keys.length > 0) {
          console.log('⚠️ La versión', CACHE_NAME, 'ya está instalada. Saltando instalación.');
          return Promise.resolve();
        }
        
        // Si la caché no existe, es una nueva versión
        console.log('📦 Instalando nueva versión:', CACHE_NAME);
        return Promise.allSettled(ALL_FILES.map(url => 
          cache.add(url).catch(err => console.warn('No se pudo cachear:', url, err))
        ));
      });
    })
  );

  // Si la versión es nueva, forzamos la activación inmediata
  // Si ya existía, skipWaiting no hará nada porque el SW ya está activo
  self.skipWaiting();
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

  // Firebase: solo red (no cachear)
  if (url.hostname.includes('firestore') || url.hostname.includes('googleapis') || url.hostname.includes('rtdb')) {
    event.respondWith(fetch(event.request).catch(() => new Response('{}', { status: 200 })));
    return;
  }

  // Cache First para el resto
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
// MANEJO DE MENSAJES
// ============================================================
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    console.log('⏩ skipWaiting recibido, activando nuevo SW');
    self.skipWaiting();
  }
});
