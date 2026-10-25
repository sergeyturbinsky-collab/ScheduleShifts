// התראות פוש (מערכת התפעול). נקראת מ-pg_cron כל דקה.
// 1. שולחת את מה שממתין ב-push_outbox - לעובדים (worker_id) ולמנהלים (manager_id).
// 2. תזכורת על משימות שלא בוצעו - לכל עובד פעם ב-48 שעות, ורק בין 09:00 ל-21:00.
// בשבת (שישי 14:00 עד שבת 21:00) לא יוצאת שום התראה: הכל נשמר בתור ויוצא במוצאי שבת ב-21:00.
// (2026-10-25, סרגיי) "התראה שלא נמסרה לפני 14:00 בשישי - תקפוץ במוצ"ש":
//   - תוקף כל התראה נגמר לכל המאוחר בשישי 14:00 (כדי שלא תגיע לטלפון שנדלק בשבת).
//   - הטלפון מאשר קבלה (push_ack, מתוך sw.js). אחרי צאת השבת - מה שנשלח ב-24 השעות שלפני שישי 14:00
//     ולא אושר, נשלח שוב פעם אחת (resent_at), עם אותו tag, למי שיש לו מכשיר שכבר מאשר קבלות.
// (2026-10-25, סרגיי: "לא למחוק כלום אוטומטית") מכשיר שהשרת של אפל/גוגל מדווח שפג (404/410) לא נמחק -
//   מסומן gone_at, ולא שולחים אליו עד שנרשם מחדש.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const sb = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ACK_URL = SB_URL.replace(/\/$/, "") + "/rest/v1/rpc/push_ack";
const DAY = 24 * 3600e3;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function ensureKeys() {
  const { data } = await sb.from("push_config").select("key, value").in("key", ["vapid_public", "vapid_private"]);
  const m: Record<string, string> = {};
  (data || []).forEach((r: { key: string; value: string }) => (m[r.key] = r.value));
  if (!m.vapid_public || !m.vapid_private) {
    const k = webpush.generateVAPIDKeys();
    await sb.from("push_config").upsert([
      { key: "vapid_public", value: k.publicKey },
      { key: "vapid_private", value: k.privateKey },
    ]);
    m.vapid_public = k.publicKey;
    m.vapid_private = k.privateKey;
  }
  webpush.setVapidDetails("mailto:noreply@example.com", m.vapid_public, m.vapid_private);
  return m.vapid_public;
}

/* ---------- שעון ישראל ---------- */
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function ilParts(d: Date) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem", weekday: "short", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric", hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value || "0";
  return { y: +g("year"), mo: +g("month"), d: +g("day"), h: +g("hour") % 24, mi: +g("minute"), s: +g("second"), wd: WD.indexOf(g("weekday")) };
}
function ilOffset(d: Date) {
  const q = ilParts(d);
  return Date.UTC(q.y, q.mo - 1, q.d, q.h, q.mi, q.s) - Math.floor(d.getTime() / 1000) * 1000;
}
// הרגע (UTC) של שעה בשעון ישראל, ביום שזז daysAdd ימים מהתאריך הנתון
function ilAt(y: number, mo: number, d: number, daysAdd: number, h: number) {
  const base = Date.UTC(y, mo - 1, d + daysAdd, h, 0, 0);
  let t = base - ilOffset(new Date(base));
  t = base - ilOffset(new Date(t));
  return t;
}
function isShabbat(now = new Date()) {
  const q = ilParts(now);
  return (q.wd === 5 && q.h >= 14) || (q.wd === 6 && q.h < 21);
}
function nextFri14(now = new Date()) {
  const q = ilParts(now);
  let ahead = (5 - q.wd + 7) % 7;
  if (ahead === 0 && q.h >= 14) ahead = 7;
  return ilAt(q.y, q.mo, q.d, ahead, 14);
}
function lastFri14(now = new Date()) {
  const q = ilParts(now);
  let back = (q.wd - 5 + 7) % 7;
  if (back === 0 && q.h < 14) back = 7;
  return ilAt(q.y, q.mo, q.d, -back, 14);
}
// תוקף ההתראה: עד 24 שעות, ולא אחרי שישי 14:00
function ttlSeconds(now = new Date()) {
  const toShabbat = Math.floor((nextFri14(now) - now.getTime()) / 1000);
  return Math.max(60, Math.min(24 * 3600, toShabbat));
}

type Row = { id: number; worker_id: string | null; manager_id: string | null; title: string; body: string | null; url: string | null; tag: string | null; ack_key: string | null };
type Sub = { id: string; worker_id: string | null; manager_id: string | null; endpoint: string; p256dh: string; auth: string; last_ack_at: string | null };
const COLS = "id, worker_id, manager_id, title, body, url, tag, ack_key";
const SUB_COLS = "id, worker_id, manager_id, endpoint, p256dh, auth, last_ack_at";

async function subsFor(rows: Row[]) {
  const workerIds = [...new Set(rows.map((r) => r.worker_id).filter(Boolean))] as string[];
  const managerIds = [...new Set(rows.map((r) => r.manager_id).filter(Boolean))] as string[];
  let subs: Sub[] = [];
  if (workerIds.length) {
    const { data } = await sb.from("push_subscriptions").select(SUB_COLS).is("gone_at", null).in("worker_id", workerIds);
    subs = subs.concat((data || []) as Sub[]);
  }
  if (managerIds.length) {
    const { data } = await sb.from("push_subscriptions").select(SUB_COLS).is("gone_at", null).in("manager_id", managerIds);
    subs = subs.concat((data || []) as Sub[]);
  }
  return subs;
}
const mineOf = (r: Row, subs: Sub[]) =>
  subs.filter((s) => (r.worker_id && s.worker_id === r.worker_id) || (r.manager_id && s.manager_id === r.manager_id));

async function sendRow(r: Row, mine: Sub[], ttl: number) {
  let sent = 0;
  const payload = JSON.stringify({
    title: r.title, body: r.body || "", url: r.url || "./", tag: r.tag || ("o" + r.id),
    ack: r.ack_key || undefined, au: r.ack_key ? ACK_URL : undefined, ak: r.ack_key ? ANON : undefined,
  });
  for (const s of mine) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: ttl });
      sent++;
      await sb.from("push_subscriptions").update({ last_ok_at: new Date().toISOString() }).eq("id", s.id);
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from("push_subscriptions").update({ gone_at: new Date().toISOString() }).eq("id", s.id);
    }
  }
  return sent;
}

async function sendOutbox() {
  const { data: rows } = await sb.from("push_outbox").select(COLS).is("sent_at", null).order("id").limit(300);
  if (!rows || !rows.length) return 0;
  const subs = await subsFor(rows as Row[]);
  const ttl = ttlSeconds();
  let sent = 0;
  for (const r of rows as Row[]) {
    sent += await sendRow(r, mineOf(r, subs), ttl);
    await sb.from("push_outbox").update({ sent_at: new Date().toISOString() }).eq("id", r.id);
  }
  return sent;
}

// אחרי צאת השבת: מה שנשלח ב-24 השעות שלפני שישי 14:00 ולא אושר שהגיע - נשלח שוב, פעם אחת
async function resendAfterShabbat() {
  const fri = lastFri14();
  if (Date.now() - fri > 3 * DAY) return 0; // רק בימים הראשונים אחרי השבת
  const { data: rows } = await sb.from("push_outbox").select(COLS)
    .not("sent_at", "is", null).lt("sent_at", new Date(fri).toISOString()).gte("sent_at", new Date(fri - DAY).toISOString())
    .is("delivered_at", null).is("resent_at", null).not("ack_key", "is", null).order("id").limit(300);
  if (!rows || !rows.length) return 0;
  const subs = await subsFor(rows as Row[]);
  const ttl = ttlSeconds();
  let sent = 0;
  for (const r of rows as Row[]) {
    const mine = mineOf(r, subs);
    // רק למי שיש מכשיר שכבר מאשר קבלה (sw.js מעודכן) - אחרת אין דרך לדעת שלא הגיעה
    if (mine.some((s) => s.last_ack_at)) sent += await sendRow(r, mine, ttl);
    await sb.from("push_outbox").update({ resent_at: new Date().toISOString() }).eq("id", r.id);
  }
  return sent;
}

async function queueReminders() {
  const q = ilParts(new Date());
  if (q.h < 9 || q.h >= 21) return { skipped: true, wd: WD[q.wd], hour: q.h };
  const { data: cands, error } = await sb.rpc("push_reminder_candidates");
  if (error) return { error: error.message };
  if (!cands || !cands.length) return { queued: 0 };
  const rows = cands.map((c: { worker_id: string; items: string[] }) => ({
    worker_id: c.worker_id,
    title: "תזכורת: משימות שלא בוצעו",
    body: c.items.join(" · "),
    url: "./",
    tag: "reminder",
  }));
  await sb.from("push_outbox").insert(rows);
  await sb.rpc("push_mark_reminded", { p_workers: cands.map((c: { worker_id: string }) => c.worker_id) });
  return { queued: rows.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    let b: { mode?: string; now?: string } = {};
    try { b = await req.json(); } catch { b = {}; }
    const publicKey = await ensureKeys();
    if (b.mode === "key") return json({ publicKey });
    if (b.mode === "clock") {
      const now = b.now ? new Date(b.now) : new Date();
      return json({ now: now.toISOString(), shabbat: isShabbat(now), nextFri14: new Date(nextFri14(now)).toISOString(), lastFri14: new Date(lastFri14(now)).toISOString(), ttl: ttlSeconds(now) });
    }
    if (isShabbat()) return json({ ok: true, shabbat: true, sent: 0 });
    const reminders = b.mode === "outbox" ? null : await queueReminders();
    const sent = await sendOutbox();
    const resent = await resendAfterShabbat();
    return json({ ok: true, sent, resent, reminders });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
