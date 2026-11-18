/* =========================================================
   SEGNALA FACILE — UI V4 / STORE READY
   18-11-2026
   Layout/UI only: non modifica Worker, API, payload o logica mappa.
   ========================================================= */
(() => {
  "use strict";

  const VERSION = "2026-11-18.ui4.2";
  const state = {
    installed: false,
    reportReady: false,
    reportStep: 1,
    lastRoute: "",
    navObserver: null,
    moreObserver: null
  };

  const SVG = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.8 12 3l9 7.8"/><path d="M5 9.8V21h14V9.8"/><path d="M9 21v-7h6v7"/></svg>',
    article: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5h10"/><path d="M4 10h16"/><path d="M4 14.5h16"/><path d="M4 19h11"/><rect x="16" y="4" width="4" height="3" rx="1"/></svg>',
    report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 13v7h14v-7"/></svg>',
    map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15"/><path d="M15 6v15"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    recycle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9.5 4 2-2 2 2"/><path d="M11.5 2v5"/><path d="M6.2 8.5 3.5 9l-.7-2.6"/><path d="m3.5 9 4.3 2.5"/><path d="m17.8 8.5 2.7.5.7-2.6"/><path d="m20.5 9-4.3 2.5"/><path d="M6.5 15h11"/><path d="m8 19-1.5-4L4 18"/><path d="m16 19 1.5-4L20 18"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 15a4 4 0 0 1-4 4H8l-5 3 1.6-4.8A7 7 0 0 1 3 12V9a6 6 0 0 1 6-6h7a5 5 0 0 1 5 5Z"/><path d="M8 10h8"/><path d="M8 14h5"/></svg>',
    shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v10h16V10"/><path d="M3 10 5 4h14l2 6"/><path d="M8 10a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0"/><path d="M8 20v-5h4v5"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>'
  };

  function routeName(){
    return (location.hash || "#/").replace("#/","") || "home";
  }

  function showBannerSafe(type,text,ms=4200){
    try{
      if(typeof showBanner === "function") showBanner(type,text,ms);
    }catch{}
  }

  function refreshStaticLocationUi(){
    if(routeName() !== "report") return;
    const view=document.getElementById("view-report");
    if(!view) return;

    const locationLabel=[...view.querySelectorAll("label")]
      .find(el=>/Posizione\s*\((?:opzionale|obbligatoria)\)/i.test(el.textContent||""));

    if(locationLabel) locationLabel.textContent="Posizione (obbligatoria)";
    const clear=document.getElementById("btnGeoClear");
    if(clear) clear.style.display="none";
  }

  /* =====================================================
     HOME
     ===================================================== */
  function installHome(){
    const view=document.getElementById("view-home");
    const hero=view?.querySelector(":scope > .card.hero");
    if(!hero) return;

    hero.classList.add("sf-home-hero");

    const h1=hero.querySelector("h1");
    if(h1 && !h1.dataset.sfUi4){
      h1.textContent="La tua città, in un’unica app.";
      h1.dataset.sfUi4="1";
    }

    const p=hero.querySelector(".heroTop p");
    if(p && !p.dataset.sfUi4){
      p.innerHTML='Segnala un problema, consulta i servizi di Cassino e resta aggiornato con <strong style="color:#f3f7ff">Voci di Cassino</strong>.';
      p.dataset.sfUi4="1";
    }

    const rows=[...hero.querySelectorAll(":scope > .btnRow")];
    if(rows[0]) rows[0].classList.add("sf-home-main-cta");
    if(rows[1]) rows[1].classList.add("sf-home-secondary-actions");

    if(!document.getElementById("sfHomeQuickGrid")){
      const grid=document.createElement("div");
      grid.id="sfHomeQuickGrid";
      grid.className="sf-home-quick-grid";
      grid.innerHTML=`
        <a class="sf-home-quick" data-sf-quick="raccolta" href="#/raccolta">
          <span class="sf-home-quick-icon">${SVG.recycle}</span>
          <span><strong>Cassino Raccolta</strong><small>Cosa esporre oggi</small></span>
        </a>
        <a class="sf-home-quick" data-sf-quick="live" href="#/chat">
          <span class="sf-home-quick-icon">${SVG.chat}</span>
          <span><strong>Live</strong><small>Chat della città</small></span>
        </a>
        <a class="sf-home-quick" data-sf-quick="attivita" href="#/attivita">
          <span class="sf-home-quick-icon">${SVG.shop}</span>
          <span><strong>Attività</strong><small>Locali e offerte</small></span>
        </a>
        <a class="sf-home-quick" data-sf-quick="map" href="#/map">
          <span class="sf-home-quick-icon">${SVG.pin}</span>
          <span><strong>Mappa</strong><small>Segnalazioni e punti</small></span>
        </a>`;

      const anchor=rows[0] || hero.querySelector(".heroTop");
      anchor?.insertAdjacentElement("afterend",grid);
    }

    // La card Raccolta viene creata da raccolta-integration.js.
    // Se esiste, la portiamo subito dopo le scorciatoie.
    const raccoltaCard=hero.querySelector(".sf-home-raccolta-card");
    const quick=document.getElementById("sfHomeQuickGrid");
    if(raccoltaCard && quick && raccoltaCard.previousElementSibling!==quick){
      quick.insertAdjacentElement("afterend",raccoltaCard);
    }
  }

  /* =====================================================
     NAV
     ===================================================== */
  function setNavVisual(link,key,label){
    if(!link) return;
    const icon=link.querySelector(".navEmoji") || link.querySelector(".navIco");
    if(icon){
      icon.classList.add("navEmoji");
      icon.innerHTML=SVG[key] || "";
    }
    const spans=[...link.querySelectorAll(":scope > span")];
    const text=spans.find(s=>!s.classList.contains("navEmoji") && !s.classList.contains("sf-live-nav-badge"));
    if(text) text.textContent=label;
  }

  function installNav(){
    const host=document.querySelector("nav.bottom .inner");
    if(!host) return;

    const keep=new Set(["home","articoli","report","map","altro"]);
    [...host.querySelectorAll("a[data-nav]")].forEach(a=>{
      a.classList.toggle("sf-nav-hidden",!keep.has(a.dataset.nav));
    });

    const home=host.querySelector('a[data-nav="home"]');
    const articoli=host.querySelector('a[data-nav="articoli"]');
    const report=host.querySelector('a[data-nav="report"]');
    const map=host.querySelector('a[data-nav="map"]');
    const more=host.querySelector('a[data-nav="altro"],a.sf-more-nav');

    setNavVisual(home,"home","Home");
    setNavVisual(articoli,"article","Articoli");
    setNavVisual(report,"report","Segnala");
    setNavVisual(map,"map","Mappa");

    if(report) report.classList.add("sf-nav-report");

    if(more){
      more.dataset.nav="altro";
      setNavVisual(more,"more","Altro");
    }

    // Ordine definitivo a 5 voci. Riordina SOLO se serve:
    // evita loop con il MutationObserver della barra.
    const wanted=[home,articoli,report,map,more].filter(Boolean);
    const current=[...host.querySelectorAll("a[data-nav]")]
      .filter(a=>!a.classList.contains("sf-nav-hidden"));

    const sameOrder=
      current.length===wanted.length &&
      current.every((a,i)=>a===wanted[i]);

    if(!sameOrder){
      wanted.forEach(a=>{
        if(a.parentElement===host) host.appendChild(a);
      });
    }

    syncMoreActive();
    extendMoreMenu();
  }

  function syncMoreActive(){
    const route=routeName();
    const more=document.querySelector('nav.bottom a[data-nav="altro"],nav.bottom a.sf-more-nav');
    if(!more) return;
    const secondary=new Set(["attivita","offerte","chat","my","contacts","raccolta","install","area-attivita","places","add-place"]);
    more.classList.toggle("active",secondary.has(route));
  }

  function moreButton(grid,key,icon,title,small,route){
    if(grid.querySelector(`[data-sf-ui4-more="${key}"]`)) return;
    const b=document.createElement("button");
    b.type="button";
    b.className="sf-more-item";
    b.dataset.sfUi4More=key;
    b.innerHTML=`<span class="sf-more-ico">${icon}</span><strong>${title}</strong><small>${small}</small>`;
    b.addEventListener("click",()=>{
      document.body.classList.remove("sf-more-open");
      location.hash=route;
    });
    grid.appendChild(b);
  }

  function extendMoreMenu(){
    const grid=document.querySelector("#sfMoreSheet .sf-more-grid");
    if(!grid) return;

    moreButton(grid,"attivita","🏪","Attività","Locali, servizi e recensioni.","#/attivita");
    moreButton(grid,"live","💬","Live","Chat della community.","#/chat");
    moreButton(grid,"storico","🗂️","Le mie segnalazioni","Archivio locale delle tue segnalazioni.","#/my");
    moreButton(grid,"contatti","☎️","Contatti utili","Numeri e canali ufficiali.","#/contacts");
  }

  /* =====================================================
     REPORT WIZARD
     ===================================================== */
  function directLabel(view,forId){
    return view.querySelector(`label[for="${forId}"]`);
  }

  function textLabel(view,needle){
    return [...view.querySelectorAll("label")].find(l=>(l.textContent||"").toLowerCase().includes(needle.toLowerCase()));
  }

  function move(node,target){
    if(node && target && node.parentElement!==target) target.appendChild(node);
  }

  function rowOf(id){
    return document.getElementById(id)?.closest(".row") || null;
  }

  function installReportWizard(){
    if(state.reportReady) return;

    const view=document.getElementById("view-report");
    const card=view?.querySelector(":scope > .card");
    if(!view || !card) return;

    const first=card.firstElementChild;
    if(first) first.classList.add("sf-report-head");

    const progress=document.createElement("div");
    progress.className="sf-report-progress";
    progress.id="sfReportProgress";
    progress.innerHTML=`
      <div class="sf-report-progress-step active" data-sf-progress="1"><b>1</b><span>Problema</span></div>
      <div class="sf-report-progress-step" data-sf-progress="2"><b>2</b><span>Posizione</span></div>
      <div class="sf-report-progress-step" data-sf-progress="3"><b>3</b><span>Allegati</span></div>`;

    const step1=document.createElement("div");
    const step2=document.createElement("div");
    const step3=document.createElement("div");
    step1.className="sf-report-step active";
    step2.className="sf-report-step";
    step3.className="sf-report-step";
    step1.dataset.sfStep="1";
    step2.dataset.sfStep="2";
    step3.dataset.sfStep="3";

    step1.innerHTML='<div class="sf-report-step-title"><h2>Che cosa vuoi segnalare?</h2><p>Descrivi il problema in modo chiaro. Potrai aggiungere la posizione nel passaggio successivo.</p></div>';
    step2.innerHTML='<div class="sf-report-step-title"><h2>Dove si trova?</h2><p>Indica il punto preciso sulla mappa. La posizione è obbligatoria.</p></div>';
    step3.innerHTML='<div class="sf-report-step-title"><h2>Aggiungi prove e invia</h2><p>Foto, documenti e audio sono facoltativi. Controlla tutto prima dell’invio.</p></div>';

    first?.insertAdjacentElement("afterend",progress);
    progress.insertAdjacentElement("afterend",step1);
    step1.insertAdjacentElement("afterend",step2);
    step2.insertAdjacentElement("afterend",step3);

    // 1 — Titolo, categoria, descrizione
    [directLabel(view,"titolo"),document.getElementById("titolo"),
     directLabel(view,"categoria"),document.getElementById("categoria"),
     directLabel(view,"descrizione"),document.getElementById("descrizione")
    ].forEach(n=>move(n,step1));

    // 2 — posizione
    const posLabel=textLabel(view,"posizione (");
    [posLabel,
     view.querySelector(".sf-required-location-box"),
     rowOf("btnGeoPick"),
     document.getElementById("geoLine")
    ].forEach(n=>move(n,step2));

    // 3 — foto
    [textLabel(view,"foto (massimo"),
     rowOf("btnPickCamera"),
     document.getElementById("photoPreview"),
     textLabel(view,"documenti"),
     rowOf("btnPickDocs"),
     document.getElementById("docsPreview"),
     textLabel(view,"messaggio vocale"),
     document.getElementById("audioControls"),
     document.getElementById("audioPreview"),
     document.getElementById("anonimo")?.closest(".toggle"),
     document.getElementById("contactBox"),
     document.getElementById("progressWrap"),
     document.getElementById("btnSend")?.closest(".btnRow")
    ].forEach(n=>move(n,step3));

    const sendRow=document.getElementById("btnSend")?.closest(".btnRow");
    const finalHint=sendRow?.nextElementSibling;
    if(finalHint?.classList.contains("hint")) move(finalHint,step3);

    const nav1=document.createElement("div");
    nav1.className="sf-wizard-nav";
    nav1.innerHTML='<span></span><button class="btn primary" type="button" data-sf-next="2">Continua →</button>';
    step1.appendChild(nav1);

    const nav2=document.createElement("div");
    nav2.className="sf-wizard-nav";
    nav2.innerHTML='<button class="btn ghost" type="button" data-sf-prev="1">← Indietro</button><button class="btn primary" type="button" data-sf-next="3">Continua →</button>';
    step2.appendChild(nav2);

    const nav3=document.createElement("div");
    nav3.className="sf-wizard-nav";
    nav3.innerHTML='<button class="btn ghost" type="button" data-sf-prev="2">← Indietro</button><span></span>';
    step3.insertBefore(nav3,step3.querySelector("#progressWrap") || step3.querySelector(".btnRow"));

    view.addEventListener("click",e=>{
      const next=e.target.closest("[data-sf-next]");
      const prev=e.target.closest("[data-sf-prev]");

      if(next){
        const target=Number(next.dataset.sfNext);
        if(target===2 && !validateStep1()) return;
        if(target===3 && !validateStep2()) return;
        showReportStep(target);
      }
      if(prev) showReportStep(Number(prev.dataset.sfPrev));
    });

    state.reportReady=true;
    moveAssistantTools();
    showReportStep(1);
  }

  function moveAssistantTools(){
    const view=document.getElementById("view-report");
    const step=view?.querySelector('[data-sf-step="1"]');
    if(!view || !step) return;

    const candidates=[
      ...view.querySelectorAll(".aiQuickActions,.sf-ai-tools,.sf-assistant-tools,[data-ai-tools]")
    ];
    const desc=document.getElementById("descrizione");
    candidates.forEach(node=>{
      if(node && !step.contains(node)){
        if(desc && desc.parentElement===step) desc.insertAdjacentElement("afterend",node);
        else step.appendChild(node);
      }
    });
  }

  function validateStep1(){
    const titolo=String(document.getElementById("titolo")?.value||"").trim();
    const descrizione=String(document.getElementById("descrizione")?.value||"").trim();
    if(titolo.length<4 || descrizione.length<10){
      showBannerSafe("error","Compila Titolo e Descrizione prima di continuare.");
      (titolo.length<4 ? document.getElementById("titolo") : document.getElementById("descrizione"))?.focus();
      return false;
    }
    return true;
  }

  function validateStep2(){
    const line=document.getElementById("geoLine");
    const ok=line?.classList.contains("sf-location-ok") || /^✅/.test(String(line?.textContent||"").trim());
    if(!ok){
      showBannerSafe("error","📍 Indica il punto esatto sulla mappa prima di continuare.");
      document.getElementById("btnGeoPick")?.classList.add("sf-location-error-pulse");
      setTimeout(()=>document.getElementById("btnGeoPick")?.classList.remove("sf-location-error-pulse"),1500);
      return false;
    }
    return true;
  }

  function showReportStep(n){
    const view=document.getElementById("view-report");
    if(!view) return;
    const step=Math.min(3,Math.max(1,Number(n)||1));
    state.reportStep=step;

    view.querySelectorAll(".sf-report-step").forEach(el=>{
      el.classList.toggle("active",Number(el.dataset.sfStep)===step);
    });
    view.querySelectorAll(".sf-report-progress-step").forEach(el=>{
      const i=Number(el.dataset.sfProgress);
      el.classList.toggle("active",i===step);
      el.classList.toggle("done",i<step);
    });

    const card=view.querySelector(":scope > .card");
    if(card && routeName()==="report"){
      const top=card.getBoundingClientRect().top + window.scrollY - 8;
      window.scrollTo({top:Math.max(0,top),behavior:"smooth"});
    }
  }

  /* =====================================================
     ATTIVITÀ/OFFERTE
     ===================================================== */
  function installCommerceTabs(){
    [["attivita","Attività"],["offerte","Offerte"]].forEach(([route])=>{
      const view=document.getElementById(`view-${route}`);
      const card=view?.querySelector(":scope > .card");
      if(!card || card.querySelector(".sf-commerce-tabs")) return;

      const tabs=document.createElement("div");
      tabs.className="sf-commerce-tabs";
      tabs.innerHTML=`
        <a class="sf-commerce-tab ${route==="attivita"?"active":""}" href="#/attivita">🏪 Attività</a>
        <a class="sf-commerce-tab ${route==="offerte"?"active":""}" href="#/offerte">🎁 Offerte</a>`;
      card.insertBefore(tabs,card.firstElementChild?.nextElementSibling || card.firstChild);
    });
  }

  /* =====================================================
     ROUTE
     ===================================================== */
  function applyRoute(){
    const route=routeName();
    const body=document.body;

    ["home","report","chat","map","articoli","attivita","offerte"].forEach(r=>{
      body.classList.toggle(`sf-route-${r}`,route===r);
    });

    if(route==="home") installHome();
    if(route==="report"){
      refreshStaticLocationUi();
      installReportWizard();
      moveAssistantTools();
    }

    installNav();
    installCommerceTabs();
    syncMoreActive();
    state.lastRoute=route;
  }

  function installObservers(){
    const host=document.querySelector("nav.bottom .inner");
    if(host && !state.navObserver){
      // Solo childList: niente loop sugli attributi.
      state.navObserver=new MutationObserver(()=>{
        installNav();
      });
      state.navObserver.observe(host,{childList:true});
    }

    if(!state.moreObserver){
      state.moreObserver=new MutationObserver(()=>{
        const sheet=document.getElementById("sfMoreSheet");
        if(sheet){
          extendMoreMenu();
          installNav();
        }
      });
      state.moreObserver.observe(document.body,{childList:true});
    }
  }

  function install(){
    if(state.installed) return;
    state.installed=true;

    installHome();
    installReportWizard();
    installCommerceTabs();
    installNav();
    installObservers();
    applyRoute();

    window.addEventListener("hashchange",()=>setTimeout(applyRoute,0));
    window.addEventListener("pageshow",applyRoute);

    // Gli altri moduli (Live/Raccolta) si installano dopo questo file.
    // Due passaggi brevi permettono di integrarli senza polling permanente.
    setTimeout(()=>{ installNav(); installHome(); extendMoreMenu(); moveAssistantTools(); },250);
    setTimeout(()=>{ installNav(); installHome(); extendMoreMenu(); moveAssistantTools(); },900);

    window.__sfUiRedesignVersion=VERSION;
    window.sfShowReportStep=showReportStep;
    console.info("[Segnala Facile] UI V4 attiva",VERSION);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",install,{once:true});
  }else{
    install();
  }
})();
/* =========================================================
   SEGNALA FACILE — FIX CLUSTER MAPPA V4.2
   Problema risolto:
   tocco su un gruppo numerato -> mostra i PIN reali di quel gruppo,
   mantenendoli visibili dopo lo zoom e aprendo a ventaglio le
   coordinate uguali/quasi uguali.
   NON modifica API, Worker, Telegram o invio segnalazioni.
   ========================================================= */
(() => {
  "use strict";

  const VERSION = "2026-11-18.clusterfix1";
  const capturedByKey = new Map();

  let installed = false;
  let layerPatched = false;
  let mapListenersInstalled = false;
  let expanded = null;
  let addLayerOriginal = null;

  function getMap(){
    try { return (typeof mapMain !== "undefined" && mapMain) ? mapMain : null; }
    catch { return null; }
  }

  function getLayer(){
    try { return (typeof layerMain !== "undefined" && layerMain) ? layerMain : null; }
    catch { return null; }
  }

  function originalLatLng(marker){
    try {
      const p = marker?.__sfOriginalLatLng || marker?.getLatLng?.();
      if(!p) return null;
      const lat = Number(p.lat);
      const lng = Number(p.lng);
      if(!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return L.latLng(lat,lng);
    } catch {
      return null;
    }
  }

  function rememberMarker(marker){
    if(!marker || marker.__sfIsCluster === true) return;
    if(typeof marker.getLatLng !== "function") return;

    const key = String(marker.__sfKey || "");
    if(!key) return;

    capturedByKey.set(key, marker);
  }

  function currentRealMarkers(){
    const rows = [...capturedByKey.values()].filter(marker => {
      return marker &&
        marker.__sfIsCluster !== true &&
        marker.__sfKey &&
        originalLatLng(marker);
    });

    // map-enhancements azzera il contatore ad ogni ricostruzione:
    // una Map per __sfKey conserva automaticamente l'ultima generazione.
    return rows;
  }

  function cellSizeForZoom(zoom){
    return zoom <= 12 ? 92 :
           zoom <= 14 ? 70 :
           zoom <= 15 ? 54 : 44;
  }

  function cellKey(map, marker, zoom){
    const p = originalLatLng(marker);
    if(!p) return "";
    const point = map.project(p, zoom);
    const size = cellSizeForZoom(zoom);
    return `${Math.floor(point.x / size)}:${Math.floor(point.y / size)}`;
  }

  function centerOf(markers){
    const valid = markers.map(originalLatLng).filter(Boolean);
    if(!valid.length) return null;
    const sum = valid.reduce((acc,p)=>{
      acc.lat += p.lat;
      acc.lng += p.lng;
      return acc;
    },{lat:0,lng:0});
    return L.latLng(sum.lat/valid.length,sum.lng/valid.length);
  }

  function distance(a,b){
    if(!a || !b) return Infinity;
    return Math.abs(a.lat-b.lat)+Math.abs(a.lng-b.lng);
  }

  function groupsAtZoom(map,zoom){
    const groups = new Map();

    for(const marker of currentRealMarkers()){
      const key = cellKey(map,marker,zoom);
      if(!key) continue;
      if(!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(marker);
    }

    return groups;
  }

  function findClickedGroup(map, clusterMarker, expectedCount, zoom){
    const clusterCenter = clusterMarker?.getLatLng?.();
    const groups = [...groupsAtZoom(map,zoom).values()]
      .filter(group => group.length > 1);

    if(!groups.length) return [];

    // Prima cerca il gruppo con lo stesso numero e centro più vicino.
    const sameCount = Number.isFinite(expectedCount)
      ? groups.filter(group => group.length === expectedCount)
      : [];

    const candidates = sameCount.length ? sameCount : groups;

    candidates.sort((a,b)=>
      distance(centerOf(a),clusterCenter) -
      distance(centerOf(b),clusterCenter)
    );

    return candidates[0] || [];
  }

  function clusterMarkerFromTarget(layer,target){
    if(!layer || !target) return null;

    const candidates = layer.getLayers?.() || [];
    for(const item of candidates){
      if(item?.__sfIsCluster !== true) continue;
      const icon = item._icon;
      if(!icon) continue;
      if(icon === target || icon.contains?.(target) || target.contains?.(icon)){
        return item;
      }
    }
    return null;
  }

  function removeExpandedVisuals(){
    const map = getMap();
    if(!map || !expanded?.markers) {
      expanded = null;
      return;
    }

    for(const marker of expanded.markers){
      try {
        if(map.hasLayer(marker)) map.removeLayer(marker);
      } catch {}
      try {
        const p = originalLatLng(marker);
        if(p) marker.setLatLng(p);
      } catch {}
    }

    expanded = null;
  }

  function expandedBounds(markers){
    const points = markers.map(originalLatLng).filter(Boolean);
    if(!points.length) return null;
    try { return L.latLngBounds(points); }
    catch { return null; }
  }

  function spreadAndShowExpanded(){
    const map = getMap();
    if(!map || !expanded?.markers?.length) return;

    const zoom = Number(map.getZoom() || 13);

    // Se l'utente è tornato allo zoom iniziale (o più largo),
    // richiude automaticamente il gruppo.
    if(zoom <= expanded.fromZoom){
      removeExpandedVisuals();
      return;
    }

    const groups = new Map();

    for(const marker of expanded.markers){
      const p = originalLatLng(marker);
      if(!p) continue;
      const key = `${p.lat.toFixed(5)}:${p.lng.toFixed(5)}`;
      if(!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(marker);
    }

    for(const markers of groups.values()){
      const center = originalLatLng(markers[0]);
      if(!center) continue;

      if(markers.length === 1){
        try {
          markers[0].setLatLng(center);
          markers[0].addTo(map);
        } catch {}
        continue;
      }

      // Spiderfy: i PIN con coordinate uguali vengono disposti a ventaglio.
      const centerPoint = map.project(center,zoom);
      const perRing = 12;

      markers.forEach((marker,index)=>{
        const ring = Math.floor(index/perRing);
        const first = ring*perRing;
        const count = Math.min(perRing,markers.length-first);
        const pos = index-first;
        const radius = 34 + ring*28;
        const angle = (Math.PI*2*pos/Math.max(1,count)) - Math.PI/2;

        const point = L.point(
          centerPoint.x + Math.cos(angle)*radius,
          centerPoint.y + Math.sin(angle)*radius
        );

        try {
          marker.setLatLng(map.unproject(point,zoom));
          marker.addTo(map);
        } catch {}
      });
    }

    // Porta i PIN selezionati sopra agli altri livelli.
    for(const marker of expanded.markers){
      try { marker.setZIndexOffset?.(2000); } catch {}
    }
  }

  function openCluster(clusterMarker,targetEl){
    const map = getMap();
    const layer = getLayer();
    if(!map || !layer || !clusterMarker) return false;

    const fromZoom = Number(map.getZoom() || 13);
    const expectedCount = Number(
      String(targetEl?.textContent || "").trim()
    );

    const markers = findClickedGroup(
      map,
      clusterMarker,
      Number.isFinite(expectedCount) ? expectedCount : null,
      fromZoom
    );

    if(markers.length < 2) return false;

    removeExpandedVisuals();

    expanded = {
      markers,
      fromZoom,
      expectedCount: markers.length
    };

    const bounds = expandedBounds(markers);
    if(!bounds) return false;

    try { map.stop(); } catch {}

    const samePoint = bounds.getNorthEast().equals(bounds.getSouthWest());

    if(samePoint){
      map.setView(bounds.getCenter(),Math.max(17,fromZoom+1),{
        animate:true,
        duration:.18
      });
    }else{
      map.fitBounds(bounds,{
        paddingTopLeft:[52,115],
        paddingBottomRight:[52,72],
        maxZoom:16,
        animate:true,
        duration:.20
      });

      // Se fitBounds non aumenta lo zoom, aumenta di un livello:
      // il gruppo deve realmente "aprirsi".
      setTimeout(()=>{
        if(!expanded) return;
        try{
          if(map.getZoom() <= fromZoom){
            map.setZoom(Math.min(16,fromZoom+1),{animate:true});
          }
        }catch{}
      },80);
    }

    // map-enhancements ridisegna i cluster su zoomend/moveend.
    // Noi aggiungiamo i PIN reali subito dopo quel ridisegno.
    setTimeout(spreadAndShowExpanded,240);
    setTimeout(spreadAndShowExpanded,420);

    return true;
  }

  function patchLayer(){
    const layer = getLayer();
    if(!layer || layerPatched) return false;

    layerPatched = true;

    const originalAdd = layer.addLayer.bind(layer);
    addLayerOriginal = originalAdd;

    layer.addLayer = function(item){
      const result = originalAdd(item);

      // Dopo registerMarker, il PIN possiede __sfKey.
      // Registriamo sempre l'ultima generazione.
      if(item?.__sfIsCluster !== true){
        queueMicrotask(()=>rememberMarker(item));
      }

      return result;
    };

    // Registra eventuali PIN già presenti.
    for(const item of (layer.getLayers?.() || [])){
      rememberMarker(item);
    }

    // Ricostruzione controllata per avere sicuramente l'ultima
    // generazione dei marker reali nel registro.
    try {
      if(typeof refreshPublicMaps === "function"){
        setTimeout(()=> {
          try { refreshPublicMaps(); } catch {}
        },0);
      }
    } catch {}

    return true;
  }

  function installMapListeners(){
    const map = getMap();
    const layer = getLayer();
    if(!map || !layer || mapListenersInstalled) return false;

    mapListenersInstalled = true;

    const container = map.getContainer?.();
    if(container){
      // Capture: intercetta il gruppo PRIMA del vecchio click handler,
      // evitando lo zoom cieco sul centro medio del cluster.
      container.addEventListener("click",(event)=>{
        const target = event.target?.closest?.(".sf-map-cluster,.sf-map-cluster-wrap");
        if(!target) return;

        const cluster = clusterMarkerFromTarget(layer,target);
        if(!cluster) return;

        if(openCluster(cluster,target)){
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
      },true);
    }

    const reapply = ()=>{
      if(!expanded) return;
      setTimeout(spreadAndShowExpanded,0);
      setTimeout(spreadAndShowExpanded,70);
    };

    // I listener originali della mappa sono stati registrati prima:
    // questi vengono eseguiti dopo il loro renderClusters().
    map.on("zoomend",reapply);
    map.on("moveend",reapply);

    return true;
  }

  function tryInstall(){
    try {
      if(typeof ensureMaps === "function") ensureMaps();
    } catch {}

    const okLayer = patchLayer();
    const okMap = installMapListeners();

    if(okLayer && okMap){
      window.__sfClusterFixVersion = VERSION;
      console.info("[Segnala Facile] fix cluster mappa attivo",VERSION);
      return true;
    }

    return false;
  }

  function install(){
    if(installed) return;
    installed = true;

    // Tentativi limitati: nessun polling permanente.
    [0,150,450,1000,2200].forEach(ms=>{
      setTimeout(tryInstall,ms);
    });

    window.addEventListener("hashchange",()=>{
      if(location.hash === "#/map"){
        setTimeout(tryInstall,0);
        setTimeout(()=>{
          try{
            if(typeof refreshPublicMaps === "function") refreshPublicMaps();
          }catch{}
        },120);
      }else{
        removeExpandedVisuals();
      }
    });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded",install,{once:true});
  }else{
    install();
  }
})();
