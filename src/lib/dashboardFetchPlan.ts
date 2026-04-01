export type DashboardFetchMode = 'bootstrap' | 'incremental' | 'full';

export interface DashboardFetchPlan {
  enumerateWrappedAssets: boolean;
  enumerateSecurityTokens: boolean;
  includeTransferHistory: boolean;
  maxWrappedAssetScan: number;
  maxSecurityTokenScan: number;
  historyLookbackBlocks: {
    mint: number;
    exchange: number;
    orbital: number;
  };
  queryWindow: {
    initialChunkSize: number;
    maxRequests: number;
    maxEvents: number;
  };
}

const FETCH_PLANS: Record<DashboardFetchMode, DashboardFetchPlan> = {
  bootstrap: {
    enumerateWrappedAssets: false,
    enumerateSecurityTokens: false,
    includeTransferHistory: false,
    maxWrappedAssetScan: 0,
    maxSecurityTokenScan: 0,
    historyLookbackBlocks: {
      mint: 250_000,
      exchange: 150_000,
      orbital: 150_000,
    },
    queryWindow: {
      initialChunkSize: 50_000,
      maxRequests: 6,
      maxEvents: 120,
    },
  },
  incremental: {
    enumerateWrappedAssets: false,
    enumerateSecurityTokens: false,
    includeTransferHistory: false,
    maxWrappedAssetScan: 0,
    maxSecurityTokenScan: 0,
    historyLookbackBlocks: {
      mint: 500_000,
      exchange: 250_000,
      orbital: 250_000,
    },
    queryWindow: {
      initialChunkSize: 75_000,
      maxRequests: 8,
      maxEvents: 160,
    },
  },
  full: {
    enumerateWrappedAssets: true,
    enumerateSecurityTokens: true,
    includeTransferHistory: true,
    maxWrappedAssetScan: 500,
    maxSecurityTokenScan: 500,
    historyLookbackBlocks: {
      mint: 5_000_000,
      exchange: 2_000_000,
      orbital: 2_000_000,
    },
    queryWindow: {
      initialChunkSize: 250_000,
      maxRequests: 24,
      maxEvents: 500,
    },
  },
};

export function getDashboardFetchPlan(mode: DashboardFetchMode): DashboardFetchPlan {
  return FETCH_PLANS[mode];
}

export function getRecentRegistryScanBounds(
  totalCount: number,
  maxScan: number,
): { startIndex: number; endIndexExclusive: number } {
  const safeCount = Math.max(0, Math.floor(totalCount));
  const safeMaxScan = Math.max(0, Math.floor(maxScan));
  const startIndex = Math.max(0, safeCount - safeMaxScan);
  return {
    startIndex,
    endIndexExclusive: safeCount,
  };
}
