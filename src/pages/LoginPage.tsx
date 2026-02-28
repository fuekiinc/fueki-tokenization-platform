import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  Mail,
  Shield,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
import FuekiBrand from '../components/Brand/FuekiBrand';
import { isContractDeploymentOnlyPlan } from '../lib/subscriptionPlans';
import type { LoginFormValues } from '../types/auth';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters'),
  rememberMe: z.boolean(),
});

// ---------------------------------------------------------------------------
// LoginPage
// ---------------------------------------------------------------------------

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: true },
  });

  const onSubmit = async (values: LoginFormValues) => {
    try {
      await login(values);

      const user = useAuthStore.getState().user;

      if (user?.kycStatus === 'approved') {
        navigate(
          isContractDeploymentOnlyPlan(user.subscriptionPlan)
            ? '/contracts'
            : '/dashboard',
        );
      } else if (user?.kycStatus === 'pending') {
        navigate('/pending-approval');
      } else {
        navigate('/signup', { state: { step: 'kyc' } });
      }

      toast.success('Welcome back!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
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
        {/* Heading */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">
            Welcome back
          </h2>
          <p className="mt-2 text-[15px] text-[var(--text-secondary)] leading-relaxed">
            Sign in to your account to continue
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
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

          {/* Password */}
          <div className="space-y-2">
            <label
              htmlFor="password"
              className="block text-sm font-semibold text-[var(--text-secondary)]"
            >
              Password
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                <Lock className="h-[18px] w-[18px]" />
              </span>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                className={clsx(
                  'w-full rounded-xl bg-[var(--bg-tertiary)] border px-4 py-3.5 pl-12 pr-12 text-[15px]',
                  'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
                  'outline-none transition-all duration-200',
                  errors.password
                    ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
                    : 'border-[var(--border-primary)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/20',
                )}
                {...register('password')}
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="h-[18px] w-[18px]" />
                ) : (
                  <Eye className="h-[18px] w-[18px]" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs font-medium text-red-400 pl-1">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Remember me + Forgot password row */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                id="rememberMe"
                className={clsx(
                  'h-4 w-4 rounded border-[var(--border-primary)] bg-[var(--bg-tertiary)]',
                  'text-indigo-600 focus:ring-2 focus:ring-indigo-500/20 focus:ring-offset-0',
                  'transition-colors duration-150',
                )}
                {...register('rememberMe')}
              />
              <span className="text-sm text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors">
                Remember me
              </span>
            </label>
            <Link
              to="/forgot-password"
              className="text-sm font-medium text-[var(--accent-primary)] hover:text-indigo-300 transition-colors duration-150"
            >
              Forgot password?
            </Link>
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
              'focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-secondary)]',
              'active:scale-[0.98]',
              'mt-4',
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <LogIn className="h-5 w-5" />
                <span>Sign In</span>
                <ArrowRight className="h-4 w-4 ml-1" />
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
              New here?
            </span>
          </div>
        </div>

        {/* Sign up link */}
        <Link
          to="/signup"
          className={clsx(
            'w-full flex items-center justify-center gap-2',
            'bg-[var(--bg-tertiary)] border border-[var(--border-primary)]',
            'hover:border-[var(--border-hover)] hover:bg-[var(--bg-tertiary)]/80',
            'text-[var(--text-primary)] font-semibold text-[15px]',
            'rounded-xl px-6 py-3.5',
            'transition-all duration-200',
          )}
        >
          Create an account
          <ArrowRight className="h-4 w-4" />
        </Link>
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
