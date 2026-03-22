import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  FileCheck,
  Filter,
  Loader2,
  Square,
  X,
} from 'lucide-react';
import {
  approveKYC,
  getKYCSubmissions,
  getUserDetail,
  rejectKYC,
} from '../../lib/api/admin';
import type { AdminUser, UserDetail, UserListResponse } from '../../lib/api/admin';
import Badge from '../Common/Badge';
import Spinner from '../Common/Spinner';
import EmptyState from '../Common/EmptyState';
import { CARD_CLASSES } from '../../lib/designTokens';

// ---------------------------------------------------------------------------
// Glass style tokens
// ---------------------------------------------------------------------------

const GLASS = CARD_CLASSES.base;

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

function formatSnakeCaseLabel(value: string | null | undefined, fallback = 'Unknown'): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }
  return value.replace(/_/g, ' ');
}

function isRenderableAdminUser(user: unknown): user is AdminUser {
  if (typeof user !== 'object' || user === null) {
    return false;
  }

  const candidate = user as Record<string, unknown>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.email === 'string' &&
    typeof candidate.kycStatus === 'string' &&
    typeof candidate.createdAt === 'string'
  );
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
  const reasonFieldId =
    confirmVariant === 'approve' ? 'kyc-approve-reason' : 'kyc-reject-reason';

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isLoading) onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, isLoading]);

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
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
                id={reasonFieldId}
                name={reasonFieldId}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter reason for rejection..."
                rows={3}
                aria-label="Rejection reason"
                aria-required="true"
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
                'disabled:opacity-50 disabled:cursor-not-allowed',
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
                'disabled:cursor-not-allowed disabled:opacity-50',
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
          {formatSnakeCaseLabel(kycData.documentType)}
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

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

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
      // Clear selections when data changes
      setSelectedIds(new Set());
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

  // ---- Single action confirm ------------------------------------------------

  const handleConfirm = async (reason: string) => {
    if (!confirmAction) return;
    setIsActionLoading(true);
    try {
      if (confirmAction.type === 'approve') {
        await approveKYC(confirmAction.userId, reason || undefined);
        toast.success(`KYC approved for ${confirmAction.email}`);
      } else {
        await rejectKYC(confirmAction.userId, reason);
        toast.success(`KYC rejected for ${confirmAction.email}`);
      }
      setConfirmAction(null);
      void fetchSubmissions();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action failed';
      toast.error(message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const users = Array.isArray(data?.users)
    ? data.users.filter((user): user is AdminUser => isRenderableAdminUser(user))
    : [];

  // ---- Batch actions --------------------------------------------------------

  const pendingUsers = users.filter((u) => u.kycStatus === 'pending');
  const allPendingSelected =
    pendingUsers.length > 0 && pendingUsers.every((u) => selectedIds.has(u.id));

  const toggleSelectAll = () => {
    if (allPendingSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingUsers.map((u) => u.id)));
    }
  };

  const toggleSelect = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleBatchAction = async (action: 'approve' | 'reject', reason: string) => {
    if (selectedIds.size === 0) return;
    setIsBatchProcessing(true);

    let successCount = 0;
    let failCount = 0;

    const promises = Array.from(selectedIds).map(async (userId) => {
      try {
        if (action === 'approve') {
          await approveKYC(userId, reason || undefined);
        } else {
          await rejectKYC(userId, reason);
        }
        successCount++;
      } catch {
        failCount++;
      }
    });

    await Promise.allSettled(promises);

    if (successCount > 0) {
      toast.success(
        `${action === 'approve' ? 'Approved' : 'Rejected'} ${successCount} submission${successCount === 1 ? '' : 's'}`,
      );
    }
    if (failCount > 0) {
      toast.error(`${failCount} action${failCount === 1 ? '' : 's'} failed`);
    }

    setSelectedIds(new Set());
    setIsBatchProcessing(false);
    void fetchSubmissions();
  };

  // Batch confirm dialog
  const [batchConfirmAction, setBatchConfirmAction] = useState<'approve' | 'reject' | null>(null);

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
    setSelectedIds(new Set());
  };

  return (
    <>
      {/* Filter bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500" aria-hidden="true" />
          <select
            id="kyc-status-filter"
            name="kycStatusFilter"
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value)}
            aria-label="Filter by KYC status"
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

        {/* Batch action buttons */}
        {selectedIds.size > 0 && statusFilter === 'pending' && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-400">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={() => setBatchConfirmAction('approve')}
              disabled={isBatchProcessing}
              className={clsx(
                'flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium transition-colors',
                'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20',
                'border border-emerald-500/20',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {isBatchProcessing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Approve All
            </button>
            <button
              type="button"
              onClick={() => setBatchConfirmAction('reject')}
              disabled={isBatchProcessing}
              className={clsx(
                'flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium transition-colors',
                'bg-red-500/10 text-red-400 hover:bg-red-500/20',
                'border border-red-500/20',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {isBatchProcessing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Reject All
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className={clsx(GLASS, 'mt-6 overflow-hidden')}>
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size="lg" label="Loading KYC submissions" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-16">
            <AlertTriangle className="h-8 w-8 text-amber-400" aria-hidden="true" />
            <p className="text-sm text-gray-400">{error}</p>
            <button
              onClick={() => void fetchSubmissions()}
              className="rounded-xl bg-white/[0.06] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/[0.10]"
            >
              Retry
            </button>
          </div>
        ) : !data || users.length === 0 ? (
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
              <table className="w-full text-sm" role="grid">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {/* Select all checkbox for pending filter */}
                    <th className="w-10 px-4 py-4">
                      {statusFilter === 'pending' && pendingUsers.length > 0 && (
                        <button
                          type="button"
                          onClick={toggleSelectAll}
                          className="rounded p-1 text-gray-500 transition-colors hover:text-white"
                          aria-label={allPendingSelected ? 'Deselect all' : 'Select all'}
                        >
                          {allPendingSelected ? (
                            <CheckSquare className="h-4 w-4 text-indigo-400" aria-hidden="true" />
                          ) : (
                            <Square className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      )}
                    </th>
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
                  {users.map((user: AdminUser) => {
                    const isExpanded = expandedRows.has(user.id);
                    const isSelected = selectedIds.has(user.id);
                    const isPending = user.kycStatus === 'pending';

                    return (
                      <KYCRow
                        key={user.id}
                        user={user}
                        isExpanded={isExpanded}
                        isSelected={isSelected}
                        showCheckbox={statusFilter === 'pending' && isPending}
                        onToggleSelect={() => toggleSelect(user.id)}
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
                    aria-label="Previous page"
                    className={clsx(
                      'rounded-lg p-2 transition-colors',
                      page <= 1
                        ? 'cursor-not-allowed text-gray-600'
                        : 'text-gray-300 hover:bg-white/[0.06]',
                    )}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() =>
                      setPage((p) => Math.min(data.totalPages, p + 1))
                    }
                    disabled={page >= data.totalPages}
                    aria-label="Next page"
                    className={clsx(
                      'rounded-lg p-2 transition-colors',
                      page >= data.totalPages
                        ? 'cursor-not-allowed text-gray-600'
                        : 'text-gray-300 hover:bg-white/[0.06]',
                    )}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Single confirmation dialog */}
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

      {/* Batch confirmation dialog */}
      {batchConfirmAction && (
        <ConfirmDialog
          title={
            batchConfirmAction === 'approve'
              ? `Batch Approve (${selectedIds.size})`
              : `Batch Reject (${selectedIds.size})`
          }
          description={
            batchConfirmAction === 'approve'
              ? `Approve KYC for ${selectedIds.size} selected submission${selectedIds.size === 1 ? '' : 's'}? This will grant them full platform access.`
              : `Reject KYC for ${selectedIds.size} selected submission${selectedIds.size === 1 ? '' : 's'}? They will need to resubmit.`
          }
          confirmLabel={
            batchConfirmAction === 'approve'
              ? `Approve ${selectedIds.size}`
              : `Reject ${selectedIds.size}`
          }
          confirmVariant={batchConfirmAction}
          isLoading={isBatchProcessing}
          showReasonInput={batchConfirmAction === 'reject'}
          onConfirm={(reason) => {
            void handleBatchAction(batchConfirmAction, reason);
            setBatchConfirmAction(null);
          }}
          onCancel={() => setBatchConfirmAction(null)}
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
  isSelected,
  showCheckbox,
  onToggleSelect,
  onToggle,
  onApprove,
  onReject,
}: {
  user: AdminUser;
  isExpanded: boolean;
  isSelected: boolean;
  showCheckbox: boolean;
  onToggleSelect: () => void;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <>
      <tr className={clsx(
        'transition-colors hover:bg-white/[0.02]',
        isSelected && 'bg-indigo-500/[0.04]',
      )}>
        {/* Checkbox */}
        <td className="px-4 py-4">
          {showCheckbox && (
            <button
              type="button"
              onClick={onToggleSelect}
              className="rounded p-1 text-gray-500 transition-colors hover:text-white"
              aria-label={isSelected ? `Deselect ${user.email}` : `Select ${user.email}`}
            >
              {isSelected ? (
                <CheckSquare className="h-4 w-4 text-indigo-400" aria-hidden="true" />
              ) : (
                <Square className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          )}
        </td>
        {/* Expand */}
        <td className="px-4 py-4">
          <button
            onClick={onToggle}
            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-white"
            aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
            aria-expanded={isExpanded}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
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
            {formatSnakeCaseLabel(user.kycStatus)}
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
              aria-label={`View details for ${user.email}`}
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
            </button>
            {user.kycStatus === 'pending' && (
              <>
                <button
                  onClick={onApprove}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors',
                    'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20',
                  )}
                  aria-label={`Approve ${user.email}`}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Approve
                </button>
                <button
                  onClick={onReject}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors',
                    'bg-red-500/10 text-red-400 hover:bg-red-500/20',
                  )}
                  aria-label={`Reject ${user.email}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Reject
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={6} className="bg-white/[0.01] px-6">
            <KYCExpandedDetail userId={user.id} />
          </td>
        </tr>
      )}
    </>
  );
}
