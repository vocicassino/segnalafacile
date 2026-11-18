/*
 * Segnala Facile - Dashboard Abbonamenti Attività V1
 * Caricato nell'admin tramite Service Worker.
 * Usa esclusivamente gli endpoint admin già esistenti.
 */
(() => {
  "use strict";

  const VERSION = "2026-11-18.admin-subscriptions1";
  const STYLE_ID = "sf-subscriptions-admin-style";
  const DASH_ID = "sfSubscriptionsDashboard";
  let observer = null;
  let autoAlertRunning = false;

  function workerUrl(){
    try { return String(WORKER_URL || "").replace(/\/$/,""); }
    catch { return ""; }
  }

  function adminKey(){
    try { return String(apiKey || ""); }
    catch { return ""; }
  }

  function activities(){
    try { return Array.isArray(allData?.attivita) ? allData.attivita : []; }
    catch { return []; }
  }

  function esc(v){
    return String(v ?? "").replace(/[&<>"']/g,ch=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[ch]));
  }

  function dateOnly(v){
    const s = String(v || "").trim();
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
    return m ? m[1] : "";
  }

  function localDateISO(d = new Date()){
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,"0");
    const day=String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }

  function diffDays(dateStr){
    const s = dateOnly(dateStr);
    if(!s) return null;
    const [y,m,d] = s.split("-").map(Number);
    const end = new Date(y,m-1,d,12,0,0);
    const now = new Date();
    const today = new Date(now.getFullYear(),now.getMonth(),now.getDate(),12,0,0);
    return Math.round((end-today)/86400000);
  }

  function price(plan){
    const p=String(plan||"base").toLowerCase();
    if(p==="premium") return 20;
    if(p==="plus") return 10;
    return 5;
  }

  function stateOf(a){
    const days = diffDays(a?.abbonamento_scadenza);
    const payment = String(a?.stato_pagamento || "da_verificare").toLowerCase();

    if(payment==="scaduto" || (days !== null && days < 0)) return {key:"expired",days};
    if(days === 0) return {key:"today",days};
    if(days !== null && days > 0 && days <= 3) return {key:"d3",days};
    if(days !== null && days > 3 && days <= 7) return {key:"d7",days};
    if(payment==="pagato" || payment==="omaggio") return {key:"active",days};
    return {key:"verify",days};
  }

  function metrics(list){
    const out = {
      active:0,d7:0,d3:0,today:0,expired:0,verify:0,
      paidMonth:0,monthlyActiveValue:0
    };
    const currentMonth = localDateISO().slice(0,7);

    for(const a of list){
      const s = stateOf(a);
      out[s.key]++;

      if(
        s.key === "active" &&
        String(a.stato_pagamento||"").toLowerCase()==="pagato" &&
        Number(a.attiva)===1
      ){
        out.monthlyActiveValue += price(a.piano);
      }

      const last = dateOnly(a.ultimo_pagamento);
      if(
        last.startsWith(currentMonth) &&
        String(a.stato_pagamento||"").toLowerCase()==="pagato"
      ){
        out.paidMonth += price(a.piano);
      }
    }

    return out;
  }

  function dueRows(list){
    return list
      .map(a=>({a,s:stateOf(a)}))
      .filter(x=>["d7","d3","today","expired"].includes(x.s.key))
      .sort((x,y)=>(x.s.days ?? -999)-(y.s.days ?? -999))
      .slice(0,12);
  }

  function badge(s){
    if(s.key==="expired") return `<span class="sf-sub-badge expired">SCADUTO</span>`;
    if(s.key==="today") return `<span class="sf-sub-badge today">OGGI</span>`;
    if(s.key==="d3") return `<span class="sf-sub-badge d3">D-${s.days}</span>`;
    if(s.key==="d7") return `<span class="sf-sub-badge d7">D-${s.days}</span>`;
    return "";
  }

  function injectStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const style=document.createElement("style");
    style.id=STYLE_ID;
    style.textContent=`
      #${DASH_ID}{
        margin:0 0 16px;padding:15px;border-radius:18px;
        border:1px solid rgba(45,125,255,.22);
        background:linear-gradient(180deg,rgba(45,125,255,.08),rgba(7,12,24,.72));
      }
      .sf-sub-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}
      .sf-sub-title{font-size:18px;font-weight:950;color:#fff}
      .sf-sub-sub{font-size:11px;color:#a9b6db;margin-top:4px;line-height:1.45}
      .sf-sub-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-top:12px}
      .sf-sub-kpi{padding:10px;border-radius:13px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035)}
      .sf-sub-kpi span{display:block;font-size:9px;color:#9eacd0;text-transform:uppercase;font-weight:900}
      .sf-sub-kpi strong{display:block;margin-top:3px;font-size:21px;color:#fff}
      .sf-sub-kpi.ok strong{color:#71e6ad}.sf-sub-kpi.warn strong{color:#ffd27f}.sf-sub-kpi.bad strong{color:#ff8e93}
      .sf-sub-money{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
      .sf-sub-money span{padding:7px 10px;border-radius:999px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);font-size:11px;color:#d9e3fb}
      .sf-sub-due{margin-top:12px;border-top:1px solid rgba(255,255,255,.08);padding-top:10px}
      .sf-sub-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.055)}
      .sf-sub-row:last-child{border-bottom:0}
      .sf-sub-row strong{font-size:12px;color:#edf3ff}.sf-sub-row small{font-size:10px;color:#8f9fc3}
      .sf-sub-badge{font-size:9px;font-weight:950;padding:5px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.1)}
      .sf-sub-badge.expired,.sf-sub-badge.today{color:#ffc7ca;background:rgba(255,77,79,.11);border-color:rgba(255,77,79,.28)}
      .sf-sub-badge.d3{color:#ffd27f;background:rgba(245,185,66,.10);border-color:rgba(245,185,66,.28)}
      .sf-sub-badge.d7{color:#b6d5ff;background:rgba(45,125,255,.10);border-color:rgba(45,125,255,.28)}
      .sf-sub-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}
      .sf-sub-note{margin-top:9px;font-size:10px;line-height:1.45;color:#8796b8}
      @media(max-width:850px){.sf-sub-grid{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:520px){.sf-sub-grid{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.appendChild(style);
  }

  function findAnchor(){
    return document.getElementById("activityAdminFormTitle")?.closest("div");
  }

  function ensureDashboard(){
    injectStyle();
    let box=document.getElementById(DASH_ID);
    if(box) return box;

    const anchor=findAnchor();
    if(!anchor) return null;

    box=document.createElement("div");
    box.id=DASH_ID;
    anchor.parentElement.insertBefore(box,anchor);
    return box;
  }

  function render(){
    const box=ensureDashboard();
    if(!box) return;

    const list=activities();
    const m=metrics(list);
    const due=dueRows(list);

    const dueHtml=due.length
      ? due.map(({a,s})=>`
          <div class="sf-sub-row">
            ${badge(s)}
            <div><strong>${esc(a.nome || "Attività")}</strong><br><small>${esc(a.piano || "base")} • scadenza ${esc(dateOnly(a.abbonamento_scadenza) || "non indicata")}</small></div>
            <button type="button" class="btn-secondary" data-sf-sub-edit="${esc(a.id || "")}">Apri</button>
          </div>`).join("")
      : `<div style="color:#9eacd0;font-size:12px;padding:8px 0;">Nessuna scadenza nei prossimi 7 giorni.</div>`;

    box.innerHTML=`
      <div class="sf-sub-head">
        <div>
          <div class="sf-sub-title">💳 Dashboard abbonamenti</div>
          <div class="sf-sub-sub">Scadenze, pagamenti e rinnovi delle attività presenti su Segnala Facile.</div>
        </div>
        <span class="archive-badge ok">Aggiornata ${new Date().toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}</span>
      </div>

      <div class="sf-sub-grid">
        <div class="sf-sub-kpi ok"><span>Attivi</span><strong>${m.active}</strong></div>
        <div class="sf-sub-kpi warn"><span>Entro 7 gg</span><strong>${m.d7}</strong></div>
        <div class="sf-sub-kpi warn"><span>Entro 3 gg</span><strong>${m.d3}</strong></div>
        <div class="sf-sub-kpi bad"><span>Scadono oggi</span><strong>${m.today}</strong></div>
        <div class="sf-sub-kpi bad"><span>Scaduti</span><strong>${m.expired}</strong></div>
        <div class="sf-sub-kpi"><span>Da verificare</span><strong>${m.verify}</strong></div>
      </div>

      <div class="sf-sub-money">
        <span>💶 Incassi registrati questo mese: <b>${m.paidMonth.toFixed(2)} €</b></span>
        <span>📈 Valore mensile abbonamenti attivi: <b>${m.monthlyActiveValue.toFixed(2)} €</b></span>
      </div>

      <div class="sf-sub-due">
        <strong style="font-size:12px;color:#fff;">Scadenze da seguire</strong>
        ${dueHtml}
      </div>

      <div class="sf-sub-actions">
        <button type="button" class="btn-secondary" id="sfSubRefresh">🔄 Aggiorna</button>
        <button type="button" id="sfSubTelegram">🔔 Invia riepilogo Telegram</button>
      </div>

      <div class="sf-sub-note">
        L'Admin invia al massimo un controllo Telegram al giorno quando viene aperto.
        L'automazione 24/7 indipendente dall'apertura dell'Admin richiede il Cron del Worker Cloudflare.
      </div>
    `;

    box.querySelector("#sfSubRefresh")?.addEventListener("click",async()=>{
      try{
        if(typeof window.loadAttivitaAdmin==="function") await window.loadAttivitaAdmin();
      }catch{}
      setTimeout(render,100);
    });

    box.querySelector("#sfSubTelegram")?.addEventListener("click",()=>{
      try{
        if(typeof window.checkActivitySubscriptionAlerts==="function"){
          window.checkActivitySubscriptionAlerts(true);
        }
      }catch(e){
        alert("Errore controllo scadenze: "+(e.message||e));
      }
    });

    box.querySelectorAll("[data-sf-sub-edit]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const id=btn.dataset.sfSubEdit;
        if(id && typeof window.editActivityAdmin==="function"){
          window.editActivityAdmin(id);
        }
      });
    });

    maybeDailyTelegram(list);
  }

  async function maybeDailyTelegram(list){
    if(autoAlertRunning || !list.length) return;
    const key=adminKey();
    const worker=workerUrl();
    if(!key || !worker) return;

    const hasDue=list.some(a=>{
      const s=stateOf(a);
      return ["d7","d3","today","expired"].includes(s.key);
    });
    if(!hasDue) return;

    const today=localDateISO();
    const storageKey="sf_subscription_daily_alert_"+today;
    if(localStorage.getItem(storageKey)==="1") return;

    autoAlertRunning=true;
    try{
      const res=await fetch(`${worker}/api/admin/attivita-scadenze?days=7&send=1&t=${Date.now()}`,{
        headers:{"X-Api-Key":key}
      });
      const data=await res.json().catch(()=>null);
      if(res.ok && data?.ok){
        localStorage.setItem(storageKey,"1");
      }
    }catch(e){
      console.warn("Avviso automatico scadenze non inviato:",e);
    }finally{
      autoAlertRunning=false;
    }
  }

  function install(){
    injectStyle();
    render();

    const list=document.getElementById("attivitaAdminList");
    if(list && !observer){
      observer=new MutationObserver(()=>setTimeout(render,40));
      observer.observe(list,{childList:true,subtree:true});
    }

    // Tentativi limitati per aspettare caricamento dati/login.
    [250,700,1500,3000].forEach(ms=>setTimeout(render,ms));
    window.__sfSubscriptionsAdminVersion=VERSION;
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",install,{once:true});
  }else{
    install();
  }
})();
