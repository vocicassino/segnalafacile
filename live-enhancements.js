/* Segnala Facile - LIVE V5
   Vera UI stile Telegram/WeChat con composer compatto.
*/
(() => {
  "use strict";

  const VERSION = "2026-08-23.6";
  const state = {
    installed:false,
    pollTimer:null,
    observer:null,
    onlineObserver:null,
    unread:0,
    lastId:"",
    wasNearBottom:true,
    profileShownOnce:false
  };

  function chatOpen(){ return location.hash === "#/chat"; }

  function initials(name){
    const words=String(name||"U").trim().split(/\s+/).filter(Boolean);
    if(!words.length) return "U";
    return (words[0][0]+(words.length>1?words[words.length-1][0]:"")).toUpperCase().slice(0,2);
  }

  function ensureLiveNav(){
    const mapLink=document.querySelector('nav a[data-nav="map"]');
    if(!mapLink) return;
    const host=mapLink.parentElement;
    let link=host.querySelector('a[data-nav="chat"]');

    if(!link){
      link=document.createElement("a");
      link.href="#/chat";
      link.dataset.nav="chat";
      link.setAttribute("aria-label","Live");
      link.innerHTML='<span class="navEmoji">💬</span><span>Live</span><span class="sf-live-nav-badge"></span>';
      host.insertBefore(link,mapLink);
    }else if(!link.querySelector(".sf-live-nav-badge")){
      link.insertAdjacentHTML("beforeend",'<span class="sf-live-nav-badge"></span>');
    }
    link.classList.add("sf-live-nav");
  }

  function getNickname(){
    const original=document.getElementById("chatNickname");
    return String(original?.value || localStorage.getItem("sf_chat_nickname") || "").trim();
  }

  function updateHeaderSubtitle(){
    const el=document.querySelector(".sf-live-subtitle");
    if(!el) return;
    const nick=getNickname();
    el.textContent=nick ? `Tu: ${nick}` : "Tocca 👤 per scegliere il nickname";
  }

  function markOriginal(section){
    const card=section.querySelector(":scope > .card");
    if(!card) return;
    const first=card.firstElementChild;
    if(first && !first.classList.contains("sf-live-header")) first.classList.add("sf-live-original-head");

    [...card.querySelectorAll("div")].forEach(el=>{
      const t=(el.textContent||"").trim();
      if(t.includes("Non inserire dati sensibili") && t.length<350) el.classList.add("sf-live-safety");
    });
  }

  function ensureHeader(section){
    const card=section.querySelector(":scope > .card");
    if(!card || card.querySelector(".sf-live-header")) return;

    const header=document.createElement("div");
    header.className="sf-live-header";
    header.innerHTML=`
      <button type="button" class="sf-live-back" aria-label="Torna indietro">‹</button>
      <div class="sf-live-head-main">
        <div class="sf-live-title">💬 Chat di Cassino</div>
        <div class="sf-live-subtitle">Community in tempo reale</div>
      </div>
      <div class="sf-live-head-actions">
        <div class="sf-live-online"><span class="sf-live-online-dot"></span><span><b id="sfLiveOnlineCount">0</b> online</span></div>
        <button type="button" class="sf-live-search-toggle" aria-label="Cerca messaggi">⌕</button>
        <button type="button" class="sf-live-profile-toggle" aria-label="Profilo chat">👤</button>
      </div>
    `;
    card.prepend(header);

    header.querySelector(".sf-live-back")?.addEventListener("click",()=>{ location.hash="#/"; });
    header.querySelector(".sf-live-search-toggle")?.addEventListener("click",()=>toggleSearch());
    header.querySelector(".sf-live-profile-toggle")?.addEventListener("click",()=>toggleProfile(true));

    updateHeaderSubtitle();
  }

  function ensureSearch(section){
    const card=section.querySelector(":scope > .card");
    if(!card || card.querySelector(".sf-live-searchbar")) return;

    const bar=document.createElement("div");
    bar.className="sf-live-searchbar";
    bar.innerHTML=`
      <input id="sfLiveSearchInput" type="search" placeholder="Cerca nei messaggi..." autocomplete="off">
      <span id="sfLiveSearchCount" class="sf-live-search-count"></span>
      <button type="button" class="sf-live-search-close" aria-label="Chiudi ricerca">✕</button>
    `;
    card.querySelector(".sf-live-header")?.insertAdjacentElement("afterend",bar);

    bar.querySelector("#sfLiveSearchInput")?.addEventListener("input",applySearch);
    bar.querySelector(".sf-live-search-close")?.addEventListener("click",()=>toggleSearch(false));
  }

  function toggleSearch(force){
    const open=typeof force==="boolean"?force:!document.body.classList.contains("sf-live-search-open");
    document.body.classList.toggle("sf-live-search-open",open);
    if(open){
      document.body.classList.remove("sf-live-attach-open");
      setTimeout(()=>document.getElementById("sfLiveSearchInput")?.focus(),50);
    }else{
      const input=document.getElementById("sfLiveSearchInput");
      if(input) input.value="";
      applySearch();
    }
  }

  function applySearch(){
    const box=document.getElementById("chatMessages");
    const q=String(document.getElementById("sfLiveSearchInput")?.value||"").trim().toLowerCase();
    const count=document.getElementById("sfLiveSearchCount");
    if(!box) return;

    let hits=0;
    box.querySelectorAll(".chatMsg").forEach(msg=>{
      const ok=!q||(msg.textContent||"").toLowerCase().includes(q);
      msg.classList.toggle("sf-live-search-hidden",!ok);
      msg.classList.toggle("sf-live-search-hit",!!q&&ok);
      if(q&&ok) hits++;
    });
    if(count) count.textContent=q?`${hits} trovati`:"";
  }

  function ensureProfileSheet(){
    if(document.querySelector(".sf-live-profile-sheet")) return;

    const backdrop=document.createElement("div");
    backdrop.className="sf-live-profile-backdrop";
    backdrop.addEventListener("click",()=>toggleProfile(false));

    const sheet=document.createElement("div");
    sheet.className="sf-live-profile-sheet";
    sheet.innerHTML=`
      <div class="sf-live-profile-handle"></div>
      <div class="sf-live-profile-title">👤 Profilo chat</div>
      <div class="sf-live-profile-note">Il nickname è il nome che gli altri vedono nella chat.</div>
      <label for="sfLiveNicknameInput">Nickname</label>
      <input id="sfLiveNicknameInput" type="text" maxlength="30" placeholder="Es. Marco, cittadino, utente...">
      <div class="sf-live-profile-warning">⚠️ Non inserire dati sensibili, numeri privati o informazioni personali. I messaggi possono essere moderati dall'amministratore.</div>
      <div class="sf-live-profile-actions">
        <button type="button" class="btn primary sf-live-profile-save">Salva nickname</button>
        <button type="button" class="btn ghost sf-live-profile-close" aria-label="Chiudi">✕</button>
      </div>
    `;

    document.body.append(backdrop,sheet);

    sheet.querySelector(".sf-live-profile-save")?.addEventListener("click",()=>{
      const value=String(document.getElementById("sfLiveNicknameInput")?.value||"").trim().slice(0,30);
      if(value.length<2){
        try{ if(typeof showBanner==="function") showBanner("error","Inserisci un nickname di almeno 2 caratteri."); }catch{}
        return;
      }

      const original=document.getElementById("chatNickname");
      if(original){
        original.value=value;
        original.dispatchEvent(new Event("change",{bubbles:true}));
      }
      try{ localStorage.setItem("sf_chat_nickname",value); }catch{}
      updateHeaderSubtitle();
      toggleProfile(false);
    });

    sheet.querySelector(".sf-live-profile-close")?.addEventListener("click",()=>toggleProfile(false));
  }

  function toggleProfile(force){
    ensureProfileSheet();
    const open=typeof force==="boolean"?force:!document.body.classList.contains("sf-live-profile-open");
    document.body.classList.toggle("sf-live-profile-open",open);

    if(open){
      document.body.classList.remove("sf-live-attach-open");
      const input=document.getElementById("sfLiveNicknameInput");
      if(input){
        input.value=getNickname();
        setTimeout(()=>input.focus(),80);
      }
    }
  }

  function ensureCompactComposer(section){
    const composer=section.querySelector(".chatComposer");
    if(!composer) return;

    const first=composer.firstElementChild;
    const msg=document.getElementById("chatMessage");
    if(!first || !msg) return;

    first.classList.add("sf-live-input-row");

    if(!first.querySelector("#sfLiveAttachToggle")){
      const attach=document.createElement("button");
      attach.type="button";
      attach.id="sfLiveAttachToggle";
      attach.setAttribute("aria-label","Allega");
      attach.title="Allega";
      attach.textContent="📎";
      first.insertBefore(attach,msg);

      attach.addEventListener("click",(e)=>{
        e.stopPropagation();
        const open=!document.body.classList.contains("sf-live-attach-open");
        document.body.classList.toggle("sf-live-attach-open",open);
        attach.classList.toggle("active",open);
      });
    }

    const closeAttach=()=>{
      document.body.classList.remove("sf-live-attach-open");
      document.getElementById("sfLiveAttachToggle")?.classList.remove("active");
    };

    document.getElementById("btnChatCamera")?.addEventListener("click",()=>setTimeout(closeAttach,100));
    document.getElementById("btnChatGallery")?.addEventListener("click",()=>setTimeout(closeAttach,100));
    document.getElementById("chatPhotoCamera")?.addEventListener("change",closeAttach);
    document.getElementById("chatPhotoGallery")?.addEventListener("change",closeAttach);

    if(composer.dataset.sfCompactBound!=="1"){
      composer.dataset.sfCompactBound="1";
      document.addEventListener("click",(e)=>{
        if(!document.body.classList.contains("sf-live-attach-open")) return;
        if(e.target.closest("#sfLiveAttachToggle") || e.target.closest(".chatPhotoTools")) return;
        closeAttach();
      });
    }

    msg.placeholder="Messaggio";
  }

  function decorateMessages(){
    const box=document.getElementById("chatMessages");
    if(!box) return;

    box.querySelectorAll(".chatMsg").forEach(msg=>{
      if(msg.dataset.sfLiveDecorated==="1") return;
      msg.dataset.sfLiveDecorated="1";

      const name=msg.querySelector(".chatMeta span");
      const nickname=(name?.textContent||"Utente").trim();

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

    applySearch();
  }

  function ensureNewChip(section){
    if(section.querySelector(".sf-live-new-chip")) return;
    const box=section.querySelector("#chatMessages");
    if(!box) return;

    const chip=document.createElement("button");
    chip.type="button";
    chip.className="sf-live-new-chip";
    chip.textContent="↓ Nuovi";
    chip.addEventListener("click",()=>{
      box.scrollTo({top:box.scrollHeight,behavior:"smooth"});
      chip.classList.remove("show");
      state.unread=0;
      updateBadges();
    });

    const card=section.querySelector(":scope > .card");
    card?.appendChild(chip);
  }

  function sectionChip(){ return document.querySelector("#view-chat .sf-live-new-chip"); }

  function updateBadges(){
    const online=Math.max(0,Number(document.getElementById("chatOnlineCount")?.textContent||0)||0);
    const mirror=document.getElementById("sfLiveOnlineCount");
    if(mirror) mirror.textContent=String(online);

    const badge=document.querySelector(".sf-live-nav-badge");
    if(badge){
      if(state.unread>0) badge.textContent=state.unread>9?"9+":String(state.unread);
      else badge.textContent=online>0?String(Math.min(online,99)):"";
    }
  }

  function bindObservers(){
    const box=document.getElementById("chatMessages");
    if(box && !state.observer){
      box.addEventListener("scroll",()=>{
        const gap=box.scrollHeight-box.scrollTop-box.clientHeight;
        state.wasNearBottom=gap<90;
        if(state.wasNearBottom) sectionChip()?.classList.remove("show");
      },{passive:true});

      state.observer=new MutationObserver(mutations=>{
        let added=0;
        for(const mutation of mutations){
          for(const node of mutation.addedNodes){
            if(!(node instanceof Element)) continue;
            if(node.matches?.(".chatMsg")) added++;
            added+=node.querySelectorAll?.(".chatMsg")?.length||0;
          }
        }

        decorateMessages();

        if(added){
          if(chatOpen()){
            if(state.wasNearBottom){
              requestAnimationFrame(()=>{box.scrollTop=box.scrollHeight});
            }else{
              sectionChip()?.classList.add("show");
            }
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
    }
  }

  function decorateSection(){
    const section=document.getElementById("view-chat");
    if(!section) return false;

    section.classList.remove("sf-live-v1","sf-live-v3","sf-live-v4");
    section.classList.add("sf-live-v5");

    markOriginal(section);
    ensureHeader(section);
    ensureSearch(section);
    ensureProfileSheet();
    ensureCompactComposer(section);
    ensureNewChip(section);
    decorateMessages();
    bindObservers();
    updateHeaderSubtitle();
    updateBadges();

    return true;
  }

  async function pollSummary(){
    try{
      if(typeof CONFIG==="undefined"||!CONFIG?.telegramWorkerUrl) return;
      const url=`${String(CONFIG.telegramWorkerUrl).replace(/\/$/,"")}/api/chat/public?limit=1&t=${Date.now()}`;
      const res=await fetch(url,{cache:"no-store"});
      const data=await res.json();
      if(!res.ok||!data?.ok) return;

      const rows=Array.isArray(data.items)?data.items:[];
      const latest=rows.length?String(rows[rows.length-1]?.id||rows[0]?.id||""):"";
      const online=document.getElementById("chatOnlineCount");
      if(online) online.textContent=String(Number(data.online||0));

      if(latest&&state.lastId&&latest!==state.lastId&&!chatOpen()) state.unread=Math.min(99,state.unread+1);
      if(latest) state.lastId=latest;
      updateBadges();
    }catch{}
  }

  function updateRouteMode(){
    const open=chatOpen();
    document.body.classList.toggle("sf-live-chat-open",open);

    if(!open){
      document.body.classList.remove("sf-live-search-open","sf-live-attach-open","sf-live-profile-open");
    }

    ensureLiveNav();
    decorateSection();

    if(open){
      state.unread=0;
      updateBadges();

      setTimeout(()=>{
        try{ if(typeof loadChatMessages==="function") loadChatMessages(true); }catch{}
        decorateSection();

        const box=document.getElementById("chatMessages");
        if(box) requestAnimationFrame(()=>{box.scrollTop=box.scrollHeight});

        if(!getNickname() && !state.profileShownOnce){
          state.profileShownOnce=true;
          setTimeout(()=>toggleProfile(true),220);
        }
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

    pollSummary();
    state.pollTimer=setInterval(pollSummary,30000);

    window.__sfLiveEnhancementsVersion=VERSION;
    console.info("[Segnala Facile] Live V5 attiva",VERSION);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})();
