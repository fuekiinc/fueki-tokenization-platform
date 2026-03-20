import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  getReadRpcEndpoints,
  getRpcEndpoints,
  getWalletSwitchRpcUrls,
  isRetryableRpcError,
  reportRpcEndpointFailure,
  reportRpcEndpointSuccess,
  selectRpcEndpoint,
} from '../../src/lib/rpc/endpoints';

test('holesky defaults prioritize the stable dRPC endpoint first', () => {
  const envName = 'VITE_RPC_17000_URLS';
  const previousValue = process.env[envName];
  process.env[envName] = 'https://holesky.drpc.org';

  try {
    const endpoints = getRpcEndpoints(17000);
    assert.ok(endpoints.length >= 1);
    assert.equal(
      endpoints[0],
      'https://holesky.drpc.org',
    );
    assert.ok(endpoints.includes('https://holesky.drpc.org'));
  } finally {
    if (previousValue === undefined) {
      delete process.env[envName];
    } else {
      process.env[envName] = previousValue;
    }
  }
});

test('env configured RPC URLs take priority over hardcoded defaults', () => {
  const envName = 'VITE_RPC_17000_URLS';
  const previousValue = process.env[envName];
  process.env[envName] =
    'https://custom-rpc.example.org,https://holesky.drpc.org';

  try {
    const endpoints = getRpcEndpoints(17000);
    const walletSwitchEndpoints = getWalletSwitchRpcUrls(17000);

    // Env-configured endpoints come first
    assert.equal(endpoints[0], 'https://custom-rpc.example.org');
    assert.equal(walletSwitchEndpoints[0], 'https://custom-rpc.example.org');
    // holesky.drpc.org is deduplicated (present in both env and defaults)
    assert.ok(endpoints.includes('https://holesky.drpc.org'));
  } finally {
    if (previousValue === undefined) {
      delete process.env[envName];
    } else {
      process.env[envName] = previousValue;
    }
  }
});

test('selectRpcEndpoint prefers a known healthy endpoint for the chain', () => {
  const chainId = 421614;
  const endpoints = getReadRpcEndpoints(chainId);
  assert.ok(endpoints.length >= 2);

  reportRpcEndpointSuccess(chainId, endpoints[1]);

  const selected = selectRpcEndpoint(chainId);
  assert.equal(selected, endpoints[1]);
});

test('read-only Arbitrum Sepolia endpoints demote QuickNode behind public fallbacks', () => {
  const envName = 'VITE_RPC_421614_URLS';
  const previousValue = process.env[envName];
  process.env[envName] =
    'https://ancient-holy-tent.arbitrum-sepolia.quiknode.pro/53623a401aa412366b43ddea31aa6538ef24d7fd/';

  try {
    const rawEndpoints = getRpcEndpoints(421614);
    const readEndpoints = getReadRpcEndpoints(421614);
    const walletSwitchEndpoints = getWalletSwitchRpcUrls(421614);

    assert.equal(
      rawEndpoints[0],
      'https://ancient-holy-tent.arbitrum-sepolia.quiknode.pro/53623a401aa412366b43ddea31aa6538ef24d7fd/',
    );
    assert.equal(walletSwitchEndpoints[0], rawEndpoints[0]);
    assert.notEqual(readEndpoints[0], rawEndpoints[0]);
    assert.equal(readEndpoints.at(-1), rawEndpoints[0]);
    assert.ok(readEndpoints.includes('https://arbitrum-sepolia-rpc.publicnode.com'));
  } finally {
    if (previousValue === undefined) {
      delete process.env[envName];
    } else {
      process.env[envName] = previousValue;
    }
  }
});

test('selectRpcEndpoint falls back when the primary endpoint enters cooldown', () => {
  const chainId = 1;
  const endpoints = getRpcEndpoints(chainId);
  assert.ok(endpoints.length >= 2);

  reportRpcEndpointFailure(chainId, endpoints[0]);
  reportRpcEndpointFailure(chainId, endpoints[0]);
  reportRpcEndpointFailure(chainId, endpoints[0]);

  const selected = selectRpcEndpoint(chainId);
  assert.notEqual(selected, endpoints[0]);
});

test('http 413 payload errors are treated as retryable RPC failures', () => {
  assert.equal(isRetryableRpcError(new Error('HTTP 413 Payload Too Large')), true);
});
