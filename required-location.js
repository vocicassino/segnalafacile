/* Segnala Facile - Posizione obbligatoria V3 SAFE
   La logica principale e la validazione sono ora native in index.html.
   Questo file NON usa MutationObserver, timer continui o click capture.
*/
(() => {
  "use strict";
  const VERSION = "2026-09-08.3";

  function refreshStaticUi(){
    if(location.hash !== "#/report") return;

    const view = document.getElementById("view-report");
    if(!view) return;

    const labels = [...view.querySelectorAll("label")];
    const locationLabel = labels.find(el => /Posizione\s*\((?:opzionale|obbligatoria)\)/i.test(el.textContent || ""));
    if(locationLabel && locationLabel.textContent !== "Posizione (obbligatoria)"){
      locationLabel.textContent = "Posizione (obbligatoria)";
    }

    const clear = document.getElementById("btnGeoClear");
    if(clear) clear.style.display = "none";
  }

  function install(){
    refreshStaticUi();
    window.addEventListener("hashchange", () => setTimeout(refreshStaticUi, 0));
    window.addEventListener("pageshow", refreshStaticUi);
    window.__sfRequiredLocationVersion = VERSION;
    console.info("[Segnala Facile] posizione obbligatoria V3 SAFE", VERSION);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", install, {once:true});
  }else{
    install();
  }
})();
