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

  const VERSION = "2026-08-22.7";

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
    openTimer: null
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
      help.textContent = "Mappa V7: i punti vengono caricati automaticamente. Tocca un gruppo numerato per aprirlo.";
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
    if (state.rebuilding || state.rendering) return;

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
      if (!state.rebuilding) renderClusters();
    });

    map.on("moveend", () => {
      if (!state.rebuilding) renderClusters();
    });

    map.on("resize", () => {
      if (!state.rebuilding) renderClusters();
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
      }
    }, true);

    window.addEventListener("hashchange", () => {
      if (location.hash === "#/map") {
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
