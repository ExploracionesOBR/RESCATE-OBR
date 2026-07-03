// ============================================================
// VERSIÓN DE LA CACHÉ (ÚNICO LUGAR DONDE SE DEFINE)
// CAMBIA ESTE VALOR CUANDO ACTUALICES LA APP
// ============================================================
const CACHE_NAME = 'obr-cache-v100';
const BASE_PATH = '/RESCATE-OBR';

// Archivos a cachear
const ALL_FILES = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/app.js`,
  `${BASE_PATH}/styles.css`,
  `${BASE_PATH}/icono.png`,
  `${BASE_PATH}/sw.js`
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
// PUSH - Manejo de notificaciones push nativas (Firebase VAPID)
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
    icon: data.icon || '/RESCATE-OBR/icono.png',
    badge: data.badge || '/RESCATE-OBR/icono.png',
    data: { url: data.url || '/RESCATE-OBR/' }
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

// ============================================================
// NOTIFICATION CLICK - Acción al hacer clic en una notificación
// ============================================================
self.addEventListener('notificationclick', event => {
  console.log('👆 Usuario hizo clic en la notificación:', event.notification.data);
  event.notification.close();
  
  const url = event.notification.data.url || '/RESCATE-OBR/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        for (let client of clients) {
          if (client.url.includes(url) && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// ============================================================
// MESSAGE - Escucha mensajes desde la página (app.js)
// ============================================================
self.addEventListener('message', event => {
  // 1. Recibir el comando para activar una actualización del SW
  if (event.data === 'skipWaiting') {
    console.log('⏩ skipWaiting recibido, activando nuevo Service Worker');
    self.skipWaiting();
    return;
  }

  // 2. Recibir el comando para mostrar una notificación (SEND_PUSH)
  if (event.data && event.data.type === 'SEND_PUSH') {
    const { subscription, payload } = event.data;
    
    console.log('📩 Mensaje SEND_PUSH recibido en el SW:', payload);
    
    // Mostrar la notificación usando la Push API nativa
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/RESCATE-OBR/icono.png',
      badge: payload.badge || '/RESCATE-OBR/icono.png',
      data: { url: payload.url || '/RESCATE-OBR/' }
    }).then(() => {
      console.log('✅ Notificación mostrada por el SW.');
    }).catch(error => {
      console.error('❌ Error al mostrar la notificación en el SW:', error);
    });
  }
});
