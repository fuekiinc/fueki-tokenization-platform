import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { ethers } from 'ethers';
import {
  applyGasLimitBuffer,
  buildBufferedTransactionOverrides,
} from '../../src/lib/blockchain/transactionOverrides';

test('applyGasLimitBuffer adds the configured headroom', () => {
  assert.equal(applyGasLimitBuffer(100_000n), 130_000n);
});

test('buildBufferedTransactionOverrides returns gas limit only when no provider is available', async () => {
  const overrides = await buildBufferedTransactionOverrides(null, 210_000n);

  assert.deepEqual(overrides, {
    gasLimit: 273_000n,
  });
});

test('buildBufferedTransactionOverrides buffers EIP-1559 fees and preserves explicit priority fees', async () => {
  const provider = {
    getFeeData: async () => ({
      gasPrice: null,
      maxFeePerGas: 20_000_000_000n,
      maxPriorityFeePerGas: 2_500_000_000n,
    }),
  } as unknown as ethers.Provider;

  const overrides = await buildBufferedTransactionOverrides(provider, 500_000n);

  assert.equal(overrides.gasLimit, 650_000n);
  assert.equal(overrides.maxFeePerGas, 30_000_000_000n);
  assert.equal(overrides.maxPriorityFeePerGas, 2_500_000_000n);
});

test('buildBufferedTransactionOverrides falls back to a default priority fee when the provider omits it', async () => {
  const provider = {
    getFeeData: async () => ({
      gasPrice: null,
      maxFeePerGas: 10_000_000_000n,
      maxPriorityFeePerGas: null,
    }),
  } as unknown as ethers.Provider;

  const overrides = await buildBufferedTransactionOverrides(provider, 100_000n);

  assert.equal(overrides.maxPriorityFeePerGas, 1_500_000_000n);
});

test('buildBufferedTransactionOverrides buffers legacy gas price data when EIP-1559 data is absent', async () => {
  const provider = {
    getFeeData: async () => ({
      gasPrice: 40_000_000_000n,
      maxFeePerGas: null,
      maxPriorityFeePerGas: null,
    }),
  } as unknown as ethers.Provider;

  const overrides = await buildBufferedTransactionOverrides(provider, 80_000n);

  assert.equal(overrides.gasLimit, 104_000n);
  assert.equal(overrides.gasPrice, 50_000_000_000n);
});

test('buildBufferedTransactionOverrides degrades gracefully when fee discovery fails', async () => {
  const provider = {
    getFeeData: async () => {
      throw new Error('fee data unavailable');
    },
  } as unknown as ethers.Provider;

  const overrides = await buildBufferedTransactionOverrides(provider, 90_000n);

  assert.deepEqual(overrides, {
    gasLimit: 117_000n,
  });
});
