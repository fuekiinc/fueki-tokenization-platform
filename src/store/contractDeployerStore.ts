/**
 * Smart Contract Deployer state management store.
 *
 * Manages:
 *   - Template browser state (category filter, search query)
 *   - Deployment wizard state (active template, step, constructor values, validation)
 *   - Deployment lifecycle (deploying flag, gas estimate, result, errors)
 *   - Deployment history persistence (via localStorage)
 *
 * Follows the same patterns as walletStore.ts:
 *   - `create` from zustand v5
 *   - Clean state/actions separation
 *   - localStorage persistence with graceful error handling
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fetchDeploymentsFromBackend } from '../lib/api/deployments';
import {
  clearDeployments,
  getDeploymentsByDeployerAddress,
  loadDeployments,
  mergeDeployments,
  replaceDeployments,
} from '../lib/contractDeployer/deploymentHistory';
import logger from '../lib/logger';
import { emitRpcRefetch } from '../lib/rpc/refetchEvents';
import type {
  DeploymentRecord,
  DeployWizardStep,
  GasEstimate,
  TemplateCategory,
} from '../types/contractDeployer';
import { createSafeJsonStorage } from './persistStorage';
import { withStoreMiddleware } from './storeMiddleware';
import { useWalletStore } from './walletStore';

// ---------------------------------------------------------------------------
// Persistence constants
// ---------------------------------------------------------------------------

const CONTRACT_DEPLOYER_STORE_KEY = 'fueki-contract-deployer-store-v1';

// ---------------------------------------------------------------------------
// State & Actions interfaces
// ---------------------------------------------------------------------------

export interface ContractDeployerState {
  // Browser state
  selectedCategory: TemplateCategory | 'all';
  searchQuery: string;

  // Wizard state
  activeTemplateId: string | null;
  wizardStep: DeployWizardStep;
  constructorValues: Record<string, string>;
  validationErrors: Record<string, string>;

  // Deploy state
  isDeploying: boolean;
  isLoading: boolean;
  error: string | null;
  gasEstimate: GasEstimate | null;
  deploymentResult: {
    contractAddress: string;
    txHash: string;
    blockNumber: number;
    gasUsed: string;
  } | null;
  deployError: string | null;

  // History
  deploymentHistory: DeploymentRecord[];
  deploymentHistoryTotal: number;
  deploymentHistoryNextCursor: string | null;
  isLoadingMoreHistory: boolean;
  historyFilterAddress: string | null;
}

export interface ContractDeployerActions {
  // Browser
  setCategory: (category: TemplateCategory | 'all') => void;
  setSearchQuery: (query: string) => void;

  // Wizard
  setActiveTemplate: (templateId: string | null) => void;
  setWizardStep: (step: DeployWizardStep) => void;
  setConstructorValue: (name: string, value: string) => void;
  setConstructorValues: (values: Record<string, string>) => void;
  setValidationErrors: (errors: Record<string, string>) => void;
  clearValidationError: (name: string) => void;
  resetWizard: () => void;

  // Deploy
  setDeploying: (deploying: boolean) => void;
  setGasEstimate: (estimate: GasEstimate | null) => void;
  setDeploymentResult: (result: ContractDeployerState['deploymentResult']) => void;
  setDeployError: (error: string | null) => void;

  // History
  addDeployment: (record: DeploymentRecord) => void;
  removeDeployment: (id: string) => void;
  loadHistory: () => Promise<void>;
  loadMoreHistory: () => Promise<void>;
  clearHistory: () => void;
}

export type ContractDeployerStore = ContractDeployerState & ContractDeployerActions;

interface PersistedContractDeployerState {
  selectedCategory: TemplateCategory | 'all';
  searchQuery: string;
  deploymentHistory: DeploymentRecord[];
  deploymentHistoryTotal: number;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialWizardState: Pick<
  ContractDeployerState,
  | 'activeTemplateId'
  | 'wizardStep'
  | 'constructorValues'
  | 'validationErrors'
  | 'isDeploying'
  | 'isLoading'
  | 'error'
  | 'gasEstimate'
  | 'deploymentResult'
  | 'deployError'
> = {
  activeTemplateId: null,
  wizardStep: 'configure' as DeployWizardStep,
  constructorValues: {},
  validationErrors: {},
  isDeploying: false,
  isLoading: false,
  error: null,
  gasEstimate: null,
  deploymentResult: null,
  deployError: null,
};

const initialState: ContractDeployerState = {
  selectedCategory: 'all',
  searchQuery: '',
  deploymentHistory: loadDeployments(),
  deploymentHistoryTotal: loadDeployments().length,
  deploymentHistoryNextCursor: null,
  isLoadingMoreHistory: false,
  historyFilterAddress: null,
  ...initialWizardState,
};

function mapBackendDeployments(
  response: Awaited<ReturnType<typeof fetchDeploymentsFromBackend>>,
): DeploymentRecord[] {
  return response.deployments.map((deployment) => ({
    id: deployment.id,
    templateId: deployment.templateId,
    templateName: deployment.templateName,
    contractName: deployment.contractName,
    templateType: deployment.templateType,
    contractAddress: deployment.contractAddress,
    deployerAddress: deployment.deployerAddress,
    walletAddress: deployment.walletAddress,
    chainId: deployment.chainId,
    txHash: deployment.txHash,
    constructorArgs: deployment.constructorArgs,
    abi: Array.isArray(deployment.abi)
      ? (deployment.abi as readonly Record<string, unknown>[])
      : [],
    sourceCode: deployment.sourceCode,
    compilationWarnings: deployment.compilationWarnings,
    blockNumber: deployment.blockNumber ?? undefined,
    gasUsed: deployment.gasUsed ?? undefined,
    deployedAt: deployment.deployedAt,
    createdAt: deployment.createdAt,
    updatedAt: deployment.updatedAt,
  }));
}

function normalizeDeployerAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(trimmed) ? trimmed : null;
}

let _latestLoadHistoryOperationId = 0;

function beginLoadHistoryOperation(): number {
  _latestLoadHistoryOperationId += 1;
  return _latestLoadHistoryOperationId;
}

function invalidateLoadHistoryOperation(): void {
  _latestLoadHistoryOperationId += 1;
}

function isCurrentLoadHistoryOperation(operationId: number): boolean {
  return operationId === _latestLoadHistoryOperationId;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useContractDeployerStore = create<ContractDeployerStore>()(
  withStoreMiddleware('contract-deployer', persist(
    (set, get) => ({
      ...initialState,

      // ---------------------------------------------------------------------------
      // Browser actions
      // ---------------------------------------------------------------------------

      setCategory: (category) => set({ selectedCategory: category }),

      setSearchQuery: (query) => set({ searchQuery: query }),

      // ---------------------------------------------------------------------------
      // Wizard actions
      // ---------------------------------------------------------------------------

      setActiveTemplate: (templateId) => set({ activeTemplateId: templateId }),

      setWizardStep: (step) => set({ wizardStep: step }),

      setConstructorValue: (name, value) =>
        set((state) => {
          // Also clear the validation error for this field when the user edits it.
          const { [name]: _removed, ...remainingErrors } = state.validationErrors;
          return {
            constructorValues: { ...state.constructorValues, [name]: value },
            validationErrors: remainingErrors,
          };
        }),

      setConstructorValues: (values) =>
        set((state) => ({
          constructorValues: { ...state.constructorValues, ...values },
        })),

      setValidationErrors: (errors) => set({ validationErrors: errors }),

      clearValidationError: (name) =>
        set((state) => {
          const { [name]: _removed, ...remainingErrors } = state.validationErrors;
          return { validationErrors: remainingErrors };
        }),

      resetWizard: () => set({ ...initialWizardState }),

      // ---------------------------------------------------------------------------
      // Deploy actions
      // ---------------------------------------------------------------------------

      setDeploying: (deploying) => set({ isDeploying: deploying }),

      setGasEstimate: (estimate) => set({ gasEstimate: estimate }),

      setDeploymentResult: (result) => set({ deploymentResult: result }),

      setDeployError: (error) => set({ deployError: error }),

      // ---------------------------------------------------------------------------
      // History actions
      // ---------------------------------------------------------------------------

      loadHistory: async () => {
        const deployerAddress = normalizeDeployerAddress(useWalletStore.getState().wallet.address);
        const operationId = beginLoadHistoryOperation();
        set({
          isLoading: true,
          isLoadingMoreHistory: false,
          error: null,
          historyFilterAddress: deployerAddress,
        });

        try {
          const response = await fetchDeploymentsFromBackend({
            limit: 20,
            walletAddress: deployerAddress ?? undefined,
          });
          if (!isCurrentLoadHistoryOperation(operationId)) {
            return;
          }
          const fetchedHistory = mapBackendDeployments(response);
          replaceDeployments(mergeDeployments(loadDeployments(), fetchedHistory));

          set({
            deploymentHistory: fetchedHistory,
            deploymentHistoryTotal: response.total,
            deploymentHistoryNextCursor: response.nextCursor,
            isLoadingMoreHistory: false,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const fallbackHistory = getDeploymentsByDeployerAddress(deployerAddress);
          if (!isCurrentLoadHistoryOperation(operationId)) {
            return;
          }
          logger.warn(
            '[contractDeployerStore] Failed to sync deployment history from backend',
            error,
          );
          set({
            deploymentHistory: fallbackHistory,
            deploymentHistoryTotal: fallbackHistory.length,
            deploymentHistoryNextCursor: null,
            isLoadingMoreHistory: false,
            isLoading: false,
            error: 'Failed to load deployment history from the server. Showing cached records instead.',
          });
        }
      },

      loadMoreHistory: async () => {
        const state = get();
        const deployerAddress = normalizeDeployerAddress(useWalletStore.getState().wallet.address);
        if (!state.deploymentHistoryNextCursor || state.isLoading || state.isLoadingMoreHistory) {
          return;
        }

        const operationId = beginLoadHistoryOperation();
        set({
          isLoadingMoreHistory: true,
          error: null,
          historyFilterAddress: deployerAddress,
        });

        try {
          const response = await fetchDeploymentsFromBackend({
            limit: 20,
            cursor: state.deploymentHistoryNextCursor,
            walletAddress: deployerAddress ?? undefined,
          });
          if (!isCurrentLoadHistoryOperation(operationId)) {
            return;
          }
          const fetchedHistory = mapBackendDeployments(response);
          const mergedPage = mergeDeployments(get().deploymentHistory, fetchedHistory);
          replaceDeployments(mergeDeployments(loadDeployments(), mergedPage));

          set({
            deploymentHistory: mergedPage,
            deploymentHistoryTotal: response.total,
            deploymentHistoryNextCursor: response.nextCursor,
            isLoadingMoreHistory: false,
            error: null,
          });
        } catch (error) {
          logger.warn(
            '[contractDeployerStore] Failed to load more deployment history from backend',
            error,
          );
          if (!isCurrentLoadHistoryOperation(operationId)) {
            return;
          }
          set({
            isLoadingMoreHistory: false,
            error: 'Failed to load additional deployment history. Please try again.',
          });
        }
      },

      addDeployment: (record) => {
        invalidateLoadHistoryOperation();
        const current = get().deploymentHistory;
        const updated = mergeDeployments([record], current);
        replaceDeployments(updated);
        set({
          deploymentHistory: updated,
          deploymentHistoryTotal: Math.max(get().deploymentHistoryTotal + 1, updated.length),
          error: null,
        });
        emitRpcRefetch(['history']);
      },

      removeDeployment: (id) => {
        invalidateLoadHistoryOperation();
        const current = get().deploymentHistory;
        const updated = current.filter((entry) => entry.id !== id);
        replaceDeployments(updated);
        set((state) => ({
          deploymentHistory: updated,
          deploymentHistoryTotal: Math.max(0, state.deploymentHistoryTotal - 1),
        }));
        emitRpcRefetch(['history']);
      },

      clearHistory: () => {
        invalidateLoadHistoryOperation();
        clearDeployments();
        set({
          deploymentHistory: [],
          deploymentHistoryTotal: 0,
          deploymentHistoryNextCursor: null,
          isLoadingMoreHistory: false,
          error: null,
          isLoading: false,
        });
        emitRpcRefetch(['history']);
      },
    }),
    {
      name: CONTRACT_DEPLOYER_STORE_KEY,
      version: 1,
      storage: createSafeJsonStorage('contract-deployer-store'),
      partialize: (state): PersistedContractDeployerState => ({
        selectedCategory: state.selectedCategory,
        searchQuery: state.searchQuery,
        deploymentHistory: state.deploymentHistory,
        deploymentHistoryTotal: state.deploymentHistoryTotal,
      }),
    },
  )),
);
