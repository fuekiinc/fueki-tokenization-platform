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
  AuthTokens,
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

export async function logout(): Promise<void> {
  await apiClient.post('/api/auth/logout');
}

export async function getProfile(): Promise<User> {
  const response = await apiClient.get<User>('/api/auth/me');
  return response.data;
}

export async function refreshToken(token: string): Promise<AuthTokens> {
  const response = await apiClient.post<AuthTokens>('/api/auth/refresh', {
    refreshToken: token,
  });
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
