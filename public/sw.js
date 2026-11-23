const CACHE_PREFIX = 'class-point-pwa-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/pwa-icon.svg',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname === '/api' ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put('/', response.clone())),
            );
          }
          return response;
        })
        .catch(async () => (await caches.match('/')) ?? Response.error()),
    );
    return;
  }

  const isAppShellResource =
    url.pathname === '/manifest.webmanifest' ||
    url.pathname.startsWith('/pwa-icon');
  if (url.pathname.startsWith('/assets/') || isAppShellResource) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              event.waitUntil(
                caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone())),
              );
            }
            return response;
          }),
      ),
    );
  }
});
