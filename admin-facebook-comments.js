/*
 * Segnala Facile - Commenti Facebook nell'admin
 * Da caricare DOPO lo script principale di admin.html.
 * Non espone i commenti nell'app pubblica: usa solo endpoint protetti X-Api-Key.
 */
(() => {
  "use strict";

  const STYLE_ID = "sf-facebook-comments-style";
  const ENHANCED_ATTR = "data-fb-comments-enhanced";
  let commentSummary = {};
  let summaryLoading = false;
  let lastSummaryAt = 0;
  let enhanceTimer = null;

  function getWorkerUrl() {
    try { return String(WORKER_URL || "").replace(/\/$/, ""); }
    catch { return ""; }
  }

  function getAdminKey() {
    try { return String(apiKey || ""); }
    catch { return ""; }
  }

  function getArticles() {
    try { return Array.isArray(allData?.articoli) ? allData.articoli : []; }
    catch { return []; }
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[ch]));
  }

  function formatDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return "data non disponibile";
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? raw : d.toLocaleString("it-IT");
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .fb-comments-btn{
        background:#1877f2!important;
        white-space:nowrap;
      }
      .fb-comments-panel{
        display:none;
        flex:1 0 100%;
        width:100%;
        box-sizing:border-box;
        margin-top:6px;
        padding:12px;
        border-radius:12px;
        border:1px solid rgba(24,119,242,.34);
        background:rgba(24,119,242,.07);
      }
      .fb-comments-panel.open{display:block;}
      .fb-comments-toolbar{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:8px;
        flex-wrap:wrap;
        margin-bottom:10px;
      }
      .fb-comments-title{font-weight:950;color:#fff;}
      .fb-comments-meta{font-size:11px;color:#a9b6db;margin-top:3px;line-height:1.4;}
      .fb-comments-status{
        color:#a9b6db;
        font-size:12px;
        line-height:1.45;
        padding:8px 10px;
        border-radius:9px;
        background:rgba(255,255,255,.04);
      }
      .fb-comments-error{
        color:#ffd0d1;
        border:1px solid rgba(255,77,79,.35);
        background:rgba(255,77,79,.09);
        padding:10px;
        border-radius:10px;
        font-size:12px;
        line-height:1.5;
      }
      .fb-comment-list{display:flex;flex-direction:column;gap:8px;}
      .fb-comment{
        border:1px solid rgba(255,255,255,.09);
        background:#070c18;
        border-radius:10px;
        padding:10px 11px;
      }
      .fb-comment.reply{
        margin-left:24px;
        border-left:3px solid rgba(24,119,242,.55);
        background:rgba(7,12,24,.82);
      }
      .fb-comment-head{
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:8px;
        flex-wrap:wrap;
        margin-bottom:5px;
      }
      .fb-comment-author{font-weight:900;color:#dce7ff;font-size:13px;}
      .fb-comment-date{color:#8391b5;font-size:11px;}
      .fb-comment-message{white-space:pre-wrap;word-break:break-word;color:#eaf0ff;font-size:13px;line-height:1.45;}
      .fb-comment-foot{margin-top:6px;color:#8391b5;font-size:11px;display:flex;gap:10px;flex-wrap:wrap;}
      .fb-comment-replies{display:flex;flex-direction:column;gap:7px;margin-top:7px;}
      .fb-comment-empty{color:#a9b6db;font-size:12px;padding:8px 0;}
      @media(max-width:700px){
        .fb-comment.reply{margin-left:12px;}
        .fb-comments-panel{padding:10px;}
      }
    `;
    document.head.appendChild(style);
  }

  function permissionMessage(error, hint = "") {
    const msg = String(error || "Errore sconosciuto");
    if (/permission|OAuth|#10|pages_read_user_content|pages_read_engagement/i.test(msg + " " + hint)) {
      return `${msg}\n\nPer leggere i commenti dei post della Pagina verifica che il nuovo Page Access Token includa pages_read_user_content e pages_read_engagement.`;
    }
    return hint ? `${msg}\n\n${hint}` : msg;
  }

  function countForArticle(articleId) {
    return Number(commentSummary?.[String(articleId)]?.total || 0);
  }

  function updateButtons() {
    document.querySelectorAll("[data-fb-comments-article]").forEach(btn => {
      const articleId = btn.getAttribute("data-fb-comments-article") || "";
      btn.textContent = `💬 Commenti (${countForArticle(articleId)})`;
    });
  }

  async function loadCommentSummary(force = false) {
    const key = getAdminKey();
    const worker = getWorkerUrl();
    if (!key || !worker || summaryLoading) return;
    if (!force && Date.now() - lastSummaryAt < 30000) return;

    summaryLoading = true;
    try {
      const res = await fetch(`${worker}/api/admin/facebook-comments-summary?t=${Date.now()}`, {
        headers: { "X-Api-Key": key }
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      commentSummary = data.summary || {};
      lastSummaryAt = Date.now();
      updateButtons();
    } catch (e) {
      console.warn("Riepilogo commenti Facebook non disponibile:", e);
    } finally {
      summaryLoading = false;
    }
  }

  function renderCommentNode(comment, childrenMap, depth = 0) {
    const id = String(comment.comment_id || "");
    const author = String(comment.author_name || "").trim() || "Utente Facebook";
    const message = String(comment.message || "").trim() || "(commento senza testo disponibile)";
    const likes = Number(comment.like_count || 0);
    const replies = childrenMap.get(id) || [];
    const permalink = String(comment.permalink_url || "").trim();

    return `
      <div class="fb-comment ${depth > 0 ? "reply" : ""}">
        <div class="fb-comment-head">
          <div class="fb-comment-author">👤 ${esc(author)}</div>
          <div class="fb-comment-date">${esc(formatDate(comment.created_time))}</div>
        </div>
        <div class="fb-comment-message">${esc(message)}</div>
        <div class="fb-comment-foot">
          ${likes > 0 ? `<span>👍 ${likes}</span>` : ""}
          ${replies.length ? `<span>↩️ ${replies.length} ${replies.length === 1 ? "risposta" : "risposte"}</span>` : ""}
          ${permalink ? `<a href="${esc(permalink)}" target="_blank" rel="noreferrer" style="color:#7fb1ff;">Apri su Facebook</a>` : ""}
        </div>
        ${replies.length ? `<div class="fb-comment-replies">${replies.map(r => renderCommentNode(r, childrenMap, depth + 1)).join("")}</div>` : ""}
      </div>
    `;
  }

  function renderComments(panel, data) {
    const comments = Array.isArray(data?.comments) ? data.comments : [];
    const byId = new Map(comments.map(c => [String(c.comment_id || ""), c]));
    const childrenMap = new Map();
    const roots = [];

    for (const c of comments) {
      const parent = String(c.parent_comment_id || "").trim();
      if (parent && byId.has(parent)) {
        if (!childrenMap.has(parent)) childrenMap.set(parent, []);
        childrenMap.get(parent).push(c);
      } else {
        roots.push(c);
      }
    }

    const sortFn = (a, b) => String(a.created_time || "").localeCompare(String(b.created_time || ""));
    roots.sort(sortFn);
    for (const arr of childrenMap.values()) arr.sort(sortFn);

    const lastSync = data?.lastSync?.completedAt ? formatDate(data.lastSync.completedAt) : "mai";
    const listHtml = roots.length
      ? roots.map(c => renderCommentNode(c, childrenMap, 0)).join("")
      : `<div class="fb-comment-empty">Nessun commento salvato per questo post.</div>`;

    panel.innerHTML = `
      <div class="fb-comments-toolbar">
        <div>
          <div class="fb-comments-title">💬 Commenti Facebook (${comments.length})</div>
          <div class="fb-comments-meta">Ultimo controllo Graph API: ${esc(lastSync)}</div>
        </div>
        <button type="button" class="btn-secondary" data-fb-comments-sync>🔄 Aggiorna commenti</button>
      </div>
      ${data?.lastError?.error ? `<div class="fb-comments-error" style="margin-bottom:9px;">${esc(permissionMessage(data.lastError.error))}</div>` : ""}
      <div class="fb-comment-list">${listHtml}</div>
    `;

    panel.dataset.loaded = "1";
    const syncBtn = panel.querySelector("[data-fb-comments-sync]");
    if (syncBtn) {
      syncBtn.addEventListener("click", () => {
        const articleId = panel.dataset.articleId || "";
        const facebookId = panel.dataset.facebookId || "";
        syncComments(articleId, facebookId, panel);
      });
    }
  }

  async function loadComments(articleId, facebookId, panel, force = false) {
    const key = getAdminKey();
    const worker = getWorkerUrl();
    if (!key || !worker) {
      panel.innerHTML = `<div class="fb-comments-error">Accedi prima al pannello admin.</div>`;
      return;
    }
    if (!force && panel.dataset.loaded === "1") return;

    panel.innerHTML = `<div class="fb-comments-status">⏳ Caricamento commenti...</div>`;
    try {
      const qs = new URLSearchParams({
        article_id: String(articleId || ""),
        facebook_id: String(facebookId || ""),
        t: String(Date.now())
      });
      const res = await fetch(`${worker}/api/admin/facebook-comments?${qs.toString()}`, {
        headers: { "X-Api-Key": key }
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      renderComments(panel, data);
    } catch (e) {
      panel.innerHTML = `<div class="fb-comments-error">${esc(permissionMessage(e?.message || e))}</div>`;
    }
  }

  async function syncComments(articleId, facebookId, panel) {
    const key = getAdminKey();
    const worker = getWorkerUrl();
    if (!key || !worker) return;

    panel.innerHTML = `<div class="fb-comments-status">⏳ Lettura dei commenti da Facebook tramite Graph API...</div>`;
    try {
      const res = await fetch(`${worker}/api/admin/facebook-comments-sync`, {
        method: "POST",
        headers: {
          "X-Api-Key": key,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          article_id: articleId,
          facebook_id: facebookId
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(permissionMessage(data?.error || `HTTP ${res.status}`, data?.hint || ""));
      }

      panel.dataset.loaded = "0";
      await loadCommentSummary(true);
      await loadComments(articleId, facebookId, panel, true);
    } catch (e) {
      panel.innerHTML = `
        <div class="fb-comments-error">${esc(permissionMessage(e?.message || e))}</div>
        <div style="margin-top:9px;"><button type="button" class="btn-secondary" data-fb-comments-retry>↩️ Riprova</button></div>
      `;
      panel.querySelector("[data-fb-comments-retry]")?.addEventListener("click", () => syncComments(articleId, facebookId, panel));
    }
  }

  function toggleComments(articleId, facebookId, panel, button) {
    const opening = !panel.classList.contains("open");
    panel.classList.toggle("open", opening);
    if (button) button.setAttribute("aria-expanded", opening ? "true" : "false");
    if (opening) loadComments(articleId, facebookId, panel, false);
  }

  function enhanceArticleRows() {
    injectStyles();
    const list = document.getElementById("articoliList");
    if (!list) return;

    const rows = Array.from(list.querySelectorAll(".article-row"));
    const articles = getArticles();
    if (!rows.length || !articles.length) return;

    rows.forEach((row, index) => {
      const article = articles[index];
      if (!article?.facebook_id) return;

      const articleId = String(article.id || "");
      const facebookId = String(article.facebook_id || "");
      if (!articleId || !facebookId) return;

      let button = row.querySelector(`[data-fb-comments-article="${CSS.escape(articleId)}"]`);
      let panel = row.querySelector(`.fb-comments-panel[data-article-id="${CSS.escape(articleId)}"]`);

      if (!button) {
        const actions = row.querySelector(".article-admin-actions");
        if (!actions) return;
        button = document.createElement("button");
        button.type = "button";
        button.className = "fb-comments-btn";
        button.setAttribute("data-fb-comments-article", articleId);
        button.setAttribute("aria-expanded", "false");
        button.textContent = `💬 Commenti (${countForArticle(articleId)})`;
        actions.insertBefore(button, actions.firstChild);
      }

      if (!panel) {
        panel = document.createElement("div");
        panel.className = "fb-comments-panel";
        panel.dataset.articleId = articleId;
        panel.dataset.facebookId = facebookId;
        panel.dataset.loaded = "0";
        panel.innerHTML = `<div class="fb-comments-status">Apri per vedere i commenti Facebook di questo post.</div>`;
        row.appendChild(panel);
      }

      if (row.getAttribute(ENHANCED_ATTR) !== "1") {
        button.addEventListener("click", () => toggleComments(articleId, facebookId, panel, button));
        row.setAttribute(ENHANCED_ATTR, "1");
      }
    });

    loadCommentSummary(false);
  }

  function scheduleEnhance() {
    clearTimeout(enhanceTimer);
    enhanceTimer = setTimeout(enhanceArticleRows, 80);
  }

  function init() {
    injectStyles();
    const list = document.getElementById("articoliList");
    if (list) {
      const observer = new MutationObserver(scheduleEnhance);
      observer.observe(list, { childList: true, subtree: true });
    }
    scheduleEnhance();

    // Rileggiamo solo il riepilogo D1 ogni minuto mentre l'admin è aperto.
    // Non effettua chiamate Graph API e quindi non appesantisce Meta.
    setInterval(() => loadCommentSummary(true), 60000);
  }

  // Esponiamo anche i comandi per eventuali pulsanti futuri.
  window.loadFacebookCommentSummary = () => loadCommentSummary(true);
  window.refreshFacebookCommentsAdmin = enhanceArticleRows;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
