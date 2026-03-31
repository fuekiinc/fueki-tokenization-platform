import { describe, expect, it } from 'vitest';
import { getTradeHistoryKey, mergeTradeHistoryEntries } from '../../src/lib/dashboardActivity';
import type { TradeHistory } from '../../src/types';

function buildTrade(
  id: string,
  overrides: Partial<TradeHistory> = {},
): TradeHistory {
  return {
    id,
    type: 'exchange',
    asset: 'Orbital USDC -> FUEKI',
    assetAddress: '0x0000000000000000000000000000000000000001',
    assetSymbol: 'FUEKI',
    amount: '25',
    txHash: '0xabc123',
    timestamp: 1_700_000_000_000,
    from: '0x00000000000000000000000000000000000000aa',
    to: '0x00000000000000000000000000000000000000bb',
    status: 'pending',
    ...overrides,
  };
}

describe('dashboardActivity', () => {
  it('deduplicates the same action across local and on-chain representations', () => {
    const localTrade = buildTrade('local-pending');
    const confirmedTrade = buildTrade('chain-confirmed', {
      status: 'confirmed',
      timestamp: 1_700_000_100_000,
    });

    const merged = mergeTradeHistoryEntries([localTrade], [confirmedTrade]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('chain-confirmed');
    expect(merged[0]?.status).toBe('confirmed');
  });

  it('uses tx hash, type, asset, and participants as the merge key', () => {
    const trade = buildTrade('trade-key');
    expect(getTradeHistoryKey(trade)).toBe(
      'exchange|0xabc123|0x0000000000000000000000000000000000000001|0x00000000000000000000000000000000000000aa|0x00000000000000000000000000000000000000bb',
    );
  });
});
