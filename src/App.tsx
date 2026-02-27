import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import AuthLayout from './components/Layout/AuthLayout'
import ProtectedRoute, { AuthRedirect } from './components/Auth/ProtectedRoute'
import { useAuthStore } from './store/authStore'
import OctopusLoader from './components/Common/OctopusLoader'
import SupportWidget from './components/Support/SupportWidget'

// Auto-reload on stale chunk after deploy (avoids "Failed to fetch dynamically imported module")
function lazyWithRetry(factory: () => Promise<{ default: React.ComponentType }>) {
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
const SecurityTokenPage = lazyWithRetry(() => import('./pages/SecurityTokenPage'))
const DeployTokenPage = lazyWithRetry(() => import('./pages/DeployTokenPage'))
const TermsPage = lazyWithRetry(() => import('./pages/TermsPage'))
const PrivacyPage = lazyWithRetry(() => import('./pages/PrivacyPage'))
const ContractBrowserPage = lazyWithRetry(() => import('./pages/ContractBrowserPage'))
const ContractDeployPage = lazyWithRetry(() => import('./pages/ContractDeployPage'))
const ContractInteractPage = lazyWithRetry(() => import('./pages/ContractInteractPage'))
const ContractHistoryPage = lazyWithRetry(() => import('./pages/ContractHistoryPage'))

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
  '/security-tokens': 'Security Tokens',
  '/security-tokens/deploy': 'Deploy Token',
  '/contracts': 'Smart Contracts',
  '/contracts/deploy': 'Deploy Contract',
  '/contracts/history': 'Deployed Contracts',
  '/terms': 'Terms of Service',
  '/privacy': 'Privacy Policy',
}

const APP_NAME = 'Fueki'

function PageLoader() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 py-32"
      role="status"
      aria-label="Loading page"
    >
      <OctopusLoader size="md" label="Loading page content" />
      <p className="text-sm text-[var(--text-secondary)]">Preparing your workspace...</p>
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
        {/* Public pages */}
        <Route path="/explore" element={<Suspense fallback={<PageLoader />}><ExplorePage /></Suspense>} />
        <Route path="/terms" element={<Suspense fallback={<PageLoader />}><TermsPage /></Suspense>} />
        <Route path="/privacy" element={<Suspense fallback={<PageLoader />}><PrivacyPage /></Suspense>} />

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
            <Route path="security-tokens" element={<Suspense fallback={<PageLoader />}><SecurityTokenPage /></Suspense>} />
            <Route path="security-tokens/deploy" element={<Suspense fallback={<PageLoader />}><DeployTokenPage /></Suspense>} />
            <Route path="contracts" element={<Suspense fallback={<PageLoader />}><ContractBrowserPage /></Suspense>} />
            <Route path="contracts/deploy/:templateId" element={<Suspense fallback={<PageLoader />}><ContractDeployPage /></Suspense>} />
            <Route path="contracts/history" element={<Suspense fallback={<PageLoader />}><ContractHistoryPage /></Suspense>} />
            <Route path="contracts/:chainId/:address" element={<Suspense fallback={<PageLoader />}><ContractInteractPage /></Suspense>} />
            <Route path="settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
            <Route path="admin" element={<Suspense fallback={<PageLoader />}><AdminPage /></Suspense>} />
          </Route>
        </Route>

        {/* 404 catch-all */}
        <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFoundPage /></Suspense>} />
      </Routes>

      <SupportWidget />
    </AuthInitializer>
  )
}
