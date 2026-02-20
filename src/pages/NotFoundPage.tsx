import { Link , useNavigate  } from 'react-router-dom';
import { ArrowLeft, Fingerprint, Home, LogIn } from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';

// ---------------------------------------------------------------------------
// NotFoundPage
// ---------------------------------------------------------------------------

export default function NotFoundPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <div className="gradient-bg-subtle min-h-screen flex flex-col overflow-x-hidden">
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[520px] mx-auto animate-page-fade-in text-center">
          {/* -------------------------------------------------------------- */}
          {/* Branding                                                        */}
          {/* -------------------------------------------------------------- */}
          <div className="mb-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 shadow-xl shadow-indigo-500/25 mb-5">
              <Fingerprint className="h-7 w-7 text-white" />
            </div>
          </div>

          {/* -------------------------------------------------------------- */}
          {/* Card                                                            */}
          {/* -------------------------------------------------------------- */}
          <div
            className={clsx(
              'bg-[var(--bg-secondary)]/80 backdrop-blur-2xl',
              'border border-[var(--border-primary)]',
              'rounded-3xl shadow-2xl shadow-black/20',
              'p-8 sm:p-12',
            )}
          >
            {/* Large 404 text */}
            <h1 className="text-[120px] sm:text-[140px] font-extrabold leading-none tracking-tighter select-none">
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-300 bg-clip-text text-transparent">
                404
              </span>
            </h1>

            {/* Heading */}
            <h2 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] mt-4 mb-3">
              Page Not Found
            </h2>

            {/* Description */}
            <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed max-w-sm mx-auto mb-10">
              The page you&apos;re looking for doesn&apos;t exist or has been
              moved.
            </p>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              {/* Primary CTA */}
              {isAuthenticated ? (
                <Link
                  to="/dashboard"
                  className={clsx(
                    'w-full flex items-center justify-center gap-2.5',
                    'bg-gradient-to-r from-indigo-600 to-purple-600',
                    'hover:from-indigo-500 hover:to-purple-500',
                    'text-white font-semibold text-[15px]',
                    'rounded-xl px-6 py-3.5',
                    'transition-all duration-200',
                    'shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30',
                    'active:scale-[0.98]',
                  )}
                >
                  <Home className="h-5 w-5" />
                  Go to Dashboard
                </Link>
              ) : (
                <Link
                  to="/login"
                  className={clsx(
                    'w-full flex items-center justify-center gap-2.5',
                    'bg-gradient-to-r from-indigo-600 to-purple-600',
                    'hover:from-indigo-500 hover:to-purple-500',
                    'text-white font-semibold text-[15px]',
                    'rounded-xl px-6 py-3.5',
                    'transition-all duration-200',
                    'shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30',
                    'active:scale-[0.98]',
                  )}
                >
                  <LogIn className="h-5 w-5" />
                  Go to Login
                </Link>
              )}

              {/* Go Back link */}
              <button
                type="button"
                onClick={() => navigate(-1)}
                className={clsx(
                  'w-full flex items-center justify-center gap-2',
                  'bg-[var(--bg-tertiary)] border border-[var(--border-primary)]',
                  'hover:border-[var(--border-hover)] hover:bg-[var(--bg-tertiary)]/80',
                  'text-[var(--text-primary)] font-semibold text-[15px]',
                  'rounded-xl px-6 py-3.5',
                  'transition-all duration-200',
                )}
              >
                <ArrowLeft className="h-4 w-4" />
                Go Back
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-6 px-4 text-center">
        <p className="text-xs text-[var(--text-muted)]">
          &copy; {new Date().getFullYear()} Fueki Technologies. All rights
          reserved.
        </p>
      </footer>
    </div>
  );
}
