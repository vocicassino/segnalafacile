/* Segnala Facile - Segnalazioni senza coordinate V2
   Correzione apertura Home: intercetta miniFeed, ultima attività e recenti.
*/
(()=>{"use strict";

const VERSION="2026-09-08.2";
const S={
  installed:false,
  timer:null,
  current:null,
  lastSig:"",
  originalOpenHomeLatestItem:null,
  wrapped:false
};

const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
}[c]));

const reports=()=>Array.isArray(window.publicSegnalazioni)?window.publicSegnalazioni:[];
const places=()=>Array.isArray(window.publicLuoghi)?window.publicLuoghi:[];
const activities=()=>Array.isArray(window.publicAttivita)?window.publicAttivita:[];

function hasCoords(i){
  const lat=Number(i?.lat??i?.geo?.lat);
  const lng=Number(i?.lng??i?.geo?.lng);
  return Number.isFinite(lat)&&Number.isFinite(lng)&&!(lat===0&&lng===0);
}

const noCoords=()=>reports().filter(i=>!hasCoords(i));
const title=i=>String(i?.titolo??i?.title??"Segnalazione").trim()||"Segnalazione";
const desc=i=>String(i?.descrizione??i?.description??i?.testo??"").trim();
const date=i=>String(i?.dataStr??i?.when??i?.created_at??i?.createdAt??"").trim();
const cat=i=>String(i?.categoria??i?.category??"altro").trim()||"altro";
const id=i=>String(i?.id??i?.created_at??i?.createdAt??i?.dataStr??i?.when??i?.titolo??"");

function emoji(c){
  c=String(c).toLowerCase();
  if(c.includes("rifiut"))return"🗑️";
  if(c.includes("strad"))return"🛣️";
  if(c.includes("luce")||c.includes("illumin"))return"💡";
  if(c.includes("verde"))return"🌳";
  return"📣";
}

function photos(i){
  try{
    if(typeof estraiTutteLeFoto==="function"){
      const a=estraiTutteLeFoto(i);
      if(Array.isArray(a))return a.filter(Boolean).slice(0,8);
    }
  }catch{}

  const r=i?.galleria_foto??i?.foto??i?.photos??i?.photoDataUrl??i?.immagine??"";
  if(!r)return[];

  if(Array.isArray(r)){
    return r.map(x=>x?.dataUrl||x?.url||x).filter(Boolean).slice(0,8);
  }
  if(typeof r==="object"){
    return [r.dataUrl||r.url].filter(Boolean);
  }

  const t=String(r).trim();
  if(t.startsWith("[")||t.startsWith("{")){
    try{return photos({foto:JSON.parse(t)})}catch{}
  }
  return t?[t]:[];
}

function parseDateString(v){
  if(!v)return 0;
  const s=String(v).trim();

  // Formato tipico: 08/09/2026, 17:20:26
  const m=s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if(m){
    return new Date(
      Number(m[3]),
      Number(m[2])-1,
      Number(m[1]),
      Number(m[4]||0),
      Number(m[5]||0),
      Number(m[6]||0)
    ).getTime();
  }

  const native=Date.parse(s);
  return Number.isFinite(native)?native:0;
}

function latestOverall(){
  const all=[
    ...reports().map(x=>({...x,__type:"segnalazione"})),
    ...activities().map(x=>({...x,__type:"attivita"})),
    ...places().map(x=>({...x,__type:"luogo"}))
  ];
  all.sort((a,b)=>parseDateString(b.dataStr||b.when||b.createdAt)-parseDateString(a.dataStr||a.when||a.createdAt));
  return all[0]||null;
}

function findReportByCard(btn){
  if(!btn)return null;
  const titleText=String(btn.querySelector("strong")?.textContent||"").trim();
  const metaText=String(btn.querySelector(".homeRecentText span")?.textContent||"").trim();

  if(!titleText)return null;

  let candidates=reports().filter(i=>title(i)===titleText);

  const dateMatch=metaText.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  if(dateMatch){
    const wanted=dateMatch[1];
    const dated=candidates.filter(i=>date(i).includes(wanted));
    if(dated.length)candidates=dated;
  }

  candidates.sort((a,b)=>parseDateString(b.dataStr||b.when)-parseDateString(a.dataStr||a.when));
  return candidates[0]||null;
}

function ensureUI(){
  if(!document.getElementById("sfNoGeoBackdrop")){
    const b=document.createElement("div");
    b.id="sfNoGeoBackdrop";
    b.onclick=close;
    document.body.appendChild(b);
  }

  if(!document.getElementById("sfNoGeoPanel")){
    const p=document.createElement("aside");
    p.id="sfNoGeoPanel";
    p.innerHTML=`
      <div class="sf-no-geo-handle"></div>

      <div id="sfNoGeoListView">
        <div class="sf-no-geo-head">
          <div>
            <div class="sf-no-geo-kicker">SEGNALA FACILE</div>
            <h2>📄 Segnalazioni senza posizione</h2>
          </div>
          <button class="sf-no-geo-close" type="button">✕</button>
        </div>

        <div class="sf-no-geo-note">
          Sono pubblicate normalmente, ma non possono avere un PIN sulla mappa
          finché non viene indicata una posizione.
        </div>

        <div class="sf-no-geo-list" id="sfNoGeoList"></div>
      </div>

      <div id="sfNoGeoDetail">
        <button class="btn ghost" id="sfNoGeoBack" type="button">← Tutte</button>
        <div id="sfNoGeoDetailBody"></div>
      </div>`;

    document.body.appendChild(p);
    p.querySelector(".sf-no-geo-close").onclick=close;
    p.querySelector("#sfNoGeoBack").onclick=showList;
  }

  ensureMapBtn();
  ensureHomeNotice();
}

function ensureMapBtn(){
  const m=document.getElementById("sfMapSideMenu");
  if(!m||document.getElementById("sfNoGeoMapMenuBtn"))return;

  const b=document.createElement("button");
  b.id="sfNoGeoMapMenuBtn";
  b.className="btn ghost";
  b.type="button";
  b.innerHTML=`📄 Senza posizione <span class="sf-no-geo-count" id="sfNoGeoMapCount">0</span>`;
  b.onclick=openList;

  const divider=m.querySelector(".sf-map-side-divider");
  if(divider)divider.insertAdjacentElement("beforebegin",b);
  else m.appendChild(b);
}

function ensureHomeNotice(){
  if(document.getElementById("sfNoGeoHomeNotice"))return;

  const h=document.getElementById("view-home");
  if(!h)return;

  const b=document.createElement("button");
  b.id="sfNoGeoHomeNotice";
  b.type="button";
  b.innerHTML=`
    <span>📍</span>
    <span>
      <strong>Segnalazioni senza posizione</strong>
      <small id="sfNoGeoHomeText"></small>
    </span>
    <span>›</span>`;
  b.onclick=openList;

  const recent=document.getElementById("homeRecentList");
  if(recent)recent.insertAdjacentElement("afterend",b);
  else h.querySelector(":scope > .card")?.appendChild(b);
}

function renderList(){
  const el=document.getElementById("sfNoGeoList");
  const rows=noCoords().slice().sort((a,b)=>parseDateString(b.dataStr||b.when)-parseDateString(a.dataStr||a.when));

  if(!el)return;

  if(!rows.length){
    el.innerHTML=`<div class="sf-no-geo-note">Nessuna segnalazione senza posizione.</div>`;
    return;
  }

  el.innerHTML=rows.map((i,n)=>`
    <button class="sf-no-geo-row" type="button" data-n="${n}">
      <span class="sf-no-geo-row-icon">${emoji(cat(i))}</span>
      <span>
        <strong>${safe(title(i))}</strong>
        <small>${safe(cat(i))}${date(i)?" • "+safe(date(i)):""}</small>
      </span>
      <span class="sf-no-geo-row-go">›</span>
    </button>
  `).join("");

  el.querySelectorAll("[data-n]").forEach(b=>{
    b.onclick=()=>showDetail(rows[Number(b.dataset.n)]);
  });
}

function showDetail(i){
  if(!i)return;
  S.current=i;

  const p=document.getElementById("sfNoGeoPanel");
  const el=document.getElementById("sfNoGeoDetailBody");
  const pics=photos(i);
  if(!p||!el)return;

  el.innerHTML=`
    <article class="sf-no-geo-detail-card">
      <div>${emoji(cat(i))} Segnalazione • ${safe(cat(i))}</div>
      <h2 class="sf-no-geo-title">${safe(title(i))}</h2>

      <div class="sf-no-geo-meta">
        ${date(i)?`<span class="sf-no-geo-chip">🕒 ${safe(date(i))}</span>`:""}
      </div>

      <div class="sf-no-geo-warning">
        📍 <strong>Posizione non indicata.</strong><br>
        La segnalazione resta visibile nell'app, ma non viene inventato un punto sulla mappa.
      </div>

      ${desc(i)?`<div class="sf-no-geo-desc">${safe(desc(i))}</div>`:""}

      ${pics.length?`
        <div class="sf-no-geo-gallery">
          ${pics.map(x=>`<img src="${safe(x)}" alt="Foto segnalazione" loading="lazy">`).join("")}
        </div>`:""}
    </article>`;

  p.classList.add("detail");
}

function showList(){
  S.current=null;
  document.getElementById("sfNoGeoPanel")?.classList.remove("detail");
  renderList();
}

function openList(){
  ensureUI();
  showList();
  document.body.classList.add("sf-no-geo-open");
}

function openDetail(i){
  ensureUI();
  showDetail(i);
  document.body.classList.add("sf-no-geo-open");
}

function close(){
  document.body.classList.remove("sf-no-geo-open");
}

/* ------------------------------------------------------------------
   FIX PRINCIPALE
   Il codice originale di index.html ha DUE percorsi che mandavano sempre
   le segnalazioni alla mappa:
   1) openHomeLatestItem()
   2) openRecentItem() dentro updateHomeOverview()
   ------------------------------------------------------------------ */

function wrapOpenHomeLatestItem(){
  if(S.wrapped)return;

  const original=window.openHomeLatestItem;
  if(typeof original!=="function")return;

  S.originalOpenHomeLatestItem=original;

  const wrapped=function(item){
    const type=item?.__type || (item?.titolo!==undefined?"segnalazione":"");
    if(type==="segnalazione" && !hasCoords(item)){
      openDetail(item);
      return;
    }
    return original.apply(this,arguments);
  };

  wrapped.__sfNoGeoWrapped=true;
  window.openHomeLatestItem=wrapped;
  S.wrapped=true;
}

function handleHomeClick(event){
  // Ultima novità grande "Spazzatura e degrado. / Vedi"
  const mini=event.target?.closest?.("#miniFeed");
  const latestLine=event.target?.closest?.("#homeLatestLine");

  if(mini||latestLine){
    const latest=latestOverall();
    if(latest?.__type==="segnalazione" && !hasCoords(latest)){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openDetail(latest);
      return true;
    }
  }

  // Elenco dei tre aggiornamenti recenti
  const recent=event.target?.closest?.(".homeRecentItem[data-recent-index]");
  if(recent){
    const item=findReportByCard(recent);
    if(item && !hasCoords(item)){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openDetail(item);
      return true;
    }
  }

  return false;
}

function installHomeGuards(){
  document.addEventListener("click",event=>{
    handleHomeClick(event);
  },true);

  document.addEventListener("keydown",event=>{
    if(event.key!=="Enter" && event.key!==" ")return;

    const clickable=event.target?.closest?.("#miniFeed,#homeLatestLine,.homeRecentItem[data-recent-index]");
    if(!clickable)return;

    handleHomeClick(event);
  },true);

  // Se la funzione globale esiste, la sostituiamo anche direttamente:
  // è una seconda protezione oltre all'intercettazione dei click.
  wrapOpenHomeLatestItem();
}

function update(){
  ensureUI();
  wrapOpenHomeLatestItem();

  const a=noCoords();
  const n=a.length;

  const c=document.getElementById("sfNoGeoMapCount");
  if(c)c.textContent=String(n);

  const h=document.getElementById("sfNoGeoHomeNotice");
  const t=document.getElementById("sfNoGeoHomeText");

  if(h)h.classList.toggle("show",n>0);
  if(t)t.textContent=`${n} ${n===1?"segnalazione consultabile":"segnalazioni consultabili"}`;

  const sig=a.map(id).join("|");
  if(sig!==S.lastSig){
    S.lastSig=sig;
    if(document.body.classList.contains("sf-no-geo-open")&&!S.current)renderList();
  }
}

function install(){
  if(S.installed)return;
  S.installed=true;

  ensureUI();
  installHomeGuards();
  update();

  addEventListener("hashchange",()=>setTimeout(update,80));
  addEventListener("pageshow",update);

  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible")update();
  });

  S.timer=setInterval(update,2000);

  window.sfOpenReportsWithoutCoords=openList;
  window.sfOpenReportWithoutCoords=openDetail;
  window.__sfNoCoordsReportsVersion=VERSION;

  console.info("[Segnala Facile] segnalazioni senza coordinate V2 attive",VERSION);
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",install,{once:true});
}else{
  install();
}
})();
