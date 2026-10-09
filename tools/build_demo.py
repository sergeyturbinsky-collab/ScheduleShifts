# בונה את demo/index.html מתוך index.html החי: אותו קוד, עם הגדרות הדמו (Supabase, כותרת, באנר, footer),
# הפורטל (portal.js), כפתור פרסום סידור, ומפתחות localStorage נפרדים. להריץ מתיקיית השורש של הריפו:
#   python3 tools/build_demo.py
import re
src=open("index.html",encoding="utf-8").read()
s=src
def rep(o,n,cnt=1):
    global s
    assert s.count(o)==cnt,(o[:80],s.count(o)); s=s.replace(o,n)
rep("<title>הגשת אילוצים ובניית סידור עבודה</title>","""<title>הגשת אילוצים ובניית סידור עבודה — דמו</title>
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#0c3a6e">
<link rel="icon" href="icon-192.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="איזור אישי">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<script>if("serviceWorker" in navigator) window.addEventListener("load", ()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));</script>""")
rep("<body>\n","""<body>
<div id="demoBanner" style="direction:rtl;background:#1a1a2e;color:#f3f3f3;padding:10px 14px;font-size:13px;line-height:1.9;text-align:center;">
<b>🎭 גרסת דמו — עותק של המבנה האמיתי (עובדים, גזרות, תקנים, אילוצים ושיבוצים) עם קודים של דמו. שינויים כאן לא משפיעים על המערכת האמיתית.</b><br>
<span style="opacity:.9"><b>כניסת עובד:</b> קוד אישי בדמו = ספרת הצוות ואחריה מספר סידורי לפי א"ב (אלירן חמו 1001…, אביחי קדוש 2001…, דניאל כתב 3001…, עידן בסעד 4001…, מוקד 6001…). הקוד של כל עובד מופיע ב"ניהול עובדים".</span><br>
<span style="opacity:.9"><b>קודי קב"ט בדמו:</b> אלירן חמו 1111 · מאיר אזרואל 2222 · עידן בסעד 4444 · מוקד 6666 &nbsp;|&nbsp; <b>קוד עריכה:</b> 0000</span>
</div>
""")
rep("<footer>מערכת פנימית · חברת אבטחה</footer>","<footer>מערכת פנימית · חברת אבטחה · סביבת דמו</footer>")
DEMO_CFG = """/* ⚠️ גרסת דמו: מחוברת לפרויקט Supabase נפרד ("constraints-app-demo"), עם עותק של המבנה האמיתי וקודים של דמו -
   כתיבה כאן לא משפיעה על המערכת הפעילה. */
const SUPABASE_URL = "https://wcbnkrtxdzfygyyanasx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjYm5rcnR4ZHpmeWd5eWFuYXN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MDM3NTUsImV4cCI6MjEwNjE3OTc1NX0.XIYTF7r5CD5ItBHleP_9wtvXLfIn3LvbKmlaw3_bF7A";"""
m_real=re.search(r'const SUPABASE_URL = "[^"]+";\nconst SUPABASE_ANON_KEY = "[^"]+";', s)
assert m_real
s=s.replace(m_real.group(0), DEMO_CFG)
assert "wcbnkrtxdzfygyyanasx" in s and "hcejwcxsqhpiufaakalj" not in s

# ---- portal + publish patches ----
rep("""<script>
(function(){
"use strict";""","""<script src="portal.js?v=25"></script>
<script>
(function(){
"use strict";""")
rep("""function renderHome(){
  return `
  <div class="card">
    <h2>מה תרצו לעשות?</h2>""","""function renderHome(){
  // פורטל עובד (דמו, 2026-10-07): מסך הכניסה הראשי הוא בחירת שם + קוד אישי - ראו portal.js
  if(window.Portal) return window.Portal.renderHome(App);
  return renderManagerMenu();
}
function renderManagerMenu(){
  return `
  <div class="card">
    ${window.Portal? `<span class="backlink" data-action="managers-back">◀ חזרה למסך הכניסה</span>`:""}
    <h2>מה תרצו לעשות?</h2>""")
rep("""    S.view==="home" ? "" :
    S.view==="submit" ? "הגשת אילוצים" :""","""    S.view==="home" ? "" :
    S.view==="managers" ? "כניסת מנהלים" :
    S.view==="submit" ? "הגשת אילוצים" :""")
rep("""  if(S.view==="home") html = renderHome();""","""  if(S.view==="home") html = renderHome();
  else if(S.view==="managers") html = renderManagerMenu();""")
rep("""function goHome(){ S.view="home"; S.ui={}; render(); }""","""function goHome(){ S.view = S.managerMode ? "managers" : "home"; S.ui={}; render(); }""")
rep("""  if(a==="go-home") return goHome();""","""  if(a==="go-home") return goHome();
  if(a.startsWith("portal-") && window.Portal){
    if(a==="portal-managers") S.managerMode = true;
    return window.Portal.onClick(App, a, el);
  }
  if(a==="managers-back"){ S.managerMode = false; S.view="home"; S.ui={}; return render(); }""")
rep("""  app.onchange = onAppChange;""","""  app.onchange = onAppChange;
  app.oninput = e=>{ if(window.Portal) window.Portal.onInput(App, e); };
  app.onkeydown = e=>{ if(window.Portal) window.Portal.onKey(App, e); };
  ["dragover","dragleave","drop"].forEach(t=>app.addEventListener(t, e=>{ if(window.Portal && window.Portal.onDrag) window.Portal.onDrag(App, e); }));""")
rep("""init();
})();""","""/* מה שהפורטל (portal.js) צריך מהקוד הראשי */
const App = { SUPABASE_URL, SUPABASE_ANON_KEY, S, render, apiGet, apiRpc, escapeHtml, fmtDateHeb, fmtDate, addDays, parseDate, dayTypeForDate, SHIFT_LABELS, teamById, loadJSON, saveJSON, pickerTiles, sectorGroupForTeam, isMokedTeam, currentPeriodStart };

init();
})();""")
rep("""      ui.assignments = await apiGet("shift_assignments", `select=*&sector=${secFilter}&entry_date=in.(${dates.join(",")})&order=created_at.asc`);
    }""","""      ui.assignments = await apiGet("shift_assignments", `select=*&sector=${secFilter}&entry_date=in.(${dates.join(",")})&order=created_at.asc`);
    }
    // סטטוס פרסום הסידור לעובדים לתקופה המוצגת (דמו, 2026-10-07)
    try{ ui.publications = await apiGet("schedule_publications", `select=sector,period_start,published_at&period_start=eq.${ui.periodStart}`); }
    catch(e){ ui.publications = []; }""")
rep("""        <button class="btn secondary" data-action="toggle-monthly">פילוח חודשי (הגישו מול שובצו)</button>""","""        <button class="btn secondary" data-action="toggle-monthly">פילוח חודשי (הגישו מול שובצו)</button>
        ${group.citySectors.length ? (isSchedulePublished(group, ui)
          ? `<button class="btn secondary" data-action="open-pin" data-next="unpublish">בטל פרסום</button>`
          : `<button class="btn ok" data-action="open-pin" data-next="publish">📢 פרסם סידור לעובדים</button>`) : ""}""")
rep("""      ${ui.buildMsg? `<p style="margin-top:8px;">${escapeHtml(ui.buildMsg)}</p>`:""}
      ${renderMonthlyPanel(ui, isMoked)}""","""      ${group.citySectors.length ? `<p class="muted" style="margin-top:8px;">${isSchedulePublished(group, ui) ? "✅ הסידור לתקופה הזו פורסם — העובדים רואים אותו ב\\"המשמרות שלי\\"." : "📝 טיוטה — העובדים עדיין לא רואים את הסידור לתקופה הזו."}</p>` : ""}
      ${ui.buildMsg? `<p style="margin-top:8px;">${escapeHtml(ui.buildMsg)}</p>`:""}
      ${renderMonthlyPanel(ui, isMoked)}""")
rep("""    else if(next==="grant-exception") await grantOrRevokeException(workerId, period, true);""","""    else if(next==="publish" || next==="unpublish") await setSchedulePublished(next==="publish");
    else if(next==="grant-exception") await grantOrRevokeException(workerId, period, true);""")
rep("""/* --------- פתיחת/ביטול הגשה חריגה לעובד ספציפי אחרי הדדליין --------- */""","""/* --------- פרסום סידור לעובדים (דמו, 2026-10-07): עד הפרסום העובדים לא רואים את השיבוצים של התקופה --------- */
function isSchedulePublished(group, ui){
  const pubs = ui.publications || [];
  return group.citySectors.length>0 && group.citySectors.every(sec=>pubs.some(p=>p.sector===sec));
}
async function setSchedulePublished(publish){
  const ui = S.ui;
  const team = teamById(ui.teamId);
  const group = sectorGroupForTeam(team);
  const dates = periodDates(ui.periodStart, team);
  try{
    await apiRpc("rpc_set_schedule_published", {p_pin:S.pin, p_sectors:group.citySectors, p_period_start:ui.periodStart, p_period_end:dates[dates.length-1], p_published:publish});
    ui.buildMsg = publish ? "הסידור פורסם לעובדים." : "הפרסום בוטל — העובדים כבר לא רואים את הסידור לתקופה הזו.";
    await loadAggregateData(team);
  }catch(e){ ui.buildMsg = "שגיאה: " + e.message; render(); }
}

/* --------- פתיחת/ביטול הגשה חריגה לעובד ספציפי אחרי הדדליין --------- */""")
# ---- כותרות "איזור אישי" / "סידור עבודה" / "הדרכה" / "לוגיסטי" (2026-10-07) ----
rep("""    <h1>הגשת אילוצים ובניית סידור עבודה</h1>""","""    <h1 id="headerTitle">איזור אישי</h1>""")
rep("""  document.getElementById("headerSub").textContent =
    S.view==="home" ? "" :""","""  const portalCtx = !!window.Portal && !S.managerMode;
  document.getElementById("headerTitle").textContent = portalCtx ? "איזור אישי" : "הגשת אילוצים ובניית סידור עבודה";
  document.getElementById("headerSub").textContent =
    S.view==="home" ? "" :
    (portalCtx && S.view==="submit") ? "סידור עבודה" :
    S.view==="training" ? "הדרכה" :
    S.view==="logistics" ? "לוגיסטי" :
    S.view==="updates" ? "עדכונים והודעות" :""")
rep("""  else if(S.view==="managers") html = renderManagerMenu();""","""  else if(S.view==="managers") html = renderManagerMenu();
  else if((S.view==="training" || S.view==="logistics" || S.view==="updates") && window.Portal) html = window.Portal.renderSection(App, S.view);
  else if(S.view==="equipreq" && window.Portal) html = window.Portal.renderManagerRequests(App);""")
rep("""    S.view==="training" ? "הדרכה" :""","""    S.view==="equipreq" ? "בקשות ציוד" :
    S.view==="training" ? "הדרכה" :""")
rep("""      <button class="btn secondary" data-action="go-admin">ניהול עובדים ומורשי גישה</button>""","""      <button class="btn secondary" data-action="go-admin">ניהול עובדים ומורשי גישה</button>
      ${window.Portal? `<button class="btn secondary" data-action="portal-mgr-open">בקשות ציוד (לוגיסטי)</button>`:""}""")
# ---- ממשקי מנהלים (2026-10-08): סשן מנהל מחליף את קוד העריכה המשותף ----
rep("""  const pin = document.getElementById("pinInput").value;""","""  const isMgr = typeof S.pin==="string" && S.pin.startsWith("mgr:"); // מנהל מחובר: הסשן שלו במקום הקוד
  const pin = isMgr ? S.pin : document.getElementById("pinInput").value;""")
rep("""    S.pin = pin; localStorage.setItem("cst_pin", pin);
    const next = ui.pinPromptFor;""","""    S.pin = pin; if(!isMgr) localStorage.setItem("cst_pin", pin);
    const next = ui.pinPromptFor;""")
rep("""ui.pinPromptPeriod = el.dataset.period||null; ui.pinError=null; return render(); }""","""ui.pinPromptPeriod = el.dataset.period||null; ui.pinError=null; if(typeof S.pin==="string" && S.pin.startsWith("mgr:")) return confirmPin(); return render(); }""")
rep("""  if(a==="agg-back"){ S.ui = {}; return render(); }""","""  if(a==="agg-back"){ if(typeof S.pin==="string" && S.pin.startsWith("mgr:")) return goHome(); S.ui = {}; return render(); }""")
rep("""  if(a==="admin-back"){ ui.recipientLabel=null;""","""  if(a==="admin-back"){ if(typeof S.pin==="string" && S.pin.startsWith("mgr:")) return goHome(); ui.recipientLabel=null;""")
rep("""    <span class="backlink" data-action="agg-back">◀ בחירת צוות אחר</span>""","""    <span class="backlink" data-action="agg-back">${(typeof S.pin==="string" && S.pin.startsWith("mgr:")) ? "◀ חזרה" : "◀ בחירת צוות אחר"}</span>""")
rep("""    <span class="backlink" data-action="admin-back">◀ נמען אחר</span>""","""    <span class="backlink" data-action="admin-back">${(typeof S.pin==="string" && S.pin.startsWith("mgr:")) ? "◀ חזרה" : "◀ נמען אחר"}</span>""")
rep("""  else if(S.view==="equipreq" && window.Portal) html = window.Portal.renderManagerRequests(App);""","""  else if(S.view==="equipreq" && window.Portal) html = window.Portal.renderManagerRequests(App);
  else if(S.view==="mgrpw" && window.Portal) html = window.Portal.renderManagerPasswords(App);""")
rep("""    S.view==="equipreq" ? "בקשות ציוד" :""","""    S.view==="equipreq" ? "בקשות ציוד" :
    S.view==="mgrpw" ? "סיסמאות מנהלים" :""")
rep("""      ${window.Portal? `<button class="btn secondary" data-action="portal-mgr-open">בקשות ציוד (לוגיסטי)</button>`:""}""","""      ${window.Portal? `<button class="btn secondary" data-action="portal-mgr-open">בקשות ציוד (לוגיסטי)</button>`:""}
      ${window.Portal? `<button class="btn secondary" data-action="go-mgrpw">סיסמאות מנהלים</button>`:""}""")
rep("""  if(a==="managers-back"){""","""  if(a==="go-mgrpw" && window.Portal){ window.Portal.resetPasswordsScreen(); S.view="mgrpw"; S.ui={}; return render(); }
  if(a==="managers-back"){""")
# ---- הדרכה / בקרות / תכנים (2026-10-08): עמודי משנה של הפורטל ושינויי קבצים ----
rep("""  else if(S.view==="mgrpw" && window.Portal) html = window.Portal.renderManagerPasswords(App);""","""  else if(S.view==="mgrpw" && window.Portal) html = window.Portal.renderManagerPasswords(App);
  else if(S.view==="pview" && window.Portal) html = window.Portal.renderPView(App);""")
rep("""    S.view==="mgrpw" ? "סיסמאות מנהלים" :""","""    S.view==="mgrpw" ? "סיסמאות מנהלים" :
    (S.view==="pview" && window.Portal) ? window.Portal.pvTitle() :""")
rep("""  app.onchange = onAppChange;
  app.oninput""","""  app.onchange = e=>{ const act = e.target && e.target.dataset ? String(e.target.dataset.action||"") : ""; if(window.Portal && act.startsWith("portal-")) return window.Portal.onChange(App, e); return onAppChange(e); };
  app.oninput""")
# ---- מפתחות localStorage נפרדים לדמו (הדמו והחי באותו origin) ----
for k in ["identity","pin","team_access"]:
    s = s.replace('"cst_%s"' % k, '"cstdemo_%s"' % k)
open("demo/index.html","w",encoding="utf-8").write(s)
print("built demo/index.html", len(s))
