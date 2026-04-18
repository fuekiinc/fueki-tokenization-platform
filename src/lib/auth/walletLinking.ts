import axios from 'axios';
import type { JsonRpcSigner } from 'ethers';
import { linkConnectedWallet } from '../api/auth';
import type { User } from '../../types/auth';

type WalletMessageSigner = Pick<JsonRpcSigner, 'signMessage'>;

function normalizeWalletAddress(value: string): string {
  return value.trim().toLowerCase();
}

function toWalletLinkError(error: unknown): Error {
  const responseMessage =
    axios.isAxiosError(error)
    && typeof error.response?.data === 'object'
    && error.response?.data !== null
    && typeof (error.response.data as { error?: { message?: unknown } }).error?.message === 'string'
      ? (error.response.data as { error: { message: string } }).error.message
      : null;

  const message =
    responseMessage
    ?? (error instanceof Error ? error.message : 'Wallet linking failed.');

  if (/user rejected|rejected by user|cancelled|canceled|ACTION_REJECTED/i.test(message)) {
    return new Error(
      'Wallet connected, but wallet verification was cancelled. Your account wallet history was not updated.',
    );
  }

  return new Error(message);
}

export async function syncConnectedWalletAddress(
  walletAddress: string,
  signer: WalletMessageSigner,
): Promise<User> {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);

  try {
    const initialResponse = await linkConnectedWallet({
      walletAddress: normalizedWalletAddress,
    });

    if (!initialResponse.verificationRequired) {
      return initialResponse.user;
    }

    const signature = await signer.signMessage(initialResponse.message);
    const verifiedResponse = await linkConnectedWallet({
      walletAddress: normalizedWalletAddress,
      challengeToken: initialResponse.challengeToken,
      signature,
    });

    if (verifiedResponse.verificationRequired) {
      throw new Error('Wallet verification did not complete.');
    }

    return verifiedResponse.user;
  } catch (error) {
    throw toWalletLinkError(error);
  }
}
