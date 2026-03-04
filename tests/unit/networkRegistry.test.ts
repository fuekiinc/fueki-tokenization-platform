import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDeployedChainIds,
  getNetworkMetadata,
  SUPPORTED_NETWORKS,
} from '../../src/contracts/addresses';
import {
  getNetworkCapabilities,
  getSupportedChainIdsForCapability,
} from '../../src/contracts/networkCapabilities';

test('supported network registry entries are internally consistent', () => {
  for (const [rawChainId, meta] of Object.entries(SUPPORTED_NETWORKS)) {
    const chainId = Number(rawChainId);
    assert.equal(meta.chainId, chainId, `chainId mismatch for ${rawChainId}`);
    assert.ok(meta.name.length > 0, `missing name for chain ${chainId}`);
    assert.ok(meta.rpcUrl.length > 0, `missing rpcUrl for chain ${chainId}`);
    assert.ok(
      meta.nativeCurrency.symbol.length > 0,
      `missing native symbol for chain ${chainId}`,
    );

    const lookedUp = getNetworkMetadata(chainId);
    assert.ok(lookedUp, `getNetworkMetadata failed for chain ${chainId}`);
    assert.equal(lookedUp?.name, meta.name, `name mismatch for chain ${chainId}`);
  }
});

test('deployed chains expose mint + orderbook capabilities', () => {
  for (const chainId of getDeployedChainIds()) {
    const caps = getNetworkCapabilities(chainId);
    assert.ok(caps?.known, `chain ${chainId} should be known`);
    assert.equal(caps?.mintAsset, true, `chain ${chainId} should support mintAsset`);
    assert.equal(
      caps?.exchangeOrderbook,
      true,
      `chain ${chainId} should support exchangeOrderbook`,
    );
  }
});

test('capability index only returns chain IDs with that capability enabled', () => {
  const orbitalChains = getSupportedChainIdsForCapability('orbitalAMM');
  assert.ok(orbitalChains.length > 0, 'orbital capability list should not be empty');

  for (const chainId of orbitalChains) {
    const caps = getNetworkCapabilities(chainId);
    assert.equal(caps?.orbitalAMM, true, `orbitalAMM should be true for ${chainId}`);
  }

  const securityMintChains = getSupportedChainIdsForCapability('mintSecurity');
  for (const chainId of securityMintChains) {
    const caps = getNetworkCapabilities(chainId);
    assert.equal(caps?.mintSecurity, true, `mintSecurity should be true for ${chainId}`);
  }
});
