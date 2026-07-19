export type UserRole = "Student" | "Publisher" | "Admin";

export interface AuthUser {
  id: number;
  name: string;
  rollNumber: string;
  role: UserRole;
  token: string;
}

export interface Notice {
  id: number;
  title: string;
  description: string;
  imageUrl: string | null;
  createdByUserId: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
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
