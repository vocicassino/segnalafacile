/* Segnala Facile - Posizione obbligatoria V1 */
(() => {
  "use strict";

  const VERSION = "2026-09-08.1";
  const state = { installed:false, observer:null, timer:null };

  function currentGeo(){
    try{
      if(typeof geo !== "undefined") return geo;
    }catch{}
    return null;
  }

  function validGeo(value=currentGeo()){
    if(!value) return false;
    const lat=Number(value.lat);
    const lng=Number(value.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && !(lat===0 && lng===0);
  }

  function reportOpen(){
    return location.hash === "#/report";
  }

  function ensureLayout(){
    const view=document.getElementById("view-report");
    const pick=document.getElementById("btnGeoPick");
    const once=document.getElementById("btnGeoOnce");
    const live=document.getElementById("btnGeoLive");
    const clear=document.getElementById("btnGeoClear");
    const line=document.getElementById("geoLine");
    if(!view || !pick || !line) return;

    // Cambia "Posizione (opzionale)" in obbligatoria.
    const labels=[...view.querySelectorAll("label")];
    const locationLabel=labels.find(el=>/Posizione\s*\(opzionale\)/i.test(el.textContent||""));
    if(locationLabel){
      locationLabel.textContent="Posizione (obbligatoria)";
      locationLabel.style.color="#fff";
    }

    const row=pick.closest(".row");
    if(row && !document.querySelector(".sf-required-location-box")){
      const box=document.createElement("div");
      box.className="sf-required-location-box";
      box.innerHTML=`
        <div class="sf-required-location-title">📍 Indica il punto esatto</div>
        <div class="sf-required-location-note">
          Per pubblicare la segnalazione è necessario indicare dove si trova il problema.
          Tocca la mappa e posiziona il PIN nel punto preciso.
        </div>`;
      row.insertAdjacentElement("beforebegin",box);
    }

    pick.classList.add("sf-location-primary");
    pick.textContent="🗺️ Indica il punto esatto sulla mappa";

    once?.classList.add("sf-location-secondary");
    live?.classList.add("sf-location-secondary");

    if(clear){
      clear.style.display="none";
      clear.setAttribute("aria-hidden","true");
      clear.tabIndex=-1;
    }

    refreshStatus();
  }

  function refreshStatus(){
    const line=document.getElementById("geoLine");
    if(!line) return;

    const ok=validGeo();
    line.classList.toggle("sf-location-ok",ok);
    line.classList.toggle("sf-location-missing",!ok);

    if(!ok){
      line.style.display="block";
      line.textContent="⚠️ Posizione obbligatoria: indica il punto esatto prima di inviare.";
    }
  }

  function openMapPicker(){
    const btn=document.getElementById("btnGeoPick");
    if(!btn) return;

    btn.classList.remove("sf-location-error-pulse");
    void btn.offsetWidth;
    btn.classList.add("sf-location-error-pulse");

    setTimeout(()=>{
      try{ btn.click(); }catch{}
    },250);
  }

  function blockSubmitIfMissing(event){
    const send=event.target?.closest?.("#btnSend");
    if(!send) return;
    if(validGeo()) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    try{
      if(typeof showBanner==="function"){
        showBanner("error","📍 Per inviare la segnalazione devi indicare il punto esatto sulla mappa.");
      }
    }catch{}

    refreshStatus();
    openMapPicker();
  }

  function bind(){
    document.addEventListener("click",blockSubmitIfMissing,true);

    const view=document.getElementById("view-report");
    if(view && !state.observer){
      state.observer=new MutationObserver(()=>{
        if(reportOpen()){
          ensureLayout();
          refreshStatus();
        }
      });
      state.observer.observe(view,{childList:true,subtree:true,attributes:true});
    }

    window.addEventListener("hashchange",()=>{
      if(reportOpen()){
        setTimeout(()=>{
          ensureLayout();
          refreshStatus();
        },80);
      }
    });

    document.addEventListener("visibilitychange",()=>{
      if(document.visibilityState==="visible" && reportOpen()){
        ensureLayout();
        refreshStatus();
      }
    });

    state.timer=setInterval(()=>{
      if(reportOpen()) refreshStatus();
    },800);
  }

  function install(){
    if(state.installed) return;
    state.installed=true;
    ensureLayout();
    bind();
    window.__sfRequiredLocationVersion=VERSION;
    console.info("[Segnala Facile] posizione obbligatoria attiva",VERSION);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",install,{once:true});
  }else{
    install();
  }
})();
