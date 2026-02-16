import { useEffect, useState, useCallback } from 'react';
import clsx from 'clsx';
import {
  Check,
  X,
  Eye,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  FileCheck,
  Filter,
} from 'lucide-react';
import {
  getKYCSubmissions,
  getUserDetail,
  approveKYC,
  rejectKYC,
} from '../../lib/api/admin';
import type { AdminUser, UserListResponse, UserDetail } from '../../lib/api/admin';
import Badge from '../Common/Badge';
import Spinner from '../Common/Spinner';
import EmptyState from '../Common/EmptyState';

// ---------------------------------------------------------------------------
// Glass style tokens
// ---------------------------------------------------------------------------

const GLASS =
  'bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl';

// ---------------------------------------------------------------------------
// Helpers
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
    default:
      return 'default';
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Confirmation dialog
// ---------------------------------------------------------------------------

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  confirmVariant,
  isLoading,
  showReasonInput,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant: 'approve' | 'reject';
  isLoading: boolean;
  showReasonInput: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className={clsx(
            'w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0D0F14]/95 backdrop-blur-xl',
            'shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5)]',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Gradient top border */}
          <div
            className={clsx(
              'h-[2px]',
              confirmVariant === 'approve'
                ? 'bg-gradient-to-r from-emerald-500 to-green-500'
                : 'bg-gradient-to-r from-red-500 to-orange-500',
            )}
            aria-hidden="true"
          />

          <div className="px-8 py-8">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm text-gray-400">{description}</p>

            {showReasonInput && (
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter reason for rejection..."
                rows={3}
                className={clsx(
                  'mt-4 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3',
                  'text-sm text-white placeholder-gray-500',
                  'focus:border-red-500/40 focus:outline-none focus:ring-1 focus:ring-red-500/20',
                  'resize-none',
                )}
              />
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-white/[0.06] px-8 py-5">
            <button
              onClick={onCancel}
              disabled={isLoading}
              className={clsx(
                'rounded-xl px-4 py-2.5 text-sm font-medium',
                'bg-white/[0.04] text-gray-300 transition-colors hover:bg-white/[0.08]',
              )}
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(reason)}
              disabled={isLoading || (showReasonInput && !reason.trim())}
              className={clsx(
                'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                confirmVariant === 'approve'
                  ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                  : 'bg-red-500/20 text-red-400 hover:bg-red-500/30',
                (isLoading || (showReasonInput && !reason.trim())) &&
                  'cursor-not-allowed opacity-50',
              )}
            >
              {isLoading && <Spinner size="xs" />}
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Expanded KYC details
// ---------------------------------------------------------------------------

function KYCExpandedDetail({ userId }: { userId: string }) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getUserDetail(userId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        // Silently fail -- row is still visible
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner size="sm" label="Loading KYC details" />
      </div>
    );
  }

  if (!detail?.kycData) {
    return (
      <p className="py-4 text-center text-sm text-gray-500">
        No KYC data available.
      </p>
    );
  }

  const { kycData } = detail;

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-3 py-4 sm:grid-cols-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
          Name
        </p>
        <p className="mt-1 text-sm text-white">
          {kycData.firstName} {kycData.lastName}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
          Date of Birth
        </p>
        <p className="mt-1 text-sm text-white">{kycData.dateOfBirth}</p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
          Location
        </p>
        <p className="mt-1 text-sm text-white">
          {kycData.city}, {kycData.state}, {kycData.country}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
          Document Type
        </p>
        <p className="mt-1 text-sm text-white">
          {kycData.documentType.replace('_', ' ')}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
          Submitted
        </p>
        <p className="mt-1 text-sm text-white">
          {formatDate(kycData.submittedAt)}
        </p>
      </div>
      {kycData.reviewNotes && (
        <div className="col-span-2 sm:col-span-3">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Review Notes
          </p>
          <p className="mt-1 text-sm text-white">{kycData.reviewNotes}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminKYCQueue() {
  const [data, setData] = useState<UserListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage] = useState(1);

  // Expanded rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Confirmation dialog
  const [confirmAction, setConfirmAction] = useState<{
    type: 'approve' | 'reject';
    userId: string;
    email: string;
  } | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const fetchSubmissions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getKYCSubmissions({
        page,
        status: statusFilter || undefined,
      });
      setData(result);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to load KYC submissions';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    void fetchSubmissions();
  }, [fetchSubmissions]);

  const toggleRow = (userId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleConfirm = async (reason: string) => {
    if (!confirmAction) return;
    setIsActionLoading(true);
    try {
      if (confirmAction.type === 'approve') {
        await approveKYC(confirmAction.userId, reason || undefined);
      } else {
        await rejectKYC(confirmAction.userId, reason);
      }
      setConfirmAction(null);
      void fetchSubmissions();
    } catch {
      // Error silently handled -- dialog stays open for retry
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  return (
    <>
      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-gray-500" />
        <select
          value={statusFilter}
          onChange={(e) => handleStatusFilterChange(e.target.value)}
          className={clsx(
            'rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5',
            'text-sm text-white',
            'transition-colors focus:border-indigo-500/40 focus:outline-none',
            '[&>option]:bg-[#0D0F14] [&>option]:text-white',
          )}
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </select>
      </div>

      {/* Table */}
      <div className={clsx(GLASS, 'mt-6 overflow-hidden')}>
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size="lg" label="Loading KYC submissions" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-16">
            <AlertTriangle className="h-8 w-8 text-amber-400" />
            <p className="text-sm text-gray-400">{error}</p>
            <button
              onClick={() => void fetchSubmissions()}
              className="rounded-xl bg-white/[0.06] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/[0.10]"
            >
              Retry
            </button>
          </div>
        ) : !data || data.users.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<FileCheck />}
              title="No KYC submissions"
              description={
                statusFilter === 'pending'
                  ? 'There are no pending KYC submissions to review.'
                  : 'No submissions match the selected filter.'
              }
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="w-10 px-4 py-4" />
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                      Email
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                      Submitted
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                      Status
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {data.users.map((user: AdminUser) => {
                    const isExpanded = expandedRows.has(user.id);

                    return (
                      <KYCRow
                        key={user.id}
                        user={user}
                        isExpanded={isExpanded}
                        onToggle={() => toggleRow(user.id)}
                        onApprove={() =>
                          setConfirmAction({
                            type: 'approve',
                            userId: user.id,
                            email: user.email,
                          })
                        }
                        onReject={() =>
                          setConfirmAction({
                            type: 'reject',
                            userId: user.id,
                            email: user.email,
                          })
                        }
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-white/[0.06] px-6 py-4">
                <p className="text-sm text-gray-400">
                  Page {data.page} of {data.totalPages} ({data.total} total)
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className={clsx(
                      'rounded-lg p-2 transition-colors',
                      page <= 1
                        ? 'cursor-not-allowed text-gray-600'
                        : 'text-gray-300 hover:bg-white/[0.06]',
                    )}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() =>
                      setPage((p) => Math.min(data.totalPages, p + 1))
                    }
                    disabled={page >= data.totalPages}
                    className={clsx(
                      'rounded-lg p-2 transition-colors',
                      page >= data.totalPages
                        ? 'cursor-not-allowed text-gray-600'
                        : 'text-gray-300 hover:bg-white/[0.06]',
                    )}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Confirmation dialog */}
      {confirmAction && (
        <ConfirmDialog
          title={
            confirmAction.type === 'approve'
              ? 'Approve KYC'
              : 'Reject KYC'
          }
          description={
            confirmAction.type === 'approve'
              ? `Approve KYC verification for ${confirmAction.email}? This will grant the user full platform access.`
              : `Reject KYC verification for ${confirmAction.email}? The user will need to resubmit.`
          }
          confirmLabel={confirmAction.type === 'approve' ? 'Approve' : 'Reject'}
          confirmVariant={confirmAction.type}
          isLoading={isActionLoading}
          showReasonInput={confirmAction.type === 'reject'}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// KYC Row sub-component
// ---------------------------------------------------------------------------

function KYCRow({
  user,
  isExpanded,
  onToggle,
  onApprove,
  onReject,
}: {
  user: AdminUser;
  isExpanded: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <>
      <tr className="transition-colors hover:bg-white/[0.02]">
        <td className="px-4 py-4">
          <button
            onClick={onToggle}
            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </td>
        <td className="whitespace-nowrap px-6 py-4 font-medium text-white">
          {user.email}
        </td>
        <td className="whitespace-nowrap px-6 py-4 text-gray-400">
          {formatDate(user.createdAt)}
        </td>
        <td className="whitespace-nowrap px-6 py-4">
          <Badge variant={kycBadgeVariant(user.kycStatus)} size="sm" dot>
            {user.kycStatus.replace('_', ' ')}
          </Badge>
        </td>
        <td className="whitespace-nowrap px-6 py-4">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onToggle}
              className={clsx(
                'rounded-lg p-2 text-gray-400 transition-colors',
                'hover:bg-white/[0.06] hover:text-white',
              )}
              title="View details"
            >
              <Eye className="h-4 w-4" />
            </button>
            {user.kycStatus === 'pending' && (
              <>
                <button
                  onClick={onApprove}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors',
                    'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20',
                  )}
                >
                  <Check className="h-3.5 w-3.5" />
                  Approve
                </button>
                <button
                  onClick={onReject}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors',
                    'bg-red-500/10 text-red-400 hover:bg-red-500/20',
                  )}
                >
                  <X className="h-3.5 w-3.5" />
                  Reject
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={5} className="bg-white/[0.01] px-6">
            <KYCExpandedDetail userId={user.id} />
          </td>
        </tr>
      )}
    </>
  );
}
