/**
 * exchangeStore tests.
 *
 * Verifies quote caching freshness behavior and order upsert logic.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useExchangeStore } from '../../../src/store/exchangeStore';
import type { ExchangeOrder } from '../../../src/types';

function buildOrder(overrides: Partial<ExchangeOrder>): ExchangeOrder {
  return {
    id: '1',
    maker: '0xmaker',
    tokenSell: '0xTokenSell',
    tokenBuy: '0xTokenBuy',
    amountSell: '100',
    amountBuy: '95',
    remainingSell: '100',
    price: '0.95',
    status: 'open',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('useExchangeStore', () => {
  beforeEach(() => {
    useExchangeStore.setState({
      orders: [],
      userOrders: [],
      isLoadingOrders: false,
      ordersError: null,
      selectedPair: null,
      cachedQuote: null,
      pairTradeHistory: [],
    });
  });

  it('returns fresh quote only before TTL expiry', () => {
    const now = Date.now();
    useExchangeStore.getState().setCachedQuote({
      tokenIn: '0xA',
      tokenOut: '0xB',
      amountIn: '1',
      amountOut: '0.99',
      fetchedAt: now,
    });

    expect(useExchangeStore.getState().getFreshQuote()).not.toBeNull();

    useExchangeStore.getState().setCachedQuote({
      tokenIn: '0xA',
      tokenOut: '0xB',
      amountIn: '1',
      amountOut: '0.99',
      fetchedAt: now - 20_000,
    });

    expect(useExchangeStore.getState().getFreshQuote()).toBeNull();
  });

  it('upserts realtime order updates into global and user books', () => {
    const existing = buildOrder({ id: '42', remainingSell: '100' });
    useExchangeStore.setState({ orders: [existing], userOrders: [existing] });

    const updated = buildOrder({ id: '42', remainingSell: '40' });
    useExchangeStore.getState().handleOrderUpdate(updated, '0xmaker');

    expect(useExchangeStore.getState().orders[0]?.remainingSell).toBe('40');
    expect(useExchangeStore.getState().userOrders[0]?.remainingSell).toBe('40');

    const newOrder = buildOrder({ id: '43', maker: '0xanother' });
    useExchangeStore.getState().handleOrderUpdate(newOrder, '0xmaker');

    expect(useExchangeStore.getState().orders).toHaveLength(2);
    expect(useExchangeStore.getState().userOrders).toHaveLength(1);
  });
});
