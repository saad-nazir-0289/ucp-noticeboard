import type { AddUserResult, AnalyticsSummary, AuthUser, Notice, UserListItem, UserRole } from "../types";

// Change this to your deployed backend URL in production.
const API_BASE_URL = "http://localhost:5000";

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
  // Identifies the student by the Roll Number already visible on the
  // (already-authenticated) portal page. This alone only ever grants
  // Student access. activationCode, if present (from a one-time link),
  // is what actually grants Publisher/Admin — see AuthController.
  login: (rollNumber: string, name: string, activationCode?: string) =>
    request<AuthUser>("/login", {
      method: "POST",
      body: JSON.stringify({ rollNumber, name, activationCode }),
    }),

  getNotices: (token: string) => request<Notice[]>("/notices", {}, token),

  getNotice: (id: number, token: string) =>
    request<Notice>(`/notices/${id}`, {}, token),

  createNotice: (
    data: { title: string; description: string; imageUrl: string },
    token: string
  ) =>
    request<Notice>(
      "/notices",
      { method: "POST", body: JSON.stringify(data) },
      token
    ),

  updateNotice: (
    id: number,
    data: { title: string; description: string; imageUrl: string },
    token: string
  ) =>
    request<Notice>(
      `/notices/${id}`,
      { method: "PUT", body: JSON.stringify(data) },
      token
    ),

  deleteNotice: (id: number, token: string) =>
    request<void>(`/notices/${id}`, { method: "DELETE" }, token),

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

  // Fire-and-forget: counted once per dashboard page load.
  recordVisit: (token: string) =>
    request<void>("/analytics/visit", { method: "POST" }, token),

  getAnalyticsSummary: (token: string) =>
    request<AnalyticsSummary>("/analytics/summary", {}, token),
};

export { ApiError };
