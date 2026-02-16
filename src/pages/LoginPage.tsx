import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  ArrowRight,
  Shield,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
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
});

// ---------------------------------------------------------------------------
// Style tokens
// ---------------------------------------------------------------------------

const INPUT_BASE = clsx(
  'w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)]',
  'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
  'rounded-xl px-4 py-3 pl-11',
  'outline-none transition-all duration-200',
  'focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]',
);

const ICON_LEFT =
  'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-[var(--text-muted)]';

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
    defaultValues: { email: '', password: '' },
  });

  // ---- Submit handler -----------------------------------------------------

  const onSubmit = async (values: LoginFormValues) => {
    try {
      await login(values);

      const user = useAuthStore.getState().user;

      if (user?.kycStatus === 'approved') {
        navigate('/dashboard');
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

  // ---- Render -------------------------------------------------------------

  return (
    <div className="gradient-bg-subtle min-h-screen flex items-center justify-center px-4 py-12">
      {/* Card */}
      <div
        className={clsx(
          'w-full max-w-md',
          'bg-[var(--bg-secondary)]/80 backdrop-blur-xl',
          'border border-[var(--border-primary)]',
          'rounded-2xl shadow-2xl',
          'p-8 sm:p-10',
        )}
      >
        {/* ---- Branding -------------------------------------------------- */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Fueki
            </span>
          </h1>
          <p className="mt-1.5 text-sm text-[var(--text-muted)] tracking-wide">
            Tokenization Platform
          </p>
        </div>

        {/* ---- Heading --------------------------------------------------- */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            Welcome back
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Sign in to your account to continue
          </p>
        </div>

        {/* ---- Form ------------------------------------------------------ */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
            >
              Email address
            </label>
            <div className="relative">
              <Mail className={ICON_LEFT} />
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className={clsx(INPUT_BASE, errors.email && 'border-[var(--danger)]')}
                {...register('email')}
              />
            </div>
            {errors.email && (
              <p className="mt-1.5 text-xs text-[var(--danger)]">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <Lock className={ICON_LEFT} />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                className={clsx(
                  INPUT_BASE,
                  'pr-11',
                  errors.password && 'border-[var(--danger)]',
                )}
                {...register('password')}
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((v) => !v)}
                className={clsx(
                  'absolute right-3 top-1/2 -translate-y-1/2',
                  'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                  'transition-colors duration-150',
                )}
              >
                {showPassword ? (
                  <EyeOff className="h-[18px] w-[18px]" />
                ) : (
                  <Eye className="h-[18px] w-[18px]" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1.5 text-xs text-[var(--danger)]">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={clsx(
              'w-full flex items-center justify-center gap-2',
              'bg-gradient-to-r from-indigo-600 to-purple-600',
              'hover:from-indigo-500 hover:to-purple-500',
              'text-white font-semibold',
              'rounded-xl px-4 py-3',
              'transition-all duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30',
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-[18px] w-[18px] animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <LogIn className="h-[18px] w-[18px]" />
                <span>Sign In</span>
                <ArrowRight className="h-4 w-4 ml-0.5" />
              </>
            )}
          </button>
        </form>

        {/* ---- Footer link ----------------------------------------------- */}
        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          Don&apos;t have an account?{' '}
          <Link
            to="/signup"
            className="font-medium text-[var(--accent-primary)] hover:text-indigo-300 transition-colors duration-150"
          >
            Sign up
          </Link>
        </p>

        {/* ---- Security badge -------------------------------------------- */}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-[var(--text-muted)]">
          <Shield className="h-3.5 w-3.5" />
          <span className="text-xs">Secured with end-to-end encryption</span>
        </div>
      </div>
    </div>
  );
}
