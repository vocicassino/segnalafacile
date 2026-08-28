/* Segnala Facile • Cassino Raccolta integrata V1
   Dati e logica derivano dalla webapp Cassino-Raccolta di Voci di Cassino.
   Nessun iframe: UI e funzioni sono integrate direttamente.
*/
(() => {
  "use strict";

  const VERSION = "2026-08-28.3";
  const PUSH_WORKER = "https://cassino-raccolta-push.vocidicassino.workers.dev";

  const WASTE = {
    organic:  { label:"Organico", icon:"🍎", note:"Scarti alimentari e umido" },
    residual: { label:"Secco residuo", icon:"🗑️", note:"Rifiuto non riciclabile" },
    diapers:  { label:"Pannolini / pannoloni", icon:"🧷", note:"Servizio dedicato" },
    paper:     { label:"Carta", icon:"📄", note:"Carta e cartone" },
    plastic:   { label:"Plastica e metalli", icon:"🥫", note:"Imballaggi e contenitori" },
    glass:     { label:"Vetro", icon:"🍾", note:"Bottiglie e vasetti" },
    bulky:     { label:"Ingombranti e RAEE", icon:"🛋️", note:"Solo su prenotazione" }
  };

  const BASE_SCHEDULE = {
    0: [],
    1: ["organic","bulky"],
    2: ["residual","diapers"],
    3: ["paper"],
    4: ["organic","bulky"],
    5: ["diapers","plastic"],
    6: ["glass"]
  };

  const KEYS = {
    zone:"cassino-zone",
    enabled:"cassino-reminder-enabled",
    evening:"cassino-evening-time",
    morningEnabled:"cassino-morning-enabled",
    morning:"cassino-morning-time",
    holiday:"cassino-holiday-enabled",
    bulky:"cassino-bulky-enabled",
    deviceId:"cassino-cloudflare-device-id",
    deviceSecret:"cassino-cloudflare-device-secret"
  };

  const state = {
    installed:false,
    zone:localStorage.getItem(KEYS.zone) || "",
    enabled:localStorage.getItem(KEYS.enabled) === "true",
    evening:localStorage.getItem(KEYS.evening) || "21:00",
    morningEnabled:localStorage.getItem(KEYS.morningEnabled) === "true",
    morning:localStorage.getItem(KEYS.morning) || "04:30",
    holiday:localStorage.getItem(KEYS.holiday) !== "false",
    bulky:localStorage.getItem(KEYS.bulky) === "true",
    pushConnected:false,
    pushPublicKey:"",
    menuBuilt:false,
    homeCardBuilt:false
  };

  const DAY_NAMES = ["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];
  const MONTHS = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];

  function html(v){
    return String(v ?? "").replace(/[&<>"']/g,c=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[c]));
  }

  function pad(n){ return String(n).padStart(2,"0"); }
  function dateKey(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
  function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }

  function easterSunday(year){
    const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4;
    const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
    const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4;
    const l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
    const month=Math.floor((h+l-7*m+114)/31);
    const day=((h+l-7*m+114)%31)+1;
    return new Date(year,month-1,day);
  }

  function holidayName(date){
    const fixed={
      "01-01":"Capodanno","01-06":"Epifania","04-25":"Festa della Liberazione",
      "05-01":"Festa dei Lavoratori","06-02":"Festa della Repubblica",
      "08-15":"Ferragosto","11-01":"Ognissanti","12-08":"Immacolata Concezione",
      "12-25":"Natale","12-26":"Santo Stefano"
    };
    const mmdd=`${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
    if(fixed[mmdd]) return fixed[mmdd];
    const easterMonday=addDays(easterSunday(date.getFullYear()),1);
    if(dateKey(date)===dateKey(easterMonday)) return "Lunedì dell'Angelo";
    return "";
  }

  function scheduleFor(date,{includeBulky=true,ignoreHoliday=false}={}){
    if(!ignoreHoliday && holidayName(date)) return [];
    let items=[...(BASE_SCHEDULE[date.getDay()] || [])];
    if(date.getDay()===6 && state.zone==="central") items.unshift("organic");
    if(!includeBulky) items=items.filter(x=>x!=="bulky");
    return items;
  }

  function formatDay(date){
    return `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  }

  function wasteRows(keys){
    if(!keys.length) return `<div class="sf-cr-empty">Nessuna raccolta prevista.</div>`;
    return keys.map(key=>{
      const item=WASTE[key];
      return `<div class="sf-cr-waste">
        <div class="sf-cr-waste-ico">${item.icon}</div>
        <div><strong>${html(item.label)}</strong><small>${html(item.note)}</small></div>
      </div>`;
    }).join("");
  }

  function routeIsRaccolta(){
    return location.hash === "#/raccolta";
  }

  function ensureMoreMenu(){
    if(state.menuBuilt) return;
    const nav=document.querySelector("nav.bottom .inner");
    if(!nav) return;

    // Sposta AI e Offerte nel menu Altro senza rimuoverne le route originali.
    nav.querySelector('a[data-nav="offerte"]')?.classList.add("sf-moved-to-more");
    nav.querySelector('a[data-nav="ai"]')?.classList.add("sf-moved-to-more");

    let more=nav.querySelector(".sf-more-nav");
    if(!more){
      more=document.createElement("a");
      more.href="#";
      more.className="sf-more-nav";
      more.dataset.nav="altro";
      more.setAttribute("aria-label","Altro");
      more.innerHTML='<span class="navEmoji">☰</span><span>Altro</span>';
      const map=nav.querySelector('a[data-nav="map"]');
      if(map) map.insertAdjacentElement("afterend",more);
      else nav.appendChild(more);

      more.addEventListener("click",e=>{
        e.preventDefault();
        toggleMore(true);
      });
    }

    if(!document.getElementById("sfMoreBackdrop")){
      const backdrop=document.createElement("div");
      backdrop.id="sfMoreBackdrop";
      backdrop.addEventListener("click",()=>toggleMore(false));
      document.body.appendChild(backdrop);
    }

    if(!document.getElementById("sfMoreSheet")){
      const sheet=document.createElement("div");
      sheet.id="sfMoreSheet";
      sheet.innerHTML=`
        <div class="sf-more-handle"></div>
        <div class="sf-more-head">
          <div>
            <div style="font-size:10px;color:#9eb0cf;font-weight:900">SEGNALA FACILE</div>
            <h2>Altri servizi</h2>
          </div>
          <button class="sf-more-close" type="button" aria-label="Chiudi">✕</button>
        </div>
        <div class="sf-more-grid">
          <button class="sf-more-item raccolta" type="button" data-sf-more="raccolta">
            <span class="sf-more-ico">♻️</span><strong>Raccolta rifiuti</strong>
            <small>Cosa esporre oggi, calendario, promemoria e servizi.</small>
          </button>
          <button class="sf-more-item" type="button" data-sf-more="offerte">
            <span class="sf-more-ico">🎁</span><strong>Offerte</strong>
            <small>Promozioni e vantaggi delle attività locali.</small>
          </button>
          <button class="sf-more-item" type="button" data-sf-more="ai">
            <span class="sf-more-ico">🎙️</span><strong>Assistente AI</strong>
            <small>Aiuto per segnalazioni, testi e informazioni.</small>
          </button>
          <button class="sf-more-item" type="button" data-sf-more="install">
            <span class="sf-more-ico">📲</span><strong>Installa l'app</strong>
            <small>Guida per aggiungere Segnala Facile al telefono.</small>
          </button>
        </div>`;
      document.body.appendChild(sheet);

      sheet.querySelector(".sf-more-close")?.addEventListener("click",()=>toggleMore(false));
      sheet.querySelectorAll("[data-sf-more]").forEach(btn=>{
        btn.addEventListener("click",()=>{
          const target=btn.dataset.sfMore;
          toggleMore(false);
          if(target==="raccolta") location.hash="#/raccolta";
          else location.hash=`#/${target}`;
        });
      });
    }

    state.menuBuilt=true;
  }

  function toggleMore(open){
    document.body.classList.toggle("sf-more-open",!!open);
  }

  function ensureHomeCard(){
    if(state.homeCardBuilt) return;
    const home=document.getElementById("view-home");
    const card=home?.querySelector(":scope > .card");
    if(!card) return;

    const box=document.createElement("button");
    box.type="button";
    box.className="sf-home-raccolta-card";
    box.setAttribute("aria-label","Apri Cassino Raccolta");
    box.innerHTML=`
      <span class="sf-home-raccolta-icon-wrap">
        <span class="sf-home-raccolta-icon">♻️</span>
      </span>
      <span class="sf-home-raccolta-copy">
        <strong>Cassino Raccolta</strong>
        <small id="sfHomeRaccoltaText">Scopri cosa esporre oggi a Cassino.</small>
      </span>
      <span class="sf-home-raccolta-go">Apri</span>`;
    box.addEventListener("click",()=>{ location.hash="#/raccolta"; });

    const cta=[...card.querySelectorAll("button, a")].find(el=>/invia segnalazione/i.test((el.textContent||"").trim()))
      || card.querySelector(".ctaBig")
      || card.querySelector(".primary");

    if(cta && cta.parentElement===card){
      cta.insertAdjacentElement("afterend",box);
    }else if(cta){
      cta.parentElement?.insertAdjacentElement("afterend",box);
    }else{
      card.prepend(box);
    }

    state.homeCardBuilt=true;
    refreshHomeCard();
    requestAnimationFrame(refreshHomeCard);
  }

  function refreshHomeCard(){
    const text=document.getElementById("sfHomeRaccoltaText");
    if(!text) return;
    const today=new Date();
    const items=scheduleFor(today);
    const holiday=holidayName(today);
    if(holiday) text.textContent=`Oggi è ${holiday}: nessuna raccolta prevista.`;
    else if(!state.zone) text.textContent="Scegli la zona e scopri cosa esporre oggi.";
    else if(items.length) text.textContent=`Oggi: ${items.map(k=>WASTE[k].label).join(", ")}.`;
    else text.textContent="Oggi non è previsto alcun ritiro.";
  }

  function ensureRaccoltaView(){
    if(document.getElementById("sfRaccoltaView")) return;

    const view=document.createElement("section");
    view.id="sfRaccoltaView";
    view.className="grid";
    view.innerHTML=`
      <div class="sf-cr-shell">
        <div>
          <button class="btn ghost small sf-cr-back" type="button" id="sfCrBack">← Indietro</button>
        </div>

        <article class="sf-cr-hero">
          <div class="sf-cr-hero-top">
            <div>
              <div class="sf-cr-kicker">Voci di Cassino • servizio alla città</div>
              <h1 class="sf-cr-title">♻️ Cassino Raccolta</h1>
              <div class="hint" style="margin-top:5px">Calendario, promemoria e servizi direttamente in Segnala Facile.</div>
            </div>
            <div class="sf-cr-date" id="sfCrDate"><b>--</b><span>---</span></div>
          </div>
          <div class="sf-cr-zone">
            <button type="button" data-cr-zone="central">Zona centrale</button>
            <button type="button" data-cr-zone="other">Altre zone</button>
            <button type="button" id="sfCrZoneInfo">ℹ️ Zone centrali</button>
          </div>
        </article>

        <div class="sf-cr-days">
          <article class="sf-cr-day current">
            <div class="sf-cr-day-head">
              <div><small>Oggi</small><h3 id="sfCrTodayName">—</h3></div>
              <span class="sf-cr-status" id="sfCrTodayStatus">—</span>
            </div>
            <div class="sf-cr-waste-list" id="sfCrTodayWaste"></div>
          </article>
          <article class="sf-cr-day">
            <div class="sf-cr-day-head">
              <div><small>Domani</small><h3 id="sfCrTomorrowName">—</h3></div>
              <span class="sf-cr-status" id="sfCrTomorrowStatus">—</span>
            </div>
            <div class="sf-cr-waste-list" id="sfCrTomorrowWaste"></div>
          </article>
        </div>

        <div class="sf-cr-actions">
          <button class="sf-cr-action" id="sfCrTomorrowCalendar" type="button">
            <span class="ico">📅</span><span>Domani nel calendario</span>
          </button>
          <button class="sf-cr-action" id="sfCrExport60" type="button">
            <span class="ico">🗓️</span><span>Esporta 60 giorni</span>
          </button>
          <button class="sf-cr-action" id="sfCrShare" type="button">
            <span class="ico">📤</span><span>Condividi</span>
          </button>
        </div>

        <article class="sf-cr-card">
          <div class="sf-cr-card-head">
            <div><h3>📆 Settimana tipo</h3><small>Il sabato cambia in base alla zona.</small></div>
          </div>
          <div class="sf-cr-week" id="sfCrWeek"></div>
        </article>

        <article class="sf-cr-card">
          <div class="sf-cr-card-head">
            <div><h3>🔔 Promemoria</h3><small>Le preferenze restano salvate sul telefono.</small></div>
          </div>

          <div class="sf-cr-settings">
            <div class="sf-cr-setting">
              <div class="sf-cr-switch">
                <strong>Promemoria attivi</strong>
                <input id="sfCrEnabled" type="checkbox">
              </div>
            </div>
            <div class="sf-cr-setting">
              <label for="sfCrEvening">Avviso serale</label>
              <input id="sfCrEvening" type="time" value="21:00">
            </div>
            <div class="sf-cr-setting">
              <div class="sf-cr-switch">
                <strong>Avviso mattutino</strong>
                <input id="sfCrMorningEnabled" type="checkbox">
              </div>
              <label for="sfCrMorning" style="margin-top:8px!important">Orario</label>
              <input id="sfCrMorning" type="time" value="04:30">
            </div>
            <div class="sf-cr-setting">
              <div class="sf-cr-switch">
                <strong>Avvisa sui festivi</strong>
                <input id="sfCrHoliday" type="checkbox">
              </div>
              <div class="sf-cr-switch" style="margin-top:10px">
                <strong>Includi ingombranti</strong>
                <input id="sfCrBulky" type="checkbox">
              </div>
            </div>
          </div>

          <div id="sfCrPushStatus" class="sf-cr-push-status">☁️ Controllo notifiche push...</div>
          <div class="sf-cr-push-actions">
            <button class="btn primary" id="sfCrPushEnable" type="button">☁️ Attiva push reali</button>
            <button class="btn ghost" id="sfCrPushTest" type="button">🧪 Prova</button>
            <button class="btn danger" id="sfCrPushDisable" type="button">Disattiva</button>
          </div>
        </article>

        <article class="sf-cr-card">
          <div class="sf-cr-card-head"><div><h3>ℹ️ Servizi utili</h3><small>Informazioni del servizio di raccolta.</small></div></div>
          <div class="sf-cr-services">
            <div class="sf-cr-service">
              <span class="ico">🕘</span><strong>Esposizione</strong>
              <p>Dalle 21:00 del giorno precedente, entro le 05:00.</p>
            </div>
            <div class="sf-cr-service">
              <span class="ico">☎️</span><strong>Numero verde</strong>
              <p>800 086 508 • lun–ven 09:00–12:00.</p>
              <a class="btn ghost" href="tel:800086508">Chiama</a>
            </div>
            <div class="sf-cr-service">
              <span class="ico">📍</span><strong>Centro di raccolta</strong>
              <p>Località Ponte La Pietra SNC.</p>
              <button class="btn ghost" id="sfCrCenterHours" type="button">Orari</button>
            </div>
            <div class="sf-cr-service">
              <span class="ico">🛋️</span><strong>Ingombranti e RAEE</strong>
              <p>Ritiro a domicilio su prenotazione o conferimento al centro.</p>
              <a class="btn ghost" href="tel:800086508">Prenota</a>
            </div>
          </div>
        </article>

        <article class="sf-cr-card">
          <div class="hint" style="margin:0">
            Servizio informativo indipendente di Voci di Cassino. I dati di raccolta derivano dal calendario comunale.
          </div>
          <div class="btnRow" style="margin-top:10px">
            <a class="btn ghost small" href="https://vocicassino.github.io/Cassino-Raccolta/assets/calendario-raccolta-cassino.pdf" target="_blank" rel="noopener">📄 Calendario ufficiale PDF</a>
            <a class="btn ghost small" href="https://vocicassino.github.io/Cassino-Raccolta/" target="_blank" rel="noopener">↗️ Versione standalone</a>
          </div>
        </article>
      </div>`;

    const wrap=document.querySelector(".wrap");
    if(wrap) wrap.appendChild(view);
    else document.body.appendChild(view);

    const dialog=document.createElement("dialog");
    dialog.id="sfCrHoursDialog";
    dialog.innerHTML=`
      <div class="sf-cr-dialog-inner">
        <div class="sf-cr-dialog-head">
          <h3>Centro di raccolta</h3>
          <button class="btn ghost small" id="sfCrHoursClose" type="button">✕</button>
        </div>
        <div class="sf-cr-hours">
          <div><strong>Lunedì</strong><span>09:00–12:00</span></div>
          <div><strong>Martedì</strong><span>14:30–16:30</span></div>
          <div><strong>Mercoledì</strong><span>09:00–12:00</span></div>
          <div><strong>Giovedì</strong><span>09:00–12:00</span></div>
          <div><strong>Venerdì</strong><span>09:00–12:00 / 14:30–16:30</span></div>
          <div><strong>Sabato</strong><span>09:00–12:00</span></div>
        </div>
        <div class="btnRow" style="margin-top:12px">
          <a class="btn primary small" href="https://www.google.com/maps/search/?api=1&query=Localit%C3%A0+Ponte+La+Pietra+Cassino" target="_blank" rel="noopener">🧭 Apri mappa</a>
        </div>
      </div>`;
    document.body.appendChild(dialog);

    bindView();
  }

  function bindView(){
    document.getElementById("sfCrBack")?.addEventListener("click",()=>{
      if(history.length>1) history.back();
      else location.hash="#/";
    });

    document.querySelectorAll("[data-cr-zone]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        state.zone=btn.dataset.crZone;
        localStorage.setItem(KEYS.zone,state.zone);
        renderAll();
        syncPushPreferences().catch(()=>{});
      });
    });

    document.getElementById("sfCrZoneInfo")?.addEventListener("click",()=>{
      const msg="Il sabato l'organico è previsto soltanto per: Centro urbano, Colosseo, San Bartolomeo, Le Residenze, Caira centro, Sant'Angelo in Theodice centro e Via Sferracavalli dalla Casa Circondariale all'Hotel La Rocca, entrambi i lati.";
      try{ if(typeof showBanner==="function") showBanner("info",msg,8000); else alert(msg); }catch{ alert(msg); }
    });

    const bindings=[
      ["sfCrEnabled","change",e=>{state.enabled=e.target.checked;localStorage.setItem(KEYS.enabled,String(state.enabled));syncPushPreferences().catch(()=>{});}],
      ["sfCrEvening","change",e=>{state.evening=e.target.value;localStorage.setItem(KEYS.evening,state.evening);syncPushPreferences().catch(()=>{});}],
      ["sfCrMorningEnabled","change",e=>{state.morningEnabled=e.target.checked;localStorage.setItem(KEYS.morningEnabled,String(state.morningEnabled));syncPushPreferences().catch(()=>{});}],
      ["sfCrMorning","change",e=>{state.morning=e.target.value;localStorage.setItem(KEYS.morning,state.morning);syncPushPreferences().catch(()=>{});}],
      ["sfCrHoliday","change",e=>{state.holiday=e.target.checked;localStorage.setItem(KEYS.holiday,String(state.holiday));syncPushPreferences().catch(()=>{});}],
      ["sfCrBulky","change",e=>{state.bulky=e.target.checked;localStorage.setItem(KEYS.bulky,String(state.bulky));syncPushPreferences().catch(()=>{});}]
    ];
    bindings.forEach(([id,ev,fn])=>document.getElementById(id)?.addEventListener(ev,fn));

    document.getElementById("sfCrTomorrowCalendar")?.addEventListener("click",()=>exportCalendar(1));
    document.getElementById("sfCrExport60")?.addEventListener("click",()=>exportCalendar(60));
    document.getElementById("sfCrShare")?.addEventListener("click",shareRaccolta);

    document.getElementById("sfCrPushEnable")?.addEventListener("click",enablePush);
    document.getElementById("sfCrPushTest")?.addEventListener("click",testPush);
    document.getElementById("sfCrPushDisable")?.addEventListener("click",disablePush);

    document.getElementById("sfCrCenterHours")?.addEventListener("click",()=>{
      const d=document.getElementById("sfCrHoursDialog");
      if(d?.showModal) d.showModal();
    });
    document.getElementById("sfCrHoursClose")?.addEventListener("click",()=>document.getElementById("sfCrHoursDialog")?.close());
  }

  function renderAll(){
    if(!document.getElementById("sfRaccoltaView")) return;
    const now=new Date();
    const tomorrow=addDays(now,1);

    const date=document.getElementById("sfCrDate");
    if(date) date.innerHTML=`<b>${now.getDate()}</b><span>${MONTHS[now.getMonth()]}</span>`;

    document.querySelectorAll("[data-cr-zone]").forEach(btn=>{
      btn.classList.toggle("active",btn.dataset.crZone===state.zone);
    });

    renderDay(now,"Today");
    renderDay(tomorrow,"Tomorrow");
    renderWeek(now);

    const set=(id,prop,val)=>{ const el=document.getElementById(id); if(el) el[prop]=val; };
    set("sfCrEnabled","checked",state.enabled);
    set("sfCrEvening","value",state.evening);
    set("sfCrMorningEnabled","checked",state.morningEnabled);
    set("sfCrMorning","value",state.morning);
    set("sfCrHoliday","checked",state.holiday);
    set("sfCrBulky","checked",state.bulky);

    refreshHomeCard();
    updatePushStatus();
  }

  function renderDay(date,prefix){
    const holiday=holidayName(date);
    const items=scheduleFor(date);
    const name=document.getElementById(`sfCr${prefix}Name`);
    const status=document.getElementById(`sfCr${prefix}Status`);
    const waste=document.getElementById(`sfCr${prefix}Waste`);

    if(name) name.textContent=formatDay(date);
    if(status) status.textContent=holiday ? "Festivo" : items.length ? (prefix==="Today"?"Raccolta":"Da esporre") : "Nessun ritiro";
    if(waste) waste.innerHTML=wasteRows(items);

    if(prefix==="Tomorrow"){
      const btn=document.getElementById("sfCrTomorrowCalendar");
      if(btn) btn.disabled=!scheduleFor(date,{includeBulky:state.bulky}).length;
    }
  }

  function renderWeek(now){
    const box=document.getElementById("sfCrWeek");
    if(!box) return;
    let out="";
    for(let day=1;day<=6;day++){
      const sample=new Date(2026,0,4+day); // domenica 4 gen 2026 -> giorni 1..6 corretti
      let keys=[...(BASE_SCHEDULE[day]||[])];
      if(day===6 && state.zone==="central") keys.unshift("organic");
      out+=`<div class="sf-cr-week-row ${now.getDay()===day?"today":""}">
        <div class="sf-cr-week-day">${DAY_NAMES[day]}</div>
        <div class="sf-cr-tags">${keys.length?keys.map(k=>`<span class="sf-cr-tag">${WASTE[k].icon} ${html(WASTE[k].label)}</span>`).join(""):`<span class="sf-cr-tag">Nessun ritiro</span>`}</div>
      </div>`;
    }
    box.innerHTML=out;
  }

  function icsEscape(v){
    return String(v||"").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");
  }

  function icsDate(date){
    return `${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}`;
  }

  function exportCalendar(days){
    if(!state.zone){
      try{ if(typeof showBanner==="function") showBanner("error","Scegli prima la zona."); }catch{}
      return;
    }

    const start=new Date();
    const events=[];
    const count=days===1?1:days;

    for(let i=days===1?1:0;i<(days===1?2:count);i++){
      const date=addDays(start,i);
      const items=scheduleFor(date,{includeBulky:state.bulky});
      if(!items.length) continue;
      const title=`Raccolta: ${items.map(k=>WASTE[k].label).join(" + ")}`;
      const previous=addDays(date,-1);

      events.push([
        "BEGIN:VEVENT",
        `UID:segnalafacile-raccolta-${icsDate(date)}@vocidicassino`,
        `DTSTAMP:${icsDate(new Date())}T120000`,
        `DTSTART;VALUE=DATE:${icsDate(previous)}`,
        `DTEND;VALUE=DATE:${icsDate(date)}`,
        `SUMMARY:${icsEscape("♻️ "+title)}`,
        `DESCRIPTION:${icsEscape("Esporre i rifiuti dalle 21:00 del giorno precedente ed entro le 05:00. Segnala Facile • Voci di Cassino")}`,
        "END:VEVENT"
      ].join("\r\n"));
    }

    if(!events.length){
      try{ if(typeof showBanner==="function") showBanner("info","Nessun ritiro da aggiungere nel periodo selezionato."); }catch{}
      return;
    }

    const content=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Voci di Cassino//Segnala Facile Raccolta//IT","CALSCALE:GREGORIAN",...events,"END:VCALENDAR"].join("\r\n");
    const blob=new Blob([content],{type:"text/calendar;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=days===1?"raccolta-domani.ics":"raccolta-cassino-60-giorni.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }

  async function shareRaccolta(){
    const today=new Date();
    const items=scheduleFor(today);
    const text=`♻️ Cassino Raccolta\nOggi: ${items.length?items.map(k=>WASTE[k].label).join(", "):"nessun ritiro"}.\nServizio in Segnala Facile.`;
    try{
      if(navigator.share){
        await navigator.share({title:"Cassino Raccolta",text,url:"https://vocicassino.github.io/segnalafacile/#/raccolta"});
      }else{
        await navigator.clipboard.writeText(text+"\nhttps://vocicassino.github.io/segnalafacile/#/raccolta");
        if(typeof showBanner==="function") showBanner("success","Link copiato negli appunti.");
      }
    }catch(e){
      if(e?.name!=="AbortError" && typeof showBanner==="function") showBanner("error","Condivisione non disponibile.");
    }
  }

  // -------------------------------------------------------------------
  // PUSH CLOUDFLARE - riuso dello stesso backend di Cassino Raccolta.
  // -------------------------------------------------------------------
  function base64Url(bytes){
    let binary="";
    bytes.forEach(byte=>binary+=String.fromCharCode(byte));
    return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
  }

  function base64UrlToUint8Array(value){
    const padding="=".repeat((4-(value.length%4))%4);
    const base64=(value+padding).replace(/-/g,"+").replace(/_/g,"/");
    const raw=atob(base64);
    return Uint8Array.from([...raw].map(char=>char.charCodeAt(0)));
  }

  function credentials(){
    let deviceId=localStorage.getItem(KEYS.deviceId);
    let deviceSecret=localStorage.getItem(KEYS.deviceSecret);
    if(!deviceId){
      deviceId=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${base64Url(crypto.getRandomValues(new Uint8Array(16)))}`;
      localStorage.setItem(KEYS.deviceId,deviceId);
    }
    if(!deviceSecret){
      deviceSecret=base64Url(crypto.getRandomValues(new Uint8Array(32)));
      localStorage.setItem(KEYS.deviceSecret,deviceSecret);
    }
    return {deviceId,deviceSecret};
  }

  async function pushApi(path,body){
    const res=await fetch(PUSH_WORKER+path,{
      method:body?"POST":"GET",
      headers:{"Content-Type":"application/json"},
      body:body?JSON.stringify(body):undefined,
      cache:"no-store"
    });
    let data={};
    try{data=await res.json()}catch{}
    if(!res.ok) throw new Error(data.error||data.message||`Errore server (${res.status})`);
    return data;
  }

  function preferences(){
    return {
      zone:state.zone==="central"?"central":"other",
      enabled:Boolean(state.enabled),
      eveningTime:/^([01]\d|2[0-3]):[0-5]\d$/.test(state.evening)?state.evening:"21:00",
      morningEnabled:Boolean(state.morningEnabled),
      morningTime:/^([01]\d|2[0-3]):[0-5]\d$/.test(state.morning)?state.morning:"04:30",
      holidayEnabled:state.holiday!==false,
      bulkyEnabled:Boolean(state.bulky)
    };
  }

  async function publicKey(){
    if(state.pushPublicKey) return state.pushPublicKey;
    const data=await pushApi("/api/config");
    if(!data.vapidPublicKey) throw new Error("Chiave VAPID non configurata.");
    state.pushPublicKey=data.vapidPublicKey;
    return state.pushPublicKey;
  }

  async function saveSubscription(subscription){
    return pushApi("/api/subscribe",{
      ...credentials(),
      subscription:subscription.toJSON(),
      preferences:preferences(),
      appUrl:"https://vocicassino.github.io/segnalafacile/#/raccolta",
      userAgent:navigator.userAgent.slice(0,300)
    });
  }

  async function enablePush(){
    try{
      if(!state.zone) throw new Error("Scegli prima la zona.");
      if(!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)){
        throw new Error("Questo browser non supporta le notifiche push.");
      }

      setPushStatus("connecting","⏳ Attivazione notifiche...");
      const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();
      if(permission!=="granted") throw new Error("Autorizzazione alle notifiche non concessa.");

      const key=await publicKey();
      const registration=await navigator.serviceWorker.ready;
      let subscription=await registration.pushManager.getSubscription();

      if(!subscription){
        subscription=await registration.pushManager.subscribe({
          userVisibleOnly:true,
          applicationServerKey:base64UrlToUint8Array(key)
        });
      }

      await saveSubscription(subscription);
      state.pushConnected=true;
      setPushStatus("connected","✅ Notifiche push attive su questo dispositivo.");
      try{ if(typeof showBanner==="function") showBanner("success","Promemoria push attivati."); }catch{}
    }catch(e){
      state.pushConnected=false;
      setPushStatus("error","⚠️ "+(e.message||e));
    }
  }

  async function syncPushPreferences(){
    if(Notification.permission!=="granted" || !("serviceWorker" in navigator)) return;
    const registration=await navigator.serviceWorker.ready;
    const subscription=await registration.pushManager.getSubscription();
    if(!subscription || !localStorage.getItem(KEYS.deviceId) || !localStorage.getItem(KEYS.deviceSecret)) return;
    try{
      await saveSubscription(subscription);
      state.pushConnected=true;
      updatePushStatus();
    }catch{}
  }

  async function testPush(){
    try{
      if(!state.pushConnected) throw new Error("Attiva prima le notifiche push.");
      setPushStatus("connecting","🧪 Invio notifica di prova...");
      const data=await pushApi("/api/test",credentials());
      setPushStatus("connected","✅ Test inviato. Controlla le notifiche.");
    }catch(e){
      setPushStatus("error","⚠️ "+(e.message||e));
    }
  }

  async function disablePush(){
    try{
      const creds=credentials();
      try{await pushApi("/api/unsubscribe",creds)}catch{}
      if("serviceWorker" in navigator){
        const registration=await navigator.serviceWorker.ready;
        const subscription=await registration.pushManager.getSubscription();
        if(subscription) await subscription.unsubscribe();
      }
    }finally{
      localStorage.removeItem(KEYS.deviceId);
      localStorage.removeItem(KEYS.deviceSecret);
      state.pushConnected=false;
      setPushStatus("ready","Notifiche push disattivate.");
    }
  }

  function setPushStatus(kind,text){
    const el=document.getElementById("sfCrPushStatus");
    if(!el) return;
    el.classList.toggle("connected",kind==="connected");
    el.textContent=text;
  }

  async function updatePushStatus(){
    if(!document.getElementById("sfCrPushStatus")) return;
    try{
      if(!("serviceWorker" in navigator) || !("Notification" in window)){
        setPushStatus("error","⚠️ Push non supportate da questo browser.");
        return;
      }
      if(Notification.permission==="denied"){
        setPushStatus("error","🚫 Notifiche bloccate nelle impostazioni del browser.");
        return;
      }
      const registration=await navigator.serviceWorker.ready;
      const subscription=await registration.pushManager.getSubscription();
      state.pushConnected=Boolean(subscription && localStorage.getItem(KEYS.deviceId) && localStorage.getItem(KEYS.deviceSecret));
      if(state.pushConnected){
        setPushStatus("connected","✅ Notifiche push attive su questo dispositivo.");
      }else{
        setPushStatus("ready","☁️ Attiva le push per ricevere i promemoria anche ad app chiusa.");
      }
    }catch{
      setPushStatus("ready","☁️ Notifiche push pronte per la configurazione.");
    }
  }

  function onRoute(){
    ensureMoreMenu();
    ensureHomeCard();
    ensureRaccoltaView();

    const open=routeIsRaccolta();
    document.body.classList.toggle("sf-raccolta-open",open);

    if(open){
      toggleMore(false);

      // Il router originale considera #/raccolta una route sconosciuta e attiva Home.
      // Correggiamo solo l'indicatore visivo, senza modificare index.html.
      document.querySelectorAll("nav.bottom a[data-nav]").forEach(a=>a.classList.remove("active"));
      document.querySelector("nav.bottom a.sf-more-nav")?.classList.add("active");

      renderAll();
      window.scrollTo({top:0,behavior:"instant"});
    }
  }

  function install(){
    if(state.installed) return;
    state.installed=true;

    ensureMoreMenu();
    ensureHomeCard();
    ensureRaccoltaView();
    onRoute();

    window.addEventListener("hashchange",()=>setTimeout(onRoute,0));
    window.addEventListener("pageshow",onRoute);

    // Live viene inserito dinamicamente: manteniamo la dock ordinata.
    const navObserver=new MutationObserver(()=>ensureMoreMenu());
    const nav=document.querySelector("nav.bottom .inner");
    if(nav) navObserver.observe(nav,{childList:true});

    window.__sfRaccoltaIntegrationVersion=VERSION;
    console.info("[Segnala Facile] Cassino Raccolta integrata",VERSION);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})();
