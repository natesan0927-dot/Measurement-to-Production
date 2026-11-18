/*
 * Lets the app open and work with no internet (on site). Always tries the internet first so the
 * app is never out of date; the stored copy is used only when offline. Measurements are saved on
 * the device itself, not here.
 */
const CACHE = 'm2p-v9';
const SHELL = ['./', './index.html', './style.css', './config.js', './db.js', './rules.js', './drawing.js', './app.js',
  './manifest.webmanifest', './assets/titans_logo_trim.png', './assets/app-icon-192.png', './assets/favicon.png'];
const FONTS = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (ev) => {
  if (ev.request.method !== 'GET') return;
  const url = new URL(ev.request.url);
  if (url.origin !== self.location.origin && !FONTS.test(ev.request.url)) return;
  // own files: always ask the server (never a stale browser copy); the stored copy is only for no internet
  const req = url.origin === self.location.origin ? new Request(ev.request, { cache: 'no-cache' }) : ev.request;
  ev.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(ev.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(ev.request).then((hit) => hit || caches.match('./index.html')))
  );
});
