import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Calendar,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileCheck,
  Loader2,
  Mail,
  MapPin,
  Shield,
  User,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import {
  approveKYC,
  getUserDetail,
  getUserKycDocument,
  rejectKYC,
  updateUserAccess,
  updateUserRole,
} from '../../lib/api/admin';
import type { AdminKycDocumentKind, UserDetail } from '../../lib/api/admin';
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

function roleBadgeVariant(
  role: string,
): 'success' | 'warning' | 'danger' | 'default' | 'primary' | 'info' {
  switch (role) {
    case 'super_admin':
      return 'danger';
    case 'admin':
      return 'primary';
    default:
      return 'default';
  }
}

function accessBadgeVariant(
  revokedAt: string | null,
): 'success' | 'warning' | 'danger' | 'default' | 'primary' | 'info' {
  return revokedAt ? 'danger' : 'success';
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

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text).then(() => {
    toast.success('Copied to clipboard');
  });
}

function formatDocumentLabel(kind: AdminKycDocumentKind): string {
  switch (kind) {
    case 'front':
      return 'Front Document';
    case 'back':
      return 'Back Document';
    case 'liveVideo':
      return 'Live Verification Video';
  }
}

function createDownloadLink(blobUrl: string, fileName: string) {
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
}

function formatConnectionCount(count: number): string {
  return `${count} ${count === 1 ? 'connection' : 'connections'}`;
}

// ---------------------------------------------------------------------------
// Detail row
// ---------------------------------------------------------------------------

function DetailRow({
  icon: Icon,
  label,
  value,
  copiable,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  copiable?: string;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
          {label}
        </p>
        <div className="mt-1 flex items-center gap-2 text-sm text-white">
          {value}
          {copiable && (
            <button
              type="button"
              onClick={() => copyToClipboard(copiable)}
              className="shrink-0 text-gray-600 transition-colors hover:text-gray-400"
              aria-label={`Copy ${label}`}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KYC Action Panel
// ---------------------------------------------------------------------------

function KYCActionPanel({
  userId,
  kycStatus,
  onActionComplete,
}: {
  userId: string;
  kycStatus: string;
  onActionComplete: () => void;
}) {
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (kycStatus !== 'pending') return null;

  const handleSubmit = async () => {
    if (!action) return;
    setIsSubmitting(true);
    try {
      if (action === 'approve') {
        await approveKYC(userId, reason || undefined);
        toast.success('KYC approved successfully');
      } else {
        if (!reason.trim()) {
          toast.error('Please provide a reason for rejection');
          setIsSubmitting(false);
          return;
        }
        await rejectKYC(userId, reason);
        toast.success('KYC rejected');
      }
      setAction(null);
      setReason('');
      onActionComplete();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action failed';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!action) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          KYC Review Actions
        </h3>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setAction('approve')}
            className={clsx(
              'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3',
              'bg-emerald-500/10 text-sm font-medium text-emerald-400',
              'border border-emerald-500/20 transition-all duration-200',
              'hover:bg-emerald-500/20 hover:border-emerald-500/30',
            )}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Approve KYC
          </button>
          <button
            type="button"
            onClick={() => setAction('reject')}
            className={clsx(
              'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3',
              'bg-red-500/10 text-sm font-medium text-red-400',
              'border border-red-500/20 transition-all duration-200',
              'hover:bg-red-500/20 hover:border-red-500/30',
            )}
          >
            <XCircle className="h-4 w-4" aria-hidden="true" />
            Reject KYC
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
        {action === 'approve' ? 'Approve KYC' : 'Reject KYC'}
      </h3>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <textarea
          id={action === 'approve' ? 'admin-approval-notes' : 'admin-rejection-reason'}
          name={action === 'approve' ? 'adminApprovalNotes' : 'adminRejectionReason'}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            action === 'approve'
              ? 'Optional notes for approval...'
              : 'Reason for rejection (required)...'
          }
          rows={3}
          className={clsx(
            'w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3',
            'text-sm text-white placeholder-gray-500',
            'focus:outline-none focus:ring-1',
            action === 'approve'
              ? 'focus:border-emerald-500/40 focus:ring-emerald-500/20'
              : 'focus:border-red-500/40 focus:ring-red-500/20',
            'resize-none',
          )}
          aria-label={action === 'approve' ? 'Approval notes' : 'Rejection reason'}
        />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setAction(null);
              setReason('');
            }}
            disabled={isSubmitting}
            className={clsx(
              'rounded-xl px-4 py-2.5 text-sm font-medium',
              'bg-white/[0.04] text-gray-300 transition-colors hover:bg-white/[0.08]',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { void handleSubmit(); }}
            disabled={isSubmitting || (action === 'reject' && !reason.trim())}
            className={clsx(
              'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
              action === 'approve'
                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                : 'bg-red-500/20 text-red-400 hover:bg-red-500/30',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {action === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role Management
// ---------------------------------------------------------------------------

function RoleManagement({
  user,
  onUserChanged,
}: {
  user: UserDetail;
  onUserChanged: () => void;
}) {
  const [isRoleUpdating, setIsRoleUpdating] = useState(false);
  const [isAccessUpdating, setIsAccessUpdating] = useState(false);
  const [reason, setReason] = useState(user.accessRevocationReason ?? '');
  const roles = ['user', 'admin', 'super_admin'] as const;
  const isRevoked = Boolean(user.accessRevokedAt);

  useEffect(() => {
    setReason(user.accessRevocationReason ?? '');
  }, [user.accessRevocationReason]);

  const handleRoleChange = async (newRole: string) => {
    if (newRole === user.role) return;
    setIsRoleUpdating(true);
    try {
      await updateUserRole(user.id, newRole);
      toast.success(`Role updated to ${newRole.replace('_', ' ')}`);
      onUserChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update role';
      toast.error(message);
    } finally {
      setIsRoleUpdating(false);
    }
  };

  const handleAccessChange = async (revoked: boolean) => {
    setIsAccessUpdating(true);
    try {
      await updateUserAccess(user.id, revoked, revoked ? reason : undefined);
      toast.success(
        revoked ? 'Platform access revoked successfully' : 'Platform access restored successfully',
      );
      onUserChanged();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to update platform access';
      toast.error(message);
    } finally {
      setIsAccessUpdating(false);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
        Role Management
      </h3>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          {roles.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => { void handleRoleChange(role); }}
              disabled={isRoleUpdating || isAccessUpdating || role === user.role}
              className={clsx(
                'min-w-[96px] flex-1 rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-200',
                'border',
                role === user.role
                  ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400 cursor-default'
                  : 'border-white/[0.06] bg-white/[0.02] text-gray-400 hover:bg-white/[0.06] hover:text-white',
                (isRoleUpdating || isAccessUpdating) && 'opacity-50 cursor-not-allowed',
              )}
              aria-pressed={role === user.role}
            >
              {isRoleUpdating && role !== user.role ? (
                <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                role.replace('_', ' ')
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { void handleAccessChange(!isRevoked); }}
            disabled={isRoleUpdating || isAccessUpdating}
            className={clsx(
              'min-w-[120px] flex-1 rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-200',
              'border',
              isRevoked
                ? 'border-emerald-500/20 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                : 'border-red-500/20 bg-red-500/15 text-red-300 hover:bg-red-500/25',
              (isRoleUpdating || isAccessUpdating) && 'opacity-50 cursor-not-allowed',
            )}
          >
            {isAccessUpdating ? (
              <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              isRevoked ? 'Restore User' : 'Revoke User'
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={accessBadgeVariant(user.accessRevokedAt)} size="sm" dot>
            {isRevoked ? 'revoked' : 'active'}
          </Badge>
          {user.accessRevokedAt && (
            <span className="text-xs text-gray-500">
              Revoked {formatRelativeTime(user.accessRevokedAt)}
            </span>
          )}
        </div>

        {isRevoked ? (
          <p className="text-sm text-gray-300">
            This user is blocked from logging in, refreshing sessions, and accessing authenticated platform routes.
          </p>
        ) : (
          <p className="text-sm text-gray-300">
            Revoke this user to immediately invalidate their sessions and block future authenticated access.
          </p>
        )}

        <textarea
          id="admin-access-reason"
          name="adminAccessReason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Optional admin note for this access change..."
          rows={3}
          className={clsx(
            'w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3',
            'text-sm text-white placeholder-gray-500',
            'focus:border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/20',
            'resize-none',
          )}
          aria-label="Platform access change reason"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Timeline
// ---------------------------------------------------------------------------

function ActivityTimeline({ user }: { user: UserDetail }) {
  // Build timeline entries from the available data
  const events: { label: string; date: string; icon: React.ElementType; variant: string }[] = [];

  events.push({
    label: 'Account created',
    date: user.createdAt,
    icon: User,
    variant: 'text-indigo-400 bg-indigo-500/10',
  });

  if (user.walletAddress) {
    events.push({
      label: 'Wallet connected',
      date: user.updatedAt,
      icon: Wallet,
      variant: 'text-violet-400 bg-violet-500/10',
    });
  }

  if (user.kycData?.submittedAt) {
    events.push({
      label: 'KYC submitted',
      date: user.kycData.submittedAt,
      icon: FileCheck,
      variant: 'text-amber-400 bg-amber-500/10',
    });
  }

  if (user.kycData?.reviewedAt) {
    const isApproved = user.kycStatus === 'approved';
    events.push({
      label: isApproved ? 'KYC approved' : 'KYC rejected',
      date: user.kycData.reviewedAt,
      icon: isApproved ? Check : XCircle,
      variant: isApproved
        ? 'text-emerald-400 bg-emerald-500/10'
        : 'text-red-400 bg-red-500/10',
    });
  }

  // Sort by date descending (most recent first)
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (events.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
        Activity Timeline
      </h3>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2">
        {events.map((event, idx) => {
          const Icon = event.icon;
          return (
            <div
              key={`${event.label}-${event.date}`}
              className={clsx(
                'flex items-center gap-3 py-3',
                idx < events.length - 1 && 'border-b border-white/[0.04]',
              )}
            >
              <div
                className={clsx(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  event.variant,
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white">{event.label}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Clock className="h-3 w-3 text-gray-600" aria-hidden="true" />
                  <p className="text-xs text-gray-500" title={formatDate(event.date)}>
                    {formatRelativeTime(event.date)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KycDocumentActions({
  userId,
  documents,
}: {
  userId: string;
  documents: Array<{
    kind: AdminKycDocumentKind;
    fileName: string;
  }>;
}) {
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const handleDocumentAction = async (
    documentKind: AdminKycDocumentKind,
    fileName: string,
    action: 'preview' | 'download',
  ) => {
    const actionKey = `${documentKind}:${action}`;
    setActiveAction(actionKey);

    try {
      const blob = await getUserKycDocument(userId, documentKind);
      const blobUrl = URL.createObjectURL(blob);

      if (action === 'preview') {
        const previewWindow = window.open(blobUrl, '_blank', 'noopener,noreferrer');

        if (!previewWindow) {
          toast.error('Preview was blocked by your browser');
          URL.revokeObjectURL(blobUrl);
          return;
        }

        window.setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
        }, 60_000);
      } else {
        createDownloadLink(blobUrl, fileName);
        window.setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
        }, 0);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch KYC document';
      toast.error(message);
    } finally {
      setActiveAction(null);
    }
  };

  if (documents.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
        Uploaded Documents
      </h3>
      <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        {documents.map((document) => {
          const previewKey = `${document.kind}:preview`;
          const downloadKey = `${document.kind}:download`;

          return (
            <div
              key={document.kind}
              className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                    {formatDocumentLabel(document.kind)}
                  </p>
                  <p className="mt-1 break-all text-sm text-white">
                    {document.fileName}
                  </p>
                </div>
                <FileCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    void handleDocumentAction(document.kind, document.fileName, 'preview');
                  }}
                  disabled={activeAction !== null}
                  className={clsx(
                    'flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium',
                    'border border-white/[0.06] bg-white/[0.03] text-gray-200 transition-colors hover:bg-white/[0.08]',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  {activeAction === previewKey ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  )}
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleDocumentAction(document.kind, document.fileName, 'download');
                  }}
                  disabled={activeAction !== null}
                  className={clsx(
                    'flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium',
                    'border border-indigo-500/20 bg-indigo-500/10 text-indigo-300 transition-colors hover:bg-indigo-500/20',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  {activeAction === downloadKey ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="h-4 w-4" aria-hidden="true" />
                  )}
                  Download
                </button>
              </div>
            </div>
          );
        })}
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

  // Trap focus within the panel
  useEffect(() => {
    const previousActiveElement = document.activeElement as HTMLElement | null;
    return () => {
      previousActiveElement?.focus();
    };
  }, []);

  const kycDocuments = [
    {
      kind: 'front' as const,
      fileName: user?.kycData?.documentOrigName,
    },
    {
      kind: 'back' as const,
      fileName: user?.kycData?.documentBackOrigName,
    },
    {
      kind: 'liveVideo' as const,
      fileName: user?.kycData?.liveVideoOrigName,
    },
  ].filter(
    (
      document,
    ): document is {
      kind: AdminKycDocumentKind;
      fileName: string;
    } => typeof document.fileName === 'string' && document.fileName.length > 0,
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="User details"
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
            aria-label="Close panel"
            className={clsx(
              'rounded-xl p-2 text-gray-500 transition-all duration-200',
              'hover:bg-white/[0.06] hover:text-white',
            )}
          >
            <X className="h-5 w-5" aria-hidden="true" />
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
              <AlertTriangle className="h-8 w-8 text-amber-400" aria-hidden="true" />
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
                  <DetailRow icon={Mail} label="Email" value={user.email} copiable={user.email} />
                  <DetailRow
                    icon={Shield}
                    label="Role"
                    value={
                      <Badge
                        variant={roleBadgeVariant(user.role)}
                        size="sm"
                      >
                        {user.role.replace('_', ' ')}
                      </Badge>
                    }
                  />
                  <DetailRow
                    icon={AlertTriangle}
                    label="Platform Access"
                    value={
                      <Badge
                        variant={accessBadgeVariant(user.accessRevokedAt)}
                        size="sm"
                        dot
                      >
                        {user.accessRevokedAt ? 'revoked' : 'active'}
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
                    copiable={user.walletAddress ?? undefined}
                    value={
                      user.walletAddress ? (
                        <span className="font-mono text-xs break-all">
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

              {/* Role management */}
              <RoleManagement
                user={user}
                onUserChanged={() => { void fetchUser(); }}
              />

              <div className="space-y-1">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                  Connected Wallets
                </h3>
                <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  {user.walletConnections.length > 0 ? (
                    user.walletConnections.map((connection) => (
                      <div
                        key={connection.walletAddress}
                        className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-all font-mono text-xs text-white">
                              {connection.walletAddress}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {connection.isCurrent && (
                                <Badge variant="primary" size="sm">
                                  current
                                </Badge>
                              )}
                              <Badge variant="default" size="sm">
                                {formatConnectionCount(connection.connectionCount)}
                              </Badge>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(connection.walletAddress)}
                            className="shrink-0 text-gray-600 transition-colors hover:text-gray-400"
                            aria-label={`Copy ${connection.walletAddress}`}
                          >
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                        <div className="mt-4 grid gap-3 text-xs text-gray-400 sm:grid-cols-2">
                          <div>
                            <p className="font-medium uppercase tracking-wider text-gray-500">
                              First Connected
                            </p>
                            <p className="mt-1 text-gray-300">
                              {formatDate(connection.firstConnectedAt)}
                            </p>
                          </div>
                          <div>
                            <p className="font-medium uppercase tracking-wider text-gray-500">
                              Last Seen
                            </p>
                            <p className="mt-1 text-gray-300">
                              {formatDate(connection.lastConnectedAt)}
                            </p>
                            <p className="mt-1 text-[11px] text-gray-500">
                              {formatRelativeTime(connection.lastConnectedAt)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">
                      No linked wallets recorded yet.
                    </p>
                  )}
                </div>
              </div>

              {/* KYC review actions */}
              <KYCActionPanel
                userId={user.id}
                kycStatus={user.kycStatus}
                onActionComplete={() => { void fetchUser(); }}
              />

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
                    {user.kycData.ssn && (
                      <DetailRow
                        icon={Shield}
                        label="SSN"
                        value={user.kycData.ssn}
                      />
                    )}
                    <DetailRow
                      icon={MapPin}
                      label="Location"
                      value={`${user.kycData.city}, ${user.kycData.state}, ${user.kycData.country}`}
                    />
                    {user.kycData.addressLine1 && (
                      <DetailRow
                        icon={MapPin}
                        label="Address"
                        value={
                          <div className="space-y-1">
                            <div>{user.kycData.addressLine1}</div>
                            {user.kycData.addressLine2 && (
                              <div>{user.kycData.addressLine2}</div>
                            )}
                            {user.kycData.zipCode && (
                              <div className="text-gray-300">{user.kycData.zipCode}</div>
                            )}
                          </div>
                        }
                      />
                    )}
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
                        value={
                          <span className="text-gray-300 italic">
                            {user.kycData.reviewNotes}
                          </span>
                        }
                      />
                    )}
                  </div>
                </div>
              )}

              {user.kycData && (
                <KycDocumentActions
                  userId={user.id}
                  documents={kycDocuments}
                />
              )}

              {/* Activity Timeline */}
              <ActivityTimeline user={user} />

              {/* ID */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <p className="text-xs text-gray-500">User ID</p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="break-all font-mono text-xs text-gray-400">
                    {user.id}
                  </p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(user.id)}
                    className="shrink-0 text-gray-600 transition-colors hover:text-gray-400"
                    aria-label="Copy user ID"
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
