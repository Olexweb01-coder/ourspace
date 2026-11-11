// Our Space service worker: push notifications + offline shell for static files.
// Notifications never contain message text; the server can't read it.
const CACHE = "ourspace-static-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Hashed build files and icons never change, so cache them for fast opens.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/_next/static/") && !url.pathname.startsWith("/icons/")) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  })());
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = data.title || "Our Space";
  const isNudge = data.tag === "nudge";
  event.waitUntil((async () => {
    // If the app is open, tell it to fetch the new message right away.
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    windows.forEach((c) => c.postMessage({ type: "push", tag: data.tag || null }));
    await self.registration.showNotification(title, {
      body: data.body || "",
      tag: (data.space ? data.space.slice(0, 8) + ":" : "") + (data.tag || "ourspace"),   // per space, so spaces never replace each other
      renotify: true,
      // A nudge is a call to come online: it stays on screen until tapped and buzzes like a heartbeat
      // (Android/desktop; iPhone shows it on the lock screen with its normal sound).
      requireInteraction: isNudge,
      vibrate: isNudge ? [120, 90, 120, 600, 120, 90, 120] : [80],
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { url: data.url || "/", space: data.space || null },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of windows) {
      if ("focus" in c) return c.focus();
    }
    // Open the installed app's own start page (it remembers the space).
    return self.clients.openWindow("/");
  })());
});
