// The web app's own site (Cloudflare) also carries its API: /api/... is
// passed on to the NoticeBoard server (API_ORIGIN, the Oracle server) and
// everything else is the app's files.
//
// Why: the app and its API on one address means the browser asks the
// server once per request instead of twice (no cross-site permission
// check first), the secure connection is made to a Cloudflare server
// nearby instead of one far away, and networks that block the server's own
// address (some campus Wi-Fi blocks free dynamic-DNS names) still reach it.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (env.API_ORIGIN && (url.pathname === "/api" || url.pathname.startsWith("/api/"))) {
      const target = new URL(url.pathname.slice(4) || "/", env.API_ORIGIN);
      target.search = url.search;
      const headers = new Headers(request.headers);
      // The server sees who is asking, not Cloudflare, for its per-address limits.
      const client = request.headers.get("CF-Connecting-IP");
      if (client) headers.set("X-Forwarded-For", client);
      const response = await fetch(target, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        redirect: "manual",
      });
      return response;
    }
    return env.ASSETS.fetch(request);
  },
};
