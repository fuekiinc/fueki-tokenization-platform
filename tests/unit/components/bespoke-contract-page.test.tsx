import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BespokeContractPage from '../../../src/pages/BespokeContractPage';
import { submitSupportRequest } from '../../../src/lib/api/support';
import { useAuthStore } from '../../../src/store/authStore';

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../../src/lib/api/support', () => ({
  submitSupportRequest: vi.fn(),
}));

describe('BespokeContractPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: 'user-1',
        email: 'mark@example.com',
        firstName: 'Mark',
        lastName: 'Fueki',
        walletAddress: null,
        kycStatus: 'pending',
        helpLevel: 'novice',
        demoUsed: false,
        demoActive: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      isAuthenticated: true,
    });
  });

  it('submits bespoke request details through support API', async () => {
    vi.mocked(submitSupportRequest).mockResolvedValue({
      success: true,
      submittedAt: new Date().toISOString(),
    });

    render(
      <MemoryRouter>
        <BespokeContractPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/contact email/i)).toHaveValue('mark@example.com');
    });

    fireEvent.change(screen.getByLabelText(/what should the smart contract do/i), {
      target: { value: 'Handle compliant primary issuance, investor allowlists, and automated vesting releases.' },
    });

    fireEvent.change(screen.getByLabelText(/additional notes/i), {
      target: { value: 'Preferred chain: Arbitrum. Need role-based admin controls.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /submit request/i }));

    await waitFor(() => {
      expect(submitSupportRequest).toHaveBeenCalledTimes(1);
    });

    const payload = vi.mocked(submitSupportRequest).mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    expect(payload.subject).toBe('Bespoke Smart Contract Request');
    expect(payload.category).toBe('technical');
    expect(payload.email).toBe('mark@example.com');
    expect(payload.message).toMatch(/compliant primary issuance/i);
    expect(payload.route).toBe('/contracts/bespoke');
  });

  it('shows validation error when requirements are too short', async () => {
    render(
      <MemoryRouter>
        <BespokeContractPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/what should the smart contract do/i), {
      target: { value: 'Too short' },
    });

    fireEvent.click(screen.getByRole('button', { name: /submit request/i }));

    expect(
      await screen.findByText(/please provide at least 20 characters/i),
    ).toBeInTheDocument();
    expect(submitSupportRequest).not.toHaveBeenCalled();
  });
});

