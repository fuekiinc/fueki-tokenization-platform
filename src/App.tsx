import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import AuthLayout from './components/Layout/AuthLayout'
import ProtectedRoute, { AuthRedirect } from './components/Auth/ProtectedRoute'
import { useAuthStore } from './store/authStore'

// Lazy-load all page components for better initial bundle size
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const MintPage = lazy(() => import('./pages/MintPage'))
const PortfolioPage = lazy(() => import('./pages/PortfolioPage'))
const ExchangePage = lazy(() => import('./pages/ExchangePage'))
const OrbitalAMMPage = lazy(() => import('./pages/OrbitalAMMPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const SignupPage = lazy(() => import('./pages/SignupPage'))
const PendingApprovalPage = lazy(() => import('./pages/PendingApprovalPage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const ExplorePage = lazy(() => import('./pages/ExplorePage'))

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
        {/* Public exploration */}
        <Route path="/explore" element={<Suspense fallback={<PageLoader />}><ExplorePage /></Suspense>} />

        {/* Auth pages - no navbar, standalone layout */}
        <Route element={<Suspense fallback={<PageLoader />}><AuthLayout /></Suspense>}>
          <Route path="/login" element={<AuthRedirect><LoginPage /></AuthRedirect>} />
          <Route path="/signup" element={<AuthRedirect><SignupPage /></AuthRedirect>} />
          <Route path="/pending-approval" element={<Suspense fallback={<PageLoader />}><PendingApprovalPage /></Suspense>} />
          <Route path="/forgot-password" element={<AuthRedirect><Suspense fallback={<PageLoader />}><ForgotPasswordPage /></Suspense></AuthRedirect>} />
          <Route path="/reset-password" element={<Suspense fallback={<PageLoader />}><ResetPasswordPage /></Suspense>} />
        </Route>

        {/* Protected app pages - with navbar */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
            <Route path="mint" element={<Suspense fallback={<PageLoader />}><MintPage /></Suspense>} />
            <Route path="portfolio" element={<Suspense fallback={<PageLoader />}><PortfolioPage /></Suspense>} />
            <Route path="exchange" element={<Suspense fallback={<PageLoader />}><ExchangePage /></Suspense>} />
            <Route path="advanced" element={<Suspense fallback={<PageLoader />}><OrbitalAMMPage /></Suspense>} />
            <Route path="settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
            <Route path="admin" element={<Suspense fallback={<PageLoader />}><AdminPage /></Suspense>} />
          </Route>
        </Route>

        {/* 404 catch-all */}
        <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFoundPage /></Suspense>} />
      </Routes>
    </AuthInitializer>
  )
}
