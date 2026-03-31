import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrderBook from '../../../src/components/Exchange/OrderBook';
import type { ContractService, Order } from '../../../src/lib/blockchain/contracts';

const toastMock = vi.hoisted(() => ({
  loading: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: toastMock,
}));

vi.mock('../../../src/store/walletStore', () => ({
  useWalletStore: (selector: (state: { wallet: { chainId: number | null } }) => unknown) =>
    selector({ wallet: { chainId: 421614 } }),
}));

vi.mock('../../../src/lib/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    child: vi.fn(() => ({
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

vi.mock('../../../src/lib/rpc/refetchEvents', () => ({
  emitRpcRefetch: vi.fn(),
}));

function renderOrderBook(contractService: ReturnType<typeof createContractServiceMock>) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <OrderBook
        tokenSell="0x00000000000000000000000000000000000000A1"
        tokenBuy="0x00000000000000000000000000000000000000B1"
        contractService={contractService as unknown as ContractService}
        onOrderFilled={() => {}}
      />
    </QueryClientProvider>,
  );
}

function buildOrder(): Order {
  return {
    id: 1n,
    maker: '0x00000000000000000000000000000000000000C1',
    tokenSell: '0x00000000000000000000000000000000000000A1',
    tokenBuy: '0x00000000000000000000000000000000000000B1',
    amountSell: 10n * 10n ** 18n,
    amountBuy: 5n * 10n ** 18n,
    filledSell: 0n,
    filledBuy: 0n,
    cancelled: false,
    deadline: 0n,
  };
}

function createContractServiceMock(order: Order, allowance: bigint) {
  const signer = {
    getAddress: vi.fn().mockResolvedValue('0x00000000000000000000000000000000000000D1'),
    provider: {
      getBalance: vi.fn().mockResolvedValue(100n * 10n ** 18n),
    },
  };

  const fillTx = {
    hash: '0xfilltx',
    wait: vi.fn().mockResolvedValue({ status: 1 }),
  };
  const approveTx = {
    hash: '0xapprovetx',
    wait: vi.fn().mockResolvedValue({ status: 1 }),
  };

  return {
    getSigner: vi.fn().mockResolvedValue(signer),
    getExchangeActiveOrders: vi.fn().mockImplementation(async (sellToken: string, buyToken: string) => (
      sellToken.toLowerCase() === order.tokenSell.toLowerCase() &&
      buyToken.toLowerCase() === order.tokenBuy.toLowerCase()
        ? [order]
        : []
    )),
    getAssetBalance: vi.fn().mockResolvedValue(order.amountBuy),
    getAssetAllowance: vi.fn().mockResolvedValue(allowance),
    approveAssetBackedExchange: vi.fn().mockResolvedValue(approveTx),
    fillExchangeOrder: vi.fn().mockResolvedValue(fillTx),
    fillExchangeOrderWithETH: vi.fn(),
    waitForTransaction: vi.fn().mockResolvedValue({ status: 1 }),
  };
}

describe('OrderBook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fills using the existing allowance without sending a redundant approval', async () => {
    const order = buildOrder();
    const contractService = createContractServiceMock(order, order.amountBuy);

    renderOrderBook(contractService);

    fireEvent.click(await screen.findByRole('button', { name: /fill order:/i }));

    await waitFor(() => {
      expect(contractService.fillExchangeOrder).toHaveBeenCalledWith(order.id, order.amountBuy);
    });

    expect(contractService.getAssetAllowance).toHaveBeenCalled();
    expect(contractService.approveAssetBackedExchange).not.toHaveBeenCalled();
  });

  it('approves before filling when the current allowance is insufficient', async () => {
    const order = buildOrder();
    const contractService = createContractServiceMock(order, 0n);

    renderOrderBook(contractService);

    fireEvent.click(await screen.findByRole('button', { name: /fill order:/i }));

    await waitFor(() => {
      expect(contractService.approveAssetBackedExchange).toHaveBeenCalledWith(
        order.tokenBuy,
        order.amountBuy,
      );
      expect(contractService.fillExchangeOrder).toHaveBeenCalledWith(order.id, order.amountBuy);
    });

    expect(
      contractService.approveAssetBackedExchange.mock.invocationCallOrder[0],
    ).toBeLessThan(contractService.fillExchangeOrder.mock.invocationCallOrder[0]);
  });
});
