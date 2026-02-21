import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import FuekiBrand from '../components/Brand/FuekiBrand';
import TermsContent from '../components/Forms/TermsContent';

// ---------------------------------------------------------------------------
// TermsPage -- Terms of Service
// ---------------------------------------------------------------------------

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#06070A]">
      {/* Subtle gradient background wash */}
      <div
        className="fixed inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99,102,241,0.07), transparent), radial-gradient(ellipse 60% 40% at 80% 50%, rgba(139,92,246,0.04), transparent)',
        }}
      />

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* ---------------------------------------------------------------- */}
        {/* Back Navigation                                                  */}
        {/* ---------------------------------------------------------------- */}
        <div className="mb-10 flex items-center justify-between gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors duration-200 text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
          <FuekiBrand
            variant="full"
            className="shrink-0 justify-center"
            imageClassName="h-8 w-auto drop-shadow-[0_8px_18px_rgba(8,24,38,0.35)]"
          />
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Glass Card Container                                             */}
        {/* ---------------------------------------------------------------- */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl backdrop-blur-xl p-6 sm:p-10 lg:p-14">
          {/* -------------------------------------------------------------- */}
          {/* Header                                                          */}
          {/* -------------------------------------------------------------- */}
          <header className="mb-12">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-300 bg-clip-text text-transparent">
                Terms of Service
              </span>
            </h1>
            <p className="text-[var(--text-muted)] text-sm">
              Last updated: February 19, 2026
            </p>
          </header>

          <TermsContent />
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Footer                                                           */}
        {/* ---------------------------------------------------------------- */}
        <footer className="mt-10 text-center">
          <p className="text-xs text-[var(--text-muted)]">
            &copy; {new Date().getFullYear()} Fueki Technologies, Inc. All
            rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
}
