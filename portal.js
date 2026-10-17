/* ================================================================
   פורטל עובד - מסך כניסה עם חיפוש שם + קוד אישי, ודף בית לעובד:
   הגשת משמרות / הדרכה / לוגיסטי, "המשמרות שלי" (רק מסידור שפורסם) ו"משימות פתוחות".
   קובץ נפרד מהקוד הראשי (index.html) - תחילת הפיצול לקבצים. הקוד הראשי חושף את מה שצריך
   דרך אובייקט App שמועבר לכל קריאה. לבקשת סרגיי (2026-10-07). הכניסה של המנהלים ובניית
   הסידור לא השתנו - נגישות מקישור "כניסת מנהלים".
   ================================================================ */
(function(){
"use strict";
/* גרסת דמו (2026-10-18): demo/index.html מגדיר window.CST_DEMO - כניסה לפי שם בלבד, בלי קוד ובלי חובת התראות */
const DEMO = !!window.CST_DEMO;

const SESSION_KEY = "cst_worker_session";
const MGR_KEY = "cst_manager_session";
const P = { workers:null, query:"", selectedId:null, code:"", error:null, busy:false,
            shifts:null, shiftsError:null, checkedSession:false };

function loadSession(App){ return App.loadJSON(SESSION_KEY); }
function saveSession(App, s){ if(s) App.saveJSON(SESSION_KEY, s); else localStorage.removeItem(SESSION_KEY); }
function loadMgr(App){ return App.loadJSON(MGR_KEY); }
function saveMgr(App, s){ if(s) App.saveJSON(MGR_KEY, s); else localStorage.removeItem(MGR_KEY); }
/* יציאה של מנהל: מחזירים את קוד העריכה והגישות לקב"ט למה שנשמר בדפדפן (בלי הסשן של המנהל) */
function clearMgrMode(App){
  const S = App.S;
  if(typeof S.pin==="string" && S.pin.startsWith("mgr:")) S.pin = localStorage.getItem("cst_pin") || null;
  S.teamAccess = App.loadJSON("cst_team_access") || {};
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
    // מי שהוא גם עובד וגם מנהל (באותו שם, כמו סרגיי) מופיע פעם אחת - כמנהל (2026-10-12)
    const mgrNames = new Set((ms||[]).map(m=>m.name.trim()));
    P.workers = ws.filter(w=>!mgrNames.has(w.name.trim())).map(w=>Object.assign({kind:"w", key:"w:"+w.id}, w))
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
        <div class="field"><label>קוד אישי</label>
          <input type="password" id="portalCode" autocomplete="off" placeholder="קוד" value="${esc(P.code)}" data-action="portal-code">
        </div>
        <button class="btn" data-action="portal-login" ${P.busy?"disabled":""}>כניסה</button>
      </div>
      ${P.firstCode ? `<div class="portal-qbox" style="margin-top:10px;">
        <div style="font-weight:700;margin-bottom:4px;">עוד לא הוגדר לך קוד אישי</div>
        <p class="muted" style="margin:0 0 8px;">מנהל המערכת מגדיר את הקוד הראשון עם קוד העריכה שלו. אחר כך הקוד האישי הוא הקוד היחיד לכל הכניסות.</p>
        <div class="row">
          <div class="field"><label>קוד עריכה (מנהל המערכת)</label><input type="password" id="firstEditPin" autocomplete="off"></div>
          <div class="field"><label>קוד אישי חדש (לפחות 4 תווים)</label><input type="password" id="firstNewCode" autocomplete="new-password"></div>
          <button class="btn ok" data-action="portal-first-code" ${P.busy?"disabled":""}>שמור וכניסה</button>
        </div></div>` : ""}
    `}
    ${P.error? `<p class="shortage">${esc(P.error)}</p>`:""}
    <p class="muted" style="margin-top:14px;">שמך לא ברשימה? פנה/י למנהל המערכת כדי שיוסיף אותך.</p>
  </div>
  `;
}

/* ---------- דף הבית של העובד ---------- */
function quotaFor(App, a){
  const dt = App.dayTypeForDate(a.entry_date), wd = App.parseDate(a.entry_date).getDay();
  const q = (App.S.quotas||[]).find(q=>q.sector===a.sector && q.shift_type===a.shift_type && q.day_type===dt && (q.weekday==null || q.weekday===wd));
  return (q && App.effQuota) ? App.effQuota(q, a.entry_date) : q;
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

/* ================================================================
   בקשת חילוף (לבקשת סרגיי, 2026-10-11, שלב 1): כפתור "מבקש חילוף" - העובד בוחר משמרת מתוך המשמרות
   שלו בסידור שפורסם (מהיום והלאה), אפשר להוסיף הערה. הבקשה נשמרת (swap_requests) וגלויה לקב"ט/מנהל.
   ================================================================ */
const SW = { open:false, list:null, board:null, sel:null, busy:false, msg:null, error:null, confirm:null };
function swKey(a){ return `${a.sector}|${a.entry_date}|${a.shift_type}`; }
function loadSwaps(App, session){
  SW.list = [];
  App.apiRpc("worker_swap_board", {p_token: session.token}).then(r=>{ SW.board = r || {}; SW.list = (r && r.mine) || []; App.render(); }).catch(()=>{});
}
function swShiftTxt(App, r){ return `${App.fmtDateHeb(r.entry_date)} · ${App.escapeHtml(App.SHIFT_LABELS[r.shift_type]||r.shift_type)} · ${App.escapeHtml(r.sector)}`; }
/* משמרות שמחפשות מחליף במסגרת של העובד + תיעוד החלפות (2026-10-11) */
function renderSwapBoard(App){
  const esc = App.escapeHtml, B = SW.board || {};
  const open = B.open || [], hist = B.history || [];
  let h = "";
  if(open.length) h += `<h4 style="margin:14px 0 6px;">🔁 מחפשים מחליף</h4><div class="portal-tasks">${open.map(r=>`<div class="portal-task portal-unread">
      <span class="portal-task-icon">🔁</span>
      <span style="flex:1;"><b>${esc(r.worker_name)}</b> — ${swShiftTxt(App, r)}${r.note?` <span class="muted" style="font-size:.85em;">· ${esc(r.note)}</span>`:""}</span>
      ${r.already ? `<span class="muted" style="font-size:.85em;">כבר משובץ באותה משמרת</span>`
        : (r.blocked && r.blocked.length) ? `<span style="font-size:.85em;color:#b42318;">⛔ לא ניתן לקחת: ${esc(r.blocked.join(", "))}</span>`
        : SW.confirm===r.id ? `<button class="btn small ok" data-action="portal-swap-take" data-id="${r.id}" ${SW.busy?"disabled":""}>כן, אני לוקח</button> <button class="btn small secondary" data-action="portal-swap-take-no">לא</button>`
        : `<button class="btn small ok" data-action="portal-swap-take-ask" data-id="${r.id}">לוקח את המשמרת</button>`}
    </div>`).join("")}</div>`;
  if(hist.length) h += `<h4 style="margin:14px 0 6px;">תיעוד החלפות</h4><div class="muted" style="font-size:.9em;line-height:1.9;">${hist.map(r=>`<div>✔ ${swShiftTxt(App, r)}: ${esc(r.from_name)} ← <b>${esc(r.to_name||"")}</b></div>`).join("")}</div>`;
  return h;
}
function renderSwapPanel(App, session, rows){
  const esc = App.escapeHtml;
  const today = App.fmtDate(new Date());
  const open = new Set((SW.list||[]).map(swKey));
  const cands = rows.filter(a=>a.entry_date >= today && !open.has(swKey(a)));
  return `<div class="portal-qbox" style="border-color:#0c3a6e;">
    <div style="font-weight:700;margin-bottom:6px;">🔁 בקשת חילוף — איזו משמרת תרצה להחליף?</div>
    ${cands.length ? cands.map(a=>{ const k = swKey(a); const q = quotaFor(App, a);
      return `<label class="portal-opt${SW.sel===k?" right":""}"><input type="radio" name="swsel" data-action="portal-swap-sel" data-k="${esc(k)}" ${SW.sel===k?"checked":""}>
        ${App.fmtDateHeb(a.entry_date)} · ${esc(App.SHIFT_LABELS[a.shift_type] || (q&&q.label) || a.shift_type)} · ${hoursOf(App, a)} · ${esc(a.sector)}</label>`; }).join("")
      : `<p class="muted">אין משמרות עתידיות שאפשר לבקש עליהן חילוף.</p>`}
    ${cands.length ? `<div class="field" style="margin-top:8px;"><label>הערה (לא חובה)</label><input type="text" id="swapNote" maxlength="300" placeholder="למשל: אירוע משפחתי"></div>` : ""}
    ${SW.error?`<p class="shortage">${esc(SW.error)}</p>`:""}
    <div class="flexbar" style="margin-top:8px;">
      ${cands.length ? `<button class="btn ok" data-action="portal-swap-send" ${SW.busy?"disabled":""}>שלח בקשת חילוף</button>` : ""}
      <button class="btn secondary" data-action="portal-swap-close">ביטול</button>
    </div>
  </div>`;
}
function renderMyShifts(App, session){
  const esc = App.escapeHtml;
  if(P.shifts===null){ loadShifts(App, session); return `<p class="muted">טוען...</p>`; }
  if(P.shiftsError) return `<p class="shortage">${esc(P.shiftsError)}</p>`;
  if(SW.list===null) loadSwaps(App, session);
  if(!P.shifts.length) return `${SW.msg?`<p style="color:#1b7f3b;font-weight:600;">${esc(SW.msg)}</p>`:""}<p class="muted">אין כרגע משמרות בסידור שפורסם. כשהסידור יפורסם, המשמרות שלך יופיעו כאן.</p>${renderSwapBoard(App)}`;
  // משמרת שחוצה שני בלוקים נשמרת כשתי שורות עם אותן שעות - מוצגת פעם אחת
  const seen = new Set();
  const rows = P.shifts.filter(a=>{
    if(!(a.custom_start && a.custom_end)) return true;
    const k = `${a.entry_date}|${a.custom_start}|${a.custom_end}`;
    if(seen.has(k)) return false; seen.add(k); return true;
  });
  if(SW.list===null) loadSwaps(App, session);
  const openReq = {}; (SW.list||[]).forEach(r=>openReq[swKey(r)] = r);
  return `${SW.msg?`<p style="color:#1b7f3b;font-weight:600;">${esc(SW.msg)}</p>`:""}
  ${(!SW.open && SW.error)?`<p class="shortage">${esc(SW.error)}</p>`:""}
  ${SW.open ? renderSwapPanel(App, session, rows) : ""}
  <div style="overflow-x:auto;"><table>
    <thead><tr><th>תאריך</th><th>משמרת</th><th>שעות</th><th>גזרה</th><th></th></tr></thead>
    <tbody>${rows.map(a=>{
      const q = quotaFor(App, a);
      const label = App.SHIFT_LABELS[a.shift_type] || (q&&q.label) || a.shift_type;
      const notes = [];
      if(a.shadow_of_name) notes.push(`חפיפה (ח) עם ${esc(a.shadow_of_name)}`);
      if(a.filled_role && a.filled_role!==session.role) notes.push(`בתקן ${esc(a.filled_role)}`);
      const req = openReq[swKey(a)];
      if(req) notes.push(`<span style="color:#8a5a00;font-weight:600;">⏳ ביקשת חילוף</span> <button class="btn small secondary" data-action="portal-swap-cancel" data-id="${req.id}">בטל בקשה</button>`);
      return `<tr><td>${App.fmtDateHeb(a.entry_date)}</td><td>${esc(label)}</td><td>${hoursOf(App, a)}</td><td>${esc(a.sector)}</td><td class="muted">${notes.join(" · ")}</td></tr>`;
    }).join("")}</tbody>
  </table></div>${renderSwapBoard(App)}`;
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
  trainingsForMainScreen(T.data.trainings).forEach(t=>rows.push({done: !!t.passed, action:"portal-open-quiz", id:t.id,
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
    <tbody>${list.map(t=>`<tr class="portal-click" data-action="portal-open-quiz" data-id="${t.id}">
      <td style="text-align:right;">${esc(t.title)}${t.passed?"":' <span class="muted" style="font-size:.85em;">— לחצו למעבר על הבוחן</span>'}</td>
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
  await App.apiRpc("worker_push_subscribe", {p_token:session.token, p_endpoint:j.endpoint, p_p256dh:j.keys.p256dh, p_auth:j.keys.auth, p_ua:""});
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
/* חובה (לבקשת סרגיי, 2026-10-08): עד שההתראות מופעלות במכשיר, המאבטח רואה רק את מסך ההפעלה */
function pushGate(App, session){
  if(DEMO || N.state==="on") return null;
  if(N.state===null || N.checking){ if(N.state===null) checkPush(App, session); }
  return pushGateHtml(App, session.name, N, {logout:"portal-logout", enable:"portal-push-enable", recheck:"portal-push-recheck",
    intro:"כדי להשתמש באיזור האישי צריך להפעיל התראות לטלפון. כך תדע מיד על סידור שפורסם, בקרה, לומדה, בקשת חילוף או הודעה חדשה."});
}
/* מנהלים - חובה כמו לעובדים (לבקשת סרגיי, 2026-10-11): עד שההתראות מופעלות, רואים רק את מסך ההפעלה */
function mgrPushGate(App, ms){
  if(DEMO || MN.state==="on") return null;
  if(MN.state===null){ MN.state = "checking"; checkMgrPush(App, ms); }
  return pushGateHtml(App, ms.name, {state: MN.state, checking: MN.state==="checking", busy: MN.busy, error: MN.error},
    {logout:"portal-mgr-logout", enable:"portal-mgr-push-enable", recheck:"portal-mgr-push-recheck",
     intro:"כדי להשתמש באיזור המנהלים צריך להפעיל התראות לטלפון. כך תדע מיד כשעובד מבקש חילוף, כשמשמרת מוחלפת ועל כל עדכון רלוונטי."});
}
function pushGateHtml(App, name, N, act){
  const esc = App.escapeHtml;
  const head = `<div class="card">
    <div class="flexbar" style="justify-content:space-between;">
      <h2 style="margin:0;">שלום, ${esc(name)}</h2>
      <button class="btn small secondary" data-action="${act.logout}">יציאה</button>
    </div></div>`;
  if(N.state===null || N.checking) return head + `<div class="card"><p class="muted">בודק התראות במכשיר...</p></div>`;
  let body;
  if(N.state==="ios-install") body = `<p>באייפון ההתראות עובדות רק כשהאיזור האישי מותקן במסך הבית:</p>
      <ol style="padding-inline-start:20px;line-height:2;">
        <li>לוחצים על כפתור השיתוף <b>⬆️</b> בתחתית ספארי</li>
        <li>בוחרים <b>"הוסף למסך הבית"</b> ואז <b>"הוסף"</b></li>
        <li>פותחים את האיזור האישי <b>מהאייקון החדש</b> במסך הבית, נכנסים שוב ומפעילים התראות</li>
      </ol>
      <p class="muted" style="font-size:.85em;">נדרש iOS 16.4 ומעלה. אם אין "הוסף למסך הבית" — לפתוח את הקישור בספארי (לא מתוך וואטסאפ).</p>`;
  else if(N.state==="unsupported") body = `<p>הדפדפן הזה לא תומך בהתראות.</p>
      <ul style="padding-inline-start:20px;line-height:2;">
        <li><b>אנדרואיד:</b> לפתוח את הקישור בכרום</li>
        <li><b>אייפון:</b> לפתוח את הקישור בספארי ולהוסיף למסך הבית</li>
        <li>אם הקישור נפתח מתוך וואטסאפ או אפליקציה אחרת — לבחור "פתח בדפדפן"</li>
      </ul>`;
  else if(N.state==="denied") body = `<p>ההתראות חסומות במכשיר הזה. כדי לפתוח:</p>
      <ul style="padding-inline-start:20px;line-height:2;">
        <li><b>אנדרואיד (כרום):</b> לוחצים על סמל המנעול ליד הכתובת ← הרשאות ← התראות ← אפשר</li>
        <li><b>אייפון:</b> הגדרות ← התראות ← איזור אישי ← אפשר התראות</li>
      </ul>
      <p>אחרי השינוי — לרענן את הדף.</p>
      <button class="btn secondary" data-action="${act.recheck}">בדיקה חוזרת</button>`;
  else body = `<p>${act.intro}</p>
      <button class="btn ok" data-action="${act.enable}" ${N.busy?"disabled":""} style="font-size:1.1em;padding:12px 22px;">${N.busy?"מפעיל...":"🔔 הפעלת התראות"}</button>
      ${N.error?`<p class="shortage" style="margin-top:8px;">${esc(N.error)}</p>`:""}
      <p style="margin-top:10px;font-weight:800;">המערכת לא אוספת מהטלפון מידע אישי או מיקום</p>
      <p class="muted" style="font-size:.85em;margin-top:4px;">כשהטלפון שואל — לבחור <b>"אפשר"</b>.</p>`;
  return head + `<div class="card" style="border:2px solid #0c3a6e;"><h3 style="margin-top:0;">📲 חובה להפעיל התראות לטלפון</h3>${body}</div>`;
}

function renderWorkerHome(App, session){
  const esc = App.escapeHtml;
  const gate = pushGate(App, session); if(gate) return gate;
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
  </div>
  <div class="portal-cols">
    <div class="portal-col-main">
      <div class="card">
        <div class="flexbar" style="justify-content:space-between;"><h3 style="margin:0;">המשמרות שלי</h3>
          ${(P.shifts && P.shifts.length) ? `<button class="btn small" data-action="portal-swap-open">🔁 מבקש חילוף</button>` : ""}</div>
        <div style="height:8px;"></div>
        ${renderMyShifts(App, session)}
        <div style="margin-top:10px;"><button class="btn secondary" data-action="portal-full-schedule">📋 סידור מלא</button></div>
      </div>
      <div class="card">
        <h3>משימות פתוחות</h3>
        ${renderTasks(App, session)}
      </div>
    </div>
    <div class="portal-col-side">
      <div class="card portal-updates" data-action="portal-go-updates">
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
   מנהל: בקשות ציוד של העובדים שלו (2026-10-07). נכנסים מתפריט המנהלים, בוחרים קב"ט,
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
  const ms = loadMgr(App);
  if(!W.list && ms && ms.is_admin && !W.loading && !W.tried){ W.loading = true; W.tried = true; W.pin = "mgr:" + ms.token; pwLoad(App).finally(()=>{ W.loading = false; }); return `<div class="card"><p class="muted">טוען...</p></div>`; }
  if(W.loading) return `<div class="card"><p class="muted">טוען...</p></div>`;
  if(!W.list && ms && ms.is_admin){
    return `<div class="card">
      <span class="backlink" data-action="go-home">◀ חזרה</span>
      <h2>קודים של מנהלים</h2>
      <p class="shortage">${esc(W.error || "לא הצלחתי לטעון את רשימת המנהלים")}</p>
      <p class="muted">אם זה חוזר - צא מהמשתמש והתחבר שוב עם הקוד שלך.</p>
      <button class="btn" data-action="portal-mh-codes">נסה שוב</button>
    </div>`;
  }
  if(!W.list){
    return `<div class="card">
      <span class="backlink" data-action="go-home">◀ חזרה</span>
      <h2>קודים של מנהלים</h2>
      <div class="field"><label>קוד עריכה (PIN)</label><input type="password" id="pwPin" autocomplete="off"></div>
      <button class="btn" data-action="portal-pw-load">כניסה</button>
      ${W.error? `<p class="shortage">${esc(W.error)}</p>`:""}
    </div>`;
  }
  return `<div class="card">
    <span class="backlink" data-action="go-home">◀ חזרה</span>
    <h2>קודים של מנהלים</h2>
    <p class="muted">לכל מנהל קוד אישי אחד לכל הכניסות. כדי לקבוע או לשנות קוד: מקלידים קוד חדש (לפחות 4 תווים) ולוחצים "שמור". שמירת קוד חדש מנתקת את המנהל מכל מכשיר שהיה מחובר בו, והוא ייכנס מעכשיו עם הקוד החדש. הקודים נשמרים מוצפנים, ולכן אי אפשר להציג קוד קיים - רק להחליף אותו. כדאי לרשום לעצמך את הקוד לפני השמירה.</p>
    ${W.msg? `<p style="color:#1b7f3b;font-weight:600;">${esc(W.msg)}</p>`:""}
    ${W.error? `<p class="shortage">${esc(W.error)}</p>`:""}
    <table>
      <thead><tr><th style="text-align:right;">מנהל</th><th>מצב</th><th>קוד חדש</th><th></th></tr></thead>
      <tbody>${W.list.map(m=>`<tr>
        <td style="text-align:right;">${esc(m.name)}</td>
        <td>${m.has_password?'<span style="color:#1b7f3b;">✔ מוגדר</span>':'<span class="shortage">לא מוגדר</span>'}</td>
        <td><input type="text" inputmode="numeric" id="pw_${m.id}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="קוד חדש" style="width:120px;"></td>
        <td><button class="btn small" data-action="portal-pw-save" data-id="${m.id}">${m.has_password?"שנה קוד":"קבע קוד"}</button></td>
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
  if(pw.length < 4){ W.error = "הקוד צריך להיות לפחות 4 תווים"; W.msg = null; return App.render(); }
  try{
    await App.apiRpc("admin_set_manager_password", {p_pin: W.pin, p_manager_id: id, p_password: pw});
    W.list = await App.apiRpc("admin_list_managers", {p_pin: W.pin});
    const m = W.list.find(x=>x.id===id);
    W.msg = `✔ הקוד של ${m?m.name:"המנהל"} נשמר: ${pw}`; W.error = null;
  }catch(e){ W.error = e.message; W.msg = null; }
  App.render();
}

/* ================================================================
   הדרכה, בקרות, תכנים והודעות (2026-10-08) - לבקשת סרגיי:
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
/* הקב"ט של העובד = שם הצוות שלו (דניאל כתב, אביחי קדוש, אלירן חמו, עידן בסעד) */
function workerKabat(App, w){ const t = App.teamById(w.team_id); if(!t) return "ללא קב\"ט"; return (t.sectors||[]).length ? `קב"ט ${t.name}` : t.name; }
/* תוצאת בוחן שהגיעה לישראל (2026-10-08) */
function resultRowHtml(App, r){
  const esc = App.escapeHtml;
  return `<div class="portal-task${r.is_new?" portal-unread":""}" data-action="portal-pv" data-page="trn-training" data-id="${r.training_id}">
    <span class="portal-task-icon ${r.passed?"done":""}">${r.passed?"✔":"✖"}</span>
    <span><span style="font-weight:${r.is_new?800:600};">${esc(r.worker_name)}</span> — ${esc(r.training_title)}
      <span class="muted" style="font-size:.85em;display:block;">${r.passed?"עבר":"לא עבר"}${r.score!=null?` · ציון ${r.score}`:""} · ${esc(workerKabat(App, r))} · ${fmtD(App, r.completed_at)}</span></span>
  </div>`;
}
/* רשימת מי שטרם ביצע, מחולקת לפי קב"טים (חומר מקצועי, 2026-10-08) */
function notDoneByKabatHtml(App, ws, isDone, notLabel){
  const esc = App.escapeHtml;
  const groups = {};
  ws.forEach(w=>{ const k = workerKabat(App, w); (groups[k] = groups[k]||{all:[], not:[]}).all.push(w); if(!isDone(w)) groups[k].not.push(w); });
  const keys = Object.keys(groups).sort((a,b)=>a.localeCompare(b,"he"));
  const anyNot = keys.some(k=>groups[k].not.length);
  if(!anyNot) return `<p style="color:#1b7f3b;font-weight:600;">✔ כל המאבטחים ${notLabel==="טרם צפו"?"צפו":"ביצעו"}.</p>`;
  return keys.map(k=>{ const g = groups[k]; return `<div class="portal-group">
      <h3 style="margin:14px 0 6px;">${esc(k)} <span class="muted" style="font-size:.8em;">${g.not.length} ${notLabel} מתוך ${g.all.length}</span></h3>
      ${g.not.length ? g.not.map(w=>`<div class="portal-wrow">${esc(w.name)}</div>`).join("") : '<div class="muted portal-wrow">✔ כולם</div>'}
    </div>`; }).join("");
}
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
/* "עדכונים והודעות" (2026-10-08): במסך הבית - 3 ההודעות האחרונות; לחיצה על הכרטיס פותחת עמוד עם כל ההודעות */
function sortedPosts(){ return ((F.data && F.data.posts) || []).slice().sort((x,y)=>String(y.created_at).localeCompare(String(x.created_at))); }
function postSnippet(p){ const t = String(p.body||"").replace(/\s+/g," ").trim(); return t.length>90 ? t.slice(0,90)+"…" : t; }
function postRowHtml(App, p, clickable){
  const esc = App.escapeHtml;
  return `<div class="portal-task${p.read?"":" portal-unread"}"${clickable?` data-action="portal-open-post" data-id="${p.id}"`:""}>
      <span class="portal-task-icon">${p.read?"📄":"🔔"}</span>
      <span style="min-width:0;"><span style="font-weight:${p.read?600:800};">${esc(p.title)}</span>
        <span class="muted" style="font-size:.82em;display:block;">${esc(POST_KIND[p.kind]||"")} · ${fmtD(App,p.created_at)}${youtubeId(p.link_url)?" · סרטון":""}</span>
        ${postSnippet(p)?`<span class="portal-snip">${esc(postSnippet(p))}</span>`:""}</span>
    </div>`;
}
function renderWorkerUpdates(App, session){
  if(!F.data){ loadFeed(App, session); return `<p class="muted">טוען...</p>`; }
  if(F.data.loading) return `<p class="muted">טוען...</p>`;
  const ps = sortedPosts();
  if(!ps.length) return `<p class="muted">אין עדיין הודעות.</p>`;
  const unread = ps.filter(p=>!p.read).length;
  return `<div class="portal-tasks">${ps.slice(0,3).map(p=>postRowHtml(App, p, false)).join("")}</div>
    <div class="portal-more">${unread?`<b>${unread} חדשות</b> · `:""}לכל ההודעות (${ps.length}) ◀</div>`;
}
function renderAllUpdates(App, session){
  if(!F.data){ loadFeed(App, session); return `<p class="muted">טוען...</p>`; }
  if(F.data.loading) return `<p class="muted">טוען...</p>`;
  const ps = sortedPosts();
  return ps.length ? `<div class="portal-tasks">${ps.map(p=>postRowHtml(App, p, true)).join("")}</div>` : `<p class="muted">אין עדיין הודעות.</p>`;
}
/* בוחן אצל המאבטח (2026-10-09): חובה לענות על הכל; הבדיקה בשרת. עד 100 — חוזר לשאלון עם ✓/✗ בלי לחשוף את הנכונה */
function renderQuiz(App, session){
  const esc = App.escapeHtml, Z = T.quiz;
  const back = `<span class="backlink" data-action="portal-quiz-back">◀ חזרה להדרכה</span>`;
  if(!Z.data){
    if(!Z.loading){ Z.loading = true;
      App.apiRpc("worker_quiz_get", {p_token: session.token, p_training_id: Z.id})
        .then(r=>{ Z.loading = false; Z.data = r || {missing:true}; if(r && r.questions) Z.answers = r.questions.map(()=>null); App.render(); })
        .catch(e=>{ Z.loading = false; Z.data = {error:e.message}; App.render(); }); }
    return back + `<p class="muted">טוען...</p>`;
  }
  if(Z.data.error) return back + `<p class="shortage">${esc(Z.data.error)}</p>`;
  if(Z.data.missing || !Z.data.questions) return back + `<h2>${esc(Z.title||"")}</h2><p class="muted">לבוחן הזה עדיין אין שאלות.</p>`;
  const qs = Z.data.questions;
  if(Z.result && Z.result.passed) return back + `<h2>${esc(Z.data.title)}</h2>
    <div class="banner open" style="font-size:1.1em;">✔ כל הכבוד! ציון 100 — עברת את הבוחן.</div>`;
  if(Z.data.passed && !Z.result) return back + `<h2>${esc(Z.data.title)}</h2><div class="banner open">✔ עברת את הבוחן הזה.</div>`;
  const marks = Z.result ? Z.result.marks : null;
  return back + `<h2>${esc(Z.data.title)}</h2>
    ${Z.result ? `<div class="banner closed">ציון: <b>${Z.result.score}</b> · ענית נכון על <b>${Z.result.correct} מתוך ${Z.result.total}</b> שאלות.<br>השאלות שסומנו ב-✖ — יש לענות עליהן מחדש ולהגיש שוב. צריך 100 כדי לעבור.</div>`
               : `<p class="muted">יש לענות על כל השאלות ואז ללחוץ "הגשה".</p>`}
    ${qs.map((q,i)=>`<div class="portal-qbox${marks? (marks[i]?" ok":" bad") : ""}">
      <div style="font-weight:700;">${marks? (marks[i]?'<span class="portal-mark ok">✔</span>':'<span class="portal-mark bad">✖</span>') : ""}${i+1}. ${esc(q.q)}</div>
      ${q.options.map((o,j)=>`<label class="portal-opt"><input type="radio" name="qa_${i}" data-action="portal-quiz-answer" data-q="${i}" data-o="${j}" ${Z.answers[i]===j?"checked":""}> ${esc(o)}</label>`).join("")}
    </div>`).join("")}
    ${Z.error?`<p class="shortage">${esc(Z.error)}</p>`:""}
    <button class="btn ok" data-action="portal-quiz-submit" ${Z.busy?"disabled":""} style="font-size:1.05em;padding:10px 26px;">${Z.busy?"בודק...":"הגשה"}</button>`;
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
  const viewedHtml = p.kind!=="content" ? "" : `
    <div style="margin-top:18px;border-top:1px solid #e3e9f0;padding-top:12px;">
      ${p.viewed_at ? `<span class="portal-task-icon done">✔</span> סימנת שצפית ב-${fmtD(App,p.viewed_at)}`
                    : `<button class="btn ok" data-action="portal-post-viewed" ${PV.busy?"disabled":""}>צפיתי</button>
                       <span class="muted" style="font-size:.85em;margin-inline-start:8px;">לסמן אחרי שקראת / צפית עד הסוף</span>`}
    </div>`;
  return `<span class="backlink" data-action="portal-doc-back">${App.S.view==="updates"?"◀ חזרה לעדכונים והודעות":"◀ חזרה להדרכה"}</span>` + (T.attError?`<p class="shortage">${App.escapeHtml(T.attError)}</p>`:"") +
    docHtml(App, p.title, `${POST_KIND[p.kind]||""} · ${fmtD(App,p.created_at)}`, p.body, p.link_url, p.image_data, attachmentsHtml(App, p, "w")) + viewedHtml;
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
      <span class="portal-task-icon ${p.viewed_at?"done":""}">${p.viewed_at?"✔":(p.read?"📄":"🔔")}</span>
      <span><span style="font-weight:600;">${esc(p.title)}</span> <span class="muted" style="font-size:.85em;">${fmtD(App,p.created_at)}${youtubeId(p.link_url)?" · סרטון":""}${kind==="content"&&!p.viewed_at?" · טרם סומן שנצפה":""}</span></span></div>`).join("")}</div>`;
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
    const res = await App.apiRpc("trn_results_recent", {p_token: ms.token}).catch(()=>({new_count:0, results:[]}));
    I.data = {ov, onb, ctrls, posts, res: res || {new_count:0, results:[]}};
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
  const res = I.data.res || {new_count:0, results:[]};
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
  const shownTrs = I.showAll ? trs : trs.slice(0,3);
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
    <div class="flexbar" style="justify-content:space-between;">
      <h3 style="margin:0;">לומדות ובחנים <button class="btn small" data-action="portal-pv" data-page="trn-quiz-new" style="margin-inline-start:8px;">+ בוחן חדש</button></h3>
      ${res.new_count ? `<span class="portal-badge">🔔 ${res.new_count} תוצאות בחנים חדשות</span>` : ""}
    </div>
    ${trs.length ? `<div class="portal-grid3" style="margin-top:10px;">${shownTrs.map(t=>`<div class="portal-dtile" data-action="portal-pv" data-page="trn-training" data-id="${t.id}">
        <div class="portal-dtile-t">${esc(t.title)}</div><div class="portal-dtile-n">${pct(t.passed,t.eligible)}%</div>
        <div class="portal-dtile-s">${t.passed}/${t.eligible} · ${fmtD(App,t.published_at)}</div></div>`).join("")}</div>
      ${trs.length>3 ? `<button class="btn small secondary" data-action="portal-trn-more" style="margin-top:8px;">${I.showAll?"הצג פחות":`עוד (${trs.length-3})`}</button>`:""}`
    : `<p class="muted" style="margin:8px 0 0;">עדיין לא הועלו לומדות. כשיהיו — כאן יופיעו אחוזי הביצוע של כל לומדה.</p>`}
    <h4 style="margin:14px 0 6px;">תוצאות בחנים אחרונות</h4>
    ${res.results.length ? `<div class="portal-tasks">${res.results.slice(0,5).map(r=>resultRowHtml(App, r)).join("")}</div>
      <p style="margin:6px 0 0;"><span class="backlink" data-action="portal-pv" data-page="trn-results">לכל התוצאות ◀</span></p>`
    : `<p class="muted" style="margin:0;">כשמאבטח יסיים בוחן, התוצאה תגיע לכאן.</p>`}
  </div>
  <div class="card">
    <div class="portal-grid3">
      ${tile("trn-programs", "", "סטטוס הדרכות", `${pct(sumDone,sumElig)}%`, `${progs.length} הדרכות`)}
      ${tile("trn-onboarding", "", "קליטת עובד חדש", notDoneOnb, `לא השלימו את כל התחנות`)}
      ${tile("trn-controls", "", "סיכומי תרגילים", ctrls.length, unreadCtl ? `${unreadCtl} טרם נקראו` : "סיכומים")}
      ${tile("trn-material", "", "חומר מקצועי", trs.length + cnt("content"), `${trs.length} לומדות · ${cnt("content")} תכנים וסרטונים`)}
      ${tile("trn-posts", "kabat", "הודעות לקב\"טים", cnt("kabat"), "רק הקב\"טים רואים")}
      ${tile("trn-posts", "all", "הודעות לכלל המאבטחים", cnt("all"), "וגם הקב\"טים שלהם")}
    </div>
  </div>`;
}

/* ================================================================
   דו"ח תחקיר אירוע חריג (2026-10-13) - לבקשת סרגיי.
   - כל קב"ט (מנהל עם צוותי לוגיסטי) ומנהל המערכת יכולים ליצור דו"ח. שמירת טיוטה, ושליחה שנועלת את הדו"ח.
   - רואים את הדו"ח: הקב"ט שכתב, סרגיי, ובהמשך מנהל היחידה (טבלת incident_viewers). טיוטות - רק הכותב.
   - הרובריקות לפי הטופס שסרגיי שלח. כל שדות המלל החופשי בסוף הטופס.
   - הרשימות (עיר, סיווג, מקור קריאה, מפעיל, גיל, מגדר) נערכות ע"י סרגיי במסך "עריכת רשימות".
   - בהמשך: פרטי האירוע יגיעו אוטומטית מקובץ ה-PDF שהמוקד מעלה (עמודת moked_data בשרת).
   ================================================================ */
const INC_LISTS = { city:"עיר", classification:"סיווג האירוע", call_source:"מקור הקריאה", operator:"שם מפעיל", attacker_age:"גיל התוקף", attacker_gender:"מגדר התוקף" };
const INC_SECTIONS = [
  { title:"פרטי האירוע", fields:[
    {k:"city", l:"עיר", t:"select", req:true},
    {k:"saveyu", l:"מספר אירוע ב-SAVEYU", t:"num", req:true, hint:"לקחת מהמוקד"},
    {k:"classification", l:"סיווג האירוע", t:"select", req:true},
    {k:"call_source", l:"מקור הקריאה", t:"select", req:true},
    {k:"operator", l:"שם מפעיל", t:"select", req:true},
    {k:"bus_line", l:"קו אוטובוס", t:"num", req:true} ]},
  { title:"פרטי התוקף", fields:[
    {k:"attacker_age", l:"גיל", t:"select", req:true},
    {k:"attacker_gender", l:"מגדר", t:"select", req:true} ]},
  { title:"זמני אירוע", fields:[
    {k:"date", l:"תאריך האירוע", t:"date", req:true},
    {k:"call_time", l:"שעת קבלת הקריאה", t:"time", req:true},
    {k:"response_time", l:"שעת הגעת צוות התגובה", t:"time", req:true} ]},
  { title:"מספרי אירוע", fields:[
    {k:"mda", l:"מד\"א", t:"num"},
    {k:"police", l:"משטרה", t:"num"},
    {k:"fire", l:"כב\"א", t:"num"} ]},
  { title:"דוח האירוע", fields:[
    {k:"hot_spot", l:"נקודה חמה", t:"area", req:true, hint:"נקודה חמה בה המאבטח היה צריך להיות בשעת האירוע. כתובת מלאה: רחוב + עיר"},
    {k:"location", l:"מיקום האירוע", t:"area", req:true, hint:"כתובת מלאה: רחוב + עיר"},
    {k:"general", l:"כללי", t:"area", req:true, hint:"לפרט בצורה כללית"},
    {k:"details", l:"פרטי האירוע", t:"area", req:true, hint:"לפרט בצורה מפורטת"},
    {k:"conclusions", l:"מסקנות", t:"area", hint:"במידה ויש"},
    {k:"lessons", l:"לקחים", t:"area", hint:"במידה ויש"} ]}
];
const INC_FIELDS = INC_SECTIONS.reduce((a,s)=>a.concat(s.fields), []);
const INC = { opts:null, id:null, status:null, data:{}, notes:{}, openNotes:{}, images:[], missing:{}, busy:false, error:null, msg:null, confirm:null, loadedFor:undefined, report:null, moked:null };

function incReset(id){
  Object.assign(INC, { id:id||null, status:null, data:{}, notes:{}, openNotes:{}, images:[], missing:{}, busy:false, error:null, msg:null, confirm:null, loadedFor:undefined, report:null, moked:null });
}
function incSync(){
  INC_FIELDS.forEach(f=>{
    const el = document.getElementById("inc_"+f.k); if(el) INC.data[f.k] = el.value;
    const ne = document.getElementById("inc_note_"+f.k); if(ne) INC.notes[f.k] = ne.value;
  });
}
function incClean(obj){ const o = {}; Object.keys(obj||{}).forEach(k=>{ const v = String(obj[k]==null?"":obj[k]).trim(); if(v) o[k] = v; }); return o; }
function incStatusChip(st){
  return st==="submitted" ? '<span style="color:#1b7f3b;font-weight:700;">✔ נשלח</span>'
       : st==="pending" ? '<span style="color:#b25e00;font-weight:700;">🕒 ממתין למילוי</span>'
       : '<span style="color:#7a5c00;font-weight:700;">📝 טיוטה</span>';
}
function incFmtDate(App, d){ return d ? App.fmtDateHeb(String(d).slice(0,10)) : ""; }
async function incLoadForm(App, ms){
  INC.loadedFor = INC.id;
  try{
    const [opts, rep] = await Promise.all([
      INC.opts ? Promise.resolve(INC.opts) : App.apiRpc("inc_options_get", {p_token:ms.token}),
      INC.id ? App.apiRpc("inc_get", {p_token:ms.token, p_id:INC.id}) : Promise.resolve(null)
    ]);
    INC.opts = opts || {};
    if(rep){
      INC.report = rep; INC.status = rep.status; INC.data = Object.assign({}, rep.data||{}); INC.notes = Object.assign({}, rep.notes||{}); INC.images = rep.images||[]; INC.moked = rep.moked_data || null;
      Object.keys(INC.notes).forEach(k=>{ if(INC.notes[k]) INC.openNotes[k] = true; });
    }
  }catch(e){ INC.error = e.message; }
  App.render();
  // אירוע שהמוקד העלה: קוראים את ה-PDF שלו פעם אחת וממלאים את הטופס
  const r = INC.report;
  if(r && r.mine && r.status!=="submitted" && r.debrief_id && r.has_pdf && !(r.moked_data && r.moked_data.parsed_at)){
    incParseDebriefPdf(App, ms, true);
  }
}
function dataUrlBytes(d){
  const b64 = String(d||"").replace(/^data:[^,]*,/, "");
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for(let i=0; i<bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function incDebriefPdfBytes(App, ms){
  const r = await App.apiRpc("inc_debrief_pdf", {p_token:ms.token, p_report_id:INC.id});
  if(!r || !r.pdf_data) throw new Error("לא נמצא קובץ PDF מהמוקד");
  return { bytes: dataUrlBytes(r.pdf_data), name: r.pdf_name || "דוח-מוקד.pdf" };
}
async function incParseDebriefPdf(App, ms, auto){
  INC.busy = true; INC.error = null; INC.msg = "קורא את קובץ ה-PDF שהמוקד העלה..."; App.render();
  try{
    const f = await incDebriefPdfBytes(App, ms);
    const mk = await readSayvuBytes(f.bytes);
    INC.busy = false; INC.msg = null;
    if(!mk || (!mk.event_no && !mk.date && !mk.address)) throw new Error("הקובץ שהמוקד העלה לא נראה כמו דו\"ח SayVU");
    incSync(); incApplyMoked(mk);
    const prev = INC.moked || {};
    INC.moked = Object.assign({}, mk, {tech: prev.tech, created_by_name: prev.created_by_name, sector: prev.sector, from_moked:true, parsed_at: new Date().toISOString()});
    App.render();
    const id = await incSave(App, ms, false); if(!id) return;
    await App.apiRpc("inc_set_moked", {p_token:ms.token, p_id:id, p_moked:INC.moked, p_file_name:f.name});
    INC.msg = `הפרטים מהדו"ח של המוקד${mk.event_no?" (SayVU #"+mk.event_no+")":""} מולאו אוטומטית. בדקו אותם והשלימו את השאר.`;
  }catch(e){ INC.busy = false; INC.msg = null; INC.error = (auto ? "לא הצלחתי למלא אוטומטית מהקובץ של המוקד: " : "") + e.message; }
  App.render();
}
async function incOpenDebriefPdf(App, ms){
  const win = window.open("", "_blank");
  try{
    const f = await incDebriefPdfBytes(App, ms);
    const url = URL.createObjectURL(new Blob([f.bytes], {type:"application/pdf"}));
    if(win) win.location = url; else window.location = url;
  }catch(e){ if(win) win.close(); INC.error = e.message; App.render(); }
}

function incFieldHtml(App, f, ro){
  const esc = App.escapeHtml, v = INC.data[f.k]==null ? "" : String(INC.data[f.k]);
  const star = f.req ? '<span style="color:#b42318;">*</span> ' : "";
  const miss = INC.missing[f.k] ? ' style="border:2px solid #b42318;"' : "";
  let input = "";
  if(ro){
    const shown = f.t==="date" ? incFmtDate(App, v) : v;
    input = `<div style="white-space:pre-wrap;padding:6px 0;font-weight:${f.t==="area"?400:600};">${shown?esc(shown):'<span class="muted">—</span>'}</div>`;
    const note = INC.notes[f.k];
    return `<div class="inc-card"><div class="inc-label">${esc(f.l)}</div>${input}${note?`<div class="muted" style="font-size:.9em;">💬 ${esc(note)}</div>`:""}</div>`;
  }
  if(f.t==="select"){
    const list = (INC.opts && INC.opts[f.k]) || [];
    const all = (v && list.indexOf(v)<0) ? list.concat([v]) : list;
    input = `<select id="inc_${f.k}"><option value="">בחר</option>${all.map(o=>`<option value="${esc(o)}" ${o===v?"selected":""}>${esc(o)}</option>`).join("")}</select>`;
  } else if(f.t==="area"){
    input = `<textarea id="inc_${f.k}" rows="${f.k==="details"?6:3}" placeholder="הזן טקסט" style="width:100%;box-sizing:border-box;">${esc(v)}</textarea>`;
  } else if(f.t==="num"){
    input = `<input type="text" inputmode="numeric" id="inc_${f.k}" value="${esc(v)}" placeholder="הזן מספר" autocomplete="off">`;
  } else if(f.t==="date"){
    input = `<div class="flexbar" style="gap:6px;"><input type="date" id="inc_${f.k}" value="${esc(v)}"><button class="btn small secondary" data-action="portal-inc-today" data-k="${f.k}">📅 היום</button></div>`;
  } else if(f.t==="time"){
    input = `<div class="flexbar" style="gap:6px;"><input type="time" id="inc_${f.k}" value="${esc(v)}"><button class="btn small secondary" data-action="portal-inc-now" data-k="${f.k}">🕒 עכשיו</button></div>`;
  }
  const noteOpen = INC.openNotes[f.k];
  return `<div class="inc-card"${miss}>
    <div class="inc-label">${star}${esc(f.l)}</div>
    ${f.hint?`<div class="muted" style="font-size:.88em;margin:-2px 0 6px;">${esc(f.hint)}</div>`:""}
    ${input}
    ${noteOpen ? `<textarea id="inc_note_${f.k}" rows="2" placeholder="הערה" style="width:100%;box-sizing:border-box;margin-top:6px;">${esc(INC.notes[f.k]||"")}</textarea>`
               : `<button class="btn small secondary" style="margin-top:6px;" data-action="portal-inc-note" data-k="${f.k}">💬 הערה</button>`}
  </div>`;
}
const INC_CSS = `<style>
  .inc-card{background:#f5f7fb;border:1px solid #e3e9f0;border-radius:10px;padding:10px 12px;margin:8px 0;}
  .inc-label{font-weight:700;margin-bottom:6px;}
  .inc-card select,.inc-card input[type=text],.inc-card input[type=date],.inc-card input[type=time]{min-width:200px;max-width:100%;}
  .inc-sec{color:#1f6fb2;margin:18px 0 4px;text-align:center;}
  .inc-imgs{display:flex;flex-wrap:wrap;gap:8px;}
  .inc-imgs .inc-img{position:relative;}
  .inc-imgs img{width:130px;height:130px;object-fit:cover;border-radius:8px;border:1px solid #e3e9f0;}
  @media print{ .inc-card{break-inside:avoid;background:#fff;} .inc-imgs img{width:45%;height:auto;} }
</style>`;

/* ---------- קריאת דו"ח SayVU (PDF של המוקד) ----------
   pages: [{items:[{s, x, y, w}]}] - x,y בנקודות PDF (y מלמטה), w רוחב. title = כותרת המסמך (מטא-דאטה).
   מחזיר את הפרטים היבשים של האירוע. נבנה לפי דו"ח לדוגמה של סרגיי (אירוע 212301, 06/09/2026). */
function sayvuParse(pages, title){
  const norm = s=>String(s||"").replace(/[‎‏‪-‮]/g,"").replace(/\s+/g," ").trim();
  const lab = s=>norm(s).replace(/:/g,"").trim();
  const out = { source:"SayVU", title:norm(title) };
  const body = p=>p.items.filter(i=>norm(i.s) && i.y > 70 && i.y < 800);
  // שורות: פריטים באותו גובה (±3), מימין לשמאל
  const linesOf = items=>{
    const sorted = items.slice().sort((a,b)=>b.y-a.y || b.x-a.x);
    const lines = [];
    sorted.forEach(it=>{
      const l = lines.find(L=>Math.abs(L.y-it.y)<=3);
      if(l) l.items.push(it); else lines.push({y:it.y, items:[it]});
    });
    lines.forEach(L=>{ L.items.sort((a,b)=>b.x-a.x); L.text = norm(L.items.map(i=>i.s).join(" ")).replace(/\s+,/g,",").replace(/\s+:/g,":"); });
    return lines.sort((a,b)=>b.y-a.y);
  };
  const t = norm(title);
  let m = t.match(/SayVU Report\s*-\s*(\d+)/i); if(m) out.event_no = m[1];
  m = t.match(/(9725\d{8}|05\d{8})/); if(m) out.reporter_phone = m[1];
  // תווית -> הערך הקרוב משמאל באותה שורה
  const valueOf = (items, label)=>{
    const L = items.filter(i=>lab(i.s)===label);
    for(const li of L){
      const row = items.filter(i=>Math.abs(i.y-li.y)<=3 && i.x < li.x - 1 && lab(i.s)!=="" && lab(i.s)!==label).sort((a,b)=>b.x-a.x);
      const labels = ["דווח על ידי","תפקיד המדווח/ת","תאריך הדיווח","שעת הדיווח","קטגוריית החירום","תת קטגוריה","סטטוס","מוקד","מפעיל","מספר הטלפון של","המדווח/ת"];
      const vals = [];
      for(const r of row){ if(labels.indexOf(lab(r.s))>=0) break; vals.push(norm(r.s)); }
      if(vals.length) return norm(vals.join(" "));
    }
    return "";
  };
  pages.forEach((p, pi)=>{
    const items = body(p);
    const all = items.map(i=>lab(i.s));
    if(all.indexOf("מידע כללי")>=0 || all.indexOf("תאריך הדיווח")>=0){
      out.reported_by = valueOf(items, "דווח על ידי") || out.reported_by;
      out.reporter_role = valueOf(items, "תפקיד המדווח/ת") || out.reporter_role;
      const d = valueOf(items, "תאריך הדיווח"); const dm = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if(dm) out.date = `${dm[3]}-${dm[2].padStart(2,"0")}-${dm[1].padStart(2,"0")}`;
      const h = valueOf(items, "שעת הדיווח"); const hm = h.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if(hm) out.call_time = `${hm[1].padStart(2,"0")}:${hm[2]}`, out.call_time_full = hm[0];
      out.category = valueOf(items, "קטגוריית החירום") || out.category;
      out.sub_category = valueOf(items, "תת קטגוריה") || out.sub_category;
      out.status = valueOf(items, "סטטוס") || out.status;
      out.center = valueOf(items, "מוקד") || out.center;
      const ph = items.map(i=>norm(i.s).replace(/\D/g,"")).find(x=>/^9725\d{8}$/.test(x));
      if(ph) out.reporter_phone = ph;
      if(!out.event_no){ const en = items.map(i=>norm(i.s)).find(x=>/^\d{5,8}$/.test(x)); if(en) out.event_no = en; }
    }
    const lines = linesOf(items);
    // מיקום
    const li = lines.findIndex(L=>lab(L.text)==="מיקום");
    if(li>=0){
      for(let k=li+1; k<Math.min(lines.length, li+4); k++){
        const tx = lines[k].text;
        const cm = tx.match(/(-?\d{1,3}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})/);
        if(cm){ out.lat = +cm[1]; out.lng = +cm[2]; continue; }
        if(!out.address && !/google maps|פתח מיקום/i.test(tx)) out.address = tx;
      }
      if(out.address){ const parts = out.address.split(","); if(parts.length>1) out.city = norm(parts[parts.length-1]); }
    }
    // הערות מוקד פנימיות + תמלול הודעות קוליות
    const sections = [["הערות מוקד פנימיות","הערה"],["תמלול הודעות קוליות","תמלול הודעה"]];
    sections.forEach(([head, noteLab])=>{
      const hi = lines.findIndex(L=>lab(L.text)===head); if(hi<0) return;
      let cur = null;
      for(let k=hi+1; k<lines.length; k++){
        const L = lines[k], tx = L.text;
        if(sections.some(s=>lab(tx)===s[0])) break;
        if(/^נוצר:/.test(tx) || /נוצר:?$/.test(tx) || L.items.some(i=>lab(i.s)==="נוצר")){
          const dt = tx.match(/(\d{2}:\d{2}:\d{2})\s+(\d{2}\/\d{2}\/\d{4})/) || tx.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/);
          const by = (tx.split(/נשלח על ידי:?/)[1]||"").trim();
          cur = { at: dt ? (dt[1].indexOf(":")>0 ? dt[1] : dt[2]) : "", by, text:"" };
          (out[noteLab==="הערה"?"notes":"voice"] = out[noteLab==="הערה"?"notes":"voice"]||[]).push(cur);
          continue;
        }
        if(!cur) continue;
        const txt = tx.replace(/^[:\s]+/, "").replace(new RegExp("^"+noteLab+"[:\\s]*"), "").replace(new RegExp("[:\\s]*"+noteLab+":?$"), "").replace(/^No text results$/i, "");
        cur.text = norm((cur.text ? cur.text+" " : "") + txt);
      }
    });
    // נתוני הזנקה
    if(all.indexOf("נתוני הזנקה")>=0){
      const hdr = n=>items.find(i=>norm(i.s)===n);
      const arrH = items.filter(i=>norm(i.s)==="הגיע").sort((a,b)=>b.x-a.x)[0];
      const cols = { name:hdr("שם"), role:hdr("תפקיד"), team:hdr("צוות תגובה"), recv:hdr("הדיווח התקבל"), dist:hdr("מרחק"), arr:arrH,
                     diff:hdr("הבדל") || items.find(i=>/^הגיע\s*[()]/.test(norm(i.s))) };
      if(cols.arr && cols.team){
        const cx = i=>i.x + (i.w||0)/2;
        const centers = Object.keys(cols).filter(k=>cols[k]).map(k=>({k, c:cx(cols[k])}));
        const colOf = i=>{ let best=null, bd=1e9; centers.forEach(c=>{ const d = Math.abs(cx(i)-c.c); if(d<bd){ bd=d; best=c.k; } }); return best; };
        const hy = cols.arr.y;
        // מאחדים פריטים צמודים באותה שורה (למשל "בית שמש" + "3")
        const raw = items.filter(i=>i.y < hy-8).sort((a,b)=>b.y-a.y || b.x-a.x), merged = [];
        raw.forEach(it=>{
          const last = merged[merged.length-1];
          if(last && Math.abs(last.y-it.y)<=1 && (norm(it.s).length<=2 || norm(last.s).length<=2) && /\S/.test(it.s) && last.x - (it.x + (it.w||0)) < 6 && last.x - (it.x + (it.w||0)) > -2){
            last.s = last.s + " " + it.s; last.w = (last.x + (last.w||0)) - it.x; last.x = it.x;
          } else merged.push({s:it.s, x:it.x, y:it.y, w:it.w});
        });
        const cells = merged.map(i=>({i, col:colOf(i)}));
        const times = cells.filter(c=>c.col==="arr" && /^\d{2}:\d{2}:\d{2}$/.test(norm(c.i.s)));
        out.dispatch = times.map(tc=>{
          const y0 = tc.i.y;
          const inBand = c=>c.i.y >= y0-12 && c.i.y <= y0+28;
          const txt = col=>norm(cells.filter(c=>c.col===col && inBand(c)).sort((a,b)=>b.i.y-a.i.y || b.i.x-a.i.x).map(c=>c.i.s).join(" "));
          return { name:txt("name"), role:txt("role"), team:txt("team"), received:(txt("recv").match(/\d{2}:\d{2}:\d{2}/)||[""])[0],
                   distance:txt("dist").replace(/קבלה/,"").trim(), arrived:norm(tc.i.s), diff:txt("diff") };
        }).sort((a,b)=>a.arrived.localeCompare(b.arrived));
        out.dispatch_text = norm(items.filter(i=>i.y < hy-8).map(i=>i.s).join(" "));
        const ours = out.dispatch.filter(d=>/מאבטח/.test(d.team));
        const pick = (ours.length ? ours : out.dispatch)[0];
        if(pick) out.response_time = pick.arrived.slice(0,5), out.response_by = [pick.name, pick.role].filter(Boolean).join(" · ");
      }
    }
  });
  return out;
}

let PDFJS_P = null;
function loadPdfJs(){
  if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if(!PDFJS_P) PDFJS_P = new Promise((res, rej)=>{
    const sc = document.createElement("script");
    sc.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    sc.onload = ()=>{ try{ window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; res(window.pdfjsLib); }catch(e){ PDFJS_P = null; rej(e); } };
    sc.onerror = ()=>{ PDFJS_P = null; rej(new Error("לא הצלחתי לטעון את רכיב קריאת ה-PDF. בדקו את החיבור לאינטרנט ונסו שוב.")); };
    document.head.appendChild(sc);
  });
  return PDFJS_P;
}
async function readSayvuFile(file){ return readSayvuBytes(new Uint8Array(await file.arrayBuffer())); }
async function readSayvuBytes(data){
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({data, isEvalSupported:false}).promise;
  let title = ""; try{ const meta = await doc.getMetadata(); title = (meta && meta.info && meta.info.Title) || ""; }catch(e){}
  const pages = [];
  for(let n=1; n<=doc.numPages; n++){
    const pg = await doc.getPage(n), tc = await pg.getTextContent();
    pages.push({ items: tc.items.filter(i=>typeof i.str==="string").map(i=>({s:i.str, x:i.transform[4], y:i.transform[5], w:i.width})) });
  }
  return sayvuParse(pages, title);
}
/* ממלא את שדות הטופס מתוך הדו"ח של המוקד. רק שדות שנמצאו בקובץ. */
function incApplyMoked(mk){
  const opts = INC.opts || {}, set = (k, v)=>{ if(v) INC.data[k] = v; };
  set("saveyu", mk.event_no); set("date", mk.date); set("call_time", mk.call_time); set("response_time", mk.response_time);
  set("location", mk.address);
  if(mk.city){ const c = (opts.city||[]).find(o=>o===mk.city) || (opts.city||[]).find(o=>mk.city.indexOf(o)>=0 || o.indexOf(mk.city)>=0) || mk.city; set("city", c); }
  if(mk.category){
    const full = mk.sub_category ? `${mk.category} - ${mk.sub_category}` : mk.category, list = opts.classification||[];
    set("classification", list.find(o=>o===full) || list.find(o=>o===mk.category) || full);
  }
  const hay = [mk.dispatch_text||""].concat((mk.dispatch||[]).map(d=>d.team+" "+d.name)).join(" ");
  const op = (opts.operator||[]).filter(o=>o!=="אחר" && hay.indexOf(o)>=0).sort((a,b)=>b.length-a.length)[0];
  if(op) set("operator", op);
}
function incMokedHtml(App, mk){
  if(!mk) return "";
  const esc = App.escapeHtml;
  const notes = (mk.notes||[]).filter(n=>n.text && !/^additional_detail$/i.test(n.text));
  const voice = (mk.voice||[]).filter(n=>n.text && !/no text results/i.test(n.text));
  const row = (l, v)=>v ? `<div><span class="muted">${esc(l)}:</span> <b>${esc(v)}</b></div>` : "";
  return `<div class="inc-card" style="background:#eef6ff;border-color:#b9d7f5;">
    <div class="inc-label">📄 מידע מהמוקד${mk.event_no?` — SayVU #${esc(mk.event_no)}`:""}</div>
    ${mk.created_by_name?`<div class="muted" style="font-size:.88em;">הועלה ע"י המוקד: ${esc(mk.created_by_name)}${mk.sector?` · ${esc(mk.sector)}`:""}</div>`:""}
    ${(INC.report && INC.report.has_pdf)?`<div class="no-print" style="margin:4px 0;"><button class="btn small secondary" data-action="portal-inc-pdf-open">📄 הקובץ המקורי מהמוקד</button>${(!mk.parsed_at && INC.report.mine && INC.report.status!=="submitted")?` <button class="btn small" data-action="portal-inc-pdf-parse">מלא מהקובץ</button>`:""}</div>`:""}
    ${(!mk.event_no && mk.tech && typeof mk.tech==="object")?Object.keys(mk.tech).filter(k=>mk.tech[k]!==null && mk.tech[k]!=="" && typeof mk.tech[k]!=="object").map(k=>row(k, String(mk.tech[k]))).join(""):""}
    ${row("קטגוריה", [mk.category, mk.sub_category].filter(Boolean).join(" - "))}
    ${row("דווח ע\"י", [mk.reported_by, mk.reporter_role].filter(Boolean).join(" · "))}${row("טלפון המדווח", mk.reporter_phone)}
    ${row("תאריך ושעת הדיווח", [mk.date?App.fmtDateHeb(mk.date):"", mk.call_time_full||mk.call_time].filter(Boolean).join(" "))}
    ${row("מיקום", mk.address)}${mk.lat?`<div class="no-print"><a href="https://www.google.com/maps?q=${mk.lat},${mk.lng}" target="_blank" rel="noopener">📍 פתח במפה</a></div>`:""}
    ${row("סטטוס", mk.status)}
    ${(mk.dispatch||[]).length?`<div style="margin-top:6px;"><span class="muted">נתוני הזנקה:</span>
      <table style="font-size:.9em;"><thead><tr><th style="text-align:right;">שם</th><th style="text-align:right;">תפקיד</th><th style="text-align:right;">צוות</th><th>קיבל</th><th>הגיע</th><th>זמן</th></tr></thead><tbody>
      ${mk.dispatch.map(d=>`<tr><td style="text-align:right;">${esc(d.name)}</td><td style="text-align:right;">${esc(d.role)}</td><td style="text-align:right;">${esc(d.team)}</td><td>${esc(d.received||"")}</td><td><b>${esc(d.arrived)}</b></td><td>${esc(d.diff||"")}</td></tr>`).join("")}
      </tbody></table></div>`:""}
    ${notes.length?`<div style="margin-top:6px;"><span class="muted">הערות המוקד:</span>${notes.map(n=>`<div style="margin:3px 0;"><span class="muted" style="font-size:.85em;">${esc(n.at)}${n.by?` · ${esc(n.by)}`:""}</span> — ${esc(n.text)}</div>`).join("")}</div>`:""}
    ${voice.length?`<div style="margin-top:6px;"><span class="muted">תמלול הודעות קוליות:</span>${voice.map(n=>`<div>${esc(n.at)} — ${esc(n.text)}</div>`).join("")}</div>`:""}
  </div>`;
}

function renderIncident(App, ms, pg, a, wrap, loading, msgs){
  const esc = App.escapeHtml;
  const canWrite = !!ms.is_admin || ((ms.logistics_team_ids||[]).length > 0);
  const isAdmin = !!ms.is_admin || !canWrite; // מנהל יחידה רואה את כל הדו"חות ואת שם הקב"ט
  if(pg==="inc-list"){
    if(!PV.data){
      PV.data = {loading:true};
      Promise.all([App.apiRpc("inc_list", {p_token:ms.token}), App.apiRpc("inc_debrief_list", {p_token:ms.token}).catch(()=>[])])
        .then(([r, deb])=>{ PV.data = {r, deb}; INC.pendCount = (deb||[]).filter(d=>!d.report_id || d.report_mine).length; App.render(); })
        .catch(e=>{ PV.data = {error:e.message}; App.render(); });
      return loading();
    }
    if(PV.data.loading) return loading();
    const rs = PV.data.r||[], deb = PV.data.deb||[];
    const debRow = d=>`<tr${canWrite?` class="portal-click" data-action="portal-inc-debrief" data-id="${d.id}"`:""}>
        <td>${d.report_id ? (d.report_mine ? '<span style="color:#7a5c00;font-weight:700;">📝 בטיפולך</span>' : `<span class="muted">בטיפול ${esc(d.report_author||"")}</span>`) : '<span style="color:#b42318;font-weight:700;">🆕 חדש</span>'}</td>
        <td>${d.event_at?esc(fmtDT(App, d.event_at)):esc(fmtDT(App, d.created_at))}</td>
        <td style="text-align:right;">${esc(d.sector||d.team||"")}</td><td>${esc(d.event_no||"")}</td>
        <td style="text-align:right;">${esc(d.created_by_name||"")}</td><td>${d.has_pdf?"📄":""}</td></tr>`;
    const drafts = rs.filter(r=>r.mine && r.status!=="submitted" && !deb.some(d=>d.report_id===r.id)), sent = rs.filter(r=>r.status==="submitted");
    const row = r=>`<tr class="portal-click" data-action="portal-inc-open" data-id="${r.id}" data-edit="${r.mine && r.status!=="submitted"?1:0}">
        <td>${incStatusChip(r.status)}</td><td>${esc(incFmtDate(App, r.date))||'<span class="muted">—</span>'}</td>
        <td style="text-align:right;">${esc(r.city||"")}</td><td style="text-align:right;">${esc(r.classification||"")}</td>
        <td>${esc(r.saveyu||"")}</td>${isAdmin?`<td style="text-align:right;">${esc(r.author||"")}</td>`:""}
        <td>${r.images?`📷 ${r.images}`:""}</td></tr>`;
    const head = `<thead><tr><th>מצב</th><th>תאריך</th><th style="text-align:right;">עיר</th><th style="text-align:right;">סיווג</th><th>SAVEYU</th>${isAdmin?'<th style="text-align:right;">קב"ט</th>':""}<th></th></tr></thead>`;
    return wrap(`<div class="flexbar" style="justify-content:space-between;flex-wrap:wrap;gap:6px;">
        <h2 style="margin:0;">🚨 דו"חות אירוע חריג</h2>
        <div class="flexbar" style="gap:6px;">
          ${ms.is_admin?'<button class="btn small secondary" data-action="portal-pv" data-page="inc-opts">⚙️ עריכת רשימות</button>':""}
          ${canWrite?'<button class="btn" data-action="portal-inc-new">➕ דו"ח חדש</button>':""}
        </div></div>
      ${msgs}
      ${deb.length?`<h3>🔔 אירועים מהמוקד שממתינים לתחקיר (${deb.length})</h3>
        <table><thead><tr><th>מצב</th><th>מועד האירוע</th><th style="text-align:right;">גזרה</th><th>SAVEYU</th><th style="text-align:right;">הועלה ע"י</th><th></th></tr></thead><tbody>${deb.map(debRow).join("")}</tbody></table>`:""}
      ${drafts.length?`<h3>הטיוטות שלי (${drafts.length})</h3><table>${head}<tbody>${drafts.map(row).join("")}</tbody></table>`:""}
      <h3>${isAdmin?"דו\"חות שנשלחו":"דו\"חות שנשלחו"} (${sent.length})</h3>
      ${sent.length?`<table>${head}<tbody>${sent.map(row).join("")}</tbody></table>`:'<p class="muted">עדיין אין דו"חות.</p>'}`);
  }
  if(pg==="inc-opts"){
    if(!ms.is_admin) return wrap(`<p class="muted">אין הרשאה.</p>`);
    if(INC.loadedFor!=="opts"){ INC.loadedFor = "opts"; INC.opts = null; App.apiRpc("inc_options_get", {p_token:ms.token}).then(o=>{ INC.opts = o||{}; App.render(); }).catch(e=>{ INC.error = e.message; App.render(); }); }
    if(!INC.opts) return loading();
    return wrap(`<h2>⚙️ עריכת רשימות — דו"ח אירוע חריג</h2>
      <p class="muted">כל שורה = אפשרות אחת ברשימה הנפתחת. הסדר כאן הוא הסדר שיופיע לקב"ט. שינוי לא משנה דו"חות שכבר נשלחו.</p>
      ${INC.error?`<p class="shortage">${esc(INC.error)}</p>`:""}${INC.msg?`<p style="color:#1b7f3b;font-weight:600;">${esc(INC.msg)}</p>`:""}
      ${Object.keys(INC_LISTS).map(k=>`<div class="inc-card">
        <div class="inc-label">${esc(INC_LISTS[k])}</div>
        <textarea id="incopt_${k}" rows="${Math.min(12, Math.max(4, ((INC.opts[k]||[]).length)+1))}" style="width:100%;box-sizing:border-box;">${esc((INC.opts[k]||[]).join("\n"))}</textarea>
        <button class="btn small" style="margin-top:6px;" data-action="portal-inc-opts-save" data-k="${k}">שמור</button>
      </div>`).join("")}`);
  }
  if(pg==="inc-form" || pg==="inc-view"){
    const id = a.id || null;
    if(INC.loadedFor!==id){ const keepOpts = INC.opts; incReset(id); INC.opts = keepOpts; incLoadForm(App, ms); return loading(); }
    if(!INC.opts || (id && !INC.report && !INC.error)) return loading();
    if(INC.error && !INC.report && id) return wrap(`<p class="shortage">${esc(INC.error)}</p>`);
    const rep = INC.report || {};
    const editable = pg==="inc-form" && (!id || (rep.mine && rep.status!=="submitted"));
    const err = INC.error?`<p class="shortage">${esc(INC.error)}</p>`:"";
    const ok = INC.msg?`<p style="color:#1b7f3b;font-weight:600;">${esc(INC.msg)}</p>`:"";
    if(!editable){
      const imgs = INC.images.map(i=>`<img src="${i.image_data}" alt="">`).join("");
      return `${INC_CSS}<div class="card" id="printArea">
        <div class="no-print flexbar" style="justify-content:space-between;flex-wrap:wrap;gap:6px;">
          <span class="backlink" data-action="portal-pv-back">◀ חזרה</span>
          <div class="flexbar" style="gap:6px;">
            ${rep.can_reopen && rep.status==="submitted"?(INC.confirm==="reopen"
              ? `<span style="font-weight:600;">לפתוח לקב"ט לתיקון?</span><button class="btn small" data-action="portal-inc-reopen">כן</button><button class="btn small secondary" data-action="portal-inc-confirm-no">לא</button>`
              : `<button class="btn small secondary" data-action="portal-inc-reopen-ask">✏️ פתח לתיקון</button>`):""}
            <button class="btn small" data-action="portal-inc-print">🖨️ הדפסה / PDF</button>
          </div>
        </div>
        <h2 style="text-align:center;margin:6px 0;">דו"ח תחקיר אירוע חריג</h2>
        <p class="muted" style="text-align:center;margin-top:0;">${incStatusChip(rep.status)} · נכתב ע"י ${esc(rep.author||"")}${rep.submitted_at?` · נשלח ${fmtDT(App, rep.submitted_at)}`:""}${rep.reopened_by?` · נפתח לתיקון ע"י ${esc(rep.reopened_by)} ${fmtDT(App, rep.reopened_at)}`:""}</p>
        ${err}${ok}
        ${incMokedHtml(App, INC.moked)}
        ${INC_SECTIONS.map(s=>`<h3 class="inc-sec">${esc(s.title)}</h3>${s.fields.map(f=>incFieldHtml(App, f, true)).join("")}`).join("")}
        ${INC.images.length?`<h3 class="inc-sec">תמונות</h3><div class="inc-imgs">${imgs}</div>`:""}
      </div>`;
    }
    const imgs = INC.images.map(i=>`<div class="inc-img"><img src="${i.image_data}" alt=""><button class="btn small secondary" style="position:absolute;top:4px;left:4px;padding:2px 7px;" data-action="portal-inc-img-del" data-id="${i.id}" title="הסר">✕</button></div>`).join("");
    const nMissing = Object.keys(INC.missing).length;
    return `${INC_CSS}<div class="card">
      <div class="flexbar" style="justify-content:space-between;flex-wrap:wrap;gap:6px;">
        <span class="backlink" data-action="portal-pv-back">◀ חזרה</span>
        ${INC.id ? (INC.confirm==="discard"
          ? `<span><b>למחוק את הטיוטה?</b> <button class="btn small" style="background:#b42318;border-color:#b42318;" data-action="portal-inc-discard">כן, מחק</button> <button class="btn small secondary" data-action="portal-inc-confirm-no">לא</button></span>`
          : `<button class="btn small secondary" data-action="portal-inc-discard-ask">🗑 מחיקת טיוטה</button>`) : ""}
      </div>
      <h2 style="text-align:center;margin:6px 0;">דו"ח אירוע חריג</h2>
      ${rep.reopened_by?`<div class="note-box">הדו"ח נפתח לתיקון ע"י ${esc(rep.reopened_by)} ב-${fmtDT(App, rep.reopened_at)}. אחרי התיקון לוחצים "שלח" שוב.</div>`:""}
      ${err}${ok}
      <div class="inc-card" style="text-align:center;">
        <label class="btn" style="cursor:pointer;display:inline-block;">📄 ${INC.moked?"טעינה מחדש מ":"מילוי אוטומטי מ"}דו"ח SayVU של המוקד (PDF)<input type="file" accept="application/pdf,.pdf" data-action="portal-inc-pdf" style="display:none;"></label>
        <div class="muted" style="font-size:.85em;margin-top:6px;">ממלא את מספר האירוע, התאריך והשעות, העיר, המיקום, הסיווג והמפעיל. את השאר משלימים ידנית.</div>
      </div>
      ${incMokedHtml(App, INC.moked)}
      ${INC_SECTIONS.map(s=>`<h3 class="inc-sec">${esc(s.title)}</h3>${s.fields.map(f=>incFieldHtml(App, f, false)).join("")}`).join("")}
      <h3 class="inc-sec">תמונות</h3>
      <div class="inc-card">
        <div class="muted" style="margin-bottom:6px;">במידה ויש תמונות ניתן להעלות כאן (עד 20)</div>
        <div class="inc-imgs">${imgs}
          <label class="btn secondary" style="cursor:pointer;width:130px;height:130px;display:flex;align-items:center;justify-content:center;font-size:2em;">📷➕<input type="file" accept="image/*" multiple data-action="portal-inc-img-add" style="display:none;"></label>
        </div>
      </div>
      ${nMissing?`<p class="shortage">חסרים ${nMissing} שדות חובה — מסומנים באדום.</p>`:""}
      <div class="flexbar" style="gap:8px;justify-content:center;margin-top:14px;position:sticky;bottom:0;background:#fff;padding:10px 0;">
        ${INC.confirm==="send"
          ? `<b>לשלוח? אחרי השליחה הדו"ח ננעל לעריכה.</b> <button class="btn" data-action="portal-inc-send" ${INC.busy?"disabled":""}>כן, שלח</button> <button class="btn secondary" data-action="portal-inc-confirm-no">לא</button>`
          : `<button class="btn" data-action="portal-inc-send-ask" ${INC.busy?"disabled":""} style="min-width:120px;">שלח</button>
             <button class="btn secondary" data-action="portal-inc-save" ${INC.busy?"disabled":""}>💾 שמור טיוטה</button>`}
        ${INC.busy?'<span class="muted">שומר...</span>':""}
      </div>
    </div>`;
  }
  return wrap(`<p class="muted">לא נמצא.</p>`);
}

async function incSave(App, ms, submit){
  incSync();
  const data = incClean(INC.data), notes = incClean(INC.notes);
  if(submit){
    INC.missing = {};
    INC_FIELDS.forEach(f=>{ if(f.req && !data[f.k]) INC.missing[f.k] = true; });
    if(Object.keys(INC.missing).length){ INC.confirm = null; INC.error = null; INC.msg = null; App.render(); const first = document.querySelector('.inc-card[style*="b42318"]'); if(first && first.scrollIntoView) first.scrollIntoView({behavior:"smooth", block:"center"}); return null; }
  }
  INC.busy = true; INC.error = null; INC.msg = null; App.render();
  try{
    const id = await App.apiRpc("inc_save", {p_token:ms.token, p_id:INC.id, p_data:data, p_notes:notes, p_submit:!!submit});
    INC.busy = false; INC.confirm = null;
    const wasNew = !INC.id; INC.id = id; INC.loadedFor = id; PV.args = Object.assign({}, PV.args, {id});
    if(submit){
      INC.report = null; INC.loadedFor = undefined; PV.page = "inc-view";
      App.render(); return id;
    }
    INC.status = "draft"; if(!INC.report) INC.report = {mine:true, status:"draft"};
    INC.msg = wasNew ? "הטיוטה נשמרה." : "הטיוטה עודכנה."; App.render();
    return id;
  }catch(e){ INC.busy = false; INC.confirm = null; INC.error = e.message; App.render(); return null; }
}
async function incClick(App, a, el){
  const ms = loadMgr(App); if(!ms) return;
  if(a==="portal-inc-new"){ incReset(null); INC.loadedFor = undefined; return pvGo(App, "inc-form", {id:null}); }
  if(a==="portal-inc-open"){ incReset(el.dataset.id); INC.loadedFor = undefined; return pvGo(App, el.dataset.edit==="1" ? "inc-form" : "inc-view", {id:el.dataset.id}); }
  if(a==="portal-inc-debrief"){
    try{ const id = await App.apiRpc("inc_from_debrief", {p_token:ms.token, p_debrief_id:el.dataset.id}); incReset(id); INC.loadedFor = undefined; INC.pendCount = undefined; return pvGo(App, "inc-form", {id}); }
    catch(e){ PV.error = e.message; return App.render(); }
  }
  if(a==="portal-inc-pdf-open") return incOpenDebriefPdf(App, ms);
  if(a==="portal-inc-pdf-parse") return incParseDebriefPdf(App, ms, false);
  if(a==="portal-inc-today"){ const e = document.getElementById("inc_"+el.dataset.k); if(e){ e.value = App.fmtDate(new Date()); } return; }
  if(a==="portal-inc-now"){ const e = document.getElementById("inc_"+el.dataset.k); if(e){ const d = new Date(), p = n=>String(n).padStart(2,"0"); e.value = p(d.getHours())+":"+p(d.getMinutes()); } return; }
  if(a==="portal-inc-note"){ incSync(); INC.openNotes[el.dataset.k] = true; App.render(); const n = document.getElementById("inc_note_"+el.dataset.k); if(n) n.focus(); return; }
  if(a==="portal-inc-save") return incSave(App, ms, false);
  if(a==="portal-inc-send-ask"){ incSync(); INC.confirm = "send"; INC.error = null; return App.render(); }
  if(a==="portal-inc-send") return incSave(App, ms, true);
  if(a==="portal-inc-confirm-no"){ incSync(); INC.confirm = null; return App.render(); }
  if(a==="portal-inc-discard-ask"){ incSync(); INC.confirm = "discard"; return App.render(); }
  if(a==="portal-inc-discard"){
    try{ await App.apiRpc("inc_discard_draft", {p_token:ms.token, p_id:INC.id}); incReset(null); pvBack(App); PV.msg = "הטיוטה נמחקה."; App.render(); }
    catch(e){ INC.error = e.message; INC.confirm = null; App.render(); }
    return;
  }
  if(a==="portal-inc-img-del"){
    incSync();
    try{ await App.apiRpc("inc_hide_image", {p_token:ms.token, p_image_id:el.dataset.id}); INC.images = INC.images.filter(i=>i.id!==el.dataset.id); }
    catch(e){ INC.error = e.message; }
    return App.render();
  }
  if(a==="portal-inc-print"){ window.print(); return; }
  if(a==="portal-inc-reopen-ask"){ INC.confirm = "reopen"; return App.render(); }
  if(a==="portal-inc-reopen"){
    try{ await App.apiRpc("inc_reopen", {p_token:ms.token, p_id:INC.id}); incReset(null); pvBack(App); PV.msg = "הדו\"ח נפתח לתיקון. הקב\"ט קיבל התראה, והדו\"ח יחזור לרשימה אחרי שישלח אותו שוב."; App.render(); }
    catch(e){ INC.error = e.message; INC.confirm = null; App.render(); }
    return;
  }
  if(a==="portal-inc-opts-save"){
    const k = el.dataset.k, t = document.getElementById("incopt_"+k);
    const list = (t?t.value:"").split("\n").map(s=>s.trim()).filter(Boolean);
    try{ await App.apiRpc("inc_options_set", {p_token:ms.token, p_key:k, p_options:list}); INC.opts = await App.apiRpc("inc_options_get", {p_token:ms.token}); INC.msg = `הרשימה "${INC_LISTS[k]}" נשמרה.`; INC.error = null; }
    catch(e){ INC.error = e.message; INC.msg = null; }
    return App.render();
  }
}
async function incLoadPdf(App, file){
  const ms = loadMgr(App); if(!ms || !file) return;
  incSync();
  INC.busy = true; INC.error = null; INC.msg = "קורא את הקובץ..."; App.render();
  let mk;
  try{ mk = await readSayvuFile(file); }
  catch(e){ INC.busy = false; INC.msg = null; INC.error = "לא הצלחתי לקרוא את הקובץ: " + e.message; return App.render(); }
  if(!mk || (!mk.event_no && !mk.date && !mk.address)){ INC.busy = false; INC.msg = null; INC.error = "הקובץ לא נראה כמו דו\"ח SayVU של המוקד."; return App.render(); }
  INC.busy = false; INC.msg = null;
  incApplyMoked(mk); INC.moked = mk; INC.missing = {};
  App.render(); // השדות שמולאו מוצגים לפני השמירה (השמירה קוראת אותם מהמסך)
  const id = await incSave(App, ms, false); if(!id) return;
  try{ await App.apiRpc("inc_set_moked", {p_token:ms.token, p_id:id, p_moked:mk, p_file_name:file.name||""}); INC.msg = `הפרטים מדו"ח SayVU${mk.event_no?" #"+mk.event_no:""} מולאו ונשמרו בטיוטה. בדקו אותם והשלימו את השאר.`; }
  catch(e){ INC.error = e.message; }
  App.render();
}
async function incAddImages(App, files){
  const ms = loadMgr(App); if(!ms || !files.length) return;
  incSync();
  if(!INC.id){ const id = await incSave(App, ms, false); if(!id) return; }
  INC.busy = true; INC.error = null; INC.msg = null; App.render();
  try{
    for(const f of files){
      const data = await compressImage(f);
      const id = await App.apiRpc("inc_add_image", {p_token:ms.token, p_id:INC.id, p_image_data:data});
      INC.images.push({id, image_data:data});
    }
    INC.msg = files.length>1 ? `${files.length} תמונות נוספו.` : "התמונה נוספה.";
  }catch(e){ INC.error = e.message; }
  INC.busy = false; App.render();
}

/* ================================================================
   מנהל יחידה (2026-10-13) - לבקשת סרגיי: עמוד למנהל היחידה.
   - סידורי עבודה (צפייה בלבד, לכל הגזרות).
   - סטטוס משימות המאבטחים לפי משימה, בחלוקה לקב"טים (בלי שמות מאבטחים).
   - סטטוס תחקירי אירועים לפי קב"טים. כל האירועים מהמוקד מגיעים גם אליו (inc_scope_team_ids).
   - הצעות שלי: מדדים בראש העמוד, פרסום סידור אחרון לכל גזרה, בקשות ציוד ממתינות וחילופים פתוחים.
   הנתונים מהשרת: unit_dashboard (מנהל יחידה או מנהל מערכת בלבד).
   ================================================================ */
const U = { data:null, loading:false, error:null };
function unitPct(done, n){ return n ? Math.round(done*100/n) : null; }
function unitCell(c){
  if(!c || !c.n) return `<td class="muted">—</td>`;
  const p = unitPct(c.done, c.n);
  const bg = p>=90 ? "#e3f4e8" : p>=60 ? "#fff6dc" : "#fde7e5";
  return `<td style="background:${bg};"><b>${p}%</b><div class="muted" style="font-size:.78em;">${c.done}/${c.n}</div></td>`;
}
function unitLoad(App, ms){
  U.loading = true; U.error = null;
  App.apiRpc("unit_dashboard", {p_token:ms.token})
    .then(d=>{ U.data = d; U.loading = false; App.render(); })
    .catch(e=>{ U.error = e.message; U.loading = false; App.render(); });
}
function unitAge(App, iso){
  if(!iso) return "";
  const h = (Date.now() - new Date(iso).getTime())/3600000;
  const txt = h < 1 ? "פחות משעה" : h < 48 ? `${Math.round(h)} שעות` : `${Math.round(h/24)} ימים`;
  return `<span style="color:${h>48?"#b42318":"inherit"};font-weight:${h>48?700:400};">${txt}</span>`;
}
function renderUnitDashboard(App, ms){
  const esc = App.escapeHtml;
  if(!U.data && !U.loading && !U.error) unitLoad(App, ms);
  if(U.error) return `<div class="card"><p class="shortage">${esc(U.error)}</p><button class="btn small" data-action="portal-unit-refresh">נסה שוב</button></div>`;
  if(!U.data) return `<div class="card"><p class="muted">טוען את לוח מנהל היחידה...</p></div>`;
  const d = U.data, teams = d.teams||[], guardTeams = teams.filter(t=>t.guards);
  const sum = (obj, f)=>Object.keys(obj||{}).reduce((s,k)=>s+(f?f(obj[k]):Number(obj[k])||0),0);
  const head = list=>`<tr><th style="text-align:right;">משימה</th>${list.map(t=>`<th>${esc(t.kabat||t.name)}${t.sectors&&t.sectors.length?`<div class="muted" style="font-size:.75em;font-weight:400;">${esc(t.sectors.join(" / "))}</div>`:""}</th>`).join("")}<th>סה"כ</th></tr>`;
  const rowOf = (label, sub, per, list)=>{
    let tn = 0, td = 0;
    const cells = list.map(t=>{ const c = (per||{})[t.id]; if(c){ tn += c.n; td += c.done; } return unitCell(c); }).join("");
    return `<tr><td style="text-align:right;">${esc(label)}${sub?`<div class="muted" style="font-size:.78em;">${esc(sub)}</div>`:""}</td>${cells}${unitCell({n:tn, done:td})}</tr>`;
  };
  const secRow = (title, list)=>`<tr><td colspan="${list.length+2}" style="text-align:right;background:#eef3f8;font-weight:700;">${esc(title)}</td></tr>`;

  // מדדים
  const inc = d.incidents||{};
  const openNew = sum(inc, x=>x.new||0), openProg = sum(inc, x=>x.progress||0), done30 = sum(inc, x=>(x.done30||0)+(x.manual30||0));
  let trN = 0, trD = 0; (d.trainings||[]).forEach(tr=>Object.values(tr.per_team||{}).forEach(c=>{ trN += c.n; trD += c.done; }));
  const equip = sum(d.equipment), swaps = sum(d.swaps);
  const kpi = (big, title, sub, page)=>`<div class="portal-dtile"${page?` data-action="portal-pv" data-page="${page}"`:""}><div class="portal-dtile-t">${title}</div><div class="portal-dtile-n">${big}</div><div class="portal-dtile-s">${sub||""}</div></div>`;

  // סידורי עבודה - אריח לכל קבוצת גזרות, עם תאריך הסידור האחרון שפורסם
  const seen = new Set(), schedTiles = [];
  (App.S.teams||[]).slice().sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).forEach(t=>{
    const g = App.sectorGroupForTeam(t); if(seen.has(g.label)) return; seen.add(g.label);
    const ends = (g.citySectors||[]).map(s=>(d.published||{})[s]).filter(Boolean).sort();
    const last = ends.length===(g.citySectors||[]).length && ends.length ? ends[0] : null;
    const soon = !last || (new Date(last+"T23:59:59") - Date.now()) < 7*86400000;
    schedTiles.push(`<div class="team-tile" data-action="portal-mgr-view" data-id="${t.id}">
      <div style="font-weight:700;">${esc(g.label)}</div>
      <div style="font-size:.8em;margin-top:4px;color:${soon?"#b42318":"#1b7f3b"};">${last?`פורסם עד ${esc(App.fmtDateHeb(last))}`:"אין סידור שפורסם"}</div></div>`);
  });

  const incRows = guardTeams.map(t=>{ const x = inc[t.id]||{}; return `<tr>
      <td style="text-align:right;"><b>${esc(t.kabat||t.name)}</b><div class="muted" style="font-size:.78em;">${esc((t.sectors||[]).join(" / "))}</div></td>
      <td style="${x.new?"color:#b42318;font-weight:700;":""}">${x.new||0}</td><td>${x.progress||0}</td><td>${(x.done30||0)}</td><td>${x.manual30||0}</td>
      <td>${x.avg_hours!=null?`${x.avg_hours} ש'`:"—"}</td><td>${x.oldest_open?unitAge(App, x.oldest_open):"—"}</td></tr>`; }).join("");

  const tr = d.trainings||[], pr = d.programs||[], po = d.posts||[];
  const kindLbl = {all:"הודעה לכלל המאבטחים", content:"תוכן עיוני / סרטון"};
  return `
  <div class="card">
    <div class="flexbar" style="justify-content:space-between;"><h3 style="margin:0;">📊 תמונת מצב</h3><button class="btn small secondary" data-action="portal-unit-refresh">🔄 רענון</button></div>
    <div class="portal-grid3" style="margin-top:10px;">
      ${kpi(openNew+openProg, "🔔 אירועים פתוחים", openNew?`${openNew} עוד לא נפתחו`:"כולם בטיפול", "inc-list")}
      ${kpi(done30, "📝 תחקירים שהושלמו", "ב-30 הימים האחרונים", "inc-list")}
      ${kpi(trN?unitPct(trD,trN)+"%":"—", "🎓 ביצוע לומדות", trN?`${trD}/${trN}`:"אין לומדות פעילות")}
      ${kpi(equip, "📦 בקשות ציוד", "ממתינות לטיפול")}
      ${kpi(swaps, "🔁 חילופים פתוחים", "מחפשים מחליף")}
      ${kpi(guardTeams.reduce((s,t)=>s+(t.workers||0),0), "👮 מאבטחים", `${guardTeams.length} גזרות`)}
    </div>
  </div>
  <div class="card">
    <h3>📅 סידורי עבודה</h3>
    <p class="muted" style="margin-top:-6px;">צפייה בלבד, בסידור שפורסם. באדום: אין סידור מפורסם לשבוע הקרוב.</p>
    <div class="grid-teams">${schedTiles.join("")}</div>
  </div>
  <div class="card">
    <div class="flexbar" style="justify-content:space-between;flex-wrap:wrap;gap:6px;"><h3 style="margin:0;">🚨 תחקירי אירועים לפי קב"ט</h3>
      <button class="btn small" data-action="portal-pv" data-page="inc-list">📋 כל דו"חות התחקיר</button></div>
    <div style="overflow-x:auto;margin-top:8px;"><table>
      <thead><tr><th style="text-align:right;">קב"ט</th><th>חדשים מהמוקד</th><th>בטיפול</th><th>הושלמו (30 יום)</th><th>דו"חות ידניים (30 יום)</th><th>זמן ממוצע לתחקיר</th><th>הוותיק שפתוח</th></tr></thead>
      <tbody>${incRows}</tbody></table></div>
  </div>
  <div class="card">
    <h3>✅ סטטוס משימות המאבטחים לפי קב"ט</h3>
    <p class="muted" style="margin-top:-6px;">אחוז המאבטחים שביצעו כל משימה. ירוק 90%+, צהוב 60-89%, אדום מתחת ל-60%.</p>
    <div style="overflow-x:auto;"><table>
      <thead>${head(teams)}</thead>
      <tbody>
        ${secRow("לומדות ובחנים", teams)}
        ${tr.length ? tr.map(x=>rowOf(x.title, x.published_at?`פורסם ${App.fmtDateHeb(String(x.published_at).slice(0,10))}`:"", x.per_team, teams)).join("") : `<tr><td colspan="${teams.length+2}" class="muted">אין לומדות פעילות</td></tr>`}
        ${secRow("קריאת הודעות ותכנים", teams)}
        ${po.length ? po.map(x=>rowOf(x.title, kindLbl[x.kind]||"", x.per_team, teams)).join("") : `<tr><td colspan="${teams.length+2}" class="muted">אין פרסומים</td></tr>`}
        ${secRow("סיכומי תרגיל — נקראו ע\"י המאבטח (30 יום)", teams)}
        ${rowOf("סיכומי תרגיל", "", d.controls, teams)}
      </tbody></table></div>
    ${pr.length?`<div style="overflow-x:auto;margin-top:10px;"><table>
      <thead>${head(guardTeams)}</thead>
      <tbody>${secRow("תוכניות הדרכה", guardTeams)}${pr.map(x=>rowOf(x.name, "", x.per_team, guardTeams)).join("")}</tbody></table></div>`:""}
  </div>
  <div class="card">
    <h3>📦 לוגיסטיקה וחילופים</h3>
    <div style="overflow-x:auto;"><table>
      <thead><tr><th style="text-align:right;">קב"ט</th><th>בקשות ציוד ממתינות</th><th>חילופי משמרות פתוחים</th></tr></thead>
      <tbody>${guardTeams.map(t=>`<tr><td style="text-align:right;">${esc(t.kabat||t.name)} <span class="muted" style="font-size:.8em;">${esc((t.sectors||[]).join(" / "))}</span></td>
        <td>${(d.equipment||{})[t.id]||0}</td><td>${(t.sectors||[]).reduce((s,sec)=>s+(Number((d.swaps||{})[sec])||0),0)}</td></tr>`).join("")}</tbody></table></div>
  </div>`;
}

/* ================================================================
   יומן משותף (2026-10-18) - לבקשת סרגיי: לוח חודשי של משימות ודברים שנקבעו, לכל הקב"טים, סרגיי ומאיר.
   - כל אחד מוסיף אירוע/משימה (תאריך, שעות, אחראי, הערות). עורך/מוחק רק מי שיצר (או סרגיי).
   - משימה מסומנת "בוצע" ע"י כל אחד מהמשתתפים (נרשם מי סימן).
   - הטלת משימה/אירוע על מישהו שולחת לו פוש; אפשר גם "שלח התראה לכולם".
   - מתעדכן אונליין: כשהיומן פתוח הוא נטען מחדש כל 30 שניות. מנהל יחידה לא משתתף.
   שרת: calendar_items + cal_list / cal_save / cal_done / cal_hide.
   ================================================================ */
const C = { month:null, data:null, loading:false, error:null, sel:null, edit:null, msg:null, delAsk:null, timer:null, homeCount:undefined };
const CAL_DAYS = ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
const CAL_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
function calPad(n){ return String(n).padStart(2,"0"); }
function calToday(){ const d = new Date(); return `${d.getFullYear()}-${calPad(d.getMonth()+1)}-${calPad(d.getDate())}`; }
function calMonthRange(ym){
  const [y,m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { y, m, last, from:`${ym}-01`, to:`${ym}-${calPad(last)}`, firstDow: new Date(y, m-1, 1).getDay() };
}
function calShift(ym, delta){ const [y,m] = ym.split("-").map(Number); const d = new Date(y, m-1+delta, 1); return `${d.getFullYear()}-${calPad(d.getMonth()+1)}`; }
function isUnitMgr(ms){ return !(ms.schedule_team_ids||[]).length && !(ms.logistics_team_ids||[]).length && !ms.can_training && !ms.is_admin; }
function calLoad(App, ms, quiet){
  if(!C.month) C.month = calToday().slice(0,7);
  const r = calMonthRange(C.month);
  if(!quiet){ C.loading = true; }
  return App.apiRpc("cal_list", {p_token:ms.token, p_from:r.from, p_to:r.to})
    .then(d=>{ C.data = d; C.loading = false; C.error = null; C.homeCount = d.my_open_tasks; App.render(); })
    .catch(e=>{ C.loading = false; C.error = e.message; App.render(); });
}
function calStartTimer(App){
  if(C.timer) return;
  C.timer = setInterval(()=>{
    const ms = loadMgr(App);
    if(!ms || App.S.view!=="pview" || PV.page!=="cal"){ clearInterval(C.timer); C.timer = null; return; }
    if(C.edit || C.delAsk || document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    calLoad(App, ms, true);
  }, 30000);
}
function calItemChip(App, it){
  const esc = App.escapeHtml;
  const bg = it.kind==="task" ? (it.done ? "#e6e8eb" : "#fff1d6") : "#dcebfb";
  const col = it.kind==="task" && it.done ? "#6b7280" : "#1f2937";
  return `<div class="cal-chip" style="background:${bg};color:${col};${it.done?"text-decoration:line-through;":""}">${it.kind==="task"?(it.done?"✔ ":"📌 "):""}${it.start?esc(it.start)+" ":""}${esc(it.title)}</div>`;
}
const CAL_CSS = `<style>
  .cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;}
  .cal-h{text-align:center;font-weight:700;font-size:.85em;color:var(--muted);padding:4px 0;}
  .cal-cell{min-height:86px;border:1px solid var(--border);border-radius:8px;padding:3px;cursor:pointer;background:#fff;overflow:hidden;}
  .cal-cell.cal-empty{background:transparent;border:none;cursor:default;}
  .cal-cell.cal-today{border:2px solid var(--primary);}
  .cal-cell.cal-sel{box-shadow:0 0 0 3px #f59e0b inset;}
  .cal-num{font-weight:700;font-size:.85em;}
  .cal-chip{font-size:.72em;border-radius:5px;padding:1px 4px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .cal-more{font-size:.7em;color:var(--muted);margin-top:1px;}
  .cal-item{border:1px solid var(--border);border-radius:10px;padding:8px 10px;margin:6px 0;}
  @media (max-width:520px){ .cal-cell{min-height:58px;} .cal-chip{font-size:.62em;padding:0 2px;} }
</style>`;
function renderCalendar(App, ms, back){
  const esc = App.escapeHtml;
  if(isUnitMgr(ms)) return `<div class="card">${back}<p class="muted">אין הרשאה ליומן.</p></div>`;
  if(!C.month) C.month = calToday().slice(0,7);
  if(!C.data && !C.loading && !C.error) calLoad(App, ms);
  calStartTimer(App);
  if(C.error && !C.data) return `<div class="card">${back}<p class="shortage">${esc(C.error)}</p></div>`;
  if(!C.data) return `<div class="card">${back}<p class="muted">טוען...</p></div>`;
  const r = calMonthRange(C.month), today = calToday();
  const items = C.data.items||[], byDate = {};
  items.forEach(it=>{ (byDate[it.date] = byDate[it.date]||[]).push(it); });
  if(!C.sel || C.sel.slice(0,7)!==C.month) C.sel = today.slice(0,7)===C.month ? today : r.from;
  const cells = [];
  for(let i=0;i<r.firstDow;i++) cells.push(`<div class="cal-cell cal-empty"></div>`);
  for(let d=1; d<=r.last; d++){
    const ds = `${C.month}-${calPad(d)}`, list = byDate[ds]||[];
    cells.push(`<div class="cal-cell${ds===today?" cal-today":""}${ds===C.sel?" cal-sel":""}" data-action="portal-cal-day" data-d="${ds}">
      <div class="cal-num">${d}</div>${list.slice(0,3).map(it=>calItemChip(App, it)).join("")}${list.length>3?`<div class="cal-more">+${list.length-3} נוספים</div>`:""}</div>`);
  }
  const members = C.data.members||[];
  const dayList = byDate[C.sel]||[];
  const dowName = CAL_DAYS[new Date(C.sel+"T12:00:00").getDay()];
  const itemHtml = it=>`<div class="cal-item" style="border-inline-start:4px solid ${it.kind==="task"?(it.done?"#9ca3af":"#f59e0b"):"#3b82f6"};">
      <div class="flexbar" style="justify-content:space-between;flex-wrap:wrap;gap:6px;">
        <div><b style="${it.done?"text-decoration:line-through;":""}">${it.kind==="task"?"📌 ":"📅 "}${esc(it.title)}</b>
          <span class="muted" style="font-size:.85em;">${it.start?` · ${esc(it.start)}${it.end?"-"+esc(it.end):""}`:" · כל היום"}</span></div>
        <div class="flexbar" style="gap:4px;">
          ${it.kind==="task" ? `<button class="btn small ${it.done?"secondary":"ok"}" data-action="portal-cal-done" data-id="${it.id}" data-v="${it.done?0:1}">${it.done?"בטל ✔":"✔ בוצע"}</button>`:""}
          ${it.can_edit ? (C.delAsk===it.id
            ? `<b>למחוק?</b><button class="btn small" style="background:#b42318;border-color:#b42318;" data-action="portal-cal-del" data-id="${it.id}">כן</button><button class="btn small secondary" data-action="portal-cal-del-no">לא</button>`
            : `<button class="btn small secondary" data-action="portal-cal-edit" data-id="${it.id}">✏️</button><button class="btn small secondary" data-action="portal-cal-del-ask" data-id="${it.id}">🗑</button>`) : ""}
        </div>
      </div>
      <div class="muted" style="font-size:.85em;margin-top:3px;">${it.assignee?`אחראי: <b>${esc(it.assignee)}</b> · `:"לכולם · "}נוסף ע"י ${esc(it.created_by||"")}${it.done&&it.done_by?` · בוצע ע"י ${esc(it.done_by)}`:""}</div>
      ${it.notes?`<div style="margin-top:4px;white-space:pre-wrap;">${esc(it.notes)}</div>`:""}
    </div>`;
  const e = C.edit;
  const form = e ? `<div class="card" id="calForm">
      <h3 style="margin-top:0;">${e.id?"עריכה":"הוספה ליומן"}</h3>
      ${C.error?`<p class="shortage">${esc(C.error)}</p>`:""}
      <div class="row">
        <div class="field"><label>סוג</label><select id="cal_kind"><option value="event" ${e.kind!=="task"?"selected":""}>📅 אירוע / נקבע</option><option value="task" ${e.kind==="task"?"selected":""}>📌 משימה</option></select></div>
        <div class="field" style="flex:2;"><label>כותרת</label><input type="text" id="cal_title" maxlength="200" value="${esc(e.title||"")}" autocomplete="off"></div>
      </div>
      <div class="row">
        <div class="field"><label>תאריך</label><input type="date" id="cal_date" value="${esc(e.date||C.sel)}"></div>
        <div class="field"><label>משעה (לא חובה)</label><input type="time" id="cal_start" value="${esc(e.start||"")}"></div>
        <div class="field"><label>עד שעה</label><input type="time" id="cal_end" value="${esc(e.end||"")}"></div>
      </div>
      <div class="field"><label>אחראי</label><select id="cal_assignee"><option value="">כולם</option>${members.map(m=>`<option value="${m.id}" ${e.assignee_id===m.id?"selected":""}>${esc(m.name)}</option>`).join("")}</select></div>
      <div class="field"><label>הערות</label><textarea id="cal_notes" rows="3" style="width:100%;box-sizing:border-box;">${esc(e.notes||"")}</textarea></div>
      <label style="display:block;margin:6px 0;"><input type="checkbox" id="cal_notify"> שלח התראה לכולם</label>
      <p class="muted" style="font-size:.82em;margin:2px 0 8px;">מי שנבחר כאחראי מקבל התראה בכל מקרה.</p>
      <div class="flexbar" style="gap:6px;"><button class="btn" data-action="portal-cal-save">שמור</button><button class="btn secondary" data-action="portal-cal-cancel">ביטול</button></div>
    </div>` : "";
  const openTasks = items.filter(it=>it.kind==="task" && !it.done);
  return `${CAL_CSS}<div class="card">
      ${back}
      <div class="flexbar" style="justify-content:space-between;flex-wrap:wrap;gap:6px;margin-top:4px;">
        <h2 style="margin:0;">📅 יומן משותף</h2>
        <button class="btn" data-action="portal-cal-add">➕ הוספה</button>
      </div>
      ${C.msg?`<p style="color:#1b7f3b;font-weight:600;">${esc(C.msg)}</p>`:""}
      <div class="flexbar" style="justify-content:space-between;margin:10px 0 6px;">
        <button class="btn small secondary" data-action="portal-cal-prev" title="החודש הקודם">▶</button>
        <div style="text-align:center;"><b style="font-size:1.1em;">${CAL_MONTHS[r.m-1]} ${r.y}</b>${C.month!==today.slice(0,7)?` <span class="backlink" data-action="portal-cal-today" style="font-size:.85em;">להיום</span>`:""}</div>
        <button class="btn small secondary" data-action="portal-cal-next" title="החודש הבא">◀</button>
      </div>
      <div class="cal-grid">${CAL_DAYS.map(d=>`<div class="cal-h">${d}</div>`).join("")}${cells.join("")}</div>
      <div class="muted" style="font-size:.78em;margin-top:6px;">📅 אירוע · 📌 משימה · ✔ משימה שבוצעה · מתעדכן אוטומטית כל 30 שניות</div>
    </div>
    ${form}
    <div class="card">
      <div class="flexbar" style="justify-content:space-between;"><h3 style="margin:0;">יום ${dowName}, ${esc(App.fmtDateHeb(C.sel))}</h3>
        ${e?"":`<button class="btn small" data-action="portal-cal-add">➕ הוספה ליום הזה</button>`}</div>
      ${dayList.length ? dayList.map(itemHtml).join("") : `<p class="muted">אין כלום ביום הזה.</p>`}
    </div>
    ${openTasks.length?`<div class="card"><h3 style="margin-top:0;">📌 משימות פתוחות החודש (${openTasks.length})</h3>
      ${openTasks.map(it=>`<div class="portal-task" data-action="portal-cal-day" data-d="${it.date}"><span class="portal-task-icon">🕒</span><span><b>${esc(it.title)}</b> <span class="muted" style="font-size:.85em;">${esc(App.fmtDateHeb(it.date))}${it.assignee?` · ${esc(it.assignee)}`:""}</span></span></div>`).join("")}</div>`:""}`;
}
async function calClick(App, a, el){
  const ms = loadMgr(App); if(!ms) return;
  const findIt = id=>((C.data&&C.data.items)||[]).find(x=>x.id===id);
  if(a==="portal-cal-prev" || a==="portal-cal-next" || a==="portal-cal-today"){
    C.month = a==="portal-cal-today" ? calToday().slice(0,7) : calShift(C.month, a==="portal-cal-next"?1:-1);
    C.sel = a==="portal-cal-today" ? calToday() : null; C.edit = null; C.msg = null; C.delAsk = null; C.data = null; C.error = null;
    return App.render();
  }
  if(a==="portal-cal-day"){ C.sel = el.dataset.d; C.delAsk = null; if(C.sel.slice(0,7)!==C.month){ C.month = C.sel.slice(0,7); C.data = null; } return App.render(); }
  if(a==="portal-cal-add"){ C.edit = {kind:"event", date:C.sel}; C.error = null; C.msg = null; App.render(); const f = document.getElementById("calForm"); if(f && f.scrollIntoView) f.scrollIntoView({behavior:"smooth"}); const t = document.getElementById("cal_title"); if(t) t.focus(); return; }
  if(a==="portal-cal-edit"){ const it = findIt(el.dataset.id); if(!it) return; C.edit = Object.assign({}, it); C.error = null; C.msg = null; App.render(); const f = document.getElementById("calForm"); if(f && f.scrollIntoView) f.scrollIntoView({behavior:"smooth"}); return; }
  if(a==="portal-cal-cancel"){ C.edit = null; C.error = null; return App.render(); }
  if(a==="portal-cal-save"){
    const v = id=>{ const x = document.getElementById(id); return x ? x.value : ""; };
    const title = v("cal_title").trim(), date = v("cal_date");
    Object.assign(C.edit, {kind:v("cal_kind"), title, date, start:v("cal_start"), end:v("cal_end"), assignee_id:v("cal_assignee")||null, notes:v("cal_notes")});
    if(!title){ C.error = "צריך כותרת"; return App.render(); }
    if(!date){ C.error = "צריך תאריך"; return App.render(); }
    const notify = !!(document.getElementById("cal_notify")||{}).checked;
    try{
      await App.apiRpc("cal_save", {p_token:ms.token, p_id:C.edit.id||null, p_kind:C.edit.kind, p_title:title, p_date:date, p_start:C.edit.start||null, p_end:C.edit.end||null, p_assignee:C.edit.assignee_id, p_notes:C.edit.notes||null, p_notify:notify});
      C.msg = C.edit.id ? "עודכן." : "נוסף ליומן."; C.edit = null; C.error = null; C.sel = date;
      if(date.slice(0,7)!==C.month) C.month = date.slice(0,7);
      C.data = null; return App.render();
    }catch(e){ C.error = e.message; return App.render(); }
  }
  if(a==="portal-cal-done"){
    try{ await App.apiRpc("cal_done", {p_token:ms.token, p_id:el.dataset.id, p_done:el.dataset.v==="1"}); }catch(e){ C.msg = null; C.error = e.message; }
    return calLoad(App, ms, true);
  }
  if(a==="portal-cal-del-ask"){ C.delAsk = el.dataset.id; return App.render(); }
  if(a==="portal-cal-del-no"){ C.delAsk = null; return App.render(); }
  if(a==="portal-cal-del"){
    try{ await App.apiRpc("cal_hide", {p_token:ms.token, p_id:el.dataset.id}); C.msg = "נמחק."; }catch(e){ C.error = e.message; }
    C.delAsk = null; return calLoad(App, ms, true);
  }
}

/* ---------- עמודי משנה (view "pview") ---------- */
const PV_TITLES = { "trn-training":"לומדה", "trn-program":"סטטוס הדרכה", "trn-reports":"דו\"חות הדרכה", "trn-onboarding":"קליטת עובד חדש",
  "trn-onb-worker":"קליטת עובד חדש", "trn-controls":"סיכומי תרגילים", "trn-control-new":"סיכום בקרה חדש", "trn-posts":"פרסומים",
  "trn-post-new":"פרסום חדש", "trn-programs":"סטטוס הדרכות", "trn-material":"חומר מקצועי", "swap-mgr":"בקשת חילוף", "trn-quiz-new":"בוחן חדש", "trn-quiz-edit":"עריכת בוחן", "trn-quiz-view":"בוחן", "trn-quiz-history":"היסטוריית בחנים", "trn-results":"תוצאות בחנים", "trn-lomdas":"לומדה ובחנים", "trn-contents":"תוכן עיוני וסרטונים", "trn-content-views":"תוכן עיוני וסרטונים", "k-controls":"סיכומי תרגילים", "k-feed":"תכנים והודעות", "control":"סיכום בקרת תרגיל", "post":"פרסום", "inc-list":"דו\"ח אירוע חריג", "inc-form":"דו\"ח אירוע חריג", "inc-view":"דו\"ח אירוע חריג", "inc-opts":"עריכת רשימות", "unit-dash":"לוח מנהל יחידה", "cal":"יומן משותף" };
function pvTitle(){ return PV_TITLES[PV.page] || ""; }
function pvGo(App, page, args, push){
  if(push !== false && App.S.view==="pview" && PV.page) PV.stack.push({page:PV.page, args:PV.args});
  if(App.S.view!=="pview") PV.stack = [];
  PV.page = page; PV.args = args||{}; PV.data = null; PV.posts = null; PV.seenSent = false; PV.msg = null; PV.error = null; PV.busy = false;
  if(page==="trn-control-new" || page==="trn-post-new") PV.form = {};
  if(page==="trn-quiz-new" || page==="trn-quiz-edit") PV.quiz = null;
  PV.delAsk = false;
  if(page==="swap-mgr") PV.swap = null;
  App.S.view = "pview"; App.S.ui = {};
  App.render();
}
function pvBack(App){
  const prev = PV.stack.pop();
  if(!prev){ PV.page = null; App.S.view = "home"; App.S.ui = {}; I.data = null; K.data = null; return App.render(); }
  PV.page = prev.page; PV.args = prev.args; PV.data = null; PV.posts = null; PV.msg = null; PV.error = null;
  App.render();
}
function pvLoad(App, fn, args){
  PV.data = {loading:true};
  App.apiRpc(fn, args).then(r=>{ PV.data = {r}; App.render(); })
    .catch(e=>{ PV.data = {error: e.message}; App.render(); });
}
function groupedBySector(App, workers, isDone, rowHtml, doneLabel, notLabel, keyFn){
  const esc = App.escapeHtml;
  const groups = {};
  workers.forEach(w=>{ const s = (keyFn ? keyFn(w) : workerSector(App, w)) || "ללא גזרה"; (groups[s] = groups[s]||[]).push(w); });
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
  if(pg && pg.indexOf("inc-")===0) return renderIncident(App, ms, pg, a, wrap, loading, msgs);
  if(pg==="cal") return renderCalendar(App, ms, back);
  if(pg==="unit-dash") return `<div class="card">${back}<h2 style="margin-bottom:0;">📊 לוח מנהל יחידה</h2><p class="muted">כך רואה את המערכת מנהל היחידה.</p></div>` + renderUnitDashboard(App, ms);

  if(pg==="trn-training"){
    if(needLoad("trn_training_detail", {p_token:tok, p_training_id:a.id})) return loading();
    const r = PV.data.r, ws = r.workers||[];
    const done = ws.filter(w=>w.passed).length;
    return wrap(`<h2>${esc(r.training?r.training.title:"")}</h2>
      <p class="muted">פורסמה ${fmtD(App, r.training&&r.training.published_at)} · <b>${pct(done, ws.length)}%</b> ביצעו (${done} מתוך ${ws.length})</p>
      ${msgs}
      ${r.training && r.training.active===false ? `<div class="note-box">🗂 הבוחן נמחק${r.training.deleted_by?` ע"י ${esc(r.training.deleted_by)}`:""} ב-${fmtDT(App, r.training.deleted_at)} — המאבטחים לא רואים אותו. <span class="backlink" data-action="portal-pv" data-page="trn-quiz-view" data-id="${a.id}">לעותק השמור ולשחזור</span></div>` : `
      <div class="flexbar" style="gap:6px;flex-wrap:wrap;margin:4px 0 6px;">
        <button class="btn small" data-action="portal-pv" data-page="trn-quiz-edit" data-id="${a.id}">✏️ עריכת הבוחן</button>
        <button class="btn small secondary" data-action="portal-pv" data-page="trn-quiz-view" data-id="${a.id}">👁 צפייה בשאלות ובגרסאות</button>
        ${PV.delAsk ? `<span style="font-weight:600;">להוריד את הבוחן מהמאבטחים?</span>
            <button class="btn small" style="background:#b42318;border-color:#b42318;" data-action="portal-quiz-delete" data-id="${a.id}" ${PV.busy?"disabled":""}>כן, מחק</button>
            <button class="btn small secondary" data-action="portal-quiz-delete-no">לא</button>`
          : `<button class="btn small secondary" data-action="portal-quiz-delete-ask">🗑 מחיקת הבוחן</button>`}
      </div>
      <p class="muted" style="font-size:.85em;margin-top:0;">מחיקה מורידה את הבוחן מהמאבטחים. עותק של הבוחן, התוצאות וכל הניסיונות נשמר בהיסטוריה, ואפשר לשחזר.</p>`}
      <h3 style="margin-bottom:0;">מי שטרם ביצע</h3>
      ${notDoneByKabatHtml(App, ws, w=>w.passed, "טרם ביצעו")}`);
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
      ${groupedBySector(App, ws, w=>w.done, row, "ביצעו", "לא ביצעו", w=>workerKabat(App, w))}`);
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
  if(pg==="swap-mgr"){
    const S2 = PV.swap || (PV.swap = {teamId: a.id || null, sector:null, rows:null, sel:null, list:null});
    if(S2.list===null){ S2.list = []; App.apiRpc("mgr_swap_list", {p_token:tok}).then(r=>{ S2.list = r||[]; App.render(); }).catch(()=>{}); }
    const openHtml = S2.list.length ? `<h3 style="margin-top:4px;">בקשות חילוף פתוחות</h3><div class="portal-tasks">${S2.list.map(r=>`<div class="portal-task">
        <span class="portal-task-icon">🔁</span>
        <span style="flex:1;"><b>${esc(r.worker_name)}</b> — ${App.fmtDateHeb(r.entry_date)} · ${esc(App.SHIFT_LABELS[r.shift_type]||r.shift_type)} · ${esc(r.sector)}
          <span class="muted" style="font-size:.85em;display:block;">${r.requested_by_kind==="w"?"ביקש בעצמו":"נפתח ע\"י "+esc(r.requested_by_name||"מנהל")}${r.note?` · ${esc(r.note)}`:""}</span></span>
        <button class="btn small ok" data-action="portal-swapm-handle" data-id="${r.id}">טופל</button>
        <button class="btn small secondary" data-action="portal-swapm-cancel" data-id="${r.id}">בטל</button></div>
        ${S2.handle===r.id ? `<div class="portal-qbox" style="margin-top:-4px;">
          <div style="font-weight:700;margin-bottom:6px;">מי החליף את ${esc(r.worker_name)}?</div>
          ${S2.cands===null ? `<p class="muted">טוען...</p>` : !S2.cands.length ? `<p class="muted">אין עובדים זמינים בגזרה.</p>`
            : S2.cands.map(c=>`<label class="portal-opt"><input type="radio" name="swh" data-action="portal-swapm-hsel" data-w="${c.id}" ${S2.hsel===c.id?"checked":""}> ${esc(c.name)}${c.busy_same_day?' <span class="muted" style="font-size:.85em;">(משובץ למשמרת אחרת באותו יום)</span>':""}${(c.warnings&&c.warnings.length)?` <span style="font-size:.85em;color:#b45309;">⚠ ${esc(c.warnings.join(", "))}</span>`:""}</label>`).join("")}
          <div class="flexbar" style="margin-top:8px;"><button class="btn ok" data-action="portal-swapm-resolve" data-id="${r.id}" ${PV.busy?"disabled":""}>שמור ועדכן את הסידור</button>
          <button class="btn secondary" data-action="portal-swapm-hclose">ביטול</button></div></div>` : ""}`).join("")}</div><hr style="border:none;border-top:1px solid #e3e9f0;margin:14px 0;">` : "";
    if(S2.hist===undefined){ S2.hist = null; const today = App.fmtDate(new Date());
      const secs = S2.teamId ? App.sectorGroupForTeam(App.teamById(S2.teamId)).citySectors : [].concat(...mgrScopeGroups(App, ms).map(g=>App.sectorGroupForTeam(App.teamById(g.id)).citySectors));
      App.apiRpc("swap_history", {p_sectors: secs, p_from: App.fmtDate(App.addDays(new Date(), -14)), p_to: App.fmtDate(App.addDays(new Date(), 90))}).then(r=>{ S2.hist = r||[]; App.render(); }).catch(()=>{ S2.hist = []; }); }
    const histHtml = (S2.hist && S2.hist.length) ? `<h3 style="margin-top:18px;">תיעוד החלפות</h3><div class="muted" style="font-size:.9em;line-height:1.9;">${S2.hist.map(r=>`<div>✔ ${App.fmtDateHeb(r.entry_date)} · ${esc(App.SHIFT_LABELS[r.shift_type]||r.shift_type)} · ${esc(r.sector)}: ${esc(r.from_name)} ← <b>${esc(r.to_name||"")}</b> <span style="font-size:.85em;">(${r.by_kind==="m"?"סומן ע\"י "+esc(r.by_name||""):"לקח בעצמו"})</span></div>`).join("")}</div>` : "";
    if(!S2.teamId){
      const groups = mgrScopeGroups(App, ms);
      return wrap(`<h2>🔁 מבקש חילוף</h2>${msgs}${openHtml}<p class="muted">לפתיחת בקשה חדשה — בחרו קבוצת גזרות:</p>
        <div class="grid-teams">${groups.map(g=>`<div class="team-tile" data-action="portal-swapm-team" data-id="${g.id}">${esc(g.label)}</div>`).join("")}</div>${histHtml}`);
    }
    const team = App.teamById(S2.teamId), group = App.sectorGroupForTeam(team);
    const sectors = group.citySectors;
    if(!S2.sector && sectors.length===1) S2.sector = sectors[0];
    let body = "";
    if(S2.sector){
      if(S2.rows===null){ S2.rows = "loading"; loadSwapRows(App, S2); }
      if(S2.rows==="loading") body = `<p class="muted">טוען...</p>`;
      else if(!S2.rows.length) body = `<p class="muted">אין משמרות עתידיות בסידור שפורסם ב${esc(S2.sector)}.</p>`;
      else {
        const open = new Set(S2.list.map(r=>`${r.sector}|${r.entry_date}|${r.shift_type}|${r.worker_id}`));
        body = S2.rows.map(r=>{ const k = `${r.sector}|${r.entry_date}|${r.shift_type}|${r.worker_id}`; const q = quotaFor(App, r);
          return open.has(k) ? `<div class="portal-opt muted">⏳ ${App.fmtDateHeb(r.entry_date)} · ${esc(App.SHIFT_LABELS[r.shift_type]||(q&&q.label)||r.shift_type)} · <b>${esc(r.worker_name)}</b> — כבר יש בקשה פתוחה</div>`
            : `<label class="portal-opt${S2.sel===k?" right":""}"><input type="radio" name="swmsel" data-action="portal-swapm-sel" data-k="${esc(k)}" ${S2.sel===k?"checked":""}>
            ${App.fmtDateHeb(r.entry_date)} · ${esc(App.SHIFT_LABELS[r.shift_type]||(q&&q.label)||r.shift_type)} · ${hoursOf(App, r)} · <b>${esc(r.worker_name)}</b></label>`; }).join("")
          + `<div class="field" style="margin-top:8px;"><label>הערה (לא חובה)</label><input type="text" id="swapmNote" maxlength="300"></div>
             <button class="btn ok" data-action="portal-swapm-send" ${PV.busy?"disabled":""}>שלח בקשת חילוף</button>`;
      }
    }
    return wrap(`<h2>🔁 מבקש חילוף — ${esc(group.label)}</h2>${msgs}${openHtml}
      ${sectors.length>1 ? `<div class="chip-opts" style="margin-bottom:10px;">${sectors.map(c=>`<div class="chip ${S2.sector===c?"on":""}" data-action="portal-swapm-sector" data-s="${esc(c)}">${esc(c)}</div>`).join("")}</div>` : ""}
      ${S2.sector ? `<p class="muted" style="margin-top:0;">בחרו את המשמרת להחלפה (סידור שפורסם, מהיום והלאה):</p>${body}` : `<p class="muted">בחרו גזרה.</p>`}${histHtml}`);
  }
  if(pg==="trn-results"){
    if(needLoad("trn_results_recent", {p_token:tok})) return loading();
    if(!PV.seenSent){ PV.seenSent = true; App.apiRpc("trn_results_seen", {p_token:tok}).then(()=>{ I.data = null; }).catch(()=>{}); }
    const rs = (PV.data.r && PV.data.r.results) || [];
    return wrap(`<h2>תוצאות בחנים</h2>
      ${rs.length ? `<div class="portal-tasks">${rs.map(r=>resultRowHtml(App, r)).join("")}</div>` : `<p class="muted">עדיין אין תוצאות.</p>`}`);
  }
  if(pg==="trn-material"){
    if(needLoad("trn_overview", {p_token:tok})) return loading();
    if(!PV.posts){ App.apiRpc("trn_posts_list", {p_token:tok}).then(r=>{ PV.posts = r||[]; App.render(); }).catch(()=>{ PV.posts = []; App.render(); }); return loading(); }
    const trs = (PV.data.r && PV.data.r.trainings) || [];
    const cs = PV.posts.filter(p=>p.kind==="content");
    const avg = (list, f, g)=>{ const n = list.reduce((x,i)=>x+f(i),0), d = list.reduce((x,i)=>x+g(i),0); return pct(n,d); };
    return wrap(`<h2>חומר מקצועי</h2>
      <div class="portal-grid2">
        <div class="portal-dtile" data-action="portal-pv" data-page="trn-lomdas"><div class="portal-dtile-t">לומדה ובחנים</div>
          <div class="portal-dtile-n">${trs.length}</div><div class="portal-dtile-s">${trs.length?`ביצוע ממוצע ${avg(trs,t=>t.passed,t=>t.eligible)}%`:"עדיין אין לומדות"}</div></div>
        <div class="portal-dtile" data-action="portal-pv" data-page="trn-contents"><div class="portal-dtile-t">תוכן עיוני וסרטונים</div>
          <div class="portal-dtile-n">${cs.length}</div><div class="portal-dtile-s">${cs.length?`צפייה ממוצעת ${avg(cs,p=>p.viewed||0,p=>p.workers_total||0)}%`:"עדיין אין תכנים"}</div></div>
      </div>`);
  }
  if(pg==="trn-quiz-new" || pg==="trn-quiz-edit"){
    const isEdit = pg==="trn-quiz-edit";
    if(isEdit){
      if(needLoad("trn_quiz_get", {p_token:tok, p_id:a.id})) return loading();
      const r = PV.data.r;
      if(!r || !r.questions) return wrap(`<h2>עריכת בוחן</h2><p class="muted">לבוחן הזה אין שאלות לעריכה.</p>`);
      if(!r.active) return wrap(`<h2>עריכת בוחן</h2><p class="shortage">הבוחן נמחק. כדי לערוך — קודם לשחזר אותו (בעמוד הצפייה בבוחן).</p>`);
      if(!PV.quiz || PV.quiz.editId!==a.id) PV.quiz = {editId:a.id, title:r.title||"", questions: JSON.parse(JSON.stringify(r.questions)), fileName:"", busy:false, passed:r.passed||0};
    }
    const Q = PV.quiz || (PV.quiz = {title:"", questions:null, fileName:"", busy:false});
    const qs = Q.questions;
    const missing = qs ? qs.map((q,i)=>q.correct==null?i+1:0).filter(Boolean) : [];
    return wrap(`<h2>${isEdit?"עריכת בוחן":"בוחן חדש מקובץ וורד"}</h2>${msgs}
      <div class="field"><label>שם הבוחן</label><input type="text" id="quizTitle" maxlength="200" value="${esc(Q.title)}" placeholder="למשל: נהלי שער צפוני"></div>
      <div class="portal-drop" data-drop="quiz">
        <div style="font-weight:700;">${isEdit?"להחלפת כל השאלות — גררו לכאן קובץ וורד חדש (לא חובה)":"גררו לכאן קובץ וורד (docx) של שאלות ותשובות"}</div>
        <div class="muted" style="font-size:.85em;margin:4px 0 8px;">בכל שאלה — סמנו את התשובה הנכונה בהדגשה, בצבע/מרקר, בקו תחתון, או בכוכבית (*) לפניה או אחריה. התשובות יכולות להיות כל אחת בשורה משלה או באותה שורה (א. ... ב. ... ג. ...)</div>
        <label class="btn small secondary" style="cursor:pointer;">בחרו קובץ<input type="file" accept=".docx" data-action="portal-quiz-file" style="display:none;"></label>
        ${Q.fileName?`<div style="margin-top:8px;">📄 ${esc(Q.fileName)}</div>`:""}
      </div>
      ${Q.busy?'<p class="muted">קורא את הקובץ...</p>':""}
      ${!qs && !isEdit ? `<p style="margin-top:10px;"><button class="btn small secondary" data-action="portal-quiz-addq">✍️ או כתיבת בוחן ידנית, בלי קובץ</button></p>` : ""}
      ${qs ? `
        <h3 style="margin-top:16px;">${isEdit?"השאלות":"בדיקה לפני פרסום"} — ${qs.length} שאלות</h3>
        <p class="muted" style="margin-top:-6px;">העיגול הירוק = התשובה הנכונה. אפשר לשנות אותה בלחיצה, לתקן כל טקסט, להוסיף או להסיר שאלות ותשובות. המאבטחים לא יראו את הסימון.</p>
        ${missing.length?`<p class="shortage">לא סומנה תשובה נכונה בשאלות: ${missing.join(", ")} — סמנו אותה.</p>`:""}
        ${qs.map((q,i)=>`<div class="portal-qbox${q.correct==null?" bad":""}">
          <div class="flexbar" style="gap:6px;align-items:flex-start;">
            <b style="padding-top:6px;">${i+1}.</b>
            <textarea id="qzq_${i}" rows="2" style="flex:1;min-width:0;">${esc(q.q)}</textarea>
            <button class="btn small secondary" data-action="portal-quiz-del" data-q="${i}">הסר שאלה</button>
          </div>
          ${q.options.map((o,j)=>`<div class="portal-opt${q.correct===j?" right":""}" style="display:flex;gap:6px;align-items:center;">
            <input type="radio" name="qzc_${i}" data-action="portal-quiz-correct" data-q="${i}" data-o="${j}" ${q.correct===j?"checked":""} title="התשובה הנכונה">
            <input type="text" id="qzo_${i}_${j}" value="${esc(o)}" style="flex:1;min-width:0;">
            ${q.options.length>2?`<button class="btn small secondary" data-action="portal-quiz-delopt" data-q="${i}" data-o="${j}" title="הסר תשובה">✕</button>`:""}
          </div>`).join("")}
          ${q.options.length<10?`<button class="btn small secondary" data-action="portal-quiz-addopt" data-q="${i}" style="margin-top:4px;">+ תשובה</button>`:""}
        </div>`).join("")}
        <button class="btn small secondary" data-action="portal-quiz-addq">+ שאלה חדשה</button>
        ${isEdit ? `
          <label style="display:block;margin:14px 0 6px;"><input type="checkbox" id="quizReset" ${Q.reset?"checked":""}> לחייב את כל המאבטחים לענות מחדש${Q.passed?` (כרגע ${Q.passed} עברו)`:""}</label>
          <p class="muted" style="font-size:.85em;">בלי הסימון — מי שכבר עבר נשאר "עבר". הגרסה הקודמת של הבוחן נשמרת בהיסטוריה.</p>
          <div class="flexbar" style="gap:6px;"><button class="btn ok" data-action="portal-quiz-save" ${PV.busy||missing.length||!qs.length?"disabled":""}>💾 שמור שינויים</button>
          <button class="btn secondary" data-action="portal-pv-back">ביטול</button></div>`
        : `<p class="muted">שום דבר לא עולה ולא נשלח עד הלחיצה על "פרסם".</p>
        <button class="btn ok" data-action="portal-quiz-publish" ${PV.busy||missing.length||!qs.length?"disabled":""}>📢 פרסם בוחן</button>`}` : ""}`);
  }
  if(pg==="trn-quiz-view"){
    if(needLoad("trn_quiz_get", {p_token:tok, p_id:a.id, p_version: a.ver ? Number(a.ver) : null})) return loading();
    const r = PV.data.r;
    if(!r) return wrap(`<p class="muted">הבוחן לא נמצא.</p>`);
    const qs = r.questions || [];
    return wrap(`<h2>${esc(r.title||"")}</h2>${msgs}
      <p class="muted" style="margin-top:-6px;">פורסם ${fmtD(App, r.published_at)}${r.updated_at?` · נערך ${fmtDT(App, r.updated_at)}`:""} · ${r.passed||0} עברו · ${r.attempts||0} ניסיונות</p>
      ${!r.active ? `<div class="note-box">🗂 הבוחן נמחק${r.deleted_by?` ע"י ${esc(r.deleted_by)}`:""}${r.deleted_at?` ב-${fmtDT(App, r.deleted_at)}`:""}. המאבטחים לא רואים אותו. זה העותק השמור.
          <div style="margin-top:6px;"><button class="btn small ok" data-action="portal-quiz-restore" data-id="${r.id}" ${PV.busy?"disabled":""}>♻️ שחזר והחזר למאבטחים</button></div></div>` : ""}
      ${r.version ? `<div class="note-box">גרסה קודמת — נשמרה ${fmtDT(App, r.version.saved_at)}${r.version.saved_by?` ע"י ${esc(r.version.saved_by)}`:""} (${esc(r.version.reason||"")}). <span class="backlink" data-action="portal-pv" data-page="trn-quiz-view" data-id="${r.id}">לגרסה הנוכחית</span></div>` : ""}
      ${r.active && !r.version ? `<div class="flexbar" style="gap:6px;margin-bottom:8px;"><button class="btn small" data-action="portal-pv" data-page="trn-quiz-edit" data-id="${r.id}">✏️ עריכה</button></div>` : ""}
      ${qs.map((q,i)=>`<div class="portal-qbox"><div style="font-weight:700;">${i+1}. ${esc(q.q)}</div>
        ${(q.options||[]).map((o,j)=>`<div class="portal-opt${q.correct===j?" right":""}">${q.correct===j?"✔ ":""}${esc(o)}</div>`).join("")}</div>`).join("") || '<p class="muted">אין שאלות.</p>'}
      ${(r.versions||[]).length ? `<h3 style="margin-top:16px;">גרסאות קודמות</h3><div class="portal-tasks">${r.versions.map(v=>`<div class="portal-task" data-action="portal-pv" data-page="trn-quiz-view" data-id="${r.id}" data-ver="${v.id}">
          <span class="portal-task-icon">🕘</span><span>${fmtDT(App, v.saved_at)} · ${esc(v.title||"")} <span class="muted" style="font-size:.85em;">${v.count} שאלות · ${esc(v.reason||"")}${v.saved_by?` · ${esc(v.saved_by)}`:""}</span></span></div>`).join("")}</div>` : ""}`);
  }
  if(pg==="trn-quiz-history"){
    if(needLoad("trn_quiz_history", {p_token:tok})) return loading();
    const hs = PV.data.r || [];
    return wrap(`<h2>היסטוריית בחנים שנמחקו</h2>${msgs}
      <p class="muted" style="margin-top:-6px;">בחנים שהורדו מהמאבטחים. העותק המלא — השאלות, התוצאות והניסיונות — נשמר כאן, ואפשר לשחזר.</p>
      ${hs.length ? `<div class="portal-tasks">${hs.map(h=>`<div class="portal-task" data-action="portal-pv" data-page="trn-quiz-view" data-id="${h.id}">
        <span class="portal-task-icon">🗂</span>
        <span><span style="font-weight:600;">${esc(h.title)}</span> <span class="muted" style="font-size:.85em;display:block;">פורסם ${fmtD(App,h.published_at)} · נמחק ${fmtDT(App,h.deleted_at)}${h.deleted_by?` ע"י ${esc(h.deleted_by)}`:""} · ${h.questions} שאלות · ${h.passed} עברו · ${h.attempts} ניסיונות</span></span></div>`).join("")}</div>`
        : `<p class="muted">אין בחנים שנמחקו.</p>`}`);
  }
  if(pg==="trn-lomdas"){
    if(needLoad("trn_overview", {p_token:tok})) return loading();
    const trs = (PV.data.r && PV.data.r.trainings) || [];
    return wrap(`<div class="flexbar" style="justify-content:space-between;"><h2 style="margin:0;">לומדה ובחנים</h2>
      <span class="flexbar" style="gap:6px;"><button class="btn small" data-action="portal-pv" data-page="trn-quiz-new">+ בוחן חדש מקובץ וורד</button>
      <button class="btn small secondary" data-action="portal-pv" data-page="trn-quiz-history">🗂 בחנים שנמחקו</button></span></div><div style="height:10px;"></div>
      ${trs.length ? `<div class="portal-tasks">${trs.map(t=>`<div class="portal-task" data-action="portal-pv" data-page="trn-training" data-id="${t.id}">
        <span class="portal-pct">${pct(t.passed,t.eligible)}%</span>
        <span><span style="font-weight:600;">${esc(t.title)}</span> <span class="muted" style="font-size:.85em;">${t.passed} מתוך ${t.eligible} מאבטחים ביצעו · פורסמה ${fmtD(App,t.published_at)}</span></span></div>`).join("")}</div>`
        : `<p class="muted">עדיין לא הועלו לומדות. העלאת לומדות ובחנים תיבנה כשנגדיר איך נראית לומדה.</p>`}`);
  }
  if(pg==="trn-contents"){
    if(needLoad("trn_posts_list", {p_token:tok})) return loading();
    const cs = (PV.data.r||[]).filter(p=>p.kind==="content");
    return wrap(`<div class="flexbar" style="justify-content:space-between;"><h2 style="margin:0;">תוכן עיוני וסרטונים</h2>
      <button class="btn small" data-action="portal-pv" data-page="trn-post-new" data-kind="content">+ פרסום חדש</button></div>
      <p class="muted">המאבטח מסמן "צפיתי" בסוף כל תוכן או סרטון.</p>
      ${cs.length ? `<div class="portal-tasks">${cs.map(p=>`<div class="portal-task" data-action="portal-pv" data-page="trn-content-views" data-id="${p.id}">
        <span class="portal-pct">${pct(p.viewed||0,p.workers_total||0)}%</span>
        <span><span style="font-weight:600;">${esc(p.title)}</span>${youtubeId(p.link_url)?' <span class="muted">(סרטון)</span>':""} <span class="muted" style="font-size:.85em;">${p.viewed||0} מתוך ${p.workers_total||0} מאבטחים צפו · ${fmtD(App,p.created_at)}</span></span></div>`).join("")}</div>`
        : `<p class="muted">עדיין אין תכנים.</p>`}`);
  }
  if(pg==="trn-content-views"){
    if(needLoad("trn_post_views", {p_token:tok, p_post_id:a.id})) return loading();
    const r = PV.data.r, ws = r.workers||[], post = r.post||{};
    const done = ws.filter(w=>w.viewed).length;
    return wrap(`<div class="flexbar" style="justify-content:space-between;"><h2 style="margin:0;">${esc(post.title||"")}</h2>
      <button class="btn small secondary" data-action="portal-pv" data-page="post" data-id="${a.id}" data-from="i">פתח את התוכן</button></div>
      <p class="muted">פורסם ${fmtD(App, post.created_at)} · <b>${pct(done, ws.length)}%</b> צפו (${done} מתוך ${ws.length})</p>
      <h3 style="margin-bottom:0;">מי שטרם צפה</h3>
      ${notDoneByKabatHtml(App, ws, w=>w.viewed, "טרם צפו")}`);
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
  // מחולק לפי קב"טים, כמו עמוד Pro-Riding (לבקשת סרגיי, 2026-10-08)
  const groups = {};
  ws.forEach(w=>{ const k = workerKabat(App, w); (groups[k] = groups[k]||[]).push(w); });
  return Object.keys(groups).sort((x,y)=>x.localeCompare(y,"he")).map(k=>`
    <h3 style="margin:16px 0 6px;">${esc(k)} <span class="muted" style="font-size:.8em;">${groups[k].length} עובדים</span></h3>
    <table><thead><tr><th style="text-align:right;">עובד</th><th style="text-align:right;">עיר</th><th>התקדמות</th><th style="text-align:right;">המועד הבא</th><th></th></tr></thead><tbody>
    ${groups[k].map(w=>{
      const next = (w.items||[]).filter(i=>!i.done && i.scheduled_at).sort((x,y)=>String(x.scheduled_at).localeCompare(String(y.scheduled_at)))[0];
      const st = next ? onbStations(App, w).find(s=>s.key===next.key) : null;
      return `<tr><td style="text-align:right;">${esc(w.name)}</td><td style="text-align:right;">${esc(workerSector(App,w))}</td>
        <td>${onbDone(w)}/${ONB_KEYS.length}</td><td style="text-align:right;">${next?`${fmtDT(App,next.scheduled_at)} · ${esc(st?st.who:"")}`:'<span class="muted">—</span>'}</td>
        <td style="white-space:nowrap;"><button class="btn small" data-action="portal-pv" data-page="trn-onb-worker" data-id="${w.id}">לתאם הדרכה / חפיפה</button>
          ${onbDone(w)>=ONB_KEYS.length
            ? `<span class="portal-task-icon done" style="margin-inline-start:6px;">✔</span> הושלם <button class="btn small secondary" data-action="portal-onb-complete" data-id="${w.id}" data-done="0">בטל</button>`
            : `<button class="btn small ok" data-action="portal-onb-complete" data-id="${w.id}" data-done="1" title="מסמן את כל 6 התחנות כבוצעו">✔ בוצע</button>`}</td></tr>`;
    }).join("")}</tbody></table>`).join("");
}

/* ================================================================
   בוחן מקובץ וורד (לבקשת סרגיי, 2026-10-09): ישראל גורר קובץ .docx של שאלות ותשובות, שבו התשובה
   הנכונה מסומנת (מודגשת / מסומנת בצבע או ב"מרקר" / קו תחתון / כוכבית או ✓). הקובץ נקרא כאן בדפדפן,
   מוצג לישראל לבדיקה, ורק "פרסם" שולח לשרת. אין ספריות חיצוניות: פריסת ה-zip ב-DecompressionStream.
   ================================================================ */
async function docxReadFiles(buf, names){
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for(let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--){ if(dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; } }
  if(eocd < 0) throw new Error("הקובץ אינו קובץ וורד (docx) תקין");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = {};
  const dec = new TextDecoder("utf-8");
  for(let k = 0; k < count; k++){
    if(dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if(!names.includes(name)) continue;
    const lnlen = dv.getUint16(lho + 26, true), lelen = dv.getUint16(lho + 28, true);
    const data = u8.subarray(lho + 30 + lnlen + lelen, lho + 30 + lnlen + lelen + csize);
    let bytes;
    if(method === 0) bytes = data;
    else if(method === 8){
      if(typeof DecompressionStream === "undefined") throw new Error("הדפדפן לא תומך בקריאת קבצי וורד — נסו בכרום");
      const ds = new DecompressionStream("deflate-raw");
      const stream = new Blob([data]).stream().pipeThrough(ds);
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    } else throw new Error("פורמט דחיסה לא נתמך");
    out[name] = dec.decode(bytes);
  }
  return out;
}
function xmlUnescape(s){ return s.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(m,n)=>String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi,(m,n)=>String.fromCharCode(parseInt(n,16))).replace(/&amp;/g,"&"); }
function xmlAttr(tagXml, attr){ const m = tagXml.match(new RegExp(attr + '="([^"]*)"')); return m ? m[1] : null; }
function docxNumFormats(numberingXml){
  const fmt = {}; // numId -> {ilvl: numFmt}
  if(!numberingXml) return fmt;
  const abs = {};
  (numberingXml.match(/<w:abstractNum\b[\s\S]*?<\/w:abstractNum>/g) || []).forEach(a=>{
    const id = xmlAttr(a.match(/<w:abstractNum\b[^>]*>/)[0], "w:abstractNumId");
    const lv = {};
    (a.match(/<w:lvl\b[\s\S]*?<\/w:lvl>/g) || []).forEach(l=>{
      const il = xmlAttr(l.match(/<w:lvl\b[^>]*>/)[0], "w:ilvl");
      const f = l.match(/<w:numFmt\b[^>]*>/);
      lv[il] = f ? xmlAttr(f[0], "w:val") : null;
    });
    abs[id] = lv;
  });
  (numberingXml.match(/<w:num\b[\s\S]*?<\/w:num>/g) || []).forEach(n=>{
    const id = xmlAttr(n.match(/<w:num\b[^>]*>/)[0], "w:numId");
    const a = n.match(/<w:abstractNumId\b[^>]*>/);
    if(a) fmt[id] = abs[xmlAttr(a[0], "w:val")] || {};
  });
  return fmt;
}
function docxRunMarks(rPr){
  const on = tag=>{ const m = rPr.match(new RegExp("<w:" + tag + "(\\s[^>]*)?/?>")); if(!m) return false; const v = xmlAttr(m[0], "w:val"); return v === null || !/^(0|false|none|off)$/i.test(v); };
  const color = (()=>{ const m = rPr.match(/<w:color\b[^>]*>/); if(!m) return false; const v = (xmlAttr(m[0], "w:val") || "").toLowerCase(); return v && v !== "auto" && v !== "000000"; })();
  const shd = (()=>{ const m = rPr.match(/<w:shd\b[^>]*>/); if(!m) return false; const v = (xmlAttr(m[0], "w:fill") || "").toLowerCase(); return v && v !== "auto" && v !== "ffffff"; })();
  return { bold: on("b") || on("bCs"), underline: on("u"), highlight: on("highlight"), color, shd };
}
/* פסקאות → שורות. ירידת שורה בתוך פסקה (Shift+Enter) = שורה נפרדת. לכל תו נשמר הסימון שלו (הדגשה וכו'),
   כדי שגם תשובות שנכתבו באותה שורה ("א. ... ב. ... ג. ...") יפוצלו ויזוהו כל אחת לחוד. */
function docxParagraphs(docXml, numFmt){
  const lines = [];
  const body = (docXml.match(/<w:body>([\s\S]*)<\/w:body>/) || [,docXml])[1];
  (body.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || []).forEach(px=>{
    const pPr = (px.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/) || [,""])[1];
    let kind = null;
    const numId = (pPr.match(/<w:numId\b[^>]*>/) || [null])[0], ilvlT = (pPr.match(/<w:ilvl\b[^>]*>/) || [null])[0];
    if(numId){
      const nid = xmlAttr(numId, "w:val"), il = ilvlT ? xmlAttr(ilvlT, "w:val") : "0";
      if(nid && nid !== "0"){
        const f = (numFmt[nid] || {})[il];
        if(il !== "0") kind = "a";
        else if(f && /hebrew|letter|roman|aiueo|iroha/i.test(f)) kind = "a";
        else kind = "q";
      }
    }
    const content = px.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, "");
    let cur = [];               // [{c, m}]
    const flush = ()=>{ if(cur.some(x=>/\S/.test(x.c))) lines.push({chars:cur, kind: lines.__p === px ? null : kind}); lines.__p = px; cur = []; };
    (content.match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g) || []).forEach(rx=>{
      const m = docxRunMarks((rx.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/) || [,""])[1]);
      (rx.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>|<w:tab\/>|<w:br\b[^>]*\/>|<w:cr\/>/g) || []).forEach(tx=>{
        if(/^<w:(br|cr)\b/.test(tx)) return flush();
        const t = tx === "<w:tab/>" ? " " : xmlUnescape(tx.replace(/^<w:t(?:\s[^>]*)?>/, "").replace(/<\/w:t>$/, ""));
        for(const c of t) cur.push({c, m});
      });
    });
    flush();
  });
  delete lines.__p;
  return lines;
}
function qzText(chars){ return chars.map(x=>x.c).join("").replace(/\s+/g, " ").trim(); }
function qzFeats(chars){
  const f = {bold:0, underline:0, highlight:0, color:0, shd:0}; let n = 0;
  chars.forEach(x=>{ if(/\s/.test(x.c) || /[*＊∗٭⁎✱★✓✔√☑✅.)\-]/.test(x.c)) return; n++; Object.keys(f).forEach(k=>{ if(x.m[k]) f[k]++; }); });
  Object.keys(f).forEach(k=> f[k] = n ? f[k]/n : 0);
  return f;
}
/* פיצול שורה שבה כתובות כמה תשובות: "א. ... ב. ... ג. ..." (גם "*ב." — הכוכבית שייכת לתשובה שאחריה) */
function qzSplitInline(chars){
  const text = chars.map(x=>x.c).join("");
  const re = /(^|[\s.,;:!?])([*＊∗٭⁎✱★✓✔√]?\s*)([א-י]|[a-jA-J])\s*[.)]\s/g;
  const hits = []; let m;
  while((m = re.exec(text))){ hits.push({pos: m.index + m[1].length, letter: m[3]}); re.lastIndex = m.index + m[0].length; }
  const heb = "אבגדהוזחטי", lat = "abcdefghij";
  const idx = l=> heb.includes(l) ? heb.indexOf(l) : lat.indexOf(l.toLowerCase());
  // רצף עולה של אותיות (א,ב,ג... או ב,ג,ד...) - כדי לא לפצל מילים רגילות
  let best = [];
  for(let i=0;i<hits.length;i++){ const run=[hits[i]]; for(let j=i+1;j<hits.length;j++){ if(idx(hits[j].letter)===idx(run[run.length-1].letter)+1) run.push(hits[j]); } if(run.length>best.length) best=run; }
  if(best.length < 2) return [chars];
  const cuts = best.map(h=>h.pos);
  if(cuts[0] > 0 && text.slice(0, cuts[0]).trim()) cuts.unshift(0); else cuts[0] = 0;
  return cuts.map((c,i)=>chars.slice(c, cuts[i+1] !== undefined ? cuts[i+1] : chars.length)).filter(p=>qzText(p));
}
const QZ_MARK_CHARS = /[*＊∗٭⁎✱★✓✔√☑✅]/;
const QZ_MARK_TEXT = /\(\s*(?:נכון|תשובה נכונה)\s*\)|\s[-–]\s*(?:נכון|תשובה נכונה)\s*$/;
const QZ_LETTER = /^\s*(?:[א-י]|[a-jA-J])\s*[.)\-]\s*/;
function qzCleanOption(t){
  return t.replace(QZ_MARK_TEXT, " ").replace(/[*＊∗٭⁎✱★✓✔√☑✅]+/g, " ").replace(/\(\s*\)/g, " ").replace(/\s+/g, " ").trim().replace(QZ_LETTER, "").trim();
}
function parseQuizParagraphs(lines){
  const questions = [];
  let cur = null;
  const addOption = chars=>{
    const raw = qzText(chars);
    const marked = QZ_MARK_CHARS.test(raw) || QZ_MARK_TEXT.test(raw);
    const text = qzCleanOption(raw);
    if(!text) return;
    cur.options.push(text); cur.markers.push(marked); cur.feats.push(qzFeats(chars));
  };
  lines.forEach(L=>{
    let t = qzText(L.chars), kind = L.kind, chars = L.chars;
    const qm = t.match(/^(?:שאלה\s*)?(\d{1,3})\s*[.):\-]\s*(.*)$/);
    const am = QZ_LETTER.test(t.replace(/^[*＊∗٭⁎✱★✓✔√]\s*/, ""));
    if(!kind){
      if(qm && qm[2]) kind = "q";
      else if(am && cur) kind = "a";
      else if(/[?？]\s*$/.test(t)) kind = "q";
      else if(cur) kind = "a";
    }
    if(kind === "q"){
      // שאלה ותשובות באותה שורה: "1. מה...? א. ... ב. ..."
      const parts = qzSplitInline(chars);
      const qText = qzText(parts[0]).replace(/^(?:שאלה\s*)?\d{1,3}\s*[.):\-]\s*/, "");
      cur = {q:qText, options:[], feats:[], markers:[]}; questions.push(cur);
      parts.slice(1).forEach(addOption);
    } else if(kind === "a" && cur){
      qzSplitInline(chars).forEach(addOption);
    }
  });
  const order = ["highlight", "shd", "color", "underline", "bold"];
  return questions.filter(q=>q.q).map(q=>{
    let correct = null, how = null;
    const mk = q.markers.map((m,i)=>m?i:-1).filter(i=>i>=0);
    if(mk.length === 1){ correct = mk[0]; how = "סימון"; }
    else {
      for(const f of order){
        const has = q.feats.map((x,i)=> x[f] >= 0.5 ? i : -1).filter(i=>i>=0);
        if(has.length === 1){ correct = has[0]; how = {highlight:"מרקר", shd:"הצללה", color:"צבע", underline:"קו תחתון", bold:"הדגשה"}[f]; break; }
      }
    }
    return {q:q.q, options:q.options, correct, how};
  });
}
async function parseQuizDocx(buf){
  const files = await docxReadFiles(buf, ["word/document.xml", "word/numbering.xml"]);
  if(!files["word/document.xml"]) throw new Error("לא נמצא תוכן בקובץ הוורד");
  return parseQuizParagraphs(docxParagraphs(files["word/document.xml"], docxNumFormats(files["word/numbering.xml"])));
}

/* קורא את מה שהוקלד בעורך הבוחן (כותרת, שאלות, תשובות) לתוך PV.quiz - לפני כל פעולה שמרנדרת מחדש */
function syncQuiz(){
  const Q = PV.quiz; if(!Q) return null;
  const tEl = document.getElementById("quizTitle"); if(tEl) Q.title = tEl.value;
  const rEl = document.getElementById("quizReset"); if(rEl) Q.reset = rEl.checked;
  (Q.questions||[]).forEach((q,i)=>{
    const qe = document.getElementById("qzq_"+i); if(qe) q.q = qe.value;
    q.options = q.options.map((o,j)=>{ const oe = document.getElementById(`qzo_${i}_${j}`); return oe ? oe.value : o; });
  });
  return Q;
}
function quizProblem(Q){
  if(!Q.title.trim()) return "יש לתת שם לבוחן";
  for(let i=0;i<Q.questions.length;i++){
    const q = Q.questions[i];
    if(!String(q.q).trim()) return `שאלה ${i+1}: חסר טקסט לשאלה`;
    if(q.options.length<2) return `שאלה ${i+1}: צריך לפחות שתי תשובות`;
    if(q.options.some(o=>!String(o).trim())) return `שאלה ${i+1}: יש תשובה ריקה`;
    if(q.correct==null) return `שאלה ${i+1}: לא סומנה תשובה נכונה`;
  }
  return null;
}
async function loadQuizFile(App, file){
  if(!file) return;
  const Q = syncQuiz() || (PV.quiz = {title:"", questions:null, fileName:"", busy:false});
  PV.error = null; PV.msg = null;
  if(!/\.docx$/i.test(file.name)){ PV.error = "יש לבחור קובץ וורד מסוג docx (בוורד: שמירה בשם ← Word Document)"; return App.render(); }
  Q.busy = true; Q.fileName = file.name; App.render();
  try{
    const qs = await parseQuizDocx(await file.arrayBuffer());
    Q.questions = qs;
    if(!Q.title) Q.title = file.name.replace(/\.docx$/i, "");
    if(!qs.length) PV.error = "לא נמצאו שאלות בקובץ. כל שאלה צריכה להיות בשורה משלה (למשל \"1. ...\" או שורה שמסתיימת ב-?) ומתחתיה התשובות.";
  }catch(err){ Q.questions = null; PV.error = err.message; }
  Q.busy = false; App.render();
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
    if(a==="portal-quiz-publish"){
      const Q = syncQuiz(); if(!Q || !Q.questions) return;
      const prob = quizProblem(Q); if(prob){ PV.error = prob; return App.render(); }
      PV.busy = true; PV.error = null; App.render();
      await App.apiRpc("trn_training_create", {p_token:tok, p_title:Q.title, p_questions: Q.questions.map(q=>({q:q.q, options:q.options, correct:q.correct}))});
      PV.busy = false; PV.quiz = null; I.data = null;
      pvBack(App); PV.msg = "הבוחן פורסם. המאבטחים קיבלו אותו כמשימה."; return App.render();
    }
    if(a==="portal-quiz-del"){
      const Q = syncQuiz(); Q.questions.splice(+el.dataset.q, 1); return App.render();
    }
    if(a==="portal-quiz-save"){
      const Q = syncQuiz(); if(!Q || !Q.questions || !Q.editId) return;
      const prob = quizProblem(Q); if(prob){ PV.error = prob; return App.render(); }
      PV.busy = true; PV.error = null; App.render();
      const r = await App.apiRpc("trn_training_update", {p_token:tok, p_id:Q.editId, p_title:Q.title, p_questions: Q.questions.map(q=>({q:String(q.q).trim(), options:q.options.map(o=>String(o).trim()), correct:q.correct})), p_reset: !!Q.reset});
      PV.busy = false; PV.quiz = null; I.data = null;
      pvBack(App); PV.msg = "הבוחן עודכן." + (Q.reset ? ` כל המאבטחים יצטרכו לענות מחדש (אופס ל-${(r&&r.reset)||0}), ונשלחה להם התראה.` : "") + " הגרסה הקודמת נשמרה בהיסטוריה."; return App.render();
    }
    if(a==="portal-quiz-delete"){
      PV.busy = true; PV.error = null; App.render();
      await App.apiRpc("trn_training_delete", {p_token:tok, p_id:el.dataset.id});
      PV.busy = false; PV.delAsk = false; I.data = null;
      pvBack(App); PV.msg = "הבוחן הוסר מהמאבטחים. עותק נשמר ב\"בחנים שנמחקו\"."; return App.render();
    }
    if(a==="portal-quiz-restore"){
      PV.busy = true; PV.error = null; App.render();
      await App.apiRpc("trn_training_restore", {p_token:tok, p_id:el.dataset.id});
      PV.busy = false; PV.data = null; I.data = null; PV.msg = "הבוחן שוחזר וחזר למאבטחים."; return App.render();
    }
    if(a==="portal-onb-complete"){
      el.disabled = true;
      await App.apiRpc("trn_onboarding_complete", {p_token:tok, p_worker_id:el.dataset.id, p_done:el.dataset.done==="1"});
      PV.data = null; I.data = null; PV.msg = null; PV.error = null; return App.render();
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
  if(e.type==="drop"){ zone.classList.remove("over"); if(PV.page==="trn-post-new" && !PV.busy) addPostFiles(App, e.dataTransfer && e.dataTransfer.files); if(PV.page==="trn-quiz-new" || PV.page==="trn-quiz-edit") loadQuizFile(App, e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); }
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
  if(a==="portal-swap-sel"){ SW.sel = t.dataset.k; SW.error = null; return; }
  if(a==="portal-swapm-sel"){ if(PV.swap) PV.swap.sel = t.dataset.k; PV.error = null; return; }
  if(a==="portal-swapm-hsel"){ if(PV.swap) PV.swap.hsel = t.dataset.w; PV.error = null; return; }
  if(a==="portal-quiz-answer"){ if(T.quiz){ T.quiz.answers[+t.dataset.q] = +t.dataset.o; T.quiz.error = null; } return; }
  const ms = loadMgr(App); if(!ms) return;
  if(a==="portal-quiz-file"){ return loadQuizFile(App, t.files && t.files[0]); }
  if(a==="portal-quiz-correct"){ const Q = syncQuiz(); Q.questions[+t.dataset.q].correct = +t.dataset.o; return App.render(); }
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
  if(a==="portal-inc-pdf"){ const f = t.files && t.files[0]; t.value = ""; return incLoadPdf(App, f); }
  if(a==="portal-inc-img-add"){ const fs = Array.from(t.files||[]); t.value = ""; return incAddImages(App, fs); }
  if(a==="portal-onb-open"){ PV.onlyOpen = t.checked; const l = document.getElementById("onbList"); if(l) l.innerHTML = onbListHtml(App); }
}

/* מסכי "הדרכה" (בינתיים "בקרוב") ו"לוגיסטי" */
function renderSection(App, view){
  const session = loadSession(App);
  if(!session){ App.S.view = "home"; return renderHome(App); }
  if(N.state!=="on"){ App.S.view = "home"; return renderHome(App); }
  const title = view==="training" ? "הדרכה" : "לוגיסטי";
  if(view==="training" && T.quiz) return `<div class="card">${renderQuiz(App, session)}</div>`;
  if(view==="training" && T.controlOpen) return `<div class="card">${renderControlDoc(App, session)}</div>`;
  if((view==="training" || view==="updates") && T.postOpen) return `<div class="card">${renderPostDoc(App)}</div>`;
  if(view==="updates") return `<div class="card">
    <span class="backlink" data-action="go-home">◀ חזרה לאיזור האישי</span>
    <h2>עדכונים והודעות</h2>
    ${renderAllUpdates(App, session)}
  </div>`;
  const body = view==="logistics" ? renderLogistics(App, session) : renderTraining(App, session);
  return `<div class="card">
    <span class="backlink" data-action="go-home">◀ חזרה לאיזור האישי</span>
    <h2>${title}</h2>
    ${body}
  </div>`;
}

/* ================================================================
   ממשק מנהל (2026-10-08). מה שמוצג נקבע לפי ההרשאות של המנהל בשרת (טבלת managers):
   - schedule_team_ids: סידור עבודה (טבלה מרוכזת, שיבוץ אוטומטי/ידני, פרסום, פלט, פתיחת הגשה,
     ניהול עובדים) לצוותים שלו - בלי קוד העריכה המשותף (הסשן שלו מחליף אותו). למשל מאיר אזרואל.
   - logistics_team_ids: בקשות ציוד של העובדים בצוותים שלו. למשל דניאל כתב (ירושלים) ואביחי קדוש
     (בית שמש / ביתר עילית / מודיעין עילית).
   ================================================================ */
function mgrTeams(App, ids){
  return (ids||[]).map(App.teamById).filter(Boolean).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
}
/* התראות לטלפון למנהלים (2026-10-11) - חובה, ראו mgrPushGate */
const MN = { state:null, busy:false, error:null };
async function checkMgrPush(App, ms){
  try{
    if(!pushSupported()){ MN.state = (isIOS() && !isStandalone()) ? "ios-install" : "unsupported"; return App.render(); }
    if(Notification.permission==="denied"){ MN.state = "denied"; return App.render(); }
    const reg = await swReg(); const sub = await reg.pushManager.getSubscription();
    MN.state = (sub && Notification.permission==="granted" && await App.apiRpc("manager_push_status", {p_token:ms.token, p_endpoint:sub.endpoint})) ? "on" : "off";
  }catch(e){ MN.state = "off"; }
  App.render();
}
async function enableMgrPush(App, ms){
  MN.busy = true; MN.error = null; App.render();
  try{
    const perm = await Notification.requestPermission();
    if(perm !== "granted"){ MN.state = perm==="denied" ? "denied" : "off"; MN.busy = false; return App.render(); }
    const key = await App.apiRpc("push_public_key", {});
    const reg = await swReg(); await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub) sub = await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:b64ToU8(key)});
    const j = sub.toJSON();
    await App.apiRpc("manager_push_subscribe", {p_token:ms.token, p_endpoint:j.endpoint, p_p256dh:j.keys.p256dh, p_auth:j.keys.auth});
    MN.state = "on";
  }catch(e){ MN.error = "לא הצלחנו להפעיל התראות: " + e.message; }
  MN.busy = false; App.render();
}
function mgrScopeGroups(App, ms){
  const ids = new Set([].concat(ms.schedule_team_ids||[], ms.logistics_team_ids||[]));
  const teams = ms.can_training ? (App.S.teams||[]) : (App.S.teams||[]).filter(t=>ids.has(t.id));
  const seen = new Set(), out = [];
  teams.slice().sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).forEach(t=>{ const g = App.sectorGroupForTeam(t); if(seen.has(g.label)) return; seen.add(g.label); out.push({id:t.id, label:g.label}); });
  return out;
}
/* כל השיבוצים העתידיים בגזרה, רק בתקופות שפורסמו */
async function loadSwapRows(App, S2){
  try{
    const today = App.fmtDate(new Date());
    const enc = encodeURIComponent(S2.sector);
    const pubs = await App.apiGet("schedule_publications", `select=period_start,period_end&sector=eq.${enc}&period_end=gte.${today}`);
    if(!pubs.length){ S2.rows = []; return App.render(); }
    const maxEnd = pubs.map(p=>p.period_end).sort().slice(-1)[0];
    const as = await App.apiGet("shift_assignments", `select=sector,entry_date,shift_type,worker_id,custom_start,custom_end,shadow_of&sector=eq.${enc}&entry_date=gte.${today}&entry_date=lte.${maxEnd}&order=entry_date`);
    const inPub = d=>pubs.some(p=>d>=p.period_start && d<=p.period_end);
    const rows = as.filter(x=>!x.shadow_of && inPub(x.entry_date));
    const ids = Array.from(new Set(rows.map(r=>r.worker_id)));
    const ws = ids.length ? await App.apiGet("roster_workers", `select=id,name&id=in.(${ids.join(",")})`) : [];
    const names = {}; ws.forEach(w=>names[w.id]=w.name);
    const seen = new Set();
    S2.rows = rows.map(r=>Object.assign(r, {worker_name: names[r.worker_id]||"?"})).filter(r=>{ const k = `${r.entry_date}|${r.shift_type}|${r.worker_id}`; if(seen.has(k)) return false; seen.add(k); return true; });
  }catch(e){ S2.rows = []; PV.error = e.message; }
  App.render();
}
/* צפייה בלבד בסידור עבודה (2026-10-11): למנהלים בלי הרשאת עריכה. קב"ט - הצוותים שלו; ישראל - כל הצוותים */
function mgrViewCard(App, ms, sched){
  if(sched.length && !ms.edit_as_button) return ""; // מי שבונה סידור כבר רואה אותו
  const teams = ms.can_training ? (App.S.teams||[]).slice().sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)) : mgrTeams(App, ms.logistics_team_ids);
  const seen = new Set(), tiles = [];
  teams.forEach(t=>{ const g = App.sectorGroupForTeam(t); if(seen.has(g.label)) return; seen.add(g.label); tiles.push({id:t.id, label:g.label}); });
  if(!tiles.length) return "";
  return `<div class="card">
    <h3>סידור עבודה</h3>
    <p class="muted" style="margin-top:-6px;">צפייה בלבד</p>
    <div class="grid-teams">${tiles.map(t=>`<div class="team-tile" data-action="portal-mgr-view" data-id="${t.id}">${App.escapeHtml(t.label)}</div>`).join("")}
      <div class="team-tile" data-action="portal-pv" data-page="swap-mgr">🔁 מבקש חילוף</div></div>
  </div>`;
}
function renderManagerHome(App, ms){
  const esc = App.escapeHtml;
  const gate = mgrPushGate(App, ms); if(gate) return gate;
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
  if(INC.pendCount===undefined && (logi.length || ms.is_admin)){
    INC.pendCount = 0;
    App.apiRpc("inc_debrief_list", {p_token:ms.token}).then(d=>{ const n = (d||[]).filter(x=>!x.report_id || x.report_mine).length; if(n !== INC.pendCount){ INC.pendCount = n; App.render(); } }).catch(()=>{});
  }
  const names = ts=>esc(ts.map(t=>(t.sectors&&t.sectors.length)?t.sectors.join(" / "):t.name).join(" · "));
  return `
  <div class="card">
    <div class="flexbar" style="justify-content:space-between;">
      <h2 style="margin:0;">שלום, ${esc(ms.name)}</h2>
      <button class="btn small secondary" data-action="portal-mgr-logout">יציאה</button>
    </div>
  </div>
  ${(logi.length || ms.is_admin) ? `<div class="card">
    <h3>🚨 דו"ח אירוע חריג</h3>
    <div class="grid-teams">
      <div class="team-tile" data-action="portal-inc-new"><div style="font-size:1.1em;font-weight:700;">➕ דו"ח חדש</div><div class="muted" style="font-size:.85em;margin-top:4px;">תחקיר אירוע חריג</div></div>
      <div class="team-tile" data-action="portal-pv" data-page="inc-list"><div style="font-size:1.1em;font-weight:700;">📋 ${ms.is_admin?"כל הדו\"חות":"הדו\"חות שלי"}</div><div class="muted" style="font-size:.85em;margin-top:4px;">טיוטות ודו"חות שנשלחו</div></div>
      ${INC.pendCount ? `<div class="team-tile" data-action="portal-pv" data-page="inc-list" style="border-color:#b42318;"><div style="font-size:1.1em;font-weight:700;color:#b42318;">🔔 ${INC.pendCount} ${INC.pendCount===1?"אירוע חדש":"אירועים"} מהמוקד</div><div class="muted" style="font-size:.85em;margin-top:4px;">ממתינים לתחקיר</div></div>` : ""}
    </div>
  </div>` : ""}
  ${!isUnitMgr(ms) ? (()=>{ if(C.homeCount===undefined){ C.homeCount = null; calLoad(App, ms, true); } return `<div class="card">
    <div class="team-tile" data-action="portal-pv" data-page="cal" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <div><div style="font-size:1.1em;font-weight:700;">📅 יומן משותף</div><div class="muted" style="font-size:.85em;margin-top:4px;">משימות ודברים שנקבעו — הקב"טים, סרגיי ומאיר</div></div>
      ${C.homeCount ? `<span class="portal-badge">📌 ${C.homeCount} משימות פתוחות</span>` : ""}
    </div>
  </div>`; })() : ""}
  ${ms.is_admin ? `<div class="card">
    <h3>🔑 ניהול מערכת</h3>
    <div class="grid-teams">${tile("portal-mh-codes", "🔑 עריכת קודים של מנהלים", "קביעה ושינוי קוד אישי לכל מנהל")}
      <div class="team-tile" data-action="portal-pv" data-page="unit-dash"><div style="font-size:1.1em;font-weight:700;">📊 לוח מנהל יחידה</div><div class="muted" style="font-size:.85em;margin-top:4px;">תמונת מצב כמו שמנהל היחידה רואה</div></div></div>
  </div>` : ""}
  ${sched.length && !ms.edit_as_button? `<div class="card">
    <h3>סידור עבודה</h3>
    <p class="muted" style="margin-top:-6px;">${names(sched)}</p>
    <div class="grid-teams">
      ${tile("portal-mh-agg", "טבלה מרוכזת ובניית סידור", "שיבוץ, פרסום, פלט ופתיחת הגשה")}
      ${tile("portal-mh-admin", "ניהול עובדים", "הוספה, קודים וסימונים")}
      <div class="team-tile" data-action="portal-pv" data-page="swap-mgr"><div style="font-size:1.1em;font-weight:700;">🔁 מבקש חילוף</div><div class="muted" style="font-size:.85em;margin-top:4px;">בקשות חילוף ופתיחת בקשה</div></div>
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
  ${mgrViewCard(App, ms, sched)}
  ${ms.can_training ? renderIsraelDashboard(App, ms) : ""}
  ${sched.length && ms.edit_as_button ? `<div class="card" style="text-align:center;">
    <button class="btn" data-action="portal-mh-agg" style="font-size:1.05em;padding:12px 26px;">✏️ ערוך סידור</button>
    <p class="muted" style="margin:8px 0 0;font-size:.85em;">שיבוץ ידני ואוטומטי, פרסום ופלט — ${names(sched)}</p>
  </div>`:""}
  ${!sched.length && !logi.length && !ms.can_training && !ms.is_admin ? (U.error && /אין הרשאה/.test(U.error) ? `<div class="card"><p class="muted">אין עדיין הרשאות לממשק הזה.</p></div>` : renderUnitDashboard(App, ms)) : ""}`;
}
function enterMgrSchedule(App, ms, which){
  const S = App.S;
  const teams = mgrTeams(App, ms.schedule_team_ids);
  if(!teams.length) return App.render();
  S.pin = "mgr:" + ms.token; // הסשן של המנהל במקום קוד העריכה המשותף (לא נשמר בדפדפן)
  const access = {}; teams.forEach(t=>access[t.id] = true);
  S.teamAccess = Object.assign({}, S.teamAccess, access);
  const groups = new Set(teams.map(t=>App.sectorGroupForTeam(t).label));
  const many = ms.is_admin || groups.size > 1; // מנהל מערכת / כמה קבוצות גזרות - בוחרים מהרשימה
  if(which==="agg"){
    S.view = "aggregate"; S.ui = many ? {mgrPick: true} : {teamId: teams[0].id};
  } else {
    S.view = "admin"; S.ui = many ? {pinOk: true, mgrPick: true} : {pinOk: true, teamIds: teams.map(t=>t.id), recipientLabel: ms.name};
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
  const code = DEMO ? "demo" : (codeEl ? codeEl.value : P.code);
  const sel = (P.workers||[]).find(w=>w.key===P.selectedId);
  if(!sel || !code){ P.error = "יש להזין קוד אישי"; return App.render(); }
  P.busy = true; P.error = null; App.render();
  try{
    if(sel.kind==="m"){
      const res = await App.apiRpc("manager_login", {p_manager_id: sel.id, p_password: code});
      P.busy = false;
      if(!res){ P.error = "קוד שגוי"; P.code=""; return App.render(); }
      saveSession(App, null); saveMgr(App, res); I.data = null; K.data = null;
      P.selectedId = null; P.code = ""; P.query = ""; P.checkedMgr = true; P.firstCode = false;
      return App.render();
    }
    const res = await App.apiRpc("worker_login", {p_worker_id: sel.id, p_code: code});
    P.busy = false;
    if(!res){ P.error = "קוד שגוי"; P.code=""; return App.render(); }
    saveMgr(App, null); clearMgrMode(App);
    saveSession(App, res);
    P.selectedId = null; P.code = ""; P.query = ""; P.shifts = null; P.checkedSession = true; T.data = null; F.data = null;
    App.render();
  }catch(err){
    P.busy = false;
    // "Failed to fetch" = הבקשה לא הגיעה לשרת (אין אינטרנט / רשת חוסמת) - הודעה ברורה בעברית
    if(sel.kind==="m" && /לא הוגדר|לא הוגדרה/.test(err.message)){ P.firstCode = true; P.error = null; return App.render(); }
    P.error = /failed to fetch|networkerror|load failed/i.test(err.message) ? "אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב." : err.message;
    App.render();
  }
}
/* קוד ראשון למנהל (קוד אחד לכל מנהל, 2026-10-11): מנהל המערכת מאשר עם קוד העריכה, והמנהל נכנס מיד */
async function firstManagerCode(App){
  const sel = (P.workers||[]).find(w=>w.key===P.selectedId);
  const pin = (document.getElementById("firstEditPin")||{}).value || "";
  const code = (document.getElementById("firstNewCode")||{}).value || "";
  if(!sel || sel.kind!=="m") return;
  if(!pin){ P.error = "יש להזין את קוד העריכה"; return App.render(); }
  if(code.length < 4){ P.error = "הקוד האישי צריך להיות לפחות 4 תווים"; return App.render(); }
  P.busy = true; P.error = null; App.render();
  try{
    await App.apiRpc("admin_set_manager_password", {p_pin: pin, p_manager_id: sel.id, p_password: code});
    const res = await App.apiRpc("manager_login", {p_manager_id: sel.id, p_password: code});
    P.busy = false;
    if(!res){ P.error = "הקוד נשמר אבל הכניסה נכשלה - נסו להיכנס שוב"; return App.render(); }
    saveSession(App, null); saveMgr(App, res); I.data = null; K.data = null;
    P.selectedId = null; P.code = ""; P.query = ""; P.checkedMgr = true; P.firstCode = false;
    App.render();
  }catch(err){
    P.busy = false;
    P.error = /invalid pin/i.test(err.message) ? "קוד העריכה שגוי" : err.message;
    App.render();
  }
}

function onClick(App, a, el){
  const S = App.S;
  if(a==="portal-swapm-team"){ PV.swap.teamId = el.dataset.id; PV.swap.sector = null; PV.swap.rows = null; PV.swap.sel = null; return App.render(); }
  if(a==="portal-swapm-sector"){ PV.swap.sector = el.dataset.s; PV.swap.rows = null; PV.swap.sel = null; return App.render(); }
  if(a==="portal-swapm-send"){
    const ms = loadMgr(App); const S2 = PV.swap; if(!ms || !S2) return App.render();
    if(!S2.sel){ PV.error = "יש לבחור משמרת"; PV.msg = null; return App.render(); }
    const [sector, date, shiftType, workerId] = S2.sel.split("|");
    const noteEl = document.getElementById("swapmNote");
    PV.busy = true; PV.error = null; App.render();
    return App.apiRpc("mgr_swap_request", {p_token:ms.token, p_sector:sector, p_date:date, p_shift_type:shiftType, p_worker_id:workerId, p_note: noteEl?noteEl.value:""})
      .then(()=>{ PV.busy = false; PV.msg = "בקשת החילוף נשמרה."; S2.sel = null; S2.list = null; App.render(); })
      .catch(e=>{ PV.busy = false; PV.error = e.message; App.render(); });
  }
  if(a==="portal-swapm-handle"){
    const ms = loadMgr(App); const S2 = PV.swap; if(!ms || !S2) return App.render();
    S2.handle = el.dataset.id; S2.cands = null; S2.hsel = null; PV.error = null; App.render();
    return App.apiRpc("mgr_swap_candidates", {p_token:ms.token, p_id:el.dataset.id}).then(r=>{ S2.cands = r||[]; App.render(); }).catch(e=>{ S2.cands = []; PV.error = e.message; App.render(); });
  }
  if(a==="portal-swapm-hclose"){ if(PV.swap){ PV.swap.handle = null; } return App.render(); }
  if(a==="portal-swapm-resolve"){
    const ms = loadMgr(App); const S2 = PV.swap; if(!ms || !S2) return App.render();
    if(!S2.hsel){ PV.error = "יש לבחור מי החליף"; PV.msg = null; return App.render(); }
    PV.busy = true; PV.error = null; App.render();
    return App.apiRpc("mgr_swap_resolve", {p_token:ms.token, p_id:el.dataset.id, p_new_worker:S2.hsel})
      .then(r=>{ PV.busy = false; PV.msg = `טופל — ${r && r.new_worker ? r.new_worker + " שובץ במשמרת, והסידור עודכן." : "הסידור עודכן."}`; S2.handle = null; S2.list = null; S2.hist = undefined; S2.rows = null; App.render(); })
      .catch(e=>{ PV.busy = false; PV.error = e.message; App.render(); });
  }
  if(a==="portal-swapm-cancel"){
    const ms = loadMgr(App); if(!ms) return App.render();
    return App.apiRpc("mgr_swap_cancel", {p_token:ms.token, p_id:el.dataset.id}).then(()=>{ if(PV.swap) PV.swap.list = null; PV.msg = "הבקשה בוטלה."; App.render(); }).catch(e=>{ PV.error = e.message; App.render(); });
  }
  if(a==="portal-mgr-push-enable"){ const ms = loadMgr(App); if(ms && !MN.busy) enableMgrPush(App, ms); return; }
  if(a==="portal-full-schedule"){ const ss = loadSession(App); if(!ss) return App.render(); S.view = "mgrview"; S.ui = {teamId: ss.team_id, workerView: true}; return App.render(); }
  if(a==="portal-mgr-view"){ if(!loadMgr(App)) return App.render(); S.view = "mgrview"; S.ui = {teamId: el.dataset.id}; return App.render(); }
  if(a==="portal-pick"){ P.selectedId = el.dataset.id; P.code=""; P.error=null; if(DEMO) return doLogin(App); return App.render(); }
  if(a==="portal-unpick"){ P.selectedId = null; P.code=""; P.error=null; return App.render(); }
  if(a==="portal-login") return doLogin(App);
  if(a==="portal-push-recheck"){ N.state = null; return App.render(); }
  if(a==="portal-mgr-push-recheck"){ MN.state = null; return App.render(); }
  if(a==="portal-push-enable"){ const ss = loadSession(App); if(ss && !N.busy) enablePush(App, ss); return; }
  if(a==="portal-managers"){ S.view = "managers"; S.ui = {}; return App.render(); }
  if(a==="portal-logout"){
    const s = loadSession(App);
    if(s) App.apiRpc("worker_logout", {p_token: s.token}).catch(()=>{});
    saveSession(App, null); P.shifts = null; P.checkedSession = false; L.data = null; L.items = null; T.data = null; F.data = null; N.state = null; SW.list = null; SW.open = false; SW.msg = null;
    return App.render();
  }
  if(a==="portal-go-updates"){ S.view = "updates"; S.ui = {}; F.data = null; T.postOpen = null; T.controlOpen = null; T.attError = null; return App.render(); }
  if(a==="portal-go-training"){ S.view = "training"; S.ui = {}; T.data = null; F.data = null; T.controlOpen = null; T.postOpen = null; T.quiz = null; return App.render(); }
  if(a==="portal-go-logistics"){ S.view = "logistics"; S.ui = {}; T.data = null; L.data = null; L.msg = null; L.error = null; return App.render(); }
  if(a==="portal-log-save") return saveLogistics(App);
  if(a==="portal-log-request") return sendRequest(App);
  if(a==="portal-mgr-open"){ S.view = "equipreq"; S.ui = {}; M.session=null; M.tile=null; M.code=null; M.list=null; M.error=null; M.msg=null; return App.render(); }
  if(a==="portal-mh-equip"){ const ms = loadMgr(App); if(!ms) return App.render(); S.view = "equipreq"; S.ui = {}; M.session = ms; M.list=null; M.error=null; M.msg=null; return App.render(); }
  if(a==="portal-mh-agg" || a==="portal-mh-admin"){ const ms = loadMgr(App); if(!ms) return App.render(); return enterMgrSchedule(App, ms, a==="portal-mh-agg"?"agg":"admin"); }
  if(a==="portal-mgr-logout"){
    const ms = loadMgr(App);
    if(ms) App.apiRpc("manager_logout", {p_token: ms.token}).catch(()=>{});
    saveMgr(App, null); clearMgrMode(App); P.checkedMgr = false; M.session = null; I.data = null; K.data = null; MN.state = null; INC.pendCount = undefined; INC.opts = null; C.data = null; C.homeCount = undefined; C.month = null; C.sel = null; C.edit = null; U.data = null; U.error = null; U.loading = false;
    S.view = "home"; S.ui = {};
    return App.render();
  }
  if(a==="portal-swap-open"){ SW.open = true; SW.sel = null; SW.msg = null; SW.error = null; return App.render(); }
  if(a==="portal-swap-close"){ SW.open = false; SW.error = null; return App.render(); }
  if(a==="portal-swap-send"){
    const s = loadSession(App); if(!s) return App.render();
    if(!SW.sel){ SW.error = "יש לבחור משמרת"; return App.render(); }
    const [sector, date, shiftType] = SW.sel.split("|");
    const noteEl = document.getElementById("swapNote");
    SW.busy = true; SW.error = null; App.render();
    return App.apiRpc("worker_swap_request", {p_token:s.token, p_sector:sector, p_date:date, p_shift_type:shiftType, p_note: noteEl ? noteEl.value : ""})
      .then(()=>{ SW.busy = false; SW.open = false; SW.msg = "בקשת החילוף נשלחה."; SW.list = null; App.render(); })
      .catch(e=>{ SW.busy = false; SW.error = e.message; App.render(); });
  }
  if(a==="portal-swap-take-ask"){ SW.confirm = el.dataset.id; return App.render(); }
  if(a==="portal-swap-take-no"){ SW.confirm = null; return App.render(); }
  if(a==="portal-swap-take"){
    const s = loadSession(App); if(!s) return App.render();
    SW.busy = true; App.render();
    return App.apiRpc("worker_swap_take", {p_token:s.token, p_id:el.dataset.id})
      .then(()=>{ SW.busy = false; SW.confirm = null; SW.msg = "✔ המשמרת עברה אליך ועודכנה בסידור."; SW.list = null; P.shifts = null; App.render(); })
      .catch(e=>{ SW.busy = false; SW.confirm = null; SW.msg = null; SW.error = e.message; SW.list = null; App.render(); });
  }
  if(a==="portal-swap-cancel"){
    const s = loadSession(App); if(!s) return App.render();
    return App.apiRpc("worker_swap_cancel", {p_token:s.token, p_id:el.dataset.id}).then(()=>{ SW.list = null; SW.msg = "הבקשה בוטלה."; App.render(); }).catch(()=>{});
  }
  if(a==="portal-open-quiz"){ S.view = "training"; S.ui = {}; T.quiz = {id: el.dataset.id, title: el.dataset.title||"", data:null, answers:[], result:null}; T.controlOpen = null; T.postOpen = null; return App.render(); }
  if(a==="portal-quiz-back"){ T.quiz = null; T.data = null; return App.render(); }
  if(a==="portal-quiz-submit"){
    const s = loadSession(App), Z = T.quiz; if(!s || !Z || !Z.data) return App.render();
    const missing = Z.answers.map((v,i)=>v==null?i+1:0).filter(Boolean);
    if(missing.length){ Z.error = `יש לענות על כל השאלות. חסרות תשובות בשאלות: ${missing.join(", ")}`; return App.render(); }
    Z.busy = true; Z.error = null; App.render();
    return App.apiRpc("worker_quiz_submit", {p_token:s.token, p_training_id:Z.id, p_answers:Z.answers})
      .then(r=>{ Z.busy = false; Z.result = r; T.data = null;
        if(!r.passed) Z.answers = Z.answers.map((v,i)=> r.marks[i] ? v : null); // בשאלות שטעה — עונים מחדש
        App.render(); if(typeof window!=="undefined" && window.scrollTo) window.scrollTo(0,0); })
      .catch(e=>{ Z.busy = false; Z.error = e.message; App.render(); });
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
  if(a==="portal-post-viewed"){
    const s = loadSession(App), p = T.postOpen; if(!s || !p) return App.render();
    PV.busy = true; App.render();
    return App.apiRpc("worker_post_viewed", {p_token:s.token, p_post_id:p.id})
      .then(()=>{ PV.busy = false; p.viewed_at = new Date().toISOString(); p.read = true; App.render(); })
      .catch(e=>{ PV.busy = false; T.attError = e.message; App.render(); });
  }
  if(a==="portal-open-post"){
    const s = loadSession(App); if(!s) return App.render();
    const p = ((F.data&&F.data.posts)||[]).find(x=>x.id===el.dataset.id); if(!p) return App.render();
    if(!p.read){ p.read = true; App.apiRpc("worker_post_read", {p_token:s.token, p_post_id:p.id}).catch(()=>{}); }
    S.view = S.view==="updates" ? "updates" : "training"; S.ui = {}; T.postOpen = p; T.controlOpen = null; return App.render();
  }
  if(a==="portal-k-open-post") return pvGo(App, "post", {id:el.dataset.id, from:"k"});
  if(a==="portal-pv"){
    const d = el.dataset;
    if(d.page==="trn-onboarding" && d.open==="1") PV.onlyOpen = true;
    if(d.page==="k-controls"){ const ms = loadMgr(App); if(ms) App.apiRpc("kabat_controls_seen", {p_token:ms.token}).catch(()=>{}); K.data = null; }
    return pvGo(App, d.page, {id:d.id, kind:d.kind, from:d.from, name:d.name, program:d.program, ver:d.ver});
  }
  if(a==="portal-pv-back") return pvBack(App);
  if(a.indexOf("portal-inc-")===0) return incClick(App, a, el);
  if(a.indexOf("portal-cal-")===0) return calClick(App, a, el);
  if(a==="portal-unit-refresh"){ U.data = null; U.error = null; U.loading = false; return App.render(); }
  if(a==="portal-quiz-addopt"){ const Q = syncQuiz(); if(Q){ Q.questions[+el.dataset.q].options.push(""); } return App.render(); }
  if(a==="portal-quiz-delopt"){ const Q = syncQuiz(); if(Q){ const q = Q.questions[+el.dataset.q], o = +el.dataset.o; q.options.splice(o,1); if(q.correct===o) q.correct = null; else if(q.correct>o) q.correct--; } return App.render(); }
  if(a==="portal-quiz-addq"){ const Q = syncQuiz(); if(Q){ (Q.questions = Q.questions||[]).push({q:"", options:["",""], correct:null}); } return App.render(); }
  if(a==="portal-quiz-delete-ask"){ PV.delAsk = true; return App.render(); }
  if(a==="portal-quiz-delete-no"){ PV.delAsk = false; return App.render(); }
  if(a==="portal-trn-more"){ I.showAll = !I.showAll; return App.render(); }
  if(a==="portal-att-open") return openAttachment(App, el);
  if(a==="portal-post-file-remove"){ savePostFields(); (PV.form.files||[]).splice(Number(el.dataset.idx),1); return App.render(); }
  if(a==="portal-prog-set" || a==="portal-onb-save" || a==="portal-onb-complete" || a==="portal-quiz-publish" || a==="portal-quiz-del" || a==="portal-quiz-save" || a==="portal-quiz-delete" || a==="portal-quiz-restore" || a==="portal-ctl-send" || a==="portal-post-send") return trnAction(App, a, el);
  if(a==="portal-pw-load") return pwLoad(App);
  if(a==="portal-first-code") return firstManagerCode(App);
  if(a==="portal-mh-codes"){ W.pin=null; W.list=null; W.error=null; W.msg=null; W.tried=false; W.loading=false; S.view = "mgrpw"; S.ui = {}; return App.render(); }
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
    .portal-col-side{display:flex;flex-direction:column;align-self:stretch;}
    .portal-updates{flex:1;cursor:pointer;display:flex;flex-direction:column;}
    .portal-updates:hover{border-color:var(--primary);}
    .portal-updates .portal-tasks{flex:1;}
    .portal-more{margin-top:10px;color:var(--primary);font-weight:600;font-size:.9em;}
    .portal-snip{display:block;font-size:.85em;color:var(--text);opacity:.8;margin-top:2px;overflow-wrap:anywhere;}
    .portal-unread{background:#fff8e6;}
    @media (max-width:760px){ .portal-cols{grid-template-columns:minmax(0,1fr);gap:0;} .portal-updates{flex:none;} }
    .portal-badge{background:#fff3cd;color:#8a5a00;border-radius:999px;padding:3px 10px;font-weight:700;font-size:.85em;}
    .portal-qbox{border:1px solid #e3e9f0;border-radius:10px;padding:12px;margin:10px 0;background:#fff;}
    .portal-qbox.bad{border-color:#d0342c;background:#fff7f6;} .portal-qbox.ok{border-color:#1a8a4a;background:#f4fbf6;}
    .portal-opt{display:block;padding:6px 8px;margin:4px 0;border-radius:8px;cursor:pointer;} .portal-opt:hover{background:#eef5fd;}
    .portal-opt.right{background:#e6f7ec;font-weight:700;}
    .portal-mark{display:inline-block;width:1.4em;font-weight:900;} .portal-mark.ok{color:#1a8a4a;} .portal-mark.bad{color:#d0342c;}
    .portal-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
    .portal-pct{min-width:52px;text-align:center;font-weight:800;color:var(--primary-dark);font-size:1.1em;}
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
window.Portal = { onDrag, renderHome, renderSection, renderManagerRequests, renderManagerPasswords, renderPView, pvTitle, onChange: onChangeTraining, resetPasswordsScreen(){ W.pin=null; W.list=null; W.error=null; W.msg=null; W.tried=false; W.loading=false; }, onClick, onInput, onKey, resetState(){ P.shifts=null; P.checkedSession=false; } };
})();
