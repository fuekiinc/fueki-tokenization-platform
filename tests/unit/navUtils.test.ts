import { describe, expect, it } from 'vitest';
import {
  calculateQuotedNavAmount,
  computePremiumDiscount,
  filterNavAttestationsByRange,
  toNavChartPoints,
} from '../../src/lib/navUtils';
import type { NavAttestation } from '../../src/types/nav';

function buildAttestation(overrides: Partial<NavAttestation>): NavAttestation {
  return {
    id: 'attestation-1',
    tokenAddress: '0x0000000000000000000000000000000000000001',
    chainId: 421614,
    oracleAddress: '0x0000000000000000000000000000000000000002',
    navPerToken: '5.000000',
    totalNAV: '5000000.000000',
    totalTokenSupply: '1000000',
    baseCurrency: 'USD',
    effectiveDate: '2026-03-01T00:00:00.000Z',
    publishedAt: '2026-03-02T00:00:00.000Z',
    publisher: {
      address: '0x0000000000000000000000000000000000000003',
      name: 'Appraiser LLC',
    },
    reportHash: '0x' + 'ab'.repeat(32),
    reportURI: 'ipfs://report',
    txHash: '0x' + 'cd'.repeat(32),
    attestationIndex: 0,
    status: 'PUBLISHED',
    assetBreakdown: [],
    ...overrides,
  };
}

describe('navUtils', () => {
  it('filters attestations by time range', () => {
    const attestations = [
      buildAttestation({ id: 'old', effectiveDate: '2025-01-15T00:00:00.000Z' }),
      buildAttestation({ id: 'mid', effectiveDate: '2026-01-05T00:00:00.000Z' }),
      buildAttestation({ id: 'recent', effectiveDate: '2026-02-20T00:00:00.000Z' }),
    ];

    const filtered = filterNavAttestationsByRange(
      attestations,
      '3M',
      new Date('2026-03-30T00:00:00.000Z'),
    );

    expect(filtered.map((attestation) => attestation.id)).toEqual(['mid', 'recent']);
  });

  it('sorts chart points oldest to newest', () => {
    const chartPoints = toNavChartPoints([
      buildAttestation({ id: 'new', effectiveDate: '2026-03-10T00:00:00.000Z', navPerToken: '5.250000' }),
      buildAttestation({ id: 'old', effectiveDate: '2026-01-10T00:00:00.000Z', navPerToken: '4.750000' }),
    ]);

    expect(chartPoints).toHaveLength(2);
    expect(chartPoints[0]?.navPerToken).toBe(4.75);
    expect(chartPoints[1]?.navPerToken).toBe(5.25);
  });

  it('computes premium, discount, and at-nav states', () => {
    expect(computePremiumDiscount('5.00', '5.50')).toEqual({
      direction: 'premium',
      percent: 10,
    });

    expect(computePremiumDiscount('5.00', '4.50')).toEqual({
      direction: 'discount',
      percent: -10,
    });

    expect(computePremiumDiscount('5.00', '5.0001')).toEqual({
      direction: 'at-nav',
      percent: 0,
    });
  });

  it('calculates quote amount from token amount and nav', () => {
    expect(calculateQuotedNavAmount('25000', '5.00')).toBe('125000.00');
    expect(calculateQuotedNavAmount('0', '5.00')).toBe('');
  });
});
