import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  contractFactory: vi.fn(),
  formatUnits: vi.fn((raw: bigint) => (Number(raw) / 1e18).toString()),
  getCached: vi.fn(),
  getNetworkConfig: vi.fn(),
  getReadOnlyProvider: vi.fn(),
  queryRecentLogsBestEffort: vi.fn(),
  setCache: vi.fn(),
}));

vi.mock('ethers', () => ({
  ethers: {
    Contract: function Contract(...args: unknown[]) {
      return mocks.contractFactory(...args);
    },
    formatUnits: (...args: [bigint, number]) => mocks.formatUnits(...args),
  },
}));

vi.mock('../../src/contracts/addresses', () => ({
  getNetworkConfig: (...args: unknown[]) => mocks.getNetworkConfig(...args),
}));

vi.mock('../../src/lib/blockchain/rpcCache', () => ({
  TTL_BALANCE: 15_000,
  getCached: (...args: unknown[]) => mocks.getCached(...args),
  makeChainCacheKey: (chainId: number, suffix: string) => `${chainId}:${suffix}`,
  setCache: (...args: unknown[]) => mocks.setCache(...args),
}));

vi.mock('../../src/lib/blockchain/contracts', () => ({
  getReadOnlyProvider: (...args: unknown[]) => mocks.getReadOnlyProvider(...args),
}));

vi.mock('../../src/lib/blockchain/logQuery', () => ({
  queryRecentLogsBestEffort: (...args: unknown[]) => mocks.queryRecentLogsBestEffort(...args),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

test('fetchPairTradePoints returns cached trades without hitting RPC', async () => {
  const cachedTrades = [
    {
      id: 'cached:1',
      timestampMs: 1_700_000_000_000,
      price: 1.25,
      volume: 42,
      source: 'amm' as const,
    },
  ];

  mocks.getCached.mockReturnValue(cachedTrades);

  const { fetchPairTradePoints } = await import('../../src/lib/blockchain/marketData');
  const result = await fetchPairTradePoints(421614, '0xTokenA', '0xTokenB');

  assert.deepEqual(result, cachedTrades);
  assert.equal(mocks.queryRecentLogsBestEffort.mock.calls.length, 0);
  assert.equal(mocks.setCache.mock.calls.length, 0);
});

test('fetchPairTradePoints merges AMM and orderbook activity and caches the sorted result', async () => {
  const provider = {
    getBlock: vi.fn(async (blockNumber: number) => ({ timestamp: blockNumber * 10 })),
  };

  mocks.getCached.mockReturnValue(null);
  mocks.getNetworkConfig.mockReturnValue({
    ammAddress: '0xamm',
    assetBackedExchangeAddress: '0xexchange',
  });
  mocks.getReadOnlyProvider.mockReturnValue(provider);

  const exchangeContract = {
    getOrder: vi.fn(async () => ({
      tokenSell: '0xTokenA',
      tokenBuy: '0xTokenB',
    })),
  };

  mocks.contractFactory.mockImplementation((address: string) => {
    if (address === '0xexchange') {
      return exchangeContract;
    }
    return {};
  });

  mocks.queryRecentLogsBestEffort
    .mockResolvedValueOnce([
      {
        transactionHash: '0xammTx',
        index: 7,
        blockNumber: 100,
        args: [
          '0xpool',
          '0xsender',
          '0xTokenA',
          '0xTokenB',
          2000000000000000000n,
          1000000000000000000n,
        ],
      },
    ])
    .mockResolvedValueOnce([
      {
        transactionHash: '0xorderTx',
        index: 3,
        blockNumber: 101,
        args: [
          1n,
          '0xtaker',
          5000000000000000000n,
          2500000000000000000n,
        ],
      },
    ]);

  const { fetchPairTradePoints } = await import('../../src/lib/blockchain/marketData');
  const result = await fetchPairTradePoints(421614, '0xTokenA', '0xTokenB');

  assert.equal(result.length, 2);
  assert.deepEqual(result.map((entry) => entry.id), [
    'amm:0xammTx:7',
    'orderbook:0xorderTx:3',
  ]);
  assert.deepEqual(result.map((entry) => entry.timestampMs), [1_000_000, 1_010_000]);
  assert.deepEqual(result.map((entry) => entry.price), [2, 2]);
  assert.deepEqual(result.map((entry) => entry.volume), [2, 5]);
  assert.equal(exchangeContract.getOrder.mock.calls.length, 1);
  assert.equal(mocks.setCache.mock.calls.length, 1);
});
