import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The API's main address goes through Cloudflare; when Cloudflare refuses
// (its daily limit) or can't be reached, requests go to the server itself.
const MAIN = "https://app.example/api";
const DIRECT = "https://server.example";

const html = (status: number) =>
  new Response("<html>Error 1027</html>", { status, headers: { "Content-Type": "text/html; charset=UTF-8" } });
const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function load() {
  vi.resetModules();
  vi.stubEnv("VITE_API_BASE_URL", MAIN);
  vi.stubEnv("VITE_API_FALLBACK_URL", DIRECT);
  return import("@shared/api/client");
}

describe("API fallback", () => {
  let calls: string[];
  beforeEach(() => {
    calls = [];
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const fetchWith = (answer: (url: string) => Response | Promise<Response>) =>
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      return answer(url);
    }));

  it("uses Cloudflare when it answers", async () => {
    const { apiFetch } = await load();
    fetchWith(() => json(200));
    await apiFetch("/notices");
    expect(calls).toEqual([`${MAIN}/notices`]);
  });

  it("goes to the server when Cloudflare's daily limit is reached, and stays there for a while", async () => {
    const { apiFetch } = await load();
    fetchWith((url) => (url.startsWith(MAIN) ? html(429) : json(200)));
    const first = await apiFetch("/notices", { method: "POST", body: "{}" });
    expect(first.status).toBe(200);
    await apiFetch("/categories");
    expect(calls).toEqual([`${MAIN}/notices`, `${DIRECT}/notices`, `${DIRECT}/categories`]);
  });

  it("reads go to the server when Cloudflare can't be reached", async () => {
    const { apiFetch } = await load();
    fetchWith((url) => {
      if (url.startsWith(MAIN)) throw new TypeError("Failed to fetch");
      return json(200);
    });
    expect((await apiFetch("/notices")).status).toBe(200);
  });

  it("never repeats a change that may already have reached the server", async () => {
    const { apiFetch } = await load();
    fetchWith((url) => {
      if (url.startsWith(MAIN)) throw new TypeError("Failed to fetch");
      return json(200);
    });
    await expect(apiFetch("/notices", { method: "POST", body: "{}" })).rejects.toThrow();
    expect(calls).toEqual([`${MAIN}/notices`]);
  });

  it("leaves the server's own errors alone", async () => {
    const { apiFetch } = await load();
    fetchWith(() => new Response("", { status: 429 }));
    expect((await apiFetch("/notices")).status).toBe(429);
    fetchWith(() => json(500, { title: "Server error" }));
    expect((await apiFetch("/notices")).status).toBe(500);
    expect(calls.every((url) => url.startsWith(MAIN))).toBe(true);
  });

  it("signing in may be repeated", async () => {
    const { api } = await load();
    fetchWith((url) => {
      if (url.startsWith(MAIN)) throw new TypeError("Failed to fetch");
      return json(200, { id: 1, name: "A", rollNumber: "R", role: "Student", token: "t", notices: [], categories: [] });
    });
    const result = await api.login("R", "");
    expect(result.token).toBe("t");
    expect(calls).toEqual([`${MAIN}/login`, `${DIRECT}/login`]);
  });
});
