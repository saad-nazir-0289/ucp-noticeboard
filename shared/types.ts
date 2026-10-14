export type UserRole = "Student" | "Publisher" | "Admin";

export interface AuthUser {
  id: number;
  name: string;
  rollNumber: string;
  role: UserRole;
  token: string;
}

// What /login actually returns — AuthUser plus the first page load's data
// bundled in, so the extension doesn't need a second round trip just to
// show something on screen.
export interface LoginResult extends AuthUser {
  notices: Notice[];
  categories: Category[];
}

export interface Notice {
  id: number;
  title: string;
  description: string;
  imageUrl: string | null;
  linkUrl: string | null;
  categoryId: number | null;
  categoryName: string | null;
  deadline: string | null;
  createdByUserId: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  /** Only ever sent to the Admin; null for everyone else. */
  viewCount: number | null;
  /** Pinned by the Admin: shown above everything else. */
  isPinned: boolean;
}

export interface Category {
  id: number;
  name: string;
}

export interface AnalyticsSummary {
  totalUsers: number;
  totalStudents: number;
  totalPublishers: number;
  totalAdmins: number;
  totalViews: number;
  activeLast7Days: number;
}

export interface UserListItem {
  id: number;
  name: string;
  rollNumber: string;
  role: UserRole;
  createdAt: string;
  /** Locked after too many wrong PINs (Admin user list only). */
  pinLocked?: boolean;
  /** Devices this user has unlocked with their PIN (Admin user list only). */
  activeDevices?: number;
}

/** One page of a longer list, with the total for paging. */
export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UnlockDeviceResult {
  deviceToken: string;
  deviceId: number;
  expiresAt: string;
}

export interface DeviceSession {
  id: number;
  label: string;
  createdAt: string;
  lastUsedAt: string;
  isCurrent: boolean;
}

// Adding a Publisher grants the role immediately now — no activation
// link to relay. Role visibility works from Roll Number alone; the PIN
// (set the first time they publish something) is the actual gate on
// doing anything, not this.
export interface AddUserResult {
  id: number;
  name: string;
  rollNumber: string;
  role: UserRole;
}

export interface UpdateUserRoleResult {
  id: number;
  name: string;
  rollNumber: string;
  role: UserRole;
  createdAt: string;
}
