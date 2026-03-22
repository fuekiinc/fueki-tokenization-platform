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
    ssn?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city: string;
    state: string;
    zipCode?: string | null;
    country: string;
    documentType: string;
    documentOrigName?: string | null;
    documentBackOrigName?: string | null;
    liveVideoOrigName?: string | null;
    submittedAt: string;
    reviewedAt?: string | null;
    reviewNotes?: string | null;
  } | null;
}

export type AdminKycDocumentKind = 'front' | 'back' | 'liveVideo';

interface AdminUserDetailResponse {
  user: AdminUser;
  kyc: UserDetail['kycData'];
}

interface AdminKycSubmissionResponse {
  submissions: Array<{
    userId: string;
    email: string;
    kycStatus: string;
    userCreatedAt: string;
    submittedAt: string | null;
    reviewedAt: string | null;
  }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeAdminUser(value: unknown): AdminUser | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = value.id;
  const email = value.email;
  const role = value.role;
  const kycStatus = value.kycStatus;
  const walletAddress = value.walletAddress;
  const createdAt = value.createdAt;
  const updatedAt = value.updatedAt;

  if (
    typeof id !== 'string' ||
    typeof email !== 'string' ||
    typeof role !== 'string' ||
    typeof kycStatus !== 'string' ||
    typeof createdAt !== 'string' ||
    typeof updatedAt !== 'string'
  ) {
    return null;
  }

  return {
    id,
    email,
    role,
    kycStatus,
    walletAddress: typeof walletAddress === 'string' ? walletAddress : null,
    createdAt,
    updatedAt,
  };
}

function normalizeUserListResponse(
  value: unknown,
  fallback: {
    page: number;
    limit: number;
  },
): UserListResponse {
  const payload: Record<string, unknown> = isRecord(value) ? value : {};
  const users = Array.isArray(payload['users'])
    ? payload['users']
        .map((user) => normalizeAdminUser(user))
        .filter((user): user is AdminUser => user !== null)
    : [];

  return {
    users,
    total: isFiniteNumber(payload['total']) ? payload['total'] : users.length,
    page: isFiniteNumber(payload['page']) ? payload['page'] : fallback.page,
    limit: isFiniteNumber(payload['limit']) ? payload['limit'] : fallback.limit,
    totalPages: isFiniteNumber(payload['totalPages']) ? payload['totalPages'] : 1,
  };
}

function normalizeKycDetail(value: unknown): UserDetail['kycData'] {
  if (!isRecord(value)) {
    return null;
  }

  const firstName = value.firstName;
  const lastName = value.lastName;
  const dateOfBirth = value.dateOfBirth;
  const city = value.city;
  const state = value.state;
  const country = value.country;
  const documentType = value.documentType;
  const submittedAt = value.submittedAt;

  if (
    typeof firstName !== 'string'
    || typeof lastName !== 'string'
    || typeof dateOfBirth !== 'string'
    || typeof city !== 'string'
    || typeof state !== 'string'
    || typeof country !== 'string'
    || typeof documentType !== 'string'
    || typeof submittedAt !== 'string'
  ) {
    return null;
  }

  return {
    firstName,
    lastName,
    dateOfBirth,
    ssn: typeof value.ssn === 'string' ? value.ssn : null,
    addressLine1: typeof value.addressLine1 === 'string' ? value.addressLine1 : null,
    addressLine2: typeof value.addressLine2 === 'string' ? value.addressLine2 : null,
    city,
    state,
    zipCode: typeof value.zipCode === 'string' ? value.zipCode : null,
    country,
    documentType,
    documentOrigName:
      typeof value.documentOrigName === 'string' ? value.documentOrigName : null,
    documentBackOrigName:
      typeof value.documentBackOrigName === 'string'
        ? value.documentBackOrigName
        : null,
    liveVideoOrigName:
      typeof value.liveVideoOrigName === 'string' ? value.liveVideoOrigName : null,
    submittedAt,
    reviewedAt: typeof value.reviewedAt === 'string' ? value.reviewedAt : null,
    reviewNotes: typeof value.reviewNotes === 'string' ? value.reviewNotes : null,
  };
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
  return normalizeUserListResponse(response.data, {
    page: params.page ?? 1,
    limit: params.limit ?? 20,
  });
}

export async function getUserDetail(id: string): Promise<UserDetail> {
  const response = await apiClient.get<AdminUserDetailResponse>(
    `/api/admin/users/${id}`,
  );
  const user = normalizeAdminUser(response.data.user);

  if (!user) {
    throw new Error('Admin user detail response is malformed');
  }

  return {
    ...user,
    kycData: normalizeKycDetail(response.data.kyc),
  };
}

export async function getUserKycDocument(
  userId: string,
  documentKind: AdminKycDocumentKind,
): Promise<Blob> {
  const response = await apiClient.get<Blob>(
    `/api/admin/users/${userId}/kyc-documents/${documentKind}`,
    { responseType: 'blob' },
  );
  return response.data;
}

export async function updateUserRole(id: string, role: string): Promise<void> {
  await apiClient.put(`/api/admin/users/${id}/role`, { role });
}

export async function getKYCSubmissions(params: {
  page?: number;
  status?: string;
}): Promise<UserListResponse> {
  const response = await apiClient.get<AdminKycSubmissionResponse>(
    '/api/admin/kyc/submissions',
    { params },
  );
  const payload: Record<string, unknown> = isRecord(response.data) ? response.data : {};
  const submissions = Array.isArray(payload['submissions'])
    ? payload['submissions']
    : [];
  const users = submissions
    .map((submission: unknown): AdminUser | null => {
      if (!isRecord(submission)) {
        return null;
      }

      const userId = submission.userId;
      const email = submission.email;
      const kycStatus = submission.kycStatus;
      const userCreatedAt = submission.userCreatedAt;
      const submittedAt = submission.submittedAt;
      const reviewedAt = submission.reviewedAt;

      if (
        typeof userId !== 'string' ||
        typeof email !== 'string' ||
        typeof kycStatus !== 'string' ||
        typeof userCreatedAt !== 'string'
      ) {
        return null;
      }

      return {
        id: userId,
        email,
        role: 'user',
        kycStatus,
        walletAddress: null,
        createdAt: typeof submittedAt === 'string' ? submittedAt : userCreatedAt,
        updatedAt:
          typeof reviewedAt === 'string'
            ? reviewedAt
            : typeof submittedAt === 'string'
              ? submittedAt
              : userCreatedAt,
      };
    })
    .filter((submission): submission is AdminUser => submission !== null);

  return normalizeUserListResponse(
    {
      users,
      total: payload['total'],
      page: payload['page'],
      limit: payload['limit'],
      totalPages: payload['totalPages'],
    },
    {
      page: params.page ?? 1,
      limit: 20,
    },
  );
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
