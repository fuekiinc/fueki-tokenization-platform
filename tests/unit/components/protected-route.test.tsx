import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import ProtectedRoute from '../../../src/components/Auth/ProtectedRoute';
import { useAuthStore } from '../../../src/store/authStore';

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>Dashboard Content</div>} />
          <Route path="/contracts" element={<div>Contracts Content</div>} />
        </Route>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/signup" element={<div>Signup Page</div>} />
        <Route path="/pending-approval" element={<div>Pending Approval</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: true,
      storageMode: 'local',
    });
  });

  it('shows a full-screen loader while auth is initializing', () => {
    useAuthStore.setState({ isInitialized: false });

    renderAt('/dashboard');

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('redirects unauthenticated users to login', () => {
    useAuthStore.setState({
      isInitialized: true,
      isAuthenticated: false,
      user: null,
    });

    renderAt('/dashboard');

    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('allows authenticated users with approved KYC to access protected content', () => {
    useAuthStore.setState({
      isInitialized: true,
      isAuthenticated: true,
      user: {
        id: 'user-1',
        email: 'mark@fueki-tech.com',
        walletAddress: null,
        kycStatus: 'approved',
        helpLevel: 'novice',
        subscriptionPlan: 'monthly',
        demoUsed: false,
        demoActive: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    renderAt('/dashboard');

    expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
  });

  it('redirects contract-only subscribers to contracts routes', () => {
    useAuthStore.setState({
      isInitialized: true,
      isAuthenticated: true,
      user: {
        id: 'user-2',
        email: 'contract-only@fueki-tech.com',
        walletAddress: null,
        kycStatus: 'approved',
        helpLevel: 'novice',
        subscriptionPlan: 'contract_deployment_monthly',
        demoUsed: false,
        demoActive: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    renderAt('/dashboard');

    expect(screen.getByText('Contracts Content')).toBeInTheDocument();
  });
});
