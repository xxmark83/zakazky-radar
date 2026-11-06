// Service worker Zakázek radaru. Statické soubory Next.js (/_next/static, mají v názvu otisk obsahu)
// bere z mezipaměti, takže appka z plochy naběhne rychle. Stránky a API jdou vždy na server – data jsou čerstvá.
const CACHE = "zr-static-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || !url.pathname.startsWith("/_next/static/")) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }),
  );
});

// upozornění z /api/cron (nové zakázky, blížící se lhůty, sledovaní zadavatelé)
self.addEventListener("push", (e) => {
  const msg = e.data ? e.data.json() : { title: "Zakázky radar", body: "" };
  e.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: msg.tag,
      data: { url: msg.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.location.origin));
      return open ? open.focus().then((c) => c.navigate(url)) : self.clients.openWindow(url);
    }),
  );
});
