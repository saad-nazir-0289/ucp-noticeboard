// The web app's own site (Cloudflare) also carries its API: /api/... is
// passed on to the NoticeBoard server (API_ORIGIN, the Oracle server in
// Mumbai) and everything else is the app's files.
//
// Why: the app and its API on one address means the browser asks the
// server once per request instead of twice (no cross-site permission
// check first), the secure connection is made to a Cloudflare server
// nearby, and networks that block the server's own address (some campus
// Wi-Fi blocks free dynamic-DNS names) still reach it.
//
// The leg from Cloudflare to the server sometimes stalls or fails to
// connect (Cloudflare's 522/525). Each attempt therefore has a time
// limit, and a request that is safe to send twice is retried once on a
// fresh connection. If both fail, a short web page with status 504 tells
// the app and extension to go to the server's own address instead
// (shared/api/client.ts).

// Only what the API reads: no Cloudflare or browser bookkeeping headers.
const FORWARD = [
  "accept",
  "accept-encoding",
  "accept-language",
  "authorization",
  "content-type",
  "origin",
  "user-agent",
  "x-admin-pin",
  "x-device-token",
  "access-control-request-method",
  "access-control-request-headers",
];
const FIRST_TRY_MS = 4000;
const RETRY_MS = 9000;
// A change is sent once only, so it gets the whole time.
const ONLY_TRY_MS = 25000;

function safeToRepeat(method, path) {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  // Signing in twice is harmless.
  return method === "POST" && path === "/login";
}

function gaveUp() {
  return new Response("<!doctype html><title>Server not reached</title><p>The NoticeBoard server didn't answer in time.</p>", {
    status: 504,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!env.API_ORIGIN || !(url.pathname === "/api" || url.pathname.startsWith("/api/"))) {
      return env.ASSETS.fetch(request);
    }

    const path = url.pathname.slice(4) || "/";
    const target = new URL(path, env.API_ORIGIN);
    target.search = url.search;
    const headers = new Headers();
    for (const name of FORWARD) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    // The server sees who is asking, not Cloudflare, for its per-address limits.
    const client = request.headers.get("cf-connecting-ip");
    if (client) headers.set("x-forwarded-for", client);
    const method = request.method;
    // Read once, so a retry can send it again.
    const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
    const attempt = (ms) =>
      fetch(target, { method, headers, body, redirect: "manual", signal: AbortSignal.timeout(ms) });
    const failed = (response) => response.status >= 520 && response.status <= 527;

    const repeat = safeToRepeat(method, path);
    try {
      const response = await attempt(repeat ? FIRST_TRY_MS : ONLY_TRY_MS);
      if (!failed(response) || !repeat) return response;
    } catch {
      if (!repeat) return gaveUp();
    }
    try {
      const response = await attempt(RETRY_MS);
      return failed(response) ? gaveUp() : response;
    } catch {
      return gaveUp();
    }
  },
};
