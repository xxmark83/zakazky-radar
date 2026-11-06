// Service worker Zakázek radaru. Statické soubory Next.js (/_next/static, mají v názvu otisk obsahu)
// bere z mezipaměti, takže appka z plochy naběhne rychle. Stránky a API jdou vždy na server – data jsou čerstvá.
const CACHE = "zr-static-v3";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// offline: stránka appky a uložená data (stav, sledovaní) – vždy napřed ze sítě, bez sítě z poslední kopie
const DATA = "zr-data-v1";
const OFFLINE = ["/api/state", "/api/buyers", "/api/competitors"];

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (e.request.mode === "navigate" || OFFLINE.includes(url.pathname)) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          // přihlašovací stránku (přesměrování) neukládat
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(DATA).then((c) => c.put(e.request.mode === "navigate" ? "/" : url.pathname, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request.mode === "navigate" ? "/" : url.pathname).then((hit) => hit || Response.error())),
    );
    return;
  }
  if (!url.pathname.startsWith("/_next/static/")) return;
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
