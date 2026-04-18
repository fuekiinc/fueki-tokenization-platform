import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncConnectedWalletAddress } from '../../src/lib/auth/walletLinking';

const apiMocks = vi.hoisted(() => ({
  linkConnectedWallet: vi.fn(),
}));

vi.mock('../../src/lib/api/auth', () => ({
  linkConnectedWallet: (...args: unknown[]) => apiMocks.linkConnectedWallet(...args),
}));

describe('syncConnectedWalletAddress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns immediately when the wallet is already linked', async () => {
    apiMocks.linkConnectedWallet.mockResolvedValue({
      verificationRequired: false,
      user: {
        id: 'user-1',
        email: 'wallet.user@example.com',
      },
    });

    const signMessage = vi.fn();

    const user = await syncConnectedWalletAddress(
      '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
      { signMessage } as never,
    );

    expect(user).toEqual({
      id: 'user-1',
      email: 'wallet.user@example.com',
    });
    expect(signMessage).not.toHaveBeenCalled();
    expect(apiMocks.linkConnectedWallet).toHaveBeenCalledWith({
      walletAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    });
  });

  it('signs the returned challenge before retrying the wallet link', async () => {
    apiMocks.linkConnectedWallet
      .mockResolvedValueOnce({
        verificationRequired: true,
        challengeToken: 'challenge-token',
        message: 'Please sign this challenge',
      })
      .mockResolvedValueOnce({
        verificationRequired: false,
        user: {
          id: 'user-1',
          email: 'wallet.user@example.com',
        },
      });

    const signMessage = vi.fn().mockResolvedValue('signed-challenge');

    const user = await syncConnectedWalletAddress(
      '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
      { signMessage } as never,
    );

    expect(signMessage).toHaveBeenCalledWith('Please sign this challenge');
    expect(apiMocks.linkConnectedWallet).toHaveBeenNthCalledWith(2, {
      walletAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      challengeToken: 'challenge-token',
      signature: 'signed-challenge',
    });
    expect(user).toEqual({
      id: 'user-1',
      email: 'wallet.user@example.com',
    });
  });
});
