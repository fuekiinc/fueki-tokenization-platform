import assert from 'node:assert/strict';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchDeploymentsFromBackendMock = vi.fn();

vi.mock('../../../src/lib/api/deployments', () => ({
  fetchDeploymentsFromBackend: (...args: unknown[]) =>
    fetchDeploymentsFromBackendMock(...args),
}));

import { useContractDeployerStore } from '../../../src/store/contractDeployerStore';
import { useWalletStore } from '../../../src/store/walletStore';

const CONTRACT_DEPLOYER_STORE_KEY = 'fueki-contract-deployer-store-v1';
const DEPLOYMENT_HISTORY_KEY = 'fueki-contract-history-v1';

describe('useContractDeployerStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();

    await useContractDeployerStore.persist.clearStorage();
    useContractDeployerStore.setState({
      selectedCategory: 'all',
      searchQuery: '',
      activeTemplateId: null,
      wizardStep: 'configure',
      constructorValues: {},
      validationErrors: {},
      isDeploying: false,
      isLoading: false,
      error: null,
      gasEstimate: null,
      deploymentResult: null,
      deployError: null,
      deploymentHistory: [],
      deploymentHistoryTotal: 0,
      deploymentHistoryNextCursor: null,
      isLoadingMoreHistory: false,
      historyFilterAddress: null,
    });
    useWalletStore.setState((state) => ({
      wallet: {
        ...state.wallet,
        address: null,
      },
    }));
  });

  it('loads backend deployment history into the contracts store and backfills localStorage', async () => {
    useWalletStore.setState((state) => ({
      wallet: {
        ...state.wallet,
        address: '0x5678000000000000000000000000000000000000',
      },
    }));
    fetchDeploymentsFromBackendMock.mockResolvedValue({
      deployments: [
        {
          id: 'remote-1',
          templateId: 'erc20',
          templateName: 'ERC20 Token',
          contractAddress: '0x1234000000000000000000000000000000000000',
          deployerAddress: '0x5678000000000000000000000000000000000000',
          chainId: 421614,
          txHash: '0xabc',
          constructorArgs: { name: 'Fueki Token' },
          abi: [{ type: 'constructor', inputs: [] }],
          blockNumber: 123,
          gasUsed: '210000',
          deployedAt: '2026-03-21T05:00:00.000Z',
          createdAt: '2026-03-21T05:00:01.000Z',
        },
      ],
      total: 21,
      nextCursor: 'cursor-1',
    });

    const loadPromise = useContractDeployerStore.getState().loadHistory();

    expect(useContractDeployerStore.getState().isLoading).toBe(true);

    await loadPromise;

    const [deployment] = useContractDeployerStore.getState().deploymentHistory;
    expect(deployment).toMatchObject({
      id: 'remote-1',
      chainId: 421614,
      contractAddress: '0x1234000000000000000000000000000000000000',
      abi: [{ type: 'constructor', inputs: [] }],
    });
    expect(useContractDeployerStore.getState().isLoading).toBe(false);
    expect(useContractDeployerStore.getState().error).toBeNull();
    expect(useContractDeployerStore.getState().deploymentHistoryTotal).toBe(21);
    expect(useContractDeployerStore.getState().deploymentHistoryNextCursor).toBe('cursor-1');
    expect(fetchDeploymentsFromBackendMock).toHaveBeenCalledWith({
      limit: 20,
      walletAddress: '0x5678000000000000000000000000000000000000',
    });

    const historyRaw = localStorage.getItem(DEPLOYMENT_HISTORY_KEY);
    assert.ok(historyRaw, 'expected plain deployment history to be persisted');
    const persistedHistory = JSON.parse(historyRaw) as Array<{ id: string }>;
    expect(persistedHistory).toHaveLength(1);
    expect(persistedHistory[0]?.id).toBe('remote-1');

    const storeRaw = localStorage.getItem(CONTRACT_DEPLOYER_STORE_KEY);
    assert.ok(storeRaw, 'expected persisted deployer store state');
    const persistedStore = JSON.parse(storeRaw) as {
      state: { deploymentHistory: Array<{ id: string }>; deploymentHistoryTotal: number };
    };
    expect(persistedStore.state.deploymentHistory).toHaveLength(1);
    expect(persistedStore.state.deploymentHistory[0]?.id).toBe('remote-1');
    expect(persistedStore.state.deploymentHistoryTotal).toBe(21);
  });

  it('falls back to cached deployments for the active wallet when the backend is unavailable', async () => {
    useWalletStore.setState((state) => ({
      wallet: {
        ...state.wallet,
        address: '0x5678000000000000000000000000000000000000',
      },
    }));
    useContractDeployerStore.getState().addDeployment({
      id: 'local-1',
      templateId: 'erc20',
      templateName: 'ERC20 Token',
      contractAddress: '0x1234000000000000000000000000000000000000',
      deployerAddress: '0x5678000000000000000000000000000000000000',
      chainId: 421614,
      txHash: '0xabc',
      constructorArgs: { name: 'Local Token' },
      abi: [],
      deployedAt: '2026-03-21T05:00:00.000Z',
    });
    useContractDeployerStore.getState().addDeployment({
      id: 'local-2',
      templateId: 'erc20',
      templateName: 'ERC20 Token',
      contractAddress: '0x2234000000000000000000000000000000000000',
      deployerAddress: '0x9999000000000000000000000000000000000000',
      chainId: 421614,
      txHash: '0xdef',
      constructorArgs: { name: 'Other Wallet Token' },
      abi: [],
      deployedAt: '2026-03-21T06:00:00.000Z',
    });
    fetchDeploymentsFromBackendMock.mockRejectedValueOnce(new Error('offline'));

    await useContractDeployerStore.getState().loadHistory();

    expect(useContractDeployerStore.getState().deploymentHistory).toHaveLength(1);
    expect(useContractDeployerStore.getState().deploymentHistory[0]?.id).toBe('local-1');
    expect(useContractDeployerStore.getState().error).toBe(
      'Failed to load deployment history from the server. Showing cached records instead.',
    );
  });

  it('loads additional deployment pages from the backend cursor', async () => {
    useWalletStore.setState((state) => ({
      wallet: {
        ...state.wallet,
        address: '0x5678000000000000000000000000000000000000',
      },
    }));
    fetchDeploymentsFromBackendMock
      .mockResolvedValueOnce({
        deployments: [
          {
            id: 'remote-1',
            templateId: 'erc20',
            templateName: 'ERC20 Token',
            contractAddress: '0x1234000000000000000000000000000000000000',
            deployerAddress: '0x5678000000000000000000000000000000000000',
            chainId: 421614,
            txHash: '0xabc',
            constructorArgs: { name: 'Fueki Token' },
            abi: [],
            blockNumber: 123,
            gasUsed: '210000',
            deployedAt: '2026-03-21T05:00:00.000Z',
            createdAt: '2026-03-21T05:00:01.000Z',
          },
        ],
        total: 2,
        nextCursor: 'cursor-1',
      })
      .mockResolvedValueOnce({
        deployments: [
          {
            id: 'remote-2',
            templateId: 'erc20',
            templateName: 'ERC20 Token',
            contractAddress: '0x2234000000000000000000000000000000000000',
            deployerAddress: '0x5678000000000000000000000000000000000000',
            chainId: 421614,
            txHash: '0xdef',
            constructorArgs: { name: 'Fueki Token 2' },
            abi: [],
            blockNumber: 124,
            gasUsed: '220000',
            deployedAt: '2026-03-21T04:00:00.000Z',
            createdAt: '2026-03-21T04:00:01.000Z',
          },
        ],
        total: 2,
        nextCursor: null,
      });

    await useContractDeployerStore.getState().loadHistory();
    await useContractDeployerStore.getState().loadMoreHistory();

    expect(useContractDeployerStore.getState().deploymentHistory).toHaveLength(2);
    expect(useContractDeployerStore.getState().deploymentHistory[1]?.id).toBe('remote-2');
    expect(useContractDeployerStore.getState().deploymentHistoryNextCursor).toBeNull();
    expect(fetchDeploymentsFromBackendMock).toHaveBeenNthCalledWith(2, {
      limit: 20,
      cursor: 'cursor-1',
      walletAddress: '0x5678000000000000000000000000000000000000',
    });
  });

  it('falls back gracefully when localStorage writes fail', () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });

    expect(() => {
      useContractDeployerStore.getState().addDeployment({
        id: 'local-2',
        templateId: 'erc20',
        templateName: 'ERC20 Token',
        contractAddress: '0x2234000000000000000000000000000000000000',
        deployerAddress: '0x5678000000000000000000000000000000000000',
        chainId: 421614,
        txHash: '0xdef',
        constructorArgs: { name: 'Local Token' },
        abi: [],
        deployedAt: '2026-03-21T06:00:00.000Z',
      });
    }).not.toThrow();

    expect(useContractDeployerStore.getState().deploymentHistory).toHaveLength(1);

    setItemSpy.mockRestore();
  });
});
