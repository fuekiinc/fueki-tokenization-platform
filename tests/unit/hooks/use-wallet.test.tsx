import assert from 'node:assert/strict';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { useWallet } from '../../../src/hooks/useWallet';
import { queryKeys } from '../../../src/lib/queryClient';
import { useAuthStore } from '../../../src/store/authStore';
import { useWalletStore } from '../../../src/store/walletStore';
import { createQueryClientWrapper } from '../testQueryClient';

vi.mock('thirdweb/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('thirdweb/react')>();
  return {
    ...actual,
    useActiveAccount: () => null,
    useActiveWallet: () => null,
    useActiveWalletChain: () => null,
    useActiveWalletConnectionStatus: () => 'disconnected',
    useConnectModal: () => ({
      connect: vi.fn(),
      isConnecting: false,
    }),
    useDisconnect: () => ({
      disconnect: vi.fn(),
    }),
    useSwitchActiveWalletChain: () => vi.fn(),
  };
});

function resetWalletState(): void {
  useWalletStore.getState().resetWallet();
  useAuthStore.setState((state) => ({ ...state, user: null }));
}

describe('useWallet refreshBalance', () => {
  beforeEach(() => {
    resetWalletState();
  });

  afterEach(() => {
    resetWalletState();
    vi.restoreAllMocks();
  });

  it('reads the latest wallet address when refreshBalance is called after a wallet switch', async () => {
    const oldAddress = '0x00000000000000000000000000000000000000a1';
    const newAddress = '0x00000000000000000000000000000000000000b2';
    const store = useWalletStore.getState();
    store.setProvider({} as never);
    store.setWallet({
      address: oldAddress,
      chainId: 421614,
      isConnected: true,
      connectionStatus: 'connected',
    });

    const { client, wrapper } = createQueryClientWrapper();
    const invalidateSpy = vi
      .spyOn(client, 'invalidateQueries')
      .mockResolvedValue(undefined);

    const { result } = renderHook(() => useWallet(), { wrapper });
    const initialRefreshBalance = result.current.refreshBalance;

    act(() => {
      useWalletStore.getState().setWallet({
        address: newAddress,
        chainId: 421614,
        isConnected: true,
        connectionStatus: 'connected',
      });
    });

    await act(async () => {
      await initialRefreshBalance();
    });

    assert.equal(invalidateSpy.mock.calls.length, 1);
    assert.deepEqual(invalidateSpy.mock.calls[0][0], {
      queryKey: queryKeys.balance(newAddress, 421614),
      exact: true,
      refetchType: 'active',
    });
  });

  it('does not overwrite the current wallet balance while requesting a refetch', async () => {
    const address = '0x00000000000000000000000000000000000000c3';
    const store = useWalletStore.getState();
    store.setProvider({} as never);
    store.setWallet({
      address,
      chainId: 421614,
      isConnected: true,
      connectionStatus: 'connected',
      balance: '7.0',
    });

    const { client, wrapper } = createQueryClientWrapper();
    vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.refreshBalance();
    });

    assert.equal(useWalletStore.getState().wallet.address, address);
    assert.equal(useWalletStore.getState().wallet.balance, '7.0');
  });
});
