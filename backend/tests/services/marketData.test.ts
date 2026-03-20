import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  contractFactory: vi.fn(),
  formatUnits: vi.fn((raw: bigint) => (Number(raw) / 1e18).toString()),
  getRpcEndpoints: vi.fn(),
  getSupportedChainId: vi.fn(),
  providerInstances: [] as Array<{
    destroy: ReturnType<typeof vi.fn>;
    getBlock: ReturnType<typeof vi.fn>;
    getBlockNumber: ReturnType<typeof vi.fn>;
    url: string;
  }>,
}));

vi.mock('ethers', () => ({
  ethers: {
    Contract: function Contract(...args: unknown[]) {
      return mocks.contractFactory(...args);
    },
    JsonRpcProvider: class JsonRpcProvider {
      url: string;
      destroy = vi.fn();
      getBlock = vi.fn(async (blockNumber: number) => ({ timestamp: 1_700_000_000 + (blockNumber * 61) }));
      getBlockNumber = vi.fn(async () => 101);

      constructor(url: string) {
        this.url = url;
        mocks.providerInstances.push(this);
      }
    },
    formatUnits: (...args: [bigint, number]) => mocks.formatUnits(...args),
  },
}));

vi.mock('../../src/services/rpcRegistry', () => ({
  getRpcEndpoints: (...args: unknown[]) => mocks.getRpcEndpoints(...args),
  getSupportedChainId: (...args: unknown[]) => mocks.getSupportedChainId(...args),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.providerInstances.length = 0;
});

test('getPairCandles aggregates RPC trade activity and then serves cached candles', async () => {
  mocks.getSupportedChainId.mockReturnValue(421614);
  mocks.getRpcEndpoints.mockReturnValue(['https://rpc.one']);

  const exchangeContract = {
    filters: {
      OrderFilled: () => 'order-filter',
    },
    getOrder: vi.fn(async () => ({
      tokenSell: '0xTokenA',
      tokenBuy: '0xTokenB',
    })),
    queryFilter: vi.fn(async () => [
      {
        transactionHash: '0xorder',
        index: 2,
        blockNumber: 101,
        args: [
          1n,
          '0xtaker',
          4000000000000000000n,
          2000000000000000000n,
        ],
      },
    ]),
  };

  const ammContract = {
    filters: {
      Swap: () => 'swap-filter',
    },
    queryFilter: vi.fn(async () => [
      {
        transactionHash: '0xamm',
        index: 1,
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
    ]),
  };

  mocks.contractFactory.mockImplementation((address: string) => {
    if (address.toLowerCase() === '0xa9b60375a6433a6697f020f67dd69851f861dfb8') {
      return ammContract;
    }
    return exchangeContract;
  });

  const { getPairCandles } = await import('../../src/services/marketData');

  const first = await getPairCandles(421614, '0xTokenA', '0xTokenB', '1m');
  const second = await getPairCandles(421614, '0xTokenA', '0xTokenB', '1m');

  assert.equal(first.source, 'rpc');
  assert.equal(first.candles.length, 2);
  assert.deepEqual(first.candles.map((candle) => candle.time), [1_700_006_100, 1_700_006_160]);
  assert.deepEqual(first.candles.map((candle) => candle.close), [2, 2]);
  assert.equal(second.source, 'cache');
  assert.deepEqual(second.candles, first.candles);
  assert.equal(mocks.providerInstances.length, 1);
  assert.equal(ammContract.queryFilter.mock.calls.length, 1);
  assert.equal(exchangeContract.queryFilter.mock.calls.length, 1);
  assert.equal(exchangeContract.getOrder.mock.calls.length, 1);
  assert.equal(mocks.providerInstances[0]?.destroy.mock.calls.length, 1);
});
