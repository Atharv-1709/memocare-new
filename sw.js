const CACHE_VERSION = "memocare-shell-v6";
const APP_SHELL = [
  "./",
  "./index.html",
  "./privacy.html",
  "./family.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./models/tiny_face_detector_model-weights_manifest.json",
  "./models/tiny_face_detector_model-shard1",
  "./models/face_landmark_68_model-weights_manifest.json",
  "./models/face_landmark_68_model-shard1",
  "./models/face_recognition_model-weights_manifest.json",
  "./models/face_recognition_model-shard1",
  "./models/face_recognition_model-shard2",
  "./css/tokens.css",
  "./css/components.css",
  "./css/pages.css",
  "./config/auth-config.js",
  "./js/app.js",
  "./js/accessibility.js",
  "./js/ai.js",
  "./js/alerts.js",
  "./js/assistance.js",
  "./js/auth.js",
  "./js/i18n.js",
  "./js/games.js",
  "./js/maps.js",
  "./js/medications.js",
  "./js/notifications.js",
  "./js/router.js",
  "./js/recognition.js",
  "./js/storage.js",
  "./js/utils.js",
  "./js/voice.js",
  "./locales/en.json",
  "./locales/hi.json",
  "./locales/ur.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("memocare-") && key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => response.ok ? response : Promise.reject(new Error(`HTTP ${response.status}`)))
        .catch(async () => (await caches.match(request)) || (await caches.match("./index.html")) || new Response(
          '<!doctype html><meta name="viewport" content="width=device-width"><title>MemoCare offline</title><main style="font:18px system-ui;padding:2rem"><h1>MemoCare is offline</h1><p>This page is not saved yet. Reconnect and try again.</p><a href="./index.html">Open MemoCare home</a></main>',
          { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
        ))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const update = fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || update;
    })
  );
});
