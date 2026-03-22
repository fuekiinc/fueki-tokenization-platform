import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PendingTransactions from '../../../src/components/Layout/PendingTransactions';
import type {
  CheckResult,
  PendingTransaction,
} from '../../../src/lib/transactionRecovery';
import { createQueryClientWrapper } from '../testQueryClient';

const mocks = vi.hoisted(() => ({
  checkPendingTransactions: vi.fn<() => Promise<CheckResult>>(),
  getPendingTransactions: vi.fn<() => PendingTransaction[]>(),
  getProvider: vi.fn(),
  refetchListener: null as null | ((detail: { topics: string[] }) => void),
  subscribeToRpcRefetch: vi.fn(),
}));

vi.mock('../../../src/lib/transactionRecovery', () => ({
  checkPendingTransactions: () => mocks.checkPendingTransactions(),
  getPendingTransactions: () => mocks.getPendingTransactions(),
}));

vi.mock('../../../src/store/walletStore', () => ({
  getProvider: () => mocks.getProvider(),
  useWalletStore: (
    selector: (state: {
      wallet: { isConnected: boolean; address: string | null; chainId: number | null };
    }) => unknown,
  ) =>
    selector({
      wallet: {
        isConnected: true,
        address: '0x00000000000000000000000000000000000000a1',
        chainId: 421614,
      },
    }),
}));

vi.mock('../../../src/lib/rpc/refetchEvents', () => ({
  subscribeToRpcRefetch: (
    _topics: string[],
    listener: (detail: { topics: string[] }) => void,
  ) => mocks.subscribeToRpcRefetch(listener),
}));

const SAMPLE_PENDING_TX: PendingTransaction = {
  hash: '0xabc123',
  type: 'swap',
  description: 'Swap pending',
  timestamp: Date.now(),
  chainId: 421614,
};

describe('PendingTransactions', () => {
  let pendingTransactions: PendingTransaction[];

  beforeEach(() => {
    pendingTransactions = [SAMPLE_PENDING_TX];
    mocks.refetchListener = null;

    vi.clearAllMocks();

    mocks.getProvider.mockReturnValue({ getTransactionReceipt: vi.fn() });
    mocks.getPendingTransactions.mockImplementation(() => pendingTransactions);
    mocks.checkPendingTransactions.mockImplementation(async () => ({
      confirmed: [],
      failed: [],
      stillPending: pendingTransactions,
    }));
    mocks.subscribeToRpcRefetch.mockImplementation(
      (listener: (detail: { topics: string[] }) => void) => {
        mocks.refetchListener = listener;
        return () => {
          mocks.refetchListener = null;
        };
      },
    );
  });

  it('does not start receipt polling until the dropdown is opened, then stops it when closed', async () => {
    const { wrapper } = createQueryClientWrapper();
    render(<PendingTransactions />, { wrapper });

    const trigger = await screen.findByRole('button', { name: /1 pending transaction/i });
    expect(mocks.checkPendingTransactions).not.toHaveBeenCalled();

    fireEvent.click(trigger);

    await waitFor(() => {
      expect(mocks.checkPendingTransactions).toHaveBeenCalled();
    });

    const callCountWhileOpen = mocks.checkPendingTransactions.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 5_200));

    expect(mocks.checkPendingTransactions.mock.calls.length).toBeGreaterThan(callCountWhileOpen);

    fireEvent.click(trigger);

    const callCountAfterClose = mocks.checkPendingTransactions.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 5_200));

    expect(mocks.checkPendingTransactions.mock.calls.length).toBe(callCountAfterClose);
  }, 15_000);

  it('skips polling entirely when there are no pending transactions', async () => {
    pendingTransactions = [];
    const { wrapper } = createQueryClientWrapper();

    render(<PendingTransactions />, { wrapper });

    const trigger = await screen.findByRole('button', { name: /no pending transactions/i });
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(mocks.getPendingTransactions).toHaveBeenCalled();
    });

    expect(mocks.checkPendingTransactions).not.toHaveBeenCalled();
  });

  it('starts polling when a new pending transaction arrives while the dropdown is open', async () => {
    pendingTransactions = [];
    const { wrapper } = createQueryClientWrapper();

    render(<PendingTransactions />, { wrapper });

    const trigger = await screen.findByRole('button', { name: /no pending transactions/i });
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(mocks.getPendingTransactions).toHaveBeenCalled();
    });

    pendingTransactions = [SAMPLE_PENDING_TX];

    act(() => {
      mocks.refetchListener?.({ topics: ['pending-transactions'] });
    });

    await waitFor(() => {
      expect(mocks.checkPendingTransactions).toHaveBeenCalled();
    });
  });
});
