const CACHE_NAME = "segnalafacile-v3.1.1";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./map-enhancements.css",
  "./map-enhancements.js",
  "./map-live-fix.js",
  "./assistant-text-tools.css",
  "./assistant-text-tools.js",
  "./live-enhancements.css",
  "./live-enhancements.js",
  "./raccolta-integration.css",
  "./raccolta-integration.js",
  "./no-coords-reports.css",
  "./no-coords-reports.js",
  "./required-location.css",
  "./required-location.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => Promise.allSettled(STATIC_ASSETS.map(asset => cache.add(asset))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("segnalafacile") && k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (request.method === "GET" && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (e) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw e;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  const fresh = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  }).catch(() => null);
  return cached || (await fresh) || Response.error();
}

self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data?.json() || {}; }
  catch { payload = { body: event.data?.text() || "Hai un nuovo promemoria per la raccolta." }; }
  const rawTarget = payload?.data?.url || "./#/raccolta";
  const targetUrl = String(rawTarget).includes("/Cassino-Raccolta/") ? "./#/raccolta" : rawTarget;
  event.waitUntil(self.registration.showNotification(payload.title || "Cassino Raccolta • Segnala Facile", {
    body: payload.body || "Hai un nuovo promemoria per la raccolta.",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    tag: payload.tag || "cassino-raccolta-push",
    data: { ...(payload.data || {}), url: targetUrl }
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "./#/raccolta";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const client of list) {
      if ("focus" in client) {
        client.navigate(targetUrl);
        return client.focus();
      }
    }
    return clients.openWindow ? clients.openWindow(targetUrl) : undefined;
  }));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(networkFirst(request));
    return;
  }

  const url = new URL(request.url);
  if (url.origin === self.location.origin && /\.(?:js|css)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
