import { Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useTheme } from '../../hooks/useTheme';
import { getToasterProps } from '../../lib/toastConfig';

export default function AuthLayout() {
  const { isDark } = useTheme();

  return (
    <div className="gradient-bg-subtle min-h-screen flex flex-col overflow-x-hidden">
      {/* Optional: Fueki branding watermark or subtle background elements */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <Outlet />
      </main>

      {/* Footer with links */}
      <footer className="w-full py-6 px-4 text-center">
        <p className="text-xs text-[var(--text-muted)]">
          &copy; {new Date().getFullYear()} Fueki Technologies. All rights reserved.
        </p>
      </footer>

      <Toaster {...getToasterProps(isDark)} />
    </div>
  );
}
