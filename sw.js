// ============================================================
// VERSIÓN DE LA CACHÉ (ÚNICO LUGAR DONDE SE DEFINE)
// ============================================================
const CACHE_NAME = 'obr-cache-v10';
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

  // 2. Envío de notificación manual (El TRUCO)
  if (event.data && event.data.type === 'SEND_PUSH') {
    const { payload } = event.data;
    console.log('📩 SEND_PUSH recibido:', payload);
    
    // 🔥 TRUCO: Forzar al navegador a aceptar la notificación
    forcePushNotification(payload);
  }
});

// ============================================================
// FUNCIÓN TRUCO: Simula una notificación push real
// ============================================================
async function forcePushNotification(payload) {
  try {
    // 1. Obtener la suscripción actual (o crearla con la VAPID Key de Firebase)
    let subscription = await self.registration.pushManager.getSubscription();
    if (!subscription) {
      // 🔴 Aquí iría tu VAPID Public Key de Firebase (si la tienes)
      // Si no la tienes, el pushManager no puede suscribirse sin VAPID.
      // Para este truco usamos un método alternativo si falla.
      console.warn('⚠️ No hay suscripción push activa. Usando método alternativo.');
      
      // 2. Método alternativo (fallback para cuando no hay VAPID)
      // Mostramos la notificación directamente y forzamos la recarga
      self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon || BASE_PATH + '/icono.png',
        data: { url: payload.url || BASE_PATH + '/' }
      }).then(() => {
        console.log('✅ Notificación mostrada (método alternativo)');
      });
      return;
    }

    // 3. Simular un evento push "falso" usando el Push API
    // (Esta es la parte que Chrome acepta como "push real")
    const data = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon,
      url: payload.url
    });

    // Crear un evento push simulado
    const pushEvent = new PushEvent('push', {
      data: new TextEncoder().encode(data),
      waitUntil: (promise) => self.waitUntil(promise)
    });

    // Disparar el evento push simulado
    self.dispatchEvent(pushEvent);
    console.log('✅ Evento push simulado disparado correctamente.');

  } catch (error) {
    console.error('❌ Error en forcePushNotification:', error);
    // Fallback: mostrar la notificación directamente
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || BASE_PATH + '/icono.png',
      data: { url: payload.url || BASE_PATH + '/' }
    });
  }
}
