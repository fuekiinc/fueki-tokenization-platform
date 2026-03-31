export type NavAttestationStatus =
  | 'DRAFT'
  | 'PENDING_TX'
  | 'PUBLISHED'
  | 'SUPERSEDED'
  | 'DISPUTED';

export type NavTimeRange = '3M' | '6M' | '1Y' | 'ALL';

export interface NavAssetSnapshot {
  assetName: string;
  assetType: string;
  grossAssetValue: string;
  liabilities: string;
  netAssetValue: string;
  provenReservesOz: string | null;
  probableReservesOz: string | null;
  spotPricePerOz: string | null;
  productionRateTpd: string | null;
  notes: string | null;
}

export interface NavAttestation {
  id: string;
  tokenAddress: string;
  chainId: number;
  oracleAddress: string;
  navPerToken: string;
  totalNAV: string;
  totalTokenSupply: string;
  baseCurrency: string;
  effectiveDate: string;
  publishedAt: string | null;
  publisher: {
    address: string;
    name: string | null;
  };
  reportHash: string;
  reportURI: string;
  txHash: string | null;
  attestationIndex: number | null;
  status: NavAttestationStatus;
  assetBreakdown: NavAssetSnapshot[];
}

export interface CurrentNav extends NavAttestation {
  daysSinceLastUpdate: number | null;
  navChangeFromPrevious: {
    absolute: string;
    percentBps: number;
    direction: 'up' | 'down' | 'unchanged';
  } | null;
  stalenessWarningDays: number;
  stalenessCriticalDays: number;
}

export interface NavHistoryResponse {
  attestations: NavAttestation[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  summary: {
    firstAttestation: string | null;
    latestAttestation: string | null;
    highestNAV: string | null;
    lowestNAV: string | null;
    averageNAV: string | null;
    totalDividendsPaid: string | null;
  };
}

export interface NavHolderValue {
  holderAddress: string;
  tokenBalance: string;
  navPerToken: string;
  totalValue: string;
  baseCurrency: string;
  asOf: string;
  percentOfTotalSupply: string;
}

export interface NavOracleRegistration {
  tokenAddress: string;
  chainId: number;
  oracleAddress: string;
  baseCurrency: string;
  stalenessWarningDays: number;
  stalenessCriticalDays: number;
  minAttestationIntervalSeconds: number;
  maxNavChangeBps: number;
  createdAt: string;
  updatedAt: string;
}

export interface NavPublisher {
  walletAddress: string;
  name: string;
  licenseNumber: string | null;
  licenseType: string | null;
  contactEmail: string | null;
  isActive: boolean;
  onChainActive: boolean;
  addedAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

export interface NavPublisherListResponse {
  publishers: NavPublisher[];
}

export interface NavAssetBreakdownInput {
  assetName: string;
  assetType: string;
  grossAssetValue: string;
  liabilities: string;
  netAssetValue: string;
  provenReservesOz?: string;
  probableReservesOz?: string;
  spotPricePerOz?: string;
  productionRateTpd?: string;
  notes?: string;
}

export interface RegisterNavOracleInput {
  oracleAddress: string;
  baseCurrency?: string;
  stalenessWarningDays?: number;
  stalenessCriticalDays?: number;
  minAttestationIntervalSeconds?: number;
  maxNavChangeBps?: number;
}

export interface UpsertNavPublisherInput {
  walletAddress: string;
  name: string;
  licenseNumber?: string;
  licenseType?: string;
  contactEmail?: string;
}

export interface NavDraftInput {
  navPerToken: string;
  totalNAV: string;
  effectiveDate: string;
  reportHash: string;
  reportURI: string;
  publisherName?: string;
  assetBreakdown: NavAssetBreakdownInput[];
}

export interface FinalizeNavAttestationInput extends NavDraftInput {
  txHash: string;
  draftId?: string;
}
