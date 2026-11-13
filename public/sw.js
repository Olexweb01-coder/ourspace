// Our Space service worker: push notifications + the app itself, saved on the phone so it opens without internet.
// Notifications never contain message text; the server can't read it.
const CACHE = "ourspace-static-v1";
const PAGES_CACHE = "ourspace-pages-v1";
// The app's own screens: the passcode screen and the chat. Saved on the phone (they contain no messages or keys).
const PAGES = ["/", "/chat"];
const NETWORK_WAIT_MS = 2000;   // use the internet if it answers this fast, else open from the phone at once

const pageKey = (kind, path) => new Request(`${self.location.origin}/__saved/${kind}${path === "/" ? "/home" : path}`);

async function savePage(kind, path, res) {
  if (!res || !res.ok || res.type !== "basic") return;
  const cache = await caches.open(PAGES_CACHE);
  await cache.put(pageKey(kind, path), res);
}

// Save both screens as soon as this helper is installed, so the very next open works offline.
async function saveAllPages() {
  await Promise.all(PAGES.map(async (path) => {
    try { await savePage("page", path, await fetch(path, { cache: "no-store" })); } catch (e) { /* offline now: saved on next open */ }
    try { await savePage("data", path, await fetch(path, { cache: "no-store", headers: { RSC: "1" } })); } catch (e) { /* same */ }
  }));
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(saveAllPages());
});

// Network first, but never wait long: if the internet is slow or gone, open from the phone straight away.
async function pageFromNetworkOrPhone(req, kind, path) {
  const cache = await caches.open(PAGES_CACHE);
  const saved = () => cache.match(pageKey(kind, path), { ignoreVary: true })
    .then((r) => r || (kind === "prefetch" ? cache.match(pageKey("data", path), { ignoreVary: true }) : r))
    .then((r) => r || (kind === "page" ? cache.match(pageKey("page", "/"), { ignoreVary: true }) : r));
  const fromNet = fetch(req).then(async (res) => {
    if (res.ok && res.type === "basic") await cache.put(pageKey(kind, path), res.clone());
    return res;
  });
  const timeout = new Promise((ok) => setTimeout(() => ok("slow"), NETWORK_WAIT_MS));
  try {
    const first = await Promise.race([fromNet, timeout]);
    if (first !== "slow") return first;
    const s = await saved();   // slow network: the saved copy now, the fresh one is saved for next time
    if (s) { fromNet.catch(() => {}); return s; }
    return await fromNet;
  } catch (e) {
    const s = await saved();   // no internet
    if (s) return s;
    throw e;
  }
}

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE && k !== PAGES_CACHE && k !== "ourspace-disguise").map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Hashed build files and icons never change, so cache them for fast opens.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // The app's screens (and the data the app loads when moving between them): open even without internet.
  if (PAGES.includes(url.pathname)) {
    const isData = req.headers.get("RSC") === "1";
    if (req.mode === "navigate" || isData) {
      const kind = !isData ? "page" : req.headers.get("Next-Router-Prefetch") ? "prefetch" : "data";
      event.respondWith(pageFromNetworkOrPhone(req, kind, url.pathname));
      return;
    }
  }
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
    // Disguised on this phone: notifications use the disguise name and icon, and never say what they're about.
    let disguise = null;
    try {
      const hit = await (await caches.open("ourspace-disguise")).match("/__disguise");
      if (hit) disguise = await hit.json();
    } catch (e) { disguise = null; }
    await self.registration.showNotification(disguise ? disguise.name : title, {
      body: disguise ? "You have a new notification." : (data.body || ""),
      tag: (data.space ? data.space.slice(0, 8) + ":" : "") + (data.tag || "ourspace"),   // per space, so spaces never replace each other
      renotify: true,
      // A nudge is a call to come online: it stays on screen until tapped and buzzes like a heartbeat
      // (Android/desktop; iPhone shows it on the lock screen with its normal sound).
      requireInteraction: isNudge,
      vibrate: isNudge ? [120, 90, 120, 600, 120, 90, 120] : [80],
      icon: disguise ? disguise.icon : "/icons/icon-192.png",
      ...(disguise ? {} : { badge: "/icons/badge-96.png" }),
      data: { url: data.url || "/", space: data.space || null, open: data.open || null },
    });
    await updateBadge();
  })());
});

// The number on the Home Screen icon: how many notifications are still waiting (where the phone supports it).
async function updateBadge() {
  try {
    const n = (await self.registration.getNotifications()).length;
    if (!self.navigator.setAppBadge) return;
    if (n > 0) await self.navigator.setAppBadge(n); else await self.navigator.clearAppBadge();
  } catch (e) { /* not supported here */ }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  event.waitUntil((async () => {
    await updateBadge();
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of windows) {
      if ("focus" in c) {
        // Already open: tell it what to show (a game table, Love debts, the planner…), then bring it forward.
        c.postMessage({ type: "open", open: d.open || null, space: d.space || null });
        return c.focus();
      }
    }
    // Not open: start the app on this notification's own space and place.
    return self.clients.openWindow(d.url || "/");
  })());
});
