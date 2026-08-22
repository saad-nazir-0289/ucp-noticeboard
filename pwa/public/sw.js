// Runs independently of the app being open — this is what lets a
// notification arrive and be tapped even when the PWA isn't running.

// A repeat visit shouldn't have to re-download the app's own JS/CSS every
// time — those files only change when you actually ship a new version.
// Cache-first here means: if we already have it, serve it instantly and
// skip the network entirely; only fetch if it's genuinely new.
const APP_SHELL_CACHE = "ucpnb-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== APP_SHELL_CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only cache same-origin, GET requests for the app's own files — never
  // API calls (those need to always be fresh) and never cross-origin
  // requests (Cloudinary images, the backend API).
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.open(APP_SHELL_CACHE).then((cache) =>
      cache.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          })
          .catch(() => cached); // offline and nothing cached yet — nothing more we can do

        // Serve the cached version instantly if we have one, and quietly
        // refresh the cache in the background for next time — this is
        // what makes a repeat visit feel instant instead of waiting on
        // the network even when the network is actually fine.
        return cached || networkFetch;
      })
    )
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "UCP NoticeBoard", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "UCP NoticeBoard", {
      body: payload.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url || "/" },
    })
  );
});

// Tapping the notification focuses an already-open tab if there is one,
// instead of always opening a fresh one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
