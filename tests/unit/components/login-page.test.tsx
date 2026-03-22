import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '../../../src/pages/LoginPage';

const navigateMock = vi.fn();
const loginMock = vi.fn();
const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('react-hot-toast', () => ({
  default: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

vi.mock('../../../src/store/authStore', () => {
  const state = {
    user: null as null | {
      subscriptionPlan?: string | null;
      kycStatus?: string | null;
    },
    login: (...args: unknown[]) => loginMock(...args),
  };

  return {
    useAuthStore: Object.assign(
      (selector: (snapshot: typeof state) => unknown) => selector(state),
      {
        getState: () => state,
      },
    ),
  };
});

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an inline wrong-password message without redirecting away from login', async () => {
    loginMock.mockRejectedValue({
      response: {
        data: {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        },
      },
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'WrongPassword123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(
      await screen.findByText('Incorrect email or password. Please try again.'),
    ).toBeInTheDocument();

    expect(navigateMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('clears the inline auth error after the user edits the credentials', async () => {
    loginMock.mockRejectedValue({
      response: {
        data: {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        },
      },
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/^password$/i);

    fireEvent.change(emailInput, {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(passwordInput, {
      target: { value: 'WrongPassword123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(
      await screen.findByText('Incorrect email or password. Please try again.'),
    ).toBeInTheDocument();

    fireEvent.change(passwordInput, {
      target: { value: 'CorrectHorseBatteryStaple1!' },
    });

    await waitFor(() => {
      expect(
        screen.queryByText('Incorrect email or password. Please try again.'),
      ).not.toBeInTheDocument();
    });
  });
});
