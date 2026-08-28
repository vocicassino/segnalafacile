/* Segnala Facile - mappa pubblica reattiva v7
   Correzione passaggio Home -> Mappa
   - NON cattura mai i cluster vecchi come se fossero PIN reali
   - sospende il clustering mentre refreshPublicMaps ricostruisce i marker
   - cattura i PIN reali subito dopo il refresh, in modo sincrono
   - aggiorna i dati dal Worker all'apertura della mappa
   - mantiene zoom/centro dopo l'interazione utente
   - cluster al primo tocco -> PIN singoli
   - spiderfy per coordinate uguali/quasi uguali
*/
(() => {
  "use strict";

  /* LIVE V2 - loader diretto.
     Non dipende più dall'iniezione HTML del Service Worker. */
  (function loadLiveEnhancementsDirectly() {
    try {
      const hasCss = [...document.querySelectorAll('link[rel="stylesheet"]')]
        .some(el => String(el.getAttribute("href") || "").includes("live-enhancements.css"));

      if (!hasCss) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "./live-enhancements.css?v=8";
        link.dataset.sfLiveLoader = "1";
        document.head.appendChild(link);
      }

      const hasJs = [...document.scripts]
        .some(el => String(el.getAttribute("src") || "").includes("live-enhancements.js"));

      if (!hasJs) {
        const script = document.createElement("script");
        script.src = "./live-enhancements.js?v=8";
        script.dataset.sfLiveLoader = "1";
        script.async = false;
        document.head.appendChild(script);
      }
    } catch (error) {
      console.warn("[Segnala Facile] impossibile caricare Live V2", error);
    }
  })();

  /* CASSINO RACCOLTA V1 - loader diretto */
  (function loadRaccoltaIntegrationDirectly() {
    try {
      const hasCss = [...document.querySelectorAll('link[rel="stylesheet"]')]
        .some(el => String(el.getAttribute("href") || "").includes("raccolta-integration.css"));

      if (!hasCss) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "./raccolta-integration.css?v=1";
        link.dataset.sfRaccoltaLoader = "1";
        document.head.appendChild(link);
      }

      const hasJs = [...document.scripts]
        .some(el => String(el.getAttribute("src") || "").includes("raccolta-integration.js"));

      if (!hasJs) {
        const script = document.createElement("script");
        script.src = "./raccolta-integration.js?v=1";
        script.dataset.sfRaccoltaLoader = "1";
        script.async = false;
        document.head.appendChild(script);
      }
    } catch (error) {
      console.warn("[Segnala Facile] impossibile caricare Cassino Raccolta", error);
    }
  })();

  const VERSION = "2026-08-28.20";

  const state = {
    originalEnsureMaps: null,
    originalRefreshPublicMaps: null,
    baseMarkers: [],
    registry: new Map(),
    counter: 0,
    attachedMap: null,
    ready: false,
    rebuilding: false,
    rendering: false,
    userViewLocked: false,
    refreshPromise: null,
    lastFastFetch: 0,
    resizeObserver: null,
    visibilityObserver: null,
    periodicTimer: null,
    openTimer: null,
    popupOpen: false,
    popupMarker: null,
    pendingRefresh: false,
    pendingRefreshArgs: null,
    menuOpen: false,
    infoOpen: false
  };

  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));

  const number = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  function mapVisible() {
    if (location.hash === "#/map") return true;
    const view = document.getElementById("view-map");
    if (!view) return false;
    const style = getComputedStyle(view);
    return !view.classList.contains("hidden") &&
      style.display !== "none" &&
      style.visibility !== "hidden";
  }

  function getMainMap() {
    try {
      return (typeof mapMain !== "undefined" && mapMain) ? mapMain : null;
    } catch {
      return null;
    }
  }

  function getMainLayer() {
    try {
      return (typeof layerMain !== "undefined" && layerMain) ? layerMain : null;
    } catch {
      return null;
    }
  }

  function coordsOf(item) {
    if (!item) return null;
    const lat = number(item.lat ?? item.geo?.lat);
    const lng = number(item.lng ?? item.geo?.lng);
    if (lat === null || lng === null || (lat === 0 && lng === 0)) return null;
    return { lat, lng };
  }

  function distance(a, b) {
    if (!a || !b) return Infinity;
    return Math.abs(a.lat - b.lat) + Math.abs(a.lng - b.lng);
  }

  function nearest(list, latlng, maxDistance = 0.00012) {
    let winner = null;
    let best = Infinity;
    for (const item of Array.isArray(list) ? list : []) {
      const coords = coordsOf(item);
      const d = distance(coords, latlng);
      if (d < best) {
        winner = item;
        best = d;
      }
    }
    return best <= maxDistance ? winner : null;
  }

  function localReports() {
    try {
      return typeof loadReports === "function" ? loadReports() : [];
    } catch {
      return [];
    }
  }

  function classifyMarker(marker) {
    const latlng = marker.__sfOriginalLatLng || marker.getLatLng();
    const popup = marker.getPopup?.();
    const html = String(popup?.getContent?.() || "");

    if (/WhatsApp|Chiama|piano|In evidenza/i.test(html)) return "activity";
    if (/recension/i.test(html)) return "place";

    const activity = nearest(window.publicAttivita, latlng);
    if (activity && /attivit|negozio|ristorante|bar|palestra|professionista|servizi|bb/i.test(String(activity.categoria || ""))) {
      return "activity";
    }

    const place = nearest(window.publicLuoghi, latlng);
    const report = nearest([...(window.publicSegnalazioni || []), ...localReports()], latlng);

    if (place && !report) return "place";
    return "report";
  }

  function dataForMarker(type, latlng) {
    if (type === "activity") return nearest(window.publicAttivita, latlng) || {};
    if (type === "place") return nearest(window.publicLuoghi, latlng) || {};
    return nearest([...(window.publicSegnalazioni || []), ...localReports()], latlng) || {};
  }

  function photosOf(item) {
    try {
      if (typeof estraiTutteLeFoto === "function") {
        const rows = estraiTutteLeFoto(item);
        if (Array.isArray(rows)) return rows.filter(Boolean).slice(0, 8);
      }
    } catch {}

    const raw = item?.galleria_foto ?? item?.foto ?? item?.photos ?? item?.photoDataUrl ?? item?.immagine ?? "";
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw.map((entry) => entry?.dataUrl || entry?.url || entry).filter(Boolean).slice(0, 8);
    }
    if (typeof raw === "object") return [raw.dataUrl || raw.url].filter(Boolean);

    const value = String(raw).trim();
    if (!value) return [];
    if (value.startsWith("[") || value.startsWith("{")) {
      try {
        const parsed = JSON.parse(value);
        return photosOf({ foto: parsed });
      } catch {}
    }
    return [value];
  }

  function markerTitle(type, item) {
    if (type === "activity") return item.nome || "Attività locale";
    if (type === "place") return item.nome || "Luogo consigliato";
    return item.titolo || item.title || "Segnalazione";
  }

  function markerDescription(type, item) {
    if (type === "activity") return item.descrizione || item.offerta || item.testo_offerta || "Scheda attività locale.";
    if (type === "place") return item.recensione || item.descrizione || item.description || item.testo || "Luogo consigliato dalla community.";
    return item.descrizione || item.description || item.testo || "Nessuna descrizione disponibile.";
  }

  function markerDate(item) {
    return item.dataStr || item.when || item.createdAt || item.created_at || "";
  }

  function typeMeta(type) {
    if (type === "activity") return { emoji: "🏪", label: "Attività", className: "activity" };
    if (type === "place") return { emoji: "⭐", label: "Luogo / recensione", className: "place" };
    return { emoji: "📣", label: "Segnalazione", className: "report" };
  }


  function ensureFullscreenStyle() {
    if (document.getElementById("sfMapFullscreenStyle")) return;

    const style = document.createElement("style");
    style.id = "sfMapFullscreenStyle";
    style.textContent = `
      html.sf-map-fullscreen-root,
      body.sf-map-fullscreen {
        width: 100% !important;
        height: 100% !important;
        overflow: hidden !important;
        overscroll-behavior: none !important;
      }

      body.sf-map-fullscreen #view-map {
        position: fixed !important;
        inset: 0 !important;
        z-index: 900000 !important;
        display: block !important;
        width: 100vw !important;
        height: 100vh !important;
        height: 100dvh !important;
        min-height: 100vh !important;
        min-height: 100dvh !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #07111f !important;
        overflow: hidden !important;
      }

      body.sf-map-fullscreen #view-map > * {
        max-width: none !important;
      }

      body.sf-map-fullscreen #view-map .card {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        min-height: 0 !important;
        max-height: none !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        background: #07111f !important;
        overflow: hidden !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: flex-start !important;
      }

      body.sf-map-fullscreen #view-map .card::before {
        display: none !important;
      }

      body.sf-map-fullscreen #view-map .mapShell {
        position: relative !important;
        flex: 1 1 auto !important;
        min-height: 0 !important;
        height: 100% !important;
        width: 100% !important;
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
        overflow: hidden !important;
        display: flex !important;
        flex-direction: column !important;
        background: #07111f !important;
      }

      body.sf-map-fullscreen #view-map .mapTopBar {
        flex: 0 0 auto !important;
        margin: 0 !important;
        padding:
          max(10px, env(safe-area-inset-top))
          76px
          10px
          12px !important;
        border-radius: 0 !important;
        z-index: 1200 !important;
        background: rgba(7,17,31,.96) !important;
        backdrop-filter: blur(16px) !important;
        -webkit-backdrop-filter: blur(16px) !important;
      }

      body.sf-map-fullscreen #view-map .sf-map-legend {
        flex: 0 0 auto !important;
        margin: 0 !important;
        padding: 8px 10px !important;
        border-left: 0 !important;
        border-right: 0 !important;
        border-radius: 0 !important;
        background: rgba(7,17,31,.94) !important;
        z-index: 1190 !important;
      }

      body.sf-map-fullscreen #view-map .sf-map-help {
        flex: 0 0 auto !important;
        margin: 0 !important;
        padding: 7px 12px 9px !important;
        background: rgba(7,17,31,.94) !important;
        z-index: 1190 !important;
      }

      body.sf-map-fullscreen #mapMain {
        position: relative !important;
        flex: 1 1 auto !important;
        min-height: 0 !important;
        height: auto !important;
        width: 100% !important;
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
      }

      #sfMapFullscreenClose {
        position: fixed;
        top: max(10px, env(safe-area-inset-top));
        right: max(10px, env(safe-area-inset-right));
        z-index: 900100;
        display: none;
        width: 52px;
        height: 52px;
        padding: 0;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,.18);
        background: rgba(7,17,31,.88);
        color: #fff;
        font-size: 22px;
        font-weight: 1000;
        box-shadow: 0 12px 32px rgba(0,0,0,.42);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        align-items: center;
        justify-content: center;
      }

      body.sf-map-fullscreen #sfMapFullscreenClose {
        display: flex;
      }

      @media (min-width: 900px) {
        body.sf-map-fullscreen #view-map .mapTopBar {
          padding-left: 18px !important;
          padding-right: 86px !important;
        }

        body.sf-map-fullscreen #view-map .sf-map-legend {
          padding-left: 18px !important;
          padding-right: 18px !important;
        }

        body.sf-map-fullscreen #view-map .sf-map-help {
          padding-left: 18px !important;
          padding-right: 18px !important;
        }
      }

      /* V10: la MAPPA è davvero lo sfondo dell'intera schermata.
         I controlli galleggiano sopra senza togliere altezza al canvas. */
      body.sf-map-fullscreen #view-map .mapShell {
        position: absolute !important;
        inset: 0 !important;
        display: block !important;
        overflow: hidden !important;
      }

      body.sf-map-fullscreen #mapMain {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        min-height: 100% !important;
        z-index: 1 !important;
      }

      /* Nasconde titolo e descrizione grandi: la mappa parte da subito sotto
         la barra di stato / bordo superiore del browser. */
      body.sf-map-fullscreen #view-map .mapTopBar > div:first-child {
        display: none !important;
      }

      body.sf-map-fullscreen #view-map .mapTopBar {
        position: absolute !important;
        top: max(10px, env(safe-area-inset-top)) !important;
        left: 10px !important;
        right: 74px !important;
        width: auto !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        background: transparent !important;
        border: 0 !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        z-index: 1300 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: flex-start !important;
        gap: 8px !important;
      }

      /* Il bottone Sincronizza diventa compatto e flottante. */
      body.sf-map-fullscreen #view-map .mapTopBar button,
      body.sf-map-fullscreen #view-map .mapTopBar .btn {
        min-height: 46px !important;
        padding: 10px 13px !important;
        border-radius: 15px !important;
        background: rgba(7,17,31,.88) !important;
        border: 1px solid rgba(255,255,255,.18) !important;
        box-shadow: 0 8px 24px rgba(0,0,0,.30) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
      }

      /* Filtro e Inquadra: flottanti sopra la mappa. */
      body.sf-map-fullscreen #mapCategoryFilter {
        position: absolute !important;
        top: calc(max(10px, env(safe-area-inset-top)) + 58px) !important;
        left: 10px !important;
        z-index: 1295 !important;
        width: min(285px, calc(100vw - 158px)) !important;
        min-height: 46px !important;
        margin: 0 !important;
        border-radius: 15px !important;
        background: rgba(7,17,31,.90) !important;
        border: 1px solid rgba(255,255,255,.18) !important;
        box-shadow: 0 8px 24px rgba(0,0,0,.30) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
      }

      body.sf-map-fullscreen #btnMapFit {
        position: absolute !important;
        top: calc(max(10px, env(safe-area-inset-top)) + 58px) !important;
        right: 10px !important;
        z-index: 1296 !important;
        min-height: 46px !important;
        margin: 0 !important;
        padding: 10px 13px !important;
        border-radius: 15px !important;
        background: rgba(7,17,31,.90) !important;
        border: 1px solid rgba(255,255,255,.18) !important;
        box-shadow: 0 8px 24px rgba(0,0,0,.30) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
      }

      /* La riga che contiene filtro/inquadra non deve occupare spazio.
         Gli elementi interni sono già assoluti. */
      body.sf-map-fullscreen #view-map .mapShell > .row {
        position: static !important;
        height: 0 !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      /* Legenda piccola flottante in basso, sopra Leaflet attribution. */
      body.sf-map-fullscreen #view-map .sf-map-legend {
        position: absolute !important;
        left: 10px !important;
        bottom: max(42px, calc(env(safe-area-inset-bottom) + 36px)) !important;
        z-index: 1280 !important;
        max-width: calc(100vw - 20px) !important;
        margin: 0 !important;
        padding: 6px !important;
        gap: 4px !important;
        border-radius: 14px !important;
        background: rgba(7,17,31,.76) !important;
        border: 1px solid rgba(255,255,255,.14) !important;
        box-shadow: 0 8px 24px rgba(0,0,0,.25) !important;
        backdrop-filter: blur(10px) !important;
        -webkit-backdrop-filter: blur(10px) !important;
      }

      body.sf-map-fullscreen #view-map .sf-map-legend-item {
        padding: 5px 7px !important;
        font-size: 10px !important;
      }

      /* Il testo guida non occupa più una fascia intera. */
      body.sf-map-fullscreen #view-map .sf-map-help {
        display: none !important;
      }

      /* Pulsante chiusura più compatto sopra la mappa. */
      body.sf-map-fullscreen #sfMapFullscreenClose {
        width: 50px !important;
        height: 50px !important;
        border-radius: 15px !important;
        background: rgba(7,17,31,.90) !important;
      }

      /* Leaflet controls devono restare utilizzabili sotto i comandi superiori. */
      body.sf-map-fullscreen #mapMain .leaflet-top {
        top: 118px !important;
      }

      /* PC: controlli compatti in una sola fascia. */
      @media (min-width: 900px) {
        body.sf-map-fullscreen #view-map .mapTopBar {
          left: 14px !important;
          right: 78px !important;
        }

        body.sf-map-fullscreen #mapCategoryFilter {
          top: max(10px, env(safe-area-inset-top)) !important;
          left: 170px !important;
          width: 280px !important;
        }

        body.sf-map-fullscreen #btnMapFit {
          top: max(10px, env(safe-area-inset-top)) !important;
          left: 462px !important;
          right: auto !important;
        }

        body.sf-map-fullscreen #mapMain .leaflet-top {
          top: 68px !important;
        }
      }

      /* V11: controlli minimali. I menu visibili diventano pannelli apribili. */
      body.sf-map-fullscreen #view-map .mapTopBar button,
      body.sf-map-fullscreen #view-map .mapTopBar .btn,
      body.sf-map-fullscreen #view-map .mapShell > .row,
      body.sf-map-fullscreen #view-map .sf-map-legend,
      body.sf-map-fullscreen #view-map .sf-map-help,
      body.sf-map-fullscreen #mapCategoryFilter,
      body.sf-map-fullscreen #btnMapFit {
        display: none !important;
      }

      /* Il filtro originale resta nel DOM solo come sorgente dati per il menu laterale,
         ma non deve mai occupare spazio nella mappa fullscreen. */
      body.sf-map-fullscreen #mapCategoryFilter {
        position: fixed !important;
        left: -9999px !important;
        top: -9999px !important;
        width: 1px !important;
        height: 1px !important;
        min-height: 0 !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }

      #sfMapMenuToggle,
      #sfMapInfoToggle {
        position: fixed;
        z-index: 900120;
        display: none;
        width: 50px;
        height: 50px;
        border-radius: 15px;
        border: 1px solid rgba(255,255,255,.18);
        background: rgba(7,17,31,.90);
        color: #fff;
        box-shadow: 0 10px 28px rgba(0,0,0,.32);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        align-items: center;
        justify-content: center;
        font-weight: 1000;
      }

      body.sf-map-fullscreen #sfMapMenuToggle,
      body.sf-map-fullscreen #sfMapInfoToggle {
        display: flex;
      }

      #sfMapMenuToggle {
        top: max(10px, env(safe-area-inset-top));
        left: max(10px, env(safe-area-inset-left));
        font-size: 24px;
      }

      #sfMapInfoToggle {
        bottom: max(76px, calc(env(safe-area-inset-bottom) + 70px));
        left: max(10px, env(safe-area-inset-left));
        font-size: 24px;
        font-family: Georgia, serif;
      }

      #sfMapMenuBackdrop {
        position: fixed;
        inset: 0;
        z-index: 900105;
        display: none;
        background: rgba(0,0,0,.26);
      }

      body.sf-map-menu-open #sfMapMenuBackdrop {
        display: block;
      }

      #sfMapSideMenu {
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        z-index: 900110;
        width: min(320px, calc(100vw - 36px));
        padding: max(14px, env(safe-area-inset-top)) 14px calc(16px + env(safe-area-inset-bottom));
        background: rgba(7,17,31,.96);
        border-right: 1px solid rgba(255,255,255,.12);
        box-shadow: 24px 0 48px rgba(0,0,0,.34);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        transform: translateX(-110%);
        transition: transform .22s ease;
        overflow-y: auto;
      }

      body.sf-map-menu-open #sfMapSideMenu {
        transform: translateX(0);
      }

      .sf-map-side-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 14px;
      }

      .sf-map-side-title {
        font-size: 18px;
        font-weight: 1000;
        color: #fff;
      }

      .sf-map-side-close {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,.16);
        background: rgba(255,255,255,.06);
        color: #fff;
        font-size: 20px;
      }

      .sf-map-side-group {
        margin-bottom: 14px;
      }

      .sf-map-side-label {
        display: block;
        margin-bottom: 8px;
        color: #c9d4f4;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: .25px;
      }

      .sf-map-side-select {
        width: 100%;
        min-height: 46px;
        padding: 11px 12px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,.14);
        background: rgba(255,255,255,.06);
        color: #fff;
      }

      .sf-map-side-actions {
        display: grid;
        gap: 10px;
        grid-template-columns: 1fr;
      }

      .sf-map-side-actions .btn {
        justify-content: center !important;
      }

      .sf-map-side-divider {
        height: 1px;
        margin: 16px 0 14px;
        background: rgba(255,255,255,.10);
      }

      .sf-map-side-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .sf-map-side-pill {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 8px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.06);
        color: #fff;
        font-size: 12px;
        font-weight: 800;
      }

      .sf-map-side-pill i {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        display: inline-block;
      }

      #sfMapInfoBox {
        position: fixed;
        left: max(10px, env(safe-area-inset-left));
        right: max(10px, env(safe-area-inset-right));
        bottom: max(136px, calc(env(safe-area-inset-bottom) + 130px));
        z-index: 900115;
        display: none;
        max-width: 340px;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,.14);
        background: rgba(7,17,31,.94);
        box-shadow: 0 12px 32px rgba(0,0,0,.32);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        color: #fff;
      }

      body.sf-map-info-open #sfMapInfoBox {
        display: block;
      }

      .sf-map-info-title {
        font-size: 14px;
        font-weight: 1000;
        margin-bottom: 8px;
      }

      .sf-map-info-list {
        margin: 0;
        padding-left: 18px;
        color: #d5def8;
        font-size: 13px;
        line-height: 1.45;
      }

      @media (min-width: 900px) {
        #sfMapInfoBox {
          left: 14px;
          right: auto;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function ensureFullscreenCloseButton() {
    if (document.getElementById("sfMapFullscreenClose")) return;

    const button = document.createElement("button");
    button.id = "sfMapFullscreenClose";
    button.type = "button";
    button.setAttribute("aria-label", "Chiudi mappa a schermo intero");
    button.title = "Chiudi mappa";
    button.textContent = "✕";

    button.addEventListener("click", () => {
      toggleMapMenu(false);
      toggleMapInfo(false);
      location.hash = "#/";
    });

    document.body.appendChild(button);
  }

  function setMapFullscreen(active) {
    ensureFullscreenStyle();
    ensureFullscreenCloseButton();
    ensureMapMenuUi();

    const enabled = !!active;

    document.documentElement.classList.toggle(
      "sf-map-fullscreen-root",
      enabled
    );

    document.body.classList.toggle(
      "sf-map-fullscreen",
      enabled
    );

    if (!enabled) {
      toggleMapMenu(false);
      toggleMapInfo(false);
    } else {
      syncMapMenuUi();
    }

    // Leaflet deve ricalcolare la dimensione dopo il cambio layout.
    setTimeout(scheduleInvalidate, 0);
    setTimeout(scheduleInvalidate, 80);
    setTimeout(scheduleInvalidate, 260);
  }


  function ensureMapMenuUi() {
    ensureFullscreenStyle();

    if (!document.getElementById("sfMapMenuToggle")) {
      const btn = document.createElement("button");
      btn.id = "sfMapMenuToggle";
      btn.type = "button";
      btn.setAttribute("aria-label", "Apri menu mappa");
      btn.title = "Menu mappa";
      btn.innerHTML = "☰";
      btn.addEventListener("click", () => toggleMapMenu());
      document.body.appendChild(btn);
    }

    if (!document.getElementById("sfMapSideMenu")) {
      const panel = document.createElement("aside");
      panel.id = "sfMapSideMenu";
      panel.setAttribute("aria-hidden", "true");
      panel.innerHTML = `
        <div class="sf-map-side-head">
          <div class="sf-map-side-title">🗺️ Controlli mappa</div>
          <button type="button" class="sf-map-side-close" aria-label="Chiudi menu">✕</button>
        </div>

        <div class="sf-map-side-group">
          <label class="sf-map-side-label" for="sfMapSideFilter">Filtro punti</label>
          <select id="sfMapSideFilter" class="sf-map-side-select"></select>
        </div>

        <div class="sf-map-side-actions">
          <button type="button" id="sfMapSideFit" class="btn ghost">🎯 Inquadra</button>
          <button type="button" id="sfMapSideSync" class="btn ghost">🔄 Sincronizza</button>
        </div>

        <div class="sf-map-side-divider"></div>

        <div class="sf-map-side-label">Legenda</div>
        <div class="sf-map-side-legend">
          <span class="sf-map-side-pill"><i style="background:#ff5a5f"></i>Segnalazioni</span>
          <span class="sf-map-side-pill"><i style="background:#2d7dff"></i>Luoghi</span>
          <span class="sf-map-side-pill"><i style="background:#19c37d"></i>Attività</span>
          <span class="sf-map-side-pill"><i style="background:#f39c12"></i>In lavorazione</span>
          <span class="sf-map-side-pill"><i style="background:#19c37d"></i>Risolte</span>
        </div>
      `;
      document.body.appendChild(panel);

      panel.querySelector(".sf-map-side-close")?.addEventListener("click", () => toggleMapMenu(false));

      panel.querySelector("#sfMapSideFit")?.addEventListener("click", () => {
        try { document.getElementById("btnMapFit")?.click(); } catch {}
        toggleMapMenu(false);
      });

      panel.querySelector("#sfMapSideSync")?.addEventListener("click", () => {
        try {
          const candidates = [...document.querySelectorAll("#view-map .mapTopBar button, #view-map .mapTopBar .btn")];
          const syncBtn = candidates.find((el) => /sincron/i.test((el.textContent || "").trim()));
          syncBtn?.click();
        } catch {}
        toggleMapMenu(false);
      });

      panel.querySelector("#sfMapSideFilter")?.addEventListener("change", (event) => {
        const original = document.getElementById("mapCategoryFilter");
        if (!original) return;
        original.value = event.target.value;
        original.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }

    if (!document.getElementById("sfMapMenuBackdrop")) {
      const backdrop = document.createElement("div");
      backdrop.id = "sfMapMenuBackdrop";
      backdrop.addEventListener("click", () => toggleMapMenu(false));
      document.body.appendChild(backdrop);
    }

    if (!document.getElementById("sfMapInfoToggle")) {
      const info = document.createElement("button");
      info.id = "sfMapInfoToggle";
      info.type = "button";
      info.setAttribute("aria-label", "Spiegazioni mappa");
      info.title = "Spiegazioni";
      info.textContent = "i";
      info.addEventListener("click", () => toggleMapInfo());
      document.body.appendChild(info);
    }

    if (!document.getElementById("sfMapInfoBox")) {
      const box = document.createElement("div");
      box.id = "sfMapInfoBox";
      box.setAttribute("aria-hidden", "true");
      box.innerHTML = `
        <div class="sf-map-info-title">ℹ️ Come usare la mappa</div>
        <ul class="sf-map-info-list">
          <li>Tocca un PIN per vedere i dettagli.</li>
          <li>Tocca un gruppo numerato per aprire i punti vicini.</li>
          <li>Usa il menu ☰ per filtro, sincronizzazione e legenda.</li>
        </ul>
      `;
      document.body.appendChild(box);
    }

    syncMapMenuUi();
  }

  function syncMapMenuUi() {
    const original = document.getElementById("mapCategoryFilter");
    const mirror = document.getElementById("sfMapSideFilter");
    if (!original || !mirror) return;

    const currentValue = original.value;
    mirror.innerHTML = [...original.options].map((opt) =>
      `<option value="${safe(opt.value)}"${opt.value === currentValue ? " selected" : ""}>${safe(opt.textContent || opt.label || opt.value)}</option>`
    ).join("");
  }

  function toggleMapMenu(force) {
    const open = typeof force === "boolean" ? force : !state.menuOpen;

    // Prima di aprire il menu, aggiorna sempre le opzioni dal filtro originale.
    if (open) syncMapMenuUi();
    state.menuOpen = open;
    state.infoOpen = open ? false : state.infoOpen;

    document.body.classList.toggle("sf-map-menu-open", open);
    const panel = document.getElementById("sfMapSideMenu");
    const backdrop = document.getElementById("sfMapMenuBackdrop");
    panel?.setAttribute("aria-hidden", open ? "false" : "true");
    backdrop?.setAttribute("aria-hidden", open ? "false" : "true");

    if (open) syncMapMenuUi();
    if (open) toggleMapInfo(false);
  }

  function toggleMapInfo(force) {
    const open = typeof force === "boolean" ? force : !state.infoOpen;
    state.infoOpen = open;
    if (open) toggleMapMenu(false);

    document.body.classList.toggle("sf-map-info-open", open);
    const box = document.getElementById("sfMapInfoBox");
    box?.setAttribute("aria-hidden", open ? "false" : "true");
  }

  function addLegend() {
    const mapShell = document.querySelector("#view-map .mapShell");
    const topBar = mapShell?.querySelector(".mapTopBar");
    if (!mapShell || !topBar) return;

    if (!mapShell.querySelector(".sf-map-legend")) {
      const legend = document.createElement("div");
      legend.className = "sf-map-legend";
      legend.innerHTML = `
        <span class="sf-map-legend-item"><i class="sf-map-legend-dot" style="background:#ff5a5f"></i>Segnalazioni</span>
        <span class="sf-map-legend-item"><i class="sf-map-legend-dot" style="background:#2d7dff"></i>Luoghi</span>
        <span class="sf-map-legend-item"><i class="sf-map-legend-dot" style="background:#19c37d"></i>Attività</span>
        <span class="sf-map-legend-item"><i class="sf-map-legend-dot" style="background:#f39c12"></i>In lavorazione</span>
        <span class="sf-map-legend-item"><i class="sf-map-legend-dot" style="background:#19c37d"></i>Risolte</span>
      `;
      topBar.insertAdjacentElement("afterend", legend);
    }

    let help = mapShell.querySelector(".sf-map-help");
    if (!help) {
      const legend = mapShell.querySelector(".sf-map-legend");
      help = document.createElement("div");
      help.className = "sf-map-help";
      legend?.insertAdjacentElement("afterend", help);
    }

    if (help) {
      help.textContent = "Mappa V12: filtro spostato completamente nel menu laterale.";
    }
  }

  function ensureDetailOverlay() {
    if (document.getElementById("sfMapDetailOverlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "sfMapDetailOverlay";
    overlay.className = "sf-map-detail-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <div class="sf-map-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="sfMapDetailTitle">
        <div id="sfMapDetailContent"></div>
      </div>
    `;

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) window.sfCloseMapDetail?.();
    });

    document.body.appendChild(overlay);
  }

  function enhancePopup(marker, key) {
    const popup = marker.getPopup?.();
    if (!popup) return;

    let content = String(popup.getContent?.() || "");
    if (content.includes("sf-map-actions")) return;

    const entry = state.registry.get(key);
    if (!entry) return;

    const meta = typeMeta(entry.type);
    const openLabel =
      entry.type === "activity" ? "Apri attività" :
      entry.type === "place" ? "Apri scheda" :
      "Apri dettagli";

    content = `
      <div class="sf-map-popup-badge ${meta.className}">${meta.emoji} ${meta.label}</div>
      ${content}
      <div class="sf-map-actions">
        <button class="btn ghost small" type="button" onclick="sfOpenMapItem('${key}')">🔎 ${openLabel}</button>
        <button class="btn ghost small" type="button" onclick="sfShareMapItem('${key}')">📤 Condividi</button>
      </div>
    `;

    popup.setContent(content);
  }

  function registerMarker(marker) {
    const current = marker.getLatLng();
    marker.__sfIsCluster = false;
    marker.__sfOriginalLatLng = L.latLng(current.lat, current.lng);

    const type = classifyMarker(marker);
    const item = dataForMarker(type, marker.__sfOriginalLatLng);
    const title = markerTitle(type, item);
    const key = `sfm_${++state.counter}`;

    state.registry.set(key, {
      key,
      marker,
      type,
      item,
      title,
      lat: marker.__sfOriginalLatLng.lat,
      lng: marker.__sfOriginalLatLng.lng
    });

    marker.__sfType = type;
    marker.__sfKey = key;
    enhancePopup(marker, key);

    return marker;
  }

  function restoreOriginalPositions() {
    for (const marker of state.baseMarkers) {
      if (marker.__sfOriginalLatLng) {
        try { marker.setLatLng(marker.__sfOriginalLatLng); } catch {}
      }
    }
  }

  function clusterClass(markers) {
    const types = new Set(markers.map((marker) => marker.__sfType || "report"));
    return types.size === 1 ? [...types][0] : "mixed";
  }

  function highZoomKey(marker) {
    const p = marker.__sfOriginalLatLng || marker.getLatLng();
    return `${p.lat.toFixed(5)}:${p.lng.toFixed(5)}`;
  }

  function addHighZoomMarkers(map, layer, zoom) {
    const groups = new Map();

    for (const marker of state.baseMarkers) {
      const key = highZoomKey(marker);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(marker);
    }

    for (const markers of groups.values()) {
      if (markers.length === 1) {
        markers[0].addTo(layer);
        continue;
      }

      const center = markers[0].__sfOriginalLatLng || markers[0].getLatLng();
      const centerPoint = map.project(center, zoom);
      const perRing = 12;

      markers.forEach((marker, index) => {
        const ring = Math.floor(index / perRing);
        const firstInRing = ring * perRing;
        const countInRing = Math.min(perRing, markers.length - firstInRing);
        const indexInRing = index - firstInRing;
        const radius = 36 + ring * 30;
        const angle = (Math.PI * 2 * indexInRing / Math.max(1, countInRing)) - Math.PI / 2;

        const point = L.point(
          centerPoint.x + Math.cos(angle) * radius,
          centerPoint.y + Math.sin(angle) * radius
        );

        try { marker.setLatLng(map.unproject(point, zoom)); } catch {}
        marker.addTo(layer);
      });
    }
  }

  function renderClusters() {
    // IMPORTANTISSIMO: Leaflet può spostare leggermente la mappa (autoPan)
    // quando apre un popup. Quel movimento genera moveend/zoomend.
    // Se ricreassimo i layer in quel momento, il popup verrebbe chiuso subito.
    if (state.rebuilding || state.rendering || state.popupOpen) return;

    const map = getMainMap();
    const layer = getMainLayer();
    if (!map || !layer || !state.baseMarkers.length) return;

    state.rendering = true;

    try {
      restoreOriginalPositions();

      const zoom = map.getZoom();
      layer.clearLayers();

      if (zoom >= 17 || state.baseMarkers.length <= 1) {
        addHighZoomMarkers(map, layer, zoom);
        return;
      }

      const cellSize = zoom <= 12 ? 92 : zoom <= 14 ? 70 : zoom <= 15 ? 54 : 44;
      const groups = new Map();

      for (const marker of state.baseMarkers) {
        const pos = marker.__sfOriginalLatLng || marker.getLatLng();
        const point = map.project(pos, zoom);
        const key = `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(marker);
      }

      for (const markers of groups.values()) {
        if (markers.length === 1) {
          markers[0].addTo(layer);
          continue;
        }

        const center = markers.reduce((acc, marker) => {
          const pos = marker.__sfOriginalLatLng || marker.getLatLng();
          acc.lat += pos.lat;
          acc.lng += pos.lng;
          return acc;
        }, { lat: 0, lng: 0 });

        center.lat /= markers.length;
        center.lng /= markers.length;

        const kind = clusterClass(markers);
        const icon = L.divIcon({
          className: "sf-map-cluster-wrap",
          html: `<div class="sf-map-cluster ${kind}" title="${markers.length} punti">${markers.length}</div>`,
          iconSize: [46, 46],
          iconAnchor: [23, 23]
        });

        const cluster = L.marker([center.lat, center.lng], {
          icon,
          keyboard: true,
          title: `${markers.length} punti vicini`
        });

        // Flag esplicito: non verrà MAI scambiato per un PIN reale.
        cluster.__sfIsCluster = true;

        cluster.on("click", () => {
          state.userViewLocked = true;
          window.__sfMapUserViewLocked = true;

          try { map.stop(); } catch {}

          const targetZoom = Math.min(
            18,
            Math.max(17, Number(map.getZoom() || 13) + 3)
          );

          map.setView(
            [center.lat, center.lng],
            targetZoom,
            { animate: true, duration: 0.20 }
          );

          setTimeout(renderClusters, 120);
          setTimeout(renderClusters, 280);
        });

        cluster.addTo(layer);
      }
    } finally {
      state.rendering = false;
    }
  }

  function captureRealMarkers() {
    const layer = getMainLayer();
    if (!layer) return;

    // IMPORTANTE:
    // questa funzione viene chiamata SOLO subito dopo originalRefreshPublicMaps().
    // Non usa il DOM per capire se un marker è cluster: usa il flag esplicito.
    const markers = layer.getLayers().filter((item) =>
      typeof item.getLatLng === "function" &&
      item.__sfIsCluster !== true
    );

    state.registry.clear();
    state.counter = 0;
    state.baseMarkers = markers.map(registerMarker);

    renderClusters();
  }

  function scheduleInvalidate() {
    const map = getMainMap();
    if (!map) return;

    [0, 40, 100, 220, 450].forEach((ms) => {
      setTimeout(() => {
        try {
          map.invalidateSize({ pan: false, animate: false });
        } catch {
          try { map.invalidateSize(); } catch {}
        }
      }, ms);
    });
  }

  function restoreView(center, zoom) {
    const map = getMainMap();
    if (!map || !center || !Number.isFinite(zoom)) return;

    try { map.stop(); } catch {}

    try {
      map.setView(center, zoom, { animate: false, reset: true });
    } catch {
      try { map.setView(center, zoom); } catch {}
    }
  }

  function attachMapListeners() {
    const map = getMainMap();
    if (!map || state.attachedMap === map) return;

    state.attachedMap = map;

    map.on("zoomend", () => {
      if (!state.rebuilding && !state.popupOpen) renderClusters();
    });

    map.on("moveend", () => {
      if (!state.rebuilding && !state.popupOpen) renderClusters();
    });

    map.on("resize", () => {
      if (!state.rebuilding && !state.popupOpen) renderClusters();
    });

    // Mantiene aperto il popup anche quando Leaflet esegue l'auto-pan.
    map.on("popupopen", (event) => {
      state.popupOpen = true;
      state.popupMarker = event?.popup?._source || null;
    });

    map.on("popupclose", () => {
      state.popupOpen = false;
      state.popupMarker = null;

      const hadPendingRefresh = state.pendingRefresh;
      const pendingArgs = state.pendingRefreshArgs;

      state.pendingRefresh = false;
      state.pendingRefreshArgs = null;

      // Se mentre il popup era aperto sono arrivati dati nuovi,
      // aggiorniamo solo DOPO la chiusura del popup.
      setTimeout(() => {
        if (hadPendingRefresh && typeof refreshPublicMaps === "function") {
          try { refreshPublicMaps(...(pendingArgs || [])); } catch {}
        } else {
          renderClusters();
        }
      }, 60);
    });

    map.on("dragstart", () => {
      state.userViewLocked = true;
      window.__sfMapUserViewLocked = true;
    });

    const container = map.getContainer?.();

    if (container) {
      container.addEventListener("pointerdown", () => {
        state.userViewLocked = true;
        window.__sfMapUserViewLocked = true;
      }, { passive: true });

      container.addEventListener("wheel", () => {
        state.userViewLocked = true;
        window.__sfMapUserViewLocked = true;
      }, { passive: true });

      if (typeof ResizeObserver !== "undefined") {
        try { state.resizeObserver?.disconnect(); } catch {}

        state.resizeObserver = new ResizeObserver(() => {
          if (mapVisible()) scheduleInvalidate();
        });

        state.resizeObserver.observe(container);
      }
    }
  }

  function workerBaseUrl() {
    try {
      if (typeof CONFIG !== "undefined" && CONFIG?.telegramWorkerUrl) {
        return String(CONFIG.telegramWorkerUrl).replace(/\/$/, "");
      }
    } catch {}

    return "https://segnalafacile-telegram.vocidicassino.workers.dev";
  }

  async function fastFetchPublicData(force = false) {
    if (!mapVisible() || document.visibilityState === "hidden") return;

    const now = Date.now();

    if (!force && now - state.lastFastFetch < 8000) return;
    if (state.refreshPromise) return state.refreshPromise;

    state.lastFastFetch = now;

    state.refreshPromise = (async () => {
      try {
        const response = await fetch(
          `${workerBaseUrl()}/api/public-data?t=${Date.now()}`,
          {
            method: "GET",
            cache: "no-store",
            headers: { "Cache-Control": "no-cache" }
          }
        );

        const data = await response.json();

        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || `HTTP ${response.status}`);
        }

        window.publicSegnalazioni = data.segnalazioni || [];
        window.publicLuoghi = data.luoghi || [];
        window.publicAttivita = data.attivita || [];

        // Ricostruzione completa usando i dati appena arrivati.
        if (typeof refreshPublicMaps === "function") {
          refreshPublicMaps();
        }

        // Geocodifica secondaria in background.
        try {
          if (typeof resolvePublicActivityCoordsForMap === "function") {
            Promise.resolve(resolvePublicActivityCoordsForMap())
              .then(() => {
                if (mapVisible() && typeof refreshPublicMaps === "function") {
                  refreshPublicMaps();
                }
              })
              .catch(() => {});
          }
        } catch {}
      } catch (error) {
        console.debug("[Segnala Facile V7] refresh rapido:", error);
      } finally {
        state.refreshPromise = null;
        scheduleInvalidate();
      }
    })();

    return state.refreshPromise;
  }

  function openMapNow(forceNetwork = true) {
    if (!mapVisible()) return;

    try {
      if (typeof ensureMaps === "function") ensureMaps();
    } catch {}

    attachMapListeners();
    addLegend();
    ensureDetailOverlay();
    scheduleInvalidate();

    // Ricostruisce subito i PIN dai dati già in memoria.
    try {
      if (typeof refreshPublicMaps === "function") refreshPublicMaps();
    } catch {}

    // All'ingresso nella Mappa forza un controllo reale del Worker.
    fastFetchPublicData(forceNetwork);
  }

  function scheduleOpenMap(forceNetwork = true) {
    clearTimeout(state.openTimer);

    state.openTimer = setTimeout(() => {
      openMapNow(forceNetwork);
    }, 20);
  }

  window.sfCloseMapDetail = function sfCloseMapDetail() {
    const overlay = document.getElementById("sfMapDetailOverlay");
    if (!overlay) return;

    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
  };

  window.sfOpenMapItem = function sfOpenMapItem(key) {
    const entry = state.registry.get(key);
    if (!entry) return;

    ensureDetailOverlay();

    const overlay = document.getElementById("sfMapDetailOverlay");
    const content = document.getElementById("sfMapDetailContent");
    if (!overlay || !content) return;

    const meta = typeMeta(entry.type);
    const description = markerDescription(entry.type, entry.item);
    const date = markerDate(entry.item);
    const category = entry.item.categoria || entry.item.category || "";
    const status = String(entry.item.status || "").toLowerCase();
    const images = photosOf(entry.item);

    const mapsUrl =
      `https://www.google.com/maps/search/?api=1&query=${entry.lat},${entry.lng}`;

    let statusLabel = "";

    if (status === "resolved") statusLabel = "✅ Risolta";
    else if (status === "in_progress") statusLabel = "🚧 In lavorazione";
    else if (entry.type === "report") statusLabel = "🔴 Aperta";

    let internalButton = "";

    if (entry.type === "activity" && entry.item.id) {
      internalButton =
        `<button class="btn primary" type="button" onclick="sfCloseMapDetail();openActivityDetail(${JSON.stringify(String(entry.item.id))})">🏪 Scheda attività completa</button>`;
    } else if (entry.type === "place") {
      const safeKey = String(entry.item.nome || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      if (safeKey) {
        internalButton =
          `<button class="btn primary" type="button" onclick="sfCloseMapDetail();openPlaceCard('${safeKey}')">⭐ Apri recensioni</button>`;
      }
    }

    content.innerHTML = `
      <div class="sf-map-detail-head">
        <div>
          <div class="sf-map-popup-badge ${meta.className}">${meta.emoji} ${meta.label}</div>
          <h2 id="sfMapDetailTitle">${safe(entry.title)}</h2>
          <div class="sf-map-detail-meta">
            ${category ? `<span class="pill">${safe(category)}</span>` : ""}
            ${statusLabel ? `<span class="pill">${safe(statusLabel)}</span>` : ""}
            ${date ? `<span class="pill">🗓️ ${safe(date)}</span>` : ""}
          </div>
        </div>
        <button class="sf-map-detail-close" type="button" onclick="sfCloseMapDetail()" aria-label="Chiudi">✕</button>
      </div>

      ${images.length
        ? `<div class="sf-map-detail-gallery">${images.map(
            (src) => `<img src="${safe(src)}" alt="" onclick="openImage(this.src)" loading="lazy">`
          ).join("")}</div>`
        : ""}

      <div class="sf-map-detail-text">${safe(description)}</div>

      <div class="sf-map-detail-buttons">
        ${internalButton}
        <a class="btn primary" href="${mapsUrl}" target="_blank" rel="noreferrer">🧭 Raggiungi</a>
        <button class="btn ghost" type="button" onclick="sfShareMapItem('${key}')">📤 Condividi</button>
      </div>
    `;

    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
  };

  window.sfShareMapItem = async function sfShareMapItem(key) {
    const entry = state.registry.get(key);
    if (!entry) return;

    const mapsUrl =
      `https://www.google.com/maps/search/?api=1&query=${entry.lat},${entry.lng}`;

    const text = `${entry.title}\n${mapsUrl}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: entry.title,
          text: `Guarda questo punto su Segnala Facile: ${entry.title}`,
          url: mapsUrl
        });
        return;
      }

      await navigator.clipboard.writeText(text);

      if (typeof showBanner === "function") {
        showBanner("success", "Link copiato negli appunti.");
      }
    } catch (error) {
      if (
        error?.name !== "AbortError" &&
        typeof showBanner === "function"
      ) {
        showBanner("error", "Condivisione non disponibile.");
      }
    }
  };

  function installEnhancements() {
    if (state.ready) return true;
    if (typeof L === "undefined") return false;
    if (
      typeof ensureMaps !== "function" ||
      typeof refreshPublicMaps !== "function"
    ) return false;

    state.originalEnsureMaps = ensureMaps;
    state.originalRefreshPublicMaps = refreshPublicMaps;

    const enhancedEnsureMaps = function enhancedEnsureMaps(...args) {
      // QUI NON CATTURIAMO I MARKER.
      // ensureMaps può essere chiamata mentre layerMain contiene ancora
      // cluster della schermata precedente.
      state.originalEnsureMaps(...args);

      addLegend();
      ensureDetailOverlay();
      attachMapListeners();
      scheduleInvalidate();
    };

    const enhancedRefreshPublicMaps =
      function enhancedRefreshPublicMaps(...args) {

        // Se l'utente sta leggendo un popup non tocchiamo layerMain:
        // refreshPublicMaps() fa clearLayers() e chiuderebbe il popup.
        // Conserviamo la richiesta e la eseguiamo appena il popup viene chiuso.
        if (state.popupOpen) {
          state.pendingRefresh = true;
          state.pendingRefreshArgs = args;
          scheduleInvalidate();
          return;
        }

        const map = getMainMap();

        const preserve =
          !!(map && mapVisible() && state.userViewLocked);

        const center = preserve ? map.getCenter() : null;
        const zoom = preserve ? map.getZoom() : null;

        // Blocca renderClusters durante il refresh originale:
        // fitBounds() può emettere moveend/zoomend mentre i nuovi PIN
        // sono appena stati creati. In V6 questo poteva cancellarli.
        state.rebuilding = true;

        try {
          state.originalRefreshPublicMaps(...args);
        } finally {
          state.rebuilding = false;
        }

        // Ora layerMain contiene i PIN REALI creati dalla funzione originale.
        // Li catturiamo subito, senza setTimeout e senza leggere il DOM.
        captureRealMarkers();

        if (preserve) {
          restoreView(center, zoom);
          requestAnimationFrame(() => {
            restoreView(center, zoom);
            renderClusters();
          });
        }

        addLegend();
        ensureDetailOverlay();
        attachMapListeners();
        scheduleInvalidate();
      };

    ensureMaps = enhancedEnsureMaps;
    refreshPublicMaps = enhancedRefreshPublicMaps;

    window.ensureMaps = enhancedEnsureMaps;
    window.refreshPublicMaps = enhancedRefreshPublicMaps;

    state.ready = true;

    window.__sfMapEnhancementsVersion = VERSION;

    document.addEventListener("click", (event) => {
      if (event.target?.closest?.("#btnMapFit")) {
        state.userViewLocked = false;
        window.__sfMapUserViewLocked = false;

        setTimeout(() => {
          try {
            if (typeof refreshPublicMaps === "function") {
              refreshPublicMaps();
            }
          } catch {}
        }, 0);
      }
    }, true);

    document.addEventListener("change", (event) => {
      if (event.target?.id === "mapCategoryFilter") {
        state.userViewLocked = false;
        window.__sfMapUserViewLocked = false;
        syncMapMenuUi();
      }
    }, true);

    window.addEventListener("hashchange", () => {
      const isMap = location.hash === "#/map";

      setMapFullscreen(isMap);

      if (isMap) {
        state.userViewLocked = false;
        window.__sfMapUserViewLocked = false;

        // Un solo ingresso controllato, senza due refresh concorrenti.
        scheduleOpenMap(true);
      }
    });

    window.addEventListener("pageshow", () => {
      if (mapVisible()) scheduleOpenMap(true);
    });

    window.addEventListener("focus", () => {
      if (mapVisible()) fastFetchPublicData(false);
    });

    window.addEventListener("online", () => {
      if (mapVisible()) fastFetchPublicData(true);
    });

    window.addEventListener("orientationchange", () => {
      if (mapVisible()) scheduleInvalidate();
    });

    window.addEventListener("resize", () => {
      if (mapVisible()) scheduleInvalidate();
    }, { passive: true });

    document.addEventListener("visibilitychange", () => {
      if (
        document.visibilityState === "visible" &&
        mapVisible()
      ) {
        scheduleInvalidate();
        fastFetchPublicData(false);
      }
    });

    const mapView = document.getElementById("view-map");

    if (mapView && typeof MutationObserver !== "undefined") {
      state.visibilityObserver = new MutationObserver(() => {
        if (mapVisible()) {
          // Il router cambia prima le classi e poi completa il layout.
          // Questo debounce evita refresh sovrapposti.
          scheduleOpenMap(true);
        }
      });

      state.visibilityObserver.observe(mapView, {
        attributes: true,
        attributeFilter: ["class", "style", "hidden"]
      });
    }

    state.periodicTimer = setInterval(() => {
      if (
        mapVisible() &&
        document.visibilityState === "visible"
      ) {
        fastFetchPublicData(false);
      }
    }, 30000);

    try {
      enhancedEnsureMaps();

      setMapFullscreen(location.hash === "#/map");

      if (mapVisible()) {
        scheduleOpenMap(true);
      }
    } catch {}

    console.info(
      "[Segnala Facile] Mappa reattiva attiva",
      VERSION
    );

    return true;
  }

  if (!installEnhancements()) {
    const timer = setInterval(() => {
      if (installEnhancements()) {
        clearInterval(timer);
      }
    }, 100);

    setTimeout(() => clearInterval(timer), 15000);
  }
})();
