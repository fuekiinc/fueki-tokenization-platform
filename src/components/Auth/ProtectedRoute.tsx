import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { isContractDeploymentOnlyPlan } from '../../lib/subscriptionPlans';
import { normalizeKycStatus } from '../../lib/auth/kycStatus';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of the location.state we set when redirecting to login. */
interface LocationStateWithFrom {
  from?: { pathname: string };
}

/** Type guard for LocationStateWithFrom. */
function hasFromPath(state: unknown): state is LocationStateWithFrom {
  if (typeof state !== 'object' || state === null) return false;
  const s = state as Record<string, unknown>;
  if (!('from' in s) || typeof s.from !== 'object' || s.from === null) return false;
  return typeof (s.from as Record<string, unknown>).pathname === 'string';
}

function isContractsPath(pathname: string): boolean {
  return pathname === '/contracts' || pathname.startsWith('/contracts/');
}

// ---------------------------------------------------------------------------
// Shared loading spinner used by both guards
// ---------------------------------------------------------------------------

function FullScreenLoader() {
  return (
    <div
      className="gradient-bg-subtle min-h-screen flex items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label="Loading application"
    >
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-primary)]" aria-hidden="true" />
        <p className="text-sm text-[var(--text-muted)]">Loading...</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProtectedRoute -- guards routes that require authentication + approved KYC
// ---------------------------------------------------------------------------

function ProtectedRoute() {
  const { isAuthenticated, isInitialized, user } = useAuthStore();
  const location = useLocation();

  // 1. Still initializing -- show a loading spinner.
  if (!isInitialized) {
    return <FullScreenLoader />;
  }

  // 2. Not authenticated -- redirect to login, preserving the intended destination.
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3. Demo mode active -- allow through regardless of KYC status.
  if (user?.demoActive) {
    return <Outlet />;
  }

  // 4. Authenticated but KYC not yet approved -- redirect based on KYC status.
  const kycStatus = normalizeKycStatus(user?.kycStatus);

  if (kycStatus === 'not_submitted' && user?.subscriptionPlan) {
    return <Navigate to="/pending-approval" replace />;
  }

  if (kycStatus === 'not_submitted') {
    return <Navigate to="/signup" state={{ step: 'kyc' }} replace />;
  }

  if (kycStatus === 'pending' || kycStatus === 'rejected') {
    return <Navigate to="/pending-approval" replace />;
  }

  // 4. Contract-deployment-only subscription -- lock access to contracts area.
  if (
    isContractDeploymentOnlyPlan(user?.subscriptionPlan) &&
    !isContractsPath(location.pathname)
  ) {
    return <Navigate to="/contracts" replace />;
  }

  // 4. Authenticated and KYC approved -- render the child routes.
  return <Outlet />;
}

// ---------------------------------------------------------------------------
// AuthRedirect -- redirects already-authenticated users away from auth pages
// ---------------------------------------------------------------------------

export function AuthRedirect({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitialized, user } = useAuthStore();
  const location = useLocation();

  // Still initializing -- show a loading spinner.
  if (!isInitialized) {
    return <FullScreenLoader />;
  }

  if (isAuthenticated) {
    if (!user) {
      return <Navigate to="/login" replace />;
    }

    // KYC approved -- send them to wherever they came from, or the dashboard.
    const kycStatus = normalizeKycStatus(user?.kycStatus);

    if (kycStatus === 'approved') {
      const defaultRoute = isContractDeploymentOnlyPlan(user.subscriptionPlan)
        ? '/contracts'
        : '/dashboard';
      const from = hasFromPath(location.state) ? location.state.from?.pathname : undefined;
      const destination = from && (
        !isContractDeploymentOnlyPlan(user.subscriptionPlan) || isContractsPath(from)
      )
        ? from
        : defaultRoute;
      return <Navigate to={destination ?? defaultRoute} replace />;
    }

    // Demo active -- send them to dashboard.
    if (user?.demoActive) {
      const from = hasFromPath(location.state) ? location.state.from?.pathname : undefined;
      return <Navigate to={from ?? '/dashboard'} replace />;
    }

    // KYC pending -- send them to the approval-pending page.
    if (kycStatus === 'pending') {
      return <Navigate to="/pending-approval" replace />;
    }

    // KYC rejected -- allow access to /signup so they can re-submit KYC.
    // Redirecting rejected users to /pending-approval while /pending-approval's
    // "Try Again" button points to /signup would create an infinite redirect loop.
    if (kycStatus === 'rejected' && location.pathname !== '/signup') {
      return <Navigate to="/pending-approval" replace />;
    }

    // KYC data exists but status is stale/misaligned -- keep them out of signup.
    if (kycStatus === 'not_submitted' && user.subscriptionPlan) {
      return <Navigate to="/pending-approval" replace />;
    }

    // KYC not submitted -- if they're on the login page, push them to signup KYC step.
    if (kycStatus === 'not_submitted' && location.pathname === '/login') {
      return <Navigate to="/signup" state={{ step: 'kyc' }} replace />;
    }
  }

  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// AdminRoute -- guards routes that require admin or super_admin role
// ---------------------------------------------------------------------------

export function AdminRoute() {
  const { isAuthenticated, isInitialized, user } = useAuthStore();

  if (!isInitialized) {
    return <FullScreenLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role !== 'admin' && user?.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default ProtectedRoute;
