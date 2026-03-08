/**
 * DemoWalletProvider tests.
 *
 * Verifies demo mode automatically wires the designated Holesky demo wallet
 * without requiring a manual wallet connect flow.
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DemoWalletProvider, {
  useDemoWalletStore,
} from '../../../src/components/DemoMode/DemoWalletProvider';

const mockAuthState: { user: { demoActive: boolean } | null } = {
  user: { demoActive: true },
};

const walletActions = {
  setProvider: vi.fn(),
  setSigner: vi.fn(),
  setWallet: vi.fn(),
  resetWallet: vi.fn(),
};

const findHealthyEndpointMock = vi.fn();
const getOrderedRpcEndpointsMock = vi.fn(() => ['https://fallback.holesky.test']);

vi.mock('../../../src/store/authStore', () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) =>
    selector(mockAuthState),
}));

vi.mock('../../../src/store/walletStore', () => ({
  useWalletStore: (selector: (state: typeof walletActions) => unknown) =>
    selector(walletActions),
}));

vi.mock('../../../src/lib/rpc/endpoints', () => ({
  findHealthyEndpoint: (...args: unknown[]) => findHealthyEndpointMock(...args),
  getOrderedRpcEndpoints: (...args: unknown[]) => getOrderedRpcEndpointsMock(...args),
}));

vi.mock('ethers', () => {
  class JsonRpcProvider {
    rpcUrl: string;
    chainId: number;

    constructor(rpcUrl: string, chainId: number) {
      this.rpcUrl = rpcUrl;
      this.chainId = chainId;
    }

    async getBalance(): Promise<bigint> {
      return 123_000000000000000000n;
    }
  }

  class Wallet {
    provider: JsonRpcProvider;

    constructor(_privateKey: string, provider: JsonRpcProvider) {
      this.provider = provider;
    }

    async getAddress(): Promise<string> {
      return '0x00000000000000000000000000000000000000D1';
    }
  }

  return {
    Wallet,
    JsonRpcProvider,
    formatEther: (value: bigint) => (Number(value) / 1e18).toString(),
  };
});

describe('DemoWalletProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDemoWalletStore.getState().reset();
    mockAuthState.user = { demoActive: true };
    findHealthyEndpointMock.mockResolvedValue('https://healthy.holesky.test');
    (window as Window & { __FUEKI_RUNTIME_ENV__?: Record<string, string> }).__FUEKI_RUNTIME_ENV__ = {
      VITE_DEMO_WALLET_KEY: '0x' + '11'.repeat(32),
    };
  });

  afterEach(() => {
    useDemoWalletStore.getState().reset();
    (window as Window & { __FUEKI_RUNTIME_ENV__?: Record<string, string> }).__FUEKI_RUNTIME_ENV__ = {};
  });

  it('auto-activates the configured demo wallet on Holesky when demo mode is active', async () => {
    render(<DemoWalletProvider />);

    await waitFor(() => {
      expect(walletActions.setWallet).toHaveBeenCalledWith(
        expect.objectContaining({
          address: '0x00000000000000000000000000000000000000D1',
          chainId: 17000,
          isConnected: true,
          providerReady: true,
          signerReady: true,
        }),
      );
    });

    expect(walletActions.setProvider).toHaveBeenCalledTimes(1);
    expect(walletActions.setSigner).toHaveBeenCalledTimes(1);
    expect(useDemoWalletStore.getState().isReady).toBe(true);
    expect(useDemoWalletStore.getState().setupError).toBeNull();
  });

  it('cleans up wallet state when demo mode is turned off', async () => {
    const { rerender } = render(<DemoWalletProvider />);

    await waitFor(() => {
      expect(walletActions.setWallet).toHaveBeenCalledTimes(1);
      expect(useDemoWalletStore.getState().isReady).toBe(true);
    });

    mockAuthState.user = { demoActive: false };
    rerender(<DemoWalletProvider />);

    await waitFor(() => {
      expect(walletActions.setProvider).toHaveBeenCalledWith(null);
      expect(walletActions.setSigner).toHaveBeenCalledWith(null);
      expect(walletActions.resetWallet).toHaveBeenCalledTimes(1);
      expect(useDemoWalletStore.getState().isReady).toBe(false);
    });
  });
});
