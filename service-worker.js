// AutoCarnet Service Worker v7 — minimal, ne cache pas les pages HTML
const CACHE = 'autocarnet-v7';

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
    const { title, body } = e.data.json();
    e.waitUntil(self.registration.showNotification(title, {
      body, icon: '/icon-192.png', badge: '/icon-192.png', vibrate: [200, 100, 200],
    }));
  } catch(err) {}
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
