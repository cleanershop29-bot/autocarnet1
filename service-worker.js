// AutoCarnet Service Worker v10 — avec support notifications push
const CACHE = 'autocarnet-v10';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('push', e => {
  if (!e.data) return;
  try {
    const data = e.data.json();
    const title = data.title || 'AutoCarnet';
    const options = {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      vibrate: [200, 100, 200],
      tag: 'autocarnet-rappel',
      requireInteraction: true,
      data: { url: data.url || '/app.html' },
      actions: [
        { action: 'open', title: 'Voir' },
        { action: 'close', title: 'Fermer' }
      ]
    };
    e.waitUntil(self.registration.showNotification(title, options));
  } catch(err) {
    // Fallback si le payload n'est pas JSON
    e.waitUntil(self.registration.showNotification('AutoCarnet', {
      body: e.data.text(),
      icon: '/icon-192.png',
      badge: '/icon-192.png'
    }));
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/app.html';
  if (e.action === 'close') return;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('autocarnet') && 'focus' in client) {
          client.focus();
          return client.navigate(url);
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
