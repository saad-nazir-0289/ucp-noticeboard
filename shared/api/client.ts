import type { AddUserResult, AnalyticsSummary, BinNotice, AuthUser, Category, DeviceSession, LoginResult, Notice, PagedResult, UnlockDeviceResult, UpdateUserRoleResult, UserListItem, UserRole } from "../types";

// Set per build mode (production / local) in each app's Vite config.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
/**
 * The server's own address, used when the main one doesn't answer. In
 * production the main address goes through Cloudflare (pwa/worker.js),
 * whose free plan has a daily request limit: past it, or if Cloudflare
 * can't be reached, requests go straight to the server instead. Empty
 * (no fallback) in local builds.
 */
const API_FALLBACK_URL = (import.meta.env.VITE_API_FALLBACK_URL ?? "").replace(/\/+$/, "");
/** After a fallback, the server's own address is tried first for this long. */
const FALLBACK_FOR_MS = 15 * 60 * 1000;
let fallbackUntil = 0;

/**
 * Cloudflare refused the request itself: its error pages (the daily limit,
 * error 1027, or "couldn't reach the server", 52x) are web pages, while
 * the server's own answers never are.
 */
function refusedByProxy(response: Response): boolean {
  return (response.status === 429 || response.status >= 500) && (response.headers.get("Content-Type") ?? "").includes("text/html");
}

/** A repeatable request that hasn't been answered this long also goes the other way (see apiFetch). */
const SECOND_TRY_AFTER_MS = 3500;

/**
 * fetch() for an API path: through the main address, and if that one
 * refuses or can't be reached, through the other one.
 *
 * A request that is safe to send twice (`repeatable`: reads, signing in)
 * also goes the other way if the first hasn't answered within a few
 * seconds, and whichever answers first is used: the Cloudflare leg
 * sometimes stalls, while on campus only Cloudflare gets through, so
 * neither address can simply be given up on. A change that may have
 * reached the server is never sent twice.
 */
export async function apiFetch(path: string, init: RequestInit = {}, repeatable?: boolean): Promise<Response> {
  if (!API_FALLBACK_URL) return fetch(`${API_BASE_URL}${path}`, init);
  const method = (init.method ?? "GET").toUpperCase();
  const canRepeat = repeatable ?? (method === "GET" || method === "HEAD");
  const viaFallbackFirst = Date.now() < fallbackUntil;
  const [first, second] = viaFallbackFirst ? [API_FALLBACK_URL, API_BASE_URL] : [API_BASE_URL, API_FALLBACK_URL];
  // The second address answered: prefer it for a while (or, if that was
  // the main address again, go back to it).
  const secondWon = () => {
    fallbackUntil = viaFallbackFirst ? 0 : Date.now() + FALLBACK_FOR_MS;
  };

  if (!canRepeat) {
    const response = await fetch(`${first}${path}`, init);
    // Cloudflare's own refusal of a change (its daily limit) means the
    // server never saw it, so it can go the other way; any other error
    // page might have come after the server acted.
    if (!refusedByProxy(response) || response.status !== 429) return response;
    secondWon();
    return fetch(`${second}${path}`, init);
  }

  // Reads and signing in: the first address, and the second as well if
  // the first fails or is slow; the first good answer wins.
  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    let failures = 0;
    let lastRefusal: Response | null = null;
    let lastError: unknown = null;
    let secondStarted = false;
    const fail = (refusal: Response | null, err: unknown) => {
      if (refusal) lastRefusal = refusal;
      else lastError = err;
      failures += 1;
      if (failures === 2 && !settled) {
        settled = true;
        if (lastRefusal) resolve(lastRefusal);
        else reject(lastError);
      }
    };
    const run = (base: string, isSecond: boolean) =>
      fetch(`${base}${path}`, init).then(
        (response) => {
          if (refusedByProxy(response)) {
            fail(response, null);
            if (!isSecond) startSecond();
            return;
          }
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (isSecond) secondWon();
          resolve(response);
        },
        (err) => {
          fail(null, err);
          if (!isSecond) startSecond();
        }
      );
    const startSecond = () => {
      if (secondStarted) return;
      secondStarted = true;
      clearTimeout(timer);
      void run(second, true);
    };
    const timer = setTimeout(startSecond, SECOND_TRY_AFTER_MS);
    void run(first, false);
  });
}

/**
 * The API as a full address, for links that leave the app (shared notices,
 * calendar entries). The web app reaches the API through its own site
 * ("/api", proxied by pwa/worker.js), so its links get the site's address
 * in front.
 */
export const PUBLIC_API_URL = new URL(
  `${API_BASE_URL}/`,
  typeof location !== "undefined" ? location.origin : "http://localhost"
).href.replace(/\/$/, "");

/**
 * A request that didn't succeed, with a message a person can act on.
 * `status` is the HTTP status, or 0 when the server couldn't be reached
 * at all (offline, server down, blocked).
 */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Why the server couldn't be reached, as precisely as the browser lets us tell. */
function unreachableMessage(): string {
  return typeof navigator !== "undefined" && navigator.onLine === false
    ? "You're offline. Connect to the internet and try again."
    : "Couldn't connect to the NoticeBoard server. It may be down, or this network may be blocking it.";
}

/** What went wrong for a status the server gave no explanation for. */
function statusMessage(status: number): string {
  if (status === 401) return "Your sign-in has expired. Close and reopen the app to sign in again.";
  if (status === 403) return "Your account isn't allowed to do that.";
  if (status === 404) return "That no longer exists. It may have been deleted.";
  if (status === 413) return "That file is too large to upload.";
  if (status === 429) return "Too many requests from your network right now. Wait a minute and try again.";
  if (status === 502 || status === 503 || status === 504) {
    return `The NoticeBoard server isn't responding (error ${status}). It may be restarting; try again in a minute.`;
  }
  if (status >= 500) return `The NoticeBoard server ran into a problem (error ${status}). Try again in a few minutes.`;
  return `The request was refused (error ${status}).`;
}

/** The server's own explanation: plain text, or the message inside a JSON error. */
function serverMessage(body: string): string | null {
  const text = body.trim();
  if (!text) return null;
  if (!text.startsWith("{") && !text.startsWith("[") && !text.startsWith('"')) return text.length <= 300 ? text : null;
  try {
    const json = JSON.parse(text);
    if (typeof json === "string") return json;
    const errors = json?.errors && typeof json.errors === "object" ? Object.values(json.errors).flat().filter((e) => typeof e === "string") : [];
    return (json?.message ?? json?.detail ?? (errors as string[])[0] ?? json?.title ?? null) || null;
  } catch {
    return null;
  }
}

// "This device is unlocked" (see backend PinService): once set, every
// request carries it, and the server accepts it in place of the PIN for
// privileged actions. Only the PWA uses this for now.
const DEVICE_TOKEN_HEADER = "X-Device-Token";
let deviceToken: string | null = null;
let onDeviceTokenInvalid: (() => void) | null = null;

/**
 * Sets (or clears) this device's unlock token. `onInvalid` runs if the
 * server reports the token is no longer valid (expired, logged out, role
 * changed) — the token is dropped and the app should ask for the PIN again.
 */
export function setDeviceToken(token: string | null, onInvalid?: () => void): void {
  deviceToken = token;
  onDeviceTokenInvalid = onInvalid ?? null;
}

export function hasDeviceToken(): boolean {
  return deviceToken !== null;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  repeatable?: boolean
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (deviceToken) {
    headers[DEVICE_TOKEN_HEADER] = deviceToken;
  }

  let response: Response;
  try {
    response = await apiFetch(path, { ...options, headers }, repeatable);
  } catch {
    throw new ApiError(0, unreachableMessage());
  }

  if (deviceToken && response.headers.get("X-Device-Token-Status") === "invalid") {
    deviceToken = null;
    onDeviceTokenInvalid?.();
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    // The proxy in front of the server answers with a page of its own,
    // not an explanation; the rate limiter answers with nothing.
    const own = response.status >= 502 ? null : serverMessage(text);
    throw new ApiError(response.status, own ?? statusMessage(response.status));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  login: (rollNumber: string, name: string, activationCode?: string) =>
    request<LoginResult>(
      "/login",
      {
        method: "POST",
        body: JSON.stringify({ rollNumber, name, activationCode }),
      },
      undefined,
      // Signing in twice is harmless.
      true
    ),

  getNotices: (token: string, includeDismissed = false, includeExpired = false) => {
    const params = new URLSearchParams();
    if (includeDismissed) params.set("includeDismissed", "true");
    if (includeExpired) params.set("includeExpired", "true");
    const query = params.toString();
    return request<Notice[]>(`/notices${query ? `?${query}` : ""}`, {}, token);
  },

  getNotice: (id: number, token: string) =>
    request<Notice>(`/notices/${id}`, {}, token),

  recordView: (id: number, token: string) =>
    request<void>(`/notices/${id}/view`, { method: "POST" }, token),

  getDismissedNotices: (token: string) =>
    request<Notice[]>("/notices/dismissed", {}, token),

  createNotice: (
    data: {
      title: string;
      description: string;
      imageUrl: string;
      linkUrl: string;
      categoryId: number | null;
      deadline: string | null;
      /** Not needed when this device is unlocked. */
      pin?: string;
      /** Admin only (ignored for anyone else); leave out to keep it as is. */
      isPinned?: boolean;
      /** A "last call" push an hour before the deadline; leave out to keep it as is. */
      sendLastCall?: boolean;
    },
    token: string
  ) =>
    request<Notice>(
      "/notices",
      { method: "POST", body: JSON.stringify(data) },
      token
    ),

  updateNotice: (
    id: number,
    data: {
      title: string;
      description: string;
      imageUrl: string;
      linkUrl: string;
      categoryId: number | null;
      deadline: string | null;
      /** Not needed when this device is unlocked. */
      pin?: string;
      /** Admin only (ignored for anyone else); leave out to keep it as is. */
      isPinned?: boolean;
      /** A "last call" push an hour before the deadline; leave out to keep it as is. */
      sendLastCall?: boolean;
    },
    token: string
  ) =>
    request<Notice>(
      `/notices/${id}`,
      { method: "PUT", body: JSON.stringify(data) },
      token
    ),

  /** `pin` isn't needed when this device is unlocked. */
  deleteNotice: (id: number, pin: string | null, token: string) =>
    request<void>(pin ? `/notices/${id}?pin=${encodeURIComponent(pin)}` : `/notices/${id}`, { method: "DELETE" }, token),

  /** Deletes several notices at once; `pin` isn't needed when this device is unlocked. */
  deleteNotices: (ids: number[], pin: string | null, token: string) =>
    request<{ deleted: number }>("/notices/delete", { method: "POST", body: JSON.stringify({ ids, pin }) }, token),

  /** Deleted notices that can still be restored (an Admin's: everyone's). */
  getBin: (token: string) => request<BinNotice[]>("/notices/bin", {}, token),

  /** Puts a deleted notice back; `pin` isn't needed when this device is unlocked. */
  restoreDeletedNotice: (id: number, pin: string | null, token: string) =>
    request<void>(pin ? `/notices/${id}/restore?pin=${encodeURIComponent(pin)}` : `/notices/${id}/restore`, { method: "POST" }, token),

  dismissNotice: (id: number, token: string) =>
    request<void>(`/notices/${id}/dismiss`, { method: "POST" }, token),

  restoreNotice: (id: number, token: string) =>
    request<void>(`/notices/${id}/dismiss`, { method: "DELETE" }, token),

  getCategories: (token: string) => request<Category[]>("/categories", {}, token),

  /** One page of users, optionally filtered by part of a Roll Number or name. */
  getUsers: (adminPin: string, token: string, query: { search?: string; page?: number; pageSize?: number } = {}) => {
    const params = new URLSearchParams();
    if (query.search) params.set("search", query.search);
    if (query.page) params.set("page", String(query.page));
    if (query.pageSize) params.set("pageSize", String(query.pageSize));
    const qs = params.toString();
    return request<PagedResult<UserListItem>>(`/users${qs ? `?${qs}` : ""}`, { headers: { "X-Admin-Pin": adminPin } }, token);
  },

  addUser: (data: { rollNumber: string; name: string; pin: string }, token: string) =>
    request<AddUserResult>(
      "/users",
      { method: "POST", body: JSON.stringify(data) },
      token
    ),

  updateUserRole: (id: number, role: UserRole, pin: string, token: string) =>
    request<UpdateUserRoleResult>(
      `/users/${id}/role`,
      { method: "PATCH", body: JSON.stringify({ role, pin }) },
      token
    ),

  updateUserName: (id: number, name: string, adminPin: string, token: string) =>
    request<UserListItem>(
      `/users/${id}/name`,
      { method: "PATCH", body: JSON.stringify({ name, pin: adminPin }) },
      token
    ),

  /** Sets (or, with null, clears) any user's logo. */
  updateUserLogo: (id: number, logoUrl: string | null, adminPin: string, token: string) =>
    request<UserListItem>(
      `/users/${id}/logo`,
      { method: "PUT", body: JSON.stringify({ logoUrl, pin: adminPin }) },
      token
    ),

  /** A publisher setting (or, with null, clearing) their own logo. Pin not needed on an unlocked device. */
  updateMyLogo: (logoUrl: string | null, token: string, pin?: string) =>
    request<{ logoUrl: string | null }>("/profile/logo", { method: "PUT", body: JSON.stringify({ logoUrl, pin }) }, token),

  resetUserPin: (id: number, adminPin: string, token: string) =>
    request<void>(`/users/${id}/reset-pin?adminPin=${encodeURIComponent(adminPin)}`, { method: "POST" }, token),

  revokeUserDevices: (id: number, adminPin: string, token: string) =>
    request<void>(`/users/${id}/devices`, { method: "DELETE", headers: { "X-Admin-Pin": adminPin } }, token),

  /** Unlocks this device with the PIN; the returned token stands in for the PIN afterwards. */
  unlockDevice: (pin: string, token: string, label?: string) =>
    request<UnlockDeviceResult>("/auth/unlock", { method: "POST", body: JSON.stringify({ pin, label }) }, token),

  getMyDevices: (token: string) => request<DeviceSession[]>("/auth/devices", {}, token),

  revokeMyDevice: (id: number, token: string) =>
    request<void>(`/auth/devices/${id}`, { method: "DELETE" }, token),

  /** The dashboard (extension) or the web app was opened: counted for the Admin's Analytics. */
  recordVisit: (token: string, source: "extension" | "app") =>
    request<void>(`/analytics/visit?source=${source}`, { method: "POST" }, token),

  /** From the page shown after the extension is removed: no sign-in, nothing identifying. */
  sendUninstallFeedback: (reason: string, comment: string, extensionVersion: string | null) =>
    request<void>("/feedback/uninstall", { method: "POST", body: JSON.stringify({ reason, comment, extensionVersion }) }),

  /** The Admin's Analytics over the last `days` days (7, 30 or 90). */
  getAnalyticsSummary: (adminPin: string, token: string, days = 30) =>
    request<AnalyticsSummary>(`/analytics/summary?days=${days}`, { headers: { "X-Admin-Pin": adminPin } }, token),
  getVapidPublicKey: (token: string) =>
    request<{ publicKey: string }>("/push/vapid-public-key", {}, token),

  subscribePush: (
    data: { endpoint: string; p256dh: string; auth: string },
    token: string
  ) => request<void>("/push/subscribe", { method: "POST", body: JSON.stringify(data) }, token),

  unsubscribePush: (endpoint: string, token: string) =>
    request<void>(
      "/push/unsubscribe",
      { method: "POST", body: JSON.stringify({ endpoint, p256dh: "", auth: "" }) },
      token
    ),

  getPushCategories: (endpoint: string, token: string) =>
    request<number[]>(`/push/categories?endpoint=${encodeURIComponent(endpoint)}`, {}, token),

  updatePushCategories: (endpoint: string, categoryIds: number[], token: string) =>
    request<void>(
      "/push/categories",
      { method: "PATCH", body: JSON.stringify({ endpoint, categoryIds }) },
      token
    ),
};

