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
import type {
  DeploymentRecord,
  DeployWizardStep,
  GasEstimate,
  TemplateCategory,
} from '../types/contractDeployer';

// ---------------------------------------------------------------------------
// Persistence constants
// ---------------------------------------------------------------------------

const DEPLOY_HISTORY_KEY = 'fueki:deploy:history';
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
  loadHistory: () => void;
  clearHistory: () => void;
}

export type ContractDeployerStore = ContractDeployerState & ContractDeployerActions;

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
  | 'gasEstimate'
  | 'deploymentResult'
  | 'deployError'
> = {
  activeTemplateId: null,
  wizardStep: 'configure' as DeployWizardStep,
  constructorValues: {},
  validationErrors: {},
  isDeploying: false,
  gasEstimate: null,
  deploymentResult: null,
  deployError: null,
};

const initialState: ContractDeployerState = {
  selectedCategory: 'all',
  searchQuery: '',
  deploymentHistory: [],
  ...initialWizardState,
};

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function saveHistoryToStorage(history: DeploymentRecord[]): void {
  try {
    localStorage.setItem(DEPLOY_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded, etc.)
    console.warn('contractDeployerStore: failed to save deployment history to localStorage');
  }
}

function readHistoryFromStorage(): DeploymentRecord[] {
  try {
    const raw = localStorage.getItem(DEPLOY_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn('contractDeployerStore: localStorage history is not an array, ignoring');
      return [];
    }
    return parsed as DeploymentRecord[];
  } catch {
    console.warn('contractDeployerStore: failed to read deployment history from localStorage');
    return [];
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useContractDeployerStore = create<ContractDeployerStore>()((set, get) => ({
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

  loadHistory: () => {
    const history = readHistoryFromStorage();
    set({ deploymentHistory: history });
  },

  addDeployment: (record) => {
    const current = get().deploymentHistory;
    const updated = [record, ...current].slice(0, MAX_HISTORY_ENTRIES);
    saveHistoryToStorage(updated);
    set({ deploymentHistory: updated });
  },

  removeDeployment: (id) => {
    const current = get().deploymentHistory;
    const updated = current.filter((entry) => entry.id !== id);
    saveHistoryToStorage(updated);
    set({ deploymentHistory: updated });
  },

  clearHistory: () => {
    try {
      localStorage.removeItem(DEPLOY_HISTORY_KEY);
    } catch {
      console.warn('contractDeployerStore: failed to clear deployment history from localStorage');
    }
    set({ deploymentHistory: [] });
  },
}));
