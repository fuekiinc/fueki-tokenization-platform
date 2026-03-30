import { describe, expect, it, vi } from 'vitest';
import { queryRecentLogsBestEffort } from '../../../src/lib/blockchain/logQuery';
import { getJsonRpcProviderUrl } from '../../../src/lib/rpc/providers';

function makeLog(blockNumber: number, index: number) {
  return {
    blockNumber,
    index,
    transactionHash: `0x${String(blockNumber).padStart(64, '0')}`,
  };
}

describe('queryRecentLogsBestEffort', () => {
  it('shrinks the block window when the RPC rejects a large payload', async () => {
    const provider = {
      getBlockNumber: vi.fn().mockResolvedValue(1_000),
      _getConnection: () => ({ url: 'https://rpc.example' }),
    };

    const runQuery = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 413 Payload Too Large'))
      .mockResolvedValueOnce([makeLog(1_000, 0), makeLog(999, 1)]);

    const logs = await queryRecentLogsBestEffort(
      provider as never,
      runQuery,
      {
        chainId: 1,
        label: 'dashboard test',
        maxLookbackBlocks: 100,
        initialChunkSize: 100,
        minChunkSize: 20,
        maxRequests: 4,
        maxEvents: 2,
      },
    );

    expect(runQuery).toHaveBeenCalledTimes(2);
    expect(runQuery).toHaveBeenNthCalledWith(1, provider, 901, 1_000);
    expect(runQuery).toHaveBeenNthCalledWith(2, provider, 951, 1_000);
    expect(logs).toHaveLength(2);
    expect(logs[0]?.blockNumber).toBe(1_000);
  });

  it('walks backward across chunks until enough events are collected', async () => {
    const provider = {
      getBlockNumber: vi.fn().mockResolvedValue(500),
      _getConnection: () => ({ url: 'https://rpc.example' }),
    };

    const runQuery = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeLog(450, 0)])
      .mockResolvedValueOnce([makeLog(400, 0)]);

    const logs = await queryRecentLogsBestEffort(
      provider as never,
      runQuery,
      {
        chainId: 421614,
        label: 'dashboard history',
        maxLookbackBlocks: 150,
        initialChunkSize: 50,
        maxRequests: 3,
        maxEvents: 2,
      },
    );

    expect(runQuery).toHaveBeenCalledTimes(3);
    expect(runQuery).toHaveBeenNthCalledWith(1, provider, 451, 500);
    expect(runQuery).toHaveBeenNthCalledWith(2, provider, 401, 450);
    expect(runQuery).toHaveBeenNthCalledWith(3, provider, 351, 400);
    expect(logs.map((log) => log.blockNumber)).toEqual([450, 400]);
  });

  it('switches to the next RPC endpoint when the current provider is rate limited', async () => {
    const envName = 'VITE_RPC_1_URLS';
    const previousValue = process.env[envName];
    process.env[envName] = 'https://rpc-primary.test,https://rpc-fallback.test';

    const provider = {
      getBlockNumber: vi.fn().mockResolvedValue(1_000),
      _getConnection: () => ({ url: 'https://rpc-primary.test' }),
    };

    const runQuery = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw new Error('HTTP 429 Too Many Requests');
      })
      .mockImplementationOnce(async () => [makeLog(1_000, 0)]);

    try {
      const logs = await queryRecentLogsBestEffort(
        provider as never,
        runQuery,
        {
          chainId: 1,
          label: 'dashboard retry',
          maxLookbackBlocks: 50,
          initialChunkSize: 50,
          maxRequests: 4,
          maxEvents: 1,
        },
      );

      expect(runQuery).toHaveBeenCalledTimes(2);
      expect(getJsonRpcProviderUrl(runQuery.mock.calls[0]?.[0] as never)).toBe('https://rpc-primary.test');
      expect(getJsonRpcProviderUrl(runQuery.mock.calls[1]?.[0] as never)).toBe('https://rpc-fallback.test');
      expect(logs).toHaveLength(1);
      expect(logs[0]?.blockNumber).toBe(1_000);
    } finally {
      if (previousValue === undefined) {
        delete process.env[envName];
      } else {
        process.env[envName] = previousValue;
      }
    }
  });
});
