// AutoCarnet Service Worker v14 — cache statique + notifications push
const CACHE = 'autocarnet-v14';
const STATIC_ASSETS = [
  '/app.html',
  '/manifest.json',
  '/icon192.png',
  '/icon512.png',
  '/badge72.png',
  '/favicon32.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ne pas intercepter les appels Supabase, Netlify functions, CDN externes
  if (
    url.hostname !== location.hostname ||
    url.pathname.startsWith('/.netlify/') ||
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/storage/')
  ) return;

  // Stratégie network-first pour app.html (toujours à jour)
  if (url.pathname === '/app.html' || url.pathname === '/app') {
    event.respondWith(
      fetch(event.request)
        .then(res => { const clone = res.clone(); caches.open(CACHE).then(c => c.put(event.request, clone)); return res; })
        .catch(() => caches.match('/app.html'))
    );
    return;
  }

  // Stratégie cache-first pour les assets statiques (icons, manifest)
  if (
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
    return;
  }
});

self.addEventListener('push', e => {
  if (!e.data) return;
  try {
    const data = e.data.json();
    const title = data.title || 'AutoCarnet';
    const options = {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/badge72.png',
      vibrate: [200, 100, 200],
      tag: data.tag || ('ac-' + Date.now()),
      requireInteraction: true,
      data: { url: data.url || '/app.html' },
      actions: [
        { action: 'open', title: 'Voir' },
        { action: 'close', title: 'Fermer' }
      ]
    };

    e.waitUntil(
      self.registration.showNotification(title, options).then(() => {
        // Pastille native sur l'icône de l'app
        if (navigator.setAppBadge) {
          return navigator.setAppBadge(1);
        }
      })
    );
  } catch(err) {
    e.waitUntil(self.registration.showNotification('AutoCarnet', {
      body: e.data.text(),
      icon: '/icon-192.png',
      badge: '/badge72.png'
    }));
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();

  // Effacer la pastille quand l'utilisateur clique
  if (navigator.clearAppBadge) {
    navigator.clearAppBadge();
  }

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

self.addEventListener('notificationclose', e => {
  // Effacer la pastille si l'utilisateur ferme la notif sans cliquer
  if (navigator.clearAppBadge) {
    navigator.clearAppBadge();
  }
});
