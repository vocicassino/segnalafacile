/* Segnala Facile - miglioramenti mappa pubblica
   Raggruppamento marker, legenda e schede complete.
*/
(() => {
  "use strict";

  const state = {
    originalEnsureMaps: null,
    originalRefreshPublicMaps: null,
    baseMarkers: [],
    registry: new Map(),
    counter: 0,
    attachedMap: null,
    ready: false
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

  const coordsOf = (item) => {
    if (!item) return null;
    const lat = number(item.lat ?? item.geo?.lat);
    const lng = number(item.lng ?? item.geo?.lng);
    if (lat === null || lng === null || (lat === 0 && lng === 0)) return null;
    return { lat, lng };
  };

  const distance = (a, b) => {
    if (!a || !b) return Infinity;
    return Math.abs(a.lat - b.lat) + Math.abs(a.lng - b.lng);
  };

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
    const latlng = marker.getLatLng();
    const popup = marker.getPopup();
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
    if (type === "activity") {
      return nearest(window.publicAttivita, latlng) || {};
    }
    if (type === "place") {
      return nearest(window.publicLuoghi, latlng) || {};
    }
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
    if (typeof raw === "object") {
      return [raw.dataUrl || raw.url].filter(Boolean);
    }
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
    if (type === "activity") {
      return item.descrizione || item.offerta || item.testo_offerta || "Scheda attività locale.";
    }
    if (type === "place") {
      return item.recensione || item.descrizione || item.description || item.testo || "Luogo consigliato dalla community.";
    }
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
    if (!mapShell || !topBar || mapShell.querySelector(".sf-map-legend")) return;

    const legend = document.createElement("div");
    legend.className = "sf-map-legend";
    legend.innerHTML = `
      <span class="sf-map-legend-item"><i class="sf-map-legend-dot" style="background:#ff5a5f"></i>Segnalazioni</span>
      <span class="sf-map-legend-item"><i class="sf-map-legend-dot" style="background:#2d7dff"></i>Luoghi</span>
      <span class="sf-map-legend-item"><i class="sf-map-legend-dot" style="background:#19c37d"></i>Attività</span>
      <span class="sf-map-legend-item"><i class="sf-map-legend-dot" style="background:#f39c12"></i>In lavorazione</span>
      <span class="sf-map-legend-item"><i class="sf-map-legend-dot" style="background:#19c37d"></i>Risolte</span>
    `;

    const help = document.createElement("div");
    help.className = "sf-map-help";
    help.textContent = "Tocca un gruppo numerato per avvicinarti. Tocca un singolo PIN per foto, descrizione, indicazioni e condivisione.";

    topBar.insertAdjacentElement("afterend", legend);
    legend.insertAdjacentElement("afterend", help);
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
      if (event.target === overlay) window.sfCloseMapDetail();
    });
    document.body.appendChild(overlay);
  }

  function registerMarker(marker) {
    const latlng = marker.getLatLng();
    const type = classifyMarker(marker);
    const item = dataForMarker(type, latlng);
    const title = markerTitle(type, item);
    const key = `sfm_${++state.counter}`;

    state.registry.set(key, {
      key,
      marker,
      type,
      item,
      title,
      lat: latlng.lat,
      lng: latlng.lng
    });

    enhancePopup(marker, key);
    marker.__sfType = type;
    marker.__sfKey = key;
    return marker;
  }

  function enhancePopup(marker, key) {
    const popup = marker.getPopup();
    if (!popup) return;

    let content = String(popup.getContent() || "");
    if (content.includes("sf-map-actions")) return;

    const entry = state.registry.get(key);
    if (!entry) return;

    const meta = typeMeta(entry.type);
    const openLabel = entry.type === "activity"
      ? "Apri attività"
      : entry.type === "place"
        ? "Apri scheda"
        : "Apri dettagli";

    const actions = `
      <div class="sf-map-actions">
        <button class="btn ghost small" type="button" onclick="sfOpenMapItem('${key}')">🔎 ${openLabel}</button>
        <button class="btn ghost small" type="button" onclick="sfShareMapItem('${key}')">📤 Condividi</button>
      </div>
    `;

    content = `
      <div class="sf-map-popup-badge ${meta.className}">${meta.emoji} ${meta.label}</div>
      ${content}
      ${actions}
    `;
    popup.setContent(content);
  }

  function clusterClass(markers) {
    const types = new Set(markers.map((marker) => marker.__sfType || "report"));
    return types.size === 1 ? [...types][0] : "mixed";
  }

  function renderClusters() {
    if (typeof mapMain === "undefined" || !mapMain || typeof layerMain === "undefined" || !layerMain) return;
    if (!state.baseMarkers.length) return;

    const zoom = mapMain.getZoom();
    layerMain.clearLayers();

    if (zoom >= 17 || state.baseMarkers.length <= 1) {
      state.baseMarkers.forEach((marker) => marker.addTo(layerMain));
      return;
    }

    const cellSize = zoom <= 12 ? 92 : zoom <= 14 ? 72 : 58;
    const groups = new Map();

    for (const marker of state.baseMarkers) {
      const point = mapMain.project(marker.getLatLng(), zoom);
      const key = `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(marker);
    }

    for (const markers of groups.values()) {
      if (markers.length === 1) {
        markers[0].addTo(layerMain);
        continue;
      }

      const center = markers.reduce((acc, marker) => {
        const pos = marker.getLatLng();
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

      cluster.on("click", () => {
        const nextZoom = Math.min(18, Math.max(zoom + 2, 15));
        mapMain.setView([center.lat, center.lng], nextZoom, { animate: true });
      });

      cluster.addTo(layerMain);
    }
  }

  function captureAndCluster() {
    if (typeof layerMain === "undefined" || !layerMain || typeof mapMain === "undefined" || !mapMain) return;

    const markers = layerMain.getLayers().filter((layer) => typeof layer.getLatLng === "function");
    if (!markers.length) {
      state.baseMarkers = [];
      return;
    }

    state.registry.clear();
    state.counter = 0;
    state.baseMarkers = markers.map(registerMarker);
    renderClusters();
  }

  function attachMapListeners() {
    if (typeof mapMain === "undefined" || !mapMain || state.attachedMap === mapMain) return;
    state.attachedMap = mapMain;
    mapMain.on("zoomend", renderClusters);
    mapMain.on("resize", renderClusters);
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
    const meta = typeMeta(entry.type);
    const description = markerDescription(entry.type, entry.item);
    const date = markerDate(entry.item);
    const category = entry.item.categoria || entry.item.category || "";
    const status = String(entry.item.status || "").toLowerCase();
    const images = photosOf(entry.item);
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${entry.lat},${entry.lng}`;

    let statusLabel = "";
    if (status === "resolved") statusLabel = "✅ Risolta";
    else if (status === "in_progress") statusLabel = "🚧 In lavorazione";
    else if (entry.type === "report") statusLabel = "🔴 Aperta";

    let internalButton = "";
    if (entry.type === "activity" && entry.item.id) {
      internalButton = `<button class="btn primary" type="button" onclick="sfCloseMapDetail();openActivityDetail(${JSON.stringify(String(entry.item.id))})">🏪 Scheda attività completa</button>`;
    } else if (entry.type === "place") {
      const safeKey = String(entry.item.nome || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      if (safeKey) {
        internalButton = `<button class="btn primary" type="button" onclick="sfCloseMapDetail();openPlaceCard('${safeKey}')">⭐ Apri recensioni</button>`;
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
      ${images.length ? `<div class="sf-map-detail-gallery">${images.map((src) => `<img src="${safe(src)}" alt="" onclick="openImage(this.src)" loading="lazy">`).join("")}</div>` : ""}
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

    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${entry.lat},${entry.lng}`;
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
      if (typeof showBanner === "function") showBanner("success", "Link copiato negli appunti.");
    } catch (error) {
      if (error?.name !== "AbortError" && typeof showBanner === "function") {
        showBanner("error", "Condivisione non disponibile.");
      }
    }
  };

  function installEnhancements() {
    if (state.ready) return true;
    if (typeof L === "undefined") return false;
    if (typeof ensureMaps !== "function" || typeof refreshPublicMaps !== "function") return false;

    state.originalEnsureMaps = ensureMaps;
    state.originalRefreshPublicMaps = refreshPublicMaps;

    const enhancedEnsureMaps = function enhancedEnsureMaps() {
      state.originalEnsureMaps();
      addLegend();
      ensureDetailOverlay();
      attachMapListeners();
      setTimeout(captureAndCluster, 0);
    };

    const enhancedRefreshPublicMaps = function enhancedRefreshPublicMaps() {
      state.originalRefreshPublicMaps();
      addLegend();
      ensureDetailOverlay();
      attachMapListeners();
      setTimeout(captureAndCluster, 0);
    };

    ensureMaps = enhancedEnsureMaps;
    refreshPublicMaps = enhancedRefreshPublicMaps;
    window.ensureMaps = enhancedEnsureMaps;
    window.refreshPublicMaps = enhancedRefreshPublicMaps;

    state.ready = true;
    addLegend();
    ensureDetailOverlay();

    try {
      enhancedEnsureMaps();
      enhancedRefreshPublicMaps();
    } catch {}

    return true;
  }

  if (!installEnhancements()) {
    const timer = setInterval(() => {
      if (installEnhancements()) clearInterval(timer);
    }, 120);

    setTimeout(() => clearInterval(timer), 12000);
  }
})();
