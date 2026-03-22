import { describe, expect, it, vi } from 'vitest';
import { dedupeRpcRequest } from '../../src/lib/rpc/requestDedup';

describe('dedupeRpcRequest', () => {
  it('shares an in-flight request for identical keys', async () => {
    const loader = vi.fn(async () => {
      await Promise.resolve();
      return 'shared-result';
    });

    const [first, second] = await Promise.all([
      dedupeRpcRequest('balances:user-1', loader),
      dedupeRpcRequest('balances:user-1', loader),
    ]);

    expect(first).toBe('shared-result');
    expect(second).toBe('shared-result');
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
