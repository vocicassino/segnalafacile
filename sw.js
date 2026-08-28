const CACHE_NAME = "segnalafacile-map-v20-live-v8-raccolta-v1";

const ASSETS = [
  "./","./index.html","./admin.html","./manifest.webmanifest",
  "./icons/icon-192.png","./icons/icon-512.png",
  "./map-enhancements.css","./map-enhancements.js","./map-live-fix.js",
  "./assistant-text-tools.css","./assistant-text-tools.js",
  "./live-enhancements.css","./live-enhancements.js",
  "./raccolta-integration.css","./raccolta-integration.js"
];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>Promise.allSettled(ASSETS.map(a=>cache.add(a)))));
  self.skipWaiting();
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME&&k.startsWith("segnalafacile")).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

function pageKind(url){
  const path=new URL(url).pathname;
  if(path.endsWith("/segnalafacile/")||path.endsWith("/segnalafacile/index.html"))return"main";
  if(path.endsWith("/segnalafacile/admin.html"))return"admin";
  return"";
}

async function injectEnhancements(response,kind){
  if(!response||!response.ok||!kind)return response;
  const type=response.headers.get("content-type")||"";
  if(!type.includes("text/html"))return response;
  let html=await response.text();

  if(kind==="main"){
    html=html.replace(/map-enhancements\.css\?v=\d+/g,"map-enhancements.css?v=20");
    html=html.replace(/map-enhancements\.js\?v=\d+/g,"map-enhancements.js?v=20");
  }
  if(kind==="main"&&!html.includes("map-enhancements.css"))html=html.replace("</head>",'  <link rel="stylesheet" href="./map-enhancements.css?v=20" />\n</head>');
  if(kind==="main"&&!html.includes("map-enhancements.js"))html=html.replace("</body>",'  <script src="./map-enhancements.js?v=20"></script>\n</body>');
  if(kind==="main"&&!html.includes("map-live-fix.js"))html=html.replace("</body>",'  <script src="./map-live-fix.js?v=2"></script>\n</body>');
  if(!html.includes("assistant-text-tools.css"))html=html.replace("</head>",'  <link rel="stylesheet" href="./assistant-text-tools.css?v=2" />\n</head>');
  if(!html.includes("assistant-text-tools.js"))html=html.replace("</body>",'  <script src="./assistant-text-tools.js?v=2"></script>\n</body>');
  if(kind==="main"&&!html.includes("live-enhancements.css"))html=html.replace("</head>",'  <link rel="stylesheet" href="./live-enhancements.css?v=8" />\n</head>');
  if(kind==="main"&&!html.includes("live-enhancements.js"))html=html.replace("</body>",'  <script src="./live-enhancements.js?v=8"></script>\n</body>');
  if(kind==="main"&&!html.includes("raccolta-integration.css"))html=html.replace("</head>",'  <link rel="stylesheet" href="./raccolta-integration.css?v=1" />\n</head>');
  if(kind==="main"&&!html.includes("raccolta-integration.js"))html=html.replace("</body>",'  <script src="./raccolta-integration.js?v=1"></script>\n</body>');

  const headers=new Headers(response.headers);headers.delete("content-length");headers.set("content-type","text/html; charset=utf-8");
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

function isCodeAsset(request){
  if(request.method!=="GET")return false;
  const url=new URL(request.url);if(url.origin!==self.location.origin)return false;
  return request.destination==="script"||request.destination==="style"||/\.(?:js|css)$/i.test(url.pathname);
}
async function networkFirst(request){
  try{
    const response=await fetch(request,{cache:"no-store"});
    if(response?.ok){const cache=await caches.open(CACHE_NAME);cache.put(request,response.clone()).catch(()=>{})}
    return response;
  }catch(e){
    const cached=await caches.match(request,{ignoreSearch:true});if(cached)return cached;throw e;
  }
}

/* Cassino Raccolta integrata: ricezione promemoria push sul Service Worker di Segnala Facile. */
self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data?.json() || {}; }
  catch { payload = { body: event.data?.text() || "Hai un nuovo promemoria per la raccolta." }; }

  const rawTarget = payload?.data?.url || "./#/raccolta";
  const targetUrl = String(rawTarget).includes("/Cassino-Raccolta/")
    ? "./#/raccolta"
    : rawTarget;

  const title = payload.title || "Cassino Raccolta • Segnala Facile";
  const options = {
    body: payload.body || "Hai un nuovo promemoria per la raccolta.",
    icon: payload.icon && !String(payload.icon).includes("Cassino-Raccolta")
      ? payload.icon
      : "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    tag: payload.tag || "cassino-raccolta-push",
    renotify: Boolean(payload.renotify),
    requireInteraction: Boolean(payload.requireInteraction),
    vibrate: payload.vibrate || [180,80,180],
    data: { ...(payload.data || {}), url: targetUrl },
    actions: payload.actions || [{ action:"open", title:"Apri raccolta" }]
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(() =>
      self.clients.matchAll({type:"window",includeUncontrolled:true}).then(list =>
        Promise.all(list.map(client =>
          client.postMessage({
            type:"cassino-push-received",
            payload:{title, ...options}
          })
        ))
      )
    )
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  let targetUrl = event.notification.data?.url || "./#/raccolta";
  if(String(targetUrl).includes("/Cassino-Raccolta/")) targetUrl = "./#/raccolta";

  event.waitUntil(
    clients.matchAll({type:"window",includeUncontrolled:true}).then(clientList => {
      for(const client of clientList){
        if("focus" in client){
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(targetUrl) : undefined;
    })
  );
});

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.mode==="navigate"||request.destination==="document"){
    event.respondWith((async()=>{
      const kind=pageKind(request.url);
      try{return injectEnhancements(await fetch(request,{cache:"no-store"}),kind)}
      catch{
        const fallback=kind==="admin"?await caches.match("./admin.html"):await caches.match("./index.html");
        return injectEnhancements(fallback,kind);
      }
    })());return;
  }
  if(isCodeAsset(request)){event.respondWith(networkFirst(request));return}
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
    if(request.method==="GET"&&response.ok)caches.open(CACHE_NAME).then(cache=>cache.put(request,response.clone())).catch(()=>{});
    return response;
  })));
});
