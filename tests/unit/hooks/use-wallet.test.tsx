import assert from 'node:assert/strict';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { useWallet } from '../../../src/hooks/useWallet';
import { queryKeys } from '../../../src/lib/queryClient';
import { useAuthStore } from '../../../src/store/authStore';
import { useWalletStore } from '../../../src/store/walletStore';
import { createQueryClientWrapper } from '../testQueryClient';

const thirdwebState = vi.hoisted(() => ({
  activeAccount: null as { address: string } | null,
  activeWallet: null as
    | {
        id: string;
        getChain: () => { id: number } | null;
      }
    | null,
  activeWalletChain: null as { id: number } | null,
  connectionStatus: 'disconnected' as string,
  connect: vi.fn(),
  disconnect: vi.fn(),
  switchActiveWalletChain: vi.fn(),
}));

const rpcState = vi.hoisted(() => ({
  findHealthyEndpoint: vi.fn(),
}));

vi.mock('thirdweb/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('thirdweb/react')>();
  return {
    ...actual,
    useActiveAccount: () => thirdwebState.activeAccount,
    useActiveWallet: () => thirdwebState.activeWallet,
    useActiveWalletChain: () => thirdwebState.activeWalletChain,
    useActiveWalletConnectionStatus: () => thirdwebState.connectionStatus,
    useConnectModal: () => ({
      connect: thirdwebState.connect,
      isConnecting: false,
    }),
    useDisconnect: () => ({
      disconnect: thirdwebState.disconnect,
    }),
    useSwitchActiveWalletChain: () => thirdwebState.switchActiveWalletChain,
  };
});

vi.mock('../../../src/lib/rpc/endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/rpc/endpoints')>();
  return {
    ...actual,
    findHealthyEndpoint: rpcState.findHealthyEndpoint,
  };
});

function resetWalletState(): void {
  useWalletStore.getState().resetWallet();
  useAuthStore.setState((state) => ({ ...state, user: null }));
  thirdwebState.activeAccount = null;
  thirdwebState.activeWallet = null;
  thirdwebState.activeWalletChain = null;
  thirdwebState.connectionStatus = 'disconnected';
  thirdwebState.connect.mockReset();
  thirdwebState.disconnect.mockReset();
  thirdwebState.switchActiveWalletChain.mockReset();
  rpcState.findHealthyEndpoint.mockReset();
  delete (window as Window & { ethereum?: unknown }).ethereum;
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

  it('forces raw provider reconciliation when the wallet remains on the previous chain after a switch resolves', async () => {
    const address = '0x00000000000000000000000000000000000000d4';
    const store = useWalletStore.getState();
    store.setProvider({} as never);
    store.setSigner({} as never);
    store.setWallet({
      address,
      chainId: 1,
      isConnected: true,
      connectionStatus: 'connected',
    });

    let currentChainHex = '0x1';
    thirdwebState.activeAccount = { address };
    thirdwebState.activeWallet = {
      id: 'io.metamask',
      getChain: () => ({ id: Number.parseInt(currentChainHex, 16) }),
    };
    thirdwebState.activeWalletChain = { id: 1 };
    thirdwebState.connectionStatus = 'connected';
    thirdwebState.switchActiveWalletChain.mockResolvedValue(undefined);
    rpcState.findHealthyEndpoint.mockResolvedValue(
      'https://arbitrum-sepolia-rpc.publicnode.com',
    );

    const providerRequest = vi.fn(
      async ({ method, params }: { method: string; params?: unknown }) => {
        if (method === 'eth_accounts') {
          return [address];
        }
        if (method === 'eth_chainId') {
          return currentChainHex;
        }
        if (method === 'wallet_addEthereumChain') {
          return null;
        }
        if (method === 'wallet_switchEthereumChain') {
          const nextChain = (
            params as Array<{ chainId: string }>
          )[0]?.chainId;
          currentChainHex = nextChain ?? currentChainHex;
          thirdwebState.activeWalletChain = {
            id: Number.parseInt(currentChainHex, 16),
          };
          return null;
        }
        return null;
      },
    );

    const injectedProvider = {
      request: providerRequest,
      isMetaMask: true,
      selectedAddress: address,
    };
    (window as Window & { ethereum?: unknown }).ethereum = {
      ...injectedProvider,
      providers: [injectedProvider],
    };

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.switchNetwork(421614);
    });

    assert.equal(
      providerRequest.mock.calls.some(
        ([payload]) => payload.method === 'wallet_addEthereumChain',
      ),
      true,
    );
    assert.equal(
      providerRequest.mock.calls.some(
        ([payload]) => payload.method === 'wallet_switchEthereumChain',
      ),
      true,
    );
    assert.equal(currentChainHex, '0x66eee');
  }, 10_000);
});
