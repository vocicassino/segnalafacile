/* Segnala Facile - Assistente testi contestuale
   Rimuove la scheda AI autonoma e porta gli strumenti utili nei moduli corretti.
*/
(() => {
  "use strict";

  const state = { initialized: false };

  const $ = (selector, root = document) => root.querySelector(selector);

  function clean(value) {
    return String(value ?? "")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function sentence(value) {
    let text = clean(value);
    if (!text) return "";
    text = text.charAt(0).toUpperCase() + text.slice(1);
    if (!/[.!?…]$/.test(text)) text += ".";
    return text;
  }

  function limit(value, max) {
    const text = clean(value);
    if (text.length <= max) return text;
    return text.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
  }

  function notify(message, type = "success") {
    try {
      if (typeof window.showBanner === "function") {
        window.showBanner(type, message);
        return;
      }
    } catch (_) {}
    alert(message);
  }

  function reportAnalysis(text) {
    const value = clean(text).toLowerCase();
    let category = "altro";
    let label = "Altro";
    let emoji = "❓";

    if (/rifiut|sporc|discaric|sacchett|cassonett|degrado|abbandonat/.test(value)) {
      category = "rifiuti"; label = "Rifiuti e decoro"; emoji = "🗑️";
    } else if (/lampion|illuminaz|buio|luce|cavo|elettric|quadro|corrente/.test(value)) {
      category = "luce"; label = "Illuminazione"; emoji = "💡";
    } else if (/buca|strad|marciapied|asfalt|caditoi|segnalet|incrocio|paviment/.test(value)) {
      category = "strade"; label = "Strade e marciapiedi"; emoji = "🛣️";
    } else if (/erba|alber|ramo|parco|verde|aiuol|vegetaz|potatur/.test(value)) {
      category = "verde"; label = "Verde pubblico"; emoji = "🌳";
    }

    let priority = "Media";
    if (/pericol|rischio|urgente|scopert|cadut|incidente|bambin|folgor|fiamma|voragine|croll/.test(value)) {
      priority = "Alta";
    } else if (/piccol|lieve|saltuari|occasionale/.test(value)) {
      priority = "Bassa";
    }

    return { category, label, emoji, priority };
  }

  function buildReportTitle(description, analysis) {
    const text = clean(description)
      .replace(/^si segnala(?: la presenza di| che| quanto segue:?)?\s*/i, "")
      .replace(/[.!?…]+$/g, "");
    const first = text.split(/[.!?\n]/)[0].trim();
    if (first && first.length >= 8) {
      return limit(first.charAt(0).toUpperCase() + first.slice(1), 80);
    }
    return limit(`Intervento richiesto: ${analysis.label}`, 80);
  }

  function improveReportText() {
    const title = $("#titolo");
    const description = $("#descrizione");
    if (!description) return;

    const original = clean(description.value);
    if (!original) {
      notify("Scrivi prima una breve descrizione del problema.", "error");
      description.focus();
      return;
    }

    const analysis = reportAnalysis(`${title?.value || ""} ${original}`);
    let core = sentence(original);
    core = core.replace(/^Si segnala quanto segue:\s*/i, "");

    const improved = limit(
      `Si segnala quanto segue: ${core}\n\nLa situazione richiede una verifica sul posto e, se confermata, un intervento tempestivo per ripristinare sicurezza, decoro e piena fruibilità dell’area.`,
      Number(description.maxLength || 700)
    );

    description.value = improved;
    description.dispatchEvent(new Event("input", { bubbles: true }));

    if (title && !clean(title.value)) {
      title.value = buildReportTitle(original, analysis);
      title.dispatchEvent(new Event("input", { bubbles: true }));
    }

    setReportAssistantStatus(`✅ Testo migliorato. Categoria suggerita: ${analysis.emoji} ${analysis.label} · Priorità ${analysis.priority}.`);
  }

  function suggestReportCategory() {
    const title = $("#titolo");
    const description = $("#descrizione");
    const category = $("#categoria");
    const analysis = reportAnalysis(`${title?.value || ""} ${description?.value || ""}`);
    if (category) {
      category.value = analysis.category;
      category.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setReportAssistantStatus(`${analysis.emoji} Categoria impostata su “${analysis.label}”. Priorità suggerita: ${analysis.priority}.`);
  }

  function setReportAssistantStatus(text) {
    const box = $("#sfReportAssistantStatus");
    if (!box) return;
    box.textContent = text;
    box.style.display = "block";
  }

  function installReportAssistant() {
    const description = $("#descrizione");
    if (!description || $("#sfReportTextAssistant")) return;

    const panel = document.createElement("div");
    panel.id = "sfReportTextAssistant";
    panel.className = "sf-text-assistant";
    panel.innerHTML = `
      <div class="sf-text-assistant-head">
        <div>
          <strong>✨ Assistente testi</strong>
          <span>Migliora la segnalazione senza aprire un’altra scheda.</span>
        </div>
      </div>
      <div class="sf-text-assistant-actions">
        <button class="btn primary small" id="sfImproveReportText" type="button">✨ Correggi e migliora il testo</button>
        <button class="btn ghost small" id="sfSuggestReportCategory" type="button">🏷️ Suggerisci categoria e priorità</button>
      </div>
      <div id="sfReportAssistantStatus" class="sf-text-assistant-status" aria-live="polite"></div>
    `;
    description.insertAdjacentElement("afterend", panel);
    $("#sfImproveReportText")?.addEventListener("click", improveReportText);
    $("#sfSuggestReportCategory")?.addEventListener("click", suggestReportCategory);
  }

  function activityName() {
    const raw = clean($("#activityEditorTitle")?.textContent || "");
    return raw && !/^scheda attività$/i.test(raw) ? raw : "La tua attività";
  }

  function improveActivityDescription() {
    const description = $("#activityEditDescrizione");
    if (!description) return;

    const name = activityName();
    const current = clean(description.value);
    const address = clean($("#activityEditIndirizzo")?.value || "");
    const offer = clean($("#activityEditOfferta")?.value || "");

    let body = current
      ? sentence(current)
      : `${name} è un’attività locale pensata per offrire un servizio curato, affidabile e vicino alle esigenze dei clienti.`;

    if (address && !body.toLowerCase().includes(address.toLowerCase())) {
      body += ` La sede si trova in ${address}.`;
    }
    if (offer) {
      body += ` In questo periodo è disponibile anche questa proposta: ${sentence(offer)}`;
    }
    body += " Contatta direttamente l’attività per informazioni, disponibilità e dettagli aggiornati.";

    description.value = limit(body, 1500);
    description.dispatchEvent(new Event("input", { bubbles: true }));
    notify("Descrizione professionale preparata. Controllala e poi salva la scheda.");
  }

  function buildSocialText() {
    const name = activityName();
    const description = clean($("#activityEditDescrizione")?.value || "");
    const address = clean($("#activityEditIndirizzo")?.value || "");
    const offer = clean($("#activityEditOfferta")?.value || "");

    const base = description || `${name}: qualità, disponibilità e attenzione al cliente.`;
    const facebook = [
      `✨ Scopri ${name}`,
      "",
      sentence(base),
      offer ? `\n🎁 ${sentence(offer)}` : "",
      address ? `\n📍 ${address}` : "",
      "\n📲 Trovi contatti e informazioni aggiornate su Segnala Facile."
    ].join("\n").replace(/\n{3,}/g, "\n\n").trim();

    const instagram = [
      `✨ ${name}`,
      sentence(base),
      offer ? `🎁 ${sentence(offer)}` : "",
      address ? `📍 ${address}` : "",
      "#SegnalaFacile #VocidiCassino #Cassino #AttivitaLocali"
    ].filter(Boolean).join("\n");

    return `POST FACEBOOK\n\n${facebook}\n\n--------------------\n\nCAPTION INSTAGRAM\n\n${instagram}`;
  }

  function generateActivitySocial() {
    openTextModal("📱 Post social pronto", buildSocialText());
  }

  function installActivityAssistant() {
    const editor = $("#activityEditorBox");
    if (!editor) return;

    let actions = editor.querySelector(".aiQuickActions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "aiQuickActions";
      editor.querySelector("label")?.insertAdjacentElement("beforebegin", actions);
    }
    if (actions.dataset.sfTextAssistant === "1") return;

    actions.dataset.sfTextAssistant = "1";
    actions.classList.add("sf-text-assistant", "sf-activity-assistant");
    actions.innerHTML = `
      <div class="sf-text-assistant-head">
        <div>
          <strong>✨ Assistente testi per l’attività</strong>
          <span>Prepara descrizioni e post usando i dati già inseriti.</span>
        </div>
      </div>
      <div class="sf-text-assistant-actions">
        <button class="btn primary small" id="sfImproveActivityDescription" type="button">✨ Crea descrizione professionale</button>
        <button class="btn ghost small" id="sfGenerateActivitySocial" type="button">📱 Genera post social</button>
      </div>
    `;

    $("#sfImproveActivityDescription")?.addEventListener("click", improveActivityDescription);
    $("#sfGenerateActivitySocial")?.addEventListener("click", generateActivitySocial);
  }

  function articleHashtags() {
    const title = clean($("#articleTitle")?.value || "");
    const category = clean($("#articleCategory")?.value || "");
    const tokens = `${title} ${category}`
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9àèéìòùÀÈÉÌÒÙ ]/g, " ")
      .split(/\s+/)
      .filter(word => word.length >= 5)
      .slice(0, 3)
      .map(word => `#${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`);
    return [...new Set(["#VocidiCassino", "#Cassino", "#SegnalaFacile", ...tokens])].join(" ");
  }

  function improveAdminArticle() {
    const title = $("#articleTitle");
    const description = $("#articleDesc");
    const content = $("#articleContent");
    if (!title || !content) return;

    let body = clean(content.value || description?.value || "");
    if (!body) {
      notify("Inserisci prima una descrizione o il testo dell’articolo.", "error");
      content.focus();
      return;
    }

    body = sentence(body);
    if (!/^A Cassino\b/i.test(body) && !/^Si /i.test(body)) {
      body = `A Cassino il tema merita attenzione e risposte concrete.\n\n${body}`;
    }
    if (!/Voci di Cassino continuerà/i.test(body)) {
      body += "\n\nVoci di Cassino continuerà a raccogliere segnalazioni, testimonianze e contributi, dando spazio ai problemi e alle proposte dei cittadini.";
    }
    content.value = body;
    content.dispatchEvent(new Event("input", { bubbles: true }));

    if (!clean(title.value)) {
      const first = clean(body).split(/[.!?\n]/)[0];
      title.value = limit(first || "Cassino, cittadini in attesa di risposte", 110);
    }
    if (description && !clean(description.value)) {
      description.value = limit(clean(body).split("\n\n")[0], 260);
    }
    notify("Titolo e articolo migliorati. Controlla il testo prima di salvare.");
  }

  function showAdminHashtags() {
    openTextModal("#️⃣ Hashtag suggeriti", articleHashtags());
  }

  function installAdminArticleAssistant() {
    const content = $("#articleContent");
    if (!content || $("#sfAdminArticleAssistant")) return;

    const panel = document.createElement("div");
    panel.id = "sfAdminArticleAssistant";
    panel.className = "sf-text-assistant";
    panel.innerHTML = `
      <div class="sf-text-assistant-head">
        <div>
          <strong>✨ Assistente testi articolo</strong>
          <span>Rifinisce il contenuto senza collegamenti esterni.</span>
        </div>
      </div>
      <div class="sf-text-assistant-actions">
        <button type="button" id="sfImproveAdminArticle">✨ Migliora titolo e articolo</button>
        <button type="button" id="sfAdminArticleHashtags">#️⃣ Genera hashtag</button>
      </div>
    `;
    content.insertAdjacentElement("afterend", panel);
    $("#sfImproveAdminArticle")?.addEventListener("click", improveAdminArticle);
    $("#sfAdminArticleHashtags")?.addEventListener("click", showAdminHashtags);
  }

  function ensureTextModal() {
    if ($("#sfTextAssistantModal")) return;
    const overlay = document.createElement("div");
    overlay.id = "sfTextAssistantModal";
    overlay.className = "sf-text-modal";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <div class="sf-text-modal-card" role="dialog" aria-modal="true" aria-labelledby="sfTextModalTitle">
        <div class="sf-text-modal-head">
          <strong id="sfTextModalTitle">Testo pronto</strong>
          <button type="button" id="sfTextModalClose" aria-label="Chiudi">✕</button>
        </div>
        <textarea id="sfTextModalContent" readonly></textarea>
        <div class="sf-text-modal-actions">
          <button type="button" id="sfTextModalCopy">📋 Copia testo</button>
          <button type="button" id="sfTextModalCloseBottom">Chiudi</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
      overlay.classList.remove("open");
      overlay.setAttribute("aria-hidden", "true");
    };
    $("#sfTextModalClose")?.addEventListener("click", close);
    $("#sfTextModalCloseBottom")?.addEventListener("click", close);
    overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
    $("#sfTextModalCopy")?.addEventListener("click", async () => {
      const text = $("#sfTextModalContent")?.value || "";
      try {
        await navigator.clipboard.writeText(text);
        notify("Testo copiato negli appunti.");
      } catch (_) {
        const field = $("#sfTextModalContent");
        field?.focus();
        field?.select();
        document.execCommand("copy");
        notify("Testo copiato negli appunti.");
      }
    });
  }

  function openTextModal(title, text) {
    ensureTextModal();
    $("#sfTextModalTitle").textContent = title;
    $("#sfTextModalContent").value = clean(text);
    const overlay = $("#sfTextAssistantModal");
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
  }

  function removeStandaloneAi() {
    document.querySelectorAll('nav.bottom a[data-nav="ai"], a[href="#/ai"]').forEach(link => link.remove());
    const view = $("#view-ai");
    if (view) {
      view.classList.add("hidden");
      view.setAttribute("aria-hidden", "true");
    }
    if (/^#\/ai(?:$|[/?])/i.test(location.hash)) {
      location.hash = "#/report";
    }
  }

  function initialize() {
    removeStandaloneAi();
    installReportAssistant();
    installActivityAssistant();
    installAdminArticleAssistant();
    ensureTextModal();
    state.initialized = true;
  }

  document.addEventListener("DOMContentLoaded", initialize, { once: true });
  window.addEventListener("hashchange", () => {
    removeStandaloneAi();
    installReportAssistant();
    installActivityAssistant();
  });

  if (document.readyState !== "loading") initialize();
})();
