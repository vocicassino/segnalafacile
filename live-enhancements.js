/* Segnala Facile - LIVE V4
   Avatar, ricerca messaggi, separatori giorno, animazioni.
*/
(() => {
  "use strict";

  const VERSION = "2026-08-23.4";
  const state = {
    installed:false,
    pollTimer:null,
    observer:null,
    onlineObserver:null,
    unread:0,
    lastId:"",
    wasNearBottom:true
  };

  function chatOpen(){ return location.hash === "#/chat"; }

  function initials(name){
    const words = String(name || "U").trim().split(/\s+/).filter(Boolean);
    if(!words.length) return "U";
    return (words[0][0] + (words.length > 1 ? words[words.length-1][0] : "")).toUpperCase().slice(0,2);
  }

  function ensureLiveNav(){
    const mapLink = document.querySelector('nav a[data-nav="map"]');
    if(!mapLink) return;
    const host = mapLink.parentElement;
    let link = host.querySelector('a[data-nav="chat"]');

    if(!link){
      link = document.createElement("a");
      link.href = "#/chat";
      link.dataset.nav = "chat";
      link.setAttribute("aria-label","Live");
      link.innerHTML = '<span class="navEmoji">💬</span><span>Live</span><span class="sf-live-nav-badge"></span>';
      host.insertBefore(link,mapLink);
    } else if(!link.querySelector(".sf-live-nav-badge")){
      link.insertAdjacentHTML("beforeend",'<span class="sf-live-nav-badge"></span>');
    }
    link.classList.add("sf-live-nav");
  }

  function markOriginalHeader(section){
    const card = section.querySelector(":scope > .card");
    if(!card) return;
    const first = card.firstElementChild;
    if(first && !first.classList.contains("sf-live-header")) first.classList.add("sf-live-original-head");

    [...card.querySelectorAll("div")].forEach(el=>{
      const text = (el.textContent || "").trim();
      if(text.includes("Non inserire dati sensibili") && text.length < 300) el.classList.add("sf-live-safety");
    });
  }

  function ensureHeader(section){
    const card = section.querySelector(":scope > .card");
    if(!card || card.querySelector(".sf-live-header")) return;

    const header = document.createElement("div");
    header.className = "sf-live-header";
    header.innerHTML = `
      <button type="button" class="sf-live-back" aria-label="Torna indietro">‹</button>
      <div class="sf-live-head-main">
        <div class="sf-live-title">💬 Chat di Cassino</div>
        <div class="sf-live-subtitle">Community in tempo reale</div>
      </div>
      <div class="sf-live-head-right">
        <div class="sf-live-online"><span class="sf-live-online-dot"></span><span><b id="sfLiveOnlineCount">0</b> online</span></div>
        <button type="button" class="sf-live-search-toggle" aria-label="Cerca messaggi">⌕</button>
      </div>
    `;
    card.prepend(header);

    header.querySelector(".sf-live-back")?.addEventListener("click",()=>{ location.hash="#/"; });
    header.querySelector(".sf-live-search-toggle")?.addEventListener("click",()=>toggleSearch());
  }

  function ensureSearch(section){
    const card = section.querySelector(":scope > .card");
    if(!card || card.querySelector(".sf-live-searchbar")) return;

    const bar = document.createElement("div");
    bar.className = "sf-live-searchbar";
    bar.innerHTML = `
      <input id="sfLiveSearchInput" type="search" placeholder="Cerca nei messaggi..." autocomplete="off">
      <span id="sfLiveSearchCount" class="sf-live-search-count"></span>
      <button type="button" class="sf-live-search-close" aria-label="Chiudi ricerca">✕</button>
    `;

    const header = card.querySelector(".sf-live-header");
    header?.insertAdjacentElement("afterend",bar);

    bar.querySelector("#sfLiveSearchInput")?.addEventListener("input",applySearch);
    bar.querySelector(".sf-live-search-close")?.addEventListener("click",()=>toggleSearch(false));
  }

  function toggleSearch(force){
    const open = typeof force === "boolean" ? force : !document.body.classList.contains("sf-live-search-open");
    document.body.classList.toggle("sf-live-search-open",open);
    if(open){
      setTimeout(()=>document.getElementById("sfLiveSearchInput")?.focus(),50);
    } else {
      const input = document.getElementById("sfLiveSearchInput");
      if(input) input.value="";
      applySearch();
    }
  }

  function applySearch(){
    const box = document.getElementById("chatMessages");
    const input = document.getElementById("sfLiveSearchInput");
    const count = document.getElementById("sfLiveSearchCount");
    if(!box) return;

    const q = String(input?.value || "").trim().toLowerCase();
    let hits=0;

    box.querySelectorAll(".chatMsg").forEach(msg=>{
      const ok = !q || (msg.textContent || "").toLowerCase().includes(q);
      msg.classList.toggle("sf-live-search-hidden",!ok);
      msg.classList.toggle("sf-live-search-hit",!!q && ok);
      if(q && ok) hits++;
    });

    if(count) count.textContent = q ? `${hits} trovati` : "";
  }

  function parseMessageDate(msg){
    const time = msg.querySelector(".chatMeta time")?.getAttribute("datetime");
    if(time){
      const d = new Date(time);
      if(!Number.isNaN(d.getTime())) return d;
    }
    return null;
  }

  function formatDay(date){
    const today = new Date();
    const d0 = new Date(today.getFullYear(),today.getMonth(),today.getDate());
    const d1 = new Date(date.getFullYear(),date.getMonth(),date.getDate());
    const diff = Math.round((d0-d1)/86400000);
    if(diff===0) return "Oggi";
    if(diff===1) return "Ieri";
    return date.toLocaleDateString("it-IT",{day:"2-digit",month:"short",year:"numeric"});
  }

  function addDateSeparators(){
    const box = document.getElementById("chatMessages");
    if(!box) return;

    box.querySelectorAll(".sf-live-date-separator").forEach(el=>el.remove());

    let lastKey="";
    [...box.querySelectorAll(".chatMsg")].forEach(msg=>{
      const date = parseMessageDate(msg);
      if(!date) return;
      const key = `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;
      if(key===lastKey) return;
      lastKey=key;

      const sep=document.createElement("div");
      sep.className="sf-live-date-separator";
      sep.textContent=formatDay(date);
      msg.parentNode.insertBefore(sep,msg);
    });
  }

  function decorateMessages(){
    const box=document.getElementById("chatMessages");
    if(!box) return;

    [...box.querySelectorAll(".chatMsg")].forEach(msg=>{
      if(msg.dataset.sfLiveDecorated==="1") return;
      msg.dataset.sfLiveDecorated="1";

      const name=msg.querySelector(".chatMeta span");
      const nickname=(name?.textContent || "Utente").trim();

      const avatar=document.createElement("span");
      avatar.className="sf-live-avatar";
      avatar.textContent=initials(nickname);
      msg.appendChild(avatar);

      if(/^voci di cassino$/i.test(nickname)){
        msg.classList.add("sf-live-admin");
        if(name && !msg.querySelector(".sf-live-admin-badge")){
          name.insertAdjacentHTML("afterend",'<span class="sf-live-admin-badge">ADMIN</span>');
        }
      }
    });

    addDateSeparators();
    applySearch();
  }

  function ensureNewMessagesChip(section){
    if(section.querySelector(".sf-live-new-chip")) return;
    const box=section.querySelector("#chatMessages");
    if(!box) return;

    const chip=document.createElement("button");
    chip.type="button";
    chip.className="sf-live-new-chip";
    chip.textContent="↓ Nuovi messaggi";
    chip.addEventListener("click",()=>{
      box.scrollTo({top:box.scrollHeight,behavior:"smooth"});
      chip.classList.remove("show");
      state.unread=0;
      updateBadges();
    });

    const composer=section.querySelector(".chatComposer");
    if(composer?.parentNode) composer.parentNode.insertBefore(chip,composer);
  }

  function sectionChip(){ return document.querySelector("#view-chat .sf-live-new-chip"); }

  function updateBadges(){
    const online=Math.max(0,Number(document.getElementById("chatOnlineCount")?.textContent || 0)||0);
    const mirror=document.getElementById("sfLiveOnlineCount");
    if(mirror) mirror.textContent=String(online);

    const badge=document.querySelector(".sf-live-nav-badge");
    if(badge){
      if(state.unread>0){
        badge.textContent=state.unread>9?"9+":String(state.unread);
        badge.title=`${state.unread} nuovi messaggi`;
      }else{
        badge.textContent=online>0?String(Math.min(online,99)):"";
        badge.title=`${online} utenti online`;
      }
    }
  }

  function bindObservers(){
    const box=document.getElementById("chatMessages");
    if(box && !state.observer){
      box.addEventListener("scroll",()=>{
        const gap=box.scrollHeight-box.scrollTop-box.clientHeight;
        state.wasNearBottom=gap<100;
        if(state.wasNearBottom) sectionChip()?.classList.remove("show");
      },{passive:true});

      state.observer=new MutationObserver(mutations=>{
        let added=0;
        for(const mutation of mutations){
          for(const node of mutation.addedNodes){
            if(!(node instanceof Element)) continue;
            if(node.matches?.(".chatMsg")) added++;
            added += node.querySelectorAll?.(".chatMsg")?.length || 0;
          }
        }

        decorateMessages();

        if(added){
          if(chatOpen()){
            if(!state.wasNearBottom) sectionChip()?.classList.add("show");
            else requestAnimationFrame(()=>{box.scrollTop=box.scrollHeight});
            state.unread=0;
          }else{
            state.unread=Math.min(99,state.unread+added);
          }
          updateBadges();
        }
      });
      state.observer.observe(box,{childList:true,subtree:true});
    }

    const online=document.getElementById("chatOnlineCount");
    if(online && !state.onlineObserver){
      state.onlineObserver=new MutationObserver(updateBadges);
      state.onlineObserver.observe(online,{childList:true,subtree:true,characterData:true});
      updateBadges();
    }
  }

  function decorateSection(){
    const section=document.getElementById("view-chat");
    if(!section) return false;

    section.classList.remove("sf-live-v1","sf-live-v3");
    section.classList.add("sf-live-v4");
    markOriginalHeader(section);
    ensureHeader(section);
    ensureSearch(section);
    ensureNewMessagesChip(section);
    bindObservers();
    decorateMessages();
    return true;
  }

  async function pollSummary(){
    try{
      if(typeof CONFIG==="undefined" || !CONFIG?.telegramWorkerUrl) return;
      const url=`${String(CONFIG.telegramWorkerUrl).replace(/\/$/,"")}/api/chat/public?limit=1&t=${Date.now()}`;
      const res=await fetch(url,{cache:"no-store"});
      const data=await res.json();
      if(!res.ok || !data?.ok) return;

      const rows=Array.isArray(data.items)?data.items:[];
      const latest=rows.length?String(rows[rows.length-1]?.id || rows[0]?.id || ""):"";
      const online=document.getElementById("chatOnlineCount");
      if(online) online.textContent=String(Number(data.online || 0));

      if(latest && state.lastId && latest!==state.lastId && !chatOpen()) state.unread=Math.min(99,state.unread+1);
      if(latest) state.lastId=latest;
      updateBadges();
    }catch{}
  }

  function updateRouteMode(){
    document.body.classList.toggle("sf-live-chat-open",chatOpen());
    if(!chatOpen()){
      document.body.classList.remove("sf-live-search-open");
    }

    ensureLiveNav();
    decorateSection();

    if(chatOpen()){
      state.unread=0;
      updateBadges();
      setTimeout(()=>{
        try{ if(typeof loadChatMessages==="function") loadChatMessages(true); }catch{}
        decorateSection();
      },80);
    }
  }

  function install(){
    if(state.installed) return;
    state.installed=true;

    ensureLiveNav();
    decorateSection();
    updateRouteMode();

    addEventListener("hashchange",updateRouteMode);
    addEventListener("pageshow",updateRouteMode);
    document.addEventListener("visibilitychange",()=>{
      if(document.visibilityState==="visible"){
        updateRouteMode();
        pollSummary();
      }
    });

    const bodyObserver=new MutationObserver(()=>{
      ensureLiveNav();
      if(document.getElementById("view-chat")) decorateSection();
    });
    bodyObserver.observe(document.body,{childList:true,subtree:false});

    pollSummary();
    state.pollTimer=setInterval(pollSummary,30000);

    window.__sfLiveEnhancementsVersion=VERSION;
    console.info("[Segnala Facile] Live V4 attiva",VERSION);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})();
