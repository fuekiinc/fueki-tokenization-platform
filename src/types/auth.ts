// ---------------------------------------------------------------------------
// Auth & KYC Types
// ---------------------------------------------------------------------------

export type KYCStatus = 'not_submitted' | 'pending' | 'approved' | 'rejected';
export type DocumentType = 'drivers_license' | 'passport';

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  walletAddress: string | null;
  kycStatus: KYCStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// --- Request / Response DTOs ------------------------------------------------

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface RegisterResponse {
  user: User;
  tokens: AuthTokens;
}

export interface KYCFormData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  ssn: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  documentType: DocumentType;
}

export interface KYCSubmitResponse {
  success: boolean;
  kycStatus: KYCStatus;
  message?: string;
}

export interface DocumentUploadResponse {
  documentId: string;
  fileName: string;
  uploadedAt: string;
}

export interface KYCStatusResponse {
  status: KYCStatus;
  message?: string;
  submittedAt?: string;
  reviewedAt?: string;
}

// --- Auth State -------------------------------------------------------------

export interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
}

// --- Validation Schemas (zod schema types will mirror these) ----------------

export interface LoginFormValues {
  email: string;
  password: string;
}

export interface RegisterFormValues {
  email: string;
  password: string;
  confirmPassword: string;
}

export interface KYCPersonalInfoValues {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}

export interface KYCAddressValues {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface KYCIdentityValues {
  ssn: string;
  documentType: DocumentType;
}

// --- API Error --------------------------------------------------------------

export interface ApiError {
  message: string;
  code?: string;
  field?: string;
  statusCode?: number;
}

export interface ApiErrorResponse {
  error: ApiError;
}
