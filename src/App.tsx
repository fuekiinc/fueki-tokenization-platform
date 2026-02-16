import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import AuthLayout from './components/Layout/AuthLayout'
import ProtectedRoute, { AuthRedirect } from './components/Auth/ProtectedRoute'
import { useAuthStore } from './store/authStore'

// Eager-load the core pages (small, always used)
import DashboardPage from './pages/DashboardPage'
import MintPage from './pages/MintPage'
import PortfolioPage from './pages/PortfolioPage'

// Lazy-load heavier pages
const ExchangePage = lazy(() => import('./pages/ExchangePage'))
const OrbitalAMMPage = lazy(() => import('./pages/OrbitalAMMPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const SignupPage = lazy(() => import('./pages/SignupPage'))
const PendingApprovalPage = lazy(() => import('./pages/PendingApprovalPage'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-32">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    </div>
  )
}

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthInitializer>
      <Routes>
        {/* Auth pages - no navbar, standalone layout */}
        <Route element={<Suspense fallback={<PageLoader />}><AuthLayout /></Suspense>}>
          <Route path="/login" element={<AuthRedirect><LoginPage /></AuthRedirect>} />
          <Route path="/signup" element={<AuthRedirect><SignupPage /></AuthRedirect>} />
          <Route path="/pending-approval" element={<Suspense fallback={<PageLoader />}><PendingApprovalPage /></Suspense>} />
        </Route>

        {/* Protected app pages - with navbar */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="mint" element={<MintPage />} />
            <Route path="portfolio" element={<PortfolioPage />} />
            <Route path="exchange" element={<Suspense fallback={<PageLoader />}><ExchangePage /></Suspense>} />
            <Route path="advanced" element={<Suspense fallback={<PageLoader />}><OrbitalAMMPage /></Suspense>} />
          </Route>
        </Route>

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthInitializer>
  )
}
