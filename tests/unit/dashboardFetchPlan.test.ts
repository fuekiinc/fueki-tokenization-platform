import { describe, expect, it } from 'vitest';
import {
  getDashboardFetchPlan,
  getRecentRegistryScanBounds,
} from '../../src/lib/dashboardFetchPlan';

describe('dashboardFetchPlan', () => {
  it('uses a lightweight bootstrap plan for first paint', () => {
    const plan = getDashboardFetchPlan('bootstrap');

    expect(plan.enumerateWrappedAssets).toBe(false);
    expect(plan.enumerateSecurityTokens).toBe(false);
    expect(plan.includeTransferHistory).toBe(false);
    expect(plan.queryWindow.initialChunkSize).toBeLessThan(
      getDashboardFetchPlan('full').queryWindow.initialChunkSize,
    );
    expect(plan.queryWindow.maxRequests).toBeLessThan(
      getDashboardFetchPlan('full').queryWindow.maxRequests,
    );
  });

  it('keeps exhaustive backfill work in full mode only', () => {
    const plan = getDashboardFetchPlan('full');

    expect(plan.enumerateWrappedAssets).toBe(true);
    expect(plan.enumerateSecurityTokens).toBe(true);
    expect(plan.includeTransferHistory).toBe(true);
    expect(plan.maxWrappedAssetScan).toBe(500);
    expect(plan.maxSecurityTokenScan).toBe(500);
  });

  it('scans only the most recent registry window', () => {
    expect(getRecentRegistryScanBounds(100, 500)).toEqual({
      startIndex: 0,
      endIndexExclusive: 100,
    });

    expect(getRecentRegistryScanBounds(1_200, 500)).toEqual({
      startIndex: 700,
      endIndexExclusive: 1_200,
    });
  });
});
