export type SecurityTokenApprovalStatus =
  | 'none'
  | 'pending'
  | 'approved'
  | 'rejected';

export interface SecurityTokenApprovalStatusResponse {
  status: SecurityTokenApprovalStatus;
  requestId: string | null;
  reviewNotes: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  canDeploy: boolean;
}

export interface SubmitSecurityTokenApprovalResponse {
  success: boolean;
  reused: boolean;
  requestId: string;
  status: Exclude<SecurityTokenApprovalStatus, 'none'>;
  reviewNotes: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface SecurityTokenApprovalStatusQuery {
  tokenName: string;
  tokenSymbol: string;
  decimals: number;
  totalSupply: string;
  maxTotalSupply: string;
  minTimelockAmount: string;
  maxReleaseDelayDays: number;
  originalValue: string;
  documentHash: string;
  documentType: string;
  chainId: number;
  requesterWalletAddress: string;
}

export interface SubmitSecurityTokenApprovalPayload
  extends SecurityTokenApprovalStatusQuery {
  hashSource: 'file' | 'manual';
  file?: File | null;
}

export interface SecurityTokenApprovalRequestItem {
  id: string;
  chainId: number;
  tokenName: string;
  tokenSymbol: string;
  decimals: number;
  requesterWalletAddress: string | null;
  totalSupply: string;
  maxTotalSupply: string;
  minTimelockAmount: string;
  maxReleaseDelayDays: number;
  originalValue: string;
  documentHash: string;
  documentType: string;
  hashSource: 'file' | 'manual';
  fileName: string | null;
  status: Exclude<SecurityTokenApprovalStatus, 'none'>;
  reviewNotes: string | null;
  approvedBy: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  canDeploy: boolean;
}

export interface ListSecurityTokenApprovalRequestsQuery {
  chainId?: number;
  status?: Exclude<SecurityTokenApprovalStatus, 'none'>;
  limit?: number;
  walletAddress: string;
}

export interface ListSecurityTokenApprovalRequestsResponse {
  requests: SecurityTokenApprovalRequestItem[];
}
