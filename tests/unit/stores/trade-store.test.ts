/**
 * tradeStore tests.
 *
 * Verifies slippage clamping, pending transaction queue bounds, and
 * wallet/network-scoped trade history persistence.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useTradeStore } from '../../../src/store/tradeStore';
import type { TradeHistory } from '../../../src/types';

function buildTrade(id: string, overrides: Partial<TradeHistory> = {}): TradeHistory {
  return {
    id,
    type: 'exchange',
    asset: '0xasset',
    assetSymbol: 'AST',
    amount: '1',
    txHash: `0x${id}`,
    timestamp: Date.now(),
    from: '0xfrom',
    to: '0xto',
    status: 'confirmed',
    ...overrides,
  };
}

describe('useTradeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useTradeStore.setState({
      activeScopeKey: null,
      tradeHistory: [],
      isLoadingTrades: false,
      tradesError: null,
      slippageBps: 50,
      pendingTransactions: [],
    });
  });

  it('clamps slippage between 1 and 5000 bps', () => {
    useTradeStore.getState().setSlippage(-500);
    expect(useTradeStore.getState().slippageBps).toBe(1);

    useTradeStore.getState().setSlippage(5_555);
    expect(useTradeStore.getState().slippageBps).toBe(5_000);

    useTradeStore.getState().setSlippage(123);
    expect(useTradeStore.getState().slippageBps).toBe(123);
    expect(useTradeStore.getState().getSlippageDecimal()).toBeCloseTo(0.0123);
  });

  it('caps pending transaction list at 20 entries', () => {
    for (let i = 0; i < 25; i++) {
      useTradeStore.getState().addPendingTx({
        txHash: `0x${i}`,
        description: `tx-${i}`,
        type: 'exchange',
        asset: '0xasset',
        assetSymbol: 'AST',
        amount: '1',
        submittedAt: Date.now(),
      });
    }

    const pending = useTradeStore.getState().pendingTransactions;
    expect(pending).toHaveLength(20);
    expect(pending[0]?.txHash).toBe('0x24');
    expect(pending[19]?.txHash).toBe('0x5');
  });

  it('keeps trade history isolated per wallet and chain scope', () => {
    const store = useTradeStore.getState();

    store.setScope('0xAaa', 1);
    store.addTrade(buildTrade('mainnet-a'));
    expect(useTradeStore.getState().tradeHistory.map((trade) => trade.id)).toEqual(['mainnet-a']);

    store.setScope('0xBbb', 1);
    expect(useTradeStore.getState().tradeHistory).toEqual([]);
    store.addTrade(buildTrade('mainnet-b'));

    store.setScope('0xAaa', 42161);
    expect(useTradeStore.getState().tradeHistory).toEqual([]);
    store.addTrade(buildTrade('arbitrum-a'));

    store.setScope('0xAaa', 1);
    expect(useTradeStore.getState().tradeHistory.map((trade) => trade.id)).toEqual(['mainnet-a']);

    store.setScope('0xBbb', 1);
    expect(useTradeStore.getState().tradeHistory.map((trade) => trade.id)).toEqual(['mainnet-b']);

    store.setScope('0xAaa', 42161);
    expect(useTradeStore.getState().tradeHistory.map((trade) => trade.id)).toEqual(['arbitrum-a']);
  });

  it('clears only the visible trade list without deleting scoped persistence', () => {
    const store = useTradeStore.getState();

    store.setScope('0xAaa', 1);
    store.addTrade(buildTrade('persisted-trade'));
    expect(useTradeStore.getState().tradeHistory).toHaveLength(1);

    store.clearVisibleTrades();
    expect(useTradeStore.getState().tradeHistory).toEqual([]);

    store.setScope(null, null);
    store.setScope('0xAaa', 1);
    expect(useTradeStore.getState().tradeHistory.map((trade) => trade.id)).toEqual([
      'persisted-trade',
    ]);
  });
});
