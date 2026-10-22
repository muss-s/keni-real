/* Keni · service worker (added 2026-10-21). Makes Keni installable and quick to open.
   - Pages: always the newest from the network; the last good copy only when offline (so a deploy shows up right away).
   - Keni's own images and icons: from the phone's copy first (they don't change).
   - Never touches other sites (Supabase, Mapbox, map tiles, CDNs), sign-in, or anything that isn't a plain GET. */
const CACHE = 'keni-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.json', '/icons/icon-192.png'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // other sites and anything that sends data: hands off
  if (url.pathname.startsWith('/admin')) return; // the admin page always comes straight from the network

  if (req.mode === 'navigate') { // the page itself: newest first, saved copy if offline
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); }
      return res;
    }).catch(() => caches.match('/').then((r) => r || Response.error())));
    return;
  }

  if (url.pathname.startsWith('/images/') || url.pathname.startsWith('/icons/')) { // pictures: the saved copy first
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});

/* push notifications (sent by the Supabase function "push"): show it, and tapping it opens Keni */
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Keni', {
    body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: d.tag, renotify: !!d.tag, data: { url: d.url || '/' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const to = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    const w = ws.find((c) => new URL(c.url).origin === self.location.origin);
    // Keni already open: bring it up and tell it where to go (a chat, the activity list); otherwise open it there
    if (w) return w.focus().then((c) => { (c || w).postMessage({ keniOpen: to }); });
    return self.clients.openWindow(to);
  }));
});
