// ============================================================
// VERSIÓN DE LA CACHÉ (ÚNICO LUGAR DONDE SE DEFINE)
// CAMBIA ESTE VALOR CUANDO ACTUALICES LA APP
// ============================================================
const CACHE_NAME = 'obr-cache-v11';
const BASE_PATH = '/RESCATE-OBR';

// Archivos a cachear (asegúrate de que todas las rutas sean correctas)
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
// INSTALL - Instala los archivos en la caché
// ============================================================
self.addEventListener('install', event => {
  console.log('🔧 Instalando Service Worker, versión:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(ALL_FILES.map(url => 
        cache.add(url).catch(err => console.warn('No se pudo cachear:', url, err))
      ));
    })
  );
  // No llamamos a self.skipWaiting() aquí.
  // La activación se controla desde la página mediante postMessage.
});

// ============================================================
// ACTIVATE - Limpia cachés antiguas y toma el control
// ============================================================
self.addEventListener('activate', event => {
  console.log('✅ Activando Service Worker, versión:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
    ))
  );
  event.waitUntil(self.clients.claim()); // Toma el control de las páginas abiertas
});

// ============================================================
// FETCH - Estrategia Cache First
// ============================================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  // Firebase y llamadas a APIs externas: solo red (no cachear)
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
// PUSH - Manejo de notificaciones push nativas
// ============================================================
self.addEventListener('push', event => {
  console.log('📩 Notificación push recibida:', event.data ? event.data.text() : 'Sin datos');
  
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'OBR Moto Rescate', body: event.data.text() };
    }
  }
  
  const title = data.title || 'OBR Moto Rescate';
  const body = data.body || 'Tienes una nueva notificación.';
  const icon = data.icon || '/RESCATE-OBR/icono.png';
  const badge = data.badge || '/RESCATE-OBR/icono.png';
  
  const options = {
    body: body,
    icon: icon,
    badge: badge,
    vibrate: [200, 100, 200],
    data: data,
    actions: data.actions || []
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ============================================================
// NOTIFICATION CLICK - Acción al hacer clic en una notificación
// ============================================================
self.addEventListener('notificationclick', event => {
  console.log('👆 Usuario hizo clic en la notificación:', event.notification.data);
  event.notification.close();
  
  // Abrir la app cuando el usuario hace clic
  const urlToOpen = event.notification.data.url || '/RESCATE-OBR/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // Si ya hay una ventana abierta, enfocarla
        for (let client of windowClients) {
          if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus();
          }
        }
        // Si no, abrir una nueva
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// ============================================================
// MESSAGE - Escucha mensajes desde la página (para skipWaiting)
// ============================================================
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    console.log('⏩ skipWaiting recibido, activando nuevo Service Worker');
    self.skipWaiting();
  }
});
