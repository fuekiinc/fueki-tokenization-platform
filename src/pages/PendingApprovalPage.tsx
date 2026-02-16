import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  LogOut,
  Shield,
  Mail,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
import type { KYCStatus } from '../types/auth';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Timeline step definition
// ---------------------------------------------------------------------------

interface TimelineStep {
  label: string;
  status: 'completed' | 'current' | 'upcoming';
}

function buildTimeline(kycStatus: KYCStatus): TimelineStep[] {
  switch (kycStatus) {
    case 'approved':
      return [
        { label: 'Account Created', status: 'completed' },
        { label: 'KYC Submitted', status: 'completed' },
        { label: 'Under Review', status: 'completed' },
        { label: 'Approved', status: 'completed' },
      ];
    case 'rejected':
      return [
        { label: 'Account Created', status: 'completed' },
        { label: 'KYC Submitted', status: 'completed' },
        { label: 'Under Review', status: 'completed' },
        { label: 'Approved', status: 'upcoming' },
      ];
    default:
      return [
        { label: 'Account Created', status: 'completed' },
        { label: 'KYC Submitted', status: 'completed' },
        { label: 'Under Review', status: 'current' },
        { label: 'Approved', status: 'upcoming' },
      ];
  }
}

// ---------------------------------------------------------------------------
// PendingApprovalPage
// ---------------------------------------------------------------------------

export default function PendingApprovalPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const checkKYCStatus = useAuthStore((s) => s.checkKYCStatus);

  const [isChecking, setIsChecking] = useState(false);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);

  const kycStatus: KYCStatus = user?.kycStatus ?? 'pending';

  // ---- Initial status check + polling ------------------------------------

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const response = await checkKYCStatus();

        if (response.status === 'approved') {
          toast.success('Your identity has been verified!');
        }

        if (response.status === 'rejected' && response.message) {
          setRejectionReason(response.message);
        }
      } catch {
        // Silently ignore polling errors -- the user can manually retry.
      }
    };

    // Check immediately on mount.
    poll();

    // Set up polling only while status is pending.
    if (kycStatus === 'pending') {
      intervalId = setInterval(poll, POLL_INTERVAL_MS);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kycStatus]);

  // ---- Auto-navigate on approval ----------------------------------------

  useEffect(() => {
    if (kycStatus !== 'approved') return;

    const timeout = setTimeout(() => {
      navigate('/dashboard');
    }, 3000);

    return () => clearTimeout(timeout);
  }, [kycStatus, navigate]);

  // ---- Handlers ----------------------------------------------------------

  const handleCheckStatus = async () => {
    setIsChecking(true);
    try {
      const response = await checkKYCStatus();

      if (response.status === 'approved') {
        toast.success('Your identity has been verified!');
      } else if (response.status === 'rejected') {
        if (response.message) setRejectionReason(response.message);
        toast.error('Verification was unsuccessful.');
      } else {
        toast('Still under review. Hang tight!', { icon: '\u23F3' });
      }
    } catch {
      toast.error('Unable to check status. Please try again.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    navigate('/login');
  };

  // ---- Derived state -----------------------------------------------------

  const timeline = buildTimeline(kycStatus);
  const progressPercent = kycStatus === 'approved' ? 100 : kycStatus === 'rejected' ? 75 : 60;

  // ---- Render ------------------------------------------------------------

  return (
    <div className="w-full max-w-[520px] mx-auto animate-page-fade-in">
      {/* ---- Branding -------------------------------------------------- */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 shadow-xl shadow-indigo-500/25 mb-5">
          <Shield className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-300 bg-clip-text text-transparent">
            Fueki
          </span>
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] tracking-widest uppercase font-medium">
          Tokenization Platform
        </p>
      </div>

      {/* Card */}
      <div
        className={clsx(
          'bg-[var(--bg-secondary)]/80 backdrop-blur-2xl',
          'border border-[var(--border-primary)]',
          'rounded-3xl shadow-2xl shadow-black/20',
          'p-8 sm:p-10',
        )}
      >

        {/* ================================================================
            STATE: APPROVED
            ================================================================ */}
        {kycStatus === 'approved' && (
          <div className="mt-8 text-center">
            {/* Icon */}
            <div className="flex items-center justify-center mb-6">
              <div
                className={clsx(
                  'relative flex items-center justify-center',
                  'h-20 w-20 rounded-full',
                  'bg-[var(--success)]/10',
                )}
              >
                {/* Celebration ring pulse */}
                <span
                  className="absolute inset-0 rounded-full animate-ping"
                  style={{
                    backgroundColor: 'var(--success)',
                    opacity: 0.15,
                    animationDuration: '1.5s',
                  }}
                />
                <CheckCircle2
                  className="h-10 w-10 text-[var(--success)]"
                  strokeWidth={2}
                />
              </div>
            </div>

            {/* Copy */}
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">
              You're Approved!
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed max-w-sm mx-auto">
              Your identity has been verified. You now have full access to the
              Fueki Tokenization Platform.
            </p>

            {/* Redirect countdown */}
            <p className="mt-4 text-xs text-[var(--text-muted)]">
              Redirecting to dashboard in a few seconds...
            </p>

            {/* CTA */}
            <button
              onClick={() => navigate('/dashboard')}
              className={clsx(
                'mt-6 w-full flex items-center justify-center gap-2',
                'bg-gradient-to-r from-indigo-600 to-purple-600',
                'hover:from-indigo-500 hover:to-purple-500',
                'text-white font-semibold',
                'rounded-xl px-4 py-3',
                'transition-all duration-200',
                'shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30',
              )}
            >
              Go to Dashboard
            </button>
          </div>
        )}

        {/* ================================================================
            STATE: REJECTED
            ================================================================ */}
        {kycStatus === 'rejected' && (
          <div className="mt-8 text-center">
            {/* Icon */}
            <div className="flex items-center justify-center mb-6">
              <div
                className={clsx(
                  'flex items-center justify-center',
                  'h-20 w-20 rounded-full',
                  'bg-[var(--danger)]/10',
                )}
              >
                <XCircle
                  className="h-10 w-10 text-[var(--danger)]"
                  strokeWidth={2}
                />
              </div>
            </div>

            {/* Copy */}
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">
              Verification Unsuccessful
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed max-w-sm mx-auto">
              Unfortunately, we were unable to verify your identity. Please
              contact support for assistance.
            </p>

            {/* Rejection reason */}
            {rejectionReason && (
              <div
                className={clsx(
                  'mt-5 mx-auto max-w-sm',
                  'bg-[var(--danger)]/5 border border-[var(--danger)]/15',
                  'rounded-xl px-4 py-3 text-left',
                )}
              >
                <p className="text-xs font-medium text-[var(--danger)] mb-1">
                  Reason
                </p>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {rejectionReason}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 space-y-3">
              {/* Contact support */}
              <a
                href="mailto:support@fueki.io"
                className={clsx(
                  'w-full flex items-center justify-center gap-2',
                  'bg-gradient-to-r from-indigo-600 to-purple-600',
                  'hover:from-indigo-500 hover:to-purple-500',
                  'text-white font-semibold',
                  'rounded-xl px-4 py-3',
                  'transition-all duration-200',
                  'shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30',
                )}
              >
                <Mail className="h-[18px] w-[18px]" />
                <span>Contact Support</span>
              </a>

              {/* Try again */}
              <button
                onClick={() => navigate('/signup', { state: { step: 'kyc' } })}
                className={clsx(
                  'w-full flex items-center justify-center gap-2',
                  'bg-[var(--bg-tertiary)] border border-[var(--border-primary)]',
                  'hover:border-[var(--border-hover)] hover:bg-[var(--bg-hover)]',
                  'text-[var(--text-primary)] font-medium',
                  'rounded-xl px-4 py-3',
                  'transition-all duration-200',
                )}
              >
                <RefreshCw className="h-[18px] w-[18px]" />
                <span>Try Again</span>
              </button>

              {/* Sign out */}
              <button
                onClick={handleSignOut}
                className={clsx(
                  'w-full flex items-center justify-center gap-2',
                  'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                  'font-medium text-sm',
                  'rounded-xl px-4 py-2.5',
                  'transition-colors duration-200',
                )}
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}

        {/* ================================================================
            STATE: PENDING (default)
            ================================================================ */}
        {kycStatus !== 'approved' && kycStatus !== 'rejected' && (
          <div className="mt-8 text-center">
            {/* Animated clock icon */}
            <div className="flex items-center justify-center mb-6">
              <div
                className={clsx(
                  'relative flex items-center justify-center',
                  'h-20 w-20 rounded-full',
                  'bg-[var(--warning)]/10',
                )}
              >
                <span
                  className="absolute inset-0 rounded-full"
                  style={{
                    backgroundColor: 'var(--warning)',
                    opacity: 0.08,
                    animation: 'pulseDot 3s ease-in-out infinite',
                  }}
                />
                <Clock
                  className="h-10 w-10 text-[var(--warning)]"
                  strokeWidth={2}
                />
              </div>
            </div>

            {/* Copy */}
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">
              Application Under Review
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed max-w-sm mx-auto">
              Your identity verification is being reviewed by our compliance
              team. This typically takes 1-2 business days.
            </p>

            {/* Email badge */}
            {user?.email && (
              <div className="mt-4 flex justify-center">
                <span
                  className={clsx(
                    'inline-flex items-center gap-1.5',
                    'badge-accent',
                    'rounded-full px-3.5 py-1.5',
                    'text-xs font-medium',
                  )}
                >
                  <Mail className="h-3.5 w-3.5" />
                  {user.email}
                </span>
              </div>
            )}

            {/* Progress bar */}
            <div className="mt-7 mx-auto max-w-xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-[var(--text-muted)]">
                  Verification progress
                </span>
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  {progressPercent}%
                </span>
              </div>
              <div
                className="h-1.5 w-full rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--bg-tertiary)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${progressPercent}%`,
                    background: 'var(--accent-gradient)',
                  }}
                />
              </div>
            </div>

            {/* Status timeline */}
            <div className="mt-7 mx-auto max-w-xs space-y-0">
              {timeline.map((step, idx) => (
                <div key={step.label} className="flex items-start gap-3">
                  {/* Vertical connector + dot */}
                  <div className="flex flex-col items-center">
                    {/* Dot */}
                    {step.status === 'completed' && (
                      <div
                        className="flex items-center justify-center h-6 w-6 rounded-full"
                        style={{ backgroundColor: 'var(--success)' }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                      </div>
                    )}
                    {step.status === 'current' && (
                      <div
                        className={clsx(
                          'relative flex items-center justify-center',
                          'h-6 w-6 rounded-full',
                          'border-2',
                        )}
                        style={{ borderColor: 'var(--accent-primary)' }}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: 'var(--accent-primary)',
                            animation: 'pulseDot 2s ease-in-out infinite',
                          }}
                        />
                      </div>
                    )}
                    {step.status === 'upcoming' && (
                      <div
                        className="h-6 w-6 rounded-full border-2"
                        style={{ borderColor: 'var(--border-primary)' }}
                      />
                    )}

                    {/* Connector line */}
                    {idx < timeline.length - 1 && (
                      <div
                        className="w-px h-5 my-0.5"
                        style={{
                          backgroundColor:
                            step.status === 'completed'
                              ? 'var(--success)'
                              : 'var(--border-primary)',
                        }}
                      />
                    )}
                  </div>

                  {/* Label */}
                  <p
                    className={clsx(
                      'text-sm pt-0.5',
                      step.status === 'completed' && 'text-[var(--text-primary)] font-medium',
                      step.status === 'current' && 'text-[var(--accent-primary)] font-semibold',
                      step.status === 'upcoming' && 'text-[var(--text-muted)]',
                    )}
                  >
                    {step.label}
                  </p>
                </div>
              ))}
            </div>

            {/* Check status button */}
            <button
              onClick={handleCheckStatus}
              disabled={isChecking}
              className={clsx(
                'mt-8 w-full flex items-center justify-center gap-2',
                'bg-gradient-to-r from-indigo-600 to-purple-600',
                'hover:from-indigo-500 hover:to-purple-500',
                'text-white font-semibold',
                'rounded-xl px-4 py-3',
                'transition-all duration-200',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30',
              )}
            >
              <RefreshCw
                className={clsx(
                  'h-[18px] w-[18px]',
                  isChecking && 'animate-spin',
                )}
              />
              <span>{isChecking ? 'Checking...' : 'Check Status'}</span>
            </button>

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              className={clsx(
                'mt-4 w-full flex items-center justify-center gap-2',
                'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                'font-medium text-sm',
                'rounded-xl px-4 py-2.5',
                'transition-colors duration-200',
              )}
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        )}

      </div>

      {/* Security badge */}
      <div className="mt-8 flex items-center justify-center gap-2 text-[var(--text-muted)]">
        <Shield className="h-4 w-4" />
        <span className="text-xs font-medium tracking-wide">
          Your data is encrypted and secure
        </span>
      </div>
    </div>
  );
}
