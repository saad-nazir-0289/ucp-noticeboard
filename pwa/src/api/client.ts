import type { AddUserResult, AnalyticsSummary, AuthUser, Category, LoginResult, Notice, UserListItem, UserRole } from "../types";

// Change this to your deployed backend URL in production.
export const API_BASE_URL = "https://ucp-noticeboard-api-production.up.railway.app";

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

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
    },
    token: string
  ) =>
    request<Notice>(
      `/notices/${id}`,
      { method: "PUT", body: JSON.stringify(data) },
      token
    ),

  deleteNotice: (id: number, token: string) =>
    request<void>(`/notices/${id}`, { method: "DELETE" }, token),

  dismissNotice: (id: number, token: string) =>
    request<void>(`/notices/${id}/dismiss`, { method: "POST" }, token),

  restoreNotice: (id: number, token: string) =>
    request<void>(`/notices/${id}/dismiss`, { method: "DELETE" }, token),

  getCategories: (token: string) => request<Category[]>("/categories", {}, token),

  createCategory: (name: string, token: string) =>
    request<Category>(
      "/categories",
      { method: "POST", body: JSON.stringify({ name }) },
      token
    ),

  getUsers: (token: string) => request<UserListItem[]>("/users", {}, token),

  addUser: (data: { rollNumber: string; name: string }, token: string) =>
    request<AddUserResult>(
      "/users",
      { method: "POST", body: JSON.stringify(data) },
      token
    ),

  updateUserRole: (id: number, role: UserRole, token: string) =>
    request<UserListItem>(
      `/users/${id}/role`,
      { method: "PATCH", body: JSON.stringify({ role }) },
      token
    ),

  recordVisit: (token: string) =>
    request<void>("/analytics/visit", { method: "POST" }, token),

  getAnalyticsSummary: (token: string) =>
    request<AnalyticsSummary>("/analytics/summary", {}, token),

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
};

export { ApiError };
