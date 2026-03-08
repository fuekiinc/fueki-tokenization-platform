/**
 * useSecurityToken stale-scope tests.
 *
 * Verifies async reads do not repopulate the security-token store after the
 * active wallet/chain or selected token changes mid-request.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSecurityTokenStore } from '../../../src/store/securityTokenStore';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mocks = vi.hoisted(() => {
  const walletState = {
    address: '0x00000000000000000000000000000000000000a1',
    chainId: 42161,
    isConnected: true,
  };
  const getProvider = vi.fn(() => ({ provider: true }));
  const getUserSecurityTokens = vi.fn();
  const getSecurityTokenDetails = vi.fn();
  const multicallSameTarget = vi.fn();

  const useWalletStore = Object.assign(
    (selector: (state: { wallet: typeof walletState }) => unknown) =>
      selector({ wallet: walletState }),
    {
      getState: () => ({ wallet: walletState }),
    },
  );

  class MockContractService {
    getUserSecurityTokens = getUserSecurityTokens;
    getSecurityTokenDetails = getSecurityTokenDetails;
  }

  return {
    walletState,
    getProvider,
    getUserSecurityTokens,
    getSecurityTokenDetails,
    multicallSameTarget,
    useWalletStore,
    MockContractService,
  };
});

vi.mock('../../../src/store/walletStore', () => ({
  useWalletStore: mocks.useWalletStore,
  getProvider: mocks.getProvider,
}));

vi.mock('../../../src/lib/blockchain/multicall', () => ({
  multicallSameTarget: mocks.multicallSameTarget,
}));

vi.mock('../../../src/lib/blockchain/contracts', async () => {
  const actual = await vi.importActual<typeof import('../../../src/lib/blockchain/contracts')>(
    '../../../src/lib/blockchain/contracts',
  );

  return {
    ...actual,
    ContractService: mocks.MockContractService,
    parseContractError: vi.fn(() => 'mock contract error'),
  };
});

import { useSecurityToken } from '../../../src/hooks/useSecurityToken';

describe('useSecurityToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSecurityTokenStore.getState().reset();
    mocks.walletState.address = '0x00000000000000000000000000000000000000a1';
    mocks.walletState.chainId = 42161;
    mocks.walletState.isConnected = true;
  });

  it('ignores stale token list responses after wallet scope changes', async () => {
    const pendingTokens = deferred<string[]>();
    mocks.getUserSecurityTokens.mockReturnValueOnce(pendingTokens.promise);

    const { result, rerender } = renderHook(() => useSecurityToken());

    let request!: Promise<void>;
    act(() => {
      request = result.current.loadTokenList() as Promise<void>;
    });

    mocks.walletState.address = '0x00000000000000000000000000000000000000b2';
    rerender();
    useSecurityTokenStore.getState().reset();

    pendingTokens.resolve(['0x00000000000000000000000000000000000000c3']);
    await act(async () => {
      await request;
    });

    expect(useSecurityTokenStore.getState().tokenList).toEqual([]);
    expect(useSecurityTokenStore.getState().selectedTokenAddress).toBeNull();
  });

  it('ignores stale role reads after the selected token changes', async () => {
    const tokenA = '0x00000000000000000000000000000000000000aa';
    const tokenB = '0x00000000000000000000000000000000000000bb';
    const pendingRoles = deferred<Array<{ success: boolean; data: boolean }>>();
    mocks.multicallSameTarget.mockReturnValueOnce(pendingRoles.promise);

    useSecurityTokenStore.getState().setSelectedToken(tokenA);

    const { result } = renderHook(() => useSecurityToken());

    let request!: Promise<Record<number, boolean> | undefined>;
    act(() => {
      request = result.current.loadUserRoles(tokenA);
    });

    useSecurityTokenStore.getState().setSelectedToken(tokenB);

    pendingRoles.resolve([
      { success: true, data: true },
      { success: true, data: false },
      { success: true, data: true },
      { success: true, data: false },
    ]);

    await act(async () => {
      await request;
    });

    expect(useSecurityTokenStore.getState().userRoles).toEqual({});
  });
});
