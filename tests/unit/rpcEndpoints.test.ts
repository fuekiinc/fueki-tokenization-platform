import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRpcEndpoints,
  reportRpcEndpointFailure,
  reportRpcEndpointSuccess,
  selectRpcEndpoint,
} from '../../src/lib/rpc/endpoints';

test('holesky defaults prioritize the most reliable public endpoint first', () => {
  const endpoints = getRpcEndpoints(17000);
  assert.ok(endpoints.length >= 2);
  assert.equal(endpoints[0], 'https://holesky.drpc.org');
  assert.ok(endpoints.includes('https://ethereum-holesky-rpc.publicnode.com'));
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

  const selected = selectRpcEndpoint(chainId);
  assert.notEqual(selected, endpoints[0]);
});
