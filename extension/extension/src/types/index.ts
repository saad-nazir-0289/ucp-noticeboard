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
  viewCount: number;
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
