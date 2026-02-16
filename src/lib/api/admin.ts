import apiClient from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminStats {
  totalUsers: number;
  newUsersLast30Days: number;
  kycPending: number;
  kycApproved: number;
  kycRejected: number;
  kycNotSubmitted: number;
  totalSessions: number;
}

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  kycStatus: string;
  walletAddress: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserListResponse {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UserDetail extends AdminUser {
  kycData?: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    city: string;
    state: string;
    country: string;
    documentType: string;
    submittedAt: string;
    reviewedAt?: string;
    reviewNotes?: string;
  } | null;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

export async function getAdminStats(): Promise<AdminStats> {
  const response = await apiClient.get<AdminStats>('/api/admin/stats');
  return response.data;
}

export async function getUsers(params: {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  kycStatus?: string;
}): Promise<UserListResponse> {
  const response = await apiClient.get<UserListResponse>('/api/admin/users', {
    params,
  });
  return response.data;
}

export async function getUserDetail(id: string): Promise<UserDetail> {
  const response = await apiClient.get<UserDetail>(`/api/admin/users/${id}`);
  return response.data;
}

export async function updateUserRole(id: string, role: string): Promise<void> {
  await apiClient.put(`/api/admin/users/${id}/role`, { role });
}

export async function getKYCSubmissions(params: {
  page?: number;
  status?: string;
}): Promise<UserListResponse> {
  const response = await apiClient.get<UserListResponse>(
    '/api/admin/kyc/submissions',
    { params },
  );
  return response.data;
}

export async function approveKYC(
  userId: string,
  notes?: string,
): Promise<void> {
  await apiClient.put(`/api/admin/kyc/${userId}/approve`, { notes });
}

export async function rejectKYC(
  userId: string,
  reason: string,
): Promise<void> {
  await apiClient.put(`/api/admin/kyc/${userId}/reject`, { reason });
}
