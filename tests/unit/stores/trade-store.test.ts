/**
 * tradeStore tests.
 *
 * Verifies slippage clamping/persistence and pending transaction queue bounds.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useTradeStore } from '../../../src/store/tradeStore';

describe('useTradeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useTradeStore.setState({
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
});
