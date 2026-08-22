const CACHE_NAME = "segnalafacile-map-v3";

const ASSETS = [
  "./",
  "./index.html",
  "./admin.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./map-enhancements.css",
  "./map-enhancements.js",
  "./map-live-fix.js",
  "./assistant-text-tools.css",
  "./assistant-text-tools.js"
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
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key.startsWith("segnalafacile"))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function pageKind(url) {
  const path = new URL(url).pathname;
  if (path.endsWith("/segnalafacile/") || path.endsWith("/segnalafacile/index.html")) return "main";
  if (path.endsWith("/segnalafacile/admin.html")) return "admin";
  return "";
}

async function injectEnhancements(response, kind) {
  if (!response || !response.ok || !kind) return response;
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return response;

  let html = await response.text();

  // Aggiorna le versioni dei file della mappa anche se index.html contiene
  // ancora una query precedente.
  if (kind === "main") {
    html = html.replace(/map-enhancements\.css\?v=\d+/g, "map-enhancements.css?v=6");
    html = html.replace(/map-enhancements\.js\?v=\d+/g, "map-enhancements.js?v=6");
  }

  if (kind === "main" && !html.includes("map-enhancements.css")) {
    html = html.replace("</head>", '  <link rel="stylesheet" href="./map-enhancements.css?v=6" />\n</head>');
  }

  if (kind === "main" && !html.includes("map-enhancements.js")) {
    html = html.replace("</body>", '  <script src="./map-enhancements.js?v=6"></script>\n</body>');
  }

  // Compatibilità con installazioni che avevano già il vecchio loader.
  if (kind === "main" && !html.includes("map-live-fix.js")) {
    html = html.replace("</body>", '  <script src="./map-live-fix.js?v=2"></script>\n</body>');
  }

  if (!html.includes("assistant-text-tools.css")) {
    html = html.replace("</head>", '  <link rel="stylesheet" href="./assistant-text-tools.css?v=2" />\n</head>');
  }

  if (!html.includes("assistant-text-tools.js")) {
    html = html.replace("</body>", '  <script src="./assistant-text-tools.js?v=2"></script>\n</body>');
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

function isCodeAsset(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return request.destination === "script" ||
    request.destination === "style" ||
    /\.(?:js|css)$/i.test(url.pathname);
}

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response?.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith((async () => {
      const kind = pageKind(request.url);
      try {
        const network = await fetch(request, { cache: "no-store" });
        return injectEnhancements(network, kind);
      } catch {
        const fallback = kind === "admin"
          ? await caches.match("./admin.html")
          : await caches.match("./index.html");
        return injectEnhancements(fallback, kind);
      }
    })());
    return;
  }

  if (isCodeAsset(request)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (request.method === "GET" && response.ok) {
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(request, response.clone()))
            .catch(() => {});
        }
        return response;
      });
    })
  );
});
