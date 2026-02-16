import { useEffect, useState, useCallback } from 'react';
import clsx from 'clsx';
import {
  X,
  Mail,
  Shield,
  Calendar,
  Wallet,
  FileCheck,
  User,
  MapPin,
  AlertTriangle,
} from 'lucide-react';
import { getUserDetail } from '../../lib/api/admin';
import type { UserDetail } from '../../lib/api/admin';
import Badge from '../Common/Badge';
import Spinner from '../Common/Spinner';

// ---------------------------------------------------------------------------
// KYC status badge variant
// ---------------------------------------------------------------------------

function kycBadgeVariant(
  status: string,
): 'success' | 'warning' | 'danger' | 'default' | 'primary' | 'info' {
  switch (status) {
    case 'approved':
      return 'success';
    case 'pending':
      return 'warning';
    case 'rejected':
      return 'danger';
    case 'not_submitted':
      return 'default';
    default:
      return 'default';
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Detail row
// ---------------------------------------------------------------------------

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
          {label}
        </p>
        <div className="mt-1 text-sm text-white">{value}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AdminUserDetailProps {
  userId: string;
  onClose: () => void;
}

export default function AdminUserDetail({
  userId,
  onClose,
}: AdminUserDetailProps) {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getUserDetail(userId);
      setUser(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load user details';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  // Close on escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div
        className={clsx(
          'fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto',
          'border-l border-white/[0.06] bg-[#0D0F14]/95 backdrop-blur-xl',
          'shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5)]',
        )}
      >
        {/* Gradient top border */}
        <div
          className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500"
          aria-hidden="true"
        />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-8 py-6">
          <h2 className="text-lg font-semibold text-white">User Details</h2>
          <button
            onClick={onClose}
            className={clsx(
              'rounded-xl p-2 text-gray-500 transition-all duration-200',
              'hover:bg-white/[0.06] hover:text-white',
            )}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-8 py-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size="lg" label="Loading user details" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-4 py-16">
              <AlertTriangle className="h-8 w-8 text-amber-400" />
              <p className="text-sm text-gray-400">{error}</p>
              <button
                onClick={() => void fetchUser()}
                className="rounded-xl bg-white/[0.06] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/[0.10]"
              >
                Retry
              </button>
            </div>
          ) : user ? (
            <div className="space-y-6">
              {/* Basic info */}
              <div className="space-y-1">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                  Account
                </h3>
                <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.06] bg-white/[0.02] px-4">
                  <DetailRow icon={Mail} label="Email" value={user.email} />
                  <DetailRow
                    icon={Shield}
                    label="Role"
                    value={
                      <Badge
                        variant={
                          user.role === 'super_admin'
                            ? 'danger'
                            : user.role === 'admin'
                              ? 'primary'
                              : 'default'
                        }
                        size="sm"
                      >
                        {user.role.replace('_', ' ')}
                      </Badge>
                    }
                  />
                  <DetailRow
                    icon={FileCheck}
                    label="KYC Status"
                    value={
                      <Badge
                        variant={kycBadgeVariant(user.kycStatus)}
                        size="sm"
                        dot
                      >
                        {user.kycStatus.replace('_', ' ')}
                      </Badge>
                    }
                  />
                  <DetailRow
                    icon={Wallet}
                    label="Wallet"
                    value={
                      user.walletAddress ? (
                        <span className="font-mono text-xs">
                          {user.walletAddress}
                        </span>
                      ) : (
                        <span className="text-gray-500">Not connected</span>
                      )
                    }
                  />
                  <DetailRow
                    icon={Calendar}
                    label="Joined"
                    value={formatDate(user.createdAt)}
                  />
                  <DetailRow
                    icon={Calendar}
                    label="Last Updated"
                    value={formatDate(user.updatedAt)}
                  />
                </div>
              </div>

              {/* KYC data */}
              {user.kycData && (
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                    KYC Information
                  </h3>
                  <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.06] bg-white/[0.02] px-4">
                    <DetailRow
                      icon={User}
                      label="Full Name"
                      value={`${user.kycData.firstName} ${user.kycData.lastName}`}
                    />
                    <DetailRow
                      icon={Calendar}
                      label="Date of Birth"
                      value={user.kycData.dateOfBirth}
                    />
                    <DetailRow
                      icon={MapPin}
                      label="Location"
                      value={`${user.kycData.city}, ${user.kycData.state}, ${user.kycData.country}`}
                    />
                    <DetailRow
                      icon={FileCheck}
                      label="Document Type"
                      value={user.kycData.documentType.replace('_', ' ')}
                    />
                    <DetailRow
                      icon={Calendar}
                      label="Submitted At"
                      value={formatDate(user.kycData.submittedAt)}
                    />
                    {user.kycData.reviewedAt && (
                      <DetailRow
                        icon={Calendar}
                        label="Reviewed At"
                        value={formatDate(user.kycData.reviewedAt)}
                      />
                    )}
                    {user.kycData.reviewNotes && (
                      <DetailRow
                        icon={FileCheck}
                        label="Review Notes"
                        value={user.kycData.reviewNotes}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* ID */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <p className="text-xs text-gray-500">User ID</p>
                <p className="mt-1 break-all font-mono text-xs text-gray-400">
                  {user.id}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
