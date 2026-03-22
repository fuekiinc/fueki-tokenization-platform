import assert from 'node:assert/strict';
import { test } from 'vitest';
import { THIRDWEB_STORAGE_GATEWAY, thirdwebClient } from '../../src/lib/thirdweb';

test('thirdweb client uses a public IPFS gateway for storage assets', () => {
  assert.equal(THIRDWEB_STORAGE_GATEWAY, 'https://ipfs.io/ipfs/{cid}');
  assert.ok(thirdwebClient);
  assert.equal(thirdwebClient.config?.storage?.gatewayUrl, THIRDWEB_STORAGE_GATEWAY);
});
