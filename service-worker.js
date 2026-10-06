const CACHE = "redbeat-v3";
const BASE = "/projeto-spotify-flexa/";

const APP_SHELL = [
  BASE,
  `${BASE}index.html`,
  `${BASE}styles.css`,
  `${BASE}app.js`,
  `${BASE}pwa.js`,
  `${BASE}auth.js`,
  `${BASE}media.js`,
  `${BASE}firebase.js`,
  `${BASE}manifest.json`,
  `${BASE}assets/redbeat-logo.png`,
  `${BASE}assets/icon-192.png`,
  `${BASE}assets/icon-512.png`,
  `${BASE}assets/maskable-512.png`,
  `${BASE}assets/apple-touch-icon.png`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isLocal = url.origin === self.location.origin;
  const isFirebaseModule =
    url.hostname === "www.gstatic.com" &&
    url.pathname.includes("/firebasejs/");

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(`${BASE}index.html`)),
    );
    return;
  }

  if (isLocal) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) return cached;

        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, response.clone());
        }
        return response;
      }),
    );
    return;
  }

  if (isFirebaseModule) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then(async (response) => {
            if (response.ok) {
              const cache = await caches.open(CACHE);
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);

        return cached || network;
      }),
    );
  }
});
