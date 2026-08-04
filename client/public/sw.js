// Minimal service worker: its only job is push notifications (there's no
// offline caching here — the "Add to Home Screen" install works fine
// without one, but Web Push requires a registered service worker to
// receive and display notifications while the app itself isn't open).

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Carla Création', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Carla Création', {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: payload.url || '/admin' },
    }),
  );
});

// Focuses an already-open admin tab instead of always opening a new one,
// since the admin is usually already logged in somewhere.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/admin', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    }),
  );
});
