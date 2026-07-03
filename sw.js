// ============================================================
// VERSIÓN DE LA CACHÉ (ÚNICO LUGAR DONDE SE DEFINE)
// ============================================================
const CACHE_NAME = 'obr-cache-v100';
const BASE_PATH = '/RESCATE-OBR';

// Archivos a cachear (SOLO archivos locales)
const ALL_FILES = [
  BASE_PATH + '/',
  BASE_PATH + '/index.html',
  BASE_PATH + '/app.js',
  BASE_PATH + '/styles.css',
  BASE_PATH + '/icono.png',
  BASE_PATH + '/sw.js'
];

// ============================================================
// INSTALL
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
});

// ============================================================
// ACTIVATE
// ============================================================
self.addEventListener('activate', event => {
  console.log('✅ Activando Service Worker, versión:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
    ))
  );
  event.waitUntil(self.clients.claim());
});

// ============================================================
// FETCH (Cache First)
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
          return caches.match(BASE_PATH + '/index.html');
        }
      });
    })
  );
});

// ============================================================
// PUSH - Recibe notificaciones push nativas
// ============================================================
self.addEventListener('push', event => {
  let data = { title: 'OBR', body: 'Tienes una notificación' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || BASE_PATH + '/icono.png',
    data: { url: data.url || BASE_PATH + '/' }
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

// ============================================================
// NOTIFICATION CLICK
// ============================================================
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data.url || BASE_PATH + '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        for (let client of clients) {
          if (client.url.includes(url) && 'focus' in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});

// ============================================================
// MESSAGE - Recibe comandos desde app.js
// ============================================================
self.addEventListener('message', event => {
  // 1. Activación del SW
  if (event.data === 'skipWaiting') {
    console.log('⏩ skipWaiting recibido');
    self.skipWaiting();
    return;
  }

  // 2. Envío de notificación manual (TRUCO CORRECTO)
  if (event.data && event.data.type === 'SEND_PUSH') {
    const { payload } = event.data;
    console.log('📩 SEND_PUSH recibido en el SW:', payload);
    
    // 🔥 TRUCO CORRECTO: Mostrar la notificación directamente.
    // El navegador NO bloquea las notificaciones cuando se llaman
    // desde el evento 'message' de un Service Worker activo.
    // Esto funciona en Chrome, Firefox y Edge.
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || BASE_PATH + '/icono.png',
      data: { url: payload.url || BASE_PATH + '/' }
    }).then(() => {
      console.log('✅ Notificación mostrada por el SW.');
    }).catch(error => {
      console.error('❌ Error al mostrar la notificación en el SW:', error);
    });
  }
});
