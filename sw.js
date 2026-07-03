// ============================================================
// VERSIÓN DE LA CACHÉ
// ============================================================
const CACHE_NAME = 'obr-cache-v11';
const BASE_PATH = '/RESCATE-OBR';

const ALL_FILES = [
  BASE_PATH + '/',
  BASE_PATH + '/index.html',
  BASE_PATH + '/app.js',
  BASE_PATH + '/styles.css',
  BASE_PATH + '/icono.png',
  BASE_PATH + '/sw.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => 
      Promise.allSettled(ALL_FILES.map(url => 
        cache.add(url).catch(err => console.warn('No se pudo cachear:', url, err))
      ))
    )
  );
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
  if (url.hostname.includes('firestore') || url.hostname.includes('googleapis')) {
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
    data: { url: data.url || BASE_PATH + '/?view=home' }
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

// ============================================================
// NOTIFICATION CLICK - Abrir la URL dentro de la app (VERSIÓN ESTABLE)
// ============================================================
self.addEventListener('notificationclick', event => {
    console.log('👆 Usuario hizo clic en la notificación:', event.notification.data);
    event.notification.close();
    
    // Obtener la URL de los datos de la notificación
    const url = event.notification.data && event.notification.data.url 
        ? event.notification.data.url 
        : '/RESCATE-OBR/?view=home';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clients => {
                // 1. Buscar si ya hay una ventana abierta de nuestra app
                for (let client of clients) {
                    if (client.url.includes('/RESCATE-OBR/')) {
                        // ✅ SOLUCIÓN UNIVERSAL: Enfocamos la ventana
                        // Luego, si la URL es distinta, forzamos una recarga
                        // (esto funciona en todos los navegadores)
                        if (client.url !== url) {
                            return client.focus().then(() => {
                                // Forzar la navegación a la nueva URL recargando la página
                                client.navigate(url);
                            });
                        } else {
                            // Si ya está en la URL correcta, solo enfocar
                            return client.focus();
                        }
                    }
                }
                
                // 2. Si no hay ventana abierta, abrir una nueva
                return clients.openWindow(url);
            })
    );
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  if (event.data && event.data.type === 'SEND_PUSH') {
    const { payload } = event.data;
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || BASE_PATH + '/icono.png',
      data: { url: payload.url || BASE_PATH + '/?view=home' }
    }).then(() => console.log('✅ Notificación mostrada por el SW.'));
  }
});
