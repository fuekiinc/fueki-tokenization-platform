import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../src/components/ContractDeployer/DeploymentHistoryList', () => ({
  DeploymentHistoryList: ({
    deployments,
  }: {
    deployments: Array<{ id: string }>;
  }) => <div data-testid="deployment-history-list">{deployments.length}</div>,
}));

vi.mock('../../../src/lib/rpc/polling', () => ({
  createAdaptivePollingLoop: () => ({
    cancel: vi.fn(),
    triggerNow: vi.fn(),
  }),
}));

vi.mock('../../../src/lib/rpc/refetchEvents', () => ({
  emitRpcRefetch: vi.fn(),
  subscribeToRpcRefetch: () => () => {},
}));

vi.mock('../../../src/lib/api/deployments', () => ({
  deleteDeploymentFromBackend: vi.fn(),
}));

import ContractHistoryPage from '../../../src/pages/ContractHistoryPage';
import { useContractDeployerStore } from '../../../src/store/contractDeployerStore';

describe('ContractHistoryPage', () => {
  beforeEach(() => {
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
      loadHistory: vi.fn().mockResolvedValue(undefined),
      addDeployment: vi.fn(),
      removeDeployment: vi.fn(),
      clearHistory: vi.fn(),
      setCategory: vi.fn(),
      setSearchQuery: vi.fn(),
      setActiveTemplate: vi.fn(),
      setWizardStep: vi.fn(),
      setConstructorValue: vi.fn(),
      setConstructorValues: vi.fn(),
      setValidationErrors: vi.fn(),
      clearValidationError: vi.fn(),
      resetWizard: vi.fn(),
      setDeploying: vi.fn(),
      setGasEstimate: vi.fn(),
      setDeploymentResult: vi.fn(),
      setDeployError: vi.fn(),
    });
  });

  it('shows a loading state while deployment history is being fetched', () => {
    useContractDeployerStore.setState({
      isLoading: true,
      deploymentHistory: [],
    });

    render(
      <MemoryRouter>
        <ContractHistoryPage />
      </MemoryRouter>,
    );

    expect(screen.getAllByText(/Loading deployment history/i).length).toBeGreaterThan(0);
  });

  it('shows an error banner when deployment history fails to load', () => {
    useContractDeployerStore.setState({
      error: 'Failed to load deployment history. Please try again.',
    });

    render(
      <MemoryRouter>
        <ContractHistoryPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Unable to load deployment history/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Failed to load deployment history\. Please try again\./i),
    ).toBeInTheDocument();
  });
});
