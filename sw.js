/* Service worker של "איזור אישי": התקנה למסך הבית, התראות פוש, ושמירת האפליקציה בטלפון.
   (2026-10-22, סרגיי: "שהמערכת תרוץ יותר מהר ותיתקע פחות")
   - הדף הראשי: מוצג מיד מהעותק השמור, ובמקביל נבדקת גרסה חדשה ברשת. אם יש - נשמרת, והדף מקבל הודעה
     ומציג "גרסה חדשה זמינה" (לחיצה = רענון). בלי רשת - העותק השמור עדיין עולה.
   - portal.js?v=N וקבצי אייקונים: נשמרים לפי הגרסה (הכתובת משתנה בכל עדכון), כך שאין ערבוב גרסאות.
   - בקשות לשרת הנתונים (Supabase) ולאתרים אחרים לא עוברות כאן בכלל. */
const CACHE = "app-v1";
const SCOPE = new URL(self.registration.scope);

self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

const PAGE_KEY = SCOPE.href; // עותק אחד של הדף הראשי, בלי קשר לפרמטרים בכתובת

async function notifyAll(msg) {
  for (const c of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) c.postMessage(msg);
}

async function pageResponse(e) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(PAGE_KEY);
  const old = cached ? await cached.clone().text() : null; // קוראים לפני שהעותק נמסר לדף
  const fromNet = (async () => {
    const res = await fetch(e.request.url, { cache: "no-store", credentials: "same-origin" });
    if (res.ok && res.type === "basic") {
      const fresh = await res.clone().text();
      await cache.put(PAGE_KEY, new Response(fresh, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
      if (old !== null && old !== fresh) await notifyAll({ type: "new-version" });
    }
    return res;
  })();
  if (cached) {
    e.waitUntil(fromNet.catch(() => {}));
    return cached;
  }
  try { return await fromNet; } catch (err) { return Response.error(); }
}

async function versioned(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") {
    await cache.put(req, res.clone());
    // שומרים רק את שתי הגרסאות האחרונות של portal.js
    const url = new URL(req.url);
    if (url.pathname.endsWith("/portal.js")) {
      const olds = (await cache.keys()).filter(k => new URL(k.url).pathname.endsWith("/portal.js") && k.url !== req.url);
      for (const k of olds.slice(0, Math.max(0, olds.length - 1))) await cache.delete(k);
    }
  }
  return res;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  const rel = url.pathname.slice(SCOPE.pathname.length);
  if (rel.startsWith("demo/") || rel.startsWith("tools/")) return;
  if (req.mode === "navigate" && (rel === "" || rel === "index.html")) { e.respondWith(pageResponse(e)); return; }
  if ((rel === "portal.js" && url.search) || /^(icon-|apple-touch-icon)/.test(rel)) { e.respondWith(versioned(req)); return; }
});

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: "איזור אישי", body: e.data ? e.data.text() : "" }; }
  const title = d.title || "איזור אישי";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "",
    icon: "icon-192.png",
    badge: "icon-192.png",
    dir: "rtl",
    lang: "he",
    tag: d.tag || undefined,
    data: { url: d.url || "./" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if (c.url.startsWith(self.registration.scope)) { await c.focus(); c.postMessage({ type: "refresh" }); return; } }
    await self.clients.openWindow(url);
  })());
});
