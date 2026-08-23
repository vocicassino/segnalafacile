/* Segnala Facile LIVE V1 */
(()=>{"use strict";
const VERSION="2026-08-23.2";
const state={installed:false,observer:null,onlineObserver:null,pollTimer:null,unread:0,lastId:""};

function chatOpen(){return location.hash==="#/chat"}

function ensureNav(){
  const map=document.querySelector('nav a[data-nav="map"]');
  if(!map)return;
  const host=map.parentElement;
  let link=host.querySelector('a[data-nav="chat"]');
  if(!link){
    link=document.createElement("a");
    link.href="#/chat";link.dataset.nav="chat";link.setAttribute("aria-label","Live");
    link.innerHTML='<span class="navEmoji">💬</span><span>Live</span><span class="sf-live-nav-badge"></span>';
    host.insertBefore(link,map);
  }
  link.classList.add("sf-live-nav");
  if(!link.querySelector(".sf-live-nav-badge"))link.insertAdjacentHTML("beforeend",'<span class="sf-live-nav-badge"></span>');
}

function markHeader(section){
  const card=section.querySelector(":scope > .card"); if(!card)return;
  const first=card.firstElementChild;
  if(first&&!first.classList.contains("sf-live-header"))first.classList.add("sf-live-original-head");
  [...card.querySelectorAll("div")].forEach(el=>{
    const t=(el.textContent||"").trim();
    if(t.includes("Non inserire dati sensibili")&&t.length<280)el.classList.add("sf-live-safety");
  });
}

function ensureHeader(section){
  const card=section.querySelector(":scope > .card");
  if(!card||card.querySelector(".sf-live-header"))return;
  const h=document.createElement("div");
  h.className="sf-live-header";
  h.innerHTML='<div><div class="sf-live-kicker">● COMMUNITY LIVE</div><div class="sf-live-title">💬 Chat di Cassino</div><div class="sf-live-subtitle">Messaggi in tempo reale dalla community.</div></div><div class="sf-live-online"><span class="sf-live-online-dot"></span><span><b id="sfLiveOnlineCount">0</b> online</span></div>';
  card.prepend(h);
}

function decorateMessages(){
  const box=document.getElementById("chatMessages"); if(!box)return;
  box.querySelectorAll(".chatMsg").forEach(msg=>{
    if(msg.dataset.sfLiveDecorated==="1")return;
    msg.dataset.sfLiveDecorated="1";
    const name=msg.querySelector(".chatMeta span");
    if(/^voci di cassino$/i.test((name?.textContent||"").trim())){
      msg.classList.add("sf-live-admin");
      name?.insertAdjacentHTML("afterend",'<span class="sf-live-admin-badge">ADMIN</span>');
    }
  });
}

function updateBadge(){
  const online=Math.max(0,Number(document.getElementById("chatOnlineCount")?.textContent||0)||0);
  const mirror=document.getElementById("sfLiveOnlineCount"); if(mirror)mirror.textContent=String(online);
  const badge=document.querySelector(".sf-live-nav-badge");
  if(badge)badge.textContent=state.unread>0?String(Math.min(state.unread,9)):(online>0?String(Math.min(online,99)):"");
}

function bindObservers(){
  const box=document.getElementById("chatMessages");
  if(box&&!state.observer){
    state.observer=new MutationObserver(muts=>{
      let added=0;
      muts.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1){if(n.matches?.(".chatMsg"))added++;added+=n.querySelectorAll?.(".chatMsg")?.length||0}}));
      decorateMessages();
      if(added&&!chatOpen())state.unread=Math.min(99,state.unread+added);
      if(chatOpen())state.unread=0;
      updateBadge();
    });
    state.observer.observe(box,{childList:true,subtree:true});
  }
  const online=document.getElementById("chatOnlineCount");
  if(online&&!state.onlineObserver){
    state.onlineObserver=new MutationObserver(updateBadge);
    state.onlineObserver.observe(online,{childList:true,subtree:true,characterData:true});
  }
}

function decorate(){
  const s=document.getElementById("view-chat"); if(!s)return false;
  s.classList.add("sf-live-v1");
  markHeader(s); ensureHeader(s); decorateMessages(); bindObservers(); updateBadge();
  return true;
}

async function poll(){
  try{
    if(typeof CONFIG==="undefined"||!CONFIG?.telegramWorkerUrl)return;
    const r=await fetch(String(CONFIG.telegramWorkerUrl).replace(/\/$/,"")+"/api/chat/public?limit=1&t="+Date.now(),{cache:"no-store"});
    const d=await r.json(); if(!r.ok||!d?.ok)return;
    const rows=Array.isArray(d.items)?d.items:[];
    const latest=rows.length?String(rows[rows.length-1]?.id||rows[0]?.id||""):"";
    const online=document.getElementById("chatOnlineCount"); if(online)online.textContent=String(Number(d.online||0));
    if(latest&&state.lastId&&latest!==state.lastId&&!chatOpen())state.unread=Math.min(99,state.unread+1);
    if(latest)state.lastId=latest;
    updateBadge();
  }catch{}
}

function route(){
  ensureNav();decorate();
  if(chatOpen()){
    state.unread=0;updateBadge();
    setTimeout(()=>{try{if(typeof loadChatMessages==="function")loadChatMessages(true)}catch{}decorate()},80);
  }
}

function install(){
  if(state.installed)return;state.installed=true;
  ensureNav();decorate();
  addEventListener("hashchange",route);addEventListener("pageshow",route);
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){route();poll()}});
  poll();state.pollTimer=setInterval(poll,30000);
  window.__sfLiveEnhancementsVersion=VERSION;
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();
