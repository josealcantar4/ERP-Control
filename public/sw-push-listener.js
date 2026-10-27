// ============================================================================
// Service Worker Push & Notification Listener para ERP Control
// Maneja notificaciones del sistema y Web Push en segundo plano
// ============================================================================

self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || 'ERP Control - Notificación';
  const options = {
    body: payload.body || 'Tienes una nueva actualización en ERP Control',
    icon: '/pwa-192x192.png',
    badge: '/notification-badge-96x96.png',
    sound: '/notification.mp3',
    vibrate: [150, 75, 150, 75, 200],
    data: {
      url: payload.url || '/'
    },
    tag: payload.tag || 'erp-transfer-' + Date.now(),
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Manejador de clic/toque en notificación del sistema
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 1. Si la app ya está abierta en segundo plano, traerla al frente
      for (const client of windowClients) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      // 2. Si la app estaba cerrada, abrirla
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
