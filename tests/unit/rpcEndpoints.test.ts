import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  getRpcEndpoints,
  getWalletSwitchRpcUrls,
  reportRpcEndpointFailure,
  reportRpcEndpointSuccess,
  selectRpcEndpoint,
} from '../../src/lib/rpc/endpoints';

test('holesky defaults prioritize the paid QuickNode endpoint first', () => {
  const endpoints = getRpcEndpoints(17000);
  assert.ok(endpoints.length >= 2);
  assert.equal(
    endpoints[0],
    'https://flashy-crimson-borough.ethereum-holesky.quiknode.pro/f43097bbd32a1c3476c2f3f1ff1d4780361be827/',
  );
  assert.ok(endpoints.includes('https://holesky.drpc.org'));
  assert.ok(endpoints.includes('https://ethereum-holesky-rpc.publicnode.com'));
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
  const endpoints = getRpcEndpoints(chainId);
  assert.ok(endpoints.length >= 2);

  reportRpcEndpointSuccess(chainId, endpoints[1]);

  const selected = selectRpcEndpoint(chainId);
  assert.equal(selected, endpoints[1]);
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
