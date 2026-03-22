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

// ---------------------------------------------------------------------------
// Persistence constants
// ---------------------------------------------------------------------------

const CONTRACT_DEPLOYER_STORE_KEY = 'fueki-contract-deployer-store-v1';
const MAX_HISTORY_ENTRIES = 100;

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
  clearHistory: () => void;
}

export type ContractDeployerStore = ContractDeployerState & ContractDeployerActions;

interface PersistedContractDeployerState {
  selectedCategory: TemplateCategory | 'all';
  searchQuery: string;
  deploymentHistory: DeploymentRecord[];
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
  ...initialWizardState,
};

function mapBackendDeployments(
  response: Awaited<ReturnType<typeof fetchDeploymentsFromBackend>>,
): DeploymentRecord[] {
  return response.deployments.map((deployment) => ({
    id: deployment.id,
    templateId: deployment.templateId,
    templateName: deployment.templateName,
    contractAddress: deployment.contractAddress,
    deployerAddress: deployment.deployerAddress,
    chainId: deployment.chainId,
    txHash: deployment.txHash,
    constructorArgs: deployment.constructorArgs,
    abi: [],
    blockNumber: deployment.blockNumber ?? undefined,
    gasUsed: deployment.gasUsed ?? undefined,
    deployedAt: deployment.deployedAt,
  }));
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
        set({ isLoading: true, error: null });

        try {
          const response = await fetchDeploymentsFromBackend({ limit: MAX_HISTORY_ENTRIES });
          const mergedHistory = mergeDeployments(
            get().deploymentHistory,
            mapBackendDeployments(response),
          );
          replaceDeployments(mergedHistory);

          set({
            deploymentHistory: mergedHistory,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          logger.warn(
            '[contractDeployerStore] Failed to sync deployment history from backend',
            error,
          );
          set({
            isLoading: false,
            error: 'Failed to load deployment history. Please try again.',
          });
        }
      },

      addDeployment: (record) => {
        const current = get().deploymentHistory;
        const updated = mergeDeployments([record], current);
        replaceDeployments(updated);
        set({
          deploymentHistory: updated,
          error: null,
        });
        emitRpcRefetch(['history']);
      },

      removeDeployment: (id) => {
        const current = get().deploymentHistory;
        const updated = current.filter((entry) => entry.id !== id);
        replaceDeployments(updated);
        set({ deploymentHistory: updated });
        emitRpcRefetch(['history']);
      },

      clearHistory: () => {
        clearDeployments();
        set({
          deploymentHistory: [],
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
      }),
    },
  )),
);
