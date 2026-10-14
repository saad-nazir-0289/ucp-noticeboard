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
        Promise.all(keys.filter((key) => key !== APP_SHELL_CACHE && key !== SHARE_CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

// "Share to NoticeBoard" (manifest share_target): Android hands the shared
// text/link/image to us as a form POST. Stash it on the device and open
// the app, which picks it up (src/shareInbox.ts) and pre-fills a notice.
// Nothing is sent to any server here.
const SHARE_CACHE = "ucpnb-share";

async function receiveShare(request) {
  try {
    const form = await request.formData();
    const cache = await caches.open(SHARE_CACHE);
    const meta = {
      title: form.get("title") || "",
      text: form.get("text") || "",
      url: form.get("url") || "",
      receivedAt: Date.now(),
    };
    await cache.put("/__share/meta", new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } }));
    const image = form.getAll("media").find((f) => f && typeof f !== "string" && f.type.startsWith("image/"));
    if (image) {
      await cache.put("/__share/image", new Response(image, { headers: { "Content-Type": image.type, "X-File-Name": encodeURIComponent(image.name || "shared-image") } }));
    } else {
      await cache.delete("/__share/image");
    }
  } catch {
    /* if anything goes wrong, still open the app — it just won't be pre-filled */
  }
  return Response.redirect("/?share=1", 303);
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === "POST" && url.origin === self.location.origin && url.pathname === "/share-target") {
    event.respondWith(receiveShare(event.request));
    return;
  }

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
      // The large rich image shown inside the notification body itself
      // (supported on Android Chrome; other platforms that don't support
      // it simply ignore this field rather than breaking). Distinct from
      // icon/badge above, which stay the small app-branded ones.
      image: payload.image || undefined,
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
