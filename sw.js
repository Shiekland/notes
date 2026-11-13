/*
  Notes: keeps a copy of the app itself on this device, so it opens with no connection.

  - Online, the newest app always comes from the network first (so updates arrive as
    usual); the saved copy is only used if the network fails or takes too long.
  - Only the app's own files are handled here. Requests to Google (sign-in, Drive) go
    straight to the network, untouched.
  - Notes aren't stored by this file: the app keeps its own encrypted copies.
*/
const CACHE = 'notes-app-shell-v2';
const SHELL = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];
const NETWORK_WAIT_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('notes-app-shell-') && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Google and everything else: untouched
  const isPage = request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  event.respondWith(fromNetworkThenCache(request, isPage));
});

async function fromNetworkThenCache(request, isPage) {
  const cache = await caches.open(CACHE);
  const key = isPage ? './' : request;
  try {
    // (A page request can't be re-sent with extra settings, so pages are fetched by address.)
    const response = await Promise.race([
      fetch(isPage ? request.url : request, { cache: 'no-store', credentials: 'same-origin' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), NETWORK_WAIT_MS))
    ]);
    if (response.ok) await cache.put(key, response.clone());
    return response;
  } catch {
    const saved = await cache.match(key, { ignoreSearch: true });
    return saved || Response.error();
  }
}
