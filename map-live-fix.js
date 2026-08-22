/* Segnala Facile - fix reattività mappa mobile/PWA
   - aggiorna i dati quando si apre la mappa
   - ripara il resize di Leaflet quando la vista diventa visibile
   - espande i cluster al primo tocco
   - aggiorna periodicamente i punti mentre la mappa è aperta
*/
(() => {
  "use strict";

  const FIX_VERSION = "2026-08-22.1";
  const state = {
    lastDataFetch: 0,
    fetching: null,
    mapBound: null,
    mapViewObserver: null,
    resizeObserver: null,
    refreshTimer: null,
    periodicTimer: null
  };

  function getMap() {
    try {
      return (typeof mapMain !== "undefined" && mapMain) ? mapMain : null;
    } catch {
      return null;
    }
  }

  function mapViewIsOpen() {
    if (location.hash === "#/map") return true;
    const view = document.getElementById("view-map");
    if (!view) return false;
    const style = getComputedStyle(view);
    return !view.classList.contains("hidden") &&
      style.display !== "none" &&
      style.visibility !== "hidden";
  }

  function safeEnsureMaps() {
    try {
      if (typeof ensureMaps === "function") ensureMaps();
    } catch (error) {
      console.debug("[SF map fix] ensureMaps:", error);
    }
  }

  function safeRefreshPublicMaps() {
    try {
      if (typeof refreshPublicMaps === "function") refreshPublicMaps();
    } catch (error) {
      console.debug("[SF map fix] refreshPublicMaps:", error);
    }
  }

  function invalidateMapSize() {
    const map = getMap();
    if (!map) return;

    try {
      map.invalidateSize({
        pan: false,
        animate: false,
        debounceMoveend: true
      });
    } catch {
      try { map.invalidateSize(); } catch {}
    }
  }

  function repairMapLayout() {
    // Android/PWA può mostrare la sezione prima che il contenitore abbia
    // raggiunto la dimensione finale. Ripetiamo il calcolo in pochi istanti.
    requestAnimationFrame(invalidateMapSize);
    [0, 60, 140, 280, 520, 900].forEach(ms => {
      setTimeout(invalidateMapSize, ms);
    });
  }

  async function fetchFreshPublicData(force = false) {
    if (!mapViewIsOpen() || document.visibilityState === "hidden") return;

    const now = Date.now();
    if (!force && now - state.lastDataFetch < 10000) return;
    if (state.fetching) return state.fetching;

    state.lastDataFetch = now;

    state.fetching = (async () => {
      try {
        if (typeof fetchPublicData === "function") {
          await fetchPublicData();
        } else {
          // Se il metodo principale non è disponibile, almeno ridisegna i dati già caricati.
          safeRefreshPublicMaps();
        }
      } catch (error) {
        console.debug("[SF map fix] fetchPublicData:", error);
      } finally {
        state.fetching = null;
        repairMapLayout();
      }
    })();

    return state.fetching;
  }

  function openMapRefresh({ fresh = true } = {}) {
    if (!mapViewIsOpen()) return;

    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(() => {
      safeEnsureMaps();

      // Mostra subito i punti già in memoria.
      safeRefreshPublicMaps();
      repairMapLayout();
      bindMapEvents();

      // Poi recupera in rete la situazione più recente senza bloccare la UI.
      if (fresh) fetchFreshPublicData(false);
    }, 0);
  }

  function bindMapEvents() {
    const map = getMap();
    if (!map || state.mapBound === map) return;

    state.mapBound = map;

    map.on("zoomend", () => {
      repairMapLayout();
    });

    map.on("moveend", () => {
      repairMapLayout();
    });

    map.on("resize", () => {
      repairMapLayout();
    });

    const container = map.getContainer?.();
    if (container && typeof ResizeObserver !== "undefined") {
      try { state.resizeObserver?.disconnect(); } catch {}
      state.resizeObserver = new ResizeObserver(() => {
        if (mapViewIsOpen()) repairMapLayout();
      });
      state.resizeObserver.observe(container);
    }
  }

  function clusterLatLngFromEvent(event) {
    const map = getMap();
    if (!map) return null;

    try {
      return map.mouseEventToLatLng(event);
    } catch {}

    try {
      const el = event.target.closest(".sf-map-cluster");
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const mapRect = map.getContainer().getBoundingClientRect();
      const point = L.point(
        rect.left + rect.width / 2 - mapRect.left,
        rect.top + rect.height / 2 - mapRect.top
      );
      return map.containerPointToLatLng(point);
    } catch {
      return null;
    }
  }

  // Cattura il tocco PRIMA del vecchio handler del cluster.
  // Invece di fare piccoli salti di zoom, porta subito al livello in cui
  // i marker singoli vengono mostrati (>=17).
  document.addEventListener("click", (event) => {
    const clusterEl = event.target?.closest?.(".sf-map-cluster");
    if (!clusterEl || !mapViewIsOpen()) return;

    const map = getMap();
    if (!map) return;

    const center = clusterLatLngFromEvent(event);
    if (!center) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    const currentZoom = Number(map.getZoom?.() || 13);
    const targetZoom = Math.min(18, Math.max(17, currentZoom + 3));

    try {
      map.setView(center, targetZoom, {
        animate: true,
        duration: 0.22
      });
    } catch {
      try { map.setView(center, targetZoom); } catch {}
    }

    // Il modulo map-enhancements ascolta zoomend e ridisegna i cluster.
    // Questi richiami coprono WebView/Android che a volte ritardano l'evento.
    setTimeout(() => {
      try { map.fire("zoomend"); } catch {}
      repairMapLayout();
    }, 260);

    setTimeout(() => {
      try { map.fire("zoomend"); } catch {}
      repairMapLayout();
    }, 520);
  }, true);

  function installViewObserver() {
    const view = document.getElementById("view-map");
    if (!view || typeof MutationObserver === "undefined") return;

    try { state.mapViewObserver?.disconnect(); } catch {}
    state.mapViewObserver = new MutationObserver(() => {
      if (mapViewIsOpen()) openMapRefresh({ fresh: true });
    });

    state.mapViewObserver.observe(view, {
      attributes: true,
      attributeFilter: ["class", "style", "hidden"]
    });
  }

  window.addEventListener("hashchange", () => {
    if (location.hash === "#/map") {
      openMapRefresh({ fresh: true });
    }
  });

  window.addEventListener("pageshow", () => {
    if (mapViewIsOpen()) openMapRefresh({ fresh: true });
  });

  window.addEventListener("focus", () => {
    if (mapViewIsOpen()) fetchFreshPublicData(false);
  });

  window.addEventListener("online", () => {
    if (mapViewIsOpen()) fetchFreshPublicData(true);
  });

  window.addEventListener("orientationchange", () => {
    if (mapViewIsOpen()) {
      setTimeout(() => openMapRefresh({ fresh: false }), 120);
      setTimeout(repairMapLayout, 420);
    }
  });

  window.addEventListener("resize", () => {
    if (mapViewIsOpen()) repairMapLayout();
  }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && mapViewIsOpen()) {
      openMapRefresh({ fresh: true });
    }
  });

  // Quando l'utente tiene la mappa aperta, verifica nuovi punti una volta al minuto.
  state.periodicTimer = setInterval(() => {
    if (mapViewIsOpen() && document.visibilityState === "visible") {
      fetchFreshPublicData(false);
    }
  }, 60000);

  // Chiede anche al browser di verificare periodicamente se esiste un SW più nuovo.
  setTimeout(() => {
    navigator.serviceWorker?.getRegistration?.()
      .then(reg => reg?.update?.())
      .catch(() => {});
  }, 1800);

  function boot() {
    installViewObserver();

    const wait = setInterval(() => {
      safeEnsureMaps();
      bindMapEvents();

      if (getMap()) {
        clearInterval(wait);
        if (mapViewIsOpen()) openMapRefresh({ fresh: true });
      }
    }, 100);

    setTimeout(() => clearInterval(wait), 12000);

    console.info("[Segnala Facile] map-live-fix attivo", FIX_VERSION);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
