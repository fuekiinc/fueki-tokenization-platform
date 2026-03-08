import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AuthLayout from './components/Layout/AuthLayout'
import ProtectedRoute, { AuthRedirect } from './components/Auth/ProtectedRoute'
import { useAuthStore } from './store/authStore'
import { useTradeStore } from './store/tradeStore'
import { useWalletStore } from './store/walletStore'
import OctopusLoader from './components/Common/OctopusLoader'

// Auto-reload on stale chunk after deploy (avoids "Failed to fetch dynamically imported module")
function lazyWithRetry(factory: () => Promise<{ default: React.ComponentType }>) {
  return lazy(() =>
    factory().catch((err) => {
      // Prevent infinite reload loop: track retry count in sessionStorage.
      const retryKey = 'fueki:lazy-retry';
      const retries = Number(sessionStorage.getItem(retryKey) || '0');
      if (retries < 2) {
        sessionStorage.setItem(retryKey, String(retries + 1));
        window.location.reload();
        return new Promise(() => {}); // never resolves; page is reloading
      }
      sessionStorage.removeItem(retryKey);
      throw err; // let ErrorBoundary handle it after max retries
    })
  );
}

// Lazy-load all page components for better initial bundle size
const ThirdwebProvider = lazyWithRetry(() =>
  import('thirdweb/react').then((module) => ({ default: module.ThirdwebProvider })),
) as React.ComponentType<React.PropsWithChildren<unknown>>
const Layout = lazyWithRetry(() => import('./components/Layout/Layout'))
const DashboardPage = lazyWithRetry(() => import('./pages/DashboardPage'))
const MintPage = lazyWithRetry(() => import('./pages/MintPage'))
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
const ExchangeGuidePage = lazyWithRetry(() => import('./pages/ExchangeGuidePage'))
const OrbitalAMMGuidePage = lazyWithRetry(() => import('./pages/OrbitalAMMGuidePage'))
const TermsPage = lazyWithRetry(() => import('./pages/TermsPage'))
const PrivacyPage = lazyWithRetry(() => import('./pages/PrivacyPage'))
const ContractBrowserPage = lazyWithRetry(() => import('./pages/ContractBrowserPage'))
const BespokeContractPage = lazyWithRetry(() => import('./pages/BespokeContractPage'))
const ContractDeployPage = lazyWithRetry(() => import('./pages/ContractDeployPage'))
const ContractInteractPage = lazyWithRetry(() => import('./pages/ContractInteractPage'))
const ContractHistoryPage = lazyWithRetry(() => import('./pages/ContractHistoryPage'))
const WalletRuntime = lazyWithRetry(() => import('./wallet/WalletRuntime'))
const SupportWidget = lazyWithRetry(() => import('./components/Support/SupportWidget'))

// ---------------------------------------------------------------------------
// Page title map for document.title updates and screen reader announcements
// ---------------------------------------------------------------------------

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/mint': 'Mint Assets',
  '/exchange': 'Exchange',
  '/exchange/guide': 'Exchange Guide',
  '/advanced': 'Advanced AMM',
  '/advanced/guide': 'Orbital AMM Guide',
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
  '/contracts/bespoke': 'Bespoke Contract Request',
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

function TradeScopeSync() {
  const isConnected = useWalletStore((s) => s.wallet.isConnected)
  const address = useWalletStore((s) => s.wallet.address)
  const chainId = useWalletStore((s) => s.wallet.chainId)
  const setScope = useTradeStore((s) => s.setScope)

  useEffect(() => {
    if (!isConnected || !address || !chainId) {
      setScope(null, null)
      return
    }

    setScope(address, chainId)
  }, [address, chainId, isConnected, setScope])

  return null
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

function ProtectedShell() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ThirdwebProvider>
        <Layout />
        <WalletRuntime />
      </ThirdwebProvider>
    </Suspense>
  )
}

function DeferredSupportWidget() {
  const [shouldLoad, setShouldLoad] = useState(false)

  useEffect(() => {
    if (shouldLoad) return

    const loadWidget = () => {
      setShouldLoad(true)
    }

    const timeoutId = window.setTimeout(loadWidget, 3500)
    window.addEventListener('pointerdown', loadWidget, { once: true, passive: true })
    window.addEventListener('touchstart', loadWidget, { once: true, passive: true })
    window.addEventListener('scroll', loadWidget, { once: true, passive: true })
    window.addEventListener('keydown', loadWidget, { once: true })

    return () => {
      window.clearTimeout(timeoutId)
      window.removeEventListener('pointerdown', loadWidget)
      window.removeEventListener('touchstart', loadWidget)
      window.removeEventListener('scroll', loadWidget)
      window.removeEventListener('keydown', loadWidget)
    }
  }, [shouldLoad])

  if (!shouldLoad) {
    return null
  }

  return (
    <Suspense fallback={null}>
      <SupportWidget />
    </Suspense>
  )
}

export default function App() {
  return (
    <AuthInitializer>
      <TradeScopeSync />

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
          <Route element={<ProtectedShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
            <Route path="mint" element={<Suspense fallback={<PageLoader />}><MintPage /></Suspense>} />
            {/* Portfolio removed — dashboard covers the same data */}
            <Route path="portfolio" element={<Navigate to="/dashboard" replace />} />
            <Route path="exchange" element={<Suspense fallback={<PageLoader />}><ExchangePage /></Suspense>} />
            <Route path="exchange/guide" element={<Suspense fallback={<PageLoader />}><ExchangeGuidePage /></Suspense>} />
            <Route path="advanced" element={<Suspense fallback={<PageLoader />}><OrbitalAMMPage /></Suspense>} />
            <Route path="advanced/guide" element={<Suspense fallback={<PageLoader />}><OrbitalAMMGuidePage /></Suspense>} />
            <Route path="security-tokens" element={<Suspense fallback={<PageLoader />}><SecurityTokenPage /></Suspense>} />
            <Route path="security-tokens/deploy" element={<Suspense fallback={<PageLoader />}><DeployTokenPage /></Suspense>} />
            <Route path="contracts" element={<Suspense fallback={<PageLoader />}><ContractBrowserPage /></Suspense>} />
            <Route path="contracts/bespoke" element={<Suspense fallback={<PageLoader />}><BespokeContractPage /></Suspense>} />
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

      <DeferredSupportWidget />
    </AuthInitializer>
  )
}
