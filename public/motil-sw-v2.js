const MOTIL_SW_VERSION = 'motil-pwa-v2';
const OFFLINE_SHELL_CACHE = 'motil-offline-shell-v3';
const OFFLINE_SHELL_URL = '/offline-maintenance.html';
const TERRAIN_ASSETS = [OFFLINE_SHELL_URL, '/motil-terrain.mjs', '/motil-terrain-ui.mjs'];
const LEGACY_CACHES = new Set([
  'sostenibilidad-v2',
  'sostenibilidad-api-v2',
]);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(OFFLINE_SHELL_CACHE).then((cache) => cache.addAll(TERRAIN_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => LEGACY_CACHES.has(name) || (name.startsWith('motil-offline-shell-') && name !== OFFLINE_SHELL_CACHE))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (TERRAIN_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(OFFLINE_SHELL_CACHE).then(async (cache) => (await cache.match(url.pathname)) || fetch(request)));
    return;
  }
  if (request.mode === 'navigate' && (url.pathname === '/dashboard' || /^\/dashboard\/mantenimiento(?:\/ordenes-trabajo(?:\/[0-9a-f-]{36})?)?\/?$/i.test(url.pathname))) {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(OFFLINE_SHELL_CACHE);
      return (await cache.match(OFFLINE_SHELL_URL)) || Response.error();
    }));
    return;
  }
  event.respondWith(fetch(request));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'GET_VERSION') {
    event.source?.postMessage?.({ type: 'MOTIL_SW_VERSION', version: MOTIL_SW_VERSION });
  }
  if (event.data?.type === 'GET_TERRAIN_READY') {
    event.ports[0]?.postMessage({ ready: true, cache: OFFLINE_SHELL_CACHE });
  }
});

self.addEventListener('push', (event) => {
  let notification;
  try { notification = event.data?.json(); } catch { notification = null; }
  if (!notification || typeof notification.title !== 'string') return;
  const title = notification.title.slice(0, 120);
  const body = typeof notification.body === 'string' ? notification.body.slice(0, 400) : '';
  const url = typeof notification.url === 'string' && notification.url.startsWith('/') && !notification.url.startsWith('//')
    ? notification.url : '/dashboard';
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: '/icon-192.png', badge: '/icon-192.png', data: { url }, tag: 'motil-test-push',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/dashboard', self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
    const match = windows.find((windowClient) => new URL(windowClient.url).origin === target.origin);
    if (match) { await match.focus(); return match.navigate(target.href); }
    return clients.openWindow(target.href);
  }));
});
