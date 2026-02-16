import apiClient from './client';
import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  KYCFormData,
  KYCSubmitResponse,
  DocumentUploadResponse,
  KYCStatusResponse,
  User,
  RefreshTokenResponse,
} from '../../types/auth';

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/api/auth/login', data);
  return response.data;
}

export async function register(data: RegisterRequest): Promise<RegisterResponse> {
  const response = await apiClient.post<RegisterResponse>('/api/auth/register', data);
  return response.data;
}

/**
 * Logs the user out. The refresh token is sent automatically via the httpOnly
 * cookie (withCredentials: true on the axios client), so the backend can
 * invalidate the session server-side.
 */
export async function logout(): Promise<void> {
  await apiClient.post('/api/auth/logout', {});
}

export async function getProfile(): Promise<User> {
  const response = await apiClient.get<User>('/api/auth/me');
  return response.data;
}

/**
 * Refreshes the auth session. The refresh token is sent automatically via
 * the httpOnly cookie (withCredentials: true). The backend returns a new
 * { accessToken } in the response body and rotates the cookie.
 */
export async function refreshToken(): Promise<RefreshTokenResponse> {
  const response = await apiClient.post<RefreshTokenResponse>('/api/auth/refresh', {});
  return response.data;
}

// ---------------------------------------------------------------------------
// KYC
// ---------------------------------------------------------------------------

export async function submitKYC(data: KYCFormData): Promise<KYCSubmitResponse> {
  const response = await apiClient.post<KYCSubmitResponse>('/api/kyc/submit', data);
  return response.data;
}

export async function uploadDocument(
  file: File,
  documentType: string,
): Promise<DocumentUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('documentType', documentType);

  const response = await apiClient.post<DocumentUploadResponse>(
    '/api/kyc/upload-document',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    },
  );
  return response.data;
}

export async function getKYCStatus(): Promise<KYCStatusResponse> {
  const response = await apiClient.get<KYCStatusResponse>('/api/kyc/status');
  return response.data;
}

// ---------------------------------------------------------------------------
// Password Reset
// ---------------------------------------------------------------------------

export async function forgotPassword(
  email: string,
): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.post<{ success: boolean; message: string }>(
    '/api/auth/forgot-password',
    { email },
  );
  return response.data;
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<{ success: boolean }> {
  const response = await apiClient.post<{ success: boolean }>(
    '/api/auth/reset-password',
    { token, newPassword },
  );
  return response.data;
}
