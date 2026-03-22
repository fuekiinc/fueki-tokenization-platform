import { QueryClient } from '@tanstack/react-query';
import type { RpcRefetchTopic } from './rpc/refetchEvents';

function normalizeAddress(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : fallback;
}

export const queryKeys = {
  balance: (address: string | null | undefined, chainId: number | null | undefined) =>
    ['balance', normalizeAddress(address, 'disconnected'), chainId ?? 'unknown'] as const,
  orderBook: (
    tokenSell: string | null | undefined,
    tokenBuy: string | null | undefined,
    chainId: number | null | undefined,
  ) => [
    'orderBook',
    normalizeAddress(tokenSell, 'none'),
    normalizeAddress(tokenBuy, 'none'),
    chainId ?? 'unknown',
  ] as const,
  userOrders: (address: string | null | undefined, chainId: number | null | undefined) =>
    ['userOrders', normalizeAddress(address, 'disconnected'), chainId ?? 'unknown'] as const,
  pendingTxs: (address: string | null | undefined, chainId: number | null | undefined) =>
    ['pendingTxs', normalizeAddress(address, 'disconnected'), chainId ?? 'unknown'] as const,
  poolStats: (
    tokenA: string | null | undefined,
    tokenB: string | null | undefined,
    chainId: number | null | undefined,
    userAddress?: string | null,
  ) => [
    'poolStats',
    normalizeAddress(tokenA, 'none'),
    normalizeAddress(tokenB, 'none'),
    chainId ?? 'unknown',
    normalizeAddress(userAddress, 'anonymous'),
  ] as const,
  priceHistory: (
    tokenSell: string | null | undefined,
    tokenBuy: string | null | undefined,
    chainId: number | null | undefined,
    interval: string,
  ) => [
    'priceHistory',
    normalizeAddress(tokenSell, 'none'),
    normalizeAddress(tokenBuy, 'none'),
    chainId ?? 'unknown',
    interval,
  ] as const,
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 300_000,
      refetchOnWindowFocus: true,
      retry: 2,
    },
  },
});

export function invalidateQueriesForTopics(topics: RpcRefetchTopic[]): void {
  for (const topic of new Set(topics)) {
    switch (topic) {
      case 'balances':
        void queryClient.invalidateQueries({ queryKey: ['balance'] });
        break;
      case 'orders':
        void queryClient.invalidateQueries({ queryKey: ['orderBook'] });
        void queryClient.invalidateQueries({ queryKey: ['userOrders'] });
        break;
      case 'pool':
        void queryClient.invalidateQueries({ queryKey: ['poolStats'] });
        break;
      case 'pending-transactions':
        void queryClient.invalidateQueries({ queryKey: ['pendingTxs'] });
        break;
      case 'market-data':
        void queryClient.invalidateQueries({ queryKey: ['priceHistory'] });
        break;
      case 'allowances':
      case 'history':
      case 'gas':
      default:
        break;
    }
  }
}
