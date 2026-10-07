/* ================================================================
   פורטל עובד (דמו) - מסך כניסה עם חיפוש שם + קוד אישי, ודף בית לעובד:
   הגשת משמרות / הדרכה / לוגיסטי, "המשמרות שלי" (רק מסידור שפורסם) ו"משימות פתוחות".
   קובץ נפרד מהקוד הראשי (index.html) - תחילת הפיצול לקבצים. הקוד הראשי חושף את מה שצריך
   דרך אובייקט App שמועבר לכל קריאה. לבקשת סרגיי (2026-10-07). הכניסה של המנהלים ובניית
   הסידור לא השתנו - נגישות מקישור "כניסת מנהלים".
   ================================================================ */
(function(){
"use strict";

const SESSION_KEY = "cstdemo_worker_session";
const P = { workers:null, query:"", selectedId:null, code:"", error:null, busy:false,
            shifts:null, shiftsError:null, checkedSession:false };

function loadSession(App){ return App.loadJSON(SESSION_KEY); }
function saveSession(App, s){ if(s) App.saveJSON(SESSION_KEY, s); else localStorage.removeItem(SESSION_KEY); }

/* חיפוש: כל אות שמוקלדת מצמצמת את הרשימה - שמות שמתחילים במה שהוקלד, או שאחת המילים בשם מתחילה בו */
function matches(name, q){
  if(!q) return true;
  const n = name.trim(), qq = q.trim();
  if(n.startsWith(qq)) return true;
  return n.split(/\s+/).some(part=>part.startsWith(qq));
}

function listHtml(App){
  const esc = App.escapeHtml;
  const shown = (P.workers||[]).filter(w=>matches(w.name, P.query));
  if(!shown.length) return `<div class="portal-row muted" style="cursor:default;">לא נמצא עובד בשם הזה.</div>`;
  return shown.map(w=>{
    const t = App.teamById(w.team_id);
    return `<div class="portal-row" data-action="portal-pick" data-id="${w.id}">${esc(w.name)}${t?` <span class="muted" style="font-size:.85em;">(${esc(t.name)})</span>`:""}</div>`;
  }).join("");
}

async function loadWorkers(App){
  try{ P.workers = await App.apiGet("roster_workers", "select=id,name,team_id&order=name"); }
  catch(e){ P.workers = []; P.error = "שגיאה בטעינת רשימת העובדים"; }
  App.render();
}

function renderLogin(App){
  const esc = App.escapeHtml;
  if(!P.workers){ loadWorkers(App); return `<div class="card"><p>טוען...</p></div>`; }
  const sel = P.selectedId ? P.workers.find(w=>w.id===P.selectedId) : null;
  App.S.ui.afterRender = ()=>{
    const el = document.getElementById(sel ? "portalCode" : "portalSearch");
    if(el){ el.focus(); if(!sel){ const v=el.value; el.value=""; el.value=v; } }
  };
  return `
  <div class="card">
    <h2>כניסה למערכת</h2>
    ${!sel ? `
      <div class="field"><label>הקלד/י את שמך</label>
        <input type="text" id="portalSearch" data-action="portal-search" autocomplete="off" placeholder="למשל: הא..." value="${esc(P.query)}">
      </div>
      <div class="portal-list" id="portalList">${listHtml(App)}</div>
    ` : `
      <p><b>${esc(sel.name)}</b> <span class="btn small secondary" data-action="portal-unpick" style="cursor:pointer;">לא אני</span></p>
      <div class="row">
        <div class="field"><label>קוד אישי</label>
          <input type="password" id="portalCode" autocomplete="off" placeholder="קוד" value="${esc(P.code)}" data-action="portal-code">
        </div>
        <button class="btn" data-action="portal-login" ${P.busy?"disabled":""}>כניסה</button>
      </div>
    `}
    ${P.error? `<p class="shortage">${esc(P.error)}</p>`:""}
    <p class="muted" style="margin-top:14px;">שמך לא ברשימה? פנה/י למנהל המערכת כדי שיוסיף אותך.</p>
  </div>
  <p style="text-align:center;margin-top:6px;"><span class="backlink" data-action="portal-managers">כניסת מנהלים / בניית סידור ←</span></p>`;
}

/* ---------- דף הבית של העובד ---------- */
function quotaFor(App, a){
  const dt = App.dayTypeForDate(a.entry_date), wd = App.parseDate(a.entry_date).getDay();
  return (App.S.quotas||[]).find(q=>q.sector===a.sector && q.shift_type===a.shift_type && q.day_type===dt && (q.weekday==null || q.weekday===wd));
}
function hoursOf(App, a){
  const q = quotaFor(App, a);
  const s = (a.custom_start || (q&&q.start_time) || "").slice(0,5);
  const e = (a.custom_end || (q&&q.end_time) || "").slice(0,5);
  return s && e ? `${s}-${e}` : "";
}

async function loadShifts(App, session){
  const from = App.fmtDate(App.addDays(new Date(), -1));
  const to = App.fmtDate(App.addDays(new Date(), 35));
  try{
    P.shifts = await App.apiRpc("worker_my_shifts", {p_token: session.token, p_from: from, p_to: to});
    P.shiftsError = null;
  }catch(e){
    if(/session/i.test(e.message)){ saveSession(App, null); P.shifts=null; }
    else { P.shifts = []; P.shiftsError = "שגיאה בטעינת המשמרות"; }
  }
  App.render();
}

function renderMyShifts(App, session){
  const esc = App.escapeHtml;
  if(P.shifts===null){ loadShifts(App, session); return `<p class="muted">טוען...</p>`; }
  if(P.shiftsError) return `<p class="shortage">${esc(P.shiftsError)}</p>`;
  if(!P.shifts.length) return `<p class="muted">אין כרגע משמרות בסידור שפורסם. כשהסידור יפורסם, המשמרות שלך יופיעו כאן.</p>`;
  // משמרת שחוצה שני בלוקים נשמרת כשתי שורות עם אותן שעות - מוצגת פעם אחת
  const seen = new Set();
  const rows = P.shifts.filter(a=>{
    if(!(a.custom_start && a.custom_end)) return true;
    const k = `${a.entry_date}|${a.custom_start}|${a.custom_end}`;
    if(seen.has(k)) return false; seen.add(k); return true;
  });
  return `<div style="overflow-x:auto;"><table>
    <thead><tr><th>תאריך</th><th>משמרת</th><th>שעות</th><th>גזרה</th><th></th></tr></thead>
    <tbody>${rows.map(a=>{
      const q = quotaFor(App, a);
      const label = App.SHIFT_LABELS[a.shift_type] || (q&&q.label) || a.shift_type;
      const notes = [];
      if(a.shadow_of_name) notes.push(`חפיפה (ח) עם ${esc(a.shadow_of_name)}`);
      if(a.filled_role && a.filled_role!==session.role) notes.push(`בתקן ${esc(a.filled_role)}`);
      return `<tr><td>${App.fmtDateHeb(a.entry_date)}</td><td>${esc(label)}</td><td>${hoursOf(App, a)}</td><td>${esc(a.sector)}</td><td class="muted">${notes.join(" · ")}</td></tr>`;
    }).join("")}</tbody>
  </table></div>`;
}

function renderWorkerHome(App, session){
  const esc = App.escapeHtml;
  if(!P.checkedSession){
    P.checkedSession = true;
    App.apiRpc("worker_session_info", {p_token: session.token}).then(info=>{
      if(!info){ saveSession(App, null); P.shifts=null; }
      App.render();
    }).catch(()=>{});
  }
  const tile = (action, title, sub, soon)=>`
    <div class="team-tile${soon?" portal-soon":""}" data-action="${action}" style="${soon?"opacity:.6;":""}">
      <div style="font-size:1.1em;font-weight:700;">${title}</div>
      <div class="muted" style="font-size:.85em;margin-top:4px;">${sub}</div>
    </div>`;
  return `
  <div class="card">
    <div class="flexbar" style="justify-content:space-between;">
      <h2 style="margin:0;">שלום, ${esc(session.name)}</h2>
      <button class="btn small secondary" data-action="portal-logout">יציאה</button>
    </div>
    <div class="grid-teams" style="margin-top:12px;">
      ${tile("portal-go-submit", "הגשת משמרות", "הגשת אילוצים לתקופה הבאה")}
      ${tile("portal-soon", "הדרכה", "בקרוב", true)}
      ${tile("portal-soon", "לוגיסטי", "בקרוב", true)}
    </div>
    ${P.soonMsg? `<p class="muted">${esc(P.soonMsg)}</p>`:""}
  </div>
  <div class="card">
    <h3>המשמרות שלי</h3>
    ${renderMyShifts(App, session)}
  </div>
  <div class="card">
    <h3>משימות פתוחות</h3>
    <p class="muted">אין משימות פתוחות כרגע.</p>
  </div>`;
}

function renderHome(App){
  const session = loadSession(App);
  return session ? renderWorkerHome(App, session) : renderLogin(App);
}

/* ---------- אירועים ---------- */
function onInput(App, e){
  const t = e.target;
  if(t.dataset.action==="portal-search"){
    P.query = t.value; P.error = null;
    const list = document.getElementById("portalList");
    if(list) list.innerHTML = listHtml(App); // בלי render מלא, כדי שהמקלדת לא תאבד פוקוס
    return true;
  }
  if(t.dataset.action==="portal-code"){ P.code = t.value; return true; }
  return false;
}
function onKey(App, e){
  if(e.key==="Enter" && e.target.id==="portalCode"){ doLogin(App); return true; }
  if(e.key==="Enter" && e.target.id==="portalSearch"){
    const shown = (P.workers||[]).filter(w=>matches(w.name, P.query));
    if(shown.length===1){ P.selectedId = shown[0].id; P.code=""; App.render(); }
    return true;
  }
  return false;
}

async function doLogin(App){
  const codeEl = document.getElementById("portalCode");
  const code = codeEl ? codeEl.value : P.code;
  if(!P.selectedId || !code){ P.error = "יש להזין קוד אישי"; return App.render(); }
  P.busy = true; P.error = null; App.render();
  try{
    const res = await App.apiRpc("worker_login", {p_worker_id: P.selectedId, p_code: code});
    P.busy = false;
    if(!res){ P.error = "קוד שגוי"; P.code=""; return App.render(); }
    saveSession(App, res);
    P.selectedId = null; P.code = ""; P.query = ""; P.shifts = null; P.checkedSession = true;
    App.render();
  }catch(err){ P.busy = false; P.error = err.message; App.render(); }
}

function onClick(App, a, el){
  const S = App.S;
  if(a==="portal-pick"){ P.selectedId = el.dataset.id; P.code=""; P.error=null; return App.render(); }
  if(a==="portal-unpick"){ P.selectedId = null; P.code=""; P.error=null; return App.render(); }
  if(a==="portal-login") return doLogin(App);
  if(a==="portal-managers"){ S.view = "managers"; S.ui = {}; return App.render(); }
  if(a==="portal-logout"){
    const s = loadSession(App);
    if(s) App.apiRpc("worker_logout", {p_token: s.token}).catch(()=>{});
    saveSession(App, null); P.shifts = null; P.checkedSession = false; P.soonMsg = null;
    return App.render();
  }
  if(a==="portal-soon"){ P.soonMsg = "החלק הזה עוד בבנייה."; return App.render(); }
  if(a==="portal-go-submit"){
    const s = loadSession(App);
    if(!s) return App.render();
    S.view = "submit";
    // אם העובד כבר בחר בעבר קב"ט במכשיר הזה - ישר לטופס; אחרת לבחירת הקב"ט (כמו היום)
    S.ui = (S.identity && S.identity.workerId===s.worker_id) ? {step:"period"} : {step:"recipient", pendingIdentity:{workerId:s.worker_id, name:s.name}};
    return App.render();
  }
  return undefined;
}

/* רשימה נגללת: שם אחד בכל שורה, בתוך תיבה בגובה קבוע עם גלילה (לבקשת סרגיי, 2026-10-07) */
(function addStyles(){
  if(document.getElementById("portalStyles")) return;
  const st = document.createElement("style"); st.id = "portalStyles";
  st.textContent = `
    .portal-list{max-height:240px;overflow-y:auto;border:1px solid #cfd8e3;border-radius:8px;background:#fff;margin-top:4px;}
    .portal-row{padding:9px 12px;border-bottom:1px solid #eef2f6;cursor:pointer;text-align:right;}
    .portal-row:last-child{border-bottom:none;}
    .portal-row:hover{background:#eef4fb;}`;
  (document.head||document.documentElement).appendChild(st);
})();

window.Portal = { renderHome, onClick, onInput, onKey, resetState(){ P.shifts=null; P.checkedSession=false; } };
})();
