import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { getJsonRpcProviderUrl } from '../../src/lib/rpc/providers';

const mocks = vi.hoisted(() => ({
  executeMulticall: vi.fn(),
  executeMulticallSameFunction: vi.fn(),
  executeMulticallSameTarget: vi.fn(),
}));

vi.mock('../../src/lib/blockchain/multicall', () => ({
  multicall: mocks.executeMulticall,
  multicallSameFunction: mocks.executeMulticallSameFunction,
  multicallSameTarget: mocks.executeMulticallSameTarget,
}));

afterEach(() => {
  vi.clearAllMocks();
});

test('rpc multicall retries the next endpoint after a rate limit error', async () => {
  const envName = 'VITE_RPC_1_URLS';
  const previousValue = process.env[envName];
  process.env[envName] = 'https://rpc-primary.test,https://rpc-fallback.test';

  try {
    const { multicall } = await import('../../src/lib/rpc/multicall');

    mocks.executeMulticall.mockImplementation(async (provider: { _getConnection?: () => { url?: string } }) => {
      const url = getJsonRpcProviderUrl(provider as never);
      if (url === 'https://rpc-primary.test') {
        throw new Error('HTTP 429 Too Many Requests');
      }
      return [{ success: true, data: 42n }];
    });

    const results = await multicall(1, [
      {
        target: '0x0000000000000000000000000000000000000001',
        abi: ['function balanceOf(address account) view returns (uint256)'],
        functionName: 'balanceOf',
        args: ['0x0000000000000000000000000000000000000002'],
      },
    ]);

    assert.equal(mocks.executeMulticall.mock.calls.length, 2);
    assert.equal(
      getJsonRpcProviderUrl(mocks.executeMulticall.mock.calls[0]?.[0] as never),
      'https://rpc-primary.test',
    );
    assert.equal(
      getJsonRpcProviderUrl(mocks.executeMulticall.mock.calls[1]?.[0] as never),
      'https://rpc-fallback.test',
    );
    assert.deepEqual(results, [{ success: true, data: 42n }]);
  } finally {
    if (previousValue === undefined) {
      delete process.env[envName];
    } else {
      process.env[envName] = previousValue;
    }
  }
});
