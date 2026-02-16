import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  User,
  Shield,
  Palette,
  AlertTriangle,
  Copy,
  Check,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Wallet,
  Calendar,
  Loader2,
  Sun,
  Moon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../hooks/useTheme';
import apiClient from '../lib/api/client';
import { formatAddress, copyToClipboard } from '../lib/utils/helpers';
import type { KYCStatus } from '../types/auth';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters'),
    confirmNewPassword: z
      .string()
      .min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'Passwords do not match',
    path: ['confirmNewPassword'],
  });

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CARD =
  'bg-[var(--bg-secondary)]/80 backdrop-blur-xl border border-[var(--border-primary)] rounded-2xl p-6';

const KYC_STATUS_CONFIG: Record<
  KYCStatus,
  { label: string; dotColor: string; bgColor: string; textColor: string }
> = {
  approved: {
    label: 'Approved',
    dotColor: 'bg-emerald-500',
    bgColor: 'bg-emerald-500/10',
    textColor: 'text-emerald-400',
  },
  pending: {
    label: 'Pending Review',
    dotColor: 'bg-yellow-500',
    bgColor: 'bg-yellow-500/10',
    textColor: 'text-yellow-400',
  },
  rejected: {
    label: 'Rejected',
    dotColor: 'bg-red-500',
    bgColor: 'bg-red-500/10',
    textColor: 'text-red-400',
  },
  not_submitted: {
    label: 'Not Submitted',
    dotColor: 'bg-gray-500',
    bgColor: 'bg-gray-500/10',
    textColor: 'text-gray-400',
  },
};

// ---------------------------------------------------------------------------
// KYC Status Badge
// ---------------------------------------------------------------------------

function KYCBadge({ status }: { status: KYCStatus }) {
  const config = KYC_STATUS_CONFIG[status];

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold',
        config.bgColor,
        config.textColor,
      )}
    >
      <span className={clsx('h-2 w-2 rounded-full', config.dotColor)} />
      {config.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Section Header
// ---------------------------------------------------------------------------

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6 flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-primary)]/10">
        <Icon className="h-5 w-5 text-[var(--accent-primary)]" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          {description}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile Section
// ---------------------------------------------------------------------------

function ProfileSection() {
  const user = useAuthStore((s) => s.user);
  const [copied, setCopied] = useState(false);

  const handleCopyWallet = useCallback(async () => {
    if (!user?.walletAddress) return;
    try {
      await copyToClipboard(user.walletAddress);
      setCopied(true);
      toast.success('Wallet address copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy address');
    }
  }, [user?.walletAddress]);

  if (!user) return null;

  const createdDate = new Date(user.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className={CARD}>
      <SectionHeader
        icon={User}
        title="Profile Information"
        description="Your account details and verification status"
      />

      <div className="space-y-5">
        {/* Email */}
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Mail className="h-4 w-4" />
            <span>Email</span>
          </div>
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {user.email}
          </span>
        </div>

        <div className="h-px bg-[var(--border-primary)]" />

        {/* KYC Status */}
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Shield className="h-4 w-4" />
            <span>KYC Status</span>
          </div>
          <KYCBadge status={user.kycStatus} />
        </div>

        <div className="h-px bg-[var(--border-primary)]" />

        {/* Account Created */}
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Calendar className="h-4 w-4" />
            <span>Account created</span>
          </div>
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {createdDate}
          </span>
        </div>

        <div className="h-px bg-[var(--border-primary)]" />

        {/* Wallet Address */}
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Wallet className="h-4 w-4" />
            <span>Wallet</span>
          </div>
          {user.walletAddress ? (
            <button
              onClick={() => void handleCopyWallet()}
              className={clsx(
                'group inline-flex items-center gap-2 rounded-lg px-3 py-1.5',
                'bg-[var(--bg-tertiary)] border border-[var(--border-primary)]',
                'hover:border-[var(--border-hover)] transition-all duration-200',
              )}
            >
              <span className="text-sm font-mono font-medium text-[var(--text-primary)]">
                {formatAddress(user.walletAddress)}
              </span>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors" />
              )}
            </button>
          ) : (
            <span className="text-sm text-[var(--text-muted)] italic">
              Not connected
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Security Section (Change Password)
// ---------------------------------------------------------------------------

function SecuritySection() {
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    },
  });

  const onSubmit = async (values: ChangePasswordValues) => {
    try {
      await apiClient.put('/api/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      toast.success('Password changed successfully');
      reset();
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    } catch (err: unknown) {
      let message = 'Failed to change password';
      if (
        err !== null &&
        typeof err === 'object' &&
        'response' in err
      ) {
        const axiosErr = err as { response?: { data?: { error?: { message?: string }; message?: string } } };
        message =
          axiosErr.response?.data?.error?.message ??
          axiosErr.response?.data?.message ??
          message;
      }
      toast.error(message);
    }
  };

  const inputBase = (hasError: boolean) =>
    clsx(
      'w-full rounded-xl bg-[var(--bg-tertiary)] border px-4 py-3.5 pl-12 pr-12 text-[15px]',
      'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
      'outline-none transition-all duration-200',
      hasError
        ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
        : 'border-[var(--border-primary)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/20',
    );

  return (
    <div className={CARD}>
      <SectionHeader
        icon={Shield}
        title="Security"
        description="Update your password to keep your account secure"
      />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {/* Current Password */}
        <div className="space-y-2">
          <label
            htmlFor="currentPassword"
            className="block text-sm font-semibold text-[var(--text-secondary)]"
          >
            Current password
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              <Lock className="h-[18px] w-[18px]" />
            </span>
            <input
              id="currentPassword"
              type={showCurrentPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter current password"
              className={inputBase(!!errors.currentPassword)}
              {...register('currentPassword')}
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowCurrentPassword((v) => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            >
              {showCurrentPassword ? (
                <EyeOff className="h-[18px] w-[18px]" />
              ) : (
                <Eye className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>
          {errors.currentPassword && (
            <p className="text-xs font-medium text-red-400 pl-1">
              {errors.currentPassword.message}
            </p>
          )}
        </div>

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
              className={inputBase(!!errors.newPassword)}
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

        {/* Confirm New Password */}
        <div className="space-y-2">
          <label
            htmlFor="confirmNewPassword"
            className="block text-sm font-semibold text-[var(--text-secondary)]"
          >
            Confirm new password
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              <Lock className="h-[18px] w-[18px]" />
            </span>
            <input
              id="confirmNewPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Confirm new password"
              className={inputBase(!!errors.confirmNewPassword)}
              {...register('confirmNewPassword')}
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
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
          {errors.confirmNewPassword && (
            <p className="text-xs font-medium text-red-400 pl-1">
              {errors.confirmNewPassword.message}
            </p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className={clsx(
            'flex items-center justify-center gap-2.5',
            'bg-gradient-to-r from-indigo-600 to-purple-600',
            'hover:from-indigo-500 hover:to-purple-500',
            'text-white font-semibold text-sm',
            'rounded-xl px-6 py-3',
            'transition-all duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30',
            'active:scale-[0.98]',
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Updating...</span>
            </>
          ) : (
            <>
              <Lock className="h-4 w-4" />
              <span>Update Password</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preferences Section (Theme Toggle)
// ---------------------------------------------------------------------------

function PreferencesSection() {
  const { theme, toggleTheme, isDark } = useTheme();

  return (
    <div className={CARD}>
      <SectionHeader
        icon={Palette}
        title="Preferences"
        description="Customize the look and feel of the platform"
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isDark ? (
            <Moon className="h-5 w-5 text-[var(--text-muted)]" />
          ) : (
            <Sun className="h-5 w-5 text-[var(--text-muted)]" />
          )}
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Theme
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Currently using {theme} mode
            </p>
          </div>
        </div>

        {/* Toggle Switch */}
        <button
          type="button"
          role="switch"
          aria-checked={isDark}
          aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
          onClick={toggleTheme}
          className={clsx(
            'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full',
            'transition-colors duration-200 ease-in-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]',
            isDark
              ? 'bg-indigo-600'
              : 'bg-gray-300',
          )}
        >
          <span
            className={clsx(
              'pointer-events-none inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm',
              'transform transition-transform duration-200 ease-in-out',
              isDark ? 'translate-x-6' : 'translate-x-1',
            )}
          >
            {isDark ? (
              <Moon className="h-3 w-3 text-indigo-600" />
            ) : (
              <Sun className="h-3 w-3 text-amber-500" />
            )}
          </span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Danger Zone Section
// ---------------------------------------------------------------------------

function DangerZoneSection() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogoutAll = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      await apiClient.post('/api/auth/logout-all', {});
      toast.success('Signed out of all devices');
    } catch {
      toast.error('Failed to sign out of all devices');
    } finally {
      setIsLoggingOut(false);
    }
  }, []);

  return (
    <div
      className={clsx(
        'rounded-2xl border border-red-500/30 bg-red-500/5 p-6',
        'backdrop-blur-xl',
      )}
    >
      <SectionHeader
        icon={AlertTriangle}
        title="Danger Zone"
        description="Irreversible actions that affect your account security"
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Sign out of all devices
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            This will invalidate all active sessions across every device.
          </p>
        </div>
        <button
          type="button"
          disabled={isLoggingOut}
          onClick={() => void handleLogoutAll()}
          className={clsx(
            'flex shrink-0 items-center justify-center gap-2',
            'rounded-xl border border-red-500/40 px-5 py-2.5',
            'bg-red-500/10 text-red-400 text-sm font-semibold',
            'hover:bg-red-500/20 hover:border-red-500/60',
            'transition-all duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'active:scale-[0.98]',
          )}
        >
          {isLoggingOut ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Signing out...</span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4" />
              <span>Sign Out All Devices</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsPage
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  return (
    <div className="w-full">
      {/* Page Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
          Settings
        </h1>
        <p className="mt-2 text-base text-[var(--text-muted)]">
          Manage your account, security, and preferences
        </p>
        <div className="mt-8 h-px bg-gradient-to-r from-transparent via-[var(--border-primary)] to-transparent" />
      </div>

      {/* Sections */}
      <div className="space-y-8">
        <ProfileSection />
        <SecuritySection />
        <PreferencesSection />
        <DangerZoneSection />
      </div>
    </div>
  );
}
