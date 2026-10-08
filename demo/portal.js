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
const MGR_KEY = "cstdemo_manager_session";
const P = { workers:null, query:"", selectedId:null, code:"", error:null, busy:false,
            shifts:null, shiftsError:null, checkedSession:false };

function loadSession(App){ return App.loadJSON(SESSION_KEY); }
function saveSession(App, s){ if(s) App.saveJSON(SESSION_KEY, s); else localStorage.removeItem(SESSION_KEY); }
function loadMgr(App){ return App.loadJSON(MGR_KEY); }
function saveMgr(App, s){ if(s) App.saveJSON(MGR_KEY, s); else localStorage.removeItem(MGR_KEY); }
/* יציאה של מנהל: מחזירים את קוד העריכה והגישות לקב"ט למה שנשמר בדפדפן (בלי הסשן של המנהל) */
function clearMgrMode(App){
  const S = App.S;
  if(typeof S.pin==="string" && S.pin.startsWith("mgr:")) S.pin = localStorage.getItem("cstdemo_pin") || null;
  S.teamAccess = App.loadJSON("cstdemo_team_access") || {};
}

/* חיפוש: כל אות שמוקלדת מצמצמת את הרשימה - שמות שמתחילים במה שהוקלד, או שאחת המילים בשם מתחילה בו */
function matches(name, q){
  if(!q) return true;
  const n = name.trim(), qq = q.trim();
  if(n.startsWith(qq)) return true;
  return n.split(/\s+/).some(part=>part.startsWith(qq));
}

/* ברשימת הכניסה יש עובדים וגם מנהלים (מסומנים "מנהל"). מפתח הבחירה: "w:<id>" לעובד, "m:<id>" למנהל. */
function listHtml(App){
  const esc = App.escapeHtml;
  const shown = (P.workers||[]).filter(w=>matches(w.name, P.query));
  if(!shown.length) return `<div class="portal-row muted" style="cursor:default;">לא נמצא שם כזה.</div>`;
  return shown.map(w=>{
    const t = w.kind==="w" ? App.teamById(w.team_id) : null;
    const tag = w.kind==="m" ? "מנהל" : (t ? t.name : "");
    return `<div class="portal-row" data-action="portal-pick" data-id="${w.key}">${esc(w.name)}${tag?` <span class="muted" style="font-size:.85em;">(${esc(tag)})</span>`:""}</div>`;
  }).join("");
}

async function loadWorkers(App){
  try{
    const [ws, ms] = await Promise.all([
      App.apiGet("roster_workers", "select=id,name,team_id&order=name"),
      App.apiRpc("login_managers", {}).catch(()=>[])
    ]);
    P.workers = ws.map(w=>Object.assign({kind:"w", key:"w:"+w.id}, w))
      .concat((ms||[]).map(m=>({kind:"m", key:"m:"+m.id, id:m.id, name:m.name})))
      .sort((a,b)=>a.name.localeCompare(b.name,"he"));
  }catch(e){ P.workers = []; P.error = "שגיאה בטעינת רשימת השמות"; }
  App.render();
}

function renderLogin(App){
  const esc = App.escapeHtml;
  if(!P.workers){ loadWorkers(App); return `<div class="card"><p>טוען...</p></div>`; }
  const sel = P.selectedId ? P.workers.find(w=>w.key===P.selectedId) : null;
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
        <div class="field"><label>${sel.kind==="m"?"סיסמה":"קוד אישי"}</label>
          <input type="password" id="portalCode" autocomplete="off" placeholder="${sel.kind==="m"?"סיסמה":"קוד"}" value="${esc(P.code)}" data-action="portal-code">
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

/* ================================================================
   משימות פתוחות (לבקשת סרגיי, 2026-10-08). סדר קבוע: הגשת סידור עבודה, מעבר על לומדה ומבחן, מילוי
   סטטוס ציוד (לא למוקד). ליד כל משימה: 🕒 אם טרם בוצעה, ✔ אם בוצעה - משימה שבוצעה לא נעלמת.
   לומדות: מוצגות כל הלומדות שטרם בוצעו, ובנוסף הלומדה האחרונה גם אם בוצעה. כשנוספת לומדה חדשה,
   לומדה קודמת שבוצעה יורדת מהמסך הראשי ונשארת רק בתיעוד בלשונית "הדרכה".
   ================================================================ */
const T = { data:null };

async function loadTasks(App, session){
  T.data = {loading:true};
  try{
    const team = App.teamById(session.team_id);
    const periodStart = team ? App.currentPeriodStart(team) : App.fmtDate(new Date());
    const res = await App.apiRpc("worker_tasks", {p_token: session.token, p_period_start: periodStart});
    T.data = Object.assign({periodStart}, res || {});
  }catch(e){
    if(/session/i.test(e.message)){ saveSession(App, null); T.data = null; }
    else T.data = {error: "שגיאה בטעינת המשימות"};
  }
  App.render();
}
function trainingsForMainScreen(list){
  if(!list || !list.length) return [];
  const latest = list[list.length-1];
  return list.filter(t=> !t.passed || t.id===latest.id);
}
function renderTasks(App, session){
  const esc = App.escapeHtml;
  if(!T.data){ loadTasks(App, session); return `<p class="muted">טוען...</p>`; }
  if(T.data.loading) return `<p class="muted">טוען...</p>`;
  if(T.data.error) return `<p class="shortage">${esc(T.data.error)}</p>`;
  const rows = [];
  rows.push({done: !!T.data.submitted, action:"portal-go-submit",
    label: "הגשת סידור עבודה", sub: T.data.periodStart ? `לתקופה שמתחילה ב${App.fmtDateHeb(T.data.periodStart)}` : ""});
  trainingsForMainScreen(T.data.trainings).forEach(t=>rows.push({done: !!t.passed, action:"portal-go-training",
    label: `מעבר על הלומדה "${t.title}" ומבחן`, sub: ""}));
  if(T.data.equipment_done !== null && T.data.equipment_done !== undefined){
    rows.push({done: !!T.data.equipment_done, action:"portal-go-logistics", label: "מילוי סטטוס ציוד", sub: ""});
  }
  return `<div class="portal-tasks">${rows.map(r=>`
    <div class="portal-task" data-action="${r.action}">
      <span class="portal-task-icon ${r.done?"done":""}" title="${r.done?"בוצע":"טרם בוצע"}">${r.done?"✔":"🕒"}</span>
      <span><span style="font-weight:600;">${esc(r.label)}</span>${r.sub?` <span class="muted" style="font-size:.85em;">${esc(r.sub)}</span>`:""}</span>
    </div>`).join("")}</div>`;
}

/* לשונית "הדרכה": תיעוד של כל הלומדות והסטטוס של העובד בכל אחת. תוכן הלומדה והמבחן עצמם יוגדרו בהמשך. */
function renderTraining(App, session){
  const esc = App.escapeHtml;
  if(!T.data){ loadTasks(App, session); return `<p class="muted">טוען...</p>`; }
  if(T.data.loading) return `<p class="muted">טוען...</p>`;
  if(T.data.error) return `<p class="shortage">${esc(T.data.error)}</p>`;
  const list = (T.data.trainings||[]).slice().reverse();
  if(!list.length) return `<p class="muted">עדיין לא פורסמו לומדות.</p>`;
  return `<div style="overflow-x:auto;"><table>
    <thead><tr><th style="text-align:right;">לומדה</th><th>פורסמה</th><th>סטטוס</th></tr></thead>
    <tbody>${list.map(t=>`<tr>
      <td style="text-align:right;">${esc(t.title)}</td>
      <td>${App.fmtDateHeb(String(t.published_at).slice(0,10))}</td>
      <td>${t.passed ? `<span class="portal-task-icon done">✔</span> בוצע ${t.completed_at?App.fmtDateHeb(String(t.completed_at).slice(0,10)):""}` : `🕒 טרם בוצע`}</td>
    </tr>`).join("")}</tbody>
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
      ${tile("portal-go-training", "הדרכה", "לומדות ומבחנים")}
      ${isMokedWorker(App, session) ? "" : tile("portal-go-logistics", "לוגיסטי", "הציוד שלי ובקשת ציוד")}
    </div>
  </div>
  <div class="card">
    <h3>משימות פתוחות</h3>
    ${renderTasks(App, session)}
  </div>
  <div class="card">
    <h3>המשמרות שלי</h3>
    ${renderMyShifts(App, session)}
  </div>`;
}

/* ================================================================
   לוגיסטי (למאבטחים בגזרות, לא למוקד) - לבקשת סרגיי (2026-10-07):
   בפעם הראשונה העובד ממלא את כל הציוד שברשותו (כמות + מידה). אחר כך רואה טבלה של מה שיש לו,
   ויכול לבקש פריטים נוספים - הבקשה נשמרת לקב"ט של הצוות שלו (הממשק של הקב"ט/סרגיי יוגדר בהמשך).
   ================================================================ */
const L = { items:null, data:null, error:null, msg:null, busy:false };
const REQ_STATUS = { pending:"ממתין למנהל", replaced:"הוחלף", issued:"נופק", rejected:"נדחה" };
const REQ_REASON = { lost:"אבד", worn:"בלאי", need_more:"יש צורך ביותר" };

function isMokedWorker(App, session){
  const t = App.teamById(session.team_id);
  return !t || !(t.sectors||[]).length;
}

async function loadLogistics(App, session){
  try{
    const [items, data] = await Promise.all([
      App.apiGet("logistics_items", "select=id,name,has_size,sort_order&order=sort_order"),
      App.apiRpc("worker_equipment_get", {p_token: session.token})
    ]);
    L.items = items; L.data = data; L.error = null;
  }catch(e){
    if(/session/i.test(e.message)){ saveSession(App, null); App.S.view = "home"; }
    L.items = L.items || []; L.data = L.data || {equipment:[], requests:[]}; L.error = "שגיאה בטעינת הנתונים";
  }
  App.render();
}

function renderLogistics(App, session){
  const esc = App.escapeHtml;
  if(isMokedWorker(App, session)) return `<p class="muted">החלק הלוגיסטי מיועד למאבטחים בגזרות.</p>`;
  if(!L.items || !L.data){ loadLogistics(App, session); return `<p class="muted">טוען...</p>`; }
  const eqById = {}; (L.data.equipment||[]).forEach(e=>eqById[e.item_id]=e);
  const itemName = id=>{ const it=L.items.find(x=>x.id===id); return it?it.name:"?"; };
  const msgs = `${L.error?`<p class="shortage">${esc(L.error)}</p>`:""}${L.msg?`<p class="ok-msg" style="color:#1b7f3b;font-weight:600;">${esc(L.msg)}</p>`:""}`;

  // --- טופס ציוד - פעם אחת בלבד. אחר כך הרשימה מתעדכנת רק דרך בקשות שהמנהל מטפל בהן ---
  if(!L.data.submitted_at){
    return `
    <p>בפעם הראשונה, מלא/י את כל הציוד שנמצא ברשותך באופן קבוע: כמה יש לך מכל פריט, ומידה אם רלוונטי. פריט שאין לך - השאר/י 0. אחרי השליחה הרשימה מתעדכנת רק דרך בקשות ציוד שהמנהל מאשר.</p>
    <div style="overflow-x:auto;"><table>
      <thead><tr><th style="text-align:right;">פריט</th><th>כמות</th><th>מידה</th></tr></thead>
      <tbody>${L.items.map(it=>{
        const cur = eqById[it.id] || {};
        return `<tr><td style="text-align:right;">${esc(it.name)}</td>
          <td><input type="number" min="0" max="50" data-log-qty="${it.id}" value="${cur.quantity!=null?cur.quantity:0}" style="width:70px;"></td>
          <td>${it.has_size ? `<input type="text" maxlength="20" data-log-size="${it.id}" value="${esc(cur.size||"")}" placeholder="מידה" style="width:90px;">` : `<span class="muted">-</span>`}</td></tr>`;
      }).join("")}</tbody>
    </table></div>
    <div class="row" style="margin-top:10px;">
      <button class="btn ok" data-action="portal-log-save" ${L.busy?"disabled":""}>שמור ושלח</button>
    </div>
    ${msgs}`;
  }

  // --- אחרי שמולא: הציוד שברשותי + בקשת ציוד נוסף + הבקשות שלי ---
  const owned = L.items.filter(it=> eqById[it.id] && eqById[it.id].quantity>0);
  const reqs = L.data.requests || [];
  return `
    ${msgs}
    <h3 style="margin-top:0;">הציוד שברשותי</h3>
    ${owned.length? `<div style="overflow-x:auto;"><table>
      <thead><tr><th style="text-align:right;">פריט</th><th>כמות</th><th>מידה</th></tr></thead>
      <tbody>${owned.map(it=>`<tr><td style="text-align:right;">${esc(it.name)}</td><td>${eqById[it.id].quantity}</td><td>${esc(eqById[it.id].size||"-")}</td></tr>`).join("")}</tbody>
    </table></div>` : `<p class="muted">לא רשום ציוד.</p>`}

    <h3>בקשת החלפה / ציוד נוסף</h3>
    <p class="muted" style="margin-top:-6px;">הבקשה נשלחת למנהל שלך. הוא מסמן אם הפריט הוחלף או שנופק לך פריט נוסף, והרשימה שלך מתעדכנת לבד.</p>
    <div class="row">
      <div class="field"><label>פריט</label>
        <select id="logReqItem">${L.items.map(it=>`<option value="${it.id}">${esc(it.name)}</option>`).join("")}</select>
      </div>
      <div class="field"><label>כמות</label><input type="number" id="logReqQty" min="1" max="20" value="1" style="width:70px;"></div>
      <div class="field"><label>מידה</label><input type="text" id="logReqSize" maxlength="20" placeholder="אם רלוונטי" style="width:100px;"></div>
      <div class="field"><label>סיבה</label>
        <select id="logReqReason"><option value="">בחר/י...</option>${Object.keys(REQ_REASON).map(k=>`<option value="${k}">${REQ_REASON[k]}</option>`).join("")}</select>
      </div>
    </div>
    <div class="field"><label>הערה (לא חובה)</label><input type="text" id="logReqNote" maxlength="300" placeholder="למשל: המכנס הישן נקרע"></div>
    <button class="btn" data-action="portal-log-request" ${L.busy?"disabled":""}>שלח בקשה למנהל</button>

    <h3>הבקשות שלי</h3>
    ${reqs.length? `<div style="overflow-x:auto;"><table>
      <thead><tr><th>תאריך</th><th style="text-align:right;">פריט</th><th>כמות</th><th>מידה</th><th>סיבה</th><th>סטטוס</th></tr></thead>
      <tbody>${reqs.map(r=>`<tr><td>${App.fmtDateHeb(String(r.created_at).slice(0,10))}</td><td style="text-align:right;">${esc(itemName(r.item_id))}${r.note?`<br><span class="muted" style="font-size:.85em;">${esc(r.note)}</span>`:""}</td><td>${r.quantity}</td><td>${esc(r.size||"-")}</td><td>${esc(REQ_REASON[r.reason]||"-")}</td><td>${esc(REQ_STATUS[r.status]||r.status)}</td></tr>`).join("")}</tbody>
    </table></div>` : `<p class="muted">עוד לא שלחת בקשות.</p>`}`;
}

async function saveLogistics(App){
  const session = loadSession(App); if(!session) return App.render();
  const items = (L.items||[]).map(it=>{
    const q = document.querySelector(`[data-log-qty="${it.id}"]`);
    const sz = document.querySelector(`[data-log-size="${it.id}"]`);
    return {item_id: it.id, quantity: Math.max(0, Math.min(50, parseInt(q&&q.value,10)||0)), size: sz ? sz.value : null};
  });
  L.busy = true; L.msg = null; L.error = null; App.render();
  try{
    await App.apiRpc("worker_equipment_save", {p_token: session.token, p_items: items});
    L.busy = false; L.msg = "רשימת הציוד נשמרה ונשלחה.";
    L.data = null; App.render();
  }catch(e){ L.busy = false; L.error = "שגיאה בשמירה: " + e.message; App.render(); }
}

async function sendRequest(App){
  const session = loadSession(App); if(!session) return App.render();
  const itemId = parseInt(document.getElementById("logReqItem").value, 10);
  const qty = parseInt(document.getElementById("logReqQty").value, 10) || 1;
  const size = document.getElementById("logReqSize").value;
  const note = document.getElementById("logReqNote").value;
  const reason = document.getElementById("logReqReason").value;
  if(!reason){ L.error = "יש לבחור סיבה לבקשה"; L.msg = null; return App.render(); }
  L.busy = true; L.msg = null; L.error = null; App.render();
  try{
    await App.apiRpc("worker_equipment_request2", {p_token: session.token, p_item_id: itemId, p_quantity: qty, p_size: size, p_note: note, p_reason: reason});
    L.busy = false; L.msg = "הבקשה נשלחה למנהל.";
    L.data = null; App.render();
  }catch(e){ L.busy = false; L.error = "שגיאה בשליחה: " + e.message; App.render(); }
}

/* ================================================================
   מנהל: בקשות ציוד של העובדים שלו (דמו, 2026-10-07). נכנסים מתפריט המנהלים, בוחרים קב"ט,
   מזינים קוד קב"ט, ולכל בקשה ממתינה בוחרים: "הוחלף" (הכמות לא משתנה) / "נופק בנוסף" (הכמות עולה)
   / "דחה". קוד הקב"ט נשמר רק בזיכרון של הדף (לא בדפדפן) לצורך הפעולות.
   ================================================================ */
const M = { tile:null, code:null, list:null, error:null, msg:null, busy:false, session:null };
const MGR_STATUS = { pending:"ממתין", replaced:"הוחלף", issued:"נופק בנוסף", rejected:"נדחה" };

/* בקשות לוגיסטיות עוברות לקב"ט הגזרתי של העובד - כל צוות בנפרד, בלי איחוד "מאיר אזרואל":
   ירושלים -> דניאל כתב; בית שמש / ביתר עילית / מודיעין עילית -> אביחי קדוש. לבקשת סרגיי (2026-10-07) */
function mgrScope(App){
  const team = App.teamById(M.tile);
  return { codeTeamId: M.tile, teamIds: [team.id], label: team.name };
}
async function mgrLoad(App){
  try{
    if(M.session){
      M.list = await App.apiRpc("mgr_equipment_requests", {p_token: M.session.token});
      M.error = null; return App.render();
    }
    const sc = mgrScope(App);
    M.list = await App.apiRpc("manager_equipment_requests", {p_code_team_id: sc.codeTeamId, p_code: M.code, p_team_ids: sc.teamIds});
    M.error = null;
  }catch(e){
    M.list = null;
    if(/invalid code/i.test(e.message)){ M.code = null; M.error = "קוד שגוי"; }
    else M.error = e.message;
  }
  App.render();
}
function renderManagerRequests(App){
  const esc = App.escapeHtml;
  if(M.session) return renderManagerRequestsList(App, `<span class="backlink" data-action="go-home">◀ חזרה</span>`,
    mgrTeams(App, M.session.logistics_team_ids).map(t=>t.name).join(" · "));
  if(!M.tile){
    const tiles = (App.S.teams||[]).filter(tm=>!App.isMokedTeam(tm)).slice().sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(tm=>({repId:tm.id, label:tm.name}));
    return `<div class="card">
      <span class="backlink" data-action="go-home">◀ חזרה לתפריט המנהלים</span>
      <h2>בקשות ציוד — בחר/י קב"ט</h2>
      <div class="grid-teams">${tiles.map(t=>`<div class="team-tile" data-action="portal-mgr-tile" data-id="${t.repId}">${esc(t.label)}</div>`).join("")}</div>
    </div>`;
  }
  const sc = mgrScope(App);
  if(!M.code){
    return `<div class="card">
      <span class="backlink" data-action="portal-mgr-back">◀ קב"ט אחר</span>
      <h2>בקשות ציוד — ${esc(sc.label)}</h2>
      <div class="field"><label>קוד קב"ט</label><input type="password" id="mgrCode" placeholder="קוד"></div>
      <button class="btn" data-action="portal-mgr-login">כניסה</button>
      ${M.error? `<p class="shortage">${esc(M.error)}</p>`:""}
    </div>`;
  }
  return renderManagerRequestsList(App, `<span class="backlink" data-action="portal-mgr-back">◀ קב"ט אחר</span>`, sc.label);
}
function renderManagerRequestsList(App, backHtml, label){
  const esc = App.escapeHtml;
  if(M.list===null && !M.error){ mgrLoad(App); return `<div class="card"><p>טוען...</p></div>`; }
  const list = M.list || [];
  const pending = list.filter(r=>r.status==="pending");
  const done = list.filter(r=>r.status!=="pending");
  const row = (r, actions)=>`<tr>
      <td>${App.fmtDateHeb(String(r.created_at).slice(0,10))}</td>
      <td style="text-align:right;">${esc(r.worker_name)}</td>
      <td style="text-align:right;">${esc(r.item_name)}${r.note?`<br><span class="muted" style="font-size:.85em;">${esc(r.note)}</span>`:""}</td>
      <td>${r.quantity}</td><td>${esc(r.size||"-")}</td><td>${esc(REQ_REASON[r.reason]||"-")}</td><td>${r.current_quantity}</td>
      <td>${actions}</td></tr>`;
  return `<div class="card">
    ${backHtml}
    <h2>בקשות ציוד — ${esc(label)}</h2>
    ${M.error? `<p class="shortage">${esc(M.error)}</p>`:""}
    ${M.msg? `<p style="color:#1b7f3b;font-weight:600;">${esc(M.msg)}</p>`:""}
    <h3>ממתינות לטיפול (${pending.length})</h3>
    ${pending.length? `<div style="overflow-x:auto;"><table>
      <thead><tr><th>תאריך</th><th style="text-align:right;">עובד</th><th style="text-align:right;">פריט</th><th>כמות</th><th>מידה</th><th>סיבה</th><th>יש לו כרגע</th><th></th></tr></thead>
      <tbody>${pending.map(r=>row(r, `
        <button class="btn small" data-action="portal-mgr-resolve" data-id="${r.id}" data-res="replaced" ${M.busy?"disabled":""} title="הכמות שלו לא משתנה">הוחלף</button>
        <button class="btn small ok" data-action="portal-mgr-resolve" data-id="${r.id}" data-res="issued" ${M.busy?"disabled":""} title="הכמות שלו עולה בכמות שבבקשה">נופק בנוסף</button>
        <button class="btn small secondary" data-action="portal-mgr-resolve" data-id="${r.id}" data-res="rejected" ${M.busy?"disabled":""}>דחה</button>`)).join("")}</tbody>
    </table></div>` : `<p class="muted">אין בקשות ממתינות.</p>`}
    <h3>טופלו</h3>
    ${done.length? `<div style="overflow-x:auto;"><table>
      <thead><tr><th>תאריך</th><th style="text-align:right;">עובד</th><th style="text-align:right;">פריט</th><th>כמות</th><th>מידה</th><th>סיבה</th><th>יש לו כרגע</th><th>טיפול</th></tr></thead>
      <tbody>${done.map(r=>row(r, esc(MGR_STATUS[r.status]||r.status))).join("")}</tbody>
    </table></div>` : `<p class="muted">עוד לא טופלו בקשות.</p>`}
  </div>`;
}
async function mgrResolve(App, id, res){
  M.busy = true; M.msg = null; M.error = null; App.render();
  try{
    if(M.session) await App.apiRpc("mgr_resolve_equipment_request", {p_token: M.session.token, p_request_id: id, p_resolution: res});
    else { const sc = mgrScope(App); await App.apiRpc("manager_resolve_equipment_request", {p_code_team_id: sc.codeTeamId, p_code: M.code, p_team_ids: sc.teamIds, p_request_id: id, p_resolution: res}); }
    M.busy = false; M.msg = res==="issued" ? "סומן: נופק בנוסף — הכמות של העובד עודכנה." : res==="replaced" ? "סומן: הוחלף — הכמות של העובד לא השתנתה." : "הבקשה נדחתה.";
    M.list = null; App.render();
  }catch(e){ M.busy = false; M.error = e.message; App.render(); }
}

/* ================================================================
   סיסמאות מנהלים (בתפריט המנהלים הישן). רק עם קוד העריכה המשותף - סרגיי מגדיר/מאפס לכל מנהל.
   הקוד נשמר רק בזיכרון של המסך.
   ================================================================ */
const W = { pin:null, list:null, error:null, msg:null };
function renderManagerPasswords(App){
  const esc = App.escapeHtml;
  if(!W.list){
    return `<div class="card">
      <span class="backlink" data-action="go-home">◀ חזרה לתפריט המנהלים</span>
      <h2>סיסמאות מנהלים</h2>
      <div class="field"><label>קוד עריכה (PIN)</label><input type="password" id="pwPin" autocomplete="off"></div>
      <button class="btn" data-action="portal-pw-load">כניסה</button>
      ${W.error? `<p class="shortage">${esc(W.error)}</p>`:""}
    </div>`;
  }
  return `<div class="card">
    <span class="backlink" data-action="go-home">◀ חזרה לתפריט המנהלים</span>
    <h2>סיסמאות מנהלים</h2>
    <p class="muted">מנהל נכנס ממסך הכניסה הראשי: מקליד את שמו, בוחר בשורה שמסומנת "מנהל" ומזין את הסיסמה. שמירת סיסמה חדשה מנתקת אותו מכל מכשיר שהיה מחובר בו.</p>
    ${W.msg? `<p style="color:#1b7f3b;font-weight:600;">${esc(W.msg)}</p>`:""}
    ${W.error? `<p class="shortage">${esc(W.error)}</p>`:""}
    <table>
      <thead><tr><th style="text-align:right;">מנהל</th><th>סיסמה</th><th>סיסמה חדשה</th><th></th></tr></thead>
      <tbody>${W.list.map(m=>`<tr>
        <td style="text-align:right;">${esc(m.name)}</td>
        <td>${m.has_password?"✔ מוגדרת":'<span class="muted">לא מוגדרת</span>'}</td>
        <td><input type="password" id="pw_${m.id}" autocomplete="new-password" placeholder="לפחות 4 תווים" style="width:150px;"></td>
        <td><button class="btn small" data-action="portal-pw-save" data-id="${m.id}">שמור</button></td>
      </tr>`).join("")}</tbody>
    </table>
  </div>`;
}
async function pwLoad(App){
  const el = document.getElementById("pwPin");
  const pin = el ? el.value : W.pin;
  if(!pin){ W.error = "יש להזין קוד"; return App.render(); }
  try{
    W.list = await App.apiRpc("admin_list_managers", {p_pin: pin});
    W.pin = pin; W.error = null;
  }catch(e){ W.list = null; W.pin = null; W.error = /invalid pin/i.test(e.message) ? "קוד שגוי" : e.message; }
  App.render();
}
async function pwSave(App, id){
  const el = document.getElementById("pw_"+id);
  const pw = el ? el.value : "";
  if(pw.length < 4){ W.error = "הסיסמה צריכה להיות לפחות 4 תווים"; W.msg = null; return App.render(); }
  try{
    await App.apiRpc("admin_set_manager_password", {p_pin: W.pin, p_manager_id: id, p_password: pw});
    W.list = await App.apiRpc("admin_list_managers", {p_pin: W.pin});
    const m = W.list.find(x=>x.id===id);
    W.msg = `הסיסמה של ${m?m.name:"המנהל"} נשמרה.`; W.error = null;
  }catch(e){ W.error = e.message; W.msg = null; }
  App.render();
}

/* מסכי "הדרכה" (בינתיים "בקרוב") ו"לוגיסטי" */
function renderSection(App, view){
  const session = loadSession(App);
  if(!session){ App.S.view = "home"; return renderHome(App); }
  const title = view==="training" ? "הדרכה" : "לוגיסטי";
  const body = view==="logistics" ? renderLogistics(App, session) : renderTraining(App, session);
  return `<div class="card">
    <span class="backlink" data-action="go-home">◀ חזרה לאיזור האישי</span>
    <h2>${title}</h2>
    ${body}
  </div>`;
}

/* ================================================================
   ממשק מנהל (דמו, 2026-10-08). מה שמוצג נקבע לפי ההרשאות של המנהל בשרת (טבלת managers):
   - schedule_team_ids: סידור עבודה (טבלה מרוכזת, שיבוץ אוטומטי/ידני, פרסום, פלט, פתיחת הגשה,
     ניהול עובדים) לצוותים שלו - בלי קוד העריכה המשותף (הסשן שלו מחליף אותו). למשל מאיר אזרואל.
   - logistics_team_ids: בקשות ציוד של העובדים בצוותים שלו. למשל דניאל כתב (ירושלים) ואביחי קדוש
     (בית שמש / ביתר עילית / מודיעין עילית).
   ================================================================ */
function mgrTeams(App, ids){
  return (ids||[]).map(App.teamById).filter(Boolean).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
}
function renderManagerHome(App, ms){
  const esc = App.escapeHtml;
  if(!P.checkedMgr){
    P.checkedMgr = true;
    App.apiRpc("manager_session_info", {p_token: ms.token}).then(info=>{
      if(!info){ saveMgr(App, null); clearMgrMode(App); }
      else saveMgr(App, Object.assign({}, ms, info));
      App.render();
    }).catch(()=>{});
  }
  const tile = (action, title, sub)=>`
    <div class="team-tile" data-action="${action}">
      <div style="font-size:1.1em;font-weight:700;">${title}</div>
      ${sub?`<div class="muted" style="font-size:.85em;margin-top:4px;">${sub}</div>`:""}
    </div>`;
  const sched = mgrTeams(App, ms.schedule_team_ids);
  const logi = mgrTeams(App, ms.logistics_team_ids);
  const names = ts=>esc(ts.map(t=>(t.sectors&&t.sectors.length)?t.sectors.join(" / "):t.name).join(" · "));
  return `
  <div class="card">
    <div class="flexbar" style="justify-content:space-between;">
      <h2 style="margin:0;">שלום, ${esc(ms.name)}</h2>
      <button class="btn small secondary" data-action="portal-mgr-logout">יציאה</button>
    </div>
  </div>
  ${sched.length? `<div class="card">
    <h3>סידור עבודה</h3>
    <p class="muted" style="margin-top:-6px;">${names(sched)}</p>
    <div class="grid-teams">
      ${tile("portal-mh-agg", "טבלה מרוכזת ובניית סידור", "שיבוץ, פרסום, פלט ופתיחת הגשה")}
      ${tile("portal-mh-admin", "ניהול עובדים", "הוספה, קודים וסימונים")}
    </div>
  </div>`:""}
  ${logi.length? `<div class="card">
    <h3>לוגיסטי</h3>
    <p class="muted" style="margin-top:-6px;">${names(logi)}</p>
    <div class="grid-teams">${tile("portal-mh-equip", "בקשות ציוד", "החלפה / ציוד נוסף")}</div>
  </div>`:""}
  ${!sched.length && !logi.length ? `<div class="card"><p class="muted">אין עדיין הרשאות לממשק הזה.</p></div>`:""}`;
}
function enterMgrSchedule(App, ms, which){
  const S = App.S;
  const teams = mgrTeams(App, ms.schedule_team_ids);
  if(!teams.length) return App.render();
  S.pin = "mgr:" + ms.token; // הסשן של המנהל במקום קוד העריכה המשותף (לא נשמר בדפדפן)
  if(which==="agg"){
    const rep = teams[0];
    S.teamAccess = Object.assign({}, S.teamAccess, {[rep.id]: true});
    S.view = "aggregate"; S.ui = {teamId: rep.id};
  } else {
    S.view = "admin"; S.ui = {pinOk: true, teamIds: teams.map(t=>t.id), recipientLabel: ms.name};
  }
  App.render();
}

function renderHome(App){
  const ms = loadMgr(App);
  if(ms) return renderManagerHome(App, ms);
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
    if(shown.length===1){ P.selectedId = shown[0].key; P.code=""; App.render(); }
    return true;
  }
  return false;
}

async function doLogin(App){
  const codeEl = document.getElementById("portalCode");
  const code = codeEl ? codeEl.value : P.code;
  const sel = (P.workers||[]).find(w=>w.key===P.selectedId);
  if(!sel || !code){ P.error = sel && sel.kind==="m" ? "יש להזין סיסמה" : "יש להזין קוד אישי"; return App.render(); }
  P.busy = true; P.error = null; App.render();
  try{
    if(sel.kind==="m"){
      const res = await App.apiRpc("manager_login", {p_manager_id: sel.id, p_password: code});
      P.busy = false;
      if(!res){ P.error = "סיסמה שגויה"; P.code=""; return App.render(); }
      saveSession(App, null); saveMgr(App, res);
      P.selectedId = null; P.code = ""; P.query = ""; P.checkedMgr = true;
      return App.render();
    }
    const res = await App.apiRpc("worker_login", {p_worker_id: sel.id, p_code: code});
    P.busy = false;
    if(!res){ P.error = "קוד שגוי"; P.code=""; return App.render(); }
    saveMgr(App, null); clearMgrMode(App);
    saveSession(App, res);
    P.selectedId = null; P.code = ""; P.query = ""; P.shifts = null; P.checkedSession = true; T.data = null;
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
    saveSession(App, null); P.shifts = null; P.checkedSession = false; L.data = null; L.items = null; T.data = null;
    return App.render();
  }
  if(a==="portal-go-training"){ S.view = "training"; S.ui = {}; T.data = null; return App.render(); }
  if(a==="portal-go-logistics"){ S.view = "logistics"; S.ui = {}; T.data = null; L.data = null; L.msg = null; L.error = null; return App.render(); }
  if(a==="portal-log-save") return saveLogistics(App);
  if(a==="portal-log-request") return sendRequest(App);
  if(a==="portal-mgr-open"){ S.view = "equipreq"; S.ui = {}; M.session=null; M.tile=null; M.code=null; M.list=null; M.error=null; M.msg=null; return App.render(); }
  if(a==="portal-mh-equip"){ const ms = loadMgr(App); if(!ms) return App.render(); S.view = "equipreq"; S.ui = {}; M.session = ms; M.list=null; M.error=null; M.msg=null; return App.render(); }
  if(a==="portal-mh-agg" || a==="portal-mh-admin"){ const ms = loadMgr(App); if(!ms) return App.render(); return enterMgrSchedule(App, ms, a==="portal-mh-agg"?"agg":"admin"); }
  if(a==="portal-mgr-logout"){
    const ms = loadMgr(App);
    if(ms) App.apiRpc("manager_logout", {p_token: ms.token}).catch(()=>{});
    saveMgr(App, null); clearMgrMode(App); P.checkedMgr = false; M.session = null;
    S.view = "home"; S.ui = {};
    return App.render();
  }
  if(a==="portal-pw-load") return pwLoad(App);
  if(a==="portal-pw-save") return pwSave(App, el.dataset.id);
  if(a==="portal-mgr-tile"){ M.tile = el.dataset.id; M.code=null; M.list=null; M.error=null; M.msg=null; return App.render(); }
  if(a==="portal-mgr-back"){ M.tile=null; M.code=null; M.list=null; M.error=null; M.msg=null; return App.render(); }
  if(a==="portal-mgr-login"){
    const v = (document.getElementById("mgrCode")||{}).value;
    if(!v){ M.error = "יש להזין קוד"; return App.render(); }
    M.code = v; M.list = null; M.error = null; return mgrLoad(App);
  }
  if(a==="portal-mgr-resolve") return mgrResolve(App, el.dataset.id, el.dataset.res);
  if(a==="portal-go-submit"){
    T.data = null;
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
    .portal-row:hover{background:#eef4fb;}
    .portal-tasks{display:flex;flex-direction:column;gap:6px;}
    .portal-task{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #e3e9f0;border-radius:8px;cursor:pointer;background:#fff;}
    .portal-task:hover{background:#f4f8fc;}
    .portal-task-icon{font-size:1.15em;width:1.4em;text-align:center;}
    .portal-task-icon.done{color:#1b7f3b;font-weight:800;}`;
  (document.head||document.documentElement).appendChild(st);
})();

window.Portal = { renderHome, renderSection, renderManagerRequests, renderManagerPasswords, resetPasswordsScreen(){ W.pin=null; W.list=null; W.error=null; W.msg=null; }, onClick, onInput, onKey, resetState(){ P.shifts=null; P.checkedSession=false; } };
})();
