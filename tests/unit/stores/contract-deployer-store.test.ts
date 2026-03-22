import assert from 'node:assert/strict';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchDeploymentsFromBackendMock = vi.fn();

vi.mock('../../../src/lib/api/deployments', () => ({
  fetchDeploymentsFromBackend: (...args: unknown[]) =>
    fetchDeploymentsFromBackendMock(...args),
}));

import { useContractDeployerStore } from '../../../src/store/contractDeployerStore';

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
    });
  });

  it('loads backend deployment history into the contracts store and backfills localStorage', async () => {
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
          blockNumber: 123,
          gasUsed: '210000',
          deployedAt: '2026-03-21T05:00:00.000Z',
          createdAt: '2026-03-21T05:00:01.000Z',
        },
      ],
      total: 1,
    });

    const loadPromise = useContractDeployerStore.getState().loadHistory();

    expect(useContractDeployerStore.getState().isLoading).toBe(true);

    await loadPromise;

    const [deployment] = useContractDeployerStore.getState().deploymentHistory;
    expect(deployment).toMatchObject({
      id: 'remote-1',
      chainId: 421614,
      contractAddress: '0x1234000000000000000000000000000000000000',
      abi: [],
    });
    expect(useContractDeployerStore.getState().isLoading).toBe(false);
    expect(useContractDeployerStore.getState().error).toBeNull();

    const historyRaw = localStorage.getItem(DEPLOYMENT_HISTORY_KEY);
    assert.ok(historyRaw, 'expected plain deployment history to be persisted');
    const persistedHistory = JSON.parse(historyRaw) as Array<{ id: string }>;
    expect(persistedHistory).toHaveLength(1);
    expect(persistedHistory[0]?.id).toBe('remote-1');

    const storeRaw = localStorage.getItem(CONTRACT_DEPLOYER_STORE_KEY);
    assert.ok(storeRaw, 'expected persisted deployer store state');
    const persistedStore = JSON.parse(storeRaw) as {
      state: { deploymentHistory: Array<{ id: string }> };
    };
    expect(persistedStore.state.deploymentHistory).toHaveLength(1);
    expect(persistedStore.state.deploymentHistory[0]?.id).toBe('remote-1');
  });

  it('captures a load error without clearing existing deployment history', async () => {
    useContractDeployerStore.setState({
      deploymentHistory: [
        {
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
        },
      ],
    });
    fetchDeploymentsFromBackendMock.mockRejectedValueOnce(new Error('offline'));

    await useContractDeployerStore.getState().loadHistory();

    expect(useContractDeployerStore.getState().deploymentHistory).toHaveLength(1);
    expect(useContractDeployerStore.getState().error).toBe(
      'Failed to load deployment history. Please try again.',
    );
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
