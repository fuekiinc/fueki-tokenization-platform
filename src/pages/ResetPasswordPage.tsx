import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import {
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  Shield,
  KeyRound,
  CheckCircle2,
  Loader2,
  Fingerprint,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { resetPassword } from '../lib/api/auth';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const resetPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(1, 'Password is required')
      .min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

// ---------------------------------------------------------------------------
// ResetPasswordPage
// ---------------------------------------------------------------------------

export default function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get('token');

  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const onSubmit = async (values: ResetPasswordFormValues) => {
    if (!token) return;

    try {
      await resetPassword(token, values.newPassword);
      setSucceeded(true);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to reset password. The link may be invalid or expired.';
      toast.error(message);
    }
  };

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const renderBranding = () => (
    <div className="text-center mb-10">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 shadow-xl shadow-indigo-500/25 mb-5">
        <Fingerprint className="h-8 w-8 text-white" />
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
  );

  const renderSecurityBadge = () => (
    <div className="mt-8 flex items-center justify-center gap-2 text-[var(--text-muted)]">
      <Shield className="h-4 w-4" />
      <span className="text-xs font-medium tracking-wide">
        Secured with end-to-end encryption
      </span>
    </div>
  );

  // -------------------------------------------------------------------------
  // No token state
  // -------------------------------------------------------------------------

  if (!token) {
    return (
      <div className="w-full max-w-[460px] mx-auto animate-page-fade-in">
        {renderBranding()}

        <div
          className={clsx(
            'bg-[var(--bg-secondary)]/80 backdrop-blur-2xl',
            'border border-[var(--border-primary)]',
            'rounded-3xl shadow-2xl shadow-black/20',
            'p-8 sm:p-10',
          )}
        >
          <div className="text-center py-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 mb-6">
              <AlertTriangle className="h-7 w-7 text-amber-400" />
            </div>
            <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-3">
              Invalid reset link
            </h2>
            <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed mb-8">
              This password reset link is missing or invalid. Please request a
              new one.
            </p>
            <Link
              to="/forgot-password"
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
              <KeyRound className="h-5 w-5" />
              Request New Link
            </Link>
          </div>
        </div>

        {renderSecurityBadge()}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Success state
  // -------------------------------------------------------------------------

  if (succeeded) {
    return (
      <div className="w-full max-w-[460px] mx-auto animate-page-fade-in">
        {renderBranding()}

        <div
          className={clsx(
            'bg-[var(--bg-secondary)]/80 backdrop-blur-2xl',
            'border border-[var(--border-primary)]',
            'rounded-3xl shadow-2xl shadow-black/20',
            'p-8 sm:p-10',
          )}
        >
          <div className="text-center py-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 mb-6">
              <CheckCircle2 className="h-7 w-7 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-3">
              Password reset successful
            </h2>
            <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed mb-8">
              Your password has been updated. You can now sign in with your new
              password.
            </p>
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
              Go to Login
            </Link>
          </div>
        </div>

        {renderSecurityBadge()}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Form state
  // -------------------------------------------------------------------------

  return (
    <div className="w-full max-w-[460px] mx-auto animate-page-fade-in">
      {renderBranding()}

      {/* ------------------------------------------------------------------ */}
      {/* Card                                                                */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={clsx(
          'bg-[var(--bg-secondary)]/80 backdrop-blur-2xl',
          'border border-[var(--border-primary)]',
          'rounded-3xl shadow-2xl shadow-black/20',
          'p-8 sm:p-10',
        )}
      >
        {/* Heading */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-indigo-500/10 mb-4">
            <KeyRound className="h-5 w-5 text-indigo-400" />
          </div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">
            Reset your password
          </h2>
          <p className="mt-2 text-[15px] text-[var(--text-secondary)] leading-relaxed">
            Enter a new password for your account.
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-6"
        >
          {/* New Password */}
          <div className="space-y-2">
            <label
              htmlFor="newPassword"
              className="block text-sm font-semibold text-[var(--text-secondary)]"
            >
              New password
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                <Lock className="h-[18px] w-[18px]" />
              </span>
              <input
                id="newPassword"
                type={showNewPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Enter new password"
                className={clsx(
                  'w-full rounded-xl bg-[var(--bg-tertiary)] border px-4 py-3.5 pl-12 pr-12 text-[15px]',
                  'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
                  'outline-none transition-all duration-200',
                  errors.newPassword
                    ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
                    : 'border-[var(--border-primary)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/20',
                )}
                {...register('newPassword')}
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowNewPassword((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              >
                {showNewPassword ? (
                  <EyeOff className="h-[18px] w-[18px]" />
                ) : (
                  <Eye className="h-[18px] w-[18px]" />
                )}
              </button>
            </div>
            {errors.newPassword && (
              <p className="text-xs font-medium text-red-400 pl-1">
                {errors.newPassword.message}
              </p>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-semibold text-[var(--text-secondary)]"
            >
              Confirm password
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                <Lock className="h-[18px] w-[18px]" />
              </span>
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Confirm new password"
                className={clsx(
                  'w-full rounded-xl bg-[var(--bg-tertiary)] border px-4 py-3.5 pl-12 pr-12 text-[15px]',
                  'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
                  'outline-none transition-all duration-200',
                  errors.confirmPassword
                    ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
                    : 'border-[var(--border-primary)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/20',
                )}
                {...register('confirmPassword')}
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={
                  showConfirmPassword ? 'Hide password' : 'Show password'
                }
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-[18px] w-[18px]" />
                ) : (
                  <Eye className="h-[18px] w-[18px]" />
                )}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-xs font-medium text-red-400 pl-1">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={clsx(
              'w-full flex items-center justify-center gap-2.5',
              'bg-gradient-to-r from-indigo-600 to-purple-600',
              'hover:from-indigo-500 hover:to-purple-500',
              'text-white font-semibold text-[15px]',
              'rounded-xl px-6 py-3.5',
              'transition-all duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30',
              'active:scale-[0.98]',
              'mt-8',
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Resetting...</span>
              </>
            ) : (
              <>
                <KeyRound className="h-5 w-5" />
                <span>Reset Password</span>
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--border-primary)]" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-[var(--bg-secondary)] px-4 text-xs text-[var(--text-muted)] uppercase tracking-wider">
              or
            </span>
          </div>
        </div>

        {/* Back to login link */}
        <Link
          to="/login"
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
          Back to Sign In
        </Link>
      </div>

      {/* Security badge */}
      {renderSecurityBadge()}
    </div>
  );
}
