/* =========================================================
   SEGNALA FACILE — UI V4 / STORE READY
   18-11-2026
   Layout/UI only: non modifica Worker, API, payload o logica mappa.
   ========================================================= */
(() => {
  "use strict";

  const VERSION = "2026-11-18.ui4.1";
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
