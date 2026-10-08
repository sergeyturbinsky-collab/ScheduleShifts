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
    P.shifts = (await App.apiRpc("worker_my_shifts", {p_token: session.token, p_from: from, p_to: to})) || [];
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
  controlsForMainScreen(T.data.controls).forEach(c=>rows.push({done: !!c.read_at, action:"portal-open-control", id:c.id,
    label: `קריאת סיכום בקרה: ${c.title}`, sub: fmtD(App, c.exercise_date)}));
  if(T.data.equipment_done !== null && T.data.equipment_done !== undefined){
    rows.push({done: !!T.data.equipment_done, action:"portal-go-logistics", label: "מילוי סטטוס ציוד", sub: ""});
  }
  return `<div class="portal-tasks">${rows.map(r=>`
    <div class="portal-task" data-action="${r.action}"${r.id?` data-id="${r.id}"`:""}>
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
  if(!list.length) return `<h3>לומדות</h3><p class="muted">עדיין לא פורסמו לומדות.</p>` + renderWorkerTrainingExtras(App, session);
  return `<h3>לומדות</h3><div style="overflow-x:auto;"><table>
    <thead><tr><th style="text-align:right;">לומדה</th><th>פורסמה</th><th>סטטוס</th></tr></thead>
    <tbody>${list.map(t=>`<tr>
      <td style="text-align:right;">${esc(t.title)}</td>
      <td>${App.fmtDateHeb(String(t.published_at).slice(0,10))}</td>
      <td>${t.passed ? `<span class="portal-task-icon done">✔</span> בוצע ${t.completed_at?App.fmtDateHeb(String(t.completed_at).slice(0,10)):""}` : `🕒 טרם בוצע`}</td>
    </tr>`).join("")}</tbody>
  </table></div>` + renderWorkerTrainingExtras(App, session);
}

/* ================================================================
   התראות לטלפון (לבקשת סרגיי, 2026-10-08): האתר מותקן כאפליקציה במסך הבית, וכל דבר חדש באיזור האישי
   (בקרה, תוכן, לומדה, פרסום סידור, טיפול בבקשת ציוד) מקפיץ התראה. פעם ביומיים - תזכורת על משימות שלא בוצעו
   (לא בין שישי 14:00 לשבת 21:00). השליחה עצמה בשרת (push-send); כאן רק ההרשמה של המכשיר.
   ================================================================ */
const N = { state:null, checking:false, busy:false, error:null };
function isIOS(){ return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1); }
function isStandalone(){ return (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone===true; }
function pushSupported(){ return ("serviceWorker" in navigator) && ("PushManager" in window) && ("Notification" in window); }
function b64ToU8(b64){
  const pad = "=".repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g,"+").replace(/_/g,"/"));
  return Uint8Array.from(raw, c=>c.charCodeAt(0));
}
async function swReg(){
  let reg = await navigator.serviceWorker.getRegistration();
  if(!reg) reg = await navigator.serviceWorker.register("sw.js");
  return reg;
}
async function saveSub(App, session, sub){
  const j = sub.toJSON();
  await App.apiRpc("worker_push_subscribe", {p_token:session.token, p_endpoint:j.endpoint, p_p256dh:j.keys.p256dh, p_auth:j.keys.auth, p_ua:String(navigator.userAgent).slice(0,200)});
}
async function checkPush(App, session){
  if(N.checking) return; N.checking = true;
  try{
    if(!pushSupported()) N.state = (isIOS() && !isStandalone()) ? "ios-install" : "unsupported";
    else if(Notification.permission==="denied") N.state = "denied";
    else{
      const reg = await swReg();
      const sub = await reg.pushManager.getSubscription();
      if(sub && Notification.permission==="granted"){
        const known = await App.apiRpc("worker_push_status", {p_token:session.token, p_endpoint:sub.endpoint});
        if(!known) await saveSub(App, session, sub); // המכשיר רשום אבל לא אצלנו (למשל עובד אחר התחבר קודם) - מעדכנים
        N.state = "on";
      } else N.state = "off";
    }
  }catch(e){ N.state = "off"; }
  N.checking = false; App.render();
}
async function enablePush(App, session){
  N.busy = true; N.error = null; App.render();
  try{
    const perm = await Notification.requestPermission();
    if(perm !== "granted"){ N.state = perm==="denied" ? "denied" : "off"; N.busy = false; return App.render(); }
    const key = await App.apiRpc("push_public_key", {});
    if(!key) throw new Error("ההתראות עוד לא הוגדרו בשרת");
    const reg = await swReg();
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub) sub = await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:b64ToU8(key)});
    await saveSub(App, session, sub);
    N.state = "on";
  }catch(e){ N.error = "לא הצלחנו להפעיל התראות: " + e.message; }
  N.busy = false; App.render();
}
function renderPushCard(App, session){
  if(N.state===null){ checkPush(App, session); return ""; }
  if(N.state==="on") return "";
  if(N.state==="unsupported") return "";
  let body;
  if(N.state==="ios-install") body = `<p style="margin:6px 0;">כדי לקבל התראות באייפון צריך קודם להוסיף את האיזור האישי למסך הבית:</p>
      <ol style="margin:6px 0;padding-inline-start:20px;line-height:1.9;">
        <li>לוחצים על כפתור השיתוף <b>⬆️</b> בתחתית ספארי</li>
        <li>בוחרים <b>"הוסף למסך הבית"</b> ואז <b>"הוסף"</b></li>
        <li>פותחים את האיזור האישי מהאייקון החדש במסך הבית ונכנסים שוב</li>
      </ol>
      <p class="muted" style="font-size:.85em;margin:4px 0 0;">נדרש iOS 16.4 ומעלה.</p>`;
  else if(N.state==="denied") body = `<p style="margin:6px 0;">ההתראות חסומות במכשיר הזה. כדי לפתוח: הגדרות הדפדפן (או הגדרות הטלפון ← התראות) ← לאפשר התראות לאיזור האישי, ואז לרענן את הדף.</p>`;
  else body = `<p style="margin:6px 0;">כדאי להפעיל התראות כדי לדעת מיד כשיש משהו חדש: סידור שפורסם, בקרה, לומדה או תוכן חדש. פעם ביומיים תגיע גם תזכורת על משימות שלא בוצעו.</p>
      <button class="btn ok" data-action="portal-push-enable" ${N.busy?"disabled":""}>${N.busy?"מפעיל...":"🔔 הפעלת התראות"}</button>
      ${N.error?`<p class="shortage" style="margin-top:6px;">${App.escapeHtml(N.error)}</p>`:""}
      ${!isStandalone() && !isIOS() ? `<p class="muted" style="font-size:.85em;margin:8px 0 0;">טיפ: באנדרואיד אפשר להוסיף את האיזור האישי למסך הבית מתפריט הדפדפן ⋮ ← "הוספה למסך הבית" / "התקנת אפליקציה".</p>`:""}`;
  return `<div class="card" style="border-color:#0c3a6e;"><h3 style="margin-top:0;">📲 התראות לטלפון</h3>${body}</div>`;
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
      ${tile("portal-go-training", "הדרכה", "לומדות, בקרות ותכנים")}
      ${isMokedWorker(App, session) ? "" : tile("portal-go-logistics", "לוגיסטי", "הציוד שלי ובקשת ציוד")}
    </div>
    ${N.state==="on" ? `<p class="muted" style="margin:10px 0 0;font-size:.85em;">🔔 התראות פעילות במכשיר הזה</p>` : ""}
  </div>
  ${renderPushCard(App, session)}
  <div class="portal-cols">
    <div class="portal-col-main">
      <div class="card">
        <h3>המשמרות שלי</h3>
        ${renderMyShifts(App, session)}
      </div>
      <div class="card">
        <h3>משימות פתוחות</h3>
        ${renderTasks(App, session)}
      </div>
    </div>
    <div class="portal-col-side">
      <div class="card">
        <h3>🔔 עדכונים והודעות</h3>
        ${renderWorkerUpdates(App, session)}
      </div>
    </div>
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

/* ================================================================
   הדרכה, בקרות, תכנים והודעות (דמו, 2026-10-08) - לבקשת סרגיי:
   - מאבטח: "הבקרות שלי" (סיכומי תרגיל שישראל כותב), כל בקרה חדשה = משימת קריאה, ואישור "קראתי"
     בסוף המסמך. תכנים/סרטונים והודעות - בלשונית הדרכה, וחדשים מופיעים ב"עדכונים" במסך הראשי.
   - קב"ט גזרתי (דניאל, אביחי, עידן, אלירן): סיכומי התרגילים של המאבטחים שלו, כל הרובריקות של
     ישראל, והתראות במסך הראשי (פרסומים חדשים, סיכומי תרגיל חדשים, בקשות ציוד ממתינות).
   - ישראל בודילובסקי: לומדות ואחוזי ביצוע, פרו-ריידינג (כולל תמונות דו"חות שהעובד לא רואה),
     קליטת עובד חדש, סיכומי תרגילים, תכנים וסרטונים, הודעות לקב"טים, הודעות לכלל המאבטחים והקב"טים.
   ================================================================ */
const POST_KIND = { content:"תכנים וסרטונים", kabat:"הודעה לקב\"טים", all:"הודעה לכלל המאבטחים והקב\"טים" };
const F = { data:null };            // פיד של העובד
const K = { data:null };            // פיד והתראות של הקב"ט
const I = { data:null, showAll:false }; // לוח הבקרה של ישראל
const PV = { page:null, args:{}, stack:[], data:null, form:{}, msg:null, error:null, busy:false, filter:"", onlyOpen:true };

function fmtD(App, s){ return s ? App.fmtDateHeb(String(s).slice(0,10)) : ""; }
function pct(n, d){ return d ? Math.round(n*100/d) : 0; }
function workerSector(App, w){
  if(w.city_sectors && w.city_sectors.length) return w.city_sectors.join(" / ");
  const t = App.teamById(w.team_id);
  return t ? ((t.sectors&&t.sectors.length) ? t.sectors.join(" / ") : t.name) : "";
}
function youtubeId(url){
  const m = String(url||"").match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/);
  return m ? m[1] : null;
}
/* הקטנת תמונה בדפדפן לפני שליחה (עד 1600 פיקסל, JPEG) */
function compressImage(file){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onerror = ()=>reject(new Error("לא הצלחתי לקרוא את הקובץ"));
    fr.onload = ()=>{
      const img = new Image();
      img.onerror = ()=>reject(new Error("הקובץ אינו תמונה"));
      img.onload = ()=>{
        const max = 1600, sc = Math.min(1, max/Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width*sc); c.height = Math.round(img.height*sc);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.8));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
function fmtSize(n){ n = Number(n)||0; return n>=1048576 ? (n/1048576).toFixed(1)+" MB" : Math.max(1,Math.round(n/1024))+" KB"; }
/* קבצים מצורפים לפרסום: נפתחים דרך כתובת זמנית (שעה) שהשרת מנפיק רק למי שמורשה לראות את הפרסום */
function attachmentsHtml(App, post, who){
  const esc = App.escapeHtml;
  const atts = (post && post.attachments) || [];
  if(!atts.length) return "";
  return `<div style="margin-top:14px;"><b>קבצים מצורפים</b>${atts.map(a=>`
    <div class="portal-wrow"><span>📎 ${esc(a.name||"קובץ")}</span> <span class="muted">${fmtSize(a.size)}</span>
      <button class="btn small secondary" data-action="portal-att-open" data-post="${post.id}" data-path="${esc(a.path)}" data-who="${who}">פתיחה</button></div>`).join("")}</div>`;
}
function docHtml(App, title, meta, body, link, image, attHtml){
  const esc = App.escapeHtml;
  const yt = youtubeId(link);
  return `<div class="portal-doc">
    <h2 style="margin-top:0;">${esc(title)}</h2>
    ${meta?`<p class="muted" style="margin-top:-6px;">${esc(meta)}</p>`:""}
    ${body?`<div style="white-space:pre-wrap;line-height:1.7;">${esc(body)}</div>`:""}
    ${yt?`<div style="position:relative;padding-top:56.25%;margin-top:12px;"><iframe src="https://www.youtube.com/embed/${yt}" style="position:absolute;inset:0;width:100%;height:100%;border:0;" allowfullscreen></iframe></div>`
        : (link?`<p style="margin-top:12px;"><a href="${esc(link)}" target="_blank" rel="noopener">פתיחת הקישור ↗</a></p>`:"")}
    ${image?`<img src="${image}" alt="" style="max-width:100%;margin-top:12px;border-radius:8px;">`:""}
    ${attHtml||""}
  </div>`;
}

/* ---------- מאבטח ---------- */
function controlsForMainScreen(list){
  if(!list || !list.length) return [];
  const latest = list[list.length-1];
  return list.filter(c=> !c.read_at || c.id===latest.id);
}
async function loadFeed(App, session){
  F.data = {loading:true};
  try{ F.data = {posts: await App.apiRpc("worker_feed", {p_token: session.token}) || []}; }
  catch(e){ F.data = {posts:[], error:"שגיאה בטעינת העדכונים"}; }
  App.render();
}
function renderWorkerUpdates(App, session){
  const esc = App.escapeHtml;
  if(!F.data){ loadFeed(App, session); return `<p class="muted">טוען...</p>`; }
  if(F.data.loading) return `<p class="muted">טוען...</p>`;
  const unread = (F.data.posts||[]).filter(p=>!p.read);
  if(!unread.length) return `<p class="muted">אין עדכונים חדשים. <span class="backlink" data-action="portal-go-training">לכל התכנים וההודעות</span></p>`;
  return `<div class="portal-tasks">${unread.map(p=>`
    <div class="portal-task" data-action="portal-open-post" data-id="${p.id}">
      <span class="portal-task-icon">🔔</span>
      <span><span style="font-weight:600;">${esc(p.title)}</span> <span class="muted" style="font-size:.85em;">${esc(POST_KIND[p.kind]||"")} · ${fmtD(App,p.created_at)}</span></span>
    </div>`).join("")}</div>`;
}
function renderControlDoc(App, session){
  const esc = App.escapeHtml;
  const back = `<span class="backlink" data-action="portal-doc-back">◀ חזרה להדרכה</span>`;
  if(!T.control){
    App.apiRpc("worker_control_get", {p_token: session.token, p_id: T.controlOpen})
      .then(r=>{ T.control = r; App.render(); })
      .catch(e=>{ T.control = {error: e.message}; App.render(); });
    T.control = {loading:true};
  }
  if(T.control.loading) return back + `<p class="muted">טוען...</p>`;
  if(T.control.error) return back + `<p class="shortage">${esc(T.control.error)}</p>`;
  const c = T.control;
  return back + docHtml(App, c.title, `סיכום בקרת תרגיל · ${fmtD(App,c.exercise_date)}${c.author?` · ${c.author}`:""}`, c.summary) + `
    <div style="margin-top:18px;border-top:1px solid #e3e9f0;padding-top:12px;">
      ${c.read_at ? `<span class="portal-task-icon done">✔</span> קראת את הסיכום ב-${fmtD(App,c.read_at)}`
                  : `<button class="btn ok" data-action="portal-control-read" ${PV.busy?"disabled":""}>קראתי</button>`}
    </div>`;
}
function renderPostDoc(App){
  const p = T.postOpen;
  return `<span class="backlink" data-action="portal-doc-back">◀ חזרה להדרכה</span>` + (T.attError?`<p class="shortage">${App.escapeHtml(T.attError)}</p>`:"") +
    docHtml(App, p.title, `${POST_KIND[p.kind]||""} · ${fmtD(App,p.created_at)}`, p.body, p.link_url, p.image_data, attachmentsHtml(App, p, "w"));
}
function renderWorkerTrainingExtras(App, session){
  const esc = App.escapeHtml;
  const ctrls = (T.data && T.data.controls ? T.data.controls : []).slice().reverse();
  if(!F.data){ loadFeed(App, session); }
  const posts = (F.data && F.data.posts) || [];
  const postList = kind=>{
    const ps = posts.filter(p=>p.kind===kind);
    if(!ps.length) return `<p class="muted">אין עדיין פרסומים.</p>`;
    return `<div class="portal-tasks">${ps.map(p=>`<div class="portal-task" data-action="portal-open-post" data-id="${p.id}">
      <span class="portal-task-icon">${p.read?"📄":"🔔"}</span>
      <span><span style="font-weight:600;">${esc(p.title)}</span> <span class="muted" style="font-size:.85em;">${fmtD(App,p.created_at)}${youtubeId(p.link_url)?" · סרטון":""}</span></span></div>`).join("")}</div>`;
  };
  return `
    <h3>הבקרות שלי</h3>
    ${ctrls.length ? `<div class="portal-tasks">${ctrls.map(c=>`<div class="portal-task" data-action="portal-open-control" data-id="${c.id}">
      <span class="portal-task-icon ${c.read_at?"done":""}">${c.read_at?"✔":"🕒"}</span>
      <span><span style="font-weight:600;">${esc(c.title)}</span> <span class="muted" style="font-size:.85em;">${fmtD(App,c.exercise_date)}${c.read_at?"":" · טרם נקרא"}</span></span></div>`).join("")}</div>`
      : `<p class="muted">עדיין אין סיכומי בקרות.</p>`}
    <h3>תכנים וסרטונים</h3>${postList("content")}
    <h3>הודעות</h3>${postList("all")}`;
}

/* ---------- קב"ט גזרתי ---------- */
async function loadKabat(App, ms){
  K.data = {loading:true};
  try{ K.data = (await App.apiRpc("kabat_feed", {p_token: ms.token})) || {posts:[]}; }
  catch(e){ K.data = {error:"שגיאה בטעינת ההתראות", posts:[]}; }
  App.render();
}
function renderKabatUpdates(App, ms){
  const esc = App.escapeHtml;
  if(!K.data){ loadKabat(App, ms); return `<p class="muted">טוען...</p>`; }
  if(K.data.loading) return `<p class="muted">טוען...</p>`;
  if(K.data.error) return `<p class="shortage">${esc(K.data.error)}</p>`;
  const rows = [];
  if(K.data.new_controls) rows.push(`<div class="portal-task" data-action="portal-pv" data-page="k-controls"><span class="portal-task-icon">🔔</span><span><b>${K.data.new_controls} סיכומי תרגיל חדשים</b> של המאבטחים שלך</span></div>`);
  if(K.data.pending_requests) rows.push(`<div class="portal-task" data-action="portal-mh-equip"><span class="portal-task-icon">🔔</span><span><b>${K.data.pending_requests} בקשות ציוד</b> ממתינות לטיפול</span></div>`);
  (K.data.posts||[]).filter(p=>!p.read).forEach(p=>rows.push(`<div class="portal-task" data-action="portal-k-open-post" data-id="${p.id}"><span class="portal-task-icon">🔔</span>
    <span><span style="font-weight:600;">${esc(p.title)}</span> <span class="muted" style="font-size:.85em;">${esc(POST_KIND[p.kind]||"")} · ${fmtD(App,p.created_at)}</span></span></div>`));
  return rows.length ? `<div class="portal-tasks">${rows.join("")}</div>` : `<p class="muted">אין עדכונים חדשים.</p>`;
}

/* ---------- ישראל: לוח הבקרה ---------- */
const ONB_KEYS = ["general","training","kabat","moked","weapon","logistics"];
function onbStations(App, w){
  const t = App.teamById(w.team_id) || {};
  const jlm = (t.sectors||[]).some(s=>s==="ירושלים" || s==="סובב ירושלים");
  return [
    {key:"general",   who:"שיחה כללית", what:"היכרות ותיאום ציפיות"},
    {key:"training",  who:"ישראל בודילובסקי (קב\"ט הדרכות)", what:"הדרכה"},
    {key:"kabat",     who:`קב"ט ${t.name||""}`, what:"נהלים והכרת גזרה"},
    {key:"moked",     who:"סרגיי טורבינסקי", what:"מוקד ומכשירים"},
    {key:"weapon",    who: jlm ? "גלי פריד" : "מנהל המפעל", what:"חתימה על נשק ותדריך נשק"},
    {key:"logistics", who:"ניר חטבי", what:"ציוד לוגיסטי"}
  ];
}
function onbDone(w){ return (w.items||[]).filter(i=>i.done).length; }
async function loadIsrael(App, ms){
  I.data = {loading:true};
  try{
    const [ov, onb, ctrls, posts] = await Promise.all([
      App.apiRpc("trn_overview", {p_token: ms.token}),
      App.apiRpc("trn_onboarding_list", {p_token: ms.token}),
      App.apiRpc("trn_controls_list", {p_token: ms.token}),
      App.apiRpc("trn_posts_list", {p_token: ms.token})
    ]);
    I.data = {ov, onb, ctrls, posts};
  }catch(e){
    if(/session/i.test(e.message)){ saveMgr(App, null); clearMgrMode(App); }
    I.data = {error: "שגיאה בטעינת הנתונים"};
  }
  App.render();
}
function renderIsraelDashboard(App, ms){
  const esc = App.escapeHtml;
  if(!I.data){ loadIsrael(App, ms); return `<div class="card"><p class="muted">טוען...</p></div>`; }
  if(I.data.loading) return `<div class="card"><p class="muted">טוען...</p></div>`;
  if(I.data.error) return `<div class="card"><p class="shortage">${esc(I.data.error)}</p></div>`;
  const {ov, onb, ctrls, posts} = I.data;
  const trs = ov.trainings||[];
  const progs = ov.programs||[];
  const notDoneOnb = onb.filter(w=>onbDone(w)<ONB_KEYS.length).length;
  const waitTraining = onb.filter(w=>!(w.items||[]).some(i=>i.key==="training" && i.done)).length;
  /* משימות פתוחות של ישראל (2026-10-08): התחנה שלו בקליטת עובד חדש, והדרכות שעוד לא כל המאבטחים עברו.
     משימה שהושלמה נשארת עם ✔ (כמו אצל המאבטחים). */
  const tasks = [];
  tasks.push({done: waitTraining===0, page:"trn-onboarding", open:true,
    label:"הדרכה לעובדים חדשים (תחנת הדרכה בקליטה)", sub: waitTraining ? `${waitTraining} עובדים ממתינים` : "כולם עברו"});
  progs.forEach(p=>tasks.push({done: p.eligible>0 && p.done>=p.eligible, page:"trn-program", id:p.id,
    label:`השלמת ${p.name}`, sub: p.done>=p.eligible ? "כולם ביצעו" : `נותרו ${p.eligible-p.done} מאבטחים`}));
  const shown = I.showAll ? trs : trs.slice(0,3);
  const tile = (page, kind, title, big, sub)=>`<div class="portal-dtile" data-action="portal-pv" data-page="${page}"${kind?` data-kind="${kind}"`:""}>
      <div class="portal-dtile-t">${title}</div><div class="portal-dtile-n">${big}</div><div class="portal-dtile-s">${sub}</div></div>`;
  const sumDone = progs.reduce((x,p)=>x+p.done,0), sumElig = progs.reduce((x,p)=>x+p.eligible,0);
  const unreadCtl = ctrls.filter(c=>!c.read_at).length;
  const cnt = k=>posts.filter(p=>p.kind===k).length;
  return `
  <div class="card">
    <h3>משימות פתוחות</h3>
    <div class="portal-tasks">${tasks.map(t=>`
      <div class="portal-task" data-action="portal-pv" data-page="${t.page}"${t.id?` data-id="${t.id}"`:""}${t.open?` data-open="1"`:""}>
        <span class="portal-task-icon ${t.done?"done":""}" title="${t.done?"בוצע":"טרם בוצע"}">${t.done?"✔":"🕒"}</span>
        <span><span style="font-weight:600;">${esc(t.label)}</span> <span class="muted" style="font-size:.85em;">${esc(t.sub)}</span></span>
      </div>`).join("")}</div>
  </div>
  <div class="card">
    <h3>לומדות ובחנים</h3>
    ${trs.length ? `<div class="portal-grid3">${shown.map(t=>`<div class="portal-dtile" data-action="portal-pv" data-page="trn-training" data-id="${t.id}">
        <div class="portal-dtile-t">${esc(t.title)}</div><div class="portal-dtile-n">${pct(t.passed,t.eligible)}%</div>
        <div class="portal-dtile-s">${t.passed}/${t.eligible} · ${fmtD(App,t.published_at)}</div></div>`).join("")}</div>
      ${trs.length>3 ? `<button class="btn small secondary" data-action="portal-trn-more" style="margin-top:8px;">${I.showAll?"הצג פחות":`עוד (${trs.length-3})`}</button>`:""}`
    : `<p class="muted" style="margin:0;">עדיין לא הועלו לומדות. כשיהיו — כאן יופיעו אחוזי הביצוע של כל לומדה.</p>`}
  </div>
  <div class="card">
    <div class="portal-grid3">
      ${tile("trn-programs", "", "סטטוס הדרכות", `${pct(sumDone,sumElig)}%`, `${progs.length} הדרכות`)}
      ${tile("trn-onboarding", "", "קליטת עובד חדש", notDoneOnb, `לא השלימו את כל התחנות`)}
      ${tile("trn-controls", "", "סיכומי תרגילים", ctrls.length, unreadCtl ? `${unreadCtl} טרם נקראו` : "סיכומים")}
      ${tile("trn-posts", "content", "תכנים וסרטונים", cnt("content"), "לכלל המאבטחים והקב\"טים")}
      ${tile("trn-posts", "kabat", "הודעות לקב\"טים", cnt("kabat"), "רק הקב\"טים רואים")}
      ${tile("trn-posts", "all", "הודעות לכלל המאבטחים", cnt("all"), "וגם הקב\"טים שלהם")}
    </div>
  </div>`;
}

/* ---------- עמודי משנה (view "pview") ---------- */
const PV_TITLES = { "trn-training":"לומדה", "trn-program":"סטטוס הדרכה", "trn-reports":"דו\"חות הדרכה", "trn-onboarding":"קליטת עובד חדש",
  "trn-onb-worker":"קליטת עובד חדש", "trn-controls":"סיכומי תרגילים", "trn-control-new":"סיכום בקרה חדש", "trn-posts":"פרסומים",
  "trn-post-new":"פרסום חדש", "trn-programs":"סטטוס הדרכות", "k-controls":"סיכומי תרגילים", "k-feed":"תכנים והודעות", "control":"סיכום בקרת תרגיל", "post":"פרסום" };
function pvTitle(){ return PV_TITLES[PV.page] || ""; }
function pvGo(App, page, args, push){
  if(push !== false && App.S.view==="pview" && PV.page) PV.stack.push({page:PV.page, args:PV.args});
  if(App.S.view!=="pview") PV.stack = [];
  PV.page = page; PV.args = args||{}; PV.data = null; PV.msg = null; PV.error = null; PV.busy = false;
  if(page==="trn-control-new" || page==="trn-post-new") PV.form = {};
  App.S.view = "pview"; App.S.ui = {};
  App.render();
}
function pvBack(App){
  const prev = PV.stack.pop();
  if(!prev){ PV.page = null; App.S.view = "home"; App.S.ui = {}; I.data = null; K.data = null; return App.render(); }
  PV.page = prev.page; PV.args = prev.args; PV.data = null; PV.msg = null; PV.error = null;
  App.render();
}
function pvLoad(App, fn, args){
  PV.data = {loading:true};
  App.apiRpc(fn, args).then(r=>{ PV.data = {r}; App.render(); })
    .catch(e=>{ PV.data = {error: e.message}; App.render(); });
}
function groupedBySector(App, workers, isDone, rowHtml, doneLabel, notLabel){
  const esc = App.escapeHtml;
  const groups = {};
  workers.forEach(w=>{ const s = workerSector(App, w) || "ללא גזרה"; (groups[s] = groups[s]||[]).push(w); });
  return Object.keys(groups).sort((a,b)=>a.localeCompare(b,"he")).map(sec=>{
    const ws = groups[sec], done = ws.filter(isDone), not = ws.filter(w=>!isDone(w));
    return `<div class="portal-group">
      <h3 style="margin:14px 0 6px;">${esc(sec)} <span class="muted" style="font-size:.8em;">${pct(done.length, ws.length)}% (${done.length}/${ws.length})</span></h3>
      <div class="portal-sub done">${doneLabel} (${done.length})</div>${done.map(rowHtml).join("") || '<div class="muted portal-wrow">—</div>'}
      <div class="portal-sub">${notLabel} (${not.length})</div>${not.map(rowHtml).join("") || '<div class="muted portal-wrow">—</div>'}
    </div>`;
  }).join("");
}
function toLocalInput(iso){
  if(!iso) return "";
  const d = new Date(iso), p = n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDT(App, iso){
  if(!iso) return "";
  const d = new Date(iso), p = n=>String(n).padStart(2,"0");
  return `${App.fmtDateHeb(App.fmtDate(d))} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function renderPView(App){
  const esc = App.escapeHtml;
  const ms = loadMgr(App);
  if(!ms){ App.S.view = "home"; return renderHome(App); }
  const tok = ms.token;
  const back = `<span class="backlink" data-action="portal-pv-back">◀ חזרה</span>`;
  const msgs = `${PV.error?`<p class="shortage">${esc(PV.error)}</p>`:""}${PV.msg?`<p style="color:#1b7f3b;font-weight:600;">${esc(PV.msg)}</p>`:""}`;
  const wrap = inner=>`<div class="card">${back}${inner}</div>`;
  const loading = ()=>wrap(`<p class="muted">טוען...</p>`);
  const pg = PV.page, a = PV.args;
  const needLoad = (fn, args)=>{ if(!PV.data){ pvLoad(App, fn, args); return true; } return !!PV.data.loading; };
  if(PV.data && PV.data.error) return wrap(`<p class="shortage">${esc(PV.data.error)}</p>`);

  if(pg==="trn-training"){
    if(needLoad("trn_training_detail", {p_token:tok, p_training_id:a.id})) return loading();
    const r = PV.data.r, ws = r.workers||[];
    const row = w=>`<div class="portal-wrow">${esc(w.name)}${w.passed&&w.completed_at?` <span class="muted">· ${fmtD(App,w.completed_at)}</span>`:""}</div>`;
    return wrap(`<h2>${esc(r.training?r.training.title:"")}</h2>
      <p class="muted">פורסמה ${fmtD(App, r.training&&r.training.published_at)} · ${pct(ws.filter(w=>w.passed).length, ws.length)}% ביצעו (${ws.filter(w=>w.passed).length}/${ws.length})</p>
      ${groupedBySector(App, ws, w=>w.passed, row, "ביצעו לומדה ובוחן", "לא ביצעו")}`);
  }
  if(pg==="trn-program"){
    if(needLoad("trn_program_detail", {p_token:tok, p_program_id:a.id})) return loading();
    const r = PV.data.r, ws = r.workers||[];
    const row = w=>`<div class="portal-wrow">
      <span style="flex:1;">${esc(w.name)}${w.done&&w.done_at?` <span class="muted">· ${fmtD(App,w.done_at)}</span>`:""}</span>
      ${w.done ? `<button class="btn small secondary" data-action="portal-prog-set" data-worker="${w.id}" data-done="0">בטל</button>`
               : `<button class="btn small ok" data-action="portal-prog-set" data-worker="${w.id}" data-done="1">סמן שביצע</button>`}
      <label class="btn small secondary" style="cursor:pointer;">העלאת דו"ח<input type="file" accept="image/*" multiple data-action="portal-trn-upload" data-worker="${w.id}" style="display:none;"></label>
      ${w.images?`<button class="btn small secondary" data-action="portal-pv" data-page="trn-reports" data-id="${w.id}" data-program="${PV.args.id}" data-name="${esc(w.name)}">דו"חות (${w.images})</button>`:""}
    </div>`;
    const done = ws.filter(w=>w.done).length;
    return wrap(`<h2>${esc(r.program?r.program.name:"")}</h2>
      <p class="muted">${pct(done, ws.length)}% מהמאבטחים ביצעו (${done}/${ws.length}). דו"חות הסיכום נשמרים אצלך בלבד — לעובד אין גישה אליהם.</p>
      ${msgs}${PV.busy?'<p class="muted">מעלה...</p>':""}
      ${groupedBySector(App, ws, w=>w.done, row, "ביצעו", "לא ביצעו")}`);
  }
  if(pg==="trn-reports"){
    if(needLoad("trn_report_list", {p_token:tok, p_program_id:Number(a.program), p_worker_id:a.id})) return loading();
    const imgs = PV.data.r||[];
    return wrap(`<h2>דו"חות — ${esc(a.name||"")}</h2>
      ${imgs.length ? imgs.map(i=>`<div style="margin:10px 0;"><div class="muted">${fmtDT(App,i.uploaded_at)}</div><img src="${i.image_data}" alt="" style="max-width:100%;border:1px solid #e3e9f0;border-radius:8px;"></div>`).join("") : `<p class="muted">אין דו"חות.</p>`}`);
  }
  if(pg==="trn-onboarding"){
    if(needLoad("trn_onboarding_list", {p_token:tok})) return loading();
    return wrap(`<h2>קליטת עובד חדש</h2>
      <div class="row">
        <div class="field"><label>חיפוש שם</label><input type="text" id="onbFilter" data-action="portal-onb-filter" value="${esc(PV.filter)}" autocomplete="off"></div>
        <label style="align-self:end;"><input type="checkbox" data-action="portal-onb-open" ${PV.onlyOpen?"checked":""}> רק מי שלא השלים</label>
      </div>
      <div id="onbList">${onbListHtml(App)}</div>`);
  }
  if(pg==="trn-onb-worker"){
    if(needLoad("trn_onboarding_list", {p_token:tok})) return loading();
    const w = (PV.data.r||[]).find(x=>x.id===a.id);
    if(!w) return wrap(`<p class="muted">העובד לא נמצא.</p>`);
    const items = {}; (w.items||[]).forEach(i=>items[i.key]=i);
    return wrap(`<h2>${esc(w.name)}</h2>
      <p class="muted">${esc(workerSector(App,w))} · ${onbDone(w)}/${ONB_KEYS.length} תחנות הושלמו</p>${msgs}
      <table><thead><tr><th style="text-align:right;">עם מי</th><th style="text-align:right;">נושא</th><th>מועד מתואם</th><th>בוצע</th><th style="text-align:right;">הערה</th><th></th></tr></thead><tbody>
      ${onbStations(App, w).map(s=>{ const it = items[s.key]||{}; return `<tr>
        <td style="text-align:right;">${esc(s.who)}</td><td style="text-align:right;">${esc(s.what)}</td>
        <td><input type="datetime-local" id="onb_at_${s.key}" value="${toLocalInput(it.scheduled_at)}"></td>
        <td><input type="checkbox" id="onb_done_${s.key}" ${it.done?"checked":""}></td>
        <td><input type="text" id="onb_note_${s.key}" value="${esc(it.note||"")}" maxlength="300" style="width:160px;"></td>
        <td><button class="btn small" data-action="portal-onb-save" data-key="${s.key}">${s.key==="training"?"לתאם הדרכה":"שמור"}</button></td></tr>`; }).join("")}
      </tbody></table>`);
  }
  if(pg==="trn-controls" || pg==="k-controls"){
    if(needLoad(pg==="k-controls"?"kabat_controls_list":"trn_controls_list", {p_token:tok})) return loading();
    const cs = PV.data.r||[];
    return wrap(`<div class="flexbar" style="justify-content:space-between;"><h2 style="margin:0;">סיכומי תרגילים</h2>
      ${pg==="trn-controls"?`<button class="btn small" data-action="portal-pv" data-page="trn-control-new">+ סיכום בקרה חדש</button>`:""}</div>
      ${cs.length ? `<table style="margin-top:10px;"><thead><tr><th>תאריך</th><th style="text-align:right;">מאבטח</th><th style="text-align:right;">כותרת</th><th>נקרא ע"י המאבטח</th></tr></thead><tbody>
        ${cs.map(c=>`<tr class="portal-click" data-action="portal-pv" data-page="control" data-id="${c.id}" data-from="${pg==="k-controls"?"k":"i"}"><td>${fmtD(App,c.exercise_date)}</td><td style="text-align:right;">${esc(c.worker_name)}</td><td style="text-align:right;">${esc(c.title)}</td><td>${c.read_at?`<span class="portal-task-icon done">✔</span> ${fmtD(App,c.read_at)}`:"🕒 טרם נקרא"}</td></tr>`).join("")}
      </tbody></table>` : `<p class="muted">עדיין אין סיכומים.</p>`}`);
  }
  if(pg==="control"){
    const fn = a.from==="k" ? "kabat_controls_list" : "trn_controls_list";
    if(needLoad(fn, {p_token:tok})) return loading();
    const c = (PV.data.r||[]).find(x=>x.id===a.id);
    if(!c) return wrap(`<p class="muted">הסיכום לא נמצא.</p>`);
    return wrap(docHtml(App, c.title, `${c.worker_name} · ${fmtD(App,c.exercise_date)}`, c.summary) +
      `<p style="margin-top:14px;">${c.read_at?`<span class="portal-task-icon done">✔</span> המאבטח קרא ב-${fmtD(App,c.read_at)}`:"🕒 המאבטח עדיין לא קרא"}</p>`);
  }
  if(pg==="trn-control-new"){
    if(!PV.workers){ App.apiGet("roster_workers","select=id,name,team_id&order=name").then(r=>{ PV.workers=r; App.render(); }).catch(()=>{ PV.workers=[]; App.render(); }); return loading(); }
    const f = PV.form;
    return wrap(`<h2>סיכום בקרה חדש</h2>${msgs}
      <div class="field"><label>מאבטח</label><select id="ctlWorker"><option value="">בחר/י...</option>
        ${PV.workers.map(w=>{ const t = App.teamById(w.team_id); return `<option value="${w.id}" ${f.worker===w.id?"selected":""}>${esc(w.name)}${t?` (${esc(t.name)})`:""}</option>`; }).join("")}</select></div>
      <div class="row">
        <div class="field"><label>תאריך התרגיל</label><input type="date" id="ctlDate" value="${esc(f.date||App.fmtDate(new Date()))}"></div>
        <div class="field" style="flex:1;"><label>כותרת</label><input type="text" id="ctlTitle" maxlength="200" value="${esc(f.title||"")}" placeholder="למשל: תרגיל חדירה לשער הצפוני"></div>
      </div>
      <div class="field"><label>סיכום</label><textarea id="ctlSummary" rows="10" style="width:100%;">${esc(f.summary||"")}</textarea></div>
      <button class="btn ok" data-action="portal-ctl-send" ${PV.busy?"disabled":""}>שלח למאבטח ולקב"ט שלו</button>`);
  }
  if(pg==="trn-programs"){
    if(needLoad("trn_overview", {p_token:tok})) return loading();
    const progs = (PV.data.r && PV.data.r.programs) || [];
    return wrap(`<h2>סטטוס הדרכות</h2>
      ${progs.length ? `<div class="portal-grid3">${progs.map(p=>`<div class="portal-dtile" data-action="portal-pv" data-page="trn-program" data-id="${p.id}">
        <div class="portal-dtile-t">${esc(p.name)}</div><div class="portal-dtile-n">${pct(p.done,p.eligible)}%</div>
        <div class="portal-dtile-s">${p.done} מתוך ${p.eligible} מאבטחים</div></div>`).join("")}</div>` : `<p class="muted">אין הדרכות.</p>`}`);
  }
  if(pg==="trn-posts" || pg==="k-feed"){
    const fn = pg==="k-feed" ? "kabat_feed" : "trn_posts_list";
    if(needLoad(fn, {p_token:tok})) return loading();
    let ps = pg==="k-feed" ? (PV.data.r.posts||[]) : (PV.data.r||[]).filter(p=>p.kind===a.kind);
    return wrap(`<div class="flexbar" style="justify-content:space-between;"><h2 style="margin:0;">${pg==="k-feed"?"תכנים והודעות":esc(POST_KIND[a.kind]||"")}</h2>
      ${pg==="trn-posts"?`<button class="btn small" data-action="portal-pv" data-page="trn-post-new" data-kind="${a.kind}">+ פרסום חדש</button>`:""}</div>
      <div style="height:10px;"></div>
      ${ps.length ? `<div class="portal-tasks">${ps.map(p=>`<div class="portal-task" data-action="portal-pv" data-page="post" data-id="${p.id}" data-from="${pg==="k-feed"?"k":"i"}">
        <span class="portal-task-icon">${pg==="k-feed"?(p.read?"📄":"🔔"):"📄"}</span>
        <span><span style="font-weight:600;">${esc(p.title)}</span> <span class="muted" style="font-size:.85em;">${esc(POST_KIND[p.kind]||"")} · ${fmtD(App,p.created_at)}${pg==="trn-posts"?` · קראו ${p.reads}/${p.audience}`:""}</span></span></div>`).join("")}</div>`
        : `<p class="muted">אין פרסומים.</p>`}`);
  }
  if(pg==="post"){
    const fn = a.from==="k" ? "kabat_feed" : "trn_posts_list";
    if(needLoad(fn, {p_token:tok})) return loading();
    const list = a.from==="k" ? (PV.data.r.posts||[]) : (PV.data.r||[]);
    const p = list.find(x=>x.id===a.id);
    if(!p) return wrap(`<p class="muted">הפרסום לא נמצא.</p>`);
    if(a.from==="k" && !p.read){ p.read = true; App.apiRpc("kabat_post_read", {p_token:tok, p_post_id:p.id}).catch(()=>{}); K.data = null; }
    return wrap(docHtml(App, p.title, `${POST_KIND[p.kind]||""} · ${fmtD(App,p.created_at)}${a.from==="i"?` · קראו ${p.reads}/${p.audience}`:""}`, p.body, p.link_url, p.image_data, attachmentsHtml(App, p, "m")));
  }
  if(pg==="trn-post-new"){
    const f = PV.form;
    return wrap(`<h2>${esc(POST_KIND[a.kind]||"פרסום חדש")}</h2>
      <p class="muted">${a.kind==="kabat"?"יוצג רק לקב\"טים.":"יוצג לכלל המאבטחים ולקב\"טים שלהם."} כולם יקבלו התראה במסך הראשי.</p>${msgs}
      <div class="field"><label>כותרת</label><input type="text" id="postTitle" maxlength="200" value="${esc(f.title||"")}"></div>
      <div class="field"><label>תוכן</label><textarea id="postBody" rows="8" style="width:100%;">${esc(f.body||"")}</textarea></div>
      <div class="field"><label>קישור לסרטון או לתוכן (YouTube, Google Drive וכו') — לא חובה</label><input type="url" id="postLink" value="${esc(f.link||"")}" placeholder="https://"></div>
      <div class="field"><label>קבצים (לא חובה)</label>
        <div class="portal-drop" data-drop="post">
          גררו לכאן קבצים מהמחשב, או
          <label class="btn small secondary" style="cursor:pointer;margin-inline-start:6px;">בחרו קבצים<input type="file" multiple data-action="portal-post-files" style="display:none;"></label>
          <div class="muted" style="font-size:.85em;margin-top:4px;">PDF, תמונות, מסמכים, סרטונים קצרים — עד 50MB לקובץ</div>
        </div>
        ${(f.files||[]).map((x,i)=>`<div class="portal-wrow">📎 ${esc(x.name)} <span class="muted">${fmtSize(x.size)}</span>
          <button class="btn small secondary" data-action="portal-post-file-remove" data-idx="${i}" ${PV.busy?"disabled":""}>הסר</button></div>`).join("")}
      </div>
      <p class="muted">שום דבר לא עולה ולא נשלח עד הלחיצה על "פרסם".</p>
      <button class="btn ok" data-action="portal-post-send" ${PV.busy?"disabled":""}>${PV.busy?"מפרסם...":"פרסם"}</button>`);
  }
  return wrap(`<p class="muted">העמוד לא נמצא.</p>`);
}
function onbListHtml(App){
  const esc = App.escapeHtml;
  const all = (PV.data && PV.data.r) || [];
  const q = PV.filter.trim();
  const ws = all.filter(w=> (!PV.onlyOpen || onbDone(w)<ONB_KEYS.length) && (!q || matches(w.name, q)));
  if(!ws.length) return `<p class="muted">אין עובדים להצגה.</p>`;
  return `<table><thead><tr><th style="text-align:right;">עובד</th><th style="text-align:right;">גזרה</th><th>התקדמות</th><th style="text-align:right;">המועד הבא</th><th></th></tr></thead><tbody>
    ${ws.map(w=>{
      const next = (w.items||[]).filter(i=>!i.done && i.scheduled_at).sort((x,y)=>String(x.scheduled_at).localeCompare(String(y.scheduled_at)))[0];
      const st = next ? onbStations(App, w).find(s=>s.key===next.key) : null;
      return `<tr><td style="text-align:right;">${esc(w.name)}</td><td style="text-align:right;">${esc(workerSector(App,w))}</td>
        <td>${onbDone(w)}/${ONB_KEYS.length}</td><td style="text-align:right;">${next?`${fmtDT(App,next.scheduled_at)} · ${esc(st?st.who:"")}`:'<span class="muted">—</span>'}</td>
        <td><button class="btn small" data-action="portal-pv" data-page="trn-onb-worker" data-id="${w.id}">לתאם הדרכה / חפיפה</button></td></tr>`;
    }).join("")}</tbody></table>`;
}

/* ---------- פעולות ---------- */
async function trnAction(App, a, el){
  const ms = loadMgr(App); if(!ms) return App.render();
  const tok = ms.token;
  try{
    if(a==="portal-prog-set"){
      await App.apiRpc("trn_program_set", {p_token:tok, p_program_id:PV.args.id, p_worker_id:el.dataset.worker, p_done:el.dataset.done==="1", p_done_at:null});
      PV.data = null; I.data = null; PV.msg = null; return App.render();
    }
    if(a==="portal-onb-save"){
      const k = el.dataset.key;
      const at = document.getElementById("onb_at_"+k).value;
      await App.apiRpc("trn_onboarding_set", {p_token:tok, p_worker_id:PV.args.id, p_item_key:k,
        p_scheduled_at: at ? new Date(at).toISOString() : null, p_done: document.getElementById("onb_done_"+k).checked,
        p_note: document.getElementById("onb_note_"+k).value});
      PV.data = null; I.data = null; PV.msg = "נשמר."; PV.error = null; return App.render();
    }
    if(a==="portal-ctl-send"){
      const f = PV.form;
      f.worker = document.getElementById("ctlWorker").value; f.date = document.getElementById("ctlDate").value;
      f.title = document.getElementById("ctlTitle").value; f.summary = document.getElementById("ctlSummary").value;
      if(!f.worker || !f.title.trim() || !f.summary.trim()){ PV.error = "יש לבחור מאבטח ולמלא כותרת וסיכום"; PV.msg = null; return App.render(); }
      PV.busy = true; App.render();
      await App.apiRpc("trn_control_create", {p_token:tok, p_worker_id:f.worker, p_title:f.title, p_exercise_date:f.date||null, p_summary:f.summary});
      PV.busy = false; I.data = null; PV.form = {}; PV.error = null; PV.msg = "הסיכום נשלח למאבטח ולקב\"ט שלו.";
      return App.render();
    }
    if(a==="portal-post-send"){
      const f = PV.form;
      f.title = document.getElementById("postTitle").value; f.body = document.getElementById("postBody").value;
      const linkEl = document.getElementById("postLink"); f.link = linkEl ? linkEl.value.trim() : "";
      if(!f.title.trim()){ PV.error = "יש למלא כותרת"; PV.msg = null; return App.render(); }
      PV.busy = true; PV.error = null; App.render();
      // הקבצים עולים לאחסון רק עכשיו, בלחיצה על "פרסם"
      const atts = [];
      const files = f.files || [];
      for(let i=0;i<files.length;i++){
        const file = files[i];
        PV.msg = `מעלה קבצים... (${i+1}/${files.length})`; App.render();
        const up = await filesFn(App, {action:"upload-url", token:tok, filename:file.name, size:file.size});
        const put = await fetch(up.signedUrl, {method:"PUT", headers:{"Content-Type": file.type || "application/octet-stream", "x-upsert":"false"}, body:file});
        if(!put.ok) throw new Error("העלאת הקובץ " + file.name + " נכשלה");
        atts.push({path:up.path, name:file.name, size:file.size, type:file.type||""});
      }
      await App.apiRpc("trn_post_create2", {p_token:tok, p_kind:PV.args.kind, p_title:f.title, p_body:f.body, p_link:f.link||null, p_image:null, p_attachments:atts});
      PV.busy = false; I.data = null; PV.form = {}; PV.error = null; PV.msg = "פורסם. כולם יראו התראה במסך הראשי.";
      return App.render();
    }
  }catch(e){ PV.busy = false; PV.error = e.message; PV.msg = null; App.render(); }
}
async function filesFn(App, body){
  const res = await fetch(App.SUPABASE_URL + "/functions/v1/portal-files", {method:"POST",
    headers:{"Content-Type":"application/json", apikey:App.SUPABASE_ANON_KEY, Authorization:"Bearer "+App.SUPABASE_ANON_KEY}, body:JSON.stringify(body)});
  const j = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(j.error || "שגיאה");
  return j;
}
function savePostFields(){
  [["postTitle","title"],["postBody","body"],["postLink","link"]].forEach(([id,k])=>{ const el = document.getElementById(id); if(el) PV.form[k] = el.value; });
}
function addPostFiles(App, list){
  const MAX = 50*1024*1024;
  savePostFields();
  PV.form.files = PV.form.files || [];
  Array.from(list||[]).forEach(f=>{ if(f.size > MAX) PV.error = `${f.name}: הקובץ גדול מ-50MB`; else PV.form.files.push(f); });
  App.render();
}
/* גרירת קבצים לאזור "גררו לכאן" בטופס הפרסום */
function onDrag(App, e){
  const zone = e.target.closest ? e.target.closest("[data-drop]") : null;
  if(!zone) return;
  e.preventDefault();
  if(e.type==="dragover"){ zone.classList.add("over"); return; }
  if(e.type==="dragleave"){ zone.classList.remove("over"); return; }
  if(e.type==="drop"){ zone.classList.remove("over"); if(PV.page==="trn-post-new" && !PV.busy) addPostFiles(App, e.dataTransfer && e.dataTransfer.files); }
}
async function openAttachment(App, el){
  const tok = el.dataset.who==="w" ? (loadSession(App)||{}).token : (loadMgr(App)||{}).token;
  const win = window.open("", "_blank"); // נפתח מיד (אחרת הדפדפן חוסם), והכתובת נטענת אליו כשמגיעה
  try{
    const r = await filesFn(App, {action:"download-url", token:tok, who:el.dataset.who, post_id:el.dataset.post, path:el.dataset.path});
    if(win) win.location = r.url; else window.location = r.url;
  }catch(err){ if(win) win.close(); alertMsg(App, err.message); }
}
function alertMsg(App, m){ PV.error = m; T.attError = m; App.render(); }
async function onChangeTraining(App, e){
  const t = e.target, a = t.dataset.action;
  const ms = loadMgr(App); if(!ms) return;
  if(a==="portal-trn-upload"){
    const files = Array.from(t.files||[]); if(!files.length) return;
    PV.busy = true; PV.error = null; PV.msg = null; App.render();
    try{
      for(const f of files){
        const data = await compressImage(f);
        await App.apiRpc("trn_report_upload", {p_token:ms.token, p_program_id:PV.args.id, p_worker_id:t.dataset.worker, p_image_data:data});
      }
      PV.busy = false; PV.data = null; PV.msg = files.length>1 ? `${files.length} דו"חות הועלו.` : "הדו\"ח הועלה.";
    }catch(err){ PV.busy = false; PV.error = err.message; }
    return App.render();
  }
  if(a==="portal-post-files"){ return addPostFiles(App, t.files); }
  if(a==="portal-onb-open"){ PV.onlyOpen = t.checked; const l = document.getElementById("onbList"); if(l) l.innerHTML = onbListHtml(App); }
}

/* מסכי "הדרכה" (בינתיים "בקרוב") ו"לוגיסטי" */
function renderSection(App, view){
  const session = loadSession(App);
  if(!session){ App.S.view = "home"; return renderHome(App); }
  const title = view==="training" ? "הדרכה" : "לוגיסטי";
  if(view==="training" && T.controlOpen) return `<div class="card">${renderControlDoc(App, session)}</div>`;
  if(view==="training" && T.postOpen) return `<div class="card">${renderPostDoc(App)}</div>`;
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
    <h3>🔔 עדכונים</h3>
    ${renderKabatUpdates(App, ms)}
  </div>
  <div class="card">
    <h3>לוגיסטי</h3>
    <p class="muted" style="margin-top:-6px;">${names(logi)}</p>
    <div class="grid-teams">${tile("portal-mh-equip", "בקשות ציוד", "החלפה / ציוד נוסף")}</div>
  </div>
  <div class="card">
    <h3>הדרכה</h3>
    <div class="grid-teams">
      <div class="team-tile" data-action="portal-pv" data-page="k-controls"><div style="font-size:1.1em;font-weight:700;">סיכומי תרגילים</div><div class="muted" style="font-size:.85em;margin-top:4px;">של המאבטחים שלך</div></div>
      <div class="team-tile" data-action="portal-pv" data-page="k-feed"><div style="font-size:1.1em;font-weight:700;">תכנים והודעות</div><div class="muted" style="font-size:.85em;margin-top:4px;">מקב"ט ההדרכות</div></div>
    </div>
  </div>`:""}
  ${ms.can_training ? renderIsraelDashboard(App, ms) : ""}
  ${!sched.length && !logi.length && !ms.can_training ? `<div class="card"><p class="muted">אין עדיין הרשאות לממשק הזה.</p></div>`:""}`;
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
  window.__portalApp = App;
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
  if(t.dataset.action==="portal-onb-filter"){ PV.filter = t.value; const l = document.getElementById("onbList"); if(l) l.innerHTML = onbListHtml(App); return true; }
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
      saveSession(App, null); saveMgr(App, res); I.data = null; K.data = null;
      P.selectedId = null; P.code = ""; P.query = ""; P.checkedMgr = true;
      return App.render();
    }
    const res = await App.apiRpc("worker_login", {p_worker_id: sel.id, p_code: code});
    P.busy = false;
    if(!res){ P.error = "קוד שגוי"; P.code=""; return App.render(); }
    saveMgr(App, null); clearMgrMode(App);
    saveSession(App, res);
    P.selectedId = null; P.code = ""; P.query = ""; P.shifts = null; P.checkedSession = true; T.data = null; F.data = null;
    App.render();
  }catch(err){ P.busy = false; P.error = err.message; App.render(); }
}

function onClick(App, a, el){
  const S = App.S;
  if(a==="portal-pick"){ P.selectedId = el.dataset.id; P.code=""; P.error=null; return App.render(); }
  if(a==="portal-unpick"){ P.selectedId = null; P.code=""; P.error=null; return App.render(); }
  if(a==="portal-login") return doLogin(App);
  if(a==="portal-push-enable"){ const ss = loadSession(App); if(ss && !N.busy) enablePush(App, ss); return; }
  if(a==="portal-managers"){ S.view = "managers"; S.ui = {}; return App.render(); }
  if(a==="portal-logout"){
    const s = loadSession(App);
    if(s) App.apiRpc("worker_logout", {p_token: s.token}).catch(()=>{});
    saveSession(App, null); P.shifts = null; P.checkedSession = false; L.data = null; L.items = null; T.data = null; F.data = null; N.state = null;
    return App.render();
  }
  if(a==="portal-go-training"){ S.view = "training"; S.ui = {}; T.data = null; F.data = null; T.controlOpen = null; T.postOpen = null; return App.render(); }
  if(a==="portal-go-logistics"){ S.view = "logistics"; S.ui = {}; T.data = null; L.data = null; L.msg = null; L.error = null; return App.render(); }
  if(a==="portal-log-save") return saveLogistics(App);
  if(a==="portal-log-request") return sendRequest(App);
  if(a==="portal-mgr-open"){ S.view = "equipreq"; S.ui = {}; M.session=null; M.tile=null; M.code=null; M.list=null; M.error=null; M.msg=null; return App.render(); }
  if(a==="portal-mh-equip"){ const ms = loadMgr(App); if(!ms) return App.render(); S.view = "equipreq"; S.ui = {}; M.session = ms; M.list=null; M.error=null; M.msg=null; return App.render(); }
  if(a==="portal-mh-agg" || a==="portal-mh-admin"){ const ms = loadMgr(App); if(!ms) return App.render(); return enterMgrSchedule(App, ms, a==="portal-mh-agg"?"agg":"admin"); }
  if(a==="portal-mgr-logout"){
    const ms = loadMgr(App);
    if(ms) App.apiRpc("manager_logout", {p_token: ms.token}).catch(()=>{});
    saveMgr(App, null); clearMgrMode(App); P.checkedMgr = false; M.session = null; I.data = null; K.data = null;
    S.view = "home"; S.ui = {};
    return App.render();
  }
  if(a==="portal-open-control"){ S.view = "training"; S.ui = {}; T.controlOpen = el.dataset.id; T.control = null; T.postOpen = null; return App.render(); }
  if(a==="portal-control-read"){
    const s = loadSession(App); if(!s || !T.controlOpen) return App.render();
    PV.busy = true; App.render();
    return App.apiRpc("worker_control_mark_read", {p_token:s.token, p_id:T.controlOpen})
      .then(()=>{ PV.busy = false; if(T.control) T.control.read_at = new Date().toISOString(); T.data = null; App.render(); })
      .catch(e=>{ PV.busy = false; T.control = {error:e.message}; App.render(); });
  }
  if(a==="portal-doc-back"){ T.attError = null; T.controlOpen = null; T.control = null; T.postOpen = null; return App.render(); }
  if(a==="portal-open-post"){
    const s = loadSession(App); if(!s) return App.render();
    const p = ((F.data&&F.data.posts)||[]).find(x=>x.id===el.dataset.id); if(!p) return App.render();
    if(!p.read){ p.read = true; App.apiRpc("worker_post_read", {p_token:s.token, p_post_id:p.id}).catch(()=>{}); }
    S.view = "training"; S.ui = {}; T.postOpen = p; T.controlOpen = null; return App.render();
  }
  if(a==="portal-k-open-post") return pvGo(App, "post", {id:el.dataset.id, from:"k"});
  if(a==="portal-pv"){
    const d = el.dataset;
    if(d.page==="trn-onboarding" && d.open==="1") PV.onlyOpen = true;
    if(d.page==="k-controls"){ const ms = loadMgr(App); if(ms) App.apiRpc("kabat_controls_seen", {p_token:ms.token}).catch(()=>{}); K.data = null; }
    return pvGo(App, d.page, {id:d.id, kind:d.kind, from:d.from, name:d.name, program:d.program});
  }
  if(a==="portal-pv-back") return pvBack(App);
  if(a==="portal-trn-more"){ I.showAll = !I.showAll; return App.render(); }
  if(a==="portal-att-open") return openAttachment(App, el);
  if(a==="portal-post-file-remove"){ savePostFields(); (PV.form.files||[]).splice(Number(el.dataset.idx),1); return App.render(); }
  if(a==="portal-prog-set" || a==="portal-onb-save" || a==="portal-ctl-send" || a==="portal-post-send") return trnAction(App, a, el);
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
    .portal-task-icon.done{color:#1b7f3b;font-weight:800;}
    tr.portal-click{cursor:pointer;} tr.portal-click:hover td{background:#f4f8fc;}
    .portal-wrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 10px;border-bottom:1px solid #eef2f6;}
    .portal-sub{font-weight:700;margin:8px 0 2px;color:#8a5a00;} .portal-sub.done{color:#1b7f3b;}
    .portal-doc{background:#fff;border:1px solid #e3e9f0;border-radius:10px;padding:16px;margin-top:10px;}
    .portal-drop{border:2px dashed #9fb3c8;border-radius:10px;padding:18px;text-align:center;background:#f8fbff;}
    .portal-drop.over{border-color:#0c3a6e;background:#e8f1fb;}
    .portal-cols{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:14px;align-items:start;}
    @media (max-width:760px){ .portal-cols{grid-template-columns:minmax(0,1fr);gap:0;} }
    .portal-grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;}
    .portal-dtile{background:var(--primary-light);border:1px solid var(--border);border-radius:10px;padding:12px 8px;text-align:center;cursor:pointer;min-width:0;}
    .portal-dtile:hover{background:#d7e9fc;}
    .portal-dtile-t{font-weight:700;line-height:1.3;overflow-wrap:anywhere;}
    .portal-dtile-n{font-size:1.6em;font-weight:800;margin:4px 0 2px;color:var(--primary-dark);}
    .portal-dtile-s{font-size:.8em;color:var(--muted);line-height:1.3;overflow-wrap:anywhere;}
    @media (max-width:520px){ .portal-grid3{gap:6px;} .portal-dtile{padding:10px 4px;} .portal-dtile-t{font-size:.85em;} .portal-dtile-n{font-size:1.3em;} .portal-dtile-s{font-size:.72em;} }`;
  (document.head||document.documentElement).appendChild(st);
})();

/* כשחוזרים לאפליקציה (למשל מלחיצה על התראה) - טוענים מחדש את העדכונים, המשימות והמשמרות */
let lastHidden = 0;
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState==="hidden"){ lastHidden = Date.now(); return; }
  if(!lastHidden || Date.now() - lastHidden < 30000 || !window.__portalApp) return;
  const App = window.__portalApp;
  if(App.S.view==="home" && loadSession(App)){ T.data = null; F.data = null; P.shifts = null; App.render(); }
});
if("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", ev=>{
  const App = window.__portalApp;
  if(ev.data && ev.data.type==="refresh" && App && App.S.view==="home" && loadSession(App)){ T.data = null; F.data = null; P.shifts = null; App.render(); }
});
window.Portal = { onDrag, renderHome, renderSection, renderManagerRequests, renderManagerPasswords, renderPView, pvTitle, onChange: onChangeTraining, resetPasswordsScreen(){ W.pin=null; W.list=null; W.error=null; W.msg=null; }, onClick, onInput, onKey, resetState(){ P.shifts=null; P.checkedSession=false; } };
})();
