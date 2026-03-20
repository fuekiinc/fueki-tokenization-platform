export type MintApprovalStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'minted';

export interface MintApprovalStatusResponse {
  status: MintApprovalStatus;
  requestId: string | null;
  reviewNotes: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  canMint: boolean;
}

export interface SubmitMintApprovalResponse {
  success: boolean;
  reused: boolean;
  requestId: string;
  status: Exclude<MintApprovalStatus, 'none'>;
  reviewNotes: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface MintApprovalStatusQuery {
  tokenName: string;
  tokenSymbol: string;
  mintAmount: string;
  recipient: string;
  documentHash: string;
  chainId: number;
  requesterWalletAddress: string;
}

export interface SubmitMintApprovalPayload extends MintApprovalStatusQuery {
  documentType: string;
  originalValue: string;
  currency: string;
  file: File;
}

export interface MintApprovalRequestItem {
  id: string;
  chainId: number;
  tokenName: string;
  tokenSymbol: string;
  requesterWalletAddress: string | null;
  mintAmount: string;
  recipient: string;
  documentHash: string;
  documentType: string;
  originalValue: string;
  currency: string;
  fileName: string;
  status: Exclude<MintApprovalStatus, 'none'>;
  reviewNotes: string | null;
  approvedBy: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  canMint: boolean;
}

export interface ListMintApprovalRequestsQuery {
  chainId?: number;
  status?: Exclude<MintApprovalStatus, 'none'>;
  limit?: number;
  walletAddress: string;
}

export interface ListMintApprovalRequestsResponse {
  requests: MintApprovalRequestItem[];
}

export interface MarkMintApprovalMintedResponse {
  success: boolean;
  requestId: string;
  status: Exclude<MintApprovalStatus, 'none'>;
  reviewNotes: string | null;
  reviewedAt: string | null;
  canMint: boolean;
  alreadyMinted?: boolean;
}
