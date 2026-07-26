const CACHE_NAME = "segnalafacile-map-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./map-enhancements.css",
  "./map-enhancements.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(ASSETS.map((asset) => cache.add(asset)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isMainPage(url) {
  const path = new URL(url).pathname;
  return path.endsWith("/segnalafacile/") || path.endsWith("/segnalafacile/index.html");
}

async function injectMapEnhancements(response) {
  if (!response || !response.ok) return response;

  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return response;

  let html = await response.text();

  if (!html.includes("map-enhancements.css")) {
    html = html.replace(
      "</head>",
      '  <link rel="stylesheet" href="./map-enhancements.css?v=2" />\n</head>'
    );
  }

  if (!html.includes("map-enhancements.js")) {
    html = html.replace(
      "</body>",
      '  <script src="./map-enhancements.js?v=2"></script>\n</body>'
    );
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "text/html; charset=utf-8");

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith((async () => {
      try {
        const network = await fetch(request, { cache: "no-store" });
        return isMainPage(request.url) ? injectMapEnhancements(network) : network;
      } catch {
        const cached = await caches.match("./index.html");
        return isMainPage(request.url) ? injectMapEnhancements(cached) : cached;
      }
    })());
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const clone = response.clone();
        if (request.method === "GET" && response.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
        }
        return response;
      });
    })
  );
});
