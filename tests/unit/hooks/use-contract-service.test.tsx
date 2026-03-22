import assert from 'node:assert/strict';
import { act, renderHook } from '@testing-library/react';
import { describe, afterEach, beforeEach, it } from 'vitest';
import { ContractService } from '../../../src/lib/blockchain/contracts';
import { useContractService } from '../../../src/hooks/useContractService';
import { useWalletStore } from '../../../src/store/walletStore';

function resetWalletState(): void {
  const store = useWalletStore.getState();
  store.setProvider(null);
  store.resetWallet();
}

describe('useContractService', () => {
  beforeEach(() => {
    resetWalletState();
  });

  afterEach(() => {
    resetWalletState();
  });

  it('returns null while the wallet context is not ready', () => {
    const { result } = renderHook(() => useContractService());

    assert.equal(result.current.contractService, null);
    assert.equal(result.current.isReady, false);
  });

  it('memoizes the service for the active wallet context and recreates it after a chain switch', () => {
    const provider = {} as never;
    const store = useWalletStore.getState();
    store.setProvider(provider);
    store.setWallet({
      address: '0x00000000000000000000000000000000000000a1',
      chainId: 421614,
      isConnected: true,
      connectionStatus: 'connected',
    });

    const { result } = renderHook(() => useContractService());

    assert.equal(result.current.isReady, true);
    assert.ok(result.current.contractService instanceof ContractService);
    const firstService = result.current.contractService;

    act(() => {
      useWalletStore.getState().setWallet({
        chainId: 11155111,
        isConnected: true,
        connectionStatus: 'connected',
      });
    });

    assert.equal(result.current.isReady, true);
    assert.ok(result.current.contractService instanceof ContractService);
    assert.notEqual(result.current.contractService, firstService);
  });
});
