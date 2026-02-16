import { Outlet, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './Navbar';
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
      <Navbar />

      <main className="flex-1 w-full max-w-[1920px] mx-auto px-8 sm:px-12 lg:px-20 xl:px-32 py-12 sm:py-16 lg:py-20 overflow-hidden box-border">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>

      <Toaster {...getToasterProps(isDark)} />
    </div>
  );
}
