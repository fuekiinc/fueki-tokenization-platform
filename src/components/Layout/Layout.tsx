import { Outlet, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './Navbar';
import { ComponentErrorBoundary } from '../ErrorBoundary';
import { useTheme } from '../../hooks/useTheme';
import { getToasterProps } from '../../lib/toastConfig';

// ---------------------------------------------------------------------------
// Page transition -- fades in content on route changes
// ---------------------------------------------------------------------------

function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div key={location.key} className="animate-page-fade-in">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function Layout() {
  const { isDark } = useTheme();

  return (
    <div className="gradient-bg-subtle min-h-screen flex flex-col text-white overflow-x-hidden">
      {/* Navbar is wrapped in its own boundary so navigation remains
          functional even if a widget inside it (wallet, pending TXs) fails. */}
      <ComponentErrorBoundary name="Navbar" variant="inline">
        <Navbar />
      </ComponentErrorBoundary>

      <main className="flex-1 w-full max-w-[1920px] mx-auto px-4 sm:px-8 md:px-12 lg:px-20 xl:px-32 py-8 sm:py-12 md:py-16 lg:py-20 overflow-hidden box-border">
        {/* Page-level boundary catches errors from any route's content
            and shows a full-page recovery UI without tearing down the
            entire shell (navbar / toaster remain intact). */}
        <ComponentErrorBoundary name="PageContent" variant="full-page">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </ComponentErrorBoundary>
      </main>

      <Toaster {...getToasterProps(isDark)} />
    </div>
  );
}
