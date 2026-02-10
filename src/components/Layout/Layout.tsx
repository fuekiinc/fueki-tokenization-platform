import { Outlet, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './Navbar';

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
  return (
    <div className="gradient-bg-subtle min-h-screen flex flex-col text-white">
      <Navbar />

      <main className="flex-1 mx-auto w-full max-w-[1400px] px-6 sm:px-10 lg:px-16 py-10 sm:py-14">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>

      <Toaster
        position="bottom-right"
        gutter={12}
        containerStyle={{ bottom: 24, right: 24 }}
        toastOptions={{
          duration: 5000,
          style: {
            background: 'rgba(17, 17, 24, 0.95)',
            color: '#ededf2',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '16px',
            backdropFilter: 'blur(16px)',
            padding: '14px 18px',
            fontSize: '14px',
            boxShadow:
              '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.03)',
          },
          success: {
            iconTheme: {
              primary: '#6366f1',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
    </div>
  );
}
