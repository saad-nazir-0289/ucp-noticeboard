import type { AddUserResult, AnalyticsSummary, AuthUser, Category, DeviceSession, LoginResult, Notice, PagedResult, UnlockDeviceResult, UpdateUserRoleResult, UserListItem, UserRole } from "../types";

// Set per build mode (production / staging / local) in each app's Vite config.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
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
  token?: string
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

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (deviceToken && response.headers.get("X-Device-Token-Status") === "invalid") {
    deviceToken = null;
    onDeviceTokenInvalid?.();
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ApiError(response.status, text || `Request failed (${response.status})`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  login: (rollNumber: string, name: string, activationCode?: string) =>
    request<LoginResult>("/login", {
      method: "POST",
      body: JSON.stringify({ rollNumber, name, activationCode }),
    }),

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

  dismissNotice: (id: number, token: string) =>
    request<void>(`/notices/${id}/dismiss`, { method: "POST" }, token),

  restoreNotice: (id: number, token: string) =>
    request<void>(`/notices/${id}/dismiss`, { method: "DELETE" }, token),

  likeNotice: (id: number, token: string) =>
    request<void>(`/notices/${id}/like`, { method: "POST" }, token),

  unlikeNotice: (id: number, token: string) =>
    request<void>(`/notices/${id}/like`, { method: "DELETE" }, token),

  getCategories: (token: string) => request<Category[]>("/categories", {}, token),

  createCategory: (name: string, adminPin: string, token: string) =>
    request<Category>(
      "/categories",
      { method: "POST", body: JSON.stringify({ name, pin: adminPin }) },
      token
    ),

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

  recordVisit: (token: string) =>
    request<void>("/analytics/visit", { method: "POST" }, token),

  getAnalyticsSummary: (adminPin: string, token: string) =>
    request<AnalyticsSummary>("/analytics/summary", { headers: { "X-Admin-Pin": adminPin } }, token),
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

export { ApiError };
