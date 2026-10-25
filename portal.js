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
  if(typeof S.pin==="string" && (S.pin.startsWith("mgr:") || S.pin.startsWith("wrk:"))) S.pin = localStorage.getItem("cst_pin") || null;
  S.actorName = null;
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
  const lig = loginInstallGate(App); if(lig) return lig;
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
  if(HB.pending) return; // מסך הבית נטען כרגע בפנייה אחת (worker_home_bundle)
  const from = App.fmtDate(App.addDays(new Date(), -1));
  const to = App.fmtDate(App.addDays(new Date(), 35));
  try{
    P.shifts = (await App.apiRpc("worker_my_shifts2", {p_token: session.token, p_from: from, p_to: to}).catch(()=>App.apiRpc("worker_my_shifts", {p_token: session.token, p_from: from, p_to: to}))) || [];
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
  if(HB.pending) return;
  SW.list = [];
  App.apiRpc("worker_swap_board", {p_token: session.token}).then(r=>{ SW.board = r || {}; SW.list = (r && r.mine) || []; App.render(); }).catch(()=>{});
}
function swShiftTxt(App, r){ return `${App.fmtDateHeb(r.entry_date)} · ${App.escapeHtml(App.SHIFT_LABELS[r.shift_type]||r.shift_type)} · ${App.escapeHtml(r.sector)}`; }
/* משמרות שמחפשות מחליף במסגרת של העובד + תיעוד החלפות (2026-10-11) */
function renderSwapBoard(App){
  const esc = App.escapeHtml, B = SW.board || {};
  const open = B.open || [];
  let h = "";
  if(open.length) h += `<h4 style="margin:14px 0 6px;">🔁 מחפשים מחליף</h4><div class="portal-tasks">${open.map(r=>`<div class="portal-task portal-unread">
      <span class="portal-task-icon">🔁</span>
      <span style="flex:1;"><b>${esc(r.worker_name)}</b> — ${swShiftTxt(App, r)}${r.note?` <span class="muted" style="font-size:.85em;">· ${esc(r.note)}</span>`:""}</span>
      ${r.already ? `<span class="muted" style="font-size:.85em;">כבר משובץ באותה משמרת</span>`
        : (r.blocked && r.blocked.length) ? `<span style="font-size:.85em;color:#b42318;">⛔ לא ניתן לקחת: ${esc(r.blocked.join(", "))}</span>`
        : SW.confirm===r.id ? `<button class="btn small ok" data-action="portal-swap-take" data-id="${r.id}" ${SW.busy?"disabled":""}>כן, אני לוקח</button> <button class="btn small secondary" data-action="portal-swap-take-no">לא</button>`
        : `<button class="btn small ok" data-action="portal-swap-take-ask" data-id="${r.id}">לוקח את המשמרת</button>`}
    </div>`).join("")}</div>`;
  // (2026-10-22, סרגיי) תיעוד ההחלפות - רק להנהלה. העובדים רואים רק משמרות שעדיין מחכות למחליף.
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
  const tasks = loadWorkerSchedTasks(App, session);
  if(!P.shifts.length && !tasks.length) return `${SW.msg?`<p style="color:#1b7f3b;font-weight:600;">${esc(SW.msg)}</p>`:""}<p class="muted">אין כרגע משמרות בסידור שפורסם. כשהסידור יפורסם, המשמרות שלך יופיעו כאן.</p>${renderSwapBoard(App)}`;
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
    <tbody>${rows.map(a=>Object.assign({_t:false}, a)).concat(tasks.map(t=>({_t:true, entry_date:t.date, title:t.title, start:t.start, end:t.end, sector:t.sector})))
      .sort((x,y)=>String(x.entry_date).localeCompare(String(y.entry_date)) || (x._t - y._t)).map(a=>{
      if(a._t) return `<tr class="my-task-row"><td>${App.fmtDateHeb(a.entry_date)}</td><td>📌 ${esc(a.title)}</td><td>${a.start?`<span dir="ltr">${esc(a.start)}${a.end?"-"+esc(a.end):""}</span>`:""}</td><td>${esc(a.sector||"")}</td><td class="muted">משימה (לא משמרת)</td></tr>`;
      const q = quotaFor(App, a);
      const label = App.SHIFT_LABELS[a.shift_type] || (q&&q.label) || a.shift_type;
      const notes = [];
      if(a.shadow_of_name) notes.push(`חפיפה (ח) עם ${esc(a.shadow_of_name)}`);
      if(a.split_with) notes.push(`⇄ פיצול משמרת עם ${esc(a.split_with)}`);
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
  if(HB.pending) return;
  T.data = {loading:true};
  try{
    const team = App.teamById(session.team_id);
    // (2026-10-22) אחרי פרסום הסידור - ההגשה לתקופה שאחריה כבר פתוחה, וזו התקופה שמוצגת כמשימה
    const periodStart = team ? await App.submitPeriodStart(team) : App.fmtDate(new Date());
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
  // (2026-10-21) "מילוי סטטוס ציוד" הוסר - את רשימת הציוד מזין הקב"ט
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
      <td>${App.fmtDateHeb(locDay(App, t.published_at))}</td>
      <td>${t.passed ? `<span class="portal-task-icon done">✔</span> בוצע ${t.completed_at?App.fmtDateHeb(locDay(App, t.completed_at)):""}` : `🕒 טרם בוצע`}</td>
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
/* ---------- התקנת האפליקציה כתנאי כניסה מהנייד (2026-10-22, סרגיי) ----------
   אנדרואיד: לפני הפעלת ההתראות - שלב 1 "התקנת האפליקציה" (חלון ההתקנה של כרום בלחיצה, או הסבר ידני כשהדפדפן
   לא מציע). אחרי שהותקנה (או כשנפתחים מהאייקון) - ממשיכים. אייפון: ההתראות עובדות רק מהאפליקציה המותקנת, ולכן
   ההתקנה ממילא חובה שם - מסך הסבר מפורט (ספארי, "הוסף למסך הבית", גרסת iOS). במחשב - בלי שינוי. */
function isAndroid(){ return /android/i.test(navigator.userAgent); }
function isInAppBrowser(){ const u = navigator.userAgent; return /; wv\)|FBAN|FBAV|Instagram|Line\/|WhatsApp|Telegram/i.test(u); }
function iosVersion(){ const m = navigator.userAgent.match(/OS (\d+)_(\d+)/); return m ? parseFloat(m[1] + "." + m[2]) : null; }
function iosNotSafari(){ return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|WhatsApp/i.test(navigator.userAgent); }
function appInstalledFlag(){ try{ return !!localStorage.getItem("cst_app_installed"); }catch(e){ return false; } }
function deviceName(){ return isIOS() ? "iPhone" : isAndroid() ? "Android" : "מחשב"; }
const IG = { waited:false, timer:null, listening:false, msg:null };
function installGate(App, name, logoutAct){
  if(DEMO || !isAndroid() || isStandalone() || appInstalledFlag()) return null;
  const esc = App.escapeHtml;
  const head = `<div class="card"><div class="flexbar" style="justify-content:space-between;"><h2 style="margin:0;">שלום, ${esc(name)}</h2>${homeBackBtn(App)}</div></div>`;
  return head + `<div class="card" style="border:2px solid #0c3a6e;"><h3 style="margin-top:0;">📲 שלב 1 מתוך 2: התקנת האפליקציה</h3>${androidInstallBody(App)}
    ${IG.msg?`<p class="shortage" style="margin-top:8px;">${esc(IG.msg)}</p>`:""}
    <p class="muted" style="font-size:.85em;margin-top:10px;">אחרי ההתקנה — שלב 2: הפעלת התראות.</p></div>`;
}
/* (2026-10-25, סרגיי: "ההתקנה היא תנאי לשימוש באפליקציה וצריכה להופיע במסך הכניסה")
   בטלפון (אנדרואיד / אייפון) שלא נפתח מהאפליקציה המותקנת - במקום טופס הכניסה מופיע מסך ההתקנה.
   אנדרואיד: אחרי התקנה (או "התקנתי — המשך" כשהאפליקציה כבר מותקנת וכרום לא מציע להתקין שוב) - ממשיכים לכניסה.
   אייפון: רק מהאייקון במסך הבית (שם גם ההתראות עובדות). מחשב ודמו - בלי שינוי. */
function loginInstallGate(App){
  if(DEMO || isStandalone()) return null;
  const ios = isIOS(), android = !ios && isAndroid();
  if(!ios && !android) return null;
  if(android && appInstalledFlag()) return null;
  const esc = App.escapeHtml;
  const body = ios ? iosInstallHtml(App, true) : androidInstallBody(App);
  return `<div class="card"><h2 style="margin:0;">כניסה למערכת</h2></div>
    <div class="card" style="border:2px solid #0c3a6e;"><h3 style="margin-top:0;">📲 קודם מתקינים את האפליקציה</h3>
    <p style="margin-top:0;">הכניסה מהטלפון היא רק דרך האפליקציה <b>"איזור אישי"</b> המותקנת במסך הבית.</p>
    ${body}
    ${IG.msg?`<p class="shortage" style="margin-top:8px;">${esc(IG.msg)}</p>`:""}
    <p class="muted" style="font-size:.85em;margin-top:10px;">אחרי ההתקנה — נכנסים עם השם והקוד האישי, ומפעילים התראות.</p></div>`;
}
function androidInstallBody(App){
  if(!IG.listening){ IG.listening = true; window.addEventListener("bip-ready", ()=>App.render()); }
  if(!window.__bip && !IG.waited && !IG.timer) IG.timer = setTimeout(()=>{ IG.waited = true; App.render(); }, 2500);
  let body;
  if(isInAppBrowser()) body = `<p>הקישור נפתח בתוך אפליקציה (וואטסאפ / פייסבוק וכו'), ומשם אי אפשר להתקין.</p>
      <ol style="padding-inline-start:20px;line-height:2;"><li>לוחצים על <b>⋮</b> (שלוש הנקודות) למעלה</li><li>בוחרים <b>"פתח בכרום"</b> / <b>"פתיחה בדפדפן"</b></li><li>שם מופיע לחצן ההתקנה</li></ol>
      <button class="btn secondary" data-action="portal-copy-link">📋 העתקת הקישור</button>`;
  else if(window.__bip) body = `<p>כדי להשתמש באיזור האישי מהטלפון צריך להתקין את האפליקציה. זה לוקח כמה שניות, והאייקון <b>"איזור אישי"</b> יופיע במסך הבית.</p>
      <button class="btn ok" data-action="portal-install-app" style="font-size:1.15em;padding:13px 24px;">📲 התקנת האפליקציה</button>
      <p class="muted" style="font-size:.85em;margin-top:8px;">כשהטלפון שואל — לבחור <b>"התקנה"</b>.</p>`;
  else if(!IG.waited) body = `<p class="muted">בודק את הטלפון...</p>`;
  else body = `<p>כדי להשתמש באיזור האישי מהטלפון צריך להוסיף את האפליקציה למסך הבית:</p>
      <ol style="padding-inline-start:20px;line-height:2;"><li>לוחצים על <b>⋮</b> (שלוש הנקודות) למעלה בכרום</li><li>בוחרים <b>"התקנת אפליקציה"</b> או <b>"הוספה למסך הבית"</b></li><li>לוחצים <b>"התקנה"</b> / <b>"הוספה"</b></li></ol>
      <p class="muted" style="font-size:.85em;">האפליקציה כבר מותקנת? אפשר לפתוח אותה מהאייקון "איזור אישי" במסך הבית, או ללחוץ כאן:</p>
      <button class="btn ok" data-action="portal-install-done">✅ התקנתי — המשך</button>`;
  return body;
}
async function installApp(App){
  const e = window.__bip; if(!e) return App.render();
  IG.msg = null;
  try{
    e.prompt();
    const r = await e.userChoice;
    if(r && r.outcome==="accepted"){ try{ localStorage.setItem("cst_app_installed", String(Date.now())); }catch(x){} window.__bip = null; }
    else IG.msg = "ההתקנה בוטלה — כדי להמשיך צריך ללחוץ שוב ולבחור \"התקנה\".";
  }catch(x){ window.__bip = null; IG.waited = true; }
  App.render();
}
/* רישום מאיפה נכנסים (אפליקציה/דפדפן ומכשיר) לסטטוס מחוברים - פעם בכמה שעות לכל כניסה */
function noteClient(App, kind, token){
  if(DEMO || !token) return;
  const k = "cst_nc_" + kind + "_" + String(token).slice(0, 12), mode = isStandalone() ? "app" : "browser";
  try{ const last = JSON.parse(localStorage.getItem(k) || "null"); if(last && last.m===mode && Date.now()-last.t < 6*3600e3) return;
    localStorage.setItem(k, JSON.stringify({m:mode, t:Date.now()})); }catch(e){}
  App.apiRpc("note_client", {p_kind:kind, p_token:token, p_mode:mode, p_device:deviceName()}).catch(()=>{});
}
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
/* התנתקות (2026-10-22, סרגיי): מסירים גם את המכשיר הזה מרשימת ההתראות של המשתמש, כדי שטלפון של מישהו אחר
   לא ימשיך לקבל את ההתראות שלו. אם הפונקציה החדשה עוד לא קיימת בשרת - התנתקות רגילה. */
async function logoutServer(App, kind, token){
  let ep = "";
  try{
    if("serviceWorker" in navigator){
      const reg = await Promise.race([navigator.serviceWorker.getRegistration(), new Promise(r=>setTimeout(()=>r(null), 2000))]);
      const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
      if(sub) ep = sub.endpoint;
    }
  }catch(e){}
  try{ await App.apiRpc(kind==="manager" ? "manager_logout2" : "worker_logout2", {p_token: token, p_endpoint: ep}); }
  catch(e){ App.apiRpc(kind==="manager" ? "manager_logout" : "worker_logout", {p_token: token}).catch(()=>{}); }
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
  const ig = installGate(App, session.name, "portal-logout"); if(ig) return ig;
  if(DEMO || N.state==="on"){ noteClient(App, "worker", session.token); return null; }
  if(N.state===null || N.checking){ if(N.state===null) checkPush(App, session); }
  return pushGateHtml(App, session.name, N, {logout:"portal-logout", enable:"portal-push-enable", recheck:"portal-push-recheck",
    intro:"כדי להשתמש באיזור האישי צריך להפעיל התראות לטלפון. כך תדע מיד על סידור שפורסם, בקרה, לומדה, בקשת חילוף או הודעה חדשה."});
}
/* מנהלים - חובה כמו לעובדים (לבקשת סרגיי, 2026-10-11): עד שההתראות מופעלות, רואים רק את מסך ההפעלה */
function mgrPushGate(App, ms){
  const ig = installGate(App, ms.name, "portal-mgr-logout"); if(ig) return ig;
  if(DEMO || MN.state==="on"){ noteClient(App, "manager", ms.token); return null; }
  if(MN.state===null){ MN.state = "checking"; checkMgrPush(App, ms); }
  return pushGateHtml(App, ms.name, {state: MN.state, checking: MN.state==="checking", busy: MN.busy, error: MN.error},
    {logout:"portal-mgr-logout", enable:"portal-mgr-push-enable", recheck:"portal-mgr-push-recheck",
     intro:"כדי להשתמש באיזור המנהלים צריך להפעיל התראות לטלפון. כך תדע מיד כשעובד מבקש חילוף, כשמשמרת מוחלפת ועל כל עדכון רלוונטי."});
}
/* אייפון (2026-10-22, סרגיי: "לאייפון - תבנה מה שצריך"): אפל לא מאפשרת לאתר לחצן התקנה, אז מסבירים צעד-צעד,
   עם ציור של כפתור השיתוף. דפדפן שאינו ספארי (כרום/וואטסאפ וכו') - קודם לעבור לספארי; iOS ישן מ-16.4 - לעדכן. */
function iosInstallHtml(App, atLogin){
  const shareIcon = `<svg width="20" height="24" viewBox="0 0 20 24" style="vertical-align:-5px;" aria-hidden="true"><path d="M10 1v14M5 6l5-5 5 5" fill="none" stroke="#0a84ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10H3v12h14V10h-3" fill="none" stroke="#0a84ff" stroke-width="2" stroke-linejoin="round"/></svg>`;
  const addIcon = `<svg width="22" height="22" viewBox="0 0 22 22" style="vertical-align:-5px;" aria-hidden="true"><rect x="1.5" y="1.5" width="19" height="19" rx="5" fill="none" stroke="#333" stroke-width="1.8"/><path d="M11 6.5v9M6.5 11h9" stroke="#333" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  const v = iosVersion();
  const step = (n, html)=>`<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border);"><span style="background:#0c3a6e;color:#fff;border-radius:50%;min-width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;">${n}</span><div style="line-height:1.6;">${html}</div></div>`;
  if(iosNotSafari()) return `<p>באייפון מתקינים את האפליקציה רק מ<b>ספארי</b>. הקישור נפתח עכשיו בדפדפן אחר (כרום / וואטסאפ וכו').</p>
      ${step(1, `לוחצים על <b>"העתקת הקישור"</b> כאן למטה`)}${step(2, `פותחים את <b>ספארי</b> ומדביקים את הקישור בשורת הכתובת`)}${step(3, `ממשיכים לפי ההוראות שיופיעו שם`)}
      <button class="btn ok" data-action="portal-copy-link" style="margin-top:10px;">📋 העתקת הקישור</button>`;
  return `<p>באייפון האיזור האישי עובד (כולל התראות) רק כשהוא מותקן במסך הבית. זה לוקח חצי דקה:</p>
      ${v && v < 16.4 ? `<p class="shortage">גרסת האייפון שלך (iOS ${v}) ישנה מדי להתראות. צריך לעדכן: הגדרות ← כללי ← עדכון תוכנה. אחרי העדכון — לחזור לכאן.</p>` : ""}
      ${step(1, `לוחצים על כפתור השיתוף ${shareIcon} בתחתית המסך של ספארי (באייפד — למעלה)`)}
      ${step(2, `גוללים מעט למטה ובוחרים ${addIcon} <b>"הוסף למסך הבית"</b>`)}
      ${step(3, `לוחצים <b>"הוסף"</b> למעלה בצד`)}
      ${step(4, `סוגרים את ספארי ופותחים את <b>"איזור אישי"</b> מהאייקון החדש במסך הבית`)}
      ${step(5, `${atLogin ? "נכנסים עם השם והקוד האישי" : "נכנסים שוב עם הקוד האישי"} ולוחצים <b>"הפעלת התראות"</b> ← <b>"אפשר"</b>`)}
      <p class="muted" style="font-size:.85em;margin-top:8px;">אין "הוסף למסך הבית"? צריך לוודא שהקישור נפתח בספארי ולא מתוך וואטסאפ.</p>`;
}
function pushGateHtml(App, name, N, act){
  const esc = App.escapeHtml;
  const head = `<div class="card">
    <div class="flexbar" style="justify-content:space-between;">
      <h2 style="margin:0;">שלום, ${esc(name)}</h2>
      ${homeBackBtn(App)}
    </div></div>`;
  if(N.state===null || N.checking) return head + `<div class="card"><p class="muted">בודק התראות במכשיר...</p></div>`;
  let body;
  if(N.state==="ios-install") body = iosInstallHtml(App);
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
  const title = N.state==="ios-install" ? "📲 התקנת האפליקציה במסך הבית" : isAndroid() ? "🔔 שלב 2 מתוך 2: הפעלת התראות" : "📲 חובה להפעיל התראות לטלפון";
  return head + `<div class="card" style="border:2px solid #0c3a6e;"><h3 style="margin-top:0;">${title}</h3>${body}</div>`;
}

/* משימות שהמשבץ הקצה למאבטח מתוך טבלת השיבוץ (לא משמרת) - 2026-10-20, לבקשת סרגיי.
   מוצג רק כשיש משימות; מתרענן בכל כניסה למסך הבית (ובקבלת פוש - App.render מהרענון הכללי). */
const ST = { list:null, loading:false, at:0 };
function loadWorkerSchedTasks(App, session){
  if(!HB.pending && !ST.loading && (!ST.list || Date.now()-ST.at > 60000)){
    ST.loading = true;
    App.apiRpc("worker_sched_tasks", {p_token: session.token})
      .then(d=>{ ST.list = d||[]; ST.at = Date.now(); ST.loading = false; App.render(); })
      .catch(()=>{ ST.loading = false; ST.at = Date.now(); ST.list = ST.list||[]; });
  }
  return ST.list||[];
}
/* (2026-10-22, סרגיי) המשימות מוצגות בתוך "המשמרות שלי" - עובד שכל השבוע שלו משימה (למשל מוס"ח) ראה טבלה ריקה */
function renderWorkerSchedTasks(App, session){ loadWorkerSchedTasks(App, session); return ""; }
/* מסך הבית של העובד מהר יותר (2026-10-22, סרגיי: "שהמערכת תרוץ יותר מהר ותיתקע פחות"):
   1) כל הנתונים של מסך הבית בפנייה אחת לשרת (worker_home_bundle) במקום 6-8 פניות.
   2) הנתונים מהפעם הקודמת נשמרים בטלפון ומוצגים מיד, ומתעדכנים ברקע תוך שנייה-שתיים.
   אם הפונקציה לא זמינה - חוזרים לטעינה הרגילה (כל חלק בנפרד). */
const HB = { pending:false, broken:false, fresh:false };
function hbKey(session){ return "cst_home_cache_" + (session.worker_id || session.name || ""); }
function hbApply(App, d){
  P.shifts = d.shifts || []; P.shiftsError = null;
  ST.list = d.sched_tasks || []; ST.at = Date.now();
  SW.board = d.swaps || {}; SW.list = (d.swaps && d.swaps.mine) || [];
  if(d.tasks) T.data = Object.assign({periodStart: d.periodStart}, d.tasks);
  F.data = {posts: d.feed || []};
}
function hbFromCache(App, session){
  try{ const c = JSON.parse(localStorage.getItem(hbKey(session)) || "null");
    if(c && Date.now() - c.at < 7*86400000){ hbApply(App, c); return true; } }catch(e){}
  return false;
}
function hbClear(session){ try{ if(session) localStorage.removeItem(hbKey(session)); }catch(e){} }
async function hbLoad(App, session){
  if(HB.pending) return; HB.pending = true; P.checkedSession = true; const gen = USER_GEN;
  try{
    const team = App.teamById(session.team_id);
    let periodStart = null; try{ periodStart = team ? await App.submitPeriodStart(team) : null; }catch(e){}
    const from = App.fmtDate(App.addDays(new Date(), -1)), to = App.fmtDate(App.addDays(new Date(), 35));
    const d = await App.apiRpc("worker_home_bundle", {p_token: session.token, p_from: from, p_to: to, p_period_start: periodStart});
    const curS = loadSession(App); if(gen !== USER_GEN || !curS || curS.token !== session.token){ if(gen === USER_GEN) HB.pending = false; return; } // התשובה הגיעה אחרי החלפת משתמש - מתעלמים
    if(!d || !d.info){ HB.pending = false; hbClear(session); saveSession(App, null); P.shifts = null; T.data = null; F.data = null; return App.render(); }
    const info = d.info;
    if(!!info.schedule_editor !== !!session.schedule_editor){ const cur = loadSession(App); if(cur) saveSession(App, Object.assign({}, cur, {schedule_editor: !!info.schedule_editor})); }
    d.periodStart = periodStart;
    hbApply(App, d); HB.fresh = true;
    try{ localStorage.setItem(hbKey(session), JSON.stringify(Object.assign({at: Date.now()}, d))); }catch(e){}
  }catch(e){
    if(/session/i.test(e.message)){ HB.pending = false; hbClear(session); saveSession(App, null); P.shifts = null; return App.render(); }
    HB.broken = true; P.checkedSession = false; // טעינה רגילה (כל חלק בנפרד); נתונים שמורים שכבר מוצגים נשארים
  }
  HB.pending = false; App.render();
}
function renderWorkerHome(App, session){
  const esc = App.escapeHtml;
  const gate = pushGate(App, session); if(gate) return gate;
  if(!HB.broken && !HB.pending && (P.shifts===null || !HB.fresh)){
    if(P.shifts===null) hbFromCache(App, session);
    hbLoad(App, session);
  }
  if(!P.checkedSession){
    P.checkedSession = true;
    App.apiRpc("worker_session_info", {p_token: session.token}).then(info=>{
      if(!info){ saveSession(App, null); P.shifts=null; }
      else if(!!info.schedule_editor !== !!session.schedule_editor){ const cur = loadSession(App); if(cur) saveSession(App, Object.assign({}, cur, {schedule_editor: !!info.schedule_editor})); }
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
      ${homeBackBtn(App)}
    </div>
    <!-- סדר הרובריקות (2026-10-21, סרגיי): שתיים בכל שורה - ימין/שמאל: דוח פעולה | דיווח נזק, משמרות | הדרכה, מנהלתיות | לוגיסטי -->
    <div class="grid-teams" style="margin-top:12px;grid-template-columns:repeat(2,minmax(0,1fr));">
      ${isMokedWorker(App, session) ? "" : tile("portal-go-ar", "📝 דוח פעולה", "דוח על אירוע — בעיקר בלחיצות")}
      ${isMokedWorker(App, session) ? "" : tile("portal-go-damage", "⚠️ דיווח נזק / תאונה", "דיווח ראשוני, מעורבים ותמונות")}
      ${tile("portal-go-submit", "🗓️ משמרות", "הגשת אילוצים לתקופה הבאה")}
      ${tile("portal-go-training", "🎓 הדרכה", "לומדות, בקרות ותכנים")}
      ${tile("portal-go-areq", "📋 מנהלתיות", "חופשה / מילואים / מחלה")}
      ${isMokedWorker(App, session) ? "" : tile("portal-go-logistics", "🎒 לוגיסטי", "הציוד שלי ובקשת ציוד")}
    </div>
  </div>
  ${session.schedule_editor ? (()=>{ const t = App.teamById(session.team_id); const lbl = t ? ((t.sectors&&t.sectors.length) ? t.sectors.join(" / ") : t.name) : "";
    return `<div class="card">
    <h3>✏️ סידור עבודה${lbl?` — ${esc(lbl)}`:""}</h3>
    <p class="muted" style="margin-top:-6px;">עריכת הסידור לכל העובדים בגזרה — כמו אצל הקב"ט</p>
    <div class="grid-teams">
      ${tile("portal-wsched-agg", "טבלה מרוכזת ובניית סידור", "שיבוץ, פרסום, פלט ופתיחת הגשה")}
      ${tile("portal-wsched-admin", "ניהול עובדים", "הוספה, קודים וסימונים")}
    </div>
  </div>`; })() : ""}
  <div class="portal-cols">
    <div class="portal-col-main">
      <div class="card">
        <div class="flexbar" style="justify-content:space-between;"><h3 style="margin:0;">המשמרות שלי${(HB.pending && P.shifts!==null) ? ` <span class="muted" style="font-size:.6em;font-weight:normal;">⟳ מתעדכן…</span>` : ""}</h3>
          ${(P.shifts && P.shifts.length) ? `<button class="btn small" data-action="portal-swap-open">🔁 מבקש חילוף</button>` : ""}</div>
        <div style="height:8px;"></div>
        ${renderMyShifts(App, session)}
        <div style="margin-top:10px;"><button class="btn secondary" data-action="portal-full-schedule">📋 סידור מלא</button></div>
      </div>
      ${renderWorkerSchedTasks(App, session)}
      ${renderWorkerTodos(App, session)}
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
      App.apiGet("logistics_items", "select=id,name,has_size,sort_order,size_options,has_serial,has_vehicle&order=sort_order"),
      App.apiRpc("worker_equipment_get", {p_token: session.token})
    ]);
    L.items = items; L.data = data; L.error = null;
  }catch(e){
    if(/session/i.test(e.message)){ saveSession(App, null); App.S.view = "home"; }
    L.items = L.items || []; L.data = L.data || {equipment:[], requests:[]}; L.error = "שגיאה בטעינת הנתונים";
  }
  App.render();
}


/* ================================================================
   דיווח נזק/תאונה ראשוני (2026-10-20, לבקשת סרגיי): המאבטח מדווח מהאיזור האישי (לוגיסטי) לפי הפורמט של סרגיי,
   כולל בחירת הציוד שניזוק מרשימת הציוד, צילום והוספת תמונות. התראה לקב"ט של הגזרה ולסרגיי, ושניהם רואים
   את הדו"ח המסודר (העתקה/הדפסה). השרת: worker_damage_create / _add_image / _list, mgr_damage_list / _seen,
   damage_images_get.
   ================================================================ */
const DMG = { open:false, busy:false, msg:null, error:null, parties:[], vehicles:[], mine:null, list:null, listAt:0, view:null, images:null };
/* (2026-10-20) התמונות מחולקות ל"מעורבים" (לכל מעורב: רשיון רכב, תעודה מזהה, ביטוח - והמערכת קוראת מהן אוטומטית
   שם נהג, טלפון, מספר רישוי וחברת ביטוח, עם Tesseract.js בדפדפן) ול"כלי רכב". אפשר להוסיף כמה מעורבים, כמה כלי
   רכב וכמה תמונות, עד "סיימתי". */
const DMG_DOCS = [["license","רשיון רכב"],["id","תעודה מזהה"],["insurance","ביטוח"]];
const DMG_PFIELDS = [["name","שם הנהג"],["phone","טלפון"],["plate","מספר רישוי"],["insurer","חברת ביטוח"]];
/* העובד המעורב מטעמנו (2026-10-20, סרגיי): בלי חברת ביטוח ובלי צילום ביטוח - במקומם בחירה אופנוע/רכב */
const DMG_OUR_FIELDS = [["name","שם העובד"],["phone","טלפון"],["plate","מספר רישוי"],["vtype","סוג כלי"]];
function dmgPFields(pt){ return isTP(pt) ? DMG_PFIELDS : DMG_OUR_FIELDS; }
function dmgDocsFor(pt){ return isTP(pt) ? DMG_DOCS.concat([["car","תמונות רכב צד ג׳"]]) : DMG_DOCS.filter(d=>d[0]!=="insurance"); }
/* טיוטה של דיווח נזק (2026-10-20, סרגיי: "אם יצאתי בטעות - נשמר כטיוטה שאפשר לערוך כשנכנסים מחדש").
   נשמרת במכשיר (localStorage) תוך כדי מילוי, ונמחקת אחרי שליחה או "מחיקת טיוטה". אם אין מקום לתמונות - נשמרת בלעדיהן. */
function dmgDraftKeyFor(App, mgr){
  if(mgr){ const ms = loadMgr(App); return ms ? "cst_dmgdraft_m_" + (ms.manager_id || ms.name) : null; }
  const ss = loadSession(App); return ss ? "cst_dmgdraft_w_" + (ss.worker_id || ss.name) : null;
}
function dmgLoadDraft(App, mgr){ try{ const k = dmgDraftKeyFor(App, mgr); return k ? JSON.parse(localStorage.getItem(k)||"null") : null; }catch(e){ return null; } }
function dmgSaveDraft(App){
  if(!DMG.open || DMG.busy) return;
  dmgCollect();
  if(!DMG.form || !DMG.form.kind) return;
  const k = dmgDraftKeyFor(App, !!DMG.mgrMode); if(!k) return;
  const strip = keepImgs=>({form:DMG.form, savedAt:new Date().toISOString(), noImgs:!keepImgs,
    parties:DMG.parties.map(pt=>({role:pt.role, name:pt.name, phone:pt.phone, plate:pt.plate, insurer:pt.insurer, vtype:pt.vtype||"", auto:pt.auto||{}, docs: keepImgs ? pt.docs : {license:[],id:[],insurance:[]}})),
    vehicles:DMG.vehicles.map(v=>({label:v.label, photos: keepImgs ? v.photos : []})), equipPhotos: keepImgs ? (DMG.equipPhotos||[]) : []});
  try{ localStorage.setItem(k, JSON.stringify(strip(true))); }
  catch(e){ try{ localStorage.setItem(k, JSON.stringify(strip(false))); }catch(e2){} }
  const el = document.getElementById("dmgAutoMsg"); if(el) el.textContent = "💾 נשמר כטיוטה במכשיר " + new Date().toTimeString().slice(0,5);
}
function dmgClearDraft(App){ try{ const k = dmgDraftKeyFor(App, !!DMG.mgrMode); if(k) localStorage.removeItem(k); }catch(e){} }
function dmgRestore(d){
  DMG.form = d.form || {};
  DMG.parties = (d.parties||[]).map(pt=>Object.assign(dmgNewParty(pt.role, pt.name), pt, {ocr:0, docs: pt.docs || {license:[],id:[],insurance:[]}}));
  DMG.vehicles = (d.vehicles||[]).map(v=>({label:v.label||"", photos:v.photos||[]}));
  if(!DMG.vehicles.length) DMG.vehicles = [{label:"", photos:[]}];
  DMG.equipPhotos = d.equipPhotos || [];
  DMG.restored = d;
}
function isTP(pt){ return /^צד ג/.test(String(pt.role||"")); }
function dmgNewParty(role, name){ return {role, name:name||"", phone:"", plate:"", insurer:"", vtype:"", docs:{license:[],id:[],insurance:[],car:[]}, auto:{}, ocr:0}; }
const DMG_INSURERS = [["ביטוח ישיר","ביטוח ישיר"],["9 מיליון","9 מיליון"],["הראל","הראל"],["harel","הראל"],["מגדל","מגדל"],["migdal","מגדל"],["כלל","כלל"],["clal","כלל"],
  ["הפניקס","הפניקס"],["phoenix","הפניקס"],["מנורה","מנורה"],["menora","מנורה"],["איילון","איילון"],["ayalon","איילון"],["שומרה","שומרה"],["shomera","שומרה"],
  ["ליברה","ליברה"],["libra","ליברה"],["שלמה","שלמה"],["הכשרה","הכשרה"],["hachshara","הכשרה"],["ווישור","ווישור"],["wesure","ווישור"],["שירביט","שירביט"],["aig","AIG"]];
function dmgParseDoc(text){
  const t = String(text||"").replace(/[|_]/g," ").replace(/[ \t]+/g," ");
  const out = {};
  const ph = t.match(/0(?:5\d|7\d|[23489])[\s-]?\d{3}[\s-]?\d{4}/); if(ph) out.phone = ph[0].replace(/\s/g,"");
  let m = t.match(/(?:מספר\s*(?:ה)?רכב|מס['׳"]?\s*(?:ה)?רכב|מספר\s*רישוי|מס['׳"]?\s*רישוי)[^\d]{0,20}(\d{2,3}[-\s.]?\d{2,3}[-\s.]?\d{2,3})/);
  if(!m) m = t.match(/(?:^|[^\d])(\d{2,3}-\d{2,3}-\d{2,3})(?:[^\d]|$)/);
  if(m){ const d = m[1].replace(/\D/g,""); if(d.length===7) out.plate = d.replace(/(\d{2})(\d{3})(\d{2})/,"$1-$2-$3"); else if(d.length===8) out.plate = d.replace(/(\d{3})(\d{2})(\d{3})/,"$1-$2-$3"); }
  const low = t.toLowerCase();
  for(const [k,v] of DMG_INSURERS){ if(low.indexOf(k)>=0){ out.insurer = v; break; } }
  const W = "([א-ת][א-ת'\"׳\-]+(?: [א-ת][א-ת'\"׳\-]+)?)";
  const fam = t.match(new RegExp("שם\\s*(?:ה)?משפחה[:\\s]*" + W)), first = t.match(new RegExp("שם\\s*(?:ה)?פרטי[:\\s]*" + W));
  if(fam || first) out.name = [first&&first[1], fam&&fam[1]].filter(Boolean).join(" ");
  if(!out.name){ const ins = t.match(new RegExp("שם\\s*(?:ה)?(?:מבוטח|נהג|בעל(?:י|ים)?(?: הרכב)?)[:\\s]*" + W)); if(ins) out.name = ins[1]; }
  return out;
}
let TESS_WORKER = null;
function loadTesseract(){
  if(window.Tesseract) return Promise.resolve();
  return new Promise((res, rej)=>{ const sc = document.createElement("script"); sc.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    sc.onload = ()=>res(); sc.onerror = ()=>rej(new Error("טעינת הזיהוי האוטומטי נכשלה")); document.head.appendChild(sc); });
}
async function dmgOcr(App, pi, dataUrl){
  const party = DMG.parties[pi]; if(!party) return;
  party.ocr++; App.render();
  try{
    await loadTesseract();
    if(!TESS_WORKER) TESS_WORKER = await window.Tesseract.createWorker(["heb","eng"]);
    const r = await TESS_WORKER.recognize(dataUrl);
    const found = dmgParseDoc(r && r.data ? r.data.text : "");
    Object.keys(found).forEach(k=>{ if(found[k] && !String(party[k]||"").trim()){ party[k] = found[k]; party.auto[k] = true; } });
  }catch(e){ party.ocrErr = e.message; }
  party.ocr = Math.max(0, party.ocr-1); App.render();
}
/* סדר השדות (2026-10-20, הערות אלירן): שם המדווח והסניף ראשונים, אחריהם תאריך וסוג הדרך; נזק לאופנוע ונזק לציוד
   אחרי נזק בגוף; נוספו נפגעים, משטרה, מד"א ועדים (נשמרים ב-damage_reports.extra) */
const DMG_FIELDS = [
  ["worker_name","שם המדווח"], ["branch","סניף"], ["event_at","תאריך אירוע"], ["x_road_type","סוג הדרך"], ["vehicle_no","מספר כלי"],
  ["location","מיקום האירוע"], ["description","תאור האירוע"], ["visibility","ראות במקום"], ["body_damage","נזק בגוף"],
  ["moto_damage","נזק לאופנוע"], ["items","נזק לציוד"], ["mech_damage","נזק מכני"], ["x_injured","נפגעים"], ["third_party","האם מעורב צד ג׳"],
  ["x_police","משטרה"], ["x_mda","מד\"א"], ["x_witnesses","עדים לאירוע"],
  ["reported_to","למי דווח"], ["responsible_arrived","גורם אחראי שהגיע למקום"], ["note","הערה"]
];
function dmgFmtDate(iso){ if(!iso) return ""; const d = new Date(iso); const p = n=>String(n).padStart(2,"0"); return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; }
function dmgVal(r, k){
  if(k==="event_at") return dmgFmtDate(r.event_at); if(k==="items") return (r.items||[]).join(", ");
  if(k.startsWith("x_")){
    const x = r.extra || {};
    if(k==="x_police" || k==="x_mda"){ const pre = k==="x_police" ? "police" : "mda"; const c = x[pre+"_called"]||"", n = x[pre+"_no"]||"";
      return c ? `הוזמנה לזירה: ${c}${n?` · מספר אירוע: ${n}`:""}` : (n ? `מספר אירוע: ${n}` : ""); }
    if(k==="x_witnesses"){ if(x.no_witnesses) return "אין עדים"; return (x.witnesses||[]).filter(w=>w.name||w.phone).map(w=>[w.name, w.phone].filter(Boolean).join(" — ")).join("\n"); }
    return x[k.slice(2)] || "";
  }
  return r[k]||"";
}
const DMG_EQ_FIELDS = [["worker_name","שם המדווח"], ["branch","סניף"], ["event_at","תאריך אירוע"], ["items","נזק לציוד"], ["location","מיקום האירוע"], ["description","תאור האירוע"], ["note","הערה"]];
function dmgFieldsFor(r){ return r.kind==="equipment" ? DMG_EQ_FIELDS : DMG_FIELDS; }
function dmgTitle(r){ return r.kind==="equipment" ? "דיווח נזק לציוד (לא תאונה)" : "דיווח נזק/תאונה ראשוני — תאונה/נזק לכלי רכב"; }
function dmgText(r){
  const parts = (r.parties||[]).map((p,i)=>`${isTP(p)?"צד ג׳":"עובד מעורב"} ${i+1}: ` + dmgPFields(p).map(([k,l])=>`${l}: ${p[k]||"-"}`).join(" | ")).join("\n");
  const veh = (r.vehicles||[]).map((v,i)=>`כלי רכב ${i+1}: ${v.label||"-"}`).join("\n");
  return dmgTitle(r) + "\n\n" + dmgFieldsFor(r).map(([k,l])=>`${l}: ${dmgVal(r,k)}`).join("\n") + (parts?"\n\nמעורבים:\n"+parts:"") + (veh?"\n\nכלי רכב:\n"+veh:"");
}
function dmgReportHtml(App, r, images){
  const esc = App.escapeHtml;
  return `<div class="dmg-report">
    <h3 style="margin:0 0 8px;">${r.kind==="equipment"?"🔧":"⚠️"} ${dmgTitle(r)}</h3>
    <table class="dmg-table">${dmgFieldsFor(r).map(([k,l])=>`<tr><th>${l}</th><td style="white-space:pre-wrap;">${esc(dmgVal(r,k))||'<span class="muted">—</span>'}</td></tr>`).join("")}</table>
    ${(()=>{
      const imgs = images===null ? null : (images||[]).map(x=>typeof x==="string" ? {src:x, meta:{}} : x);
      const thumbs = list=>list.length?`<div class="dmg-imgs">${list.map(x=>`<a href="${safeSrc(x.src)}" target="_blank"><img src="${safeSrc(x.src)}" alt=""></a>`).join("")}</div>`:"";
      const docName = k=>((DMG_DOCS.find(d=>d[0]===k)||[])[1]||"");
      let h = "";
      const partyBlock = (p,i)=>{
        // בלי צד ג׳ פרטי העובד המעורב לא חובה - בלוק ריק (בלי פרטים ובלי תמונות) לא מוצג
        if(!dmgPFields(p).some(([k])=>String(p[k]||"").trim()) && !(imgs||[]).some(x=>x.meta && x.meta.sec==="party" && x.meta.i===i)) return;
        h += `<h4 style="margin:14px 0 4px;">👤 ${isTP(p)?`צד ג׳ — ${esc(p.role||"")}`:"העובד המעורב"}</h4>
          <table class="dmg-table">${dmgPFields(p).map(([k,l])=>`<tr><th>${l}</th><td>${esc(p[k]||"")||'<span class="muted">—</span>'}</td></tr>`).join("")}</table>`;
        if(imgs) dmgDocsFor(p).forEach(([dk,dl])=>{ const l = imgs.filter(x=>x.meta && x.meta.sec==="party" && x.meta.i===i && x.meta.kind===dk); if(l.length) h += `<div class="muted" style="margin-top:6px;font-size:.85em;">${dl}</div>${thumbs(l)}`; });
      };
      (r.parties||[]).forEach((p,i)=>{ if(!isTP(p)) partyBlock(p,i); });
      (r.vehicles||[]).forEach((v,i)=>{
        if(!String(v.label||"").trim() && !(imgs||[]).some(x=>x.meta && x.meta.sec==="vehicle" && x.meta.i===i)) return;
        h += `<h4 style="margin:14px 0 4px;">🏍️ כלי רכב רשף ${i+1}${v.label?` — ${esc(v.label)}`:""}</h4>`;
        if(imgs) h += thumbs(imgs.filter(x=>x.meta && x.meta.sec==="vehicle" && x.meta.i===i));
      });
      (r.parties||[]).forEach((p,i)=>{ if(isTP(p)) partyBlock(p,i); });
      if(imgs){ const eq = imgs.filter(x=>x.meta && x.meta.sec==="equip"); if(eq.length) h += `<h4 style="margin:14px 0 4px;">🔧 תמונות הציוד שניזוק</h4>${thumbs(eq)}`; }
      if(imgs){ const rest = imgs.filter(x=>!x.meta || !x.meta.sec); if(rest.length) h += `<h4 style="margin:14px 0 4px;">📷 תמונות</h4>${thumbs(rest)}`; }
      else if(r.images) h += `<p class="muted">טוען ${r.images} תמונות...</p>`;
      return h;
    })()}
  </div>`;
}
function renderDamageWorker(App, session){
  const esc = App.escapeHtml;
  if(DMG.mine===null && !DMG.loadingMine){
    DMG.loadingMine = true;
    App.apiRpc("worker_damage_list", {p_token:session.token}).then(d=>{ DMG.mine = d||[]; DMG.loadingMine = false; App.render(); }).catch(()=>{ DMG.loadingMine = false; DMG.mine = []; });
  }
  if(DMG.view){
    if(DMG.images===null && !DMG.loadingImgs && DMG.view.images){ DMG.loadingImgs = true; App.apiRpc("damage_images_get2", {p_token:session.token, p_report_id:DMG.view.id}).then(x=>{ DMG.images = x||[]; DMG.loadingImgs = false; App.render(); }).catch(()=>{ DMG.images = []; DMG.loadingImgs = false; App.render(); }); }
    return `<span class="backlink" data-action="portal-dmg-close">◀ חזרה</span>${dmgReportHtml(App, DMG.view, DMG.view.images ? DMG.images : [])}
      <div style="margin-top:10px;"><button class="btn" data-action="portal-dmg-pdf" data-who="w">📄 הפקת דו"ח PDF</button></div>`;
  }
  if(!DMG.open){
    const mine = DMG.mine||[];
    return `${DMG.okMsg?`<p style="color:#1b7f3b;font-weight:700;">${esc(DMG.okMsg)}</p>`:""}<div class="dmg-box">
      <p style="margin-top:0;">דיווח ראשוני על נזק לציוד או תאונה — כולל המעורבים, כלי הרכב ותמונות. הדיווח נשלח לקב"ט ולסרגיי.</p>
      ${dmgLoadDraft(App, false) ? `<button class="btn" data-action="portal-dmg-new" style="margin-inline-end:6px;">📝 המשך הטיוטה שלא נשלחה</button>` : ""}
      <button class="btn" style="background:#b42318;border-color:#b42318;" data-action="portal-dmg-new"${dmgLoadDraft(App, false)?' data-fresh="1"':""}>➕ דיווח חדש</button>
      ${mine.length ? `<div style="margin-top:8px;"><b style="font-size:.9em;">הדיווחים שלי</b>${mine.slice(0,5).map(r=>`<div class="portal-task" data-action="portal-dmg-open" data-id="${r.id}"><span class="portal-task-icon">${r.kind==="equipment"?"🔧":"🚗"}</span><span>${esc(dmgFmtDate(r.event_at))} · ${esc((r.description||"").slice(0,60))}</span></div>`).join("")}</div>` : ""}
    </div>`;
  }
  return dmgFormHtml(App, session.name);
}
/* טופס הדיווח - משותף למאבטח (לוגיסטי) ולקב"ט (דו"ח אירוע חריג), 2026-10-20 */
function dmgFormHtml(App, reporterName){
  const esc = App.escapeHtml;
  const items = DMG.items || L.items || [];
  const now = new Date(); const pad = n=>String(n).padStart(2,"0");
  const nowLocal = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const f = DMG.form || {};
  const pick = (sec, i, kind)=>`<span class="dmg-pick">
      <label class="btn secondary small" style="cursor:pointer;">📷 צילום<input type="file" accept="image/*" capture="environment" data-action="portal-dmg-files" data-sec="${sec}" data-i="${i}" data-kind="${kind}" style="display:none;"></label>
      <label class="btn secondary small" style="cursor:pointer;">🖼️ מהגלריה<input type="file" accept="image/*" multiple data-action="portal-dmg-files" data-sec="${sec}" data-i="${i}" data-kind="${kind}" style="display:none;"></label></span>`;
  const thumbs = (list, sec, i, kind)=>list.length?`<div class="dmg-imgs">${list.map((src,j)=>`<span style="position:relative;display:inline-block;"><img src="${safeSrc(src)}" alt=""><span data-action="portal-dmg-rmimg" data-sec="${sec}" data-i="${i}" data-kind="${kind}" data-j="${j}" style="position:absolute;top:2px;left:2px;background:#fff;border-radius:50%;padding:0 6px;cursor:pointer;">✕</span></span>`).join("")}</div>`:"";
  const partyCard = (pt, i, roles, title)=>`<div class="dmg-sub">
      <div class="flexbar" style="justify-content:space-between;"><b>👤 ${title}</b>
        <span>${roles.length>1?`<select id="dmg_p${i}_role">${roles.map(o=>`<option ${pt.role===o?"selected":""}>${o}</option>`).join("")}</select>`:""}
        ${DMG.parties.length>1?`<span class="backlink" data-action="portal-dmg-rmparty" data-i="${i}" style="margin-inline-start:8px;">✕ הסרה</span>`:""}</span></div>
      <div class="dmg-pfields">${dmgPFields(pt).map(([k,l])=>k==="vtype"
        ? `<div class="field"><label>${l}</label><select id="dmg_p${i}_vtype"><option value="">— בחרו —</option>${["אופנוע","רכב"].map(o=>`<option ${pt.vtype===o?"selected":""}>${o}</option>`).join("")}</select></div>`
        : `<div class="field"><label>${l}${pt.auto[k]?' <span class="dmg-auto">✨ זוהה אוטומטית — בדקו</span>':""}</label><input type="text" id="dmg_p${i}_${k}" value="${esc(pt[k]||"")}"${k==="phone"?' inputmode="tel"':""}></div>`).join("")}</div>
      ${dmgDocsFor(pt).map(([dk,dl])=>`<div style="margin-top:8px;"><span style="font-weight:600;">${dl}</span> ${pick("party", i, dk)}${thumbs(pt.docs[dk]||[], "party", i, dk)}</div>`).join("")}
      ${pt.ocr?`<p class="muted" style="margin:6px 0;">🔎 קורא את המסמך... (בפעם הראשונה זה לוקח קצת זמן)</p>`:""}
      ${pt.ocrErr?`<p class="muted" style="margin:6px 0;">${esc(pt.ocrErr)} — אפשר למלא ידנית.</p>`:""}
    </div>`;
  const inp = (id, label, ph, area)=>`<div class="field"><label>${label}</label>${area?`<textarea id="dmg_${id}" rows="3">${esc(f[id]||"")}</textarea>`:`<input type="text" id="dmg_${id}" value="${esc(f[id]||"")}" placeholder="${ph||""}">`}</div>`;
  const sel = (id, label, opts)=>`<div class="field"><label>${label}</label><select id="dmg_${id}"><option value="">— בחרו —</option>${opts.map(o=>`<option ${f[id]===o?"selected":""}>${o}</option>`).join("")}</select></div>`;
  /* (2026-10-20, סרגיי) הפרדה בין נזק לציוד בלבד (לא תאונה) לבין תאונה */
  if(!f.kind) return `<span class="backlink" data-action="portal-dmg-close">◀ ביטול</span>
    <h3 style="margin-top:6px;">מה קרה?</h3>
    <div class="grid-teams">
      <div class="team-tile" data-action="portal-dmg-kind" data-k="equipment" style="border-color:#f0d58a;"><div style="font-size:1.15em;font-weight:700;">🔧 נזק לציוד בלבד</div><div class="muted" style="font-size:.85em;margin-top:4px;">לא תאונה — ציוד שנשבר, אבד או ניזוק</div></div>
      <div class="team-tile" data-action="portal-dmg-kind" data-k="accident" style="border-color:#f3c4c0;"><div style="font-size:1.15em;font-weight:700;">🚗 תאונה/נזק לכלי רכב</div><div class="muted" style="font-size:.85em;margin-top:4px;">כולל מעורבים, צד ג׳ וכלי רכב</div></div>
    </div>`;
  const acc = f.kind !== "equipment";
  DMG.equipPhotos = DMG.equipPhotos || [];
  return `<span class="backlink" data-action="portal-dmg-close">◀ יציאה (נשמר כטיוטה)</span>
    <h3 style="margin-top:6px;">${acc ? "⚠️ דיווח נזק/תאונה ראשוני — תאונה/נזק לכלי רכב" : "🔧 דיווח נזק לציוד (לא תאונה)"} <span class="backlink" data-action="portal-dmg-kind" data-k="" style="font-size:.7em;font-weight:400;">שינוי סוג</span></h3>
    ${DMG.restored ? `<div class="dmg-draftbar">📝 המשך טיוטה שנשמרה ב-${esc(dmgFmtDate(DMG.restored.savedAt))}${DMG.restored.noImgs?" (בלי התמונות — לא היה מקום במכשיר)":""}
      <span class="backlink" data-action="portal-dmg-discard" style="margin-inline-start:8px;">🗑 מחיקת הטיוטה</span></div>` : ""}
    <p class="muted" style="margin:2px 0 8px;font-size:.85em;">${acc ? "כשמעורב צד ג׳ — כל השדות חובה. בלי צד ג׳ — חובה: תאריך ושעה, מספר כלי, מיקום, תאור, ראות, נזק בגוף, נזק לאופנוע, נזק מכני, למי דווח, גורם אחראי והערה." : "כל השדות חובה."} הטופס נשמר אוטומטית כטיוטה במכשיר בזמן המילוי. <span id="dmgAutoMsg"></span></p>
    <p class="muted" style="margin:0 0 8px;">${DMG.mgrMode?"המדווח":"שם המאבטח"}: <b>${esc(reporterName)}</b> </p>
    ${inp("branch","סניף","")}
    <div class="field"><label>תאריך ושעת האירוע</label><input type="datetime-local" id="dmg_event_at" value="${esc(f.event_at||nowLocal)}"></div>
    ${acc ? `${sel("road_type","סוג הדרך",["עירוני","בין עירוני"])}
    ${inp("vehicle_no","מספר כלי","")}
    ${inp("location","מיקום האירוע","")}
    ${inp("description","תאור האירוע","",true)}
    ${inp("visibility","ראות במקום","")}
    ${inp("body_damage","נזק בגוף","")}
    ${inp("moto_damage","נזק לאופנוע","")}` : ""}
    <div class="field"><label>נזק לציוד</label>
      <button type="button" class="btn secondary dmg-items-btn" data-action="portal-dmg-itemstoggle">${DMG.itemsOpen?"▲ סגירת הרשימה":"▼ בחירת ציוד שניזוק"}</button>
      <div id="dmgItemsSum" class="dmg-items-sum">${(f.items||[]).length?"נבחר: "+esc((f.items||[]).join(", ")):'<span class="muted">לא נבחר עדיין</span>'}</div>
      <div class="dmg-checklist${DMG.itemsOpen?" open":""}">${["ללא נזק"].concat(items.map(it=>it.name)).concat(["אחר (פירוט בהערה)"]).map(n=>`<label class="${n==="ללא נזק"?"dmg-none":""}"><input type="checkbox" class="dmg-item" data-action="portal-dmg-item" value="${esc(n)}" ${(f.items||[]).includes(n)?"checked":""}> ${esc(n)}</label>`).join("")}</div></div>
    ${!acc ? `${inp("location","מיקום האירוע","")}
    ${inp("description","תאור האירוע","",true)}` : ""}
    ${acc ? `${inp("mech_damage","נזק מכני","")}
    ${inp("injured","נפגעים","למשל: אין / שם ומה קרה")}
    <div class="field"><label>האם מעורב צד ג׳</label>
      <select id="dmg_tp_yn" data-action="portal-dmg-tp"><option value="לא" ${f.tp_yn!=="כן"?"selected":""}>לא</option><option value="כן" ${f.tp_yn==="כן"?"selected":""}>כן</option></select></div>
    <div class="dmg-pfields">${sel("police_called","משטרה — הוזמנה לזירה",["כן","לא"])}${inp("police_no","משטרה — מספר אירוע","אם יש")}</div>
    <div class="dmg-pfields">${sel("mda_called","מד\"א — הוזמנה לזירה",["כן","לא"])}${inp("mda_no","מד\"א — מספר אירוע","אם יש")}</div>
    <div class="field"><label>עדים לאירוע</label>
      ${(f.witnesses && f.witnesses.length ? f.witnesses : [{name:"",phone:""}]).map((w,i)=>`<div class="dmg-pfields" style="align-items:end;">
        <div class="field"><label>שם מלא</label><input type="text" id="dmg_w${i}_name" class="dmg-wit" value="${esc(w.name||"")}"></div>
        <div class="field"><label>טלפון</label><input type="text" id="dmg_w${i}_phone" inputmode="tel" value="${esc(w.phone||"")}"></div>
        ${i>0?`<span class="backlink" data-action="portal-dmg-rmwit" data-i="${i}">✕ הסרה</span>`:""}</div>`).join("")}
      <div class="flexbar"><button class="btn secondary small" data-action="portal-dmg-addwit">➕ הוספת עד</button>
        <label style="font-weight:400;"><input type="checkbox" id="dmg_no_witnesses" ${f.no_witnesses?"checked":""}> אין עדים</label></div></div>
    ${inp("reported_to","למי דווח","")}
    ${inp("responsible_arrived","גורם אחראי שהגיע למקום","")}` : ""}
    ${inp("note","הערה","",true)}
    ${!acc ? `<h3 style="margin:16px 0 6px;">📷 תמונות הציוד שניזוק</h3><div>${pick("equip", 0, "photo")}${thumbs(DMG.equipPhotos, "equip", 0, "photo")}</div>` : ""}
    ${!acc ? "" : (()=>{
      const vehicles = DMG.vehicles.map((v,i)=>`<div class="dmg-sub">
          <div class="flexbar" style="justify-content:space-between;"><b>🏍️ כלי רכב רשף ${i+1}</b>${DMG.vehicles.length>1?`<span class="backlink" data-action="portal-dmg-rmveh" data-i="${i}">✕ הסרה</span>`:""}</div>
          <div class="field" style="margin-top:6px;"><label>סוג ומספר רישוי</label><input type="text" id="dmg_v${i}_label" value="${esc(v.label||"")}" placeholder="למשל: אופנוע 12-345-67"></div>
          <div>${pick("vehicle", i, "photo")}${thumbs(v.photos, "vehicle", i, "photo")}</div>
        </div>`).join("");
      let ownN = 0;
      const own = DMG.parties.map((pt,i)=>isTP(pt)?"":partyCard(pt, i, ["מאבטח"], `העובד המעורב${DMG.parties.filter(x=>!isTP(x)).length>1?" "+(++ownN):""}`)).join("");
      const tp = f.tp_yn==="כן" ? `<h3 style="margin:16px 0 6px;">🚙 פרטי צד ג׳ מעורב</h3>
        <div class="dmg-tp">
          <p class="muted" style="margin:0 0 6px;font-size:.88em;">לכל צד ג׳: פרטי הנהג והרכב, צילום רשיון רכב, תעודה מזהה ותעודת ביטוח (המערכת ממלאת את השדות אוטומטית — בדקו ותקנו), ותמונות של הרכב.</p>
          ${DMG.parties.map((pt,i)=>isTP(pt)?partyCard(pt, i, ["צד ג׳ — נהג","צד ג׳ — אחר"], "צד ג׳"):"").join("")}
          <button class="btn secondary small" data-action="portal-dmg-addtp">➕ הוספת צד ג׳ נוסף</button>
        </div>` : "";
      return `<h3 style="margin:16px 0 6px;">👷 פרטי עובד מעורב</h3>
        <p class="muted" style="margin-top:0;">צלמו רשיון רכב ותעודה מזהה — המערכת קוראת מהם אוטומטית שם, טלפון ומספר רישוי. בדקו ותקנו אם צריך.${f.tp_yn==="כן"?" פרטי צד ג׳ — בהמשך.":""}</p>
        ${own}<button class="btn secondary small" data-action="portal-dmg-addparty">➕ הוספת עובד מעורב</button>
        <h3 style="margin:16px 0 6px;">🏍️ פרטי כלי רכב רשף מעורב</h3>
        ${vehicles}<button class="btn secondary small" data-action="portal-dmg-addveh">➕ הוספת כלי רכב</button>
        ${tp}`;
    })()}
    <div style="margin-top:16px;"><button class="btn ok" data-action="portal-dmg-send" ${DMG.busy?"disabled":""} style="font-size:1.05em;padding:10px 20px;">${DMG.busy?(DMG.msg||"שולח..."):"✔ סיימתי — שליחת הדיווח"}</button></div>
    ${DMG.error?`<p class="shortage">${esc(DMG.error)}</p>`:""}`;
}
function dmgCollect(){
  if(!document.getElementById("dmg_description")) return null; // מסך בחירת הסוג - אין שדות לאסוף
  const v = id=>{ const x = document.getElementById("dmg_"+id); return x ? x.value : ""; };
  const items = [...document.querySelectorAll(".dmg-item:checked")].map(x=>x.value);
  const ev = v("event_at");
  DMG.form = {kind:(DMG.form||{}).kind, event_at:ev, branch:v("branch"), vehicle_no:v("vehicle_no"), items, moto_damage:v("moto_damage"),
    location:v("location"), description:v("description"), visibility:v("visibility"), body_damage:v("body_damage"), mech_damage:v("mech_damage"),
    tp_yn:v("tp_yn"), reported_to:v("reported_to"), responsible_arrived:v("responsible_arrived"), note:v("note"),
    road_type:v("road_type"), injured:v("injured"), police_called:v("police_called"), police_no:v("police_no"), mda_called:v("mda_called"), mda_no:v("mda_no"),
    no_witnesses: !!(document.getElementById("dmg_no_witnesses")||{}).checked,
    witnesses: [...document.querySelectorAll(".dmg-wit")].map(x=>{ const i = x.id.match(/dmg_w(\d+)_name/)[1]; return {name:x.value, phone:v(`w${i}_phone`)}; })};
  DMG.parties.forEach((p,i)=>{ const r = document.getElementById(`dmg_p${i}_role`); if(r) p.role = r.value;
    DMG_PFIELDS.concat([["vtype",""]]).forEach(([k])=>{ const x = document.getElementById(`dmg_p${i}_${k}`); if(x){ if(x.value!==p[k]) p.auto[k] = false; p[k] = x.value; } }); });
  DMG.vehicles.forEach((v,i)=>{ const x = document.getElementById(`dmg_v${i}_label`); if(x) v.label = x.value; });
  const f = DMG.form;
  const isEq = DMG.form.kind==="equipment";
  return {kind: isEq ? "equipment" : "accident",
    parties: isEq ? [] : DMG.parties.map(p=>isTP(p) ? {role:p.role, name:p.name.trim(), phone:p.phone.trim(), plate:p.plate.trim(), insurer:p.insurer.trim()}
                                               : {role:"מאבטח", name:p.name.trim(), phone:p.phone.trim(), plate:p.plate.trim(), vtype:p.vtype||""}),
    vehicles: isEq ? [] : DMG.vehicles.map(v=>({label:(v.label||"").trim()})),
    event_at: ev ? new Date(ev).toISOString() : "", branch:f.branch, vehicle_no:f.vehicle_no, moto_damage:f.moto_damage, items, location:f.location, description:f.description,
    visibility:f.visibility, body_damage:f.body_damage, mech_damage:f.mech_damage,
    third_party: f.tp_yn==="כן" ? ("כן" + (DMG.parties.filter(isTP).map(pt=>[pt.name, pt.plate].filter(x=>String(x||"").trim()).join(" ")).filter(Boolean).length ? " — " + DMG.parties.filter(isTP).map(pt=>[pt.name, pt.plate].filter(x=>String(x||"").trim()).join(" ")).filter(Boolean).join("; ") : "")) : "לא",
    reported_to:f.reported_to, responsible_arrived:f.responsible_arrived, note:f.note,
    extra: isEq ? {} : {road_type:f.road_type, injured:f.injured, police_called:f.police_called, police_no:f.police_no, mda_called:f.mda_called, mda_no:f.mda_no,
      no_witnesses:f.no_witnesses, witnesses:(f.witnesses||[]).map(w=>({name:(w.name||"").trim(), phone:(w.phone||"").trim()})).filter(w=>w.name||w.phone)}};
}
async function dmgAction(App, a, el){
  const session = loadSession(App);
  const ms = loadMgr(App);
  if(a==="portal-dmg-new"){ const tm = session && App.teamById ? App.teamById(session.team_id) : null;
    DMG.mgrMode = false; DMG.restored = null;
    const dr = el.dataset.fresh ? null : dmgLoadDraft(App, false);
    if(dr){ DMG.open = true; dmgRestore(dr); DMG.error = null; DMG.msg = null; return App.render(); }
    DMG.open = true; DMG.form = {branch: tm ? ((tm.sectors&&tm.sectors.length) ? tm.sectors.join(" / ") : tm.name) : ""}; DMG.parties = [dmgNewParty("מאבטח", session ? session.name : "")]; DMG.vehicles = [{label:"", photos:[]}]; DMG.equipPhotos = []; DMG.error = null; DMG.msg = null; return App.render(); }
  if(a==="portal-dmg-itemstoggle"){
    DMG.itemsOpen = !DMG.itemsOpen;
    const box = document.querySelector(".dmg-checklist"); if(box) box.classList.toggle("open", DMG.itemsOpen);
    el.textContent = DMG.itemsOpen ? "▲ סגירת הרשימה" : "▼ בחירת ציוד שניזוק"; return;
  }
  if(a==="portal-dmg-kind"){ dmgCollect(); DMG.form = Object.assign({}, DMG.form, {kind: el.dataset.k || null}); return App.render(); }
  if(a==="portal-dmg-discard"){ dmgClearDraft(App); DMG.restored = null; const m = DMG.mgrMode;
    if(m){ DMG.open = false; DMG.mgrMode = false; return pvGo(App, "dmg-list", {}); }
    DMG.open = false; return App.render(); }
  if(a==="portal-dmg-addparty"){ dmgCollect(); DMG.parties.push(dmgNewParty("מאבטח")); return App.render(); }
  if(a==="portal-dmg-addtp"){ dmgCollect(); DMG.parties.push(dmgNewParty("צד ג׳ — נהג")); return App.render(); }
  if(a==="portal-dmg-rmparty"){ dmgCollect(); DMG.parties.splice(Number(el.dataset.i),1); return App.render(); }
  if(a==="portal-dmg-addwit"){ dmgCollect(); DMG.form.witnesses = (DMG.form.witnesses||[]).concat([{name:"",phone:""}]); if(DMG.form.witnesses.length<2) DMG.form.witnesses.push({name:"",phone:""}); return App.render(); }
  if(a==="portal-dmg-rmwit"){ dmgCollect(); (DMG.form.witnesses||[]).splice(Number(el.dataset.i),1); return App.render(); }
  if(a==="portal-dmg-addveh"){ dmgCollect(); DMG.vehicles.push({label:"", photos:[]}); return App.render(); }
  if(a==="portal-dmg-rmveh"){ dmgCollect(); DMG.vehicles.splice(Number(el.dataset.i),1); return App.render(); }
  if(a==="portal-dmg-mnew"){
    if(!ms) return App.render();
    DMG.open = true; DMG.mgrMode = true; DMG.restored = null;
    if(!DMG.items) App.apiGet("logistics_items", "select=id,name,has_size,sort_order,size_options,has_serial,has_vehicle&order=sort_order").then(x=>{ DMG.items = x||[]; App.render(); }).catch(()=>{ DMG.items = []; });
    const mdr = el.dataset.fresh ? null : dmgLoadDraft(App, true);
    if(mdr){ dmgRestore(mdr); DMG.error = null; DMG.msg = null; return pvGo(App, "dmg-new", {}); }
    DMG.form = {branch: Array.from(new Set(mgrTeams(App, ms.logistics_team_ids).flatMap(t=>(t.sectors&&t.sectors.length)?t.sectors:[t.name]))).join(" / ")}; DMG.parties = [dmgNewParty("מאבטח", "")]; DMG.vehicles = [{label:"", photos:[]}]; DMG.equipPhotos = []; DMG.error = null; DMG.msg = null;
    if(!DMG.items) App.apiGet("logistics_items", "select=id,name,has_size,sort_order,size_options,has_serial,has_vehicle&order=sort_order").then(x=>{ DMG.items = x||[]; App.render(); }).catch(()=>{ DMG.items = []; });
    return pvGo(App, "dmg-new", {});
  }
  if(a==="portal-dmg-close"){
    if(DMG.open) dmgSaveDraft(App);
    if(DMG.mgrMode){ DMG.open = false; DMG.mgrMode = false; return pvGo(App, "dmg-list", {}); }
    DMG.open = false; DMG.view = null; DMG.images = null; return App.render();
  }
  if(a==="portal-dmg-open"){ DMG.view = (DMG.mine||[]).find(x=>x.id===el.dataset.id) || null; DMG.images = null; return App.render(); }
  if(a==="portal-dmg-rmimg"){ dmgCollect(); const d = el.dataset, i = Number(d.i), j = Number(d.j);
    if(d.sec==="party" && DMG.parties[i]) (DMG.parties[i].docs[d.kind]||[]).splice(j,1); else if(d.sec==="equip") (DMG.equipPhotos||[]).splice(j,1); else if(DMG.vehicles[i]) DMG.vehicles[i].photos.splice(j,1); return App.render(); }
  if(a==="portal-dmg-send"){
    const asMgr = !!DMG.mgrMode;
    if((asMgr ? !ms : !session) || DMG.busy) return;
    const tok = asMgr ? ms.token : session.token;
    const p = dmgCollect();
    if(!p){ DMG.error = "בחרו סוג דיווח"; return App.render(); }
    { // כל הרובריקות חובה (סרגיי, 2026-10-20)
      // (2026-10-20, אלירן) תאונה: כשמעורב צד ג׳ - כל הדו"ח חובה; בלי צד ג׳ - רק תאריך ושעה, מספר כלי, נזק לאופנוע,
      // מיקום, תאור, ראות, נזק בגוף, נזק מכני, למי דווח, גורם אחראי והערה. נזק לציוד בלבד - הכל חובה (ללא שינוי).
      const f = DMG.form, acc = p.kind!=="equipment", full = !acc || f.tp_yn==="כן", miss = [];
      const req = (val, label)=>{ if(!String(val==null?"":val).trim()) miss.push(label); };
      if(p.items.includes("ללא נזק") && p.items.length>1){ DMG.error = "\"ללא נזק\" לא יכול להיבחר יחד עם פריטים אחרים"; return App.render(); }
      if(full) req(f.branch, "סניף");
      req(f.event_at, "תאריך ושעה");
      if(acc){ if(full) req(f.road_type, "סוג הדרך"); req(f.vehicle_no, "מספר כלי"); }
      req(f.location, "מיקום האירוע"); req(f.description, "תאור האירוע");
      if(acc){ req(f.visibility, "ראות במקום"); req(f.body_damage, "נזק בגוף"); req(f.moto_damage, "נזק לאופנוע"); }
      if(full && !p.items.length) miss.push("נזק לציוד");
      if(acc){ req(f.mech_damage, "נזק מכני");
        if(full){ req(f.injured, "נפגעים");
          req(f.police_called, "משטרה — הוזמנה לזירה"); if(f.police_called==="כן") req(f.police_no, "משטרה — מספר אירוע");
          req(f.mda_called, "מד\"א — הוזמנה לזירה"); if(f.mda_called==="כן") req(f.mda_no, "מד\"א — מספר אירוע");
          const wits = (f.witnesses||[]).filter(w=>String(w.name||"").trim()||String(w.phone||"").trim());
          if(!f.no_witnesses && !wits.length) miss.push("עדים לאירוע (או לסמן \"אין עדים\")");
          wits.forEach((w,i)=>{ req(w.name, `שם עד ${i+1}`); req(w.phone, `טלפון עד ${i+1}`); }); }
        req(f.reported_to, "למי דווח"); req(f.responsible_arrived, "גורם אחראי שהגיע למקום");
        if(full){
          DMG.parties.forEach((pt,i)=>{ const who = isTP(pt) ? "צד ג׳" : "עובד מעורב"; dmgPFields(pt).forEach(([k,l])=>req(pt[k], `${l} (${who}${pt.name?" "+pt.name:""})`)); });
          DMG.vehicles.forEach((v,i)=>req(v.label, `כלי רכב רשף ${i+1} — סוג ומספר רישוי`)); } }
      req(f.note, "הערה");
      if(miss.length){ DMG.error = "חסר למילוי: " + miss.join(", "); return App.render(); }
    }
    if(!p.description.trim()){ DMG.error = "צריך לכתוב תיאור קצר של האירוע"; return App.render(); }
    if(!p.event_at){ DMG.error = "צריך תאריך ושעה של האירוע"; return App.render(); }
    DMG.busy = true; DMG.error = null; DMG.msg = "שולח..."; App.render();
    try{
      const id = await App.apiRpc(asMgr ? "mgr_damage_create" : "worker_damage_create", {p_token:tok, p});
      const ups = [];
      if(p.kind==="equipment") (DMG.equipPhotos||[]).forEach(src=>ups.push({src, meta:{sec:"equip", i:0, kind:"photo"}}));
      else DMG.parties.forEach((pt,i)=>dmgDocsFor(pt).forEach(([dk])=>(pt.docs[dk]||[]).forEach(src=>ups.push({src, meta:{sec:"party", i, kind:dk}}))));
      if(p.kind!=="equipment") DMG.vehicles.forEach((v,i)=>v.photos.forEach(src=>ups.push({src, meta:{sec:"vehicle", i, kind:"photo"}})));
      for(let k=0;k<ups.length;k++){
        DMG.msg = `מעלה תמונה ${k+1}/${ups.length}...`; App.render();
        await App.apiRpc(asMgr ? "mgr_damage_add_image2" : "worker_damage_add_image2", {p_token:tok, p_report_id:id, p_image:ups[k].src, p_meta:ups[k].meta});
      }
      dmgClearDraft(App); DMG.restored = null;
      if(asMgr){ DMG.busy = false; DMG.open = false; DMG.mgrMode = false; DMG.form = {}; DMG.parties = []; DMG.vehicles = []; DMG.msg = null; DMG.list = null;
        pvGo(App, "dmg-list", {}); PV.msg = "הדיווח נשלח."; return App.render(); }
      DMG.busy = false; DMG.open = false; DMG.form = {}; DMG.parties = []; DMG.vehicles = []; DMG.mine = null; DMG.msg = null;
      DMG.okMsg = "✔ הדיווח נשלח לקב\"ט ולסרגיי."; return App.render();
    }catch(e){ DMG.busy = false; DMG.msg = null; DMG.error = e.message; return App.render(); }
  }
  // מנהלים
  if(a==="portal-dmg-copy"){ const r = DMG.mview; if(r && navigator.clipboard) navigator.clipboard.writeText(dmgText(r)).then(()=>{ PV.msg = "הדו\"ח הועתק."; App.render(); }).catch(()=>{}); return; }
  if(a==="portal-dmg-pdf"){
    const r = el.dataset.who==="w" ? DMG.view : DMG.mview; if(!r) return;
    const imgs = el.dataset.who==="w" ? (DMG.images||[]) : (DMG.mimages||[]);
    const old = el.textContent; el.textContent = "מכין PDF..."; el.disabled = true;
    try{ await dmgMakePdf(App, r, imgs); el.textContent = old; }
    catch(e){ el.textContent = "⚠️ הפקת ה-PDF נכשלה — נסו שוב"; setTimeout(()=>{ el.textContent = old; }, 4000); }
    el.disabled = false; return;
  }
  if(a==="portal-dmg-print"){
    const r = DMG.mview; if(!r) return;
    const w = window.open("", "_blank"); if(!w) return;
    w.document.write(`<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>דיווח נזק - ${App.escapeHtml(r.worker_name)}</title><style>body{font-family:Arial,sans-serif;padding:20px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #999;padding:6px 8px;text-align:right;vertical-align:top;}th{background:#f1f1f1;width:30%;}img{max-width:48%;margin:4px;}.logo-strip{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:8px;margin-bottom:10px;border-bottom:2px solid #1f4e8c;}.logo-strip img{max-width:24%!important;margin:0;}</style></head><body>${App.logoStripHtml ? App.logoStripHtml(50) : ""}${dmgReportHtml(App, r, DMG.mimages||[])}<script>setTimeout(()=>window.print(),400)<\/script></body></html>`);
    w.document.close(); return;
  }
}
/* הפקת דו"ח PDF (2026-10-20, סרגיי) - html2pdf.js נטען רק בלחיצה, מהטבלה המסודרת + התמונות */
function loadHtml2Pdf(){
  if(window.html2pdf) return Promise.resolve();
  return new Promise((res, rej)=>{ const sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    sc.onload = ()=>res(); sc.onerror = ()=>rej(new Error("טעינת רכיב ה-PDF נכשלה")); document.head.appendChild(sc); });
}
async function dmgMakePdf(App, r, images){
  await loadHtml2Pdf();
  const box = document.createElement("div");
  box.dir = "rtl"; box.style.cssText = "position:fixed;left:-10000px;top:0;width:760px;background:#fff;color:#111;font-family:Arial,sans-serif;padding:18px;";
  box.innerHTML = `<style>.dmg-table{width:100%;border-collapse:collapse;font-size:13px;}.dmg-table th,.dmg-table td{border:1px solid #999;padding:6px 8px;text-align:right;vertical-align:top;}
    .dmg-table th{background:#f1f1f1;width:32%;} h3{font-size:19px;} h4{font-size:15px;} .dmg-imgs{display:flex;flex-wrap:wrap;gap:6px;} .dmg-imgs img{width:230px;height:auto;max-height:230px;object-fit:contain;border:1px solid #ccc;page-break-inside:avoid;} .muted{color:#666;}</style>
    ${App.logoStripHtml ? App.logoStripHtml(50) : ""}<div style="font-size:12px;color:#666;margin-bottom:6px;">הופק ${App.escapeHtml(dmgFmtDate(new Date().toISOString()))}</div>${dmgReportHtml(App, r, images)}`;
  document.body.appendChild(box);
  const nm = String(r.worker_name||"").replace(/\s+/g,"-"), dt = locDay(App, r.event_at);
  try{
    await window.html2pdf().set({margin:[10,8,10,8], filename:`${r.kind==="equipment"?"נזק-לציוד":"תאונה"}-${nm}-${dt}.pdf`, image:{type:"jpeg", quality:0.92},
      html2canvas:{scale:2, useCORS:true}, jsPDF:{unit:"mm", format:"a4", orientation:"portrait"}, pagebreak:{mode:["css","legacy"]}}).from(box).save();
  } finally { box.remove(); }
}
function dmgMgrLoad(App, ms, force){
  if(DMG.mgrTok !== ms.token){ DMG.mgrTok = ms.token; DMG.list = null; DMG.listAt = 0; }
  if(DMG.listLoading || (!force && DMG.list && Date.now()-DMG.listAt < 60000)) return;
  DMG.listLoading = true;
  App.apiRpc("mgr_damage_list", {p_token:ms.token}).then(d=>{ DMG.list = d||[]; DMG.listAt = Date.now(); DMG.listLoading = false; App.render(); })
    .catch(()=>{ DMG.listLoading = false; DMG.listAt = Date.now(); });
}
function renderDamageMgrPages(App, ms, pg, a, wrap, loading, msgs){
  const esc = App.escapeHtml;
  if(pg==="dmg-new"){
    if(!DMG.open) return wrap(`<p class="muted">הטופס נסגר.</p>`);
    return `<div class="card">${dmgFormHtml(App, ms.name)}</div>`;
  }
  if(pg==="dmg-list"){
    dmgMgrLoad(App, ms);
    if(!DMG.list) return loading();
    return wrap(`<div class="flexbar" style="justify-content:space-between;flex-wrap:wrap;gap:6px;"><h2 style="margin:0;">⚠️ דיווחי נזק/תאונה</h2>
      <span>${dmgLoadDraft(App, true) ? `<button class="btn" data-action="portal-dmg-mnew" style="margin-inline-end:6px;">📝 המשך טיוטה</button>` : ""}<button class="btn" style="background:#b42318;border-color:#b42318;" data-action="portal-dmg-mnew"${dmgLoadDraft(App, true)?' data-fresh="1"':""}>➕ דיווח חדש</button></span></div>${msgs}
      ${DMG.list.length ? DMG.list.map(r=>`<div class="portal-task${r.seen?"":" portal-unread"}" data-action="portal-pv" data-page="dmg-view" data-id="${r.id}">
        <span class="portal-task-icon">${r.seen?"📄":"🔔"}</span>
        <span>${r.kind==="equipment"?'<span class="dmg-kind eq">🔧 ציוד</span>':'<span class="dmg-kind acc">🚗 תאונה/נזק לכלי רכב</span>'} <b>${esc(r.worker_name)}</b>${r.mine?' <span class="muted">(הדיווח שלי)</span>':(r.reporter_manager?' <span class="muted">(קב"ט)</span>':"")} · ${esc(r.branch||"")} · ${esc(dmgFmtDate(r.event_at))}${r.images?` · 📷 ${r.images}`:""}
        <span class="muted" style="display:block;font-size:.85em;">${esc((r.description||"").slice(0,90))}</span></span></div>`).join("") : `<p class="muted">אין דיווחים.</p>`}`);
  }
  if(pg==="dmg-view"){
    dmgMgrLoad(App, ms);
    if(!DMG.list) return loading();
    const r = DMG.list.find(x=>x.id===a.id);
    if(!r) return wrap(`<p class="muted">הדו"ח לא נמצא.</p>`);
    if(!DMG.mview || DMG.mview.id!==r.id){ DMG.mview = r; DMG.mimages = r.images ? null : []; }
    if(!r.seen){ r.seen = true; App.apiRpc("mgr_damage_seen", {p_token:ms.token, p_id:r.id}).catch(()=>{}); }
    if(DMG.mimages===null && !DMG.mloadingImgs){ DMG.mloadingImgs = true; App.apiRpc("damage_images_get2", {p_token:ms.token, p_report_id:r.id}).then(x=>{ DMG.mimages = x||[]; DMG.mloadingImgs = false; App.render(); }).catch(()=>{ DMG.mimages = []; DMG.mloadingImgs = false; App.render(); }); }
    return wrap(`${dmgReportHtml(App, r, DMG.mimages)}
      <div class="row" style="margin-top:10px;"><button class="btn" data-action="portal-dmg-pdf" data-who="m">📄 הפקת דו"ח PDF</button><button class="btn secondary" data-action="portal-dmg-copy">📋 העתקת הדו"ח</button><button class="btn secondary" data-action="portal-dmg-print">🖨️ הדפסה / PDF</button></div>${msgs}`);
  }
  return null;
}
/* ================================================================
   דוח פעולה מאבטח (2026-10-21, סרגיי): המאבטח ממלא דוח פעולה באיזור האישי - כמעט הכל בחירות (צ'יפים), מעט מלל
   (כתובת, מספרי אירוע, השלמה לא חובה). מהבחירות נבנה דו"ח מנוסח בפורמט "דוח פעולה מאבטח" (לפי הדוגמה של סרגיי),
   נשמר כמוצר מוגמר ומגיע לקב"ט של הצוות ולסרגיי (פוש + "📝 דוחות פעולה"), עם הפקת PDF, העתקה והדפסה.
   השרת: worker_action_report_create / _add_image / _list, worker_team_mates, mgr_action_report_list / _seen,
   action_report_images_get.
   ================================================================ */
const AR = { open:false, f:null, mates:null, busy:false, error:null, okMsg:null, mine:null, view:null, images:null, photos:[],
  list:null, listAt:0, mview:null, mimages:null };
const AR_OPT = {
  type: ["אלימות / קטטה","תקיפת נהג","תקיפת פקח/ית","גניבה / שוד","איומים / הטרדה","ונדליזם / נזק לרכוש","חפץ חשוד","אדם במצוקה / אירוע רפואי","שכרות / הפרת סדר","נוסע ללא תשלום / סירוב להזדהות","תאונת דרכים","אחר"],
  involved: ["נהג אוטובוס","פקח/ית","נוסע/ת","עובר/ת אורח","מאבטח","קטין","אחר"],
  source: ["קריאה מהמוקד","זיהוי עצמי בסיור","פנייה של נהג","פנייה של פקח/ית","פנייה של אזרח","בקשת משטרה"],
  role: ["הגעתי ראשון לזירה","הגעתי כתגבור","תיאמתי מול הכוחות והכוונתי סייר לזירה"],
  arrive: ["פחות מ-3 דק׳","3–5 דק׳","5–10 דק׳","10–20 דק׳","מעל 20 דק׳"],
  findings: ["המעורבים נמצאו בזירה","החשוד נמצא בזירה","החשוד נמלט מהמקום","החשוד תחת השפעת אלכוהול / סמים","החשוד החזיק נשק / חפץ חד","נגנב רכוש","יש פצועים","יש עדים לאירוע","יש תיעוד מצלמות"],
  suspects: ["אין","1","2","3 ומעלה","לא ידוע"],
  sgender: ["גבר","אישה","לא ידוע"],
  sage: ["קטין","18–30","30–50","50+","לא ידוע"],
  actions: ["תיאום מול המוקד","הכוונת כוחות","תחקור ראשוני של המעורבים","איסוף פרטי עדים","הפרדה בין הצדדים","הרגעת הצדדים","מתן עזרה ראשונה","סריקות באזור","איתור החשוד","עיכוב החשוד עד הגעת משטרה","ליווי השוטר לכתובת החשוד","זיהוי החשוד ע״י המתלונן","השבת הרכוש לבעליו","צילום ותיעוד הזירה","הרחקת קהל ואבטחת הזירה"],
  yn: ["כן","לא"],
  punit: ["ניידת","אופנוע","סיור רגלי","בילוש"],
  end: ["החשוד עוכב ע״י המשטרה להמשך חקירה","החשוד נעצר","החשוד נמלט ולא אותר","הרכוש הוחזר לבעליו","הוגשה תלונה במשטרה","פינוי לבית חולים","הנהג המשיך במסלול","האוטובוס הושבת","הצדדים פוזרו","האירוע הסתיים ללא צורך בהמשך טיפול","נדרש המשך טיפול של הקב״ט"],
  body: ["ללא נזק גוף","פציעה קלה","פציעה בינונית","פציעה קשה"],
  prop: ["ללא נזק רכוש","נגרם נזק לרכוש"]
};
const AR_MULTI = {involved:1, findings:1, actions:1, end:1, mates:1};
function arPad(n){ return String(n).padStart(2,"0"); }
function arNewForm(){ const d = new Date(); return {date:`${d.getFullYear()}-${arPad(d.getMonth()+1)}-${arPad(d.getDate())}`, time:`${arPad(d.getHours())}:${arPad(d.getMinutes())}`,
  involved:[], findings:[], actions:[], end:[], mates:[], mda:"לא", police:"לא", body:"ללא נזק גוף", prop:"ללא נזק רכוש"}; }
function arDraftKey(App){ const s = loadSession(App); return s ? "cst_ar_draft_" + (s.worker_id || s.name || "") : null; }
function arSaveDraft(App){ try{ const k = arDraftKey(App); if(k && AR.f) localStorage.setItem(k, JSON.stringify(AR.f)); }catch(e){} }
function arLoadDraft(App){ try{ const k = arDraftKey(App); return k ? JSON.parse(localStorage.getItem(k)||"null") : null; }catch(e){ return null; } }
function arClearDraft(App){ try{ const k = arDraftKey(App); if(k) localStorage.removeItem(k); }catch(e){} }
function arSync(App){
  if(!AR.f) return;
  document.querySelectorAll("[data-arf]").forEach(x=>{ AR.f[x.dataset.arf] = x.value; });
  arSaveDraft(App);
}
function arFmtDate(s){ return s ? `${s.slice(8,10)}/${s.slice(5,7)}/${s.slice(0,4)}` : ""; }
/* בניית הדו"ח המנוסח מהבחירות - בפורמט "דוח פעולה מאבטח" */
function arBuildText(f, name){
  const L = [], has = v=>v && String(v).trim();
  L.push("דוח פעולה מאבטח");
  L.push(`דיווח אירוע - ${arFmtDate(f.date)}`);
  if(has(f.sayvu)) L.push(`מס׳ אירוע בסביו: ${f.sayvu.trim()}`);
  L.push("");
  L.push("פרטי האירוע:");
  const src = {"קריאה מהמוקד":"התקבלה קריאה במוקד","זיהוי עצמי בסיור":"זוהה בסיור","פנייה של נהג":"התקבלה פנייה מנהג","פנייה של פקח/ית":"התקבלה פנייה מפקח/ית",
    "פנייה של אזרח":"התקבלה פנייה מאזרח","בקשת משטרה":"התקבלה בקשה מהמשטרה"}[f.source] || "התקבל דיווח";
  const type = f.type==="אחר" && has(f.typeOther) ? f.typeOther.trim() : (f.type||"");
  L.push(`בשעה ${f.time||""} ${src} על אירוע ${type}${has(f.location)?` ב${f.location.trim()}`:""}.`);
  const inv = (f.involved||[]).map(x=>x==="אחר" && has(f.involvedOther) ? f.involvedOther.trim() : x);
  if(inv.length) L.push(`מעורבים: ${inv.join(", ")}.`);
  if(f.role==="תיאמתי מול הכוחות והכוונתי סייר לזירה") L.push(`אני (${name}) ביצעתי תיאום מול הכוחות בשטח והכוונתי את הסייר הקרוב ביותר לאירוע${has(f.directed)?` – ${f.directed}`:""}.`);
  else if(f.role==="הגעתי ראשון לזירה") L.push(`אני (${name}) הגעתי ראשון לזירה.`);
  else if(f.role==="הגעתי כתגבור") L.push(`אני (${name}) הגעתי לזירה כתגבור.`);
  else L.push(`מדווח: ${name}.`);
  if(f.arrive) L.push(`זמן הגעה לזירה: ${f.arrive}.`);
  const fnd = (f.findings||[]).slice();
  if(fnd.length || (f.suspects && f.suspects!=="אין")){
    let s = `זיהוי האירוע: בהגעה למקום${fnd.length?` — ${fnd.join("; ")}`:""}.`;
    if(f.suspects && f.suspects!=="אין"){ const sd = [f.sgender, f.sage].filter(x=>x && x!=="לא ידוע"); s += ` חשודים: ${f.suspects}${sd.length?` (${sd.join(", ")})`:""}.`; }
    L.push(s);
  }
  if(has(f.notes)){ L.push(""); L.push("תיאור האירוע:"); f.notes.trim().split(/\n+/).forEach(x=>{ if(x.trim()) L.push(x.trim()); }); }
  L.push("");
  L.push(`מד״א מספר אירוע: ${f.mda==="כן" && has(f.mdaNo) ? f.mdaNo.trim() : "—"}`);
  L.push(`הוזמנה לזירה: ${f.mda==="כן"?"כן":"לא"}.`);
  if(f.mda==="כן") L.push(`הערה: ${[f.mdaArrived?`הגיעה לזירה: ${f.mdaArrived}`:"", f.mdaEvac?`פינוי לבית חולים: ${f.mdaEvac}`:""].filter(Boolean).join(" · ") || "—"}`);
  L.push(`משטרה מספר אירוע: ${f.police==="כן" && has(f.policeNo) ? f.policeNo.trim() : "—"}`);
  L.push(`הוזמנה לזירה: ${f.police==="כן"?"כן":"לא"}.`);
  if(f.police==="כן") L.push(`הערה: ${[f.policeArrived?`הגיעה לזירה: ${f.policeArrived}`:"", f.policeUnit?`כוח: ${f.policeUnit}`:"", f.policeTime?`זמן הגעה: ${f.policeTime}`:""].filter(Boolean).join(" · ") || "—"}`);
  if((f.actions||[]).length){ L.push(""); L.push("פעולות שבוצעו:"); f.actions.forEach(x=>L.push(`• ${x}`)); }
  L.push(""); L.push("ממצאים וסיום אירוע:");
  (f.end||[]).forEach(x=>L.push(`• ${x}`));
  L.push(`• ${f.body||"ללא נזק גוף"}`);
  L.push(`• ${f.prop==="נגרם נזק לרכוש" && has(f.propDesc) ? `נגרם נזק לרכוש: ${f.propDesc.trim().replace(/\s*\n\s*/g, " ")}` : (f.prop||"ללא נזק רכוש")}`);
  L.push("");
  const ops = [name].concat(f.mates||[]).concat(has(f.matesOther) ? f.matesOther.split(/[,،]/).map(x=>x.trim()).filter(Boolean) : []);
  L.push(`מבצעים: ${Array.from(new Set(ops)).join(", ")}.`);
  return L.join("\n");
}
/* תצוגת הדו"ח המוגמר (מהמלל השמור) */
const AR_HEADS = ["דוח פעולה מאבטח","פרטי האירוע:","תיאור האירוע:","פעולות שבוצעו:","ממצאים וסיום אירוע:","פרטים נוספים:"];
function arReportHtml(App, r, images){
  const esc = App.escapeHtml;
  const lines = String(r.report_text||"").split("\n");
  let html = "", inList = false;
  lines.forEach((ln, i)=>{
    const isLi = ln.startsWith("• ");
    if(!isLi && inList){ html += "</ul>"; inList = false; }
    if(isLi){ if(!inList){ html += `<ul class="ar-ul">`; inList = true; } html += `<li>${esc(ln.slice(2))}</li>`; return; }
    if(i===0) html += `<h3 class="ar-h1">${esc(ln)}</h3>`;
    else if(AR_HEADS.includes(ln)) html += `<div class="ar-h">${esc(ln)}</div>`;
    else if(!ln.trim()) html += `<div class="ar-gap"></div>`;
    else { const m = ln.match(/^([^:]{2,30}:)(.*)$/); html += `<div class="ar-ln">${m && i>0 && !/^בשעה/.test(ln) ? `<b>${esc(m[1])}</b>${esc(m[2])}` : esc(ln)}</div>`; }
  });
  if(inList) html += "</ul>";
  return `<div class="ar-doc">${html}
    <div class="ar-meta">${esc(r.worker_name||"")}${r.branch?` · ${esc(r.branch)}`:""} · נשלח ${esc(dmgFmtDate(r.created_at))}</div>
    ${images && images.length ? `<div class="ar-h">תמונות מהזירה</div><div class="dmg-imgs ar-imgs">${images.map(s=>`<img src="${safeSrc(s)}" alt="">`).join("")}</div>` : ""}</div>`;
}
/* זמן הגעה (2026-10-21, סרגיי): בחירה מרשימה נפתחת (חץ) במקום טווחים */
const AR_MINUTES = Array.from({length:30}, (_,i)=>`${i+1} דק׳`).concat(["35 דק׳","40 דק׳","45 דק׳","50 דק׳","55 דק׳","60 דק׳","יותר משעה"]);
function arTimeSelect(App, k){
  const esc = App.escapeHtml, v = AR.f[k]||"";
  return `<select data-arf="${k}" class="ar-time"><option value="">— בחרו —</option>${AR_MINUTES.map(o=>`<option value="${esc(o)}" ${o===v?"selected":""}>${esc(o)}</option>`).join("")}</select>`;
}
function arChips(App, k, opts){
  const f = AR.f, esc = App.escapeHtml, multi = !!AR_MULTI[k];
  return `<div class="ar-chips">${opts.map(o=>{ const on = multi ? (f[k]||[]).includes(o) : f[k]===o;
    return `<span class="ar-chip${on?" on":""}" data-action="portal-ar-chip" data-k="${k}" data-v="${esc(o)}">${on&&multi?"✓ ":""}${esc(o)}</span>`; }).join("")}</div>`;
}
function arFormHtml(App, session){
  const esc = App.escapeHtml, f = AR.f;
  if(AR.mates===null && !AR.matesLoading){ AR.matesLoading = true; App.apiRpc("worker_team_mates", {p_token:session.token}).then(x=>{ AR.mates = (x||[]).map(m=>m.name); AR.matesLoading = false; App.render(); }).catch(()=>{ AR.mates = []; AR.matesLoading = false; }); }
  const mates = AR.mates || [];
  const sec = (title, inner, req)=>`<div class="ar-sec"><div class="ar-sec-h">${title}${req?' <span class="ar-req">*</span>':""}</div>${inner}</div>`;
  const inp = (k, ph, type, extra)=>`<input type="${type||"text"}" data-arf="${k}" value="${esc(f[k]||"")}" placeholder="${esc(ph||"")}" ${extra||""}>`;
  return `<span class="backlink" data-action="portal-ar-close">◀ יציאה (נשמר כטיוטה)</span>
    <h3 style="margin:6px 0 2px;">📝 דוח פעולה</h3>
    <p class="muted" style="margin:0 0 8px;font-size:.88em;">רוב הדו"ח בלחיצות. הדו"ח המנוסח נבנה אוטומטית ונשלח לקב"ט ולסרגיי. <span class="ar-req">*</span> חובה</p>
    ${sec("מתי ואיפה", `<div class="row">
        <div class="field"><label>תאריך</label>${inp("date","","date")}</div>
        <div class="field"><label>שעה</label>${inp("time","","time")}</div>
        <div class="field"><label>מס׳ אירוע בסביו <span class="ar-req">*</span></label>${inp("sayvu","6 ספרות","text",'inputmode="numeric" maxlength="6" pattern="[0-9]{6}"')}</div></div>
      <div class="field"><label>כתובת / מיקום <span class="ar-req">*</span></label>${inp("location","למשל: אינטרנציונל 24","text",'maxlength="200"')}</div>`, true)}
    ${sec("סוג האירוע", arChips(App, "type", AR_OPT.type) + (f.type==="אחר" ? `<div class="field" style="margin-top:6px;">${inp("typeOther","מה סוג האירוע","text",'maxlength="80"')}</div>` : ""), true)}
    ${sec("מי היו מעורבים", arChips(App, "involved", AR_OPT.involved) + ((f.involved||[]).includes("אחר") ? `<div class="field" style="margin-top:6px;">${inp("involvedOther","מי עוד","text",'maxlength="80"')}</div>` : ""))}
    ${sec("איך התקבל האירוע", arChips(App, "source", AR_OPT.source), true)}
    ${sec("התפקיד שלי באירוע", arChips(App, "role", AR_OPT.role)
      + (f.role==="תיאמתי מול הכוחות והכוונתי סייר לזירה" && mates.length ? `<div class="ar-sub">איזה סייר הוכוון לזירה:</div><div class="ar-chips">${mates.map(n=>`<span class="ar-chip${f.directed===n?" on":""}" data-action="portal-ar-chip" data-k="directed" data-v="${esc(n)}">${esc(n)}</span>`).join("")}</div>` : "")
      + `<div class="ar-sub">זמן הגעה לזירה:</div>${arTimeSelect(App, "arrive")}`)}
    ${sec("מה נמצא בזירה", arChips(App, "findings", AR_OPT.findings)
      + `<div class="ar-sub">חשודים:</div>${arChips(App, "suspects", AR_OPT.suspects)}`
      + (f.suspects && f.suspects!=="אין" ? `<div class="ar-sub">מין:</div>${arChips(App, "sgender", AR_OPT.sgender)}<div class="ar-sub">גיל משוער:</div>${arChips(App, "sage", AR_OPT.sage)}` : ""))}
    ${sec("🚑 מד״א", `<div class="ar-sub" style="margin-top:0;">הוזמנה לזירה:</div>${arChips(App, "mda", AR_OPT.yn)}
      ${f.mda==="כן" ? `<div class="field" style="margin-top:6px;"><label>מס׳ אירוע מד״א</label>${inp("mdaNo","לא חובה","text",'maxlength="30"')}</div>
        <div class="ar-sub">הגיעה לזירה:</div>${arChips(App, "mdaArrived", AR_OPT.yn)}<div class="ar-sub">פינוי לבית חולים:</div>${arChips(App, "mdaEvac", AR_OPT.yn)}` : ""}`)}
    ${sec("🚓 משטרה", `<div class="ar-sub" style="margin-top:0;">הוזמנה לזירה:</div>${arChips(App, "police", AR_OPT.yn)}
      ${f.police==="כן" ? `<div class="field" style="margin-top:6px;"><label>מס׳ אירוע משטרה</label>${inp("policeNo","לא חובה","text",'maxlength="30"')}</div>
        <div class="ar-sub">הגיעה לזירה:</div>${arChips(App, "policeArrived", AR_OPT.yn)}<div class="ar-sub">איזה כוח:</div>${arChips(App, "policeUnit", AR_OPT.punit)}
        <div class="ar-sub">זמן הגעה:</div>${arTimeSelect(App, "policeTime")}` : ""}`)}
    ${sec("פעולות שביצענו", arChips(App, "actions", AR_OPT.actions))}
    ${sec("איך הסתיים האירוע", arChips(App, "end", AR_OPT.end)
      + `<div class="ar-sub">נזק גוף:</div>${arChips(App, "body", AR_OPT.body)}<div class="ar-sub">נזק רכוש:</div>${arChips(App, "prop", AR_OPT.prop)}`
      + (f.prop==="נגרם נזק לרכוש" ? `<div class="field" style="margin-top:6px;"><label>תיאור הנזק <span class="ar-req">*</span></label><textarea data-arf="propDesc" rows="3" maxlength="1500" placeholder="מה ניזוק ואיך">${esc(f.propDesc||"")}</textarea></div>` : ""))}
    ${sec("מבצעים — מי היה איתי", (mates.length ? `<div class="ar-chips">${mates.map(n=>{ const on = (f.mates||[]).includes(n); return `<span class="ar-chip${on?" on":""}" data-action="portal-ar-chip" data-k="mates" data-v="${esc(n)}">${on?"✓ ":""}${esc(n)}</span>`; }).join("")}</div>` : `<p class="muted" style="margin:0;">טוען...</p>`)
      + `<div class="field" style="margin-top:6px;">${inp("matesOther","מישהו שלא ברשימה (לא חובה)","text",'maxlength="120"')}</div>`)}
    ${sec("📷 תמונות מהזירה (לא חובה, עד 8)", `<span><label class="btn secondary small" style="cursor:pointer;">📷 צילום<input type="file" accept="image/*" capture="environment" data-action="portal-ar-files" style="display:none;"></label>
      <label class="btn secondary small" style="cursor:pointer;">🖼️ מהגלריה<input type="file" accept="image/*" multiple data-action="portal-ar-files" style="display:none;"></label></span>
      ${AR.photos.length ? `<div class="dmg-imgs">${AR.photos.map((s,j)=>`<span style="position:relative;display:inline-block;"><img src="${safeSrc(s)}" alt=""><span data-action="portal-ar-rmimg" data-j="${j}" style="position:absolute;top:2px;left:2px;background:#fff;border-radius:50%;padding:0 6px;cursor:pointer;">✕</span></span>`).join("")}</div>` : ""}`)}
    ${sec("תיאור האירוע במלל חופשי", `<textarea data-arf="notes" rows="5" maxlength="4000" placeholder="תארו את השתלשלות האירוע במילים שלכם">${esc(f.notes||"")}</textarea>`, true)}
    ${AR.error ? `<p class="shortage">${esc(AR.error)}</p>` : ""}
    <div class="flexbar" style="gap:6px;flex-wrap:wrap;margin-top:8px;">
      <button class="btn secondary" data-action="portal-ar-preview">👁 תצוגה מקדימה</button>
      <button class="btn ok" data-action="portal-ar-send" ${AR.busy?"disabled":""}>${AR.busy?"שולח...":"📤 שליחת הדו\"ח"}</button>
    </div>
    ${AR.preview ? `<div style="margin-top:12px;">${arReportHtml(App, {report_text: arBuildText(f, session.name), worker_name: session.name, created_at: new Date().toISOString()}, AR.photos)}</div>` : ""}`;
}
function renderActionReportWorker(App, session){
  const esc = App.escapeHtml;
  if(AR.mine===null && !AR.loadingMine){ AR.loadingMine = true; App.apiRpc("worker_action_report_list", {p_token:session.token}).then(d=>{ AR.mine = d||[]; AR.loadingMine = false; App.render(); }).catch(()=>{ AR.mine = []; AR.loadingMine = false; }); }
  if(AR.view){
    if(AR.images===null && !AR.loadingImgs && AR.view.images){ AR.loadingImgs = true; App.apiRpc("action_report_images_get", {p_token:session.token, p_report_id:AR.view.id}).then(x=>{ AR.images = x||[]; AR.loadingImgs = false; App.render(); }).catch(()=>{ AR.images = []; AR.loadingImgs = false; }); }
    return `<span class="backlink" data-action="portal-ar-close">◀ חזרה</span>${arReportHtml(App, AR.view, AR.images||[])}
      <div style="margin-top:10px;"><button class="btn" data-action="portal-ar-pdf" data-who="w">📄 הפקת PDF</button></div>`;
  }
  if(AR.open && AR.f) return arFormHtml(App, session);
  const mine = AR.mine || [], draft = arLoadDraft(App);
  return `${AR.okMsg?`<p style="color:#1b7f3b;font-weight:700;">${esc(AR.okMsg)}</p>`:""}
    <p style="margin-top:0;">דוח פעולה על אירוע שטיפלת בו. רוב הדו"ח בלחיצות — הדו"ח המנוסח נבנה אוטומטית ונשלח לקב"ט ולסרגיי.</p>
    ${draft ? `<button class="btn" data-action="portal-ar-new" data-draft="1" style="margin-inline-end:6px;">📝 המשך הטיוטה שלא נשלחה</button>` : ""}
    <button class="btn" data-action="portal-ar-new">➕ דוח פעולה חדש</button>
    ${mine.length ? `<div style="margin-top:12px;"><b style="font-size:.9em;">הדוחות שלי</b>${mine.slice(0,10).map(r=>`<div class="portal-task" data-action="portal-ar-open" data-id="${r.id}"><span class="portal-task-icon">📝</span><span>${esc(dmgFmtDate(r.event_at))} · ${esc(r.event_type||"")}${r.location?` · ${esc(r.location)}`:""}</span></div>`).join("")}</div>` : ""}`;
}
function arMgrLoad(App, ms, force){
  if(AR.mgrTok !== ms.token){ AR.mgrTok = ms.token; AR.list = null; AR.listAt = 0; }
  if(AR.listLoading || (!force && AR.list && Date.now()-AR.listAt < 60000)) return;
  AR.listLoading = true;
  App.apiRpc("mgr_action_report_list", {p_token:ms.token}).then(d=>{ AR.list = d||[]; AR.listAt = Date.now(); AR.listLoading = false; App.render(); })
    .catch(()=>{ AR.listLoading = false; AR.listAt = Date.now(); });
}
function arMgrTile(App, ms){
  arMgrLoad(App, ms);
  const n = (AR.list||[]).filter(x=>!x.seen).length;
  return `<div class="team-tile" data-action="portal-pv" data-page="ar-list"${n?' style="border-color:#b42318;"':""}><div style="font-size:1.1em;font-weight:700;${n?"color:#b42318;":""}">📝 ${n?`${n} דוחות פעולה חדשים`:"דוחות פעולה"}</div><div class="muted" style="font-size:.85em;margin-top:4px;">דוחות פעולה של המאבטחים</div></div>`;
}
function renderActionReportMgrPages(App, ms, pg, a, wrap, loading, msgs){
  const esc = App.escapeHtml;
  if(pg==="ar-list"){
    arMgrLoad(App, ms);
    if(!AR.list) return loading();
    return wrap(`<h2 style="margin-top:4px;">📝 דוחות פעולה</h2>${msgs}
      ${AR.list.length ? AR.list.map(r=>`<div class="portal-task${r.seen?"":" portal-unread"}" data-action="portal-pv" data-page="ar-view" data-id="${r.id}">
        <span class="portal-task-icon">${r.seen?"📄":"🔔"}</span>
        <span><b>${esc(r.worker_name)}</b> · ${esc(r.event_type||"")} <span class="muted" style="font-size:.85em;">· ${esc(dmgFmtDate(r.event_at))}${r.branch?` · ${esc(r.branch)}`:""}</span>
        ${r.location?`<span class="muted" style="display:block;font-size:.85em;">${esc(r.location)}${r.sayvu_no?` · בסביו ${esc(r.sayvu_no)}`:""}</span>`:""}</span></div>`).join("") : `<p class="muted">אין עדיין דוחות פעולה.</p>`}`);
  }
  if(pg==="ar-view"){
    arMgrLoad(App, ms);
    if(!AR.list) return loading();
    const r = AR.list.find(x=>x.id===a.id);
    if(!r) return wrap(`<p class="muted">הדו"ח לא נמצא.</p>`);
    if(!AR.mview || AR.mview.id!==r.id){ AR.mview = r; AR.mimages = r.images ? null : []; }
    if(!r.seen){ r.seen = true; App.apiRpc("mgr_action_report_seen", {p_token:ms.token, p_id:r.id}).catch(()=>{}); }
    if(AR.mimages===null && !AR.mloadingImgs){ AR.mloadingImgs = true; App.apiRpc("action_report_images_get", {p_token:ms.token, p_report_id:r.id}).then(x=>{ AR.mimages = x||[]; AR.mloadingImgs = false; App.render(); }).catch(()=>{ AR.mimages = []; AR.mloadingImgs = false; }); }
    return wrap(`${arReportHtml(App, r, AR.mimages||[])}
      <div class="row" style="margin-top:10px;flex-wrap:wrap;gap:6px;"><button class="btn" data-action="portal-ar-pdf" data-who="m">📄 הפקת PDF</button>
        <button class="btn secondary" data-action="portal-ar-copy">📋 העתקת הדו"ח</button></div>${msgs}`);
  }
  return null;
}
async function arMakePdf(App, r, images){
  await loadHtml2Pdf();
  const box = document.createElement("div");
  box.dir = "rtl"; box.style.cssText = "position:fixed;left:-10000px;top:0;width:760px;background:#fff;color:#111;font-family:Arial,sans-serif;padding:18px;";
  box.innerHTML = `<style>${AR_CSS} .ar-doc{border:none;padding:0;font-size:14px;} .dmg-imgs{display:flex;flex-wrap:wrap;gap:6px;} .dmg-imgs img{width:230px;height:auto;max-height:230px;object-fit:contain;border:1px solid #ccc;page-break-inside:avoid;}</style>
    ${App.logoStripHtml ? App.logoStripHtml(50) : ""}${arReportHtml(App, r, images)}`;
  document.body.appendChild(box);
  const nm = String(r.worker_name||"").replace(/\s+/g,"-"), dt = locDay(App, r.event_at);
  try{
    await window.html2pdf().set({margin:[10,8,10,8], filename:`דוח-פעולה-${nm}-${dt}.pdf`, image:{type:"jpeg", quality:0.92},
      html2canvas:{scale:2, useCORS:true}, jsPDF:{unit:"mm", format:"a4", orientation:"portrait"}, pagebreak:{mode:["css","legacy"]}}).from(box).save();
  } finally { box.remove(); }
}
async function arAction(App, a, el){
  const S = App.S;
  if(a==="portal-ar-pdf"){
    const r = el.dataset.who==="w" ? AR.view : AR.mview; if(!r) return;
    const imgs = el.dataset.who==="w" ? (AR.images||[]) : (AR.mimages||[]);
    const old = el.textContent; el.textContent = "מכין PDF..."; el.disabled = true;
    try{ await arMakePdf(App, r, imgs); el.textContent = old; }
    catch(e){ el.textContent = "⚠️ הפקת ה-PDF נכשלה — נסו שוב"; setTimeout(()=>{ el.textContent = old; }, 4000); }
    el.disabled = false; return;
  }
  if(a==="portal-ar-copy"){ const r = AR.mview; if(r && navigator.clipboard) navigator.clipboard.writeText(r.report_text).then(()=>{ PV.msg = "הדו\"ח הועתק."; App.render(); }).catch(()=>{}); return; }
  const session = loadSession(App); if(!session) return;
  if(a==="portal-ar-new"){ AR.f = el.dataset.draft ? (arLoadDraft(App) || arNewForm()) : arNewForm(); if(!el.dataset.draft) arClearDraft(App); AR.photos = []; AR.open = true; AR.error = null; AR.okMsg = null; AR.preview = false; window.scrollTo(0,0); return App.render(); }
  if(a==="portal-ar-close"){ if(AR.open) arSync(App); AR.open = false; AR.view = null; AR.images = null; AR.error = null; return App.render(); }
  if(a==="portal-ar-open"){ AR.view = (AR.mine||[]).find(x=>x.id===el.dataset.id) || null; AR.images = null; return App.render(); }
  if(a==="portal-ar-chip"){
    arSync(App); const k = el.dataset.k, v = el.dataset.v, f = AR.f;
    if(AR_MULTI[k]){ const l = f[k] = f[k] || []; const i = l.indexOf(v); if(i>=0) l.splice(i,1); else l.push(v); }
    else f[k] = f[k]===v && !["mda","police","body","prop"].includes(k) ? null : v;
    AR.error = null; arSaveDraft(App); return App.render();
  }
  if(a==="portal-ar-rmimg"){ arSync(App); AR.photos.splice(Number(el.dataset.j), 1); return App.render(); }
  if(a==="portal-ar-preview"){ arSync(App); AR.preview = !AR.preview; return App.render(); }
  if(a==="portal-ar-send"){
    if(AR.busy) return;
    arSync(App); const f = AR.f;
    const miss = [];
    if(!f.date || !f.time) miss.push("תאריך ושעה");
    if(!/^\d{6}$/.test((f.sayvu||"").trim())) miss.push("מס׳ אירוע בסביו (6 ספרות בדיוק)");
    if(!(f.location||"").trim()) miss.push("כתובת / מיקום");
    if(!f.type || (f.type==="אחר" && !(f.typeOther||"").trim())) miss.push("סוג האירוע");
    if(!f.source) miss.push("איך התקבל האירוע");
    if(f.prop==="נגרם נזק לרכוש" && !(f.propDesc||"").trim()) miss.push("תיאור הנזק לרכוש");
    if(!(f.notes||"").trim()) miss.push("תיאור האירוע במלל חופשי");
    if(miss.length){ AR.error = "חסר: " + miss.join(", "); return App.render(); }
    const text = arBuildText(f, session.name);
    AR.busy = true; AR.error = null; App.render();
    try{
      const evAt = new Date(`${f.date}T${f.time}`).toISOString();
      const id = await App.apiRpc("worker_action_report_create", {p_token:session.token, p:{event_at:evAt, sayvu_no:f.sayvu||null, location:f.location,
        event_type: f.type==="אחר" ? (f.typeOther||"אחר").trim() : f.type, data:f, report_text:text}});
      let failed = 0;
      for(const ph of AR.photos){ try{ await App.apiRpc("worker_action_report_add_image", {p_token:session.token, p_report_id:id, p_data:ph}); }catch(e){ failed++; } }
      arClearDraft(App);
      AR.busy = false; AR.open = false; AR.f = null; AR.photos = []; AR.mine = null; AR.preview = false;
      AR.okMsg = "✔ הדו\"ח נשלח לקב\"ט ולסרגיי." + (failed ? ` (${failed} תמונות לא עלו)` : "");
      window.scrollTo(0,0); return App.render();
    }catch(e){ AR.busy = false; AR.error = e.message; return App.render(); }
  }
}
async function arFiles(App, t){
  arSync(App);
  const files = [...(t.files||[])]; t.value = "";
  for(const f of files){
    if(AR.photos.length >= 8){ AR.error = "אפשר עד 8 תמונות"; break; }
    try{ AR.photos.push(await compressImage(f)); AR.error = null; }catch(err){ AR.error = err.message; }
  }
  App.render();
}
const AR_CSS = `
  .ar-sec{border:1px solid var(--border,#d6dde6);border-radius:10px;padding:10px;margin:8px 0;background:#fafbfc;}
  .ar-sec-h{font-weight:700;margin-bottom:6px;} .ar-req{color:#b42318;font-weight:700;}
  .ar-sub{font-size:.88em;color:#4b5563;margin:8px 0 4px;}
  .ar-chips{display:flex;flex-wrap:wrap;gap:6px;}
  .ar-time{max-width:180px;}
  .ar-chip{border:1.5px solid #c9d4e2;background:#fff;border-radius:999px;padding:6px 12px;cursor:pointer;font-size:.92em;user-select:none;line-height:1.25;}
  .ar-chip.on{background:#1f4e8c;border-color:#1f4e8c;color:#fff;font-weight:600;}
  .ar-doc{border:1px solid var(--border,#d6dde6);border-radius:10px;padding:14px 16px;background:#fff;line-height:1.65;}
  .ar-h1{margin:0 0 4px;text-align:center;text-decoration:underline;font-size:1.25em;}
  .ar-h{font-weight:800;margin-top:6px;text-decoration:underline;}
  .ar-gap{height:6px;} .ar-ul{margin:2px 0;padding-inline-start:22px;}
  .ar-meta{margin-top:10px;font-size:.82em;color:#6b7280;border-top:1px solid #eee;padding-top:6px;}
`;

/* ================================================================
   בקשה מנהלתית (2026-10-20, סרגיי): מאבטחים ומוקדנים מגישים בקשה לחופשה / יציאה למילואים / מחלה,
   עם טווח תאריכים ומסמכים לפי הייעוד (מילואים: צו מילואים וטופס 3010 בנפרד; מחלה: אישור מחלה; חופשה: מסמך
   תומך אם יש). אפשר להוסיף מסמכים גם אחרי השליחה (למשל 3010 בסוף המילואים). הבקשה נשלחת לקב"ט של הגזרה
   ולסרגיי (מוקד - לסרגיי), שמאשרים או דוחים, והעובד מקבל התראה. השרת: worker_admin_req_create / _add_file /
   _list, mgr_admin_req_list / _seen / _resolve, admin_req_files_get.
   ================================================================ */
const AREQ = { open:false, form:null, files:{}, busy:false, msg:null, error:null, okMsg:null, mine:null, view:null, vfiles:null,
  list:null, listAt:0, mview:null, mfiles:null };
const AREQ_KINDS = { vacation:{label:"חופשה", icon:"🏖️", sub:"בקשה לימי חופשה"}, reserve:{label:"מילואים", icon:"🪖", sub:"יציאה למילואים — צו מילואים ו-3010"}, sick:{label:"מחלה", icon:"🤒", sub:"ימי מחלה — אישור מחלה"} };
const AREQ_DOCS = { vacation:[["vacation_doc","מסמך תומך (אם יש)"]],
  reserve:[["reserve_order","צו מילואים"],["form3010","טופס 3010 (אישור על שירות מילואים)"]],
  sick:[["sick_note","אישור מחלה"]] };
const AREQ_DOCNAME = { vacation_doc:"מסמך תומך", reserve_order:"צו מילואים", form3010:"טופס 3010", sick_note:"אישור מחלה", other:"מסמך" };
const AREQ_STATUS = { pending:"⏳ ממתינה לאישור", approved:"✅ אושרה", rejected:"❌ נדחתה", cancelled:"🚫 בוטלה ע\"י העובד" };
function areqDates(r){ const f = d=>{ const [y,m,dd] = String(d||"").split("-"); return `${dd}/${m}/${y}`; }; return r.date_from===r.date_to ? f(r.date_from) : `${f(r.date_from)} – ${f(r.date_to)}`; }
function areqDays(r){ return Math.round((new Date(r.date_to) - new Date(r.date_from)) / 864e5) + 1; }
function areqFilesSummary(r){ const f = r.files||{}; const ks = Object.keys(f); return ks.length ? ks.map(k=>`${AREQ_DOCNAME[k]||k}${f[k]>1?` ×${f[k]}`:""}`).join(", ") : "אין מסמכים"; }
async function areqReadFile(file){
  if(file.type==="application/pdf"){
    if(file.size > 4.5*1024*1024) throw new Error("קובץ PDF גדול מדי (עד 4.5MB)");
    return await new Promise((res, rej)=>{ const fr = new FileReader(); fr.onload = ()=>res(fr.result); fr.onerror = ()=>rej(new Error("לא הצלחתי לקרוא את הקובץ")); fr.readAsDataURL(file); });
  }
  return compressImage(file);
}
// data: לא נפתח בלשונית חדשה בכרום - ממירים ל-blob: לצפייה/הורדה
const AREQ_BLOBS = new Map();
function areqBlobUrl(src){
  if(AREQ_BLOBS.has(src)) return AREQ_BLOBS.get(src);
  try{ const [h, b] = src.split(","); const mime = (h.match(/data:([^;]+)/)||[])[1] || "application/octet-stream";
    const bin = atob(b); const u = new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([u], {type:mime})); AREQ_BLOBS.set(src, url); return url; }catch(e){ return safeSrc(src); }
}
function areqThumb(src, rm){
  const isPdf = String(src).startsWith("data:application/pdf");
  return `<span class="areq-file">${isPdf ? `<a href="${areqBlobUrl(src)}" target="_blank" class="areq-pdf">📄 PDF</a>` : `<a href="${areqBlobUrl(src)}" target="_blank"><img src="${safeSrc(src)}" alt=""></a>`}${rm||""}</span>`;
}
function areqPick(action, kind){
  return `<span class="dmg-pick">
    <label class="btn secondary small" style="cursor:pointer;">📷 צילום<input type="file" accept="image/*" capture="environment" data-action="${action}" data-kind="${kind}" style="display:none;"></label>
    <label class="btn secondary small" style="cursor:pointer;">🖼️ תמונה / PDF<input type="file" accept="image/*,application/pdf" multiple data-action="${action}" data-kind="${kind}" style="display:none;"></label></span>`;
}
function areqDocsHtml(App, files){
  const by = {}; (files||[]).forEach(f=>{ (by[f.kind] = by[f.kind]||[]).push(f); });
  const ks = Object.keys(by);
  if(!ks.length) return `<p class="muted">לא צורפו מסמכים.</p>`;
  return ks.map(k=>`<div style="margin-top:8px;"><b>${AREQ_DOCNAME[k]||k}</b><div class="dmg-imgs">${by[k].map(f=>areqThumb(f.data)).join("")}</div></div>`).join("");
}
function areqDetailsTable(App, r){
  const esc = App.escapeHtml, k = AREQ_KINDS[r.kind]||{label:r.kind, icon:"📝"};
  const rows = [["עובד", r.worker_name], ["סוג הבקשה", `${k.icon} ${k.label}`], ["תאריכים", `${areqDates(r)} (${areqDays(r)} ימים)`], ["הערה", r.note||""],
    ["שינוי תאריכים", r.prev_date_from ? `היה: ${areqDates({date_from:r.prev_date_from, date_to:r.prev_date_to})}${r.changed_at?" · שונה "+dmgFmtDate(r.changed_at):""}` : ""],
    ["סטטוס", AREQ_STATUS[r.status]||r.status], ["בוטלה", r.cancelled_at ? dmgFmtDate(r.cancelled_at) : ""], ["טופל ע\"י", r.handled_by_name ? `${r.handled_by_name}${r.handled_at?" · "+dmgFmtDate(r.handled_at):""}` : ""], ["תשובת המנהל", r.mgr_note||""], ["הוגשה", dmgFmtDate(r.created_at)]];
  return `<table class="dmg-table">${rows.filter(x=>x[1]).map(([l,v])=>`<tr><th>${l}</th><td style="white-space:pre-wrap;">${esc(v)}</td></tr>`).join("")}</table>`;
}
function areqLoadMine(App, session){
  if(AREQ.mine!==null || AREQ.loadingMine) return;
  AREQ.loadingMine = true;
  App.apiRpc("worker_admin_req_list", {p_token:session.token}).then(d=>{ AREQ.mine = d||[]; AREQ.loadingMine = false; App.render(); })
    .catch(e=>{ AREQ.loadingMine = false; AREQ.mine = []; AREQ.error = e.message; App.render(); });
}
function renderAdminReqWorker(App, session){
  const esc = App.escapeHtml;
  areqLoadMine(App, session);
  const moked = isMokedWorker(App, session);
  if(AREQ.view){
    const r = AREQ.view;
    if(AREQ.vfiles===null && !AREQ.vloading){ AREQ.vloading = true; App.apiRpc("admin_req_files_get", {p_token:session.token, p_req:r.id}).then(x=>{ AREQ.vfiles = x||[]; AREQ.vloading = false; App.render(); }).catch(()=>{ AREQ.vfiles = []; AREQ.vloading = false; App.render(); }); }
    return `<span class="backlink" data-action="portal-areq-close">◀ חזרה לבקשות שלי</span>
      <h3 style="margin:8px 0;">${(AREQ_KINDS[r.kind]||{}).icon||"📝"} בקשה ל${esc((AREQ_KINDS[r.kind]||{}).label||"")}</h3>
      ${areqDetailsTable(App, r)}
      ${areqWorkerChangeHtml(App, r)}
      <h4 style="margin:14px 0 4px;">📎 מסמכים</h4>
      ${AREQ.vfiles===null ? `<p class="muted">טוען...</p>` : areqDocsHtml(App, AREQ.vfiles)}
      ${r.status!=="rejected" && r.status!=="cancelled" ? `<div class="dmg-sub" style="margin-top:10px;"><b>➕ הוספת מסמך</b>${r.kind==="reserve"?`<p class="muted" style="margin:4px 0;">את טופס 3010 מוסיפים כאן בסוף המילואים.</p>`:""}
        ${(AREQ_DOCS[r.kind]||[]).map(([dk,dl])=>`<div style="margin-top:6px;"><span style="font-weight:600;">${dl}</span> ${areqPick("portal-areq-addfile", dk)}</div>`).join("")}</div>` : ""}
      ${AREQ.busy ? `<p class="muted">${esc(AREQ.msg||"מעלה...")}</p>` : ""}${AREQ.error?`<p class="shortage">${esc(AREQ.error)}</p>`:""}${AREQ.okMsg?`<p style="color:#1b7f3b;font-weight:700;">${esc(AREQ.okMsg)}</p>`:""}`;
  }
  if(!AREQ.open){
    const mine = AREQ.mine;
    return `${AREQ.okMsg?`<p style="color:#1b7f3b;font-weight:700;">${esc(AREQ.okMsg)}</p>`:""}
      <p style="margin-top:0;">בקשה לחופשה, יציאה למילואים או ימי מחלה — עם תאריכים ומסמכים. הבקשה נשלחת ${moked?"לסרגיי":"לקב\"ט ולסרגיי"}, ותקבלו התראה כשהיא מאושרת.</p>
      <button class="btn" data-action="portal-areq-new">➕ בקשה חדשה</button>
      <h3 style="margin:16px 0 6px;">הבקשות שלי</h3>
      ${mine===null ? `<p class="muted">טוען...</p>` : (mine.length ? mine.map(r=>`<div class="portal-task" data-action="portal-areq-open" data-id="${r.id}">
        <span class="portal-task-icon">${(AREQ_KINDS[r.kind]||{}).icon||"📝"}</span>
        <span><b>${esc((AREQ_KINDS[r.kind]||{}).label||"")}</b> · ${esc(areqDates(r))} · ${esc(AREQ_STATUS[r.status]||"")}
        <span class="muted" style="display:block;font-size:.85em;">📎 ${esc(areqFilesSummary(r))}${r.mgr_note?` · ${esc(r.mgr_note)}`:""}</span></span></div>`).join("") : `<p class="muted">עדיין לא הגשת בקשות.</p>`)}
      ${AREQ.error?`<p class="shortage">${esc(AREQ.error)}</p>`:""}`;
  }
  const f = AREQ.form || {};
  if(!f.kind) return `<span class="backlink" data-action="portal-areq-cancel">◀ ביטול</span>
    <h3 style="margin-top:6px;">מה הבקשה?</h3>
    <div class="grid-teams">${Object.keys(AREQ_KINDS).map(k=>`<div class="team-tile" data-action="portal-areq-kind" data-k="${k}"><div style="font-size:1.15em;font-weight:700;">${AREQ_KINDS[k].icon} ${AREQ_KINDS[k].label}</div><div class="muted" style="font-size:.85em;margin-top:4px;">${AREQ_KINDS[k].sub}</div></div>`).join("")}</div>`;
  const today = App.fmtDate(new Date());
  return `<span class="backlink" data-action="portal-areq-cancel">◀ ביטול</span>
    <h3 style="margin-top:6px;">${AREQ_KINDS[f.kind].icon} בקשה ל${AREQ_KINDS[f.kind].label} <span class="backlink" data-action="portal-areq-kind" data-k="" style="font-size:.7em;font-weight:400;">שינוי סוג</span></h3>
    <div class="dmg-pfields">
      <div class="field"><label>מתאריך</label><input type="date" id="areq_from" value="${esc(f.date_from||today)}"></div>
      <div class="field"><label>עד תאריך (כולל)</label><input type="date" id="areq_to" value="${esc(f.date_to||f.date_from||today)}"></div>
    </div>
    <div class="field"><label>הערה (לא חובה)</label><textarea id="areq_note" rows="2">${esc(f.note||"")}</textarea></div>
    <h3 style="margin:14px 0 6px;">📎 מסמכים</h3>
    ${(AREQ_DOCS[f.kind]||[]).map(([dk,dl])=>`<div class="dmg-sub"><b>${dl}</b> ${areqPick("portal-areq-files", dk)}
      ${(AREQ.files[dk]||[]).length ? `<div class="dmg-imgs">${(AREQ.files[dk]||[]).map((src,j)=>areqThumb(src, `<span data-action="portal-areq-rmfile" data-kind="${dk}" data-j="${j}" class="areq-rm">✕</span>`)).join("")}</div>` : ""}</div>`).join("")}
    ${f.kind==="reserve" ? `<p class="muted" style="font-size:.88em;">אין עדיין 3010? אפשר לשלוח עכשיו ולהוסיף אותו אחר כך מתוך הבקשה.</p>` : ""}
    ${f.kind==="sick" ? `<p class="muted" style="font-size:.88em;">אין עדיין אישור מחלה? אפשר לשלוח עכשיו ולהוסיף אותו אחר כך מתוך הבקשה.</p>` : ""}
    <div style="margin-top:14px;"><button class="btn ok" data-action="portal-areq-send" ${AREQ.busy?"disabled":""} style="font-size:1.05em;padding:10px 20px;">${AREQ.busy?esc(AREQ.msg||"שולח..."):"✔ שליחת הבקשה"}</button></div>
    ${AREQ.error?`<p class="shortage">${esc(AREQ.error)}</p>`:""}`;
}
/* (2026-10-25, סרגיי) העובד יכול לבטל בקשה או לשנות את התאריכים - גם אחרי שנשלחה וגם אחרי שאושרה.
   ביטול לא מוחק את הבקשה (היא נשארת עם סטטוס "בוטלה"); שינוי תאריכים מחזיר אותה לאישור הקב"ט. השרת: worker_admin_req_cancel / _update. */
function areqWorkerChangeHtml(App, r){
  const esc = App.escapeHtml;
  if(r.status!=="pending" && r.status!=="approved") return "";
  if(AREQ.edit===r.id) return `<div class="dmg-sub" style="margin-top:10px;"><b>📅 שינוי תאריכים</b>
      <div class="dmg-pfields">
        <div class="field"><label>מתאריך</label><input type="date" id="areq_efrom" value="${esc(r.date_from)}"></div>
        <div class="field"><label>עד תאריך (כולל)</label><input type="date" id="areq_eto" value="${esc(r.date_to)}"></div>
      </div>
      <div class="field"><label>הערה (לא חובה)</label><textarea id="areq_enote" rows="2">${esc(r.note||"")}</textarea></div>
      ${r.status==="approved" ? `<p class="muted" style="margin:4px 0;font-size:.88em;">הבקשה כבר אושרה — אחרי שינוי התאריכים היא תחזור לאישור הקב"ט.</p>` : ""}
      <div class="row"><button class="btn ok" data-action="portal-areq-edit-save" ${AREQ.busy?"disabled":""}>✔ שמירת התאריכים</button>
      <button class="btn secondary" data-action="portal-areq-edit-close">ביטול</button></div></div>`;
  if(AREQ.delAsk===r.id) return `<div class="note-box" style="margin-top:10px;border-color:#b42318;background:#fff7f6;">
      <b>🚫 לבטל את הבקשה ל${esc((AREQ_KINDS[r.kind]||{}).label||"")} (${esc(areqDates(r))})?</b>
      <p class="muted" style="margin:4px 0;">הקב"ט יקבל הודעה שהבקשה בוטלה. הבקשה והמסמכים נשמרים בהיסטוריה.</p>
      <div class="row"><button class="btn danger" data-action="portal-areq-del-go" ${AREQ.busy?"disabled":""}>כן, לבטל את הבקשה</button>
      <button class="btn secondary" data-action="portal-areq-del-no">לא</button></div></div>`;
  return `<div class="row" style="margin-top:10px;">
      <button class="btn secondary" data-action="portal-areq-edit">📅 שינוי תאריכים</button>
      <button class="btn secondary" data-action="portal-areq-del-ask" style="color:#b42318;border-color:#f3c4c0;">🚫 ביטול הבקשה</button></div>`;
}
function areqCollect(){
  const v = id=>{ const x = document.getElementById(id); return x ? x.value : undefined; };
  if(!AREQ.form) return;
  const fr = v("areq_from"), to = v("areq_to"), nt = v("areq_note");
  if(fr!==undefined) AREQ.form.date_from = fr; if(to!==undefined) AREQ.form.date_to = to; if(nt!==undefined) AREQ.form.note = nt;
}
async function areqAction(App, a, el){
  const session = loadSession(App);
  if(a==="portal-areq-new"){ AREQ.open = true; AREQ.form = {}; AREQ.files = {}; AREQ.error = null; AREQ.okMsg = null; AREQ.view = null; return App.render(); }
  if(a==="portal-areq-cancel"){ AREQ.open = false; AREQ.form = null; AREQ.files = {}; AREQ.error = null; return App.render(); }
  if(a==="portal-areq-kind"){ areqCollect(); AREQ.form = Object.assign({}, AREQ.form, {kind: el.dataset.k || null}); AREQ.files = {}; AREQ.error = null; return App.render(); }
  if(a==="portal-areq-rmfile"){ areqCollect(); (AREQ.files[el.dataset.kind]||[]).splice(Number(el.dataset.j),1); return App.render(); }
  if(a==="portal-areq-open"){ AREQ.view = (AREQ.mine||[]).find(x=>x.id===el.dataset.id) || null; AREQ.vfiles = null; AREQ.error = null; AREQ.okMsg = null; return App.render(); }
  if(a==="portal-areq-close"){ AREQ.view = null; AREQ.vfiles = null; AREQ.error = null; AREQ.okMsg = null; AREQ.edit = null; AREQ.delAsk = null; return App.render(); }
  if(a==="portal-areq-edit"){ AREQ.edit = AREQ.view && AREQ.view.id; AREQ.delAsk = null; AREQ.error = null; AREQ.okMsg = null; return App.render(); }
  if(a==="portal-areq-edit-close"){ AREQ.edit = null; AREQ.error = null; return App.render(); }
  if(a==="portal-areq-del-ask"){ AREQ.delAsk = AREQ.view && AREQ.view.id; AREQ.edit = null; AREQ.error = null; AREQ.okMsg = null; return App.render(); }
  if(a==="portal-areq-del-no"){ AREQ.delAsk = null; return App.render(); }
  if(a==="portal-areq-edit-save" || a==="portal-areq-del-go"){
    const r = AREQ.view; if(!session || !r || AREQ.busy) return;
    let args, fn;
    if(a==="portal-areq-edit-save"){
      const v = id=>(document.getElementById(id)||{}).value;
      const fr = v("areq_efrom"), to = v("areq_eto"), nt = v("areq_enote");
      if(!fr || !to){ AREQ.error = "בחרו תאריכים"; return App.render(); }
      if(to < fr){ AREQ.error = "תאריך הסיום לפני תאריך ההתחלה"; return App.render(); }
      fn = "worker_admin_req_update"; args = {p_token:session.token, p_req:r.id, p_from:fr, p_to:to, p_note:nt==null?null:nt};
    } else { fn = "worker_admin_req_cancel"; args = {p_token:session.token, p_req:r.id}; }
    AREQ.busy = true; AREQ.error = null; App.render();
    try{
      await App.apiRpc(fn, args);
      const changed = a==="portal-areq-edit-save" && (args.p_from!==r.date_from || args.p_to!==r.date_to);
      AREQ.busy = false; AREQ.edit = null; AREQ.delAsk = null; AREQ.view = null; AREQ.vfiles = null; AREQ.mine = null;
      AREQ.okMsg = a==="portal-areq-del-go" ? "✔ הבקשה בוטלה — הקב\"ט קיבל הודעה." : changed ? "✔ התאריכים עודכנו — הבקשה נשלחה שוב לאישור הקב\"ט." : "✔ נשמר.";
    }catch(e){ AREQ.busy = false; AREQ.error = e.message; }
    return App.render();
  }
  if(a==="portal-areq-send"){
    if(!session || AREQ.busy) return;
    areqCollect(); const f = AREQ.form || {};
    if(!f.kind){ AREQ.error = "בחרו סוג בקשה"; return App.render(); }
    if(!f.date_from || !f.date_to){ AREQ.error = "בחרו תאריכים"; return App.render(); }
    if(f.date_to < f.date_from){ AREQ.error = "תאריך הסיום לפני תאריך ההתחלה"; return App.render(); }
    AREQ.busy = true; AREQ.error = null; AREQ.msg = "שולח..."; App.render();
    try{
      const id = await App.apiRpc("worker_admin_req_create", {p_token:session.token, p:{kind:f.kind, date_from:f.date_from, date_to:f.date_to, note:f.note||""}});
      const ups = []; Object.keys(AREQ.files).forEach(k=>(AREQ.files[k]||[]).forEach(src=>ups.push({k, src})));
      let failed = 0;
      for(let i=0;i<ups.length;i++){
        AREQ.msg = `מעלה מסמך ${i+1}/${ups.length}...`; App.render();
        try{ await App.apiRpc("worker_admin_req_add_file", {p_token:session.token, p_req:id, p_kind:ups[i].k, p_file:ups[i].src}); }catch(e){ failed++; }
      }
      AREQ.busy = false; AREQ.open = false; AREQ.form = null; AREQ.files = {}; AREQ.mine = null; AREQ.msg = null;
      AREQ.okMsg = "✔ הבקשה נשלחה." + (failed ? ` ${failed} מסמכים לא עלו — אפשר להוסיף אותם מתוך הבקשה.` : "");
      return App.render();
    }catch(e){ AREQ.busy = false; AREQ.msg = null; AREQ.error = e.message; return App.render(); }
  }
}
async function areqOnChange(App, t){
  const a = t.dataset.action;
  const files = [...(t.files||[])]; const kind = t.dataset.kind; t.value = "";
  if(a==="portal-areq-files"){
    areqCollect();
    for(const fl of files){
      const n = Object.values(AREQ.files).reduce((m,l)=>m+l.length,0);
      if(n >= 20){ AREQ.error = "אפשר עד 20 קבצים לבקשה"; break; }
      try{ const d = await areqReadFile(fl); (AREQ.files[kind] = AREQ.files[kind]||[]).push(d); AREQ.error = null; }catch(err){ AREQ.error = err.message; }
    }
    return App.render();
  }
  if(a==="portal-areq-addfile"){
    const session = loadSession(App); const r = AREQ.view; if(!session || !r) return;
    AREQ.busy = true; AREQ.error = null; AREQ.okMsg = null;
    let ok = 0;
    for(let i=0;i<files.length;i++){
      AREQ.msg = `מעלה ${i+1}/${files.length}...`; App.render();
      try{ const d = await areqReadFile(files[i]); await App.apiRpc("worker_admin_req_add_file", {p_token:session.token, p_req:r.id, p_kind:kind, p_file:d}); ok++; }
      catch(err){ AREQ.error = err.message; }
    }
    AREQ.busy = false; AREQ.msg = null; AREQ.vfiles = null; AREQ.mine = null;
    if(ok) AREQ.okMsg = `✔ ${AREQ_DOCNAME[kind]||"המסמך"} נוסף לבקשה.`;
    return App.render();
  }
}
/* ממשק המנהל: קב"ט (הגזרות שלו) וסרגיי (הכל) */
function areqMgrLoad(App, ms, force){
  if(AREQ.mgrTok !== ms.token){ AREQ.mgrTok = ms.token; AREQ.list = null; AREQ.listAt = 0; }
  if(AREQ.listLoading || (!force && AREQ.list && Date.now()-AREQ.listAt < 60000)) return;
  AREQ.listLoading = true;
  App.apiRpc("mgr_admin_req_list", {p_token:ms.token}).then(d=>{ AREQ.list = d||[]; AREQ.listAt = Date.now(); AREQ.listLoading = false; App.render(); })
    .catch(()=>{ AREQ.listLoading = false; AREQ.listAt = Date.now(); });
}
function areqMgrTile(App, ms){
  areqMgrLoad(App, ms);
  const L2 = AREQ.list||[]; const pend = L2.filter(r=>r.status==="pending").length, unseen = L2.filter(r=>!r.seen).length;
  return `<div class="team-tile" data-action="portal-pv" data-page="areq-list"${pend?' style="border-color:#b42318;"':""}><div style="font-size:1.1em;font-weight:700;${pend?"color:#b42318;":""}">📝 ${pend?`${pend} בקשות ממתינות`:"בקשות מנהלתיות"}</div><div class="muted" style="font-size:.85em;margin-top:4px;">חופשה / מילואים / מחלה${unseen?` · ${unseen} חדשות`:""}</div></div>`;
}
function renderAdminReqMgrPages(App, ms, pg, a, wrap, loading, msgs){
  const esc = App.escapeHtml;
  if(pg==="areq-list"){
    areqMgrLoad(App, ms);
    if(!AREQ.list) return loading();
    const row = r=>`<div class="portal-task${r.seen?"":" portal-unread"}" data-action="portal-pv" data-page="areq-view" data-id="${r.id}">
      <span class="portal-task-icon">${(AREQ_KINDS[r.kind]||{}).icon||"📝"}</span>
      <span><b>${esc(r.worker_name)}</b> · ${esc((AREQ_KINDS[r.kind]||{}).label||"")} · ${esc(areqDates(r))} (${areqDays(r)} ימים) · ${esc(AREQ_STATUS[r.status]||"")}${r.prev_date_from && r.status==="pending" ? ` · <b style="color:#b45309;">📅 העובד שינה תאריכים</b>` : ""}
      <span class="muted" style="display:block;font-size:.85em;">📎 ${esc(areqFilesSummary(r))}${r.note?` · ${esc(r.note.slice(0,80))}`:""}</span></span></div>`;
    const pend = AREQ.list.filter(r=>r.status==="pending"), done = AREQ.list.filter(r=>r.status!=="pending");
    return wrap(`<h2 style="margin-top:4px;">📝 בקשות מנהלתיות</h2>${msgs}
      <h3 style="margin:10px 0 4px;">ממתינות (${pend.length})</h3>${pend.length ? pend.map(row).join("") : `<p class="muted">אין בקשות ממתינות.</p>`}
      ${done.length ? `<h3 style="margin:14px 0 4px;">טופלו</h3>${done.slice(0,60).map(row).join("")}` : ""}`);
  }
  if(pg==="areq-view"){
    areqMgrLoad(App, ms);
    if(!AREQ.list) return loading();
    const r = AREQ.list.find(x=>x.id===a.id);
    if(!r) return wrap(`<p class="muted">הבקשה לא נמצאה.</p>`);
    if(!AREQ.mview || AREQ.mview.id!==r.id){ AREQ.mview = r; AREQ.mfiles = null; }
    if(!r.seen){ r.seen = true; App.apiRpc("mgr_admin_req_seen", {p_token:ms.token, p_req:r.id}).catch(()=>{}); }
    if(AREQ.mfiles===null && !AREQ.mloading){ AREQ.mloading = true; App.apiRpc("admin_req_files_get", {p_token:ms.token, p_req:r.id}).then(x=>{ AREQ.mfiles = x||[]; AREQ.mloading = false; App.render(); }).catch(()=>{ AREQ.mfiles = []; AREQ.mloading = false; App.render(); }); }
    return wrap(`<h2 style="margin-top:4px;">${(AREQ_KINDS[r.kind]||{}).icon||"📝"} בקשה ל${esc((AREQ_KINDS[r.kind]||{}).label||"")} — ${esc(r.worker_name)}</h2>
      ${areqDetailsTable(App, r)}
      <h4 style="margin:14px 0 4px;">📎 מסמכים</h4>${AREQ.mfiles===null ? `<p class="muted">טוען...</p>` : areqDocsHtml(App, AREQ.mfiles)}
      ${r.kind==="reserve" && !(r.files||{}).form3010 ? `<p class="muted" style="font-size:.88em;">טופס 3010 עדיין לא צורף — העובד יכול להוסיף אותו מתוך הבקשה, ותקבלו התראה.</p>` : ""}
      ${r.status==="cancelled" ? `<p class="note-box" style="margin-top:12px;">🚫 העובד ביטל את הבקשה הזו${r.cancelled_at?" ב-"+esc(dmgFmtDate(r.cancelled_at)):""}. אין צורך לטפל בה.</p>${msgs}` : `
      ${r.prev_date_from && r.status==="pending" ? `<p class="note-box" style="margin-top:12px;border-color:#e0a800;">📅 העובד שינה את התאריכים: היה ${esc(areqDates({date_from:r.prev_date_from, date_to:r.prev_date_to}))}, עכשיו ${esc(areqDates(r))}. צריך לאשר מחדש.</p>` : ""}
      <div class="field" style="margin-top:12px;"><label>תשובה לעובד (לא חובה)</label><textarea id="areq_mgr_note" rows="2">${esc(r.mgr_note||"")}</textarea></div>
      <div class="row">
        <button class="btn ok" data-action="portal-areq-resolve" data-id="${r.id}" data-s="approved" ${PV.busy?"disabled":""}>✅ אישור</button>
        <button class="btn danger" data-action="portal-areq-resolve" data-id="${r.id}" data-s="rejected" ${PV.busy?"disabled":""}>❌ דחייה</button>
        ${r.status!=="pending" ? `<button class="btn secondary" data-action="portal-areq-resolve" data-id="${r.id}" data-s="pending" ${PV.busy?"disabled":""}>↩ החזרה להמתנה</button>` : ""}
      </div>${msgs}`}`);
  }
  return null;
}
async function areqResolve(App, el){
  const ms = loadMgr(App); if(!ms || PV.busy) return;
  const note = (document.getElementById("areq_mgr_note")||{}).value || "";
  PV.busy = true; PV.error = null; PV.msg = null; App.render();
  try{
    await App.apiRpc("mgr_admin_req_resolve", {p_token:ms.token, p_req:el.dataset.id, p_status:el.dataset.s, p_note:note});
    PV.busy = false; AREQ.list = null; AREQ.mview = null;
    PV.msg = el.dataset.s==="approved" ? "הבקשה אושרה — העובד קיבל התראה." : el.dataset.s==="rejected" ? "הבקשה נדחתה — העובד קיבל התראה." : "הבקשה הוחזרה להמתנה.";
  }catch(e){ PV.busy = false; PV.error = e.message; }
  App.render();
}
/* ציוד אישי לעובדים (2026-10-21, סרגיי): הקב"ט מזין ומעדכן את רשימת הציוד של כל מאבטח בגזרות שלו (סרגיי - בכולן).
   המאבטח רק רואה את הרשימה ושולח בקשות החלפה/ציוד נוסף. השרת: mgr_equipment_workers, mgr_worker_equipment_get / _save. */
const EQM = { workers:null, at:0, tok:null, items:null, edit:null, busy:false };
/* רשימת המתנה לציוד (2026-10-22, סרגיי): הקב"ט מסמן אצל עובד "ממתין ל..." (בחירה מרובה). בעמוד הראשון של הלוגיסטי
   מוצגת רשימה מתקפלת של כל הממתינים - לחיצה פותחת אותה, ולחיצה על עובד פותחת את רשימת הציוד שלו. */
function eqmLoadWorkers(App, ms){
  if(EQM.tok !== ms.token){ EQM.tok = ms.token; EQM.workers = null; }
  if(!EQM.workers && !EQM.wLoading){ EQM.wLoading = true; App.apiRpc("mgr_equipment_workers", {p_token:ms.token}).then(x=>{ EQM.workers = x||[]; EQM.wLoading = false; App.render(); }).catch(e=>{ EQM.workers = []; EQM.wLoading = false; }); }
  return EQM.workers;
}
/* סטטוס לכל פריט (2026-10-22, סרגיי): ✅ קיבל / ❌ לא קיבל / 📦 הוזמן. "לא קיבל" ו"הוזמן" = רשימת המתנה;
   כל מה שהוזמן מוצג לקב"ט כמשימה מרוכזת בלוגיסטי (לפי פריט ומידה), עד שמסמנים "קיבל". */
const EQ_STATUS = { received:"✅ קיבל", not_received:"❌ לא קיבל", ordered:"📦 הוזמן" };
function eqmWaitingHtml(App, ms){
  const esc = App.escapeHtml, ws = eqmLoadWorkers(App, ms);
  if(!ws) return "";
  const list = ws.filter(w=>w.waiting && w.waiting.length);
  if(!list.length) return `<p class="muted" style="margin:8px 0 0;">⏳ רשימת המתנה לציוד: אין כרגע עובדים שממתינים לציוד.</p>`;
  const day = d=>d ? esc(dmgFmtDate(d).split(" ")[0]) : "";
  const wLink = (w, inner)=>`<span class="eqw-name" data-action="portal-pv" data-page="equip-edit" data-id="${w.id}" data-name="${esc(w.name)}">${inner}</span>`;
  // משימה מרוכזת: כל מה שהוזמן, לפי פריט ומידה
  const ord = {};
  list.forEach(w=>w.waiting.filter(x=>x.status==="ordered").forEach(x=>{
    const g = ord[x.item_id] = ord[x.item_id] || {name:x.name, n:0, sizes:{}, people:[]};
    g.n++; const sz = x.size || "—"; g.sizes[sz] = (g.sizes[sz]||0) + 1; g.people.push({w, size:x.size, at:x.ordered_at});
  }));
  const ordKeys = Object.keys(ord), ordN = ordKeys.reduce((s,k)=>s+ord[k].n, 0);
  const orderTask = ordN ? `<details class="eqw-list eqo-task"${EQM.ordOpen?" open":""}>
      <summary data-action="portal-eqo-toggle">📦 משימה: הזמנות ציוד שממתינות להגעה — ${ordN} פריטים</summary>
      <p class="muted" style="margin:6px 0;font-size:.85em;">כשהציוד מגיע ונמסר — פותחים את העובד ומסמנים "✅ קיבל".</p>
      ${ordKeys.map(k=>{ const g = ord[k]; const sz = Object.keys(g.sizes).filter(s=>s!=="—");
        return `<div class="portal-task" style="display:block;"><b>${esc(g.name)}</b> × ${g.n}${sz.length?` <span class="muted">(${sz.map(s=>`${esc(s)}${g.sizes[s]>1?` ×${g.sizes[s]}`:""}`).join(", ")})</span>`:""}
          <div style="font-size:.88em;margin-top:3px;">${g.people.map(x=>wLink(x.w, `${esc(x.w.name)}${x.size?` (${esc(x.size)})`:""}${x.at?` <span class="muted">· הוזמן ${day(x.at)}</span>`:""}`)).join(" · ")}</div></div>`; }).join("")}
    </details>` : "";
  const nItems = list.reduce((s,w)=>s+w.waiting.length, 0);
  // (2026-10-25, סרגיי) רשימת הזמנה: כל מה שעובדים עוד לא קיבלו ועוד לא הוזמן - לפי פריט ומידה, עם PDF לוואטסאפ
  const need = eqoNeedGroups(list);
  const needN = need.reduce((s,g)=>s+g.n, 0);
  const orderList = needN ? `<details class="eqw-list eqo-task"${EQM.needOpen?" open":""}>
      <summary data-action="portal-eqn-toggle">🛒 רשימת הזמנה — ${needN} פריטים להזמין</summary>
      <p class="muted" style="margin:6px 0;font-size:.85em;">כל מה שמסומן אצל העובדים "❌ לא קיבל", מסוכם לפי פריט ומידה. אחרי שמזמינים — מסמנים אצל העובד "📦 הוזמן".</p>
      ${need.map(g=>`<div class="portal-task" style="display:block;"><b>${esc(g.name)}</b> × ${g.n}${g.sizes.length?` <span class="muted">(${g.sizes.map(x=>`${esc(x.size)} ×${x.n}`).join(", ")})</span>`:""}
        <div style="font-size:.88em;margin-top:3px;">${g.people.map(x=>wLink(x.w, `${esc(x.w.name)}${x.size?` (${esc(x.size)})`:""}`)).join(" · ")}</div></div>`).join("")}
      <div class="flexbar" style="margin-top:8px;gap:6px;">
        <button class="btn small ok" data-action="portal-eqo-pdf" data-via="share" ${EQM.pdfBusy?"disabled":""}>📤 PDF לוואטסאפ</button>
        <button class="btn small secondary" data-action="portal-eqo-pdf" data-via="dl" ${EQM.pdfBusy?"disabled":""}>⬇️ הורדת PDF</button>
        ${EQM.pdfBusy?`<span class="muted">מכין PDF...</span>`:""}${EQM.pdfMsg?`<span class="muted">${esc(EQM.pdfMsg)}</span>`:""}</div>
    </details>` : "";
  const waitList = `<details class="eqw-list"${EQM.waitOpen?" open":""}>
    <summary data-action="portal-eqw-toggle">⏳ רשימת המתנה לציוד — ${list.length} עובדים · ${nItems} פריטים</summary>
    ${list.map(w=>`<div class="portal-task" data-action="portal-pv" data-page="equip-edit" data-id="${w.id}" data-name="${esc(w.name)}">
      <span class="portal-task-icon">⏳</span>
      <span><b>${esc(w.name)}</b> — ${w.waiting.map(x=>`${esc(x.name)}${x.size?` (${esc(x.size)})`:""} <span class="eqs-tag eqs-${x.status}">${x.status==="ordered"?"📦 הוזמן":"❌ לא קיבל"}</span>${x.since?` <span class="muted" style="font-size:.85em;">(מ-${day(x.since)})</span>`:""}`).join(", ")}</span></div>`).join("")}
  </details>`;
  return orderList + orderTask + waitList;
}
/* קיבוץ החוסרים (טרם התקבל, לא הוזמן) לפי פריט ומידה */
function eqoNeedGroups(list){
  const by = {};
  list.forEach(w=>w.waiting.filter(x=>x.status!=="ordered").forEach(x=>{
    const g = by[x.item_id] = by[x.item_id] || {name:x.name, n:0, sz:{}, people:[], teams:{}};
    g.n++; if(x.size) g.sz[x.size] = (g.sz[x.size]||0) + 1; g.people.push({w, size:x.size}); g.teams[w.team_id] = true;
  }));
  return Object.keys(by).map(k=>{ const g = by[k]; g.sizes = Object.keys(g.sz).sort((a,b)=>String(a).localeCompare(String(b), "he", {numeric:true})).map(sz=>({size:sz, n:g.sz[sz]})); return g; })
    .sort((a,b)=>a.name.localeCompare(b.name, "he"));
}
async function eqoMakePdf(App, ms, via){
  const esc = App.escapeHtml, ws = (EQM.workers||[]).filter(w=>w.waiting && w.waiting.length);
  const teamIds = [...new Set(ws.map(w=>w.team_id))];
  const tName = id=>{ const t = App.teamById(id); return t ? ((t.sectors&&t.sectors.length) ? t.sectors.join(" / ") : t.name) : ""; };
  const today = App.fmtDateHeb(App.fmtDate(new Date()));
  const section = (title, items)=>{ const need = eqoNeedGroups(items); if(!need.length) return "";
    return `<h3 style="margin:14px 0 6px;">${esc(title)}</h3>
      <table class="t"><thead><tr><th>פריט</th><th>מידה</th><th>כמות</th></tr></thead><tbody>
      ${need.map(g=> g.sizes.length ? g.sizes.map((x,i)=>`<tr>${i===0?`<td rowspan="${g.sizes.length + (g.n > g.sizes.reduce((s,y)=>s+y.n,0) ? 1 : 0)}"><b>${esc(g.name)}</b></td>`:""}<td>${esc(x.size)}</td><td>${x.n}</td></tr>`).join("")
          + (g.n > g.sizes.reduce((s,y)=>s+y.n,0) ? `<tr><td>ללא מידה</td><td>${g.n - g.sizes.reduce((s,y)=>s+y.n,0)}</td></tr>` : "")
        : `<tr><td><b>${esc(g.name)}</b></td><td>—</td><td>${g.n}</td></tr>`).join("")}
      <tr><td colspan="2"><b>סה"כ</b></td><td><b>${need.reduce((s,g)=>s+g.n,0)}</b></td></tr></tbody></table>
      <div style="font-size:12px;color:#444;margin-top:6px;">${need.map(g=>`<div><b>${esc(g.name)}:</b> ${g.people.map(x=>esc(x.w.name)+(x.size?` (${esc(x.size)})`:"")).join(", ")}</div>`).join("")}</div>`; };
  const body = (teamIds.length > 1 ? teamIds.map(id=>section(tName(id), ws.filter(w=>w.team_id===id))).join("") : section(tName(teamIds[0]) || "", ws))
    || `<p>אין פריטים להזמין.</p>`;
  await loadHtml2Pdf();
  const box = document.createElement("div");
  box.dir = "rtl"; box.style.cssText = "position:fixed;left:-10000px;top:0;width:760px;background:#fff;color:#111;font-family:Arial,sans-serif;padding:18px;";
  box.innerHTML = `<style>.t{width:100%;border-collapse:collapse;font-size:13px;}.t th,.t td{border:1px solid #999;padding:6px 8px;text-align:right;}.t th{background:#f1f1f1;} h2{font-size:20px;margin:0 0 4px;} tr{page-break-inside:avoid;}</style>
    ${App.logoStripHtml ? App.logoStripHtml(50) : ""}<h2>🛒 רשימת הזמנת ציוד</h2><div style="font-size:12px;color:#666;">הופק ${esc(today)} ע"י ${esc(ms.name||"")}</div>${body}`;
  document.body.appendChild(box);
  const name = `הזמנת-ציוד-${App.fmtDate(new Date())}.pdf`;
  let blob;
  try{
    blob = await window.html2pdf().set({margin:[10,8,10,8], filename:name, image:{type:"jpeg", quality:0.92}, html2canvas:{scale:2, useCORS:true},
      jsPDF:{unit:"mm", format:"a4", orientation:"portrait"}, pagebreak:{mode:["css","legacy"]}}).from(box).outputPdf("blob");
  } finally { box.remove(); }
  const file = new File([blob], name, {type:"application/pdf"});
  const download = ()=>{ const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u), 4000); };
  if(via==="share" && navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:"רשימת הזמנת ציוד", text:"רשימת הזמנת ציוד — " + today}); return ""; }
    catch(err){ if(err && err.name==="AbortError") return ""; }
  }
  download();
  if(via==="share"){ window.open("https://wa.me/?text=" + encodeURIComponent("רשימת הזמנת ציוד — " + today + " (הקובץ מצורף)"), "_blank"); return "ה-PDF נשמר בהורדות — צרפו אותו להודעה בוואטסאפ שנפתחה."; }
  return "ה-PDF נשמר בהורדות.";
}
document.addEventListener("change", e=>{
  const v = e.target && e.target.dataset ? e.target.dataset.eqmVeh : null;
  if(v){ const row = document.querySelector(`[data-veh-row="${v}"]`); if(row) row.style.display = e.target.checked ? "" : "none"; }
}, true);
document.addEventListener("change", e=>{
  const t = e.target; if(!t || !t.dataset || !t.dataset.eqmStatus || !EQM.statusSel) return;
  const id = parseInt(t.dataset.eqmStatus, 10);
  EQM.statusSel[id] = t.value || null;
  t.className = "eqs-sel" + (t.value ? " eqs-" + t.value : "");
  // סימון "קיבל" לפריט שהכמות שלו 0 - הכמות עולה ל-1
  if(t.value==="received"){ const q = document.querySelector(`[data-eqm-qty="${id}"]`); if(q && !(parseInt(q.value,10)>0)) q.value = 1; }
}, true);
function renderEquipMgrPages(App, ms, pg, a, wrap, loading, msgs){
  const esc = App.escapeHtml;
  if(EQM.tok !== ms.token){ EQM.tok = ms.token; EQM.workers = null; }
  if(!EQM.items && !EQM.itemsLoading){ EQM.itemsLoading = true; App.apiGet("logistics_items", "select=id,name,has_size,sort_order,size_options,has_serial,has_vehicle&order=sort_order").then(x=>{ EQM.items = x||[]; EQM.itemsLoading = false; App.render(); }).catch(()=>{ EQM.items = []; EQM.itemsLoading = false; }); }
  if(pg==="equip-workers"){
    eqmLoadWorkers(App, ms);
    if(!EQM.workers && !EQM.wLoading){ EQM.wLoading = true; App.apiRpc("mgr_equipment_workers", {p_token:ms.token}).then(x=>{ EQM.workers = x||[]; EQM.wLoading = false; App.render(); }).catch(e=>{ EQM.workers = []; EQM.wLoading = false; PV.error = e.message; App.render(); }); }
    if(!EQM.workers) return loading();
    const byTeam = {}; EQM.workers.forEach(w=>{ (byTeam[w.team_id] = byTeam[w.team_id]||[]).push(w); });
    const teamName = id=>{ const t = App.teamById(id); return t ? ((t.sectors&&t.sectors.length) ? t.sectors.join(" / ") : t.name) : ""; };
    return wrap(`<h2 style="margin-top:4px;">🎒 ציוד אישי לעובדים</h2>
      <p class="muted">לחצו על עובד כדי להזין או לעדכן את הציוד שברשותו. המאבטח רואה את הרשימה באיזור האישי (לוגיסטי) ולא יכול לערוך אותה.</p>${msgs}
      ${eqmWaitingHtml(App, ms)}
      ${Object.keys(byTeam).map(tid=>`${Object.keys(byTeam).length>1?`<h3 style="margin:12px 0 4px;">${esc(teamName(tid))}</h3>`:""}
        ${byTeam[tid].map(w=>`<div class="portal-task" data-action="portal-pv" data-page="equip-edit" data-id="${w.id}" data-name="${esc(w.name)}">
          <span class="portal-task-icon">${w.items?"🎒":"➕"}</span>
          <span><b>${esc(w.name)}</b> · ${w.items?`${w.items} פריטים`:'<span class="muted">עדיין לא הוזן</span>'}${(w.serials||[]).map(x=>` <span class="eqs-tag eqs-serial" dir="ltr">${x.vehicle?"🏍️":"📷"} ${esc(x.serial)}${x.model?` · ${esc(x.model)}`:""}</span>`).join("")}${(w.waiting&&w.waiting.length)?` <span class="eqw-badge">⏳ ממתין ל-${w.waiting.length}${w.waiting.some(x=>x.status==="ordered")?` · 📦 ${w.waiting.filter(x=>x.status==="ordered").length} הוזמנו`:""}</span>`:""}${w.updated_at?` <span class="muted" style="font-size:.85em;">· עודכן ${esc(dmgFmtDate(w.updated_at))}</span>`:""}</span></div>`).join("")}`).join("") || `<p class="muted">אין עובדים.</p>`}`);
  }
  if(pg==="equip-edit"){
    if(!EQM.edit || EQM.edit.worker_id !== a.id){
      if(!EQM.eLoading){ EQM.eLoading = true; EQM.edit = null; App.apiRpc("mgr_worker_equipment_get", {p_token:ms.token, p_worker_id:a.id}).then(x=>{ EQM.edit = x; EQM.eLoading = false; App.render(); }).catch(e=>{ EQM.eLoading = false; PV.error = e.message; App.render(); }); }
      return loading();
    }
    if(!EQM.items) return loading();
    const cur = {}; (EQM.edit.equipment||[]).forEach(e=>cur[e.item_id] = e);
    if(!EQM.statusSel || EQM.statusFor !== EQM.edit.worker_id){ EQM.statusFor = EQM.edit.worker_id; EQM.statusSel = {}; (EQM.edit.equipment||[]).forEach(e=>{ EQM.statusSel[e.item_id] = e.status || (e.waiting ? "not_received" : null); }); }
    const statusCell = it=>{ const v = EQM.statusSel[it.id] || "";
      return `<select data-eqm-status="${it.id}" class="eqs-sel${v?" eqs-"+v:""}"><option value="">—</option>${Object.keys(EQ_STATUS).map(k=>`<option value="${k}" ${v===k?"selected":""}>${EQ_STATUS[k]}</option>`).join("")}</select>`; };
    const sizeCell = (it, c)=>{
      // מספר סידורי (2026-10-22, סרגיי: "מצלמה שהונפקה למאבטח, כולל מספר מצלמה")
      if(it.has_serial) return `<input type="text" maxlength="40" data-eqm-serial="${it.id}" value="${esc(c.serial||"")}" placeholder="מס' ${/מצלמ/.test(it.name)?"מצלמה":"סידורי"}" style="width:100px;" dir="ltr">`;
      if(!it.has_size) return '<span class="muted">-</span>';
      const opts = Array.isArray(it.size_options) && it.size_options.length ? it.size_options : null;
      if(!opts) return `<input type="text" maxlength="20" data-eqm-size="${it.id}" value="${esc(c.size||"")}" placeholder="מידה" style="width:90px;">`;
      const all = c.size && !opts.includes(c.size) ? [c.size].concat(opts) : opts;
      return `<select data-eqm-size="${it.id}" style="width:90px;"><option value="">—</option>${all.map(o=>`<option value="${esc(o)}" ${c.size===o?"selected":""}>${esc(o)}</option>`).join("")}</select>`;
    };
    return wrap(`<h2 style="margin-top:4px;">🎒 ציוד אישי — ${esc(EQM.edit.name)}</h2>
      <p class="muted">כמה יש לעובד מכל פריט, מידה אם רלוונטי, וסטטוס: ✅ קיבל · ❌ לא קיבל (ממתין) · 📦 הוזמן. "לא קיבל" ו"הוזמן" נכנסים לרשימת ההמתנה, ו"הוזמן" — גם למשימת ההזמנות המרוכזת בלוגיסטי.</p>
      <div style="overflow-x:auto;"><table class="eqm-table">
        <thead><tr><th style="text-align:right;">פריט</th><th>כמות</th><th>מידה / מס'</th><th>סטטוס</th></tr></thead>
        <tbody>${EQM.items.map(it=>{ const c = cur[it.id] || {};
          // אופנוע צמוד (2026-10-24, סרגיי): כן/לא, ואם כן - מספר אופנוע וסוג אופנוע
          if(it.has_vehicle){ const on = (c.quantity||0) > 0;
            return `<tr><td style="text-align:right;">🏍️ ${esc(it.name)}</td>
              <td><label style="white-space:nowrap;"><input type="checkbox" data-eqm-veh="${it.id}" ${on?"checked":""}> יש</label></td>
              <td><span class="muted">-</span></td><td>${statusCell(it)}</td></tr>
              <tr data-veh-row="${it.id}" style="${on?"":"display:none;"}background:#f6fbff;"><td colspan="4" style="text-align:right;">
                <div class="row" style="gap:8px;flex-wrap:wrap;">
                  <div class="field" style="margin:0;"><label>מספר אופנוע</label><input type="text" maxlength="40" data-eqm-serial="${it.id}" value="${esc(c.serial||"")}" placeholder="למשל 12-345-67" dir="ltr" style="width:140px;"></div>
                  <div class="field" style="margin:0;"><label>סוג אופנוע</label><input type="text" maxlength="60" data-eqm-model="${it.id}" value="${esc(c.model||"")}" placeholder="למשל ימאהה XMAX 300" style="width:180px;"></div>
                </div></td></tr>`; }
          return `<tr><td style="text-align:right;">${esc(it.name)}</td>
            <td><input type="number" min="0" max="50" data-eqm-qty="${it.id}" value="${c.quantity!=null?c.quantity:0}" style="width:70px;"></td>
            <td>${sizeCell(it, c)}</td><td>${statusCell(it)}</td></tr>`; }).join("")}</tbody>
      </table></div>
      <div class="row" style="margin-top:10px;"><button class="btn ok" data-action="portal-eqm-save" data-id="${EQM.edit.worker_id}" ${EQM.busy?"disabled":""}>${EQM.busy?"שומר...":"💾 שמירה"}</button></div>${msgs}`);
  }
  return null;
}
async function eqmSave(App, el){
  const ms = loadMgr(App); if(!ms || EQM.busy || !EQM.items) return;
  const items = EQM.items.map(it=>{ const q = document.querySelector(`[data-eqm-qty="${it.id}"]`), sz = document.querySelector(`[data-eqm-size="${it.id}"]`), sr = document.querySelector(`[data-eqm-serial="${it.id}"]`);
    const o = {item_id: it.id, quantity: Math.max(0, Math.min(50, parseInt(q&&q.value,10)||0)), size: sz ? sz.value : null, status: (EQM.statusSel && EQM.statusSel[it.id]) || ""};
    if(sr) o.serial = sr.value.trim();
    if(it.has_vehicle){ const cb = document.querySelector(`[data-eqm-veh="${it.id}"]`), md = document.querySelector(`[data-eqm-model="${it.id}"]`);
      const on = !!(cb && cb.checked); o.quantity = on ? 1 : 0;
      o.serial = on && sr ? sr.value.trim() : ""; o.model = on && md ? md.value.trim() : ""; }
    return o; });
  const vehMissing = EQM.items.find(it=>it.has_vehicle && (document.querySelector(`[data-eqm-veh="${it.id}"]`)||{}).checked && !((document.querySelector(`[data-eqm-serial="${it.id}"]`)||{}).value||"").trim());
  if(vehMissing){ PV.error = "סומן אופנוע צמוד — צריך למלא את מספר האופנוע"; return App.render(); }
  // מספר סידורי בלי כמות - כנראה הונפק: כמות 1
  items.forEach(o=>{ if(o.serial && !o.quantity) o.quantity = 1; });
  EQM.busy = true; PV.error = null; PV.msg = null; App.render();
  try{
    await App.apiRpc("mgr_worker_equipment_save", {p_token:ms.token, p_worker_id:el.dataset.id, p_items:items});
    EQM.busy = false; EQM.workers = null; EQM.edit = null; EQM.statusSel = null; PV.msg = "רשימת הציוד נשמרה — העובד רואה אותה באיזור האישי.";
  }catch(e){ EQM.busy = false; PV.error = e.message; }
  App.render();
}
function renderLogistics(App, session){ return renderLogisticsInner(App, session); }
function renderLogisticsInner(App, session){
  const esc = App.escapeHtml;
  if(isMokedWorker(App, session)) return `<p class="muted">החלק הלוגיסטי מיועד למאבטחים בגזרות.</p>`;
  if(!L.items || !L.data){ loadLogistics(App, session); return `<p class="muted">טוען...</p>`; }
  const eqById = {}; (L.data.equipment||[]).forEach(e=>eqById[e.item_id]=e);
  const itemName = id=>{ const it=L.items.find(x=>x.id===id); return it?it.name:"?"; };
  const msgs = `${L.error?`<p class="shortage">${esc(L.error)}</p>`:""}${L.msg?`<p class="ok-msg" style="color:#1b7f3b;font-weight:600;">${esc(L.msg)}</p>`:""}`;

  // (2026-10-21, סרגיי) רשימת הציוד האישי מוזנת ע"י הקב"ט בלבד - המאבטח רואה אותה ולא עורך אותה
  // --- אחרי שמולא: הציוד שברשותי + בקשת ציוד נוסף + הבקשות שלי ---
  const owned = L.items.filter(it=> eqById[it.id] && eqById[it.id].quantity>0);
  const reqs = L.data.requests || [];
  return `
    ${msgs}
    <h3 style="margin-top:0;">הציוד שברשותי</h3>
    <p class="muted" style="margin-top:-6px;">הרשימה מוזנת ומעודכנת ע"י הקב"ט. אם משהו לא נכון — פנו לקב"ט או שלחו בקשה למטה.</p>
    ${owned.length? `<div style="overflow-x:auto;"><table>
      <thead><tr><th style="text-align:right;">פריט</th><th>כמות</th><th>מידה</th></tr></thead>
      <tbody>${owned.map(it=>`<tr><td style="text-align:right;">${esc(it.name)}</td><td>${eqById[it.id].quantity}</td><td>${eqById[it.id].serial ? `<span dir="ltr">מס' ${esc(eqById[it.id].serial)}</span>${eqById[it.id].model?` · ${esc(eqById[it.id].model)}`:""}` : esc(eqById[it.id].size||"-")}</td></tr>`).join("")}</tbody>
    </table></div>` : `<p class="muted">הקב"ט עדיין לא הזין את רשימת הציוד שלך.</p>`}
    ${(()=>{ const wt = L.items.filter(it=>eqById[it.id] && eqById[it.id].waiting);
      return wt.length ? `<h3>⏳ ממתין ל...</h3><p class="muted" style="margin-top:-6px;">ציוד שהקב"ט רשם שאת/ה ממתין/ה לקבל. "📦 הוזמן" — הציוד הוזמן ובדרך.</p>
        <ul style="margin:0;padding-inline-start:20px;line-height:1.9;">${wt.map(it=>{ const e = eqById[it.id];
          return `<li><b>${esc(it.name)}</b>${e.size?` (${esc(e.size)})`:""} <span class="eqs-tag eqs-${e.status==="ordered"?"ordered":"not_received"}">${e.status==="ordered"?"📦 הוזמן":"❌ טרם התקבל"}</span>${e.waiting_since?` <span class="muted" style="font-size:.85em;">· מ-${esc(App.fmtDateHeb(locDay(App, e.waiting_since)))}</span>`:""}</li>`; }).join("")}</ul>` : ""; })()}

    <h3>בקשת החלפה / ציוד נוסף</h3>
    <p class="muted" style="margin-top:-6px;">הבקשה נשלחת למנהל שלך. הוא מסמן אם הפריט הוחלף או שנופק לך פריט נוסף, והרשימה שלך מתעדכנת לבד.</p>
    <div class="row">
      <div class="field"><label>פריט</label>
        <select id="logReqItem">${L.items.filter(it=>!it.has_vehicle).map(it=>`<option value="${it.id}">${esc(it.name)}</option>`).join("")}</select>
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
      <tbody>${reqs.map(r=>`<tr><td>${App.fmtDateHeb(locDay(App, r.created_at))}</td><td style="text-align:right;">${esc(itemName(r.item_id))}${r.note?`<br><span class="muted" style="font-size:.85em;">${esc(r.note)}</span>`:""}</td><td>${r.quantity}</td><td>${esc(r.size||"-")}</td><td>${esc(REQ_REASON[r.reason]||"-")}</td><td>${esc(REQ_STATUS[r.status]||r.status)}</td></tr>`).join("")}</tbody>
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
      <td>${App.fmtDateHeb(locDay(App, r.created_at))}</td>
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
  if(!W.list && ms && ms.is_admin && !W.loading && !W.tried){ W.loading = true; W.tried = true; W.pin = "mgr:" + ms.token; pwLoad(App).finally(()=>{ W.loading = false; App.render(); }); /* תיקון 20/10: בלי הרינדור הזה המסך נשאר על "טוען..." */ return `<div class="card"><p class="muted">טוען...</p></div>`; }
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

/* (2026-10-25) רק תמונה/PDF כ-data: או קישור https/blob - כדי שערך זדוני לא יריץ קוד אצל המנהל */
function safeSrc(v){ const t = String(v||""); return /^data:(image\/[a-z0-9.+-]+|application\/pdf);base64,[A-Za-z0-9+/=\s]+$/i.test(t) || /^(https:|blob:)[^"'<>\s]+$/i.test(t) ? t : ""; }
/* תאריך מקומי (ישראל) של חותמת זמן מהשרת (UTC) - אחרת אחרי חצות מוצג היום הקודם */
function locDay(App, v){ const t = String(v||""); if(/^\d{4}-\d{2}-\d{2}[T ]\d/.test(t)){ const d = new Date(t.replace(" ","T").replace(/([+-]\d{2})$/,"$1:00")); if(!isNaN(d)) return App.fmtDate(d); } return t.slice(0,10); }
function fmtD(App, s){ return s ? App.fmtDateHeb(locDay(App, s)) : ""; }
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
        : (link && /^https?:\/\//i.test(String(link))?`<p style="margin-top:12px;"><a href="${esc(link)}" target="_blank" rel="noopener">פתיחת הקישור ↗</a></p>`:"")}
    ${image?`<img src="${safeSrc(image)}" alt="" style="max-width:100%;margin-top:12px;border-radius:8px;">`:""}
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
  if(HB.pending) return;
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
        <span class="muted" style="font-size:.82em;display:block;">${p.author?`מאת ${esc(p.author)}`:esc(POST_KIND[p.kind]||"")} · ${fmtD(App,p.created_at)}${youtubeId(p.link_url)?" · סרטון":""}</span>
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
function incFmtDate(App, d){ return d ? App.fmtDateHeb(locDay(App, d)) : ""; }
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
        <h2 style="margin:0;"><span class="sayvu-badge">SAYVU</span> דו"חות תחקיר — אירועי SAYVU</h2>
        <div class="flexbar" style="gap:6px;">
          ${ms.is_admin?'<button class="btn small secondary" data-action="portal-pv" data-page="inc-opts">⚙️ עריכת רשימות</button>':""}
          ${canWrite?'<button class="btn" data-action="portal-inc-new">➕ דו"ח חדש</button>':""}
        </div></div>
      ${msgs}
      <p class="muted" style="margin:6px 0 0;">כאן תחקירי אירועי SAYVU מהמוקד. דיווחי נזק/תאונה נמצאים בנפרד, ב"דיווחי נזק / תאונה".</p>
      ${deb.length?`<h3>🔔 אירועי SAYVU מהמוקד שממתינים לתחקיר (${deb.length})</h3>
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
    INC.editable = editable;
    const err = INC.error?`<p class="shortage">${esc(INC.error)}</p>`:"";
    const ok = INC.msg?`<p style="color:#1b7f3b;font-weight:600;">${esc(INC.msg)}</p>`:"";
    if(!editable){
      const imgs = INC.images.map(i=>`<img src="${safeSrc(i.image_data)}" alt="">`).join("");
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
        ${App.logoStripHtml ? App.logoStripHtml(46) : ""}
        <h2 style="text-align:center;margin:6px 0;">דו"ח תחקיר אירוע חריג</h2>
        <p class="muted" style="text-align:center;margin-top:0;">${incStatusChip(rep.status)} · נכתב ע"י ${esc(rep.author||"")}${rep.submitted_at?` · נשלח ${fmtDT(App, rep.submitted_at)}`:""}${rep.reopened_by?` · נפתח לתיקון ע"י ${esc(rep.reopened_by)} ${fmtDT(App, rep.reopened_at)}`:""}</p>
        ${err}${ok}
        ${incMokedHtml(App, INC.moked)}
        ${INC_SECTIONS.map(s=>`<h3 class="inc-sec">${esc(s.title)}</h3>${s.fields.map(f=>incFieldHtml(App, f, true)).join("")}`).join("")}
        ${INC.images.length?`<h3 class="inc-sec">תמונות</h3><div class="inc-imgs">${imgs}</div>`:""}
      </div>`;
    }
    const imgs = INC.images.map(i=>`<div class="inc-img"><img src="${safeSrc(i.image_data)}" alt=""><button class="btn small secondary" style="position:absolute;top:4px;left:4px;padding:2px 7px;" data-action="portal-inc-img-del" data-id="${i.id}" title="הסר">✕</button></div>`).join("");
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
        <span id="incAutoMsg" class="muted" style="font-size:.85em;"></span>
      </div>
    </div>`;
  }
  return wrap(`<p class="muted">לא נמצא.</p>`);
}

/* שמירה אוטומטית שקטה של תחקיר SAYVU כטיוטה בשרת (2026-10-20): בזמן ההקלדה (אחרי 3 שניות שקט), ביציאה
   מהאפליקציה ובמעבר מסך. בלי רינדור - כדי לא להפריע להקלדה. הטיוטה מופיעה ב"הטיוטות שלי". */
async function incAutoSave(App){
  const ms = loadMgr(App); if(!ms || INC.busy || INC.autoBusy) return;
  if(App.S.view!=="pview" || PV.page!=="inc-form" || !INC.editable || !document.querySelector(".inc-card")) return;
  incSync();
  const data = incClean(INC.data), notes = incClean(INC.notes);
  const sig = JSON.stringify([INC.id, data, notes]);
  if(sig===INC.lastAutoSig) return;
  if(!INC.id && !Object.keys(data).length && !Object.keys(notes).length) return;
  INC.autoBusy = true;
  try{
    const id = await App.apiRpc("inc_save", {p_token:ms.token, p_id:INC.id, p_data:data, p_notes:notes, p_submit:false});
    if(!INC.id){ INC.id = id; INC.loadedFor = id; PV.args = Object.assign({}, PV.args, {id}); INC.status = "draft"; if(!INC.report) INC.report = {mine:true, status:"draft"}; }
    INC.lastAutoSig = JSON.stringify([INC.id, data, notes]);
    const el = document.getElementById("incAutoMsg"); if(el) el.textContent = "💾 נשמר אוטומטית כטיוטה " + new Date().toTimeString().slice(0,5);
  }catch(e){}
  INC.autoBusy = false;
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
    const pooled = ["ירושלים","בית שמש","מודיעין עילית","ביתר עילית"];
    const lbl = !(t.sectors||[]).length ? "מוקד" : ((g.citySectors||[]).some(c=>pooled.includes(c)) ? "ירושלים וסובב ירושלים" : (g.citySectors||[]).join(" / "));
    const ends = (g.citySectors||[]).map(s=>(d.published||{})[s]).filter(Boolean).sort();
    const last = ends.length===(g.citySectors||[]).length && ends.length ? ends[0] : null;
    const soon = !last || (new Date(last+"T23:59:59") - Date.now()) < 7*86400000;
    schedTiles.push(`<div class="team-tile" data-action="portal-mgr-view" data-id="${t.id}">
      <div style="font-weight:700;">${esc(lbl)}</div>
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
        ${tr.length ? tr.map(x=>rowOf(x.title, x.published_at?`פורסם ${App.fmtDateHeb(locDay(App, x.published_at))}`:"", x.per_team, teams)).join("") : `<tr><td colspan="${teams.length+2}" class="muted">אין לומדות פעילות</td></tr>`}
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
  .cal-ppl{border:1px solid var(--border);border-radius:8px;background:#fff;}
  .cal-ppl summary{cursor:pointer;padding:9px 10px;list-style:none;}
  .cal-ppl summary::-webkit-details-marker{display:none;}
  .cal-ppl-list{border-top:1px solid var(--border);max-height:260px;overflow-y:auto;padding:4px 10px;}
  .cal-ppl-list label{display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;}
  .cal-ppl-all{border-bottom:1px dashed var(--border);}
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
  .cal-priv{font-size:.75em;background:#ede9fe;color:#5b21b6;border-radius:999px;padding:1px 7px;font-weight:600;}
  @media (max-width:520px){ .cal-cell{min-height:58px;} .cal-chip{font-size:.62em;padding:0 2px;} }
</style>`;

/* ---------- יומן שבועי בצד מסך הבית של המנהלים + "המשימות שלי" (2026-10-18, לבקשת סרגיי:
   "לא בצורת לחצן, אלא טבלה שבועית בצד"; מה שנקבע למישהו מופיע גם ביומן המשותף וגם כמשימה אישית שלו;
   דברים אישיים שלא נוגעים לכלל - לא ביומן המשותף). מתעדכן כל דקה כשמסך הבית פתוח. ---------- */
const CW = { week:null, data:null, loading:false, my:null, myLoading:false, timer:null, showAssigned:false, showAll:false, lastDone:null };
function calWeekStart(d){ const x = new Date((d||calToday())+"T12:00:00"); x.setDate(x.getDate()-x.getDay()); return `${x.getFullYear()}-${calPad(x.getMonth()+1)}-${calPad(x.getDate())}`; }
function calAddDays(ds, n){ const x = new Date(ds+"T12:00:00"); x.setDate(x.getDate()+n); return `${x.getFullYear()}-${calPad(x.getMonth()+1)}-${calPad(x.getDate())}`; }
function calWeekLoad(App, ms){
  if(!CW.week) CW.week = calWeekStart();
  if(!CW.data && !CW.loading){
    CW.loading = true;
    App.apiRpc("cal_list", {p_token:ms.token, p_from:CW.week, p_to:calAddDays(CW.week, 6)})
      .then(d=>{ CW.data = d; CW.loading = false; App.render(); }).catch(()=>{ CW.loading = false; });
  }
  if(!CW.my && !CW.myLoading){
    CW.myLoading = true;
    App.apiRpc("cal_my", {p_token:ms.token}).then(d=>{ CW.my = d; CW.myLoading = false; App.render(); }).catch(()=>{ CW.myLoading = false; });
  }
  if(!CW.timer) CW.timer = setInterval(()=>{
    const m = loadMgr(App);
    if(!m){ clearInterval(CW.timer); CW.timer = null; return; }
    if(App.S.view!=="home" || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) return;
    CW.data = null; CW.my = null; calWeekLoad(App, m);
  }, 60000);
}
function renderCalWeekSide(App, ms){
  const esc = App.escapeHtml;
  calWeekLoad(App, ms);
  const today = calToday(), days = [];
  for(let i=0;i<7;i++) days.push(calAddDays(CW.week, i));
  const by = {}; ((CW.data&&CW.data.items)||[]).slice().sort((a,b)=>(a.start||"99").localeCompare(b.start||"99")).forEach(it=>{ (by[it.date] = by[it.date]||[]).push(it); });
  const dm = ds=>`${parseInt(ds.slice(8),10)}/${parseInt(ds.slice(5,7),10)}`;
  const rows = days.map(ds=>{
    const list = by[ds]||[], isToday = ds===today;
    return `<tr class="${isToday?"calw-today":""}">
      <td class="calw-day">${CAL_DAYS[new Date(ds+"T12:00:00").getDay()]}<div class="muted" style="font-size:.8em;">${dm(ds)}</div></td>
      <td>${list.length ? list.map(it=>`<div class="calw-it" data-action="portal-cal-open" data-id="${it.id}" data-d="${it.date}" style="border-inline-start:3px solid ${it.kind==="task"?(it.done?"#9ca3af":"#f59e0b"):"#3b82f6"};${it.done?"text-decoration:line-through;color:#6b7280;":""}">
          ${it.start?`<b>${esc(it.start)}</b> `:""}${it.kind==="task"?"📌 ":""}${esc(it.title)}${it.visibility==="personal"?" 🔒":""}${it.assignee?`<span class="muted"> · ${esc(it.assignee)}</span>`:""}${it.can_done?` <button class="calw-ok" data-action="portal-cal-done" data-id="${it.id}" data-title="${esc(it.title)}" data-v="1" title="סמן בוצע">✔</button>`:""}</div>`).join("")
        : `<span class="muted" style="font-size:.85em;">—</span>`}</td></tr>`;
  }).join("");
  const my = (CW.my&&CW.my.mine)||[], byMe = (CW.my&&CW.my.assigned_by_me)||[];
  const late = it=>it.kind==="task" && it.date < today;
  // מנהל היחידה (וסרגיי) - כלל המשימות הפתוחות של כולם, לפי אחראי
  const all = (CW.my && CW.my.sees_all && CW.my.all_open) || null;
  let allOpenCard = "";
  if(all){
    const groups = {}; all.forEach(it=>{ (groups[it.assignee] = groups[it.assignee]||[]).push(it); });
    const names = Object.keys(groups), lateN = all.filter(it=>it.date < today).length;
    allOpenCard = `<div class="card calw">
      <h3 style="margin-top:0;">📋 כלל המשימות הפתוחות (${all.length})</h3>
      ${lateN?`<div style="color:#b42318;font-weight:700;font-size:.88em;margin:-4px 0 6px;">${lateN} באיחור</div>`:""}
      ${!all.length ? `<p class="muted" style="margin:0;">אין משימות פתוחות.</p>` : names.map(n=>{
        const g = groups[n], gl = g.filter(it=>it.date < today).length;
        return `<div class="calw-grp"><div class="flexbar" style="justify-content:space-between;"><b>${esc(n)}</b>
            <span class="muted" style="font-size:.85em;">${g.length}${gl?` · <span style="color:#b42318;font-weight:700;">${gl} באיחור</span>`:""}</span></div>
          ${CW.showAll ? g.map(it=>`<div class="muted" style="font-size:.84em;margin:2px 0;cursor:pointer;${it.date<today?"color:#b42318;":""}" data-action="portal-cal-open" data-id="${it.id}" data-d="${it.date}">• ${esc(it.title)}${it.visibility==="personal"?" 🔒":""} · ${dm(it.date)}${it.created_by?` · מאת ${esc(it.created_by)}`:""}</div>`).join("") : ""}</div>`;
      }).join("")}
      ${all.length ? `<div style="margin-top:6px;"><span class="backlink" data-action="portal-calw-all" style="font-size:.88em;">${CW.showAll?"▾ הסתר פירוט":"▸ הצג פירוט"}</span></div>` : ""}
    </div>`;
  }
  return `<div class="card calw">
    <div class="flexbar" style="justify-content:space-between;gap:6px;">
      <h3 style="margin:0;">📅 יומן משותף</h3>
      <button class="btn small" data-action="portal-cal-add-home">➕</button>
    </div>
    <div class="flexbar" style="justify-content:space-between;margin:6px 0;">
      <button class="btn small secondary" data-action="portal-calw-prev" title="שבוע קודם">▶</button>
      <span style="font-size:.9em;font-weight:700;">${dm(days[0])} — ${dm(days[6])}${CW.week!==calWeekStart()?` <span class="backlink" data-action="portal-calw-today" style="font-size:.85em;">השבוע</span>`:""}</span>
      <button class="btn small secondary" data-action="portal-calw-next" title="שבוע הבא">◀</button>
    </div>
    ${CW.data ? `<table class="calw-tbl"><tbody>${rows}</tbody></table>` : `<p class="muted">טוען...</p>`}
    <div style="text-align:center;margin-top:6px;"><span class="backlink" data-action="portal-pv" data-page="cal">לוח חודשי מלא ◀</span></div>
  </div>
  ${CW.lastDone ? `<div class="card calw" style="background:#e3f4e8;border-color:#9fd3ad;padding:8px 12px;">✔ "${esc(CW.lastDone.title||"המשימה")}" סומנה כבוצעה והוסרה מהיומן.
    <span class="backlink" data-action="portal-cal-undo" style="font-size:.9em;">ביטול</span></div>` : ""}
  ${CW.err ? `<div class="card calw"><p class="shortage" style="margin:0;">${esc(CW.err)}</p></div>` : ""}
  ${allOpenCard}
  <div class="card calw">
    <h3 style="margin-top:0;">📌 המשימות שלי${my.length?` (${my.length})`:""}</h3>
    ${!CW.my ? `<p class="muted">טוען...</p>` : (my.length ? my.map(it=>`<div class="calw-task">
        <span style="flex:1;cursor:pointer;" data-action="portal-cal-open" data-id="${it.id}" data-d="${it.date}">${it.kind==="task"?"📌":"📅"} <b>${esc(it.title)}</b>${it.visibility==="personal"?" 🔒":""}
          <span class="muted" style="font-size:.82em;display:block;${late(it)?"color:#b42318;font-weight:700;":""}">${late(it)?"באיחור · ":""}${dm(it.date)}${it.start?" "+esc(it.start):""}${it.created_by && it.created_by!==ms.name?` · מאת ${esc(it.created_by)}`:""}</span></span>
        ${it.kind==="task"?`<button class="btn small ok" data-action="portal-cal-done" data-id="${it.id}" data-title="${esc(it.title)}" data-v="1" title="בוצע">✔ בוצע</button>`:""}
      </div>`).join("") : `<p class="muted" style="margin:0;">אין משימות פתוחות 🎉</p>`)}
    ${byMe.length ? `<div style="margin-top:8px;"><span class="backlink" data-action="portal-calw-byme" style="font-size:.88em;">${CW.showAssigned?"▾":"▸"} משימות שהטלתי על אחרים (${byMe.length})</span>
      ${CW.showAssigned ? byMe.map(it=>`<div class="muted" style="font-size:.85em;margin:3px 0;cursor:pointer;" data-action="portal-cal-open" data-id="${it.id}" data-d="${it.date}">🕒 ${esc(it.title)} · ${esc(it.assignee)} · ${dm(it.date)}</div>`).join("") : ""}</div>` : ""}
  </div>`;
}
const CALW_CSS = `<style>
  .mgr-cols{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:14px;align-items:start;}
  .calw-tbl{width:100%;border-collapse:collapse;}
  .calw-tbl td{border-bottom:1px solid var(--border);padding:5px 4px;vertical-align:top;text-align:right;}
  .calw-day{width:44px;font-weight:700;text-align:center!important;}
  .calw-today td{background:#eef6ff;}
  .calw-it{font-size:.85em;padding:2px 6px;margin:2px 0;border-radius:4px;background:#f8fafc;cursor:pointer;line-height:1.35;}
  .calw-task{display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--border);}
  .calw-ok{border:1px solid #9fd3ad;background:#e3f4e8;color:#1b7f3b;border-radius:6px;font-size:.85em;padding:0 6px;cursor:pointer;margin-inline-start:4px;}
  .calw-grp{padding:5px 0;border-bottom:1px solid var(--border);}
  @media (max-width:760px){ .mgr-cols{grid-template-columns:minmax(0,1fr);gap:0;} .mgr-side{order:-1;} }
</style>`;
function alertLike(App, msg){ CW.lastDone = null; CW.err = msg; setTimeout(()=>{ CW.err = null; App.render(); }, 5000); }
function calOpenItem(App, id, d){
  const it = (((CW.data&&CW.data.items)||[]).concat((CW.my&&CW.my.mine)||[], (CW.my&&CW.my.assigned_by_me)||[], (C.data&&C.data.items)||[])).find(x=>x.id===id);
  C.month = (d||calToday()).slice(0,7); C.sel = d || calToday(); C.data = null; C.error = null; C.msg = null; C.delAsk = null;
  C.edit = null; C.openId = id;
  pvGo(App, "cal", {});
}
/* בחירת משתתפים (2026-10-21, סרגיי - במקום "שלח התראה לכולם"): רשימה נפתחת עם סימון מרובה; הסימון הראשון
   "כולם" מסמן את כולם ושולח התראה לכולם. כל מי שמסומן מקבל התראה (cal_save_v3). */
function calPplSummary(all, names){ return all ? "כולם" : (names.length ? names.join(", ") : "לא נבחרו — בלי התראה"); }
function calPplPicker(App, e, members){
  const esc = App.escapeHtml;
  const sel = new Set(e.participant_ids||[]), all = !!e.notify_all;
  const names = members.filter(m=>sel.has(m.id)).map(m=>m.name);
  return `<div class="field"><label>משתתפים — יקבלו התראה</label>
    <details class="cal-ppl"${e.pplOpen?" open":""}>
      <summary><span class="cal-ppl-sum">${esc(calPplSummary(all, names))}</span> <span class="muted">▾</span></summary>
      <div class="cal-ppl-list">
        <label class="cal-ppl-all"><input type="checkbox" data-ppl="all" ${all?"checked":""}> <b>כולם</b> <span class="muted" style="font-size:.85em;">(רלוונטי לכולם — התראה לכולם)</span></label>
        ${members.map(m=>`<label><input type="checkbox" data-ppl="${m.id}" data-name="${esc(m.name)}" ${all||sel.has(m.id)?"checked":""}> ${esc(m.name)}</label>`).join("")}
      </div>
    </details></div>`;
}
function calPplSync(t){
  const box = t.closest(".cal-ppl"); if(!box) return;
  const boxes = [...box.querySelectorAll('input[data-ppl]')], allBox = boxes.find(b=>b.dataset.ppl==="all"), mem = boxes.filter(b=>b!==allBox);
  if(t===allBox) mem.forEach(b=>{ b.checked = allBox.checked; });
  else if(!t.checked) allBox.checked = false;
  else if(mem.every(b=>b.checked)) allBox.checked = true;
  const sum = box.querySelector(".cal-ppl-sum");
  if(sum) sum.textContent = calPplSummary(allBox.checked, mem.filter(b=>b.checked).map(b=>b.dataset.name));
}
document.addEventListener("change", e=>{ if(e.target && e.target.dataset && e.target.dataset.ppl) calPplSync(e.target); });
function renderCalendar(App, ms, back){
  const esc = App.escapeHtml;
  if(!C.month) C.month = calToday().slice(0,7);
  if(!C.data && !C.loading && !C.error) calLoad(App, ms);
  calStartTimer(App);
  if(C.error && !C.data) return `<div class="card">${back}<p class="shortage">${esc(C.error)}</p></div>`;
  if(!C.data) return `<div class="card">${back}<p class="muted">טוען...</p></div>`;
  const r = calMonthRange(C.month), today = calToday();
  const items = C.data.items||[], byDate = {};
  if(C.openId){ const oi = items.find(x=>x.id===C.openId); C.openId = null; if(oi){ C.sel = oi.date; if(oi.can_edit) C.edit = Object.assign({}, oi); } }
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
        <div><b style="${it.done?"text-decoration:line-through;":""}">${it.kind==="task"?"📌 ":"📅 "}${esc(it.title)}</b>${it.visibility==="personal"?` <span class="cal-priv">🔒 אישי</span>`:""}
          <span class="muted" style="font-size:.85em;">${it.start?` · ${esc(it.start)}${it.end?"-"+esc(it.end):""}`:" · כל היום"}</span></div>
        <div class="flexbar" style="gap:4px;">
          ${it.kind==="task" && it.can_done && !it.done ? `<button class="btn small ok" data-action="portal-cal-done" data-id="${it.id}" data-title="${esc(it.title)}" data-v="1">✔ בוצע</button>`:""}
          ${C.delAsk===it.id
            ? `<b>למחוק?</b><button class="btn small" style="background:#b42318;border-color:#b42318;" data-action="portal-cal-del" data-id="${it.id}">כן</button><button class="btn small secondary" data-action="portal-cal-del-no">לא</button>`
            : `${it.can_edit?`<button class="btn small secondary" data-action="portal-cal-edit" data-id="${it.id}">✏️ עריכה</button>`:""}${it.can_delete?`<button class="btn small secondary" data-action="portal-cal-del-ask" data-id="${it.id}">🗑</button>`:""}`}
        </div>
      </div>
      <div class="muted" style="font-size:.85em;margin-top:3px;">${it.assignee?`אחראי: <b>${esc(it.assignee)}</b> · `:(it.visibility==="personal"?"אישי · ":"לכולם · ")}נוסף ע"י ${esc(it.created_by||"")}${it.done&&it.done_by?` · בוצע ע"י ${esc(it.done_by)}`:""}${it.notify_all?" · 👥 משתתפים: כולם":(it.participants?` · 👥 משתתפים: ${esc(it.participants)}`:"")}</div>
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
      <div class="field"><label>איפה זה מופיע</label>
        <label style="display:block;margin:4px 0;"><input type="radio" name="cal_vis" value="shared" ${e.visibility!=="personal"?"checked":""}> 📢 ביומן המשותף — כולם רואים${""}</label>
        <label style="display:block;margin:4px 0;"><input type="radio" name="cal_vis" value="personal" ${e.visibility==="personal"?"checked":""}> 🔒 אישי — לא נוגע לכלל: רק אצל האחראי (ואצלך), לא ביומן המשותף</label>
      </div>
      ${calPplPicker(App, e, members.filter(m=>m.id!==C.data.me))}
      <p class="muted" style="font-size:.82em;margin:2px 0 8px;">כל מי שמסומן במשתתפים מקבל התראה (ורואה את הפריט גם אם הוא אישי). "כולם" — התראה לכולם, רק לפריט ביומן המשותף. פריט עם אחראי מופיע אצלו גם ב"המשימות שלי", והוא מקבל התראה. האחראי יכול גם לערוך אותו.</p>
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
      <div class="muted" style="font-size:.78em;margin-top:6px;">📅 אירוע · 📌 משימה · משימה שסומנה "בוצע" יורדת מהיומן · מתעדכן אוטומטית כל 30 שניות</div>
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
  if(a==="portal-calw-prev" || a==="portal-calw-next" || a==="portal-calw-today"){
    CW.week = a==="portal-calw-today" ? calWeekStart() : calAddDays(CW.week||calWeekStart(), a==="portal-calw-next"?7:-7);
    CW.data = null; return App.render();
  }
  if(a==="portal-calw-byme"){ CW.showAssigned = !CW.showAssigned; return App.render(); }
  if(a==="portal-calw-all"){ CW.showAll = !CW.showAll; return App.render(); }
  if(a==="portal-cal-undo"){
    const ld = CW.lastDone; CW.lastDone = null; if(!ld) return App.render();
    try{ await App.apiRpc("cal_done", {p_token:ms.token, p_id:ld.id, p_done:false}); }catch(e){ C.error = e.message; }
    CW.data = null; CW.my = null; C.data = null; return App.render();
  }
  if(a==="portal-cal-open") return calOpenItem(App, el.dataset.id, el.dataset.d);
  if(a==="portal-cal-add-home"){
    const d = (CW.week && CW.week!==calWeekStart()) ? CW.week : calToday();
    C.month = d.slice(0,7); C.sel = d; C.data = null; C.error = null; C.msg = null; C.edit = {kind:"event", date:d}; C.openId = null;
    return pvGo(App, "cal", {});
  }
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
    const visEl = document.querySelector('input[name="cal_vis"]:checked'); C.edit.visibility = visEl ? visEl.value : "shared";
    const pplBoxes = [...document.querySelectorAll('.cal-ppl input[data-ppl]')];
    const pplDetails = document.querySelector('.cal-ppl'); C.edit.pplOpen = !!(pplDetails && pplDetails.open);
    C.edit.notify_all = pplBoxes.some(b=>b.dataset.ppl==="all" && b.checked);
    C.edit.participant_ids = pplBoxes.filter(b=>b.dataset.ppl!=="all" && b.checked).map(b=>b.dataset.ppl);
    if(C.edit.notify_all && C.edit.visibility==="personal"){ C.error = "\"כולם\" מתאים רק לפריט ביומן המשותף. לפריט אישי - סמנו משתתפים מסוימים."; return App.render(); }
    try{
      await App.apiRpc("cal_save_v3", {p_token:ms.token, p_id:C.edit.id||null, p_kind:C.edit.kind, p_title:title, p_date:date, p_start:C.edit.start||null, p_end:C.edit.end||null, p_assignee:C.edit.assignee_id, p_notes:C.edit.notes||null, p_visibility:C.edit.visibility, p_participants:C.edit.participant_ids, p_notify_all:C.edit.notify_all});
      CW.data = null; CW.my = null;
      C.msg = C.edit.id ? "עודכן." : "נוסף ליומן."; C.edit = null; C.error = null; C.sel = date;
      if(date.slice(0,7)!==C.month) C.month = date.slice(0,7);
      C.data = null; return App.render();
    }catch(e){ C.error = e.message; return App.render(); }
  }
  if(a==="portal-cal-done"){
    if(el.dataset.v==="1"){
      try{ await App.apiRpc("cal_done", {p_token:ms.token, p_id:el.dataset.id, p_done:true}); C.error = null; C.msg = "✔ סומן כבוצע והוסר מהיומן."; CW.lastDone = {id:el.dataset.id, title:el.dataset.title||""}; const did = el.dataset.id; setTimeout(()=>{ if(CW.lastDone && CW.lastDone.id===did){ CW.lastDone = null; if(App.S.view==="home") App.render(); } }, 20000); }
      catch(e){ C.msg = null; C.error = e.message; if(App.S.view!=="pview") alertLike(App, e.message); }
    }
    CW.data = null; CW.my = null;
    if(App.S.view!=="pview" || PV.page!=="cal") return App.render();
    return calLoad(App, ms, true);
  }
  if(a==="portal-cal-del-ask"){ C.delAsk = el.dataset.id; return App.render(); }
  if(a==="portal-cal-del-no"){ C.delAsk = null; return App.render(); }
  if(a==="portal-cal-del"){
    try{ await App.apiRpc("cal_hide", {p_token:ms.token, p_id:el.dataset.id}); C.msg = "נמחק."; CW.data = null; CW.my = null; }catch(e){ C.error = e.message; }
    C.delAsk = null; return calLoad(App, ms, true);
  }
}

/* ================================================================
   המשימות שלי (2026-10-21, סרגיי): במסך הבית של מנהלים וקב"טים - משימות אישיות לביצוע, שרק המשתמש עצמו רואה
   (mgr_todos, לפי ה-token). אפשר להוסיף תזכורת בתאריך ושעה - בזמן הזה נשלחת התראה מהאפליקציה
   (cron כל דקה: mgr_todo_reminders_due → push_outbox → push-send). השרת: mgr_todo_list/_save/_done/_remove.
   ================================================================ */
const MHS = { section: (()=>{ try{ return sessionStorage.getItem("cst_mh_section")||""; }catch(e){ return ""; } })() };
const TD = { data:null, loading:false, token:null, form:null, busy:false, error:null, showDone:false, delAsk:null, showSent:true, sentAsk:null };
function tdLoad(App, ms, force){
  if(TD.token !== ms.token){ TD.token = ms.token; TD.data = null; TD.form = null; TD.showDone = false; }
  if(TD.loading || (TD.data && !force)) return;
  TD.loading = true;
  App.apiRpc("mgr_todo_list", {p_token:ms.token}).then(d=>{ TD.data = d || {open:[], done:[]}; TD.loading = false; App.render(); })
    .catch(e=>{ TD.loading = false; TD.data = {open:[], done:[], error:e.message}; App.render(); });
}
function tdSync(){
  if(!TD.form) return;
  const v = id=>{ const x = document.getElementById(id); return x ? x.value : undefined; };
  ["title","notes","due","tfrom","tto","remind","to"].forEach(k=>{ const x = v("td_"+k); if(x!==undefined) TD.form[k] = x; });
  const tr = document.getElementById("td_track"); if(tr) TD.form.track = tr.checked;
}
function tdDefaultRemind(due, tfrom){
  const p = n=>String(n).padStart(2,"0");
  let d = due ? new Date(due+"T"+(tfrom||"08:00")) : new Date(Date.now()+86400000);
  if(!due) d.setHours(8,0,0,0);
  if(d.getTime() < Date.now()) d = new Date(Date.now()+3600000);
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function renderTodoCard(App, ms){
  tdLoad(App, ms);
  const esc = App.escapeHtml;
  const today = App.fmtDate(new Date());
  const d = TD.data, open = d ? d.open||[] : [], done = d ? d.done||[] : [];
  const f = TD.form;
  const form = f ? `<div class="todo-form">
      ${(d && d.can_assign && !f.id) ? (()=>{
        // (2026-10-23, סרגיי) לכל אחד: מנהלים וקב"טים, ועובדים לפי גזרה
        const wg = {}; (d.workers||[]).forEach(w=>{ (wg[w.team||"ללא גזרה"] = wg[w.team||"ללא גזרה"] || []).push(w); });
        return `<div class="field"><label>למי המשימה</label><select id="td_to" data-action="portal-todo-to">
          <option value="">לי (משימה שלי)</option>
          <optgroup label="👔 מנהלים וקב&quot;טים">${(d.people||[]).map(p=>`<option value="m:${p.id}"${f.to==="m:"+p.id?" selected":""}>${esc(p.name)}</option>`).join("")}</optgroup>
          ${Object.keys(wg).map(g=>`<optgroup label="👷 עובדים — ${esc(g)}">${wg[g].map(w=>`<option value="w:${w.id}"${f.to==="w:"+w.id?" selected":""}>${esc(w.name)}</option>`).join("")}</optgroup>`).join("")}
        </select></div>
        ${f.to ? `<label class="portal-opt" style="margin:-4px 0 8px;"><input type="checkbox" id="td_track" ${f.track!==false?"checked":""}> 👁 <b>מעקב</b> — המשימה תופיע גם אצלי ב"משימות ששלחתי", עם הסטטוס שלה, ואקבל התראה כשתבוצע</label>
          <p class="muted" style="font-size:.82em;margin:-4px 0 8px;">בלי מעקב — המשימה מופיעה רק אצל מי שמקבל אותה.</p>` : ""}`; })() : ""}
      <div class="field"><label>מה צריך לעשות</label><input type="text" id="td_title" maxlength="300" value="${esc(f.title||"")}" placeholder="למשל: לבדוק ציוד בעמדה, לחזור לאלירן"></div>
      <div class="field"><label>פרטים <span class="muted">(לא חובה)</span></label><textarea id="td_notes" rows="2" maxlength="3000">${esc(f.notes||"")}</textarea></div>
      <div class="row">
        <div class="field"><label>תאריך <span class="muted">(לא חובה)</span></label><input type="date" id="td_due" value="${esc(f.due||"")}"></div>
        <div class="field"><label>משעה <span class="muted">(לא חובה)</span></label><input type="time" id="td_tfrom" value="${esc(f.tfrom||"")}"></div>
        <div class="field"><label>עד שעה <span class="muted">(לא חובה)</span></label><input type="time" id="td_tto" value="${esc(f.tto||"")}"></div>
        <div class="field"><label>תזכורת</label>
          ${f.remindOn ? `<input type="datetime-local" id="td_remind" value="${esc(f.remind||"")}">
             <span class="backlink" style="margin:4px 0 0;" data-action="portal-todo-remind-toggle">✖ בלי תזכורת</span>`
           : `<button class="btn small secondary" data-action="portal-todo-remind-toggle">⏰ הוספת תזכורת עם התראה</button>`}
        </div>
      </div>
      ${f.remindOn ? `<p class="muted" style="font-size:.82em;margin:0 0 6px;">ההתראה תגיע בזמן שנבחר למכשירים שבהם הפעלת התראות מהאפליקציה.</p>` : ""}
      ${TD.error ? `<p class="shortage">${esc(TD.error)}</p>` : ""}
      <div class="flexbar" style="gap:6px;">
        <button class="btn ok" data-action="portal-todo-save" ${TD.busy?"disabled":""}>${TD.busy?"שומר...":(f.id?"שמירה":"➕ הוספה")}</button>
        <button class="btn secondary" data-action="portal-todo-cancel">ביטול</button>
      </div></div>` : "";
  const chips = t=>{
    const out = [];
    if(t.assigned_by_name) out.push(`<span class="todo-chip" style="background:#efe7fb;">👤 מאת ${esc(t.assigned_by_name)}</span>`);
    const tm = t.time_from ? ` · <span dir="ltr">${esc(t.time_from)}${t.time_to?`–${esc(t.time_to)}`:""}</span>` : (t.time_to ? ` · עד <span dir="ltr">${esc(t.time_to)}</span>` : "");
    if(t.due) out.push(`<span class="todo-chip${String(t.due)<today?" late":""}">📅 ${esc(fmtD(App, t.due))}${tm}</span>`);
    else if(tm) out.push(`<span class="todo-chip">🕒${tm.replace(" · "," ")}</span>`);
    if(t.remind_at) out.push(`<span class="todo-chip${t.reminded_at?" rang":""}">${t.reminded_at?"🔔":"⏰"} ${esc(fmtDT(App, t.remind_at))}</span>`);
    return out.join("");
  };
  const row = t=>`<div class="todo-row${t.reminded_at?" rang":""}">
      <button class="todo-check" data-action="portal-todo-done" data-id="${t.id}" title="סימון כבוצע">✔</button>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;">${esc(t.title)}</div>
        ${t.notes?`<div class="muted" style="font-size:.86em;white-space:pre-wrap;">${esc(t.notes)}</div>`:""}
        <div>${chips(t)}</div>
      </div>
      ${TD.delAsk===t.id ? `<span style="white-space:nowrap;"><button class="btn small" style="background:#b42318;border-color:#b42318;" data-action="portal-todo-del" data-id="${t.id}">מחק</button>
          <button class="btn small secondary" data-action="portal-todo-del-no">לא</button></span>`
        : `<span style="white-space:nowrap;"><button class="btn small secondary" data-action="portal-todo-edit" data-id="${t.id}" title="עריכה">✏️</button>
          <button class="btn small secondary" data-action="portal-todo-del-ask" data-id="${t.id}" title="מחיקה">🗑</button></span>`}
    </div>`;
  const doneRow = t=>`<div class="todo-row done">
      <span style="flex:1;"><s>${esc(t.title)}</s> <span class="muted" style="font-size:.82em;">· בוצע ${esc(fmtDT(App, t.done_at))}</span></span>
      <button class="btn small secondary" data-action="portal-todo-undo" data-id="${t.id}">↩ החזר</button>
      <button class="btn small secondary" data-action="portal-todo-del" data-id="${t.id}" title="מחיקה">🗑</button></div>`;
  return `<style>
    .todo-row{display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);}
    .todo-row.rang{background:#fff8e6;}
    .todo-row.done{align-items:center;color:var(--muted);}
    .todo-check{width:30px;height:30px;flex:0 0 30px;border-radius:50%;border:2px solid var(--primary);background:#fff;color:transparent;cursor:pointer;font-weight:800;}
    .todo-check:hover{color:var(--primary);}
    .todo-chip{display:inline-block;font-size:.8em;background:#eef3fa;border-radius:10px;padding:1px 8px;margin:3px 0 0 6px;}
    .todo-chip.late{background:#fde8e6;color:#b42318;font-weight:600;}
    .todo-chip.rang{background:#fff1c2;}
    .todo-form{background:#f6fbff;border:1px solid var(--border);border-radius:10px;padding:10px;margin:8px 0;}
  </style>
  <div class="card">
    <div class="flexbar" style="justify-content:space-between;">
      <h3 style="margin:0;">📝 המשימות שלי${open.length?` <span class="muted" style="font-size:.8em;font-weight:400;">(${open.length})</span>`:""}</h3>
      ${f ? "" : `<button class="btn small" data-action="portal-todo-new">➕ משימה חדשה</button>`}
    </div>
    <p class="muted" style="font-size:.82em;margin:4px 0 0;">רק את/ה רואה את המשימות האלה.${d && d.can_assign ? " אפשר גם לשבץ משימה לכל מנהל או עובד — בטופס \"משימה חדשה\"." : ""}</p>
    ${TD.sentMsg ? `<p style="color:#1b7f3b;font-weight:600;margin:6px 0 0;">${esc(TD.sentMsg)}</p>` : ""}
    ${form}
    ${!d ? `<p class="muted">טוען...</p>` : d.error ? `<p class="shortage">${esc(d.error)}</p>`
      : (open.length ? open.map(row).join("") : (f ? "" : `<p class="muted" style="margin:8px 0 0;">אין משימות פתוחות.</p>`))}
    ${!f && TD.error ? `<p class="shortage">${esc(TD.error)}</p>` : ""}
    ${(d && (d.sent||[]).length) ? (()=>{ const sent = d.sent, openN = sent.filter(t=>!t.done_at && !t.removed_at).length;
      const st = t=> t.removed_at ? `<span class="todo-chip">🗑 בוטלה</span>` : t.done_at ? `<span class="todo-chip" style="background:#e3f4e8;color:#1b7f3b;font-weight:600;">✅ בוצעה ${esc(fmtDT(App, t.done_at))}</span>` : `<span class="todo-chip" style="background:#fff3cd;color:#7a5200;font-weight:600;">⏳ פתוחה</span>`;
      return `<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px;">
        <span class="backlink" data-action="portal-todo-sent-toggle">${TD.showSent?"▲":"▼"} 📤 משימות ששלחתי (במעקב) — ${openN} פתוחות מתוך ${sent.length}</span>
        ${TD.showSent ? sent.map(t=>`<div class="todo-row${t.done_at||t.removed_at?" done":""}"><div style="flex:1;min-width:0;">
            <div style="font-weight:600;">${esc(t.title)} <span class="muted" style="font-weight:400;font-size:.88em;">← ${t.to_kind==="w"?"👷":"👔"} ${esc(t.to_name||"")}</span></div>
            ${t.notes?`<div class="muted" style="font-size:.86em;white-space:pre-wrap;">${esc(t.notes)}</div>`:""}
            <div>${st(t)}${chips(Object.assign({}, t, {remind_at:null}))}</div></div>
            ${(!t.done_at && !t.removed_at) ? (TD.sentAsk===t.id ? `<span style="white-space:nowrap;"><button class="btn small" style="background:#b42318;border-color:#b42318;" data-action="portal-todo-sent-cancel" data-id="${t.id}">לבטל</button> <button class="btn small secondary" data-action="portal-todo-sent-cancel-no">לא</button></span>`
              : `<button class="btn small secondary" data-action="portal-todo-sent-cancel-ask" data-id="${t.id}" title="ביטול המשימה אצל המקבל">ביטול</button>`) : ""}
          </div>`).join("") : ""}</div>`; })() : ""}
    ${done.length ? `<div style="margin-top:8px;"><span class="backlink" data-action="portal-todo-show-done">${TD.showDone?"▲ הסתר":"▼"} משימות שבוצעו (${done.length})</span>
      ${TD.showDone ? done.map(doneRow).join("") : ""}</div>` : ""}
  </div>`;
}
async function todoAction(App, a, el){
  const ms = loadMgr(App); if(!ms) return;
  const id = el && el.dataset ? el.dataset.id : null;
  const all = TD.data ? (TD.data.open||[]).concat(TD.data.done||[]) : [];
  if(a==="portal-todo-to") return; // נבחר דרך "change" (ראו onChangeTraining) - לחיצה על הרשימה לא מרעננת את המסך
  if(a==="portal-todo-sent-cancel-ask"){ TD.sentAsk = id; return App.render(); }
  if(a==="portal-todo-sent-cancel-no"){ TD.sentAsk = null; return App.render(); }
  if(a==="portal-todo-sent-toggle"){ TD.showSent = !TD.showSent; return App.render(); }
  if(a==="portal-todo-new"){ TD.form = {remindOn:false}; TD.error = null; return App.render(); }
  if(a==="portal-todo-cancel"){ TD.form = null; TD.error = null; return App.render(); }
  if(a==="portal-todo-edit"){
    const t = all.find(x=>x.id===id); if(!t) return;
    TD.form = {id:t.id, title:t.title, notes:t.notes||"", due:t.due||"", tfrom:t.time_from||"", tto:t.time_to||"", remindOn:!!t.remind_at, remind:t.remind_at?toLocalInput(t.remind_at):""};
    TD.error = null; window.scrollTo(0,0); return App.render();
  }
  if(a==="portal-todo-remind-toggle"){ tdSync(); TD.form.remindOn = !TD.form.remindOn; if(TD.form.remindOn && !TD.form.remind) TD.form.remind = tdDefaultRemind(TD.form.due, TD.form.tfrom); return App.render(); }
  if(a==="portal-todo-show-done"){ TD.showDone = !TD.showDone; return App.render(); }
  if(a==="portal-todo-del-ask"){ TD.delAsk = id; return App.render(); }
  if(a==="portal-todo-del-no"){ TD.delAsk = null; return App.render(); }
  if(TD.busy) return;
  try{
    if(a==="portal-todo-save"){
      tdSync(); const f = TD.form;
      if(!(f.title||"").trim()){ TD.error = "צריך לכתוב מה המשימה"; return App.render(); }
      let remindIso = null;
      if(f.remindOn){
        if(!f.remind){ TD.error = "בחרו תאריך ושעה לתזכורת"; return App.render(); }
        const dt = new Date(f.remind);
        if(isNaN(dt)){ TD.error = "זמן התזכורת לא תקין"; return App.render(); }
        remindIso = dt.toISOString();
      }
      TD.busy = true; TD.error = null; App.render();
      const base = {p_token:ms.token, p_id:f.id||null, p_title:f.title, p_notes:f.notes||null, p_due:f.due||null, p_remind_at:remindIso};
      if(!f.id && f.to){
        const [kind, toId] = f.to.split(":");
        await App.apiRpc("mgr_todo_assign2", {p_token:ms.token, p_to_kind:kind, p_to:toId, p_title:f.title, p_notes:f.notes||null, p_due:f.due||null, p_time_from:f.tfrom||null, p_time_to:f.tto||null, p_remind_at:remindIso, p_track:f.track!==false});
        const who = (kind==="w" ? (TD.data && TD.data.workers) : (TD.data && TD.data.people) || []).find(p=>p.id===toId);
        TD.form = null; TD.busy = false; TD.error = null; TD.sentMsg = `✅ המשימה נשלחה ל${who?who.name:""}`;
        setTimeout(()=>{ TD.sentMsg = null; App.render(); }, 6000);
        tdLoad(App, ms, true); return App.render();
      }
      try{ await App.apiRpc("mgr_todo_save2", Object.assign({}, base, {p_time_from:f.tfrom||null, p_time_to:f.tto||null})); }
      catch(e2){ if(/mgr_todo_save2|function|404/i.test(e2.message)) await App.apiRpc("mgr_todo_save", base); else throw e2; }
      TD.form = null;
    }
    else if(a==="portal-todo-done" || a==="portal-todo-undo"){ TD.busy = true; await App.apiRpc("mgr_todo_done", {p_token:ms.token, p_id:id, p_done: a==="portal-todo-done"}); }
    else if(a==="portal-todo-sent-cancel"){ TD.busy = true; TD.sentAsk = null; await App.apiRpc("mgr_todo_sent_cancel", {p_token:ms.token, p_id:id}); }
    else if(a==="portal-todo-del"){ TD.busy = true; TD.delAsk = null; await App.apiRpc("mgr_todo_remove", {p_token:ms.token, p_id:id}); }
    TD.busy = false; TD.error = null;
    tdLoad(App, ms, true);
  }catch(e){ TD.busy = false; TD.error = /session expired/i.test(e.message) ? "פג תוקף ההתחברות — צריך להתחבר מחדש" : e.message; }
  App.render();
}

/* ================================================================
   משימה למוקד (2026-10-25, סרגיי): באיזור האישי, בתוך "מוקד" - שולחים משימה לאפליקציית המוקד: מה לעשות, מתי
   ולמי (כל המוקד / מוקדן / אחמ"ש). במוקד קופצת מיד הודעה "משימה חדשה" עם צליל, ובזמן הביצוע - תזכורת.
   כשהמוקד מסמן "בוצע" - מגיעה התראה לטלפון (push_outbox). המוקד עצמו יכול גם להשאיר משימה למשמרת הבאה.
   השרת (בפרויקט moked-tracker: moked-app/server/run-2026-10-25-tasks.sql): rpc_moked_task_add / _sent / _remove.
   ================================================================ */
const MT = { data:null, loading:false, token:null, form:null, busy:false, error:null, msg:null, delAsk:null, missing:false };
function mtLoad(App, ms, force){
  if(MT.token !== ms.token){ MT.token = ms.token; MT.data = null; MT.form = null; MT.missing = false; }
  if(MT.loading || MT.missing || (MT.data && !force)) return;
  MT.loading = true;
  App.apiRpc("rpc_moked_task_sent", {p_token:ms.token}).then(d=>{ MT.data = Array.isArray(d) ? d : []; MT.loading = false; App.render(); })
    .catch(e=>{ MT.loading = false; MT.data = [];
      if(/rpc_moked_task_sent|Could not find the function/i.test(e.message)) MT.missing = true; else MT.error = e.message;
      App.render(); });
}
function mtSync(){
  if(!MT.form) return;
  ["title","note","date","time","role"].forEach(k=>{ const x = document.getElementById("mt_"+k); if(x) MT.form[k] = x.value; });
}
function mtWhen(d){ const p = n=>String(n).padStart(2,"0"); return {date:`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`, time:`${p(d.getHours())}:${p(d.getMinutes())}`}; }
function renderMokedTaskCard(App, ms){
  mtSync();   // רענון של המסך לא מוחק מה שכבר הוקלד בטופס
  mtLoad(App, ms);
  const esc = App.escapeHtml, f = MT.form, RL = {all:"כל המוקד", disp:"מוקדן", lead:'אחמ"ש'};
  const style = `<style>
    .mt-row{display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);}
    .mt-row.off{color:var(--muted);}
    .mt-chip{display:inline-block;font-size:.8em;background:#eef3fa;border-radius:10px;padding:1px 8px;margin:3px 0 0 6px;}
    .mt-form{background:#f6fbff;border:1px solid var(--border);border-radius:10px;padding:10px;margin:8px 0;}
  </style>`;
  if(MT.missing) return `${style}<div class="card"><h3 style="margin:0;">📨 משימה למוקד</h3>
    <p class="muted" style="margin:6px 0 0;">כדי לשלוח משימות למוקד צריך להריץ פעם אחת את קובץ העדכון <b dir="ltr">run-2026-10-25-tasks.sql</b> ב-Supabase.</p></div>`;
  const list = MT.data || [];
  const st = t=> t.removed_at ? `<span class="mt-chip">🗑 בוטלה</span>`
    : t.done_at ? `<span class="mt-chip" style="background:#e3f4e8;color:#1b7f3b;font-weight:600;">✅ בוצעה ${esc(fmtDT(App, t.done_at))}${t.done_by?` · ${esc(t.done_by)}`:""}</span>`
    : `<span class="mt-chip" style="background:#fff3cd;color:#7a5200;font-weight:600;">⏳ ממתינה במוקד</span>`;
  const form = f ? `<div class="mt-form">
      <div class="field"><label>מה המוקד צריך לעשות</label><input type="text" id="mt_title" maxlength="300" value="${esc(f.title||"")}" placeholder="למשל: לבדוק מול קב&quot;ט באר שבע למה אין סידור לשבוע הבא"></div>
      <div class="field"><label>פרטים <span class="muted">(לא חובה)</span></label><textarea id="mt_note" rows="2" maxlength="2000">${esc(f.note||"")}</textarea></div>
      <div class="row">
        <div class="field"><label>תאריך</label><input type="date" id="mt_date" value="${esc(f.date||"")}"></div>
        <div class="field"><label>שעה</label><input type="time" id="mt_time" value="${esc(f.time||"")}">
          <span class="backlink" style="margin:4px 0 0;" data-action="portal-mt-now">⚡ לביצוע עכשיו</span></div>
        <div class="field"><label>למי במוקד</label><select id="mt_role">${["all","disp","lead"].map(r=>`<option value="${r}"${(f.role||"all")===r?" selected":""}>${RL[r]}</option>`).join("")}</select></div>
      </div>
      <p class="muted" style="font-size:.82em;margin:0 0 6px;">במוקד המשימה קופצת מיד עם צליל, ושוב בשעה שנבחרה — במשמרת שבה היא צריכה להתבצע. כשהמוקד מסמן "בוצע" תגיע אליך התראה.</p>
      ${MT.error ? `<p class="shortage">${esc(MT.error)}</p>` : ""}
      <div class="flexbar" style="gap:6px;">
        <button class="btn ok" data-action="portal-mt-send" ${MT.busy?"disabled":""}>${MT.busy?"שולח...":"📨 שליחה למוקד"}</button>
        <button class="btn secondary" data-action="portal-mt-cancel">ביטול</button>
      </div></div>` : "";
  const row = t=>{ const off = t.done_at || t.removed_at;
    return `<div class="mt-row${off?" off":""}"><div style="flex:1;min-width:0;">
      <div style="font-weight:600;">${off&&t.removed_at?`<s>${esc(t.title)}</s>`:esc(t.title)}</div>
      ${t.note?`<div class="muted" style="font-size:.86em;white-space:pre-wrap;">${esc(t.note)}</div>`:""}
      <div>${st(t)}<span class="mt-chip">🕒 ${esc(fmtDT(App, t.due_at))}</span><span class="mt-chip">👤 ${esc(RL[t.role]||"")}</span></div></div>
      ${off ? "" : (MT.delAsk===t.id ? `<span style="white-space:nowrap;"><button class="btn small" style="background:#b42318;border-color:#b42318;" data-action="portal-mt-del" data-id="${t.id}">לבטל</button> <button class="btn small secondary" data-action="portal-mt-del-no">לא</button></span>`
        : `<button class="btn small secondary" data-action="portal-mt-del-ask" data-id="${t.id}" title="ביטול המשימה במוקד">ביטול</button>`)}
    </div>`; };
  const openN = list.filter(t=>!t.done_at && !t.removed_at).length;
  return `${style}<div class="card">
    <div class="flexbar" style="justify-content:space-between;">
      <h3 style="margin:0;">📨 משימה למוקד${openN?` <span class="muted" style="font-size:.8em;font-weight:400;">(${openN} ממתינות)</span>`:""}</h3>
      <span>${f ? "" : `<button class="btn small" data-action="portal-mt-new">➕ משימה חדשה למוקד</button>`} <button class="btn small secondary" data-action="portal-mt-refresh" title="רענון הסטטוס">🔄</button></span>
    </div>
    <p class="muted" style="font-size:.82em;margin:4px 0 0;">המשימה מופיעה באפליקציית המוקד ("✅ משימות") וקופצת שם עם צליל. כאן רואים אם בוצעה ומי ביצע.</p>
    ${MT.msg ? `<p style="color:#1b7f3b;font-weight:600;margin:6px 0 0;">${esc(MT.msg)}</p>` : ""}
    ${form}
    ${!f && MT.error ? `<p class="shortage">${esc(MT.error)}</p>` : ""}
    ${MT.data===null ? `<p class="muted">טוען...</p>` : list.length ? list.map(row).join("") : (f ? "" : `<p class="muted" style="margin:8px 0 0;">עוד לא נשלחו משימות למוקד בשבועיים האחרונים.</p>`)}
  </div>`;
}
async function mtAction(App, a, el){
  const ms = loadMgr(App); if(!ms) return;
  const id = el && el.dataset ? el.dataset.id : null;
  if(a==="portal-mt-new"){ const d = new Date(Date.now()+30*60000); d.setMinutes(Math.ceil(d.getMinutes()/15)*15, 0, 0); MT.form = Object.assign({role:"all"}, mtWhen(d)); MT.error = null; MT.msg = null; App.render(); const x = document.getElementById("mt_title"); if(x) x.focus(); return; }
  if(a==="portal-mt-cancel"){ MT.form = null; MT.error = null; return App.render(); }
  if(a==="portal-mt-now"){ mtSync(); Object.assign(MT.form, mtWhen(new Date())); return App.render(); }
  if(a==="portal-mt-refresh"){ MT.error = null; mtLoad(App, ms, true); return App.render(); }
  if(a==="portal-mt-del-ask"){ MT.delAsk = id; return App.render(); }
  if(a==="portal-mt-del-no"){ MT.delAsk = null; return App.render(); }
  if(MT.busy) return;
  try{
    if(a==="portal-mt-send"){
      mtSync(); const f = MT.form;
      if(!(f.title||"").trim()){ MT.error = "צריך לכתוב מה המשימה"; return App.render(); }
      if(!f.date || !f.time){ MT.error = "בחרו תאריך ושעה לביצוע"; return App.render(); }
      const due = new Date(f.date+"T"+f.time);
      if(isNaN(due)){ MT.error = "התאריך או השעה לא תקינים"; return App.render(); }
      if(due.getTime() < Date.now() - 10*60000){ MT.error = "הזמן שנבחר כבר עבר — בחרו זמן עתידי (או \"לביצוע עכשיו\")"; return App.render(); }
      MT.busy = true; MT.error = null; App.render();
      await App.apiRpc("rpc_moked_task_add", {p_token:ms.token, p_title:f.title.trim(), p_note:(f.note||"").trim()||null, p_due_at:due.toISOString(), p_has_time:true, p_role:f.role||"all", p_by:null});
      MT.form = null; MT.msg = "✅ המשימה נשלחה למוקד"; setTimeout(()=>{ MT.msg = null; App.render(); }, 6000);
    }
    else if(a==="portal-mt-del"){ MT.busy = true; MT.delAsk = null; await App.apiRpc("rpc_moked_task_remove", {p_token:ms.token, p_id:id, p_by:null}); }
    MT.busy = false; MT.error = null;
    mtLoad(App, ms, true);
  }catch(e){ MT.busy = false; MT.error = /session expired/i.test(e.message) ? "פג תוקף ההתחברות — צריך להתחבר מחדש" : e.message; }
  App.render();
}

/* ================================================================
   סטטוס התחברות משתמשים (2026-10-21, סרגיי): לסרגיי בלבד - לכל מאבטח/מוקדן ולכל מנהל: מחובר עכשיו (יש סשן
   בתוקף), התראות פעילות, כניסה אחרונה ומספר כניסות. השרת: admin_login_status (רישום כניסות: user_logins).
   ================================================================ */
const LS = { data:null, loading:false, filter:"all" };
function lsLoad(App, ms){
  if(LS.loading) return; LS.loading = true;
  App.apiRpc("admin_login_status", {p_token:ms.token}).then(d=>{ LS.data = d; LS.loading = false; App.render(); })
    .catch(e=>{ LS.data = {error:e.message}; LS.loading = false; App.render(); });
}
function lsState(u){ return !u.active ? "off" : (u.push ? "ok" : "nopush"); }
function renderLoginStatus(App, ms, wrap, loading){
  // (2026-10-22, סרגיי: "סטטוס מחוברים בחלוקה לפי גזרות") - טבלת סיכום לכל גזרה למעלה, ומתחתיה כל גזרה
  // כרשימה נפתחת: קודם מחוברים עם התראות, אחר כך מחוברים בלי התראות, ובסוף מי שלא מחובר.
  const esc = App.escapeHtml;
  if(!LS.data){ lsLoad(App, ms); return loading(); }
  if(LS.data.error) return wrap(`<p class="shortage">${esc(LS.data.error)}</p>`);
  const ws = LS.data.workers||[], mgs = LS.data.managers||[], all = ws.concat(mgs);
  const cnt = st=>all.filter(u=>lsState(u)===st).length;
  // לפי תאריך בלוח השנה (2026-10-23, סרגיי: "כתוב 22/10 ובסוגריים היום") - לא לפי 24 שעות אחורה
  const ago = iso=>{ if(!iso) return ""; const a = new Date(iso), n = new Date();
    const d = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
    return d<=0 ? "היום" : d===1 ? "אתמול" : `לפני ${d} ימים`; };
  const devOf = u=>{ const d = u.device || (!u.ua ? "" : /iPhone|iPad/i.test(u.ua) ? "iPhone" : /Android/i.test(u.ua) ? "Android" : /Windows|Macintosh|Linux/i.test(u.ua) ? "מחשב" : "");
    const dn = d==="iPhone" ? "📱 אייפון" : d==="Android" ? "📱 אנדרואיד" : d ? "💻 מחשב" : "";
    const md = u.app_mode==="app" ? `<span class="ls-b app">📲 אפליקציה מותקנת</span>` : u.app_mode==="browser" ? `<span class="ls-b br">🌐 דפדפן</span>` : "";
    return [md, dn ? `<span class="muted" style="font-size:.8em;">${dn}</span>` : ""].filter(Boolean).join(" "); };
  const badge = {ok:`<span class="ls-b ok">🟢 מחובר + התראות</span>`, nopush:`<span class="ls-b warn">🟡 מחובר, בלי התראות</span>`, off:`<span class="ls-b off">⚪ לא מחובר</span>`};
  const ord = {ok:0, nopush:1, off:2};
  const f = LS.filter;
  const show = u=> f==="all" || lsState(u)===f;
  const row = u=>`<div class="ls-row"><span class="ls-name">${esc(u.name)}${u.role?` <span class="muted" style="font-size:.8em;">${esc(u.role)}</span>`:""}</span>${badge[lsState(u)]} ${devOf(u)}
      <span class="muted ls-when">${u.last_at ? `כניסה אחרונה: ${esc(fmtDT(App, u.last_at))} (${ago(u.last_at)})${u.logins>1?` · ${u.logins} כניסות`:""}` : "לא נרשמה כניסה"}${u.seen_at?` · פעיל לאחרונה ${ago(u.seen_at)}`:""}${u.push_ok_at?` · התראה אחרונה נמסרה ${ago(u.push_ok_at)}`:""}</span></div>`;
  const groups = []; const gIdx = {};
  const add = (title, u)=>{ if(!(title in gIdx)){ gIdx[title] = groups.length; groups.push({title, list:[]}); } groups[gIdx[title]].list.push(u); };
  mgs.forEach(u=>add("מנהלים וקב\"טים", u));
  ws.forEach(u=>add(u.team||"ללא צוות", u));
  groups.forEach(g=>g.list.sort((x,y)=> ord[lsState(x)]-ord[lsState(y)] || String(x.name).localeCompare(String(y.name), "he")));
  const stats = list=>({ok:list.filter(u=>lsState(u)==="ok").length, nopush:list.filter(u=>lsState(u)==="nopush").length, off:list.filter(u=>lsState(u)==="off").length, n:list.length});
  const tot = stats(all);
  const summary = `<div style="overflow-x:auto;"><table class="ls-sum"><thead><tr><th>גזרה</th><th>🟢 מחוברים + התראות</th><th>🟡 בלי התראות</th><th>⚪ לא מחוברים</th><th>סה"כ</th></tr></thead><tbody>
      ${groups.map((g,i)=>{ const st = stats(g.list); return `<tr><td><span class="ls-jump" data-action="portal-ls-jump" data-i="${i}" style="color:var(--accent,#1c5d99);text-decoration:underline;cursor:pointer;">${esc(g.title)}</span></td><td>${st.ok}</td><td>${st.nopush}</td><td>${st.off}</td><td>${st.n}</td></tr>`; }).join("")}
      <tr class="ls-tot"><td>סה"כ</td><td>${tot.ok}</td><td>${tot.nopush}</td><td>${tot.off}</td><td>${tot.n}</td></tr></tbody></table></div>`;
  const grpHtml = (g, i)=>{ const vis = g.list.filter(show); if(!vis.length) return ""; const st = stats(g.list);
    return `<details class="ls-g" id="ls-g${i}"${f!=="all" || LS.openAll ? " open" : ""}><summary><b>${esc(g.title)}</b> <span class="muted" style="font-size:.85em;font-weight:400;">🟢 ${st.ok} · 🟡 ${st.nopush} · ⚪ ${st.off} — ${st.ok+st.nopush}/${st.n} מחוברים</span></summary>${vis.map(row).join("")}</details>`; };
  const chip = (k, label)=>`<span class="ar-chip${f===k?" on":""}" data-action="portal-ls-filter" data-k="${k}">${label}</span>`;
  return wrap(`<style>.ls-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;padding:7px 0;border-bottom:1px solid var(--border);}
      .ls-name{font-weight:600;min-width:140px;} .ls-when{font-size:.82em;flex-basis:100%;} .ls-b{font-size:.8em;border-radius:999px;padding:1px 8px;font-weight:700;}
      .ls-b.ok{background:#e3f4e8;color:#1b7f3b;} .ls-b.warn{background:#fff3cd;color:#7a5200;} .ls-b.off{background:#f1f3f5;color:#6b7280;} .ls-b.app{background:#e7f0fb;color:#0c3a6e;} .ls-b.br{background:#f1f3f5;color:#444;}
      .ls-sum{width:100%;border-collapse:collapse;font-size:.9em;margin:6px 0 10px;} .ls-sum th,.ls-sum td{border:1px solid var(--border);padding:5px 6px;text-align:center;} .ls-sum td:first-child{text-align:right;font-weight:600;}
      .ls-sum .ls-tot td{font-weight:800;background:#f6f8fa;} .ls-g{border:1px solid var(--border);border-radius:8px;padding:6px 10px;margin:8px 0;} .ls-g summary{cursor:pointer;padding:4px 0;}</style>
    <div class="flexbar" style="justify-content:space-between;flex-wrap:wrap;gap:6px;"><h2 style="margin:0;">🟢 סטטוס מחוברים</h2>
      <span><button class="btn small secondary" data-action="portal-ls-openall">${LS.openAll?"➖ לסגור הכל":"➕ לפתוח הכל"}</button> <button class="btn small secondary" data-action="portal-ls-refresh">🔄 רענון</button></span></div>
    <p class="muted" style="font-size:.85em;margin:4px 0 8px;">"מחובר" = נכנס לאיזור האישי והכניסה עדיין בתוקף (30 יום). "התראות" = הפעיל התראות במכשיר. "אפליקציה מותקנת"/"דפדפן" = מאיפה נכנס לאחרונה (נרשם מהיום). לחיצה על שם גזרה פותחת את הרשימה שלה.</p>
    ${summary}
    <div class="ar-chips" style="margin-bottom:6px;">${chip("all", `הכל (${all.length})`)}${chip("ok", `🟢 מחוברים + התראות (${cnt("ok")})`)}${chip("nopush", `🟡 בלי התראות (${cnt("nopush")})`)}${chip("off", `⚪ לא מחוברים (${cnt("off")})`)}</div>
    ${groups.map(grpHtml).join("")}
    ${!all.filter(show).length ? `<p class="muted">אין משתמשים בסינון הזה.</p>` : ""}`);
}

/* ================================================================
   משימות שקיבלתי - אצל העובד (2026-10-23, סרגיי): משימות שסרגיי/מנהל היחידה שיבצו לעובד. העובד מסמן "בוצע".
   השרת: worker_todo_list / worker_todo_done.
   ================================================================ */
const WT = { data:null, at:0, loading:false, tok:null, busy:false, showDone:false };
function wtLoad(App, session, force){
  if(WT.tok !== session.token){ WT.tok = session.token; WT.data = null; WT.at = 0; }
  if(WT.loading || (!force && WT.data && Date.now()-WT.at < 60000)) return;
  WT.loading = true;
  App.apiRpc("worker_todo_list", {p_token:session.token}).then(d=>{ WT.data = d || {open:[], done:[]}; WT.at = Date.now(); WT.loading = false; App.render(); })
    .catch(()=>{ WT.data = WT.data || {open:[], done:[]}; WT.at = Date.now(); WT.loading = false; });
}
function renderWorkerTodos(App, session){
  wtLoad(App, session);
  const d = WT.data; if(!d) return "";
  const open = d.open||[], done = d.done||[];
  if(!open.length && !done.length) return "";
  const esc = App.escapeHtml, today = App.fmtDate(new Date());
  const tm = t=> t.time_from ? ` · <span dir="ltr">${esc(t.time_from)}${t.time_to?`–${esc(t.time_to)}`:""}</span>` : "";
  return `<div class="card" style="border:2px solid #c9b3ef;">
    <h3 style="margin-top:0;">📝 משימות שקיבלתי${open.length?` <span class="muted" style="font-size:.8em;font-weight:400;">(${open.length})</span>`:""}</h3>
    ${open.length ? open.map(t=>`<div class="flexbar" style="align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
        <button class="btn small ok" data-action="portal-wtodo-done" data-id="${t.id}" ${WT.busy?"disabled":""} title="סימון כבוצע">✔ בוצע</button>
        <div style="flex:1;min-width:0;"><div style="font-weight:600;">${esc(t.title)}</div>
          ${t.notes?`<div class="muted" style="font-size:.86em;white-space:pre-wrap;">${esc(t.notes)}</div>`:""}
          <div class="muted" style="font-size:.85em;">${t.due?`📅 <span style="${String(t.due)<today?"color:#b42318;font-weight:600;":""}">${esc(fmtD(App, t.due))}</span>${tm(t)} · `:(t.time_from?`🕒${tm(t).replace(" · "," ")} · `:"")}👤 מאת ${esc(t.assigned_by_name||"")}</div></div></div>`).join("")
      : `<p class="muted" style="margin:0;">אין משימות פתוחות 👍</p>`}
    ${done.length ? `<div style="margin-top:8px;"><span class="backlink" data-action="portal-wtodo-show-done">${WT.showDone?"▲ הסתר":"▼"} משימות שביצעתי (${done.length})</span>
      ${WT.showDone ? done.map(t=>`<div class="flexbar" style="padding:6px 0;border-bottom:1px solid var(--border);gap:8px;"><span style="flex:1;" class="muted"><s>${esc(t.title)}</s> · ${esc(fmtDT(App, t.done_at))}</span>
        <button class="btn small secondary" data-action="portal-wtodo-undo" data-id="${t.id}">↩ החזר</button></div>`).join("") : ""}</div>` : ""}
  </div>`;
}
async function workerTodoAction(App, a, el){
  const session = loadSession(App); if(!session) return;
  if(a==="portal-wtodo-show-done"){ WT.showDone = !WT.showDone; return App.render(); }
  if(WT.busy) return;
  WT.busy = true; App.render();
  try{ await App.apiRpc("worker_todo_done", {p_token:session.token, p_id:el.dataset.id, p_done: a==="portal-wtodo-done"}); }catch(e){}
  WT.busy = false; wtLoad(App, session, true); App.render();
}

/* ================================================================
   המשמרות שלי - במסך המנהל (2026-10-22, סרגיי: "שאני אראה גם את המשמרות שאני משובץ אליהן, בנפרד מהמשימות").
   מנהל שרשום גם כעובד (אותו שם בדיוק) רואה את המשמרות הקרובות שלו. השרת: mgr_my_shifts.
   ================================================================ */
const MSH = { data:null, at:0, loading:false, tok:null };
function mshLoad(App, ms){
  if(MSH.tok !== ms.token){ MSH.tok = ms.token; MSH.data = null; MSH.at = 0; }
  if(MSH.loading || (MSH.data && Date.now()-MSH.at < 60000)) return;
  MSH.loading = true;
  const from = App.fmtDate(App.addDays(new Date(), -1)), to = App.fmtDate(App.addDays(new Date(), 35));
  App.apiRpc("mgr_my_shifts", {p_token:ms.token, p_from:from, p_to:to})
    .then(d=>{ MSH.data = d || {worker:false, shifts:[]}; MSH.at = Date.now(); MSH.loading = false; App.render(); })
    .catch(()=>{ MSH.data = MSH.data || {worker:false, shifts:[]}; MSH.at = Date.now(); MSH.loading = false; });
}
function renderMgrShiftsCard(App, ms){
  mshLoad(App, ms);
  const d = MSH.data; if(!d || !d.worker) return "";
  const esc = App.escapeHtml, today = App.fmtDate(new Date());
  const startMin = a=>{ const h = hoursOf(App, a); const m = h.match(/^(\d\d):(\d\d)/); return m ? (+m[1])*60 + (+m[2]) : 0; };
  const rows = (d.shifts||[]).filter(a=>a.entry_date >= today).sort((x,y)=> String(x.entry_date).localeCompare(String(y.entry_date)) || startMin(x)-startMin(y));
  const body = !rows.length ? `<p class="muted" style="margin:0;">אין משמרות קרובות.</p>` : `<div style="overflow-x:auto;"><table>
      <thead><tr><th>תאריך</th><th>משמרת</th><th>שעות</th><th>גזרה</th><th></th></tr></thead>
      <tbody>${rows.map(a=>{
        const q = quotaFor(App, a), label = App.SHIFT_LABELS[a.shift_type] || (q&&q.label) || a.shift_type;
        const notes = [];
        if(a.split_with) notes.push(`⇄ פיצול משמרת עם ${esc(a.split_with)}`);
        if(a.shadow_of_name) notes.push(`חפיפה (ח) עם ${esc(a.shadow_of_name)}`);
        if(a.filled_role) notes.push(`בתקן ${esc(a.filled_role)}`);
        if(!a.published) notes.push(`<span style="color:#8a5a00;">טרם פורסם</span>`);
        return `<tr${a.entry_date===today?' style="background:#eef6ff;"':""}><td>${App.fmtDateHeb(a.entry_date)}${a.entry_date===today?" <b>(היום)</b>":""}</td><td>${esc(label)}</td><td dir="ltr">${esc(hoursOf(App, a))}</td><td>${esc(a.sector)}</td><td class="muted">${notes.join(" · ")}</td></tr>`;
      }).join("")}</tbody></table></div>`;
  return `<div class="card"><h3 style="margin-top:0;">🗓️ המשמרות שלי</h3>${body}</div>`;
}

/* ================================================================
   עובדים נעולים (2026-10-22, סרגיי): קב"ט/סרגיי רואים במסך הבית מי ננעל אחרי 3 טעויות בקוד ופותחים לו את הנעילה
   בלחיצה (admin_unlock_worker_code עם הסשן). כשעובד ננעל - הקב"ט מקבל התראה. השרת: mgr_locked_workers.
   ================================================================ */
const LK = { list:null, at:0, loading:false, tok:null, msg:null };
function lkLoad(App, ms, force){
  if(LK.tok !== ms.token){ LK.tok = ms.token; LK.list = null; LK.at = 0; }
  if(LK.loading || (!force && LK.list && Date.now()-LK.at < 30000)) return;
  LK.loading = true;
  App.apiRpc("mgr_locked_workers", {p_token:ms.token}).then(d=>{ LK.list = d||[]; LK.at = Date.now(); LK.loading = false; App.render(); })
    .catch(()=>{ LK.loading = false; LK.at = Date.now(); });
}
function renderLockCard(App, ms){
  lkLoad(App, ms);
  const esc = App.escapeHtml, list = LK.list || [];
  if(!list.length) return LK.msg ? `<div class="card"><p style="color:#1b7f3b;font-weight:600;margin:0;">${esc(LK.msg)}</p></div>` : "";
  const mins = iso=>Math.max(1, Math.ceil((new Date(iso).getTime()-Date.now())/60000));
  return `<div class="card" style="border:2px solid #f3c4c0;background:#fff7f6;">
    <h3 style="margin-top:0;">🔒 עובדים נעולים (${list.length})</h3>
    <p class="muted" style="margin-top:-6px;font-size:.88em;">טעו בקוד האישי 3 פעמים — הכניסה שלהם נעולה ל-30 דקות. אפשר לפתוח עכשיו:</p>
    ${list.map(w=>`<div class="flexbar" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);gap:8px;">
      <span><b>${esc(w.name)}</b> <span class="muted" style="font-size:.85em;">${esc(w.team||"")} · עוד ${mins(w.locked_until)} דק׳</span></span>
      <button class="btn small ok" data-action="portal-lk-unlock" data-id="${w.id}" data-name="${esc(w.name)}">🔓 פתח נעילה</button></div>`).join("")}
    ${LK.msg ? `<p style="color:#1b7f3b;font-weight:600;">${esc(LK.msg)}</p>` : ""}
  </div>`;
}

/* ---------- עמודי משנה (view "pview") ---------- */
const PV_TITLES = { "login-status":"סטטוס מחוברים", "ar-list":"דוחות פעולה", "ar-view":"דוח פעולה", "equip-workers":"ציוד אישי לעובדים", "equip-edit":"ציוד אישי", "areq-list":"בקשות מנהלתיות", "areq-view":"בקשה מנהלתית", "dmg-new":"דיווח נזק/תאונה", "dmg-list":"דיווחי נזק", "dmg-view":"דיווח נזק/תאונה", "k-msg-guards":"הודעה למאבטחים", "k-msg-mgmt":"הודעה להנהלה", "mgmt-inbox":"הודעות מהקב\"טים", "trn-training":"לומדה", "trn-program":"סטטוס הדרכה", "trn-reports":"דו\"חות הדרכה", "trn-onboarding":"קליטת עובד חדש",
  "trn-onb-worker":"קליטת עובד חדש", "trn-controls":"סיכומי תרגילים", "trn-control-new":"סיכום בקרה חדש", "trn-posts":"פרסומים",
  "trn-post-new":"פרסום חדש", "trn-programs":"סטטוס הדרכות", "trn-material":"חומר מקצועי", "swap-mgr":"בקשת חילוף", "swap-hist":"היסטוריית החלפות", "trn-quiz-new":"בוחן חדש", "trn-quiz-edit":"עריכת בוחן", "trn-quiz-view":"בוחן", "trn-quiz-history":"היסטוריית בחנים", "trn-results":"תוצאות בחנים", "trn-lomdas":"לומדה ובחנים", "trn-contents":"תוכן עיוני וסרטונים", "trn-content-views":"תוכן עיוני וסרטונים", "k-controls":"סיכומי תרגילים", "k-feed":"תכנים והודעות", "control":"סיכום בקרת תרגיל", "post":"פרסום", "inc-list":"דו\"ח אירוע חריג", "inc-form":"דו\"ח אירוע חריג", "inc-view":"דו\"ח אירוע חריג", "inc-opts":"עריכת רשימות", "unit-dash":"לוח מנהל יחידה", "cal":"יומן משותף" };
function pvTitle(){ return PV_TITLES[PV.page] || ""; }
function pvGo(App, page, args, push){
  if(push !== false && App.S.view==="pview" && PV.page) PV.stack.push({page:PV.page, args:PV.args});
  if(App.S.view!=="pview") PV.stack = [];
  PV.page = page; PV.args = args||{}; PV.data = null; PV.posts = null; PV.seenSent = false; PV.msg = null; PV.error = null; PV.busy = false;
  if(page==="trn-control-new" || page==="trn-post-new") PV.form = {};
  if(page==="trn-quiz-new" || page==="trn-quiz-edit") PV.quiz = null;
  PV.delAsk = false;
  if(page==="swap-mgr") PV.swap = null;
  if(page==="equip-edit"){ EQM.edit = null; EQM.statusSel = null; EQM.statusFor = null; }
  if(page==="swap-hist") PV.swapHist = null;
  if(page==="login-status"){ LS.data = null; LS.filter = "all"; }
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

/* ================================================================
   הודעות קב"ט (2026-10-20, לבקשת סרגיי): מהמסך הראשי הקב"ט כותב הודעה לכלל המאבטחים (שלו, או של כל
   החברה), או הודעה להנהלה. הנהלה = מנהל מערכת (סרגיי) + מנהל היחידה - הם מקבלים פוש ורואים "הודעות מהקב"טים".
   השרת: kabat_post_create / kabat_posts_mine (פרסום kind='all' עם posts.team_ids), mgmt_msg_send / _list / _read.
   ================================================================ */
const MM = { data:null, loading:false, at:0 };
function mmLoad(App, ms, force){
  if(MM.token !== ms.token){ MM.token = ms.token; MM.data = null; MM.at = 0; } // מנהל אחר נכנס באותו מכשיר
  if(MM.loading || (!force && MM.data && Date.now()-MM.at < 60000)) return;
  MM.loading = true;
  App.apiRpc("mgmt_msg_list", {p_token:ms.token}).then(d=>{ MM.data = d; MM.at = Date.now(); MM.loading = false; App.render(); })
    .catch(()=>{ MM.loading = false; MM.at = Date.now(); });
}
/* (2026-10-25, סרגיי: "שכלל המנהלים יוכלו לראות חילופים תלויים באוויר") - בקשות חילוף פתוחות בראש העמוד של כל מנהל.
   הרשימה מתרעננת כל דקה (ובכל כניסה). מנהל מערכת / מנהל יחידה - כל הגזרות; כל השאר - הצוותים שלהם. */
const SWO = { list:null, at:0, busy:false, tok:null };
function swoLoad(App, ms, force){
  if(!SWO.timer) SWO.timer = setInterval(()=>{ try{ const m = loadMgr(App); if(m && document.visibilityState==="visible") swoLoad(App, m); }catch(e){} }, 60000);
  if(SWO.tok !== ms.token){ SWO.tok = ms.token; SWO.list = null; SWO.at = 0; }
  if(SWO.busy || (!force && SWO.at && Date.now() - SWO.at < 60000)) return;
  SWO.busy = true;
  App.apiRpc("mgr_swap_list", {p_token: ms.token}).then(r=>{ const was = JSON.stringify(SWO.list); SWO.list = r||[]; SWO.at = Date.now(); SWO.busy = false; if(was !== JSON.stringify(SWO.list)) App.render(); })
    .catch(()=>{ SWO.at = Date.now(); SWO.busy = false; if(SWO.list===null){ SWO.list = []; } });
}
function openSwapsHtml(App, list, withBtn){
  const esc = App.escapeHtml;
  return `<div class="portal-tasks">${list.map(r=>`<div class="portal-task">
      <span class="portal-task-icon">🔁</span>
      <span style="flex:1;"><b>${esc(r.worker_name)}</b> — ${App.fmtDateHeb(r.entry_date)} · ${esc(App.SHIFT_LABELS[r.shift_type]||r.shift_type)} · ${esc(r.sector)}
        <span class="muted" style="font-size:.85em;display:block;">${r.requested_by_kind==="w"?"ביקש בעצמו":"נפתח ע\"י "+esc(r.requested_by_name||"מנהל")}${r.note?` · ${esc(r.note)}`:""}</span></span></div>`).join("")}</div>
    ${withBtn?`<button class="btn small" data-action="portal-pv" data-page="swap-mgr" style="margin-top:8px;">לטיפול בבקשות</button>`:""}`;
}
function openSwapsCard(App, ms){
  swoLoad(App, ms);
  const list = SWO.list || [];
  if(!list.length) return "";
  return `<div class="card" style="border:2px solid #e8590c;background:#fff4e6;">
    <h3 style="margin:0 0 6px;">🔁 חילופים פתוחים — מחפשים מחליף (${list.length})</h3>
    ${openSwapsHtml(App, list, true)}</div>`;
}
function renderMsgCard(App, ms){
  mmLoad(App, ms);
  const isMg = MM.token===ms.token && MM.data && MM.data.is_mgmt;
  const canGuards = ms.is_admin || (ms.logistics_team_ids||[]).length > 0;
  const unread = isMg ? (MM.data.items||[]).filter(x=>!x.read && !x.mine).length : 0;
  const t = (action, page, title, sub, warn)=>`<div class="team-tile" data-action="${action}" data-page="${page}"${warn?' style="border-color:#b42318;"':""}>
      <div style="font-size:1.1em;font-weight:700;${warn?"color:#b42318;":""}">${title}</div><div class="muted" style="font-size:.85em;margin-top:4px;">${sub}</div></div>`;
  const tiles = [
    canGuards ? t("portal-pv", "k-msg-guards", "📢 הודעה למאבטחים", ms.is_admin ? "לכל המאבטחים או לגזרה" : "לכלל המאבטחים שלך") : "",
    (MM.data && !isMg) ? t("portal-pv", "k-msg-mgmt", "📨 הודעה להנהלה", "לסרגיי ולמנהל היחידה") : "",
    isMg ? t("portal-pv", "mgmt-inbox", unread ? `📨 ${unread} הודעות חדשות` : "📨 הודעות מהקב\"טים", "הודעות שנשלחו להנהלה", unread>0) : ""
  ].filter(Boolean);
  if(!tiles.length) return "";
  return `<div class="card"><h3>✉️ הודעות</h3><div class="grid-teams">${tiles.join("")}</div></div>`;
}
function renderMsgPages(App, ms, pg, wrap, loading, msgs){
  const esc = App.escapeHtml;
  const fmt = iso=>{ const d = new Date(iso); return `${d.getDate()}/${d.getMonth()+1} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
  if(pg==="k-msg-guards"){
    if(!PV.data){ pvLoad(App, "kabat_posts_mine", {p_token:ms.token}); }
    const sent = (PV.data && PV.data.r) || [];
    const hasTeams = (ms.logistics_team_ids||[]).length > 0;
    const f = PV.form || {};
    return wrap(`<h2>📢 הודעה למאבטחים</h2>
      <p class="muted" style="margin-top:-6px;">ההודעה מופיעה למאבטחים ב"עדכונים והודעות" באיזור האישי, והם מקבלים התראה.</p>
      ${hasTeams && ms.is_admin ? `<div class="field"><label>למי</label>
        <label style="display:block;margin:4px 0;"><input type="radio" name="kmsg_scope" value="mine" ${f.scope!=="all"?"checked":""}> המאבטחים שלי</label>
        <label style="display:block;margin:4px 0;"><input type="radio" name="kmsg_scope" value="all" ${f.scope==="all"?"checked":""}> כל המאבטחים בחברה</label></div>`
        : `<p><b>נשלח אל:</b> ${hasTeams ? "כלל המאבטחים שלך" : "כל המאבטחים בחברה"}</p>`}
      <div class="field"><label>כותרת</label><input type="text" id="kmsg_title" maxlength="200" value="${esc(f.title||"")}"></div>
      <div class="field"><label>תוכן ההודעה</label><textarea id="kmsg_body" rows="5" maxlength="5000">${esc(f.body||"")}</textarea></div>
      <button class="btn ok" data-action="portal-kmsg-send" ${PV.busy?"disabled":""}>${PV.busy?"שולח...":"📢 שליחה"}</button>
      ${msgs}
      ${sent.length ? `<h3 style="margin-top:18px;">הודעות ששלחת</h3>${sent.map(x=>`<div style="padding:7px 0;border-bottom:1px solid var(--border);">
          <b>${esc(x.title)}</b> <span class="muted" style="font-size:.85em;">· ${fmt(x.created_at)} · ${x.scope==="all"?"כל המאבטחים":"המאבטחים שלך"} · נקראה ע"י ${x.read}/${x.n}</span>
          ${x.body?`<div style="white-space:pre-wrap;font-size:.92em;margin-top:3px;">${esc(x.body)}</div>`:""}</div>`).join("")}` : ""}`);
  }
  if(pg==="k-msg-mgmt" || pg==="mgmt-inbox"){
    if(!PV.data){ pvLoad(App, "mgmt_msg_list", {p_token:ms.token}); return loading(); }
    if(PV.data.loading) return loading();
    const d = PV.data.r || {items:[]};
    if(pg==="mgmt-inbox"){
      const items = d.items||[];
      // סימון כנקרא - רק פעם אחת לכל הודעה שהוצגה
      items.filter(x=>!x.read && !x.mine).forEach(x=>{ x.read = true; x._new = true; App.apiRpc("mgmt_msg_read", {p_token:ms.token, p_id:x.id}).catch(()=>{}); });
      MM.data = null;
      return wrap(`<h2>📨 הודעות מהקב"טים</h2>
        ${items.length ? items.map(x=>`<div style="padding:9px 0;border-bottom:1px solid var(--border);${x._new?"background:#fff8e6;":""}">
          <div class="flexbar" style="justify-content:space-between;"><b>${esc(x.from)}${x._new?' <span class="portal-badge">חדש</span>':""}</b><span class="muted" style="font-size:.85em;">${fmt(x.created_at)}</span></div>
          <div style="white-space:pre-wrap;margin-top:4px;">${esc(x.body)}</div>
          ${(x.readers||[]).length?`<div class="muted" style="font-size:.8em;margin-top:3px;">נקראה ע"י: ${esc(x.readers.join(", "))}</div>`:""}
        </div>`).join("") : `<p class="muted">אין הודעות.</p>`}`);
    }
    const mine = (d.items||[]).filter(x=>x.mine);
    return wrap(`<h2>📨 הודעה להנהלה</h2>
      <p class="muted" style="margin-top:-6px;">ההודעה נשלחת לסרגיי ולמנהל היחידה, עם התראה.</p>
      <div class="field"><label>ההודעה</label><textarea id="mmsg_body" rows="6" maxlength="5000">${esc((PV.form||{}).body||"")}</textarea></div>
      <button class="btn ok" data-action="portal-mmsg-send" ${PV.busy?"disabled":""}>${PV.busy?"שולח...":"📨 שליחה להנהלה"}</button>
      ${msgs}
      ${mine.length ? `<h3 style="margin-top:18px;">הודעות ששלחת</h3>${mine.map(x=>`<div style="padding:7px 0;border-bottom:1px solid var(--border);">
          <span class="muted" style="font-size:.85em;">${fmt(x.created_at)} · ${(x.readers||[]).length ? "✔ נקראה ע\"י " + esc(x.readers.join(", ")) : "🕒 עוד לא נקראה"}</span>
          <div style="white-space:pre-wrap;margin-top:3px;">${esc(x.body)}</div></div>`).join("")}` : ""}`);
  }
  return null;
}
async function msgAction(App, a){
  const ms = loadMgr(App); if(!ms || PV.busy) return;
  const v = id=>{ const x = document.getElementById(id); return x ? x.value : ""; };
  try{
    if(a==="portal-kmsg-send"){
      const sc = document.querySelector('input[name="kmsg_scope"]:checked');
      const scope = sc ? sc.value : ((ms.logistics_team_ids||[]).length ? "mine" : "all");
      PV.form = {title:v("kmsg_title"), body:v("kmsg_body"), scope};
      if(!PV.form.title.trim()){ PV.error = "יש למלא כותרת"; PV.msg = null; return App.render(); }
      PV.busy = true; PV.error = null; App.render();
      await App.apiRpc("kabat_post_create", {p_token:ms.token, p_scope:scope, p_title:PV.form.title, p_body:PV.form.body});
      PV.busy = false; PV.form = {}; PV.data = null; PV.msg = "נשלח. המאבטחים יקבלו התראה ויראו את ההודעה באיזור האישי."; return App.render();
    }
    if(a==="portal-mmsg-send"){
      PV.form = {body:v("mmsg_body")};
      if(!PV.form.body.trim()){ PV.error = "ההודעה ריקה"; PV.msg = null; return App.render(); }
      PV.busy = true; PV.error = null; App.render();
      await App.apiRpc("mgmt_msg_send", {p_token:ms.token, p_body:PV.form.body});
      PV.busy = false; PV.form = {}; PV.data = null; PV.msg = "נשלח להנהלה."; return App.render();
    }
  }catch(e){ PV.busy = false; PV.error = e.message; PV.msg = null; App.render(); }
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
  if(pg==="dmg-list" || pg==="dmg-view" || pg==="dmg-new"){ const h = renderDamageMgrPages(App, ms, pg, a, wrap, loading, msgs); if(h) return h; }
  if(pg==="equip-workers" || pg==="equip-edit"){ const h = renderEquipMgrPages(App, ms, pg, a, wrap, loading, msgs); if(h) return h; }
  if(pg==="login-status") return renderLoginStatus(App, ms, wrap, loading);
  if(pg==="ar-list" || pg==="ar-view"){ const h = renderActionReportMgrPages(App, ms, pg, a, wrap, loading, msgs); if(h) return h; }
  if(pg==="areq-list" || pg==="areq-view"){ const h = renderAdminReqMgrPages(App, ms, pg, a, wrap, loading, msgs); if(h) return h; }
  if(pg==="k-msg-guards" || pg==="k-msg-mgmt" || pg==="mgmt-inbox"){ const h = renderMsgPages(App, ms, pg, wrap, loading, msgs); if(h) return h; }
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
      ${imgs.length ? imgs.map(i=>`<div style="margin:10px 0;"><div class="muted">${fmtDT(App,i.uploaded_at)}</div><img src="${safeSrc(i.image_data)}" alt="" style="max-width:100%;border:1px solid #e3e9f0;border-radius:8px;"></div>`).join("") : `<p class="muted">אין דו"חות.</p>`}`);
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
  if(pg==="swap-hist"){
    const H = PV.swapHist || (PV.swapHist = {list:null});
    if(H.list===null){ H.list = "loading";
      const secs = a.id ? App.sectorGroupForTeam(App.teamById(a.id)).citySectors : [].concat(...mgrScopeGroups(App, ms).map(g=>App.sectorGroupForTeam(App.teamById(g.id)).citySectors));
      App.apiRpc("swap_history", {p_sectors: secs, p_from: App.fmtDate(App.addDays(new Date(), -60)), p_to: App.fmtDate(App.addDays(new Date(), 90))})
        .then(r=>{ H.list = (r||[]).slice().sort((x,y)=>String(y.entry_date).localeCompare(String(x.entry_date))); App.render(); }).catch(()=>{ H.list = []; App.render(); }); }
    if(H.list==="loading") return loading();
    swoLoad(App, ms);
    const openNow = SWO.list || [];
    return wrap(`${openNow.length ? `<h2>🔁 חילופים פתוחים — מחפשים מחליף (${openNow.length})</h2>${openSwapsHtml(App, openNow, true)}<hr style="border:none;border-top:1px solid #e3e9f0;margin:14px 0;">` : `<p class="muted">אין כרגע חילופים פתוחים.</p>`}
      <h2>📜 היסטוריית החלפות</h2><p class="muted" style="margin-top:-6px;">החלפות שבוצעו בחודשיים האחרונים ובסידורים הבאים, מהחדש לישן.</p>
      ${H.list.length ? `<div class="portal-tasks">${H.list.map(r=>`<div class="portal-task"><span class="portal-task-icon">✔</span>
        <span style="flex:1;">${App.fmtDateHeb(r.entry_date)} · ${esc(App.SHIFT_LABELS[r.shift_type]||r.shift_type)} · ${esc(r.sector)}: ${esc(r.from_name)} ← <b>${esc(r.to_name||"")}</b>
        <span class="muted" style="font-size:.85em;display:block;">${r.by_kind==="m"?"סומן ע\"י "+esc(r.by_name||""):"לקח בעצמו"}</span></span></div>`).join("")}</div>` : `<p class="muted">אין החלפות בתקופה הזו.</p>`}`);
  }
  if(pg==="swap-mgr"){
    const S2 = PV.swap || (PV.swap = {teamId: a.id || null, sector:null, rows:null, sel:null, list:null});
    // הרשימה מתרעננת בכל כניסה וכל 30 שניות (2026-10-22: בקשה של צגה לא הופיעה כי הוצגה רשימה ישנה)
    if(S2.list===null) S2.list = [];
    if(!S2.listBusy && (!S2.listAt || Date.now()-S2.listAt > 30000)){ S2.listBusy = true;
      App.apiRpc("mgr_swap_list", {p_token:tok}).then(r=>{ S2.list = r||[]; S2.listAt = Date.now(); S2.listBusy = false; App.render(); })
        .catch(()=>{ S2.listAt = Date.now(); S2.listBusy = false; }); }
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
    // (2026-10-22, סרגיי) ההיסטוריה לא מוצגת ישר - לחצן שמעביר לעמוד שלה
    const histHtml = (S2.hist && S2.hist.length) ? `<div style="margin-top:16px;"><button class="btn secondary" data-action="portal-pv" data-page="swap-hist"${S2.teamId?` data-id="${S2.teamId}"`:""}>📜 היסטוריית החלפות (${S2.hist.length})</button></div>` : "";
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
  const res = await (App.netFetch || fetch)(App.SUPABASE_URL + "/functions/v1/portal-files", {method:"POST",
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
  if(a==="portal-todo-to"){ tdSync(); return App.render(); }
  if(a==="portal-swap-sel"){ SW.sel = t.dataset.k; SW.error = null; return; }
  if(a==="portal-swapm-sel"){ if(PV.swap) PV.swap.sel = t.dataset.k; PV.error = null; return; }
  if(a==="portal-swapm-hsel"){ if(PV.swap) PV.swap.hsel = t.dataset.w; PV.error = null; return; }
  if(a==="portal-quiz-answer"){ if(T.quiz){ T.quiz.answers[+t.dataset.q] = +t.dataset.o; T.quiz.error = null; } return; }
  if(a==="portal-dmg-item"){
    const all = [...document.querySelectorAll(".dmg-item")];
    if(t.checked && t.value==="ללא נזק") all.forEach(x=>{ if(x!==t) x.checked = false; });
    else if(t.checked) all.forEach(x=>{ if(x.value==="ללא נזק") x.checked = false; });
    const sel = all.filter(x=>x.checked).map(x=>x.value), sum = document.getElementById("dmgItemsSum");
    if(sum) sum.innerHTML = sel.length ? "נבחר: " + App.escapeHtml(sel.join(", ")) : '<span class="muted">לא נבחר עדיין</span>';
    return;
  }
  if(a==="portal-dmg-tp"){
    dmgCollect();
    if(t.value==="כן"){ if(!DMG.parties.some(isTP)) DMG.parties.push(dmgNewParty("צד ג׳ — נהג")); }
    else DMG.parties = DMG.parties.filter(pt=>!isTP(pt));
    return App.render();
  }
  if(a==="portal-areq-files" || a==="portal-areq-addfile") return areqOnChange(App, t);
  if(a==="portal-ar-files") return arFiles(App, t);
  if(a==="portal-dmg-files"){
    dmgCollect();
    const files = [...(t.files||[])]; const sec = t.dataset.sec, i = Number(t.dataset.i), kind = t.dataset.kind; t.value = "";
    const total = ()=>DMG.parties.reduce((n,p)=>n+Object.values(p.docs||{}).reduce((m,l)=>m+(l||[]).length,0),0) + DMG.vehicles.reduce((n,v)=>n+v.photos.length,0) + (DMG.equipPhotos||[]).length;
    for(const f of files){
      if(total() >= 40){ DMG.error = "אפשר עד 40 תמונות בדיווח"; break; }
      try{
        const d = await compressImage(f); DMG.error = null;
        if(sec==="party" && DMG.parties[i]){ (DMG.parties[i].docs[kind] = DMG.parties[i].docs[kind] || []).push(d); if(kind!=="car") dmgOcr(App, i, d); }
        else if(sec==="equip"){ DMG.equipPhotos = DMG.equipPhotos || []; DMG.equipPhotos.push(d); }
        else if(DMG.vehicles[i]) DMG.vehicles[i].photos.push(d);
      }catch(err){ DMG.error = err.message; }
    }
    return App.render();
  }
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
  if(!DEMO && N.state!=="on"){ App.S.view = "home"; return renderHome(App); } // בדמו אין חובת התראות - בלי זה לוגיסטי/הדרכה/עדכונים לא נפתחו בדמו
  const title = view==="training" ? "הדרכה" : view==="damage" ? "⚠️ דיווח נזק / תאונה" : view==="adminreq" ? "📝 בקשה מנהלתית" : view==="actreport" ? "📝 דוח פעולה" : "לוגיסטי";
  if(view==="training" && T.quiz) return `<div class="card">${renderQuiz(App, session)}</div>`;
  if(view==="training" && T.controlOpen) return `<div class="card">${renderControlDoc(App, session)}</div>`;
  if((view==="training" || view==="updates") && T.postOpen) return `<div class="card">${renderPostDoc(App)}</div>`;
  if(view==="updates") return `<div class="card">
    <span class="backlink" data-action="go-home">◀ חזרה לאיזור האישי</span>
    <h2>עדכונים והודעות</h2>
    ${renderAllUpdates(App, session)}
  </div>`;
  if(view==="damage" && !DMG.items && !DMG.itemsLoading){ DMG.itemsLoading = true; App.apiGet("logistics_items", "select=id,name,has_size,sort_order,size_options,has_serial,has_vehicle&order=sort_order").then(x=>{ DMG.items = x||[]; App.render(); }).catch(()=>{ DMG.items = []; }); }
  const body = view==="logistics" ? renderLogistics(App, session) : view==="damage" ? renderDamageWorker(App, session) : view==="adminreq" ? renderAdminReqWorker(App, session) : view==="actreport" ? renderActionReportWorker(App, session) : renderTraining(App, session);
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
    if(sub && Notification.permission==="granted"){
      const known = await App.apiRpc("manager_push_status", {p_token:ms.token, p_endpoint:sub.endpoint});
      if(!known){ const j = sub.toJSON(); await App.apiRpc("manager_push_subscribe", {p_token:ms.token, p_endpoint:j.endpoint, p_p256dh:j.keys.p256dh, p_auth:j.keys.auth}); } // אחרי התנתקות / משתמש אחר במכשיר - רישום מחדש בשקט
      MN.state = "on";
    } else MN.state = "off";
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
  const schedU = ms.is_admin ? sched.filter(t=>!App.isMokedTeam(t)) : sched;
  const mainHtml = `  ${openSwapsCard(App, ms)}
  ${renderMsgCard(App, ms)}
  ${(logi.length || ms.is_admin) ? `<div class="card">
    <h3>🚨 דו"ח אירוע חריג</h3>
    <div class="inc-sec-h"><span class="sayvu-badge">SAYVU</span> אירועי SAYVU מהמוקד — תחקיר אירוע חריג</div>
    <div class="grid-teams">
      <div class="team-tile" data-action="portal-inc-new"><div style="font-size:1.1em;font-weight:700;">➕ תחקיר אירוע SAYVU</div><div class="muted" style="font-size:.85em;margin-top:4px;">דו"ח תחקיר אירוע חריג</div></div>
      <div class="team-tile" data-action="portal-pv" data-page="inc-list"><div style="font-size:1.1em;font-weight:700;">📋 ${ms.is_admin?"כל דו\"חות SAYVU":"דו\"חות SAYVU שלי"}</div><div class="muted" style="font-size:.85em;margin-top:4px;">תחקירי אירועי SAYVU — טיוטות ונשלחו</div></div>
      ${INC.pendCount ? `<div class="team-tile" data-action="portal-pv" data-page="inc-list" style="border-color:#b42318;"><div style="font-size:1.1em;font-weight:700;color:#b42318;">🔔 ${INC.pendCount} ${INC.pendCount===1?"אירוע SAYVU חדש":"אירועי SAYVU"} מהמוקד</div><div class="muted" style="font-size:.85em;margin-top:4px;">ממתינים לתחקיר</div></div>` : ""}
    </div>
    <div class="inc-sec-h" style="margin-top:14px;">📝 דוחות פעולה של המאבטחים</div>
    <div class="grid-teams">${arMgrTile(App, ms)}</div>
    <div class="inc-sec-h" style="margin-top:14px;">⚠️ נזק / תאונה — דיווח ראשוני (לא אירוע SAYVU)</div>
    <div class="grid-teams">
      ${(()=>{ dmgMgrLoad(App, ms); const n = (DMG.list||[]).filter(x=>!x.seen).length;
        return `<div class="team-tile" data-action="portal-dmg-mnew" style="border-color:#f3c4c0;"><div style="font-size:1.1em;font-weight:700;">⚠️ דיווח נזק/תאונה</div><div class="muted" style="font-size:.85em;margin-top:4px;">דיווח ראשוני חדש</div></div>
        <div class="team-tile" data-action="portal-pv" data-page="dmg-list"${n?' style="border-color:#b42318;"':""}><div style="font-size:1.1em;font-weight:700;${n?"color:#b42318;":""}">📋 ${n?`${n} דיווחי נזק חדשים`:"דיווחי נזק / תאונה"}</div><div class="muted" style="font-size:.85em;margin-top:4px;">מהמאבטחים ומהקב"טים</div></div>`; })()}
    </div>
  </div>` : ""}
  ${ms.is_admin ? `<div class="card">
    <h3>🔑 ניהול מערכת</h3>
    <div class="grid-teams">${tile("portal-mh-codes", "🔑 עריכת קודים של מנהלים", "קביעה ושינוי קוד אישי לכל מנהל")}
      <div class="team-tile" data-action="portal-pv" data-page="unit-dash"><div style="font-size:1.1em;font-weight:700;">📊 לוח מנהל יחידה</div><div class="muted" style="font-size:.85em;margin-top:4px;">תמונת מצב כמו שמנהל היחידה רואה</div></div>
      <div class="team-tile" data-action="portal-pv" data-page="login-status"><div style="font-size:1.1em;font-weight:700;">🟢 סטטוס מחוברים</div><div class="muted" style="font-size:.85em;margin-top:4px;">לפי גזרות: מי מחובר, התראות וכניסה אחרונה</div></div></div>
  </div>` : ""}
  ${schedU.length && !ms.edit_as_button? `<div class="card">
    <h3>סידור עבודה${ms.is_admin?" — גזרות":""}</h3>
    <p class="muted" style="margin-top:-6px;">${names(schedU)}</p>
    <div class="grid-teams">
      <div class="team-tile" data-action="portal-mh-agg"${ms.is_admin?' data-scope="units"':""}><div style="font-size:1.1em;font-weight:700;">טבלה מרוכזת ובניית סידור</div><div class="muted" style="font-size:.85em;margin-top:4px;">שיבוץ, פרסום, פלט ופתיחת הגשה</div></div>
      <div class="team-tile" data-action="portal-mh-admin"${ms.is_admin?' data-scope="units"':""}><div style="font-size:1.1em;font-weight:700;">ניהול עובדים</div><div class="muted" style="font-size:.85em;margin-top:4px;">הוספה, קודים וסימונים</div></div>
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
    <div class="grid-teams">${tile("portal-mh-equip", "בקשות ציוד", "החלפה / ציוד נוסף")}<div class="team-tile" data-action="portal-pv" data-page="equip-workers"><div style="font-size:1.1em;font-weight:700;">🎒 ציוד אישי לעובדים</div><div class="muted" style="font-size:.85em;margin-top:4px;">הזנה ועדכון הרשימה של כל עובד</div></div>${areqMgrTile(App, ms)}</div>
    ${eqmWaitingHtml(App, ms)}
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
  ${!sched.length && !logi.length && !ms.can_training && !ms.is_admin ? (U.error && /אין הרשאה/.test(U.error) ? `<div class="card"><p class="muted">אין עדיין הרשאות לממשק הזה.</p></div>` : renderUnitDashboard(App, ms)) : ""}
`;
  const head = `${CALW_CSS}
  <div class="card">
    <div class="flexbar" style="justify-content:space-between;">
      <h2 style="margin:0;">שלום, ${esc(ms.name)}</h2>
      ${homeBackBtn(App)}
    </div>
  </div>
`;
  if(!ms.is_admin) return `${head}
  <div class="mgr-cols"><div class="mgr-main">
  ${renderLockCard(App, ms)}
  ${renderMgrShiftsCard(App, ms)}
  ${renderTodoCard(App, ms)}
  ${mainHtml}
  </div><div class="mgr-side">${renderCalWeekSide(App, ms)}</div></div>`;
  /* (2026-10-21, סרגיי) האיזור האישי של סרגיי מחולק ל-2: "מוקד" ו"ניהול היחידה" - נכנסים לכל אחד בנפרד.
     מתחת לשתי הרובריקות: "המשימות שלי" והיומן. אין שינוי בהרשאות - רק בסידור המסך. */
  const back = `<span class="backlink" data-action="portal-mh-section" data-s="">◀ חזרה לאיזור האישי</span>`;
  if(MHS.section==="unit") return `${head}<div class="card">${back}<h2 style="margin:4px 0 0;">🏢 ניהול היחידה</h2></div>${mainHtml}`;
  if(MHS.section==="moked"){
    const mokedT = (App.S.teams||[]).find(t=>App.isMokedTeam(t));
    return `${head}<div class="card">${back}<h2 style="margin:4px 0 0;">📡 מוקד</h2></div>
    <div class="card">
      <h3>סידור עבודה — מוקד</h3>
      <div class="grid-teams">
        ${mokedT ? `<div class="team-tile" data-action="portal-mh-agg" data-scope="moked"><div style="font-size:1.1em;font-weight:700;">טבלה מרוכזת ובניית סידור</div><div class="muted" style="font-size:.85em;margin-top:4px;">שיבוץ, פרסום, שליחה ופתיחת הגשה</div></div>
        <div class="team-tile" data-action="portal-mh-admin" data-scope="moked"><div style="font-size:1.1em;font-weight:700;">ניהול עובדי המוקד</div><div class="muted" style="font-size:.85em;margin-top:4px;">הוספה, קודים וסימונים</div></div>` : ""}
        <div class="team-tile" data-action="portal-pv" data-page="swap-mgr"><div style="font-size:1.1em;font-weight:700;">🔁 מבקש חילוף</div><div class="muted" style="font-size:.85em;margin-top:4px;">בקשות חילוף ופתיחת בקשה</div></div>
        ${areqMgrTile(App, ms)}
      </div>
    </div>
    ${renderMokedTaskCard(App, ms)}`;
  }
  const big = (s, icon, title, sub)=>`<div class="team-tile mh-big" data-action="portal-mh-section" data-s="${s}"><div style="font-size:2em;">${icon}</div><div style="font-size:1.25em;font-weight:800;margin-top:4px;">${title}</div><div class="muted" style="font-size:.88em;margin-top:4px;">${sub}</div></div>`;
  return `${head}
  <style>.mh-big{text-align:center;padding:22px 12px;} @media (max-width:520px){ .mh-big{padding:16px 8px;} }</style>
  <div class="grid-teams" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:12px;">
    ${big("moked", "📡", "מוקד", "סידור המוקד, עובדי המוקד, חילופים, בקשות ומשימות למוקד")}
    ${big("unit", "🏢", "ניהול היחידה", "גזרות, אירועים, דוחות, לוגיסטי, הודעות וניהול")}
  </div>
  <div class="team-tile" data-action="portal-pv" data-page="login-status" style="margin-bottom:12px;text-align:center;"><div style="font-size:1.15em;font-weight:800;">🟢 סטטוס מחוברים</div><div class="muted" style="font-size:.85em;margin-top:4px;">מי התחבר למערכת, לפי גזרות — מחוברים, התראות וכניסה אחרונה</div></div>
  ${renderMgrShiftsCard(App, ms)}
  ${renderLockCard(App, ms)}
  ${renderTodoCard(App, ms)}
  ${renderCalWeekSide(App, ms)}`;
}
function enterMgrSchedule(App, ms, which, scope){
  const S = App.S;
  const teams = mgrTeams(App, ms.schedule_team_ids);
  if(!teams.length) return App.render();
  S.pin = "mgr:" + ms.token; // הסשן של המנהל במקום קוד העריכה המשותף (לא נשמר בדפדפן)
  S.actorName = ms.name;
  const access = {}; teams.forEach(t=>access[t.id] = true);
  S.teamAccess = Object.assign({}, S.teamAccess, access);
  const groups = new Set(teams.map(t=>App.sectorGroupForTeam(t).label));
  const many = ms.is_admin || groups.size > 1; // מנהל מערכת / כמה קבוצות גזרות - בוחרים מהרשימה
  if(which==="agg"){
    S.view = "aggregate"; S.ui = many ? {mgrPick: true} : {teamId: teams[0].id};
  } else {
    S.view = "admin"; S.ui = many ? {pinOk: true, mgrPick: true} : {pinOk: true, teamIds: teams.map(t=>t.id), recipientLabel: ms.name};
  }
  // (2026-10-21) כניסה מתוך "מוקד" / "ניהול היחידה" - רק מה שמוצג ברשימת הבחירה משתנה, ההרשאות נשארות כמו שהן
  const mokedT = teams.find(t=>App.isMokedTeam(t));
  if(scope==="moked" && mokedT){
    S.ui = which==="agg" ? {teamId: mokedT.id} : {pinOk: true, teamIds: [mokedT.id], recipientLabel: "מוקד"};
  } else if(scope==="units" && many){ S.ui.pickScope = "units"; }
  App.render();
}

function renderHome(App){
  window.__portalApp = App;
  const ms = loadMgr(App);
  const session = ms ? null : loadSession(App);
  const html = ms ? renderManagerHome(App, ms) : session ? renderWorkerHome(App, session) : renderLogin(App);
  // "יציאה" עבר לתחתית המסך כ"התנתק מהמשתמש" (2026-10-22, סרגיי); למעלה במקומו - "חזרה לעמוד קודם"
  const act = ms ? "portal-mgr-logout" : session ? "portal-logout" : null;
  return act ? html + `<div class="logout-bottom"><button class="btn secondary" data-action="${act}">🚪 התנתק מהמשתמש</button></div>` : html;
}
/* כפתור "חזרה לעמוד קודם" בכרטיס הפתיחה של מסך הבית (רק כשיש לאן לחזור) */
function homeBackBtn(App){ return (App.navCanBack && App.navCanBack()) ? `<button class="btn small secondary" data-action="nav-back">◀ חזרה לעמוד קודם</button>` : ""; }
/* היסטוריית ניווט: מה מגדיר "מסך" בפורטל, ושמירה/שחזור שלו */
function navKey(){
  const id = v=>v ? (v.id || 1) : "";
  return [PV.page||"", PV.page ? JSON.stringify(PV.args||{}).slice(0,120) : "", MHS.section||"", DMG.open?"o":"", id(DMG.view), AR.open?"o":"", id(AR.view), AREQ.open?"o":"", id(AREQ.view), M.tile||""].join("~");
}
function navSave(){ return {pv:{page:PV.page, args:Object.assign({}, PV.args||{}), stack:(PV.stack||[]).slice()}, mhs:MHS.section||"", dmgView:DMG.view, arView:AR.view, areqView:AREQ.view, mTile:M.tile}; }
function navRestore(s){
  PV.page = s.pv.page; PV.args = s.pv.args; PV.stack = s.pv.stack.slice(); PV.data = null; PV.posts = null; PV.msg = null; PV.error = null; PV.busy = false;
  MHS.section = s.mhs; try{ sessionStorage.setItem("cst_mh_section", MHS.section); }catch(e){}
  DMG.open = false; DMG.view = s.dmgView; DMG.images = null; DMG.mimages = null;
  AR.open = false; AR.view = s.arView; AR.images = null; AR.mimages = null;
  AREQ.open = false; AREQ.view = s.areqView; AREQ.vfiles = null; AREQ.mfiles = null;
  M.tile = s.mTile; M.code = null; M.list = null; M.error = null; M.msg = null;
  SW.open = false;
  PV.swap = null; PV.swapHist = null; // חזרה לעמוד חילופים - טוענים מחדש, לא רשימה ישנה
}
function navHasParent(App){ return App.S.view==="home" && !!MHS.section && !!loadMgr(App); }
function navRoot(){ if(!MHS.section) return false; MHS.section = ""; try{ sessionStorage.setItem("cst_mh_section", ""); }catch(e){} return true; }

/* ================================================================
   בוט שאלות ותשובות על תפעול המערכת (2026-10-22, סרגיי): עיגול קטן קבוע בפינת המסך (זז עם הגלילה, לא מסתיר את
   התוכן). לחיצה פותחת חלון צ'אט קטן: כותבים שאלה במילים שלכם, והבוט מחפש במאגר התשובות (HELP_KB) לפי מילות מפתח -
   בלי בינה מלאכותית חיצונית, בלי עלות. מוצגות התשובות לפי התפקיד (מאבטח/מוקדן או מנהל/קב"ט). שאלות נרשמות
   (help_log) כדי שאפשר יהיה לשפר את המאגר.
   ================================================================ */
const HELP = { open:false, msgs:[], draft:"", busy:false, ai:null };
/* (2026-10-25, סריקה) איפוס נתונים של המשתמש הקודם בכניסה/יציאה - שעובד אחר באותו טלפון לא יראה דיווחים/צ'אט/התראות של הקודם */
let USER_GEN = 0;
function resetUserState(){
  DMG.mine = null; DMG.loadingMine = false; DMG.view = null; DMG.images = null; DMG.list = null; DMG.listAt = 0;
  AR.mates = null; AR.matesLoading = false; AR.mine = null; AR.view = null;
  HELP.msgs = []; HELP.draft = ""; HELP.ai = null;
  N.state = null; MN.state = null; HB.pending = false; HB.fresh = false;
  EQM.edit = null; EQM.statusSel = null; EQM.statusFor = null; EQM.workers = null;
  SWO.list = null; SWO.at = 0; SWO.tok = null;
  USER_GEN++;
}
// who: "w" = עובדים (מאבטח/מוקדן), "m" = מנהלים/קב"טים, "a" = כולם
const HELP_KB = [
  // ---------- עובדים ----------
  {who:"w", q:"איך מגישים משמרות / אילוצים?", k:"חיפה הגשה הגשת להגיש מגיש אילוצים משמרות סידור טופס זמינות לסמן",
   a:`במסך הבית לוחצים <b>🗓️ משמרות</b>. נפתחת התקופה שפתוחה עכשיו להגשה. בכל יום מסמנים את המשמרות, ובסוף לוחצים <b>שמירה</b>.<br>
      • בחיפה ובשאר הגזרות מסמנים מה <b>כן</b> יכולים, וחובה להתייחס לכל יום. לא יכולים כל היום? מסמנים <b>יום שלם</b> (חופשה, מילואים, מחלה, לימודים, לא זמין או אחר).<br>
      • במוקד מסמנים מה לא יכולים.<br>
      אפשר לחזור ולעדכן עד שההגשה ננעלת.`},
  {who:"w", q:"מתי ההגשה נפתחת ומתי ננעלת?", k:"סגורה סגור הספקתי פספסתי עד מתי להגיש נסגר נסגרת נפתח נפתחת ננעל ננעלת נעילה פתיחה מועד הגשה עד מתי רביעי ראשון",
   a:`מגישים <b>רק לשבוע הבא</b> — לא לשבועות רחוקים יותר. ההגשה לשבוע הבא נפתחת <b>ברגע שהקב"ט מפרסם את הסידור של השבוע הנוכחי</b> (או במועד הפתיחה הקבוע — בחיפה ביום ראשון ב-07:00), ונסגרת במועד הקבוע — <b>בחיפה ביום רביעי ב-12:00</b>. בראש טופס ההגשה כתוב תמיד אם הטופס פתוח ועד מתי. פספסת? הקב"ט יכול לפתוח לך הגשה ידנית.`},
  {who:"w", q:"איך מסמנים שאני לא יכול לעבוד?", k:"חסימות לחסום חסימה לא יכול מגבלה יום שלם כל היום לימודים אחר",
   a:`בטופס ההגשה מסמנים את המשמרות שבהן אתם <b>כן</b> יכולים לעבוד — משמרת שלא סומנה נחשבת כזו שאתם לא זמינים בה. לא יכולים כל היום? בשורה "יום שלם" בוחרים חופשה, מילואים, מחלה, לימודים, לא זמין או <b>אחר</b> (עם פירוט בהערה). במוקד — מסמנים מה לא יכולים.`},
  {who:"w", q:"איך רואים את המשמרות שלי ואת הסידור המלא?", k:"צוות הצוות כולמ אחרימ משמרות שלי לראות סידור מלא מתי אני עובד שובצתי שיבוץ שלי פורסם",
   a:`במסך הבית מופיעות <b>"המשמרות שלי"</b> — רק מסידור שהקב"ט פרסם. לסידור של כל הגזרה: <b>📋 סידור מלא</b>. בטלפון הסידור מוצג כשורה לכל יום ועמודה לכל משמרת.`},
  {who:"w", q:"איך מבקשים חילוף משמרת?", k:"חילוף להחליף החלפה מחליף לא יכול להגיע משמרת אחרת",
   a:`ב"המשמרות שלי" לוחצים <b>🔁 מבקש חילוף</b>, בוחרים את המשמרת (הערה לא חובה) ו"שלח בקשת חילוף". העובדים בגזרה רואים אותה תחת "🔁 מחפשים מחליף" ומקבלים התראה. מי שלוחץ <b>"לוקח את המשמרת"</b> — החילוף מתבצע מיד (אם אין מניעה: שומר שבת, פחות מ-8 שעות מנוחה, 7 ימים ברצף).`},
  {who:"a", q:"שכחתי את הקוד / המערכת ננעלה לי", k:"קוד שכחתי ננעל נעול נעילה סיסמה טעיתי כניסה להיכנס לא מצליח",
   a:`אחרי 3 טעויות בקוד הכניסה ננעלת ל-30 דקות. הקב"ט מקבל התראה ויכול <b>לפתוח את הנעילה מיד</b> מהמסך שלו. שכחת את הקוד? פנה לקב"ט — הוא רואה את הקוד שלך ב"ניהול עובדים".`},
  {who:"a", q:"איך מפעילים התראות בטלפון?", k:"התראות התראה פוש לא מקבל מגיעות הודעות להפעיל אייפון אנדרואיד מסך הבית להתקין מתקינים התקנה אייקון",
   a:`<b>אנדרואיד:</b> פותחים את האתר בכרום ומאשרים "התראות" כשהמערכת מבקשת.<br><b>אייפון:</b> פותחים בספארי → כפתור השיתוף ⬆️ → <b>"הוסף למסך הבית"</b> → נכנסים מהאייקון החדש ומאשרים התראות (iOS 16.4 ומעלה).<br>אם נפתח מתוך וואטסאפ — לבחור "פתח בדפדפן".`},
  {who:"w", q:"איך ממלאים דוח פעולה?", k:"דוח פעולה דו״ח אירוע דיווח אירוע למלא דוח סביו סייביו sayvu מספר אירוע",
   a:`במסך הבית: <b>📝 דוח פעולה</b> → "דוח פעולה חדש". רוב הדוח בלחיצות. חובה: תאריך ושעה, <b>מספר אירוע בסביו (6 ספרות)</b>, כתובת, סוג האירוע, איך התקבל, ו<b>תיאור האירוע במלל חופשי</b>. אפשר לצרף עד 8 תמונות. יצאת באמצע — נשמר כטיוטה. הדוח המנוסח נשלח לקב"ט ולסרגיי.`},
  {who:"w", q:"איך מדווחים על נזק או תאונה?", k:"נזק תאונה דיווח נזק רכב אופנוע ציוד נשבר",
   a:`במסך הבית: <b>⚠️ דיווח נזק / תאונה</b>. בוחרים "נזק לציוד" או "תאונה/נזק לכלי רכב", ממלאים את הפרטים ומצרפים תמונות. אם מעורב צד ג׳ — ממלאים גם את פרטיו. הדיווח נשלח לקב"ט ולסרגיי.`},
  {who:"w", q:"איך מבקשים חופשה / מילואים / מחלה?", k:"חופשה מילואים מחלה חולה חופש בקשה מנהלתית צו 3010 אישור מחלה ימי חופש",
   a:`במסך הבית: <b>📋 מנהלתיות</b> → בוחרים חופשה / מילואים / מחלה, תאריכים, ומצרפים מסמכים (במילואים — צו מילואים, ובסוף גם טופס 3010; במחלה — אישור מחלה). אפשר להוסיף מסמכים גם אחרי השליחה. תקבל התראה כשהבקשה מאושרת או נדחית. צריך לבטל או לשנות תאריכים? פותחים את הבקשה ב"הבקשות שלי" → <b>📅 שינוי תאריכים</b> או <b>🚫 ביטול הבקשה</b> — גם אחרי שאושרה (שינוי תאריכים מחזיר אותה לאישור הקב"ט).`},
  {who:"w", q:"איפה רואים את הציוד האישי שלי?", k:"ציוד אישי לוגיסטי מדים קסדה מעיל בקשת ציוד החלפה",
   a:`במסך הבית: <b>🎒 לוגיסטי</b>. שם מופיעה רשימת הציוד שלך (הקב"ט מזין אותה — אי אפשר לערוך). צריך ציוד נוסף או החלפה? "בקשת ציוד" — בוחרים פריט, כמות, מידה וסיבה.`},
  {who:"w", q:"איפה הלומדות והבחנים?", k:"לומדה בוחן מבחן הדרכה תרגיל סיכום בקרה קראתי",
   a:`במסך הבית: <b>🎓 הדרכה</b> — לומדות ובחנים, סיכומי בקרת תרגיל (יש לקרוא ולאשר "קראתי") ותכנים מקב"ט ההדרכות. משימות פתוחות מופיעות גם ברשימת המשימות במסך הבית.`},
  {who:"w", q:"מה זה משימה שאינה משמרת?", k:"משימה שאינה משמרת משימות שהוטלו עליי שובצתי למשימה ליווי תדריך השתלמות",
   a:`הקב"ט יכול לשבץ אותך למשימה מחוץ למשמרת (למשל ליווי, תדריך, השתלמות), ליום אחד או לכמה ימים. היא מופיעה במסך הבית תחת <b>"📌 משימות שהוטלו עליי"</b> ומקבלים עליה התראה.`},

  {who:"a", q:"איך נכנסים למערכת?", k:"להיכנס נכנסים כניסה התחברות להתחבר שם קוד אישי איך מתחברים יציאה להתנתק התנתקות התנתק משתמש אחר חזרה עמוד קודם",
   a:`בדף הכניסה מקלידים את השם, בוחרים אותו מהרשימה ומזינים את <b>הקוד האישי</b>. השם לא מופיע? צריך לפנות לקב"ט שיוסיף אותך. כדי להתנתק (למשל בטלפון של מישהו אחר) — לחצן <b>🚪 התנתק מהמשתמש</b> בתחתית מסך הבית. לחצן <b>◀ חזרה</b> מחזיר לעמוד הקודם.`},
  {who:"a", q:"המערכת לא נטענת / לא מתעדכנת", k:"אפליקציה האפליקציה מערכת לא עובד עובדת נטען נטענת תקוע תקועה שגיאה באג רענון לרענן לא מתעדכן ישן גרסה איטי לבן",
   a:`קודם כל לרענן את הדף (במחשב F5, בטלפון למשוך את המסך למטה או לסגור ולפתוח את האפליקציה). בדקו שיש אינטרנט. אם עדיין לא עובד — צלמו מסך ושלחו לקב"ט.`},
  {who:"w", q:"למה אני לא רואה את הסידור?", k:"לא רואה סידור לא מופיע לא פורסם עדיין אין משמרות ריק איפה הסידור",
   a:`המשמרות מופיעות רק אחרי ש<b>הקב"ט מפרסם</b> את הסידור — עד אז "המשמרות שלי" ריק. כשהסידור מתפרסם מקבלים התראה. אם הוא פורסם ועדיין לא רואים — לרענן את הדף.`},
  // ---------- מנהלים / קב"טים ----------
  {who:"m", q:"איך בונים סידור עבודה?", k:"בונים לבנות סידור שיבוץ אוטומטי אוטומטית לשבץ משבצים ידני טבלה מרוכזת חוסר חוסרים נקה לנקות ניקוי למחוק מוחקים מחק מחיקה כל הסידור",
   a:`<b>טבלה מרוכזת ובניית סידור</b> → בוחרים גזרה ותקופה.<br>• <b>שיבוץ אוטומטי</b> — טוען את ההגשות העדכניות, משבץ לפי זמינות והוגנות (בחיפה — עדיפות לכל משמרת ל-3 הראשונים שהגישו את הסידור), מעדיף מנוחה מעל 8 שעות, אחמ"ש בכל משמרת, ובסוף מנסה לסגור חוסרים בהחלפה.<br>• <b>שיבוץ ידני</b> — לוחצים על משבצת ובוחרים עובד.<br>• <b>🗑 נקה סידור</b> — מוחק את כל השיבוצים בתקופה (אחרי אישור).<br>בסוף — <b>📢 פרסם סידור</b>.`},
  {who:"m", q:"מה קורה כשמפרסמים סידור?", k:"פרסום לפרסם פרסם סידור עובדים רואים ביטול פרסום",
   a:`אחרי <b>📢 פרסם</b> העובדים רואים את הסידור ב"המשמרות שלי" ומקבלים התראה, <b>וההגשה לשבוע שאחריו נפתחת מיד</b>. שינויים אחרי הפרסום מופיעים אצלם מיד. אם משבץ אחר כבר פרסם — המערכת תשאל אם להמשיך.`},
  {who:"m", q:"איך שולחים את הסידור בוואטסאפ או במייל?", k:"וואטסאפ ווטסאפ מייל לשלוח שליחה תמונה pdf פלט הדפסה",
   a:`מתחת לסידור: <b>📤 שליחה בוואטסאפ / מייל</b>. המערכת מכינה תמונה של הסידור ושואלת וואטסאפ או מייל. בטלפון נפתח חלון השיתוף עם התמונה מצורפת; במחשב התמונה מועתקת ונשמרת — מדביקים (Ctrl+V) בהודעה שנפתחה.`},
  {who:"m", q:"מה המשמעות של אדום וצהוב בסידור?", k:"אדום צהוב טבלה מנוחה 8 שעות שמונה סימון אזהרה רצף צבע",
   a:`<b>אדום</b> — פחות מ-8 שעות מנוחה בין משמרות (משמרת עוקבת, כמו ערב שממשיך ללילה, לא נחשבת).<br><b>צהוב</b> — בדיוק 8 שעות מנוחה (מותר, אבל גבולי).<br>שיבוץ אוטומטי לא משבץ מי שיגיע ל-7 ימים ברצף או לשבת רביעית ברצף.`},
  {who:"m", q:"איך משבצים שעות מותאמות?", k:"שעות מותאמות שעה התחלה סיום לשנות שעות חוצה משמרות 16:30",
   a:`בשיבוץ ידני לוחצים על התא של העובד → <b>שעות מותאמות</b> → בוחרים התחלה וסיום. שעות שחוצות שתי משמרות (למשל 16:30–04:30) מתפצלות אוטומטית לשתי המשמרות ומוצגות בשתיהן.`},
  {who:"m", q:"איך מגדירים אחמ״ש?", k:"אחמש אחמ״ש אחמ\"ש סייר 1 הגדרת אחראי משמרת",
   a:`ב<b>ניהול עובדים</b> מסמנים את העובד כאחמ"ש. בשיבוץ האוטומטי יש אחמ"ש בכל משמרת, והוא תמיד "סייר 1". בטבלה מופיעה לידו תגית אחמ"ש.`},
  {who:"m", q:"איך משבצים משימה שאינה משמרת?", k:"משימה שאינה משמרת מתמשכת חד פעמית שורה משימות להוסיף שורה",
   a:`בשיבוץ ידני, בתחתית הטבלה ("משימות — לא משמרת"): לוחצים על תא → בוחרים מאבטח → <b>חד פעמית</b> או <b>מתמשכת</b> (מתאריך עד תאריך — נשמרת לכל הימים באותה שורה) → כותבים מה המשימה ושעות. "➕ שורה / ➖ שורה" מוסיפים או מורידים שורות ליום.`},
  {who:"m", q:"איך פותחים הגשה לעובד שפספס?", k:"לא הגיש בזמן הגיש עבורו פתח הגשה פספס איחר חריגה לפתוח הגשה לעובד",
   a:`בטבלה המרוכזת, ברשימת מי שלא הגיש — לוחצים <b>"פתח הגשה עבורו"</b>. העובד יוכל להגיש גם אחרי הנעילה.`},
  {who:"m", q:"איך פותחים נעילה לעובד?", k:"פתח נעילה נעול ננעל עובד קוד טעה שכח עובדים נעולים",
   a:`כשעובד טועה בקוד 3 פעמים — מקבלים התראה, ובראש מסך הבית מופיע <b>🔒 עובדים נעולים</b> עם לחצן <b>🔓 פתח נעילה</b>. אפשר גם מ"ניהול עובדים".`},
  {who:"m", q:"איך מוסיפים עובד או משנים קוד?", k:"להוסיף עובד חדש קוד אישי למחוק עובד ניהול עובדים",
   a:`<b>ניהול עובדים</b> → הוספה (שם, קוד אישי, תפקיד), שינוי קוד, סימון אחמ"ש / חפיפה / שומר שבת / יעד משמרות בשבוע, ומחיקה.`},
  {who:"m", q:"איך מזינים ציוד אישי לעובד?", k:"ציוד אישי לעובדים להזין רשימת ציוד בקשות ציוד ממתין המתנה רשימת המתנה חגורה מידה קיבל הוזמן הזמנה סטטוס",
   a:`<b>🎒 ציוד אישי לעובדים</b> → בוחרים עובד → כמות ומידה לכל פריט (לחגורה — מידות 36–56) → במצלמת גוף רושמים את <b>מספר המצלמה</b> → לכל פריט סטטוס: <b>✅ קיבל / ❌ לא קיבל / 📦 הוזמן</b> → שמירה. "לא קיבל" ו"הוזמן" מופיעים ב"⏳ רשימת המתנה לציוד", וכל מה שהוזמן — ב"📦 משימה: הזמנות ציוד" המרוכזת בכרטיס הלוגיסטי. העובד רואה את הרשימה באיזור האישי. בקשות ציוד מהעובדים — ב"בקשות ציוד".`},
  {who:"m", q:"איפה רואים דוחות פעולה, נזק ואירועים?", k:"מאבטחים מילאו שמילאו דוח דוחות פעולה נזק תאונה sayvu סביו אירוע חריג תחקיר",
   a:`בכרטיס <b>🚨 דו"ח אירוע חריג</b>: תחקירי SAYVU, <b>📝 דוחות פעולה</b> של המאבטחים ו<b>⚠️ דיווחי נזק/תאונה</b>. חדשים מסומנים באדום עם מונה, ומקבלים עליהם התראה. מכל דוח אפשר להפיק PDF.`},
  {who:"m", q:"איך מוסיפים משימה אישית עם תזכורת?", k:"משימות שלי משימה אישית תזכורת להזכיר",
   a:`בכרטיס <b>📝 המשימות שלי</b> → "משימה חדשה" → מה צריך לעשות, תאריך יעד (לא חובה) ו<b>⏰ תזכורת עם התראה</b> בתאריך ושעה. רק את/ה רואה את המשימות.`},
  {who:"m", q:"איך משתמשים ביומן המשותף?", k:"ישיבה פגישה לקבוע לתאם קבטים מנהלים יומן משותף אירוע משתתפים התראה לכולם להוסיף ליומן",
   a:`<b>📅 יומן משותף</b> → ➕ הוספה: סוג (אירוע/משימה), תאריך ושעות, אחראי, הערות, ו<b>משתתפים — יקבלו התראה</b> (הסימון הראשון "כולם" שולח לכולם). פריט אישי מופיע רק אצלך, אצל האחראי והמשתתפים.`},
  {who:"m", q:"איך שולחים הודעה למאבטחים או להנהלה?", k:"הודעה למאבטחים הודעה להנהלה לשלוח הודעה פרסום",
   a:`בכרטיס <b>✉️ הודעות</b>: "📢 הודעה למאבטחים" (מופיעה אצלם ב"עדכונים והודעות" עם התראה, ורואים כמה קראו) או "📨 הודעה להנהלה".`},
  {who:"m", q:"איך רואים מי מחובר למערכת?", k:"מחובר מחוברים התחברות סטטוס מי נכנס התראות פעילות",
   a:`(מנהל מערכת) <b>ניהול מערכת → 👥 סטטוס התחברות</b>: לכל משתמש — מחובר עם/בלי התראות או לא מחובר, וכניסה אחרונה.`}
];
function helpNorm(t){
  return String(t||"").toLowerCase().replace(/[֑-ׇ]/g,"").replace(/[״"׳'`]/g,"")
    .replace(/ך/g,"כ").replace(/ם/g,"מ").replace(/ן/g,"נ").replace(/ף/g,"פ").replace(/ץ/g,"צ")
    .replace(/[^א-תa-z0-9 ]+/g," ").replace(/\s+/g," ").trim();
}
const HELP_STOP = new Set(["איך","מה","מי","למה","איפה","אני","את","של","על","עם","זה","יש","אין","לי","כן","לא","או","גם","רק","אם","כל","היא","הוא","אפשר","צריך","רוצה","אפשרות","בבקשה","שאלה","the"]);
// צורות של אותה מילה: מורידים אותיות שימוש בהתחלה (ו/ה/ב/ל/מ/ש/כ) וסיומות נפוצות (ים/ות/תי/נו/ה/ת) - "במשמרות" ~ "משמרת"
function helpTokens(t){
  const out = new Set();
  const add = w=>{ if(w.length<2) return; out.add(w);
    for(const suf of ["ימ","ות","תי","נו","תמ","ה","ת","י"]) if(w.length - suf.length >= 3 && w.endsWith(suf)){ out.add(w.slice(0, -suf.length)); break; } };
  helpNorm(t).split(" ").forEach(w=>{
    if(!w || HELP_STOP.has(w)) return;
    add(w);
    let x = w; for(let i=0;i<2 && x.length>3 && "והבלמשכ".includes(x[0]);i++){ x = x.slice(1); if(!HELP_STOP.has(x)) add(x); }
  });
  return out;
}
// שגיאת הקלדה אחת (אות חסרה/מיותרת/מוחלפת) במילה של 4 אותיות ומעלה עדיין נחשבת התאמה
function helpNear(a, b){
  if(a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while(i < a.length && j < b.length){
    if(a[i]===b[j]){ i++; j++; continue; }
    if(++diff > 1) return false;
    if(a.length > b.length) i++; else if(b.length > a.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}
let HELP_IDX = null;
function helpIndex(){
  if(HELP_IDX) return HELP_IDX;
  const docs = HELP_KB.map(e=>({e, k:helpTokens(e.k), q:helpTokens(e.q)}));
  const df = {};
  docs.forEach(d=>{ new Set([...d.k, ...d.q]).forEach(t=>{ df[t] = (df[t]||0) + 1; }); });
  return HELP_IDX = {docs, df, n: docs.length};
}
// ניקוד: מילה נדירה במאגר שווה יותר ממילה שמופיעה בהרבה תשובות; מילות מפתח שוות יותר מכותרת השאלה; התאמה חלקית (תחילת מילה) - חצי
function helpSearch(q, role){
  const qt = helpTokens(q); if(!qt.size) return [];
  const {docs, df, n} = helpIndex();
  const idf = t=>Math.log(1 + n / (df[t] || 0.5));
  return docs.filter(d=>d.e.who==="a" || d.e.who===role || role==="m").map(d=>{
    let sc = 0;
    qt.forEach(t=>{
      if(d.k.has(t)) sc += 1.0 * idf(t);
      else if(d.q.has(t)) sc += 0.5 * idf(t);
      else if(t.length>=3){
        const all = [...d.k, ...d.q];
        const hit = all.find(k=>k.length>=3 && (k.startsWith(t) || t.startsWith(k))) || all.find(k=>helpNear(t, k));
        if(hit) sc += 0.5 * idf(hit);
      }
    });
    if(d.e.who===role) sc *= 1.1;
    return {e:d.e, sc};
  }).filter(x=>x.sc>=1.2).sort((a,b)=>b.sc-a.sc).filter((x,i,arr)=>i===0 || x.sc >= arr[0].sc*0.8).slice(0,2);
}
function helpEsc(t){ return String(t==null?"":t).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function helpRole(){ const App = window.__portalApp; try{ return App && loadMgr(App) ? "m" : "w"; }catch(e){ return "w"; } }
/* הבוט יושב מחוץ ל-#app (שורש משלו), כך ש-render() של המערכת לא מוחק את מה שמקלידים ולא מקפיץ את הגלילה */
function helpRoot(){
  let r = document.getElementById("helpRoot");
  if(!r){
    r = document.createElement("div"); r.id = "helpRoot"; r.className = "no-print"; document.body.appendChild(r);
    r.addEventListener("click", e=>{
      const el = e.target.closest("[data-help]"); if(!el) return;
      const a = el.dataset.help;
      if(a==="toggle"){ HELP.open = !HELP.open; helpPaint(); if(HELP.open) helpFocus(); }
      else if(a==="send"){ const i = document.getElementById("helpInput"); helpAsk(i ? i.value : HELP.draft); }
      else if(a==="ask"){ helpAsk(el.dataset.q); }
      else if(a==="clear"){ HELP.msgs = []; helpPaint(); helpFocus(); }
    });
    r.addEventListener("input", e=>{ if(e.target.id==="helpInput") HELP.draft = e.target.value; });
    r.addEventListener("keydown", e=>{ if(e.key==="Enter" && e.target.id==="helpInput"){ e.preventDefault(); helpAsk(e.target.value); } if(e.key==="Escape"){ HELP.open = false; helpPaint(); } });
  }
  return r;
}
function helpFocus(){ setTimeout(()=>{ const b = document.getElementById("helpBody"); if(b) b.scrollTop = b.scrollHeight; const i = document.getElementById("helpInput"); if(i && window.innerWidth > 700) i.focus(); }, 30); }
function helpPaint(){
  const r = helpRoot(), role = helpRole();
  const fab = `<button type="button" class="help-fab" data-help="toggle" title="שאלות ותשובות על המערכת" aria-label="עזרה">${HELP.open?"✕":"?"}</button>`;
  if(!HELP.open){ r.innerHTML = fab; return; }
  const ex = role==="m" ? "למשל: איך משבצים אוטומטית? מה אומר הצבע האדום? איך שולחים את הסידור בוואטסאפ?" : "למשל: עד מתי אפשר להגיש? שכחתי את הקוד. איך ממלאים דוח פעולה?";
  const msgs = `<div class="help-msg bot">שלום! 👋 כתבו כל שאלה על השימוש במערכת, במילים שלכם.<div class="help-ex">${ex}</div></div>`
    + HELP.msgs.map(m=>m.me ? `<div class="help-msg me">${helpEsc(m.t)}</div>` : `<div class="help-msg bot">${m.h}</div>`).join("")
    + (HELP.busy ? `<div class="help-msg bot help-typing"><span></span><span></span><span></span></div>` : "");
  r.innerHTML = `${fab}<div class="help-panel" role="dialog" aria-label="שאלות ותשובות">
    <div class="help-head"><b>💬 שאלות ותשובות</b><span>${HELP.msgs.length?`<span class="help-x" data-help="clear" title="ניקוי השיחה">↺</span>`:""}<span class="help-x" data-help="toggle" title="סגירה">✕</span></span></div>
    <div class="help-body" id="helpBody">${msgs}</div>
    <div class="help-input"><input type="text" id="helpInput" ${HELP.busy?"disabled":""} maxlength="300" placeholder="כתבו שאלה..." value="${helpEsc(HELP.draft)}" autocomplete="off" enterkeyhint="send">
      <button type="button" class="btn small" data-help="send">שלח</button></div>
  </div>`;
}
// תשובת Claude: טקסט פשוט -> HTML בטוח (רק **הדגשה** ושורות)
function helpMd(t){ return helpEsc(t).replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>"); }
function helpKeyword(q, role){
  const res = helpSearch(q, role);
  if(res.length){
    // שאלה שנוגעת לשני נושאים - מקבלים את שתי התשובות
    HELP.msgs.push({h: res.map(r=>`<div class="help-q">${helpEsc(r.e.q)}</div>${r.e.a}`).join(`<hr class="help-sep">`),
                    p: res.map(r=>r.e.q + ": " + r.e.a.replace(/<[^>]+>/g, "")).join("\n")});
  } else {
    HELP.msgs.push({h:`לא מצאתי תשובה לשאלה הזו 🙏 נסו לנסח אחרת, עם המילה העיקרית (למשל "הגשה", "חילוף", "קוד", "התראות", "דוח פעולה"). אם עדיין לא מסתדר — פנו ${role==="m"?"לסרגיי":"לקב\"ט שלכם"}.`, p:"לא נמצאה תשובה"});
  }
  const App = window.__portalApp;
  try{ if(App) App.apiRpc("help_log", {p_question:q.slice(0,300), p_role:role, p_matched: res.length ? res[0].e.q : null}).catch(()=>{}); }catch(e){}
}
/* 2026-10-22: קודם שואלים את Claude (פונקציית help-ai בשרת, רק למשתמש מחובר). אם אין חיבור / אין מפתח / שגיאה - הבוט הפשוט עונה */
async function helpAsk(q){
  q = String(q||"").trim(); if(!q || HELP.busy) return;
  const role = helpRole(), App = window.__portalApp;
  const history = HELP.msgs.slice(-6).map(m=>m.me ? {role:"user", text:m.t} : {role:"assistant", text:m.p||""}).filter(m=>m.text);
  HELP.msgs.push({me:true, t:q});
  HELP.draft = "";
  let done = false;
  let sess = null; try{ sess = App ? (role==="m" ? loadMgr(App) : loadSession(App)) : null; }catch(e){}
  if(App && App.SUPABASE_URL && sess && sess.token && HELP.ai !== false){
    HELP.busy = true; helpPaint(); helpFocus();
    try{
      const ctl = new AbortController(); const tm = setTimeout(()=>ctl.abort(), 25000);
      const res = await fetch(App.SUPABASE_URL + "/functions/v1/help-ai", {method:"POST", signal: ctl.signal,
        headers:{"Content-Type":"application/json", apikey:App.SUPABASE_ANON_KEY, Authorization:"Bearer "+App.SUPABASE_ANON_KEY},
        body: JSON.stringify({token: sess.token, who: role, question: q, history})});
      clearTimeout(tm);
      const j = res.ok ? await res.json().catch(()=>({})) : {};
      // (2026-10-25) מכבים את הבוט רק כשהוא באמת לא קיים בסביבה הזו (אין פונקציה / אין מפתח). תקלה רגעית - מנסים שוב בשאלה הבאה
      if(res.status===404 || (j.fallback && j.reason==="no key")) HELP.ai = false;
      if(j.answer){ HELP.msgs.push({h: helpMd(j.answer), p: j.answer}); done = true; }
    }catch(e){}
    HELP.busy = false;
  }
  if(!done) helpKeyword(q, role);
  if(HELP.msgs.length > 40) HELP.msgs = HELP.msgs.slice(-40);
  helpPaint(); helpFocus();
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", helpPaint); else helpPaint();
const HELP_CSS = `
  .help-fab{position:fixed;left:14px;bottom:16px;z-index:900;width:44px;height:44px;border-radius:50%;border:none;
    background:#1f4e8c;color:#fff;font-size:22px;font-weight:800;box-shadow:0 3px 10px rgba(0,0,0,.25);cursor:pointer;opacity:.88;line-height:44px;padding:0;}
  .help-fab:hover{opacity:1;}
  .help-panel{position:fixed;left:14px;bottom:68px;z-index:901;width:min(360px, calc(100vw - 28px));max-height:min(520px, calc(100vh - 110px));
    background:#fff;border:1px solid #c9d4e2;border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.22);display:flex;flex-direction:column;overflow:hidden;direction:rtl;}
  .help-head{display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:#1f4e8c;color:#fff;}
  .help-x{cursor:pointer;font-weight:700;padding:0 4px;}
  .help-body{flex:1;overflow-y:auto;padding:10px;background:#f6f9fd;font-size:.92em;}
  .help-msg{border-radius:12px;padding:8px 10px;margin:6px 0;line-height:1.5;max-width:92%;}
  .help-msg.bot{background:#fff;border:1px solid #dfe6ef;}
  .help-msg.me{background:#1f4e8c;color:#fff;margin-inline-start:auto;width:fit-content;}
  .help-q{font-weight:700;color:#1f4e8c;margin-bottom:4px;}
  .help-more{margin-top:8px;font-size:.85em;color:#6b7280;}
  .help-typing span{display:inline-block;width:7px;height:7px;margin:0 2px;border-radius:50%;background:#9aa9bd;animation:helpDot 1s infinite ease-in-out;}
  .help-typing span:nth-child(2){animation-delay:.15s;} .help-typing span:nth-child(3){animation-delay:.3s;}
  @keyframes helpDot{0%,80%,100%{opacity:.25;transform:translateY(0);}40%{opacity:1;transform:translateY(-3px);}}
  .help-ex{margin-top:6px;font-size:.85em;color:#6b7280;}
  .help-sep{border:none;border-top:1px dashed #d5dde8;margin:10px 0;}
  .help-input{display:flex;gap:6px;padding:8px;border-top:1px solid #e5e9f0;background:#fff;}
  .help-input input{flex:1;min-width:0;}
  @media print{ .help-fab,.help-panel{display:none!important;} }
`;

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
      resetUserState(); saveSession(App, null); saveMgr(App, res); I.data = null; K.data = null;
      P.selectedId = null; P.code = ""; P.query = ""; P.checkedMgr = true; P.firstCode = false;
      return App.render();
    }
    const res = await App.apiRpc("worker_login", {p_worker_id: sel.id, p_code: code});
    P.busy = false;
    if(!res){ P.error = "קוד שגוי"; P.code=""; return App.render(); }
    saveMgr(App, null); clearMgrMode(App); resetUserState();
    saveSession(App, res);
    P.selectedId = null; P.code = ""; P.query = ""; P.shifts = null; P.checkedSession = false; T.data = null; F.data = null; // false: לבדוק מיד הרשאות (למשל עריכת סידור)
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
    resetUserState(); saveSession(App, null); saveMgr(App, res); I.data = null; K.data = null;
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
      .then(()=>{ PV.busy = false; PV.msg = "בקשת החילוף נשמרה."; S2.sel = null; S2.list = null; S2.listAt = 0; SWO.at = 0; App.render(); })
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
      .then(r=>{ PV.busy = false; PV.msg = `טופל — ${r && r.new_worker ? r.new_worker + " שובץ במשמרת, והסידור עודכן." : "הסידור עודכן."}`; S2.handle = null; S2.list = null; S2.listAt = 0; SWO.at = 0; S2.hist = undefined; S2.rows = null; App.render(); })
      .catch(e=>{ PV.busy = false; PV.error = e.message; App.render(); });
  }
  if(a==="portal-swapm-cancel"){
    const ms = loadMgr(App); if(!ms) return App.render();
    return App.apiRpc("mgr_swap_cancel", {p_token:ms.token, p_id:el.dataset.id}).then(()=>{ if(PV.swap){ PV.swap.list = null; PV.swap.listAt = 0; } SWO.at = 0; PV.msg = "הבקשה בוטלה."; App.render(); }).catch(e=>{ PV.error = e.message; App.render(); });
  }
  if(a==="portal-mgr-push-enable"){ const ms = loadMgr(App); if(ms && !MN.busy) enableMgrPush(App, ms); return; }
  if(a==="portal-full-schedule"){ const ss = loadSession(App); if(!ss) return App.render(); S.view = "mgrview"; S.ui = {teamId: ss.team_id, workerView: true}; return App.render(); }
  if(a==="portal-mgr-view"){ if(!loadMgr(App)) return App.render(); S.view = "mgrview"; S.ui = {teamId: el.dataset.id}; return App.render(); }
  if(a==="portal-pick"){ P.selectedId = el.dataset.id; P.code=""; P.error=null; if(DEMO) return doLogin(App); return App.render(); }
  if(a==="portal-unpick"){ P.selectedId = null; P.code=""; P.error=null; return App.render(); }
  if(a==="portal-login") return doLogin(App);
  if(a==="portal-install-app") return installApp(App);
  if(a==="portal-install-done"){ try{ localStorage.setItem("cst_app_installed", String(Date.now())); }catch(e){} return App.render(); }
  if(a==="portal-copy-link"){ const url = location.origin + location.pathname;
    const done = ()=>{ el.textContent = "✅ הקישור הועתק"; };
    const manual = ()=>{ if(el.nextElementSibling && el.nextElementSibling.classList.contains("copy-fallback")) return;
      el.insertAdjacentHTML("afterend", `<input class="copy-fallback" readonly value="${App.escapeHtml(url)}" style="width:100%;margin-top:8px;direction:ltr;">`);
      const i = el.nextElementSibling; i.focus(); i.select(); };
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done).catch(manual);
    else manual();
    return; }
  if(a==="portal-push-recheck"){ N.state = null; return App.render(); }
  if(a==="portal-mgr-push-recheck"){ MN.state = null; return App.render(); }
  if(a==="portal-push-enable"){ const ss = loadSession(App); if(ss && !N.busy) enablePush(App, ss); return; }
  if(a==="portal-managers"){ S.view = "managers"; S.ui = {}; return App.render(); }
  if(a==="portal-logout"){
    if(App.navReset) App.navReset();
    const s = loadSession(App);
    hbClear(s); HB.fresh = false;
    if(s) logoutServer(App, "worker", s.token);
    clearMgrMode(App);
    resetUserState(); saveSession(App, null); P.shifts = null; P.checkedSession = false; L.data = null; L.items = null; T.data = null; F.data = null; N.state = null; SW.list = null; SW.open = false; SW.msg = null; ST.list = null; ST.at = 0;
    return App.render();
  }
  if(a==="portal-go-updates"){ S.view = "updates"; S.ui = {}; F.data = null; T.postOpen = null; T.controlOpen = null; T.attError = null; return App.render(); }
  if(a==="portal-go-training"){ S.view = "training"; S.ui = {}; T.data = null; F.data = null; T.controlOpen = null; T.postOpen = null; T.quiz = null; return App.render(); }
  if(a==="portal-go-areq"){ S.view = "adminreq"; S.ui = {}; AREQ.open = false; AREQ.view = null; AREQ.mine = null; AREQ.okMsg = null; AREQ.error = null; return App.render(); }
  if(a.indexOf("portal-areq-")===0 && a!=="portal-areq-resolve") return areqAction(App, a, el);
  if(a==="portal-areq-resolve") return areqResolve(App, el);
  if(a==="portal-eqm-save") return eqmSave(App, el);
  if(a==="portal-go-ar"){ S.view = "actreport"; S.ui = {}; AR.open = false; AR.view = null; AR.mine = null; AR.okMsg = null; AR.error = null; return App.render(); }
  if(a.indexOf("portal-ar-")===0) return arAction(App, a, el);
  if(a==="portal-go-damage"){ S.view = "damage"; S.ui = {}; DMG.open = false; DMG.view = null; DMG.mine = null; DMG.loadingMine = false; DMG.images = null; DMG.mgrMode = false; DMG.okMsg = null; return App.render(); }
  if(a==="portal-go-logistics"){ S.view = "logistics"; S.ui = {}; T.data = null; L.data = null; L.msg = null; L.error = null; return App.render(); }
  if(a==="portal-log-save") return saveLogistics(App);
  if(a==="portal-log-request") return sendRequest(App);
  if(a==="portal-mgr-open"){ S.view = "equipreq"; S.ui = {}; M.session=null; M.tile=null; M.code=null; M.list=null; M.error=null; M.msg=null; return App.render(); }
  if(a==="portal-mh-equip"){ const ms = loadMgr(App); if(!ms) return App.render(); S.view = "equipreq"; S.ui = {}; M.session = ms; M.list=null; M.error=null; M.msg=null; return App.render(); }
  // עובד עם הרשאת עריכת סידור (roster_workers.schedule_editor, למשל אנדרי גרלאנו בחיפה - 2026-10-20):
  // אותו מסך כמו לקב"ט, עם הסשן האישי שלו ("wrk:") במקום קוד העריכה
  if(a==="portal-wsched-agg" || a==="portal-wsched-admin"){
    const ss = loadSession(App); if(!ss || !ss.schedule_editor) return App.render();
    S.pin = "wrk:" + ss.token; S.actorName = ss.name;
    S.teamAccess = Object.assign({}, S.teamAccess, {[ss.team_id]: true});
    if(a==="portal-wsched-agg"){ S.view = "aggregate"; S.ui = {teamId: ss.team_id}; }
    else { S.view = "admin"; S.ui = {pinOk: true, teamIds: [ss.team_id], recipientLabel: ss.name}; }
    return App.render();
  }
  if(a==="portal-lk-unlock"){
    const ms = loadMgr(App); if(!ms) return;
    const id = el.dataset.id, nm = el.dataset.name;
    el.disabled = true;
    return App.apiRpc("admin_unlock_worker_code", {p_pin:"mgr:"+ms.token, p_worker_id:id})
      .then(()=>{ LK.list = (LK.list||[]).filter(w=>w.id!==id); LK.msg = `✔ הנעילה של ${nm} נפתחה — אפשר להיכנס שוב עם הקוד.`; setTimeout(()=>{ LK.msg = null; App.render(); }, 8000); App.render(); })
      .catch(e=>{ LK.msg = "שגיאה: " + e.message; App.render(); });
  }
  if(a==="portal-mh-section"){ MHS.section = el.dataset.s||""; try{ sessionStorage.setItem("cst_mh_section", MHS.section); }catch(e){} window.scrollTo(0,0); return App.render(); }
  if(a==="portal-mh-agg" || a==="portal-mh-admin"){ const ms = loadMgr(App); if(!ms) return App.render(); return enterMgrSchedule(App, ms, a==="portal-mh-agg"?"agg":"admin", el.dataset.scope||null); }
  if(a==="portal-mgr-logout"){
    if(App.navReset) App.navReset();
    const ms = loadMgr(App);
    if(ms) logoutServer(App, "manager", ms.token);
    resetUserState(); saveMgr(App, null); clearMgrMode(App); P.checkedMgr = false; M.session = null; I.data = null; K.data = null; MN.state = null; INC.pendCount = undefined; INC.opts = null; C.data = null; C.homeCount = undefined; C.month = null; C.sel = null; C.edit = null; CW.data = null; CW.my = null; CW.week = null; CW.lastDone = null; U.data = null; U.error = null; U.loading = false;
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
  if(a==="portal-eqw-toggle"){ EQM.waitOpen = !(el.parentElement && el.parentElement.open); return; }
  if(a==="portal-eqo-toggle"){ EQM.ordOpen = !(el.parentElement && el.parentElement.open); return; }
  if(a==="portal-eqn-toggle"){ EQM.needOpen = !(el.parentElement && el.parentElement.open); return; }
  if(a==="portal-eqo-pdf"){
    const ms = loadMgr(App); if(!ms || EQM.pdfBusy) return;
    EQM.pdfBusy = true; EQM.pdfMsg = null; EQM.needOpen = true; App.render();
    eqoMakePdf(App, ms, el.dataset.via).then(m=>{ EQM.pdfBusy = false; EQM.pdfMsg = m || null; App.render(); })
      .catch(e=>{ EQM.pdfBusy = false; EQM.pdfMsg = "יצירת ה-PDF נכשלה: " + e.message; App.render(); });
    return;
  }
  if(a==="portal-ls-filter"){ LS.filter = el.dataset.k; return App.render(); }
  if(a==="portal-ls-refresh"){ LS.data = null; return App.render(); }
  if(a==="portal-ls-jump"){ const d = document.getElementById("ls-g"+el.dataset.i); if(d){ d.open = true; d.scrollIntoView({behavior:"smooth", block:"start"}); } return; }
  if(a==="portal-ls-openall"){ LS.openAll = !LS.openAll; return App.render(); }
  if(a.indexOf("portal-todo-")===0) return todoAction(App, a, el);
  if(a.indexOf("portal-mt-")===0) return mtAction(App, a, el);
  if(a.indexOf("portal-wtodo-")===0) return workerTodoAction(App, a, el);
  if(a.indexOf("portal-inc-")===0) return incClick(App, a, el);
  if(a.indexOf("portal-cal-")===0 || a.indexOf("portal-calw-")===0) return calClick(App, a, el);
  if(a==="portal-kmsg-send" || a==="portal-mmsg-send") return msgAction(App, a);
  if(a.indexOf("portal-dmg-")===0) return dmgAction(App, a, el);
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
    T.data = null; App.S.pubAt = {};
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
  st.textContent = `${AR_CSS}${HELP_CSS}
  .eqw-list{margin-top:10px;border:1px solid #f0c36d;background:#fff8e6;border-radius:10px;padding:8px 10px;} .eqw-list summary{cursor:pointer;font-weight:700;color:#8a5a00;}
  .eqw-list .portal-task{background:#fff;margin-top:6px;}
  .eqw-badge{display:inline-block;background:#fff3cd;color:#8a5a00;border-radius:999px;padding:1px 8px;font-size:.82em;font-weight:600;}
  .eqo-task{border-color:#7aa7e6;background:#eef5ff;} .eqo-task summary{color:#0d4a94;}
  .eqw-name{cursor:pointer;text-decoration:underline;text-decoration-color:#9bb6d8;}
  .eqs-tag{display:inline-block;border-radius:999px;padding:0 7px;font-size:.8em;font-weight:600;} .eqs-tag.eqs-ordered{background:#dbeafe;color:#0d4a94;} .eqs-tag.eqs-serial{background:#eef2f7;color:#334155;} .eqs-tag.eqs-not_received{background:#fde8e7;color:#b42318;}
  .eqs-sel{max-width:110px;} .eqs-sel.eqs-received{background:#e6f7ec;} .eqs-sel.eqs-not_received{background:#fde8e7;} .eqs-sel.eqs-ordered{background:#dbeafe;}
  .eqm-table td, .eqm-table th{padding:5px 4px;}
  .eqw-opts{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:4px 10px;margin-top:8px;} .eqw-opts label{display:flex;gap:6px;align-items:center;font-weight:normal;color:#1f2937;font-size:.95em;}
  .logout-bottom{text-align:center;margin:26px 0 8px;} .logout-bottom .btn{min-width:200px;}
  .dmg-table{width:100%;border-collapse:collapse;} .dmg-table th,.dmg-table td{border:1px solid var(--border);padding:6px 8px;text-align:right;vertical-align:top;} .dmg-table th{background:#f4f7fb;width:34%;font-weight:600;}
  .dmg-imgs{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;} .dmg-imgs img{width:96px;height:96px;object-fit:cover;border-radius:6px;border:1px solid var(--border);}
  .areq-file{position:relative;display:inline-block;} .areq-pdf{display:inline-flex;align-items:center;justify-content:center;width:96px;height:96px;border:1px solid var(--border);border-radius:6px;background:#f7f9fc;font-weight:700;text-decoration:none;}
  .areq-rm{position:absolute;top:2px;left:2px;background:#fff;border-radius:50%;padding:0 6px;cursor:pointer;}
  .sayvu-badge{display:inline-block;background:#5b21b6;color:#fff;font-weight:800;font-size:.75em;letter-spacing:.5px;border-radius:6px;padding:1px 7px;vertical-align:middle;}
  .inc-sec-h{font-weight:700;margin:4px 0 6px;color:#374151;}
  .dmg-tp{border:2px solid #f59e0b;background:#fffbeb;border-radius:10px;padding:10px;margin:-4px 0 12px;}
  .dmg-kind{font-size:.75em;border-radius:999px;padding:1px 7px;font-weight:700;} .dmg-kind.eq{background:#fff3cd;color:#7a5200;} .dmg-kind.acc{background:#fde7e5;color:#b42318;}
  .dmg-checklist{display:none;} .dmg-checklist.open{display:block;} .dmg-items-sum{margin:6px 0;font-size:.9em;} .dmg-items-btn{margin-bottom:2px;}
  .dmg-checklist{max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:4px 8px;background:#fff;}
  .dmg-checklist label{display:flex;align-items:center;gap:8px;padding:7px 2px;border-bottom:1px solid #f1f3f5;cursor:pointer;font-weight:400;}
  .dmg-checklist label:last-child{border-bottom:none;} .dmg-checklist input{width:20px;height:20px;flex:none;} .dmg-checklist .dmg-none{font-weight:700;}
  .dmg-multi{width:100%;min-height:150px;padding:4px;border:1px solid var(--border);border-radius:8px;} .dmg-multi option{padding:5px 6px;}
  .dmg-draftbar{background:#fff7e0;border:1px solid #f0d58a;border-radius:8px;padding:8px 10px;margin:6px 0;font-weight:600;}
  .dmg-sub{border:1px solid var(--border);border-radius:10px;padding:10px;margin:8px 0;background:#fafbfc;} .dmg-pick{display:inline-flex;gap:6px;margin-inline-start:6px;}
  .dmg-pfields{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:0 10px;margin-top:8px;} .dmg-auto{font-size:.78em;color:#1d4ed8;font-weight:600;}
  .dmg-items{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:4px 10px;} .dmg-box{border:1px solid #f3c4c0;background:#fff7f6;border-radius:10px;padding:10px;margin-bottom:12px;}

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
/* טיוטות אוטומטיות (דיווח נזק + תחקיר SAYVU) - 2026-10-20 */
let draftTimer = null;
function saveDraftsNow(){
  const App = window.__portalApp; if(!App) return;
  try{ if(DMG.open) dmgSaveDraft(App); }catch(e){}
  try{ incAutoSave(App); }catch(e){}
}
function scheduleDrafts(){ clearTimeout(draftTimer); draftTimer = setTimeout(saveDraftsNow, 1500); }
document.addEventListener("input", scheduleDrafts, true);
document.addEventListener("change", scheduleDrafts, true);
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="hidden") saveDraftsNow(); });
window.addEventListener("pagehide", saveDraftsNow);
if("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", ev=>{
  const App = window.__portalApp;
  if(ev.data && ev.data.type==="refresh" && App && App.S.view==="home" && loadSession(App)){ T.data = null; F.data = null; P.shifts = null; App.render(); }
});
window.Portal = { navKey, navSave, navRestore, navHasParent, navRoot, onDrag, renderHome, renderSection, renderManagerRequests, renderManagerPasswords, renderPView, pvTitle, onChange: onChangeTraining, resetPasswordsScreen(){ W.pin=null; W.list=null; W.error=null; W.msg=null; W.tried=false; W.loading=false; }, onClick, onInput, onKey, resetState(){ P.shifts=null; P.checkedSession=false; } };
})();
