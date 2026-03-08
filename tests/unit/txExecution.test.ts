import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ethers } from 'ethers';
import { sendTransactionWithRetry } from '../../src/lib/blockchain/txExecution';

function withImmediateTimers<T>(fn: () => Promise<T>): Promise<T> {
  const original = globalThis.setTimeout;
  (globalThis as unknown as { setTimeout: typeof setTimeout }).setTimeout = ((handler: (...args: unknown[]) => void) => {
    if (typeof handler === 'function') handler();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;

  return fn().finally(() => {
    (globalThis as unknown as { setTimeout: typeof setTimeout }).setTimeout = original;
  });
}

test('sendTransactionWithRetry retries transient RPC errors and succeeds', async () => {
  await withImmediateTimers(async () => {
    let attempts = 0;
    const tx = await sendTransactionWithRetry<ethers.ContractTransactionResponse>(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('HTTP 429 too many requests');
        }
        return { hash: '0xabc' } as unknown as ethers.ContractTransactionResponse;
      },
      { label: 'unit.retry' },
    );

    assert.equal(attempts, 2);
    assert.equal(tx.hash, '0xabc');
  });
});

test('sendTransactionWithRetry does not retry user rejection errors', async () => {
  let attempts = 0;
  await assert.rejects(
    () =>
      sendTransactionWithRetry(async () => {
        attempts += 1;
        const err = new Error('User rejected');
        (err as Error & { code?: number }).code = 4001;
        throw err;
      }),
    /rejected in your wallet/i,
  );
  assert.equal(attempts, 1);
});

test('sendTransactionWithRetry does not retry non-retryable errors', async () => {
  let attempts = 0;
  await assert.rejects(
    () =>
      sendTransactionWithRetry(async () => {
        attempts += 1;
        throw new Error('execution reverted: ZeroAddress');
      }),
    /ZeroAddress/,
  );
  assert.equal(attempts, 1);
});
