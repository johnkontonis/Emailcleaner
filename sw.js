/*
 * 82-0 service worker — makes the app load instantly and work offline.
 *
 * Same-origin requests are network-first (so online players always get the
 * latest build) with a cache fallback for offline. Cross-origin assets (fonts,
 * team logos) are cache-first. Bump CACHE on meaningful asset changes.
 */
const CACHE = "82-0-v3";
const CORE = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/data.js",
  "/js/teams.js",
  "/js/game.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // The shared scoreboard must never be cached.
  if (sameOrigin && url.pathname.startsWith("/api/")) return;

  if (sameOrigin) {
    // Network-first, fall back to cache (then to the app shell when offline).
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match("/index.html")))
    );
  } else {
    // Cache-first for fonts / logos (they rarely change).
    e.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req)
            .then((res) => {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
              return res;
            })
            .catch(() => cached)
      )
    );
  }
});
