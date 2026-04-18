import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  Users,
} from 'lucide-react';
import { getUsers, updateUserRole } from '../../lib/api/admin';
import type { AdminUser, UserListResponse } from '../../lib/api/admin';
import Badge from '../Common/Badge';
import Spinner from '../Common/Spinner';
import EmptyState from '../Common/EmptyState';
import AdminUserDetail from './AdminUserDetail';
import { CARD_CLASSES } from '../../lib/designTokens';

// ---------------------------------------------------------------------------
// Glass style tokens (from design system)
// ---------------------------------------------------------------------------

const GLASS = CARD_CLASSES.base;

// ---------------------------------------------------------------------------
// KYC status badge variant mapping
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

function formatAddress(addr: string | null): string {
  if (!addr) return '--';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatWalletConnectionCount(count: number): string {
  if (count <= 0) {
    return 'No linked wallets';
  }

  return `${count} linked ${count === 1 ? 'wallet' : 'wallets'}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function isRenderableAdminUser(user: unknown): user is AdminUser {
  if (typeof user !== 'object' || user === null) {
    return false;
  }

  const candidate = user as Record<string, unknown>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.email === 'string' &&
    typeof candidate.role === 'string' &&
    typeof candidate.kycStatus === 'string' &&
    typeof candidate.createdAt === 'string'
  );
}

// ---------------------------------------------------------------------------
// Role dropdown
// ---------------------------------------------------------------------------

function RoleDropdown({
  currentRole,
  userId,
  onRoleChanged,
}: {
  currentRole: string;
  userId: string;
  onRoleChanged: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const roles = ['user', 'admin', 'super_admin'];

  async function handleRoleChange(newRole: string) {
    if (newRole === currentRole) {
      setIsOpen(false);
      return;
    }
    setIsUpdating(true);
    try {
      await updateUserRole(userId, newRole);
      toast.success(`Role updated to ${newRole.replace('_', ' ')}`);
      onRoleChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update role';
      toast.error(message);
    } finally {
      setIsUpdating(false);
      setIsOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        disabled={isUpdating}
        className={clsx(
          'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
          'bg-white/[0.04] text-gray-300 hover:bg-white/[0.08]',
          'border border-white/[0.06]',
          isUpdating && 'opacity-50',
        )}
      >
        {isUpdating ? (
          <Spinner size="xs" />
        ) : (
          currentRole.replace('_', ' ')
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop to close dropdown */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div
            className={clsx(
              'absolute right-0 top-full z-20 mt-1 min-w-[120px]',
              'rounded-xl border border-white/[0.08] bg-[#0D0F14] p-1',
              'shadow-xl shadow-black/40',
            )}
          >
            {roles.map((role) => (
              <button
                key={role}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleRoleChange(role);
                }}
                className={clsx(
                  'flex w-full items-center rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                  role === currentRole
                    ? 'bg-indigo-500/10 text-indigo-400'
                    : 'text-gray-300 hover:bg-white/[0.06]',
                )}
              >
                {role.replace('_', ' ')}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminUserTable() {
  const [data, setData] = useState<UserListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [kycFilter, setKycFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 15;

  // User detail
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getUsers({
        page,
        limit,
        search: debouncedSearch || undefined,
        role: roleFilter || undefined,
        kycStatus: kycFilter || undefined,
      });
      setData(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load users';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch, roleFilter, kycFilter]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const handleRoleFilterChange = (value: string) => {
    setRoleFilter(value);
    setPage(1);
  };

  const handleKycFilterChange = (value: string) => {
    setKycFilter(value);
    setPage(1);
  };

  const users = Array.isArray(data?.users)
    ? data.users.filter((user): user is AdminUser => isRenderableAdminUser(user))
    : [];

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
          <input
            id="admin-user-search"
            name="adminUserSearch"
            type="search"
            placeholder="Search by email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search users by email"
            className={clsx(
              'w-full rounded-xl border border-white/[0.06] bg-white/[0.03] py-2.5 pl-10 pr-4',
              'text-sm text-white placeholder-gray-500',
              'transition-colors focus:border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/20',
            )}
          />
        </div>

        {/* Role filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500" aria-hidden="true" />
          <select
            id="admin-role-filter"
            name="adminRoleFilter"
            value={roleFilter}
            onChange={(e) => handleRoleFilterChange(e.target.value)}
            aria-label="Filter by role"
            className={clsx(
              'rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5',
              'text-sm text-white',
              'transition-colors focus:border-indigo-500/40 focus:outline-none',
              '[&>option]:bg-[#0D0F14] [&>option]:text-white',
            )}
          >
            <option value="">All Roles</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>

        {/* KYC filter */}
        <select
          id="admin-kyc-filter"
          name="adminKycFilter"
          value={kycFilter}
          onChange={(e) => handleKycFilterChange(e.target.value)}
          aria-label="Filter by KYC status"
          className={clsx(
            'rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5',
            'text-sm text-white',
            'transition-colors focus:border-indigo-500/40 focus:outline-none',
            '[&>option]:bg-[#0D0F14] [&>option]:text-white',
          )}
        >
          <option value="">All KYC</option>
          <option value="not_submitted">Not Submitted</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Table */}
      <div className={clsx(GLASS, 'mt-6 overflow-hidden')}>
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size="lg" label="Loading users" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-16">
            <AlertTriangle className="h-8 w-8 text-amber-400" aria-hidden="true" />
            <p className="text-sm text-gray-400">{error}</p>
            <button
              onClick={() => void fetchUsers()}
              className="rounded-xl bg-white/[0.06] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/[0.10]"
            >
              Retry
            </button>
          </div>
        ) : !data || users.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Users />}
              title="No users found"
              description="Try adjusting your search or filter criteria."
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                      Email
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                      Role
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                      KYC Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                      Wallets
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                      Joined
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {users.map((user: AdminUser) => (
                    <tr
                      key={user.id}
                      onClick={() => setSelectedUserId(user.id)}
                      className="cursor-pointer transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="whitespace-nowrap px-6 py-4 font-medium text-white">
                        <div className="space-y-1">
                          <div>{user.email}</div>
                          <Badge variant={accessBadgeVariant(user.accessRevokedAt)} size="sm" dot>
                            {user.accessRevokedAt ? 'access revoked' : 'active'}
                          </Badge>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <Badge variant={roleBadgeVariant(user.role)} size="sm">
                          {user.role.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <Badge
                          variant={kycBadgeVariant(user.kycStatus)}
                          size="sm"
                          dot
                        >
                          {user.kycStatus.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="space-y-1">
                          <div className="font-mono text-xs text-gray-400">
                            {formatAddress(user.walletAddress)}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {formatWalletConnectionCount(user.walletConnectionCount)}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-gray-400">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <RoleDropdown
                          currentRole={user.role}
                          userId={user.id}
                          onRoleChanged={() => void fetchUsers()}
                        />
                      </td>
                    </tr>
                  ))}
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

      {/* User detail modal */}
      {selectedUserId && (
        <AdminUserDetail
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
        />
      )}
    </>
  );
}
