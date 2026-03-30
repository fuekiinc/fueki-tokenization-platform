// ---------------------------------------------------------------------------
// Auth & KYC Types
// ---------------------------------------------------------------------------

export type KYCStatus = 'not_submitted' | 'pending' | 'approved' | 'rejected';
export type DocumentType = 'drivers_license' | 'passport' | 'national_id';
export type SubscriptionPlan =
  | 'monthly'
  | 'annual'
  | 'full_service'
  | 'contract_deployment_monthly'
  | 'contract_deployment_annual'
  | 'contract_deployment_white_glove';
export type HelpLevel = 'novice' | 'intermediate' | 'expert';

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  walletAddress: string | null;
  kycStatus: KYCStatus;
  helpLevel: HelpLevel;
  subscriptionPlan?: SubscriptionPlan | null;
  role?: string;
  accessRevoked?: boolean;
  accessRevokedAt?: string | null;
  accessRevocationReason?: string | null;
  demoUsed?: boolean;
  demoActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
}

// --- Request / Response DTOs ------------------------------------------------

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

export interface RegisterRequest {
  email: string;
  password: string;
  helpLevel?: HelpLevel;
}

export interface RegisterResponse {
  user: User;
  tokens: AuthTokens;
}

export interface UpdatePreferencesRequest {
  helpLevel: HelpLevel;
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
  documentPath: string;
  documentOrigName: string;
  documentMimeType?: string;
  documentBackPath?: string;
  documentBackOrigName?: string;
  documentBackMimeType?: string;
  liveVideoPath: string;
  liveVideoOrigName: string;
  liveVideoMimeType?: string;
  subscriptionPlan: SubscriptionPlan;
}

export interface KYCSubmitResponse {
  success: boolean;
  kycStatus: KYCStatus;
  message?: string;
}

export interface DocumentUploadResponse {
  documentFront: UploadedKycMedia;
  documentBack?: UploadedKycMedia;
  liveVideo: UploadedKycMedia;
}

export interface UploadedKycMedia {
  documentId: string;
  fileName: string;
  mimeType: string;
  uploadedAt: string;
}

export interface KYCUploadPayload {
  documentType: DocumentType;
  documentFront: File;
  documentBack?: File;
  liveVideo: File;
}

export interface KYCIdentityCaptureState {
  documentFrontFile: File | null;
  documentFrontPreview: string | null;
  documentBackFile: File | null;
  documentBackPreview: string | null;
  liveVideoFile: File | null;
  liveVideoPreview: string | null;
}

export interface KYCStatusResponse {
  status: KYCStatus;
  message?: string;
  submittedAt?: string;
  reviewedAt?: string;
}

// --- Refresh Token Response -------------------------------------------------
// The backend POST /api/auth/refresh returns { accessToken } in the body.
// The refresh token itself is managed via httpOnly cookie.

export interface RefreshTokenResponse {
  accessToken: string;
}

// --- Auth State -------------------------------------------------------------

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
}

// --- Validation Schemas (zod schema types will mirror these) ----------------

export interface LoginFormValues {
  email: string;
  password: string;
  rememberMe: boolean;
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
