/* Segnala Facile - LIVE / Chat V3
   Chat full-screen stile app di messaggistica.
*/
(() => {
  'use strict';

  const VERSION = '2026-08-23.3';
  const state = {
    installed: false,
    pollTimer: null,
    observer: null,
    onlineObserver: null,
    unread: 0,
    lastId: '',
    wasNearBottom: true
  };

  function chatOpen() {
    return location.hash === '#/chat';
  }

  function ensureLiveNav() {
    const mapLink = document.querySelector('nav a[data-nav="map"]');
    if (!mapLink) return;
    const host = mapLink.parentElement;
    let link = host.querySelector('a[data-nav="chat"]');

    if (!link) {
      link = document.createElement('a');
      link.href = '#/chat';
      link.dataset.nav = 'chat';
      link.setAttribute('aria-label', 'Live');
      link.innerHTML = '<span class="navEmoji">💬</span><span>Live</span><span class="sf-live-nav-badge" aria-label="Utenti online"></span>';
      host.insertBefore(link, mapLink);
    } else if (!link.querySelector('.sf-live-nav-badge')) {
      link.insertAdjacentHTML('beforeend', '<span class="sf-live-nav-badge" aria-label="Utenti online"></span>');
    }
    link.classList.add('sf-live-nav');
  }

  function markOriginalHeader(section) {
    const card = section.querySelector(':scope > .card');
    if (!card) return;
    const first = card.firstElementChild;
    if (first && !first.classList.contains('sf-live-header')) {
      first.classList.add('sf-live-original-head');
    }
    [...card.querySelectorAll('div')].forEach((el) => {
      const text = (el.textContent || '').trim();
      if (text.includes('Non inserire dati sensibili') && text.length < 300) {
        el.classList.add('sf-live-safety');
      }
    });
  }

  function ensureHeader(section) {
    const card = section.querySelector(':scope > .card');
    if (!card) return;

    let header = card.querySelector('.sf-live-header');
    if (!header) {
      header = document.createElement('div');
      header.className = 'sf-live-header';
      header.innerHTML = '<button type="button" class="sf-live-back" aria-label="Torna indietro">‹</button><div class="sf-live-head-main"><div class="sf-live-title">💬 Chat di Cassino</div><div class="sf-live-subtitle">Conversazione in tempo reale della community</div></div><div class="sf-live-head-right"><div class="sf-live-online"><span class="sf-live-online-dot"></span><span><b id="sfLiveOnlineCount">0</b> online</span></div></div>';
      card.prepend(header);
      const back = header.querySelector('.sf-live-back');
      if (back) back.addEventListener('click', () => { location.hash = '#/'; });
    }
  }

  function decorateMessages() {
    const box = document.getElementById('chatMessages');
    if (!box) return;
    [...box.querySelectorAll('.chatMsg')].forEach((msg) => {
      if (msg.dataset.sfLiveDecorated === '1') return;
      msg.dataset.sfLiveDecorated = '1';
      const name = msg.querySelector('.chatMeta span');
      const nickname = (name && name.textContent || '').trim();
      if (/^voci di cassino$/i.test(nickname)) {
        msg.classList.add('sf-live-admin');
        if (name && !msg.querySelector('.sf-live-admin-badge')) {
          name.insertAdjacentHTML('afterend', '<span class="sf-live-admin-badge">ADMIN</span>');
        }
      }
    });
  }

  function sectionChip() {
    return document.querySelector('#view-chat .sf-live-new-chip');
  }

  function ensureNewMessagesChip(section) {
    if (section.querySelector('.sf-live-new-chip')) return;
    const box = section.querySelector('#chatMessages');
    if (!box) return;

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'sf-live-new-chip';
    chip.textContent = '↓ Nuovi messaggi';
    chip.addEventListener('click', () => {
      box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
      chip.classList.remove('show');
      state.unread = 0;
      updateBadges();
    });

    const composer = section.querySelector('.chatComposer');
    if (composer && composer.parentNode) {
      composer.parentNode.insertBefore(chip, composer);
    } else {
      box.insertAdjacentElement('afterend', chip);
    }
  }

  function updateBadges() {
    const online = Math.max(0, Number(document.getElementById('chatOnlineCount')?.textContent || 0) || 0);
    const mirror = document.getElementById('sfLiveOnlineCount');
    if (mirror) mirror.textContent = String(online);

    const badge = document.querySelector('.sf-live-nav-badge');
    if (badge) {
      if (state.unread > 0) {
        badge.textContent = state.unread > 9 ? '9+' : String(state.unread);
        badge.title = state.unread + ' nuovi messaggi';
      } else {
        badge.textContent = online > 0 ? String(Math.min(online, 99)) : '';
        badge.title = online + ' utenti online';
      }
    }
  }

  function bindObservers() {
    const box = document.getElementById('chatMessages');
    if (box && !state.observer) {
      box.addEventListener('scroll', () => {
        const gap = box.scrollHeight - box.scrollTop - box.clientHeight;
        state.wasNearBottom = gap < 100;
        if (state.wasNearBottom) sectionChip()?.classList.remove('show');
      }, { passive: true });

      state.observer = new MutationObserver((mutations) => {
        let added = 0;
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (!(node instanceof Element)) continue;
            if (node.matches('.chatMsg')) added++;
            added += node.querySelectorAll('.chatMsg').length || 0;
          }
        }

        decorateMessages();
        if (!added) return;

        if (chatOpen()) {
          if (!state.wasNearBottom) {
            sectionChip()?.classList.add('show');
          } else {
            requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
          }
          state.unread = 0;
        } else {
          state.unread = Math.min(99, state.unread + added);
        }
        updateBadges();
      });
      state.observer.observe(box, { childList: true, subtree: true });
    }

    const online = document.getElementById('chatOnlineCount');
    if (online && !state.onlineObserver) {
      state.onlineObserver = new MutationObserver(updateBadges);
      state.onlineObserver.observe(online, { childList: true, subtree: true, characterData: true });
      updateBadges();
    }
  }

  function decorateSection() {
    const section = document.getElementById('view-chat');
    if (!section) return false;
    section.classList.add('sf-live-v3');
    markOriginalHeader(section);
    ensureHeader(section);
    ensureNewMessagesChip(section);
    bindObservers();
    decorateMessages();
    return true;
  }

  async function pollSummary() {
    try {
      if (typeof CONFIG === 'undefined' || !CONFIG?.telegramWorkerUrl) return;
      const url = String(CONFIG.telegramWorkerUrl).replace(/\/$/, '') + '/api/chat/public?limit=1&t=' + Date.now();
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.ok) return;

      const rows = Array.isArray(data.items) ? data.items : [];
      const latest = rows.length ? String(rows[rows.length - 1]?.id || rows[0]?.id || '') : '';
      const online = document.getElementById('chatOnlineCount');
      if (online) online.textContent = String(Number(data.online || 0));

      if (latest && state.lastId && latest !== state.lastId && !chatOpen()) {
        state.unread = Math.min(99, state.unread + 1);
      }
      if (latest) state.lastId = latest;
      updateBadges();
    } catch {}
  }

  function updateRouteMode() {
    document.body.classList.toggle('sf-live-chat-open', chatOpen());
    ensureLiveNav();
    decorateSection();
    if (chatOpen()) {
      state.unread = 0;
      updateBadges();
      setTimeout(() => {
        try { if (typeof loadChatMessages === 'function') loadChatMessages(true); } catch {}
        decorateSection();
      }, 80);
    }
  }

  function install() {
    if (state.installed) return;
    state.installed = true;

    ensureLiveNav();
    decorateSection();
    updateRouteMode();

    window.addEventListener('hashchange', updateRouteMode);
    window.addEventListener('pageshow', updateRouteMode);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        updateRouteMode();
        pollSummary();
      }
    });

    const bodyObserver = new MutationObserver(() => {
      ensureLiveNav();
      if (document.getElementById('view-chat')) decorateSection();
    });
    bodyObserver.observe(document.body, { childList: true, subtree: false });

    pollSummary();
    state.pollTimer = setInterval(pollSummary, 30000);

    window.__sfLiveEnhancementsVersion = VERSION;
    console.info('[Segnala Facile] Live V3 attiva', VERSION);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
