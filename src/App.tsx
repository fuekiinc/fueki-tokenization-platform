import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import AuthLayout from './components/Layout/AuthLayout'
import ProtectedRoute, { AuthRedirect } from './components/Auth/ProtectedRoute'
import { useAuthStore } from './store/authStore'

// Auto-reload on stale chunk after deploy (avoids "Failed to fetch dynamically imported module")
function lazyWithRetry(factory: () => Promise<{ default: React.ComponentType<any> }>) {
  return lazy(() =>
    factory().catch(() => {
      window.location.reload();
      return new Promise(() => {}); // never resolves; page is reloading
    })
  );
}

// Lazy-load all page components for better initial bundle size
const DashboardPage = lazyWithRetry(() => import('./pages/DashboardPage'))
const MintPage = lazyWithRetry(() => import('./pages/MintPage'))
const PortfolioPage = lazyWithRetry(() => import('./pages/PortfolioPage'))
const ExchangePage = lazyWithRetry(() => import('./pages/ExchangePage'))
const OrbitalAMMPage = lazyWithRetry(() => import('./pages/OrbitalAMMPage'))
const LoginPage = lazyWithRetry(() => import('./pages/LoginPage'))
const SignupPage = lazyWithRetry(() => import('./pages/SignupPage'))
const PendingApprovalPage = lazyWithRetry(() => import('./pages/PendingApprovalPage'))
const ForgotPasswordPage = lazyWithRetry(() => import('./pages/ForgotPasswordPage'))
const ResetPasswordPage = lazyWithRetry(() => import('./pages/ResetPasswordPage'))
const SettingsPage = lazyWithRetry(() => import('./pages/SettingsPage'))
const AdminPage = lazyWithRetry(() => import('./pages/AdminPage'))
const NotFoundPage = lazyWithRetry(() => import('./pages/NotFoundPage'))
const ExplorePage = lazyWithRetry(() => import('./pages/ExplorePage'))

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
