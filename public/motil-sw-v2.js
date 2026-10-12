const MOTIL_SW_VERSION = 'motil-pwa-v3-push';
const OFFLINE_SHELL_CACHE = 'motil-offline-shell-v3';
const OFFLINE_SHELL_URL = '/offline-maintenance.html';
const TERRAIN_ASSETS = [OFFLINE_SHELL_URL, '/motil-terrain.mjs', '/motil-terrain-ui.mjs'];
const LEGACY_CACHES = new Set([
  'sostenibilidad-v2',
  'sostenibilidad-api-v2',
]);

self.addEventListener('install', (event) => {
  // Push receipt activation must not depend on offline asset availability.
  // Offline pre-caching is postponed until its reliability is verified separately.
  event.waitUntil(self.skipWaiting());
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
  if (event.data?.type === 'GET_PUSH_PILOT_CAPABILITIES') {
    event.ports[0]?.postMessage({ receipts: true });
  }
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

function reportPilotReceipt(receipt, stage) {
  if (!receipt || typeof receipt.testId !== 'string' || typeof receipt.token !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(receipt.testId) || !/^[a-zA-Z0-9_-]{43}$/.test(receipt.token)) return Promise.resolve();
  return fetch('/api/notifications/push/receipt', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ testId: receipt.testId, token: receipt.token, stage }),
    signal: AbortSignal.timeout(4000),
  }).catch(() => undefined);
}

self.addEventListener('push', (event) => {
  let notification;
  try { notification = event.data?.json(); } catch { notification = null; }
  if (!notification || typeof notification.title !== 'string') return;
  const title = notification.title.slice(0, 120);
  const body = typeof notification.body === 'string' ? notification.body.slice(0, 400) : '';
  const url = typeof notification.url === 'string' && notification.url.startsWith('/') && !notification.url.startsWith('//')
    ? notification.url : '/dashboard';
  const tag = typeof notification.tag === 'string' && /^motil-msg-[0-9a-f-]{36}$/i.test(notification.tag)
    ? notification.tag : 'motil-test-push';
  const received = reportPilotReceipt(notification.receipt, 'received');
  const displayed = Promise.resolve().then(() => self.registration.showNotification(title, {
    body, icon: '/icon-192.png', badge: '/icon-192.png',
    data: { url, receipt: notification.receipt }, tag,
    renotify: true, requireInteraction: true,
  })).then(
    () => reportPilotReceipt(notification.receipt, 'displayed'),
    () => reportPilotReceipt(notification.receipt, 'display_failed'),
  );
  event.waitUntil(Promise.allSettled([received, displayed]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/dashboard', self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(Promise.allSettled([
    reportPilotReceipt(event.notification.data?.receipt, 'clicked'),
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const match = windows.find((windowClient) => new URL(windowClient.url).origin === target.origin);
      if (match) { await match.focus(); return match.navigate(target.href); }
      return clients.openWindow(target.href);
    }),
  ]));
});
