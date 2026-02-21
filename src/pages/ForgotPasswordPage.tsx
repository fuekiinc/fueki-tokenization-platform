import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import {
  Mail,
  ArrowLeft,
  Shield,
  KeyRound,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { forgotPassword } from '../lib/api/auth';
import FuekiBrand from '../components/Brand/FuekiBrand';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Enter a valid email address'),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

// ---------------------------------------------------------------------------
// ForgotPasswordPage
// ---------------------------------------------------------------------------

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    try {
      await forgotPassword(values.email);
      setSubmitted(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to send reset link';
      toast.error(message);
    }
  };

  return (
    <div className="w-full max-w-[460px] mx-auto animate-page-fade-in">
      {/* ------------------------------------------------------------------ */}
      {/* Branding                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="text-center mb-10">
        <FuekiBrand
          variant="full"
          className="justify-center mb-6"
          imageClassName="h-20 w-auto drop-shadow-[0_20px_44px_rgba(8,24,38,0.45)]"
        />
        <p className="mt-2 text-sm text-[var(--text-muted)] tracking-widest uppercase font-medium">
          Tokenization Platform
        </p>
      </div>

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
        {submitted ? (
          /* -------------------------------------------------------------- */
          /* Success state                                                   */
          /* -------------------------------------------------------------- */
          <div className="text-center py-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 mb-6">
              <CheckCircle2 className="h-7 w-7 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-3">
              Check your email
            </h2>
            <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed mb-8">
              Check your email for a reset link. If you don&apos;t see it within
              a few minutes, check your spam folder.
            </p>
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
        ) : (
          /* -------------------------------------------------------------- */
          /* Form state                                                      */
          /* -------------------------------------------------------------- */
          <>
            {/* Heading */}
            <div className="mb-8">
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-indigo-500/10 mb-4">
                <KeyRound className="h-5 w-5 text-indigo-400" />
              </div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">
                Forgot password?
              </h2>
              <p className="mt-2 text-[15px] text-[var(--text-secondary)] leading-relaxed">
                Enter your email address and we&apos;ll send you a link to reset
                your password.
              </p>
            </div>

            {/* Form */}
            <form
              onSubmit={handleSubmit(onSubmit)}
              noValidate
              className="space-y-6"
            >
              {/* Email */}
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="block text-sm font-semibold text-[var(--text-secondary)]"
                >
                  Email address
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                    <Mail className="h-[18px] w-[18px]" />
                  </span>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className={clsx(
                      'w-full rounded-xl bg-[var(--bg-tertiary)] border px-4 py-3.5 pl-12 text-[15px]',
                      'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
                      'outline-none transition-all duration-200',
                      errors.email
                        ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
                        : 'border-[var(--border-primary)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/20',
                    )}
                    {...register('email')}
                  />
                </div>
                {errors.email && (
                  <p className="text-xs font-medium text-red-400 pl-1">
                    {errors.email.message}
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
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Mail className="h-5 w-5" />
                    <span>Send Reset Link</span>
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
          </>
        )}
      </div>

      {/* Security badge */}
      <div className="mt-8 flex items-center justify-center gap-2 text-[var(--text-muted)]">
        <Shield className="h-4 w-4" />
        <span className="text-xs font-medium tracking-wide">
          Secured with end-to-end encryption
        </span>
      </div>
    </div>
  );
}
