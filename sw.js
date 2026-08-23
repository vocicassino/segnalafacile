const CACHE_NAME = "segnalafacile-map-v15-live-v4";

const ASSETS = [
  "./","./index.html","./admin.html","./manifest.webmanifest",
  "./icons/icon-192.png","./icons/icon-512.png",
  "./map-enhancements.css","./map-enhancements.js","./map-live-fix.js",
  "./assistant-text-tools.css","./assistant-text-tools.js",
  "./live-enhancements.css","./live-enhancements.js"
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
    html=html.replace(/map-enhancements\.css\?v=\d+/g,"map-enhancements.css?v=15");
    html=html.replace(/map-enhancements\.js\?v=\d+/g,"map-enhancements.js?v=15");
  }
  if(kind==="main"&&!html.includes("map-enhancements.css"))html=html.replace("</head>",'  <link rel="stylesheet" href="./map-enhancements.css?v=15" />\n</head>');
  if(kind==="main"&&!html.includes("map-enhancements.js"))html=html.replace("</body>",'  <script src="./map-enhancements.js?v=15"></script>\n</body>');
  if(kind==="main"&&!html.includes("map-live-fix.js"))html=html.replace("</body>",'  <script src="./map-live-fix.js?v=2"></script>\n</body>');
  if(!html.includes("assistant-text-tools.css"))html=html.replace("</head>",'  <link rel="stylesheet" href="./assistant-text-tools.css?v=2" />\n</head>');
  if(!html.includes("assistant-text-tools.js"))html=html.replace("</body>",'  <script src="./assistant-text-tools.js?v=2"></script>\n</body>');
  if(kind==="main"&&!html.includes("live-enhancements.css"))html=html.replace("</head>",'  <link rel="stylesheet" href="./live-enhancements.css?v=4" />\n</head>');
  if(kind==="main"&&!html.includes("live-enhancements.js"))html=html.replace("</body>",'  <script src="./live-enhancements.js?v=4"></script>\n</body>');

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
