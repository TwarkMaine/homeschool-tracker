// service-worker.js — network-first app-shell cache.
//
// Update model (the point of network-first): when the iPad opens the app
// AND the host is reachable, it always fetches the latest files and quietly
// refreshes its saved copy. When the host is NOT reachable (offline), it
// serves the last saved copy. So "pushing an update" = change a file, reopen
// the app — no version number to remember, no reinstall. The CACHE name below
// only needs bumping if a cached file ever gets stuck; normal updates don't
// require it.

const CACHE = "homeschool-shell-v4";

// The app shell. Relative URLs resolve against the SW scope.
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./logic.js",
  "./config.default.js",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Network-first for the shell: try the network, refresh the cached copy on
// success, and fall back to the cached copy when offline. This is what makes
// updates "just appear" on reopen while still working fully offline.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  // Only manage same-origin requests (the app's own files).
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Got a fresh copy from the host — cache it and serve it.
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        // Offline (or host down): serve the last saved copy.
        caches.match(req).then((cached) => cached || caches.match("./index.html"))
      )
  );
});
