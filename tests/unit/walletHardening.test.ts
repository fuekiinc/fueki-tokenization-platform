import assert from 'node:assert/strict';
import { test } from 'vitest';
import { getNetworkCapabilities } from '../../src/contracts/networkCapabilities';
import {
  getCached,
  invalidateCache,
  invalidateChainCache,
  makeChainCacheKey,
  setCache,
} from '../../src/lib/blockchain/rpcCache';
import { useWalletStore } from '../../src/store/walletStore';

function resetWalletState(): void {
  useWalletStore.getState().resetWallet();
  invalidateCache();
}

test('wallet invariant never reports connected status without provider and signer', () => {
  resetWalletState();

  const store = useWalletStore.getState();

  // Without provider/signer, setting 'connected' normalises to 'disconnected'.
  store.setConnectionStatus('connected');
  let wallet = useWalletStore.getState().wallet;
  assert.equal(wallet.connectionStatus, 'disconnected');
  assert.equal(wallet.isConnected, false);
  assert.equal(wallet.providerReady, false);
  assert.equal(wallet.signerReady, false);

  store.setWallet({ isConnected: true, connectionStatus: 'connected', isConnecting: false });
  wallet = useWalletStore.getState().wallet;
  assert.equal(wallet.connectionStatus, 'disconnected');
  assert.equal(wallet.isConnected, false);

  // With both provider and signer set, 'connected' is allowed.
  store.setProvider({} as never);
  store.setSigner({} as never);
  store.setWallet({
    address: '0x000000000000000000000000000000000000dEaD',
    chainId: 17000,
    isConnected: true,
    connectionStatus: 'connected',
  });

  wallet = useWalletStore.getState().wallet;
  assert.equal(wallet.providerReady, true);
  assert.equal(wallet.signerReady, true);
  assert.equal(wallet.isConnected, true);
  assert.equal(wallet.connectionStatus, 'connected');

  resetWalletState();
});

test('network capability matrix includes Base Sepolia and Holesky capability shape', () => {
  const holesky = getNetworkCapabilities(17000);
  assert.ok(holesky);
  assert.equal(holesky?.known, true);
  assert.equal(holesky?.mintAsset, true);
  assert.equal(holesky?.mintSecurity, true);
  assert.equal(holesky?.exchangeOrderbook, true);
  assert.equal(holesky?.exchangeAMM, false);
  assert.equal(holesky?.orbitalAMM, true);

  const baseSepolia = getNetworkCapabilities(84532);
  assert.ok(baseSepolia);
  assert.equal(baseSepolia?.known, true);
  assert.equal(baseSepolia?.name, 'Base Sepolia');
  assert.equal(baseSepolia?.mintAsset, false);
  assert.equal(baseSepolia?.mintSecurity, false);
  assert.equal(baseSepolia?.portfolio, false);
  assert.equal(baseSepolia?.exchangeOrderbook, false);
  assert.equal(baseSepolia?.exchangeAMM, false);
  assert.equal(baseSepolia?.orbitalAMM, false);
  assert.equal(baseSepolia?.wbtcPairs, false);

  const unknown = getNetworkCapabilities(999999);
  assert.ok(unknown);
  assert.equal(unknown?.known, false);
  assert.equal(unknown?.exchangeOrderbook, false);
  assert.equal(unknown?.exchangeAMM, false);
});

test('chain-scoped cache invalidation removes only the targeted chain keys', () => {
  resetWalletState();

  const mainnetKey = makeChainCacheKey(1, 'asset:0xabc:details');
  const holeskyKey = makeChainCacheKey(17000, 'asset:0xabc:details');
  const baseKey = makeChainCacheKey(8453, 'asset:0xabc:details');

  setCache(mainnetKey, 'mainnet');
  setCache(holeskyKey, 'holesky');
  setCache(baseKey, 'base');

  invalidateChainCache(17000);

  assert.equal(getCached(mainnetKey), 'mainnet');
  assert.equal(getCached(holeskyKey), undefined);
  assert.equal(getCached(baseKey), 'base');

  resetWalletState();
});

test('beginChainSwitch invalidates previous and target chain cache namespaces', () => {
  resetWalletState();

  const mainnetKey = makeChainCacheKey(1, 'asset:0xabc:details');
  const holeskyKey = makeChainCacheKey(17000, 'asset:0xabc:details');
  const arbitrumKey = makeChainCacheKey(42161, 'asset:0xabc:details');

  setCache(mainnetKey, 'mainnet');
  setCache(holeskyKey, 'holesky');
  setCache(arbitrumKey, 'arbitrum');

  const store = useWalletStore.getState();
  store.setWallet({ chainId: 1, isConnected: true });
  store.beginChainSwitch(17000);

  assert.equal(getCached(mainnetKey), undefined);
  assert.equal(getCached(holeskyKey), undefined);
  assert.equal(getCached(arbitrumKey), 'arbitrum');

  const wallet = useWalletStore.getState().wallet;
  assert.equal(wallet.connectionStatus, 'switching');
  assert.equal(wallet.switchTargetChainId, 17000);
  assert.equal(wallet.isConnected, false);

  resetWalletState();
});
