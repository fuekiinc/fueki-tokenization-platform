import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
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

// ---------------------------------------------------------------------------
// Page title map for document.title updates and screen reader announcements
// ---------------------------------------------------------------------------

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/mint': 'Mint Assets',
  '/portfolio': 'Portfolio',
  '/exchange': 'Exchange',
  '/advanced': 'Advanced AMM',
  '/settings': 'Settings',
  '/admin': 'Admin',
  '/login': 'Sign In',
  '/signup': 'Create Account',
  '/pending-approval': 'Pending Approval',
  '/forgot-password': 'Forgot Password',
  '/reset-password': 'Reset Password',
  '/explore': 'Explore',
}

const APP_NAME = 'Fueki'

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-32" role="status" aria-label="Loading page">
      <div className="h-8 w-8 animate-spin motion-reduce:animate-none rounded-full border-2 border-indigo-500 border-t-transparent" aria-hidden="true" />
      <span className="sr-only">Loading page content</span>
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

// ---------------------------------------------------------------------------
// Route change announcer -- updates document title and announces to
// screen readers when the route changes (WCAG 2.1 criterion 2.4.2)
// ---------------------------------------------------------------------------

function RouteAnnouncer() {
  const location = useLocation();

  useEffect(() => {
    // Find the matching page title
    const path = location.pathname;
    const title = PAGE_TITLES[path] ?? 'Page';
    const fullTitle = `${title} | ${APP_NAME}`;

    // Update document title
    document.title = fullTitle;

    // Announce to screen readers via the live region
    const announcer = document.getElementById('route-announcer');
    if (announcer) {
      announcer.textContent = `Navigated to ${title}`;
    }
  }, [location.pathname]);

  return null;
}

export default function App() {
  return (
    <AuthInitializer>
      {/* Skip to main content link -- WCAG 2.1 criterion 2.4.1 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:rounded-xl focus:bg-indigo-600 focus:px-6 focus:py-3 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#06070A]"
      >
        Skip to main content
      </a>

      {/* Screen reader live region for route change announcements */}
      <div
        id="route-announcer"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      {/* Route change handler for title updates and announcements */}
      <RouteAnnouncer />

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
