import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import clsx from 'clsx';
import FuekiBrand from '../components/Brand/FuekiBrand';
import PrivacyContent from '../components/Forms/PrivacyContent';

// ---------------------------------------------------------------------------
// PrivacyPage
// ---------------------------------------------------------------------------

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#06070A]">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <header className="w-full border-b border-white/[0.06] bg-[#06070A]/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link
            to="/"
            className={clsx(
              'inline-flex items-center gap-2 text-sm font-medium',
              'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              'transition-colors duration-200',
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <FuekiBrand
            variant="full"
            className="justify-center"
            imageClassName="h-8 w-auto drop-shadow-[0_8px_18px_rgba(8,24,38,0.35)]"
          />
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Main Content                                                        */}
      {/* ------------------------------------------------------------------ */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Title block */}
        <div className="mb-12 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-300 bg-clip-text text-transparent">
              Privacy Policy
            </span>
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Last updated: February 19, 2026
          </p>
        </div>

        {/* Policy card */}
        <div
          className={clsx(
            'bg-white/[0.02] backdrop-blur-xl',
            'border border-white/[0.06]',
            'rounded-2xl sm:rounded-3xl',
            'shadow-2xl shadow-black/20',
            'px-6 sm:px-10 lg:px-14 py-10 sm:py-14',
          )}
        >
          <PrivacyContent />
        </div>

        {/* Footer */}
        <footer className="mt-12 text-center">
          <p className="text-xs text-[var(--text-muted)]">
            &copy; {new Date().getFullYear()} Fueki Technologies, Inc. All
            rights reserved.
          </p>
        </footer>
      </main>
    </div>
  );
}

