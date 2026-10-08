/* Service worker של "איזור אישי" (דמו): מאפשר התקנה למסך הבית ומציג התראות פוש.
   לא שומר עותק של האתר (תמיד נטען מהרשת), כדי שעדכונים יופיעו מיד. */
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {}); // נדרש להתקנה בחלק מהדפדפנים; לא משנה את הבקשות

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
