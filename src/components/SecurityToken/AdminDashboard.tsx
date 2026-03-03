/**
 * AdminDashboard -- Role-gated administration panels for a security token.
 *
 * Renders collapsible panels for each admin role. Each panel is only shown
 * if the connected wallet has the corresponding role on-chain.
 *
 * Panels:
 *   CONTRACT ADMIN  -- Pause, Snapshot, Upgrade Rules, Grant/Revoke Roles
 *   RESERVE ADMIN   -- Mint, Burn
 *   WALLETS ADMIN   -- Transfer Groups, Max Balance, Freeze, Batch Permissions
 *   TRANSFER ADMIN  -- Allow Group Transfer, Group Matrix Viewer
 */

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ethers } from 'ethers';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  ArrowRightLeft,
  ArrowUpCircle,
  Camera,
  CheckCircle2,
  ChevronDown,
  Clock,
  Coins,
  Flame,
  Layers,
  Lock,
  Pause,
  Play,
  Shield,
  ShieldCheck,
  Snowflake,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  ALL_ROLES,
  ROLE_CONTRACT_ADMIN,
  ROLE_LABELS,
  ROLE_RESERVE_ADMIN,
  ROLE_TRANSFER_ADMIN,
  ROLE_WALLETS_ADMIN,
  SecurityTokenABI,
} from '../../contracts/abis/SecurityToken';
import { getProvider, useWalletStore } from '../../store/walletStore';
import { getReadOnlyProvider, parseContractError } from '../../lib/blockchain/contracts';
import { useTransactionFlow } from '../Common/TransactionFlow';
import Card from '../Common/Card';
import Badge from '../Common/Badge';
import Spinner from '../Common/Spinner';
import { INPUT_CLASSES } from '../../lib/designTokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminDashboardProps {
  tokenAddress: string;
}

interface UserRoles {
  [role: number]: boolean;
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const INPUT_STYLE = INPUT_CLASSES.light;

const BUTTON_PRIMARY = clsx(
  'inline-flex items-center justify-center gap-2',
  'rounded-xl px-6 py-3 text-sm font-medium text-white',
  'bg-indigo-600 hover:bg-indigo-500',
  'transition-all duration-200',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60',
  'disabled:opacity-50 disabled:cursor-not-allowed',
);

const BUTTON_DANGER = clsx(
  'inline-flex items-center justify-center gap-2',
  'rounded-xl px-6 py-3 text-sm font-medium text-white',
  'bg-red-600 hover:bg-red-500',
  'transition-all duration-200',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60',
  'disabled:opacity-50 disabled:cursor-not-allowed',
);

const SECTION_LABEL = 'text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3';

// ---------------------------------------------------------------------------
// Collapsible Panel wrapper
// ---------------------------------------------------------------------------

function AdminPanel({
  title,
  icon: Icon,
  roleName,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ElementType;
  roleName: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card padding="none" className="overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex items-center justify-between w-full px-7 py-5',
          'hover:bg-white/[0.02] transition-colors duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500/60',
        )}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/[0.08]">
            <Icon className="h-[18px] w-[18px] text-indigo-400" aria-hidden="true" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <p className="text-xs text-gray-500">{roleName}</p>
          </div>
        </div>
        <ChevronDown
          className={clsx(
            'h-4 w-4 text-gray-400 transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div className="border-t border-white/[0.04] px-7 py-6 space-y-8">
          {children}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared form helpers
// ---------------------------------------------------------------------------

function useFormField(initial: string = '') {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const reset = useCallback(() => {
    setValue(initial);
    setError('');
  }, [initial]);
  return { value, setValue, error, setError, reset };
}

function FieldLabel({ htmlFor, children, required }: { htmlFor: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className={INPUT_CLASSES.label}>
      {children}
      {required && <span className="text-red-400 ml-1">*</span>}
    </label>
  );
}

function FieldError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="text-xs text-red-400 flex items-center gap-1.5 mt-1.5" role="alert">
      <span className="h-1 w-1 rounded-full bg-red-400 shrink-0" />
      {message}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AdminDashboard({ tokenAddress }: AdminDashboardProps) {
  const [userRoles, setUserRoles] = useState<UserRoles>({});
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [snapshotId, setSnapshotId] = useState('0');

  const walletAddress = useWalletStore((s) => s.wallet.address);
  const { showTransactionFlow, TransactionFlowModal } = useTransactionFlow();

  // -----------------------------------------------------------------------
  // Fetch roles + token state
  // -----------------------------------------------------------------------

  const fetchRolesAndState = useCallback(async () => {
    const { chainId } = useWalletStore.getState().wallet;
    if (!chainId || !walletAddress || !tokenAddress) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const readProvider = getReadOnlyProvider(chainId);
      const contract = new ethers.Contract(tokenAddress, SecurityTokenABI, readProvider);

      const [roleChecks, paused, currentSnapshotId] = await Promise.all([
        Promise.all(
          ALL_ROLES.map(async (role) => {
            try {
              const has = await contract.hasRole(walletAddress, role);
              return [role, has] as const;
            } catch {
              return [role, false] as const;
            }
          }),
        ),
        contract.isPaused() as Promise<boolean>,
        contract.getCurrentSnapshotId() as Promise<bigint>,
      ]);

      const roles: UserRoles = {};
      for (const [role, has] of roleChecks) {
        roles[role] = has;
      }
      setUserRoles(roles);
      setIsPaused(paused);
      setSnapshotId(currentSnapshotId.toString());
    } catch (err) {
      toast.error(parseContractError(err));
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, walletAddress]);

  useEffect(() => {
    void fetchRolesAndState();
  }, [fetchRolesAndState]);

  // -----------------------------------------------------------------------
  // Helper: get signer and contract
  // -----------------------------------------------------------------------

  const getSignerContract = useCallback(async () => {
    const provider = getProvider();
    if (!provider) throw new Error('Wallet not connected');
    const signer = await provider.getSigner();
    return new ethers.Contract(tokenAddress, SecurityTokenABI, signer);
  }, [tokenAddress]);

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Spinner size="lg" label="Loading admin dashboard" />
        <p className="text-sm text-gray-500">Checking your permissions...</p>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // No roles state
  // -----------------------------------------------------------------------

  const hasAnyRole = ALL_ROLES.some((r) => userRoles[r]);

  if (!hasAnyRole) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20">
          <Shield className="h-7 w-7 text-amber-400" aria-hidden="true" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-white">No Admin Roles</p>
          <p className="text-xs text-gray-500 mt-1 max-w-xs">
            Your connected wallet does not have any admin roles on this security token.
            Contact the contract administrator to be granted a role.
          </p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Role badges summary */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {ALL_ROLES.filter((r) => userRoles[r]).map((role) => (
          <Badge key={role} variant="success" dot>
            {ROLE_LABELS[role]}
          </Badge>
        ))}
      </div>

      {/* CONTRACT ADMIN */}
      {userRoles[ROLE_CONTRACT_ADMIN] && (
        <AdminPanel
          title="Contract Admin"
          icon={ShieldCheck}
          roleName="Full contract control"
          defaultOpen
        >
          <ContractAdminPanel
            tokenAddress={tokenAddress}
            isPaused={isPaused}
            snapshotId={snapshotId}
            onIsPausedChange={setIsPaused}
            onSnapshotIdChange={setSnapshotId}
            getSignerContract={getSignerContract}
            showTransactionFlow={showTransactionFlow}
          />
        </AdminPanel>
      )}

      {/* RESERVE ADMIN */}
      {userRoles[ROLE_RESERVE_ADMIN] && (
        <AdminPanel
          title="Reserve Admin"
          icon={Coins}
          roleName="Mint and burn tokens"
        >
          <ReserveAdminPanel
            tokenAddress={tokenAddress}
            getSignerContract={getSignerContract}
            showTransactionFlow={showTransactionFlow}
          />
        </AdminPanel>
      )}

      {/* WALLETS ADMIN */}
      {userRoles[ROLE_WALLETS_ADMIN] && (
        <AdminPanel
          title="Wallets Admin"
          icon={Users}
          roleName="Manage investor wallets"
        >
          <WalletsAdminPanel
            getSignerContract={getSignerContract}
            showTransactionFlow={showTransactionFlow}
          />
        </AdminPanel>
      )}

      {/* TRANSFER ADMIN */}
      {userRoles[ROLE_TRANSFER_ADMIN] && (
        <AdminPanel
          title="Transfer Admin"
          icon={ArrowRightLeft}
          roleName="Configure transfer rules"
        >
          <TransferAdminPanel
            tokenAddress={tokenAddress}
            getSignerContract={getSignerContract}
            showTransactionFlow={showTransactionFlow}
          />
        </AdminPanel>
      )}

      <TransactionFlowModal />
    </div>
  );
}

// ===========================================================================
// CONTRACT ADMIN PANEL
// ===========================================================================

function ContractAdminPanel({
  tokenAddress,
  isPaused,
  snapshotId,
  onIsPausedChange,
  onSnapshotIdChange,
  getSignerContract,
  showTransactionFlow,
}: {
  tokenAddress: string;
  isPaused: boolean;
  snapshotId: string;
  onIsPausedChange: (v: boolean) => void;
  onSnapshotIdChange: (v: string) => void;
  getSignerContract: () => Promise<ethers.Contract>;
  showTransactionFlow: ReturnType<typeof useTransactionFlow>['showTransactionFlow'];
}) {
  // -- Pause / Unpause
  const handleTogglePause = useCallback(() => {
    const method = isPaused ? 'unpause' : 'pause';
    const label = isPaused ? 'Unpause Token' : 'Pause Token';

    showTransactionFlow({
      type: 'approve',
      title: label,
      details: [
        { label: 'Token', value: tokenAddress },
        { label: 'Action', value: isPaused ? 'Resume all transfers' : 'Halt all transfers' },
      ],
      execute: async () => {
        const contract = await getSignerContract();
        return contract[method]();
      },
      onSuccess: () => {
        onIsPausedChange(!isPaused);
        toast.success(`Token ${isPaused ? 'unpaused' : 'paused'} successfully`);
      },
    });
  }, [isPaused, tokenAddress, getSignerContract, showTransactionFlow, onIsPausedChange]);

  // -- Snapshot
  const handleSnapshot = useCallback(() => {
    showTransactionFlow({
      type: 'approve',
      title: 'Create Snapshot',
      details: [
        { label: 'Token', value: tokenAddress },
        { label: 'Current Snapshot', value: snapshotId },
      ],
      execute: async () => {
        const contract = await getSignerContract();
        return contract.snapshot();
      },
      onSuccess: () => {
        const newId = (BigInt(snapshotId) + 1n).toString();
        onSnapshotIdChange(newId);
        toast.success(`Snapshot #${newId} created`);
      },
    });
  }, [tokenAddress, snapshotId, getSignerContract, showTransactionFlow, onSnapshotIdChange]);

  // -- Upgrade Transfer Rules
  const rulesAddr = useFormField('');

  const handleUpgradeRules = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!ethers.isAddress(rulesAddr.value)) {
        rulesAddr.setError('Invalid address');
        return;
      }
      rulesAddr.setError('');

      showTransactionFlow({
        type: 'approve',
        title: 'Upgrade Transfer Rules',
        details: [
          { label: 'Token', value: tokenAddress },
          { label: 'New Rules Address', value: rulesAddr.value },
        ],
        execute: async () => {
          const contract = await getSignerContract();
          return contract.upgradeTransferRules(rulesAddr.value);
        },
        onSuccess: () => {
          toast.success('Transfer rules upgraded');
          rulesAddr.reset();
        },
      });
    },
    [tokenAddress, rulesAddr, getSignerContract, showTransactionFlow],
  );

  // -- Grant / Revoke Role
  const roleAddr = useFormField('');
  const [selectedRole, setSelectedRole] = useState(ROLE_CONTRACT_ADMIN);
  const [roleAction, setRoleAction] = useState<'grant' | 'revoke'>('grant');

  const handleRoleChange = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!ethers.isAddress(roleAddr.value)) {
        roleAddr.setError('Invalid address');
        return;
      }
      roleAddr.setError('');

      const method = roleAction === 'grant' ? 'grantRole' : 'revokeRole';
      const label =
        roleAction === 'grant'
          ? `Grant ${ROLE_LABELS[selectedRole]}`
          : `Revoke ${ROLE_LABELS[selectedRole]}`;

      showTransactionFlow({
        type: 'approve',
        title: label,
        details: [
          { label: 'Token', value: tokenAddress },
          { label: 'Address', value: roleAddr.value },
          { label: 'Role', value: ROLE_LABELS[selectedRole] },
          { label: 'Action', value: roleAction === 'grant' ? 'Grant' : 'Revoke' },
        ],
        execute: async () => {
          const contract = await getSignerContract();
          return contract[method](roleAddr.value, selectedRole);
        },
        onSuccess: () => {
          toast.success(`${ROLE_LABELS[selectedRole]} ${roleAction === 'grant' ? 'granted' : 'revoked'}`);
          roleAddr.reset();
        },
      });
    },
    [tokenAddress, roleAddr, selectedRole, roleAction, getSignerContract, showTransactionFlow],
  );

  return (
    <>
      {/* Pause / Unpause + Snapshot */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
          <div className="flex items-center gap-3 mb-4">
            {isPaused ? (
              <Pause className="h-5 w-5 text-amber-400" aria-hidden="true" />
            ) : (
              <Play className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            )}
            <div>
              <p className="text-sm font-medium text-white">
                Token is {isPaused ? 'Paused' : 'Active'}
              </p>
              <p className="text-xs text-gray-500">
                {isPaused ? 'All transfers are halted' : 'Transfers are flowing'}
              </p>
            </div>
          </div>
          <button type="button" onClick={handleTogglePause} className={BUTTON_PRIMARY}>
            {isPaused ? 'Unpause' : 'Pause'} Token
          </button>
        </div>

        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
          <div className="flex items-center gap-3 mb-4">
            <Camera className="h-5 w-5 text-indigo-400" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-white">Snapshot</p>
              <p className="text-xs text-gray-500">
                Current ID: <span className="text-gray-300 font-mono">{snapshotId}</span>
              </p>
            </div>
          </div>
          <button type="button" onClick={handleSnapshot} className={BUTTON_PRIMARY}>
            <Camera className="h-4 w-4" aria-hidden="true" />
            Create Snapshot
          </button>
        </div>
      </div>

      {/* Upgrade Transfer Rules */}
      <div>
        <p className={SECTION_LABEL}>Upgrade Transfer Rules</p>
        <form onSubmit={handleUpgradeRules} className="space-y-3">
          <div>
            <FieldLabel htmlFor="rules-addr" required>
              New Transfer Rules Address
            </FieldLabel>
            <input
              id="rules-addr"
              type="text"
              placeholder="0x..."
              value={rulesAddr.value}
              onChange={(e) => {
                rulesAddr.setValue(e.target.value);
                rulesAddr.setError('');
              }}
              className={INPUT_STYLE}
            />
            <FieldError message={rulesAddr.error} />
          </div>
          <button type="submit" className={BUTTON_PRIMARY}>
            <ArrowUpCircle className="h-4 w-4" aria-hidden="true" />
            Upgrade Rules
          </button>
        </form>
      </div>

      {/* Grant / Revoke Role */}
      <div>
        <p className={SECTION_LABEL}>Grant / Revoke Role</p>
        <form onSubmit={handleRoleChange} className="space-y-3">
          <div>
            <FieldLabel htmlFor="role-addr" required>
              Target Address
            </FieldLabel>
            <input
              id="role-addr"
              type="text"
              placeholder="0x..."
              value={roleAddr.value}
              onChange={(e) => {
                roleAddr.setValue(e.target.value);
                roleAddr.setError('');
              }}
              className={INPUT_STYLE}
            />
            <FieldError message={roleAddr.error} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="role-select">Role</FieldLabel>
              <select
                id="role-select"
                value={selectedRole}
                onChange={(e) => setSelectedRole(Number(e.target.value))}
                className={INPUT_STYLE}
              >
                {ALL_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="role-action">Action</FieldLabel>
              <select
                id="role-action"
                value={roleAction}
                onChange={(e) => setRoleAction(e.target.value as 'grant' | 'revoke')}
                className={INPUT_STYLE}
              >
                <option value="grant">Grant</option>
                <option value="revoke">Revoke</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            className={roleAction === 'revoke' ? BUTTON_DANGER : BUTTON_PRIMARY}
          >
            {roleAction === 'grant' ? (
              <UserPlus className="h-4 w-4" aria-hidden="true" />
            ) : (
              <UserMinus className="h-4 w-4" aria-hidden="true" />
            )}
            {roleAction === 'grant' ? 'Grant' : 'Revoke'} Role
          </button>
        </form>
      </div>
    </>
  );
}

// ===========================================================================
// RESERVE ADMIN PANEL
// ===========================================================================

function ReserveAdminPanel({
  tokenAddress,
  getSignerContract,
  showTransactionFlow,
}: {
  tokenAddress: string;
  getSignerContract: () => Promise<ethers.Contract>;
  showTransactionFlow: ReturnType<typeof useTransactionFlow>['showTransactionFlow'];
}) {
  // -- Mint form
  const mintAddr = useFormField('');
  const mintAmount = useFormField('');

  const handleMint = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      let hasError = false;

      if (!ethers.isAddress(mintAddr.value)) {
        mintAddr.setError('Invalid address');
        hasError = true;
      }

      let parsedAmount: bigint;
      try {
        parsedAmount = ethers.parseUnits(mintAmount.value, 18);
        if (parsedAmount <= 0n) throw new Error();
      } catch {
        mintAmount.setError('Invalid amount');
        hasError = true;
        parsedAmount = 0n;
      }

      if (hasError) return;
      mintAddr.setError('');
      mintAmount.setError('');

      showTransactionFlow({
        type: 'mint',
        title: `Mint ${mintAmount.value} tokens`,
        details: [
          { label: 'Token', value: tokenAddress },
          { label: 'To', value: mintAddr.value },
          { label: 'Amount', value: mintAmount.value },
        ],
        execute: async () => {
          const contract = await getSignerContract();
          return contract.mint(mintAddr.value, parsedAmount);
        },
        onSuccess: () => {
          toast.success(`Minted ${mintAmount.value} tokens`);
          mintAddr.reset();
          mintAmount.reset();
        },
      });
    },
    [tokenAddress, mintAddr, mintAmount, getSignerContract, showTransactionFlow],
  );

  // -- Burn form
  const burnAddr = useFormField('');
  const burnAmount = useFormField('');

  const handleBurn = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      let hasError = false;

      if (!ethers.isAddress(burnAddr.value)) {
        burnAddr.setError('Invalid address');
        hasError = true;
      }

      let parsedAmount: bigint;
      try {
        parsedAmount = ethers.parseUnits(burnAmount.value, 18);
        if (parsedAmount <= 0n) throw new Error();
      } catch {
        burnAmount.setError('Invalid amount');
        hasError = true;
        parsedAmount = 0n;
      }

      if (hasError) return;
      burnAddr.setError('');
      burnAmount.setError('');

      showTransactionFlow({
        type: 'burn',
        title: `Burn ${burnAmount.value} tokens`,
        details: [
          { label: 'Token', value: tokenAddress },
          { label: 'From', value: burnAddr.value },
          { label: 'Amount', value: burnAmount.value },
        ],
        execute: async () => {
          const contract = await getSignerContract();
          return contract.burn(burnAddr.value, parsedAmount);
        },
        onSuccess: () => {
          toast.success(`Burned ${burnAmount.value} tokens`);
          burnAddr.reset();
          burnAmount.reset();
        },
      });
    },
    [tokenAddress, burnAddr, burnAmount, getSignerContract, showTransactionFlow],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Mint */}
      <div>
        <p className={SECTION_LABEL}>Mint Tokens</p>
        <form onSubmit={handleMint} className="space-y-3">
          <div>
            <FieldLabel htmlFor="mint-addr" required>
              Recipient Address
            </FieldLabel>
            <input
              id="mint-addr"
              type="text"
              placeholder="0x..."
              value={mintAddr.value}
              onChange={(e) => {
                mintAddr.setValue(e.target.value);
                mintAddr.setError('');
              }}
              className={INPUT_STYLE}
            />
            <FieldError message={mintAddr.error} />
          </div>
          <div>
            <FieldLabel htmlFor="mint-amount" required>
              Amount
            </FieldLabel>
            <input
              id="mint-amount"
              type="text"
              inputMode="decimal"
              placeholder="1000"
              value={mintAmount.value}
              onChange={(e) => {
                mintAmount.setValue(e.target.value);
                mintAmount.setError('');
              }}
              className={INPUT_STYLE}
            />
            <FieldError message={mintAmount.error} />
          </div>
          <button type="submit" className={BUTTON_PRIMARY}>
            <Coins className="h-4 w-4" aria-hidden="true" />
            Mint
          </button>
        </form>
      </div>

      {/* Burn */}
      <div>
        <p className={SECTION_LABEL}>Burn Tokens</p>
        <form onSubmit={handleBurn} className="space-y-3">
          <div>
            <FieldLabel htmlFor="burn-addr" required>
              From Address
            </FieldLabel>
            <input
              id="burn-addr"
              type="text"
              placeholder="0x..."
              value={burnAddr.value}
              onChange={(e) => {
                burnAddr.setValue(e.target.value);
                burnAddr.setError('');
              }}
              className={INPUT_STYLE}
            />
            <FieldError message={burnAddr.error} />
          </div>
          <div>
            <FieldLabel htmlFor="burn-amount" required>
              Amount
            </FieldLabel>
            <input
              id="burn-amount"
              type="text"
              inputMode="decimal"
              placeholder="1000"
              value={burnAmount.value}
              onChange={(e) => {
                burnAmount.setValue(e.target.value);
                burnAmount.setError('');
              }}
              className={INPUT_STYLE}
            />
            <FieldError message={burnAmount.error} />
          </div>
          <button type="submit" className={BUTTON_DANGER}>
            <Flame className="h-4 w-4" aria-hidden="true" />
            Burn
          </button>
        </form>
      </div>
    </div>
  );
}

// ===========================================================================
// WALLETS ADMIN PANEL
// ===========================================================================

function WalletsAdminPanel({
  getSignerContract,
  showTransactionFlow,
}: {
  getSignerContract: () => Promise<ethers.Contract>;
  showTransactionFlow: ReturnType<typeof useTransactionFlow>['showTransactionFlow'];
}) {
  // -- Set Transfer Group
  const groupAddr = useFormField('');
  const groupId = useFormField('');

  const handleSetGroup = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      let hasError = false;

      if (!ethers.isAddress(groupAddr.value)) {
        groupAddr.setError('Invalid address');
        hasError = true;
      }
      const gid = parseInt(groupId.value, 10);
      if (isNaN(gid) || gid < 0) {
        groupId.setError('Invalid group ID');
        hasError = true;
      }
      if (hasError) return;

      showTransactionFlow({
        type: 'approve',
        title: 'Set Transfer Group',
        details: [
          { label: 'Address', value: groupAddr.value },
          { label: 'Group ID', value: groupId.value },
        ],
        execute: async () => {
          const contract = await getSignerContract();
          return contract.setTransferGroup(groupAddr.value, gid);
        },
        onSuccess: () => {
          toast.success('Transfer group updated');
          groupAddr.reset();
          groupId.reset();
        },
      });
    },
    [groupAddr, groupId, getSignerContract, showTransactionFlow],
  );

  // -- Set Max Balance
  const maxBalAddr = useFormField('');
  const maxBalAmount = useFormField('');

  const handleSetMaxBalance = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      let hasError = false;

      if (!ethers.isAddress(maxBalAddr.value)) {
        maxBalAddr.setError('Invalid address');
        hasError = true;
      }

      let parsed: bigint;
      try {
        parsed = ethers.parseUnits(maxBalAmount.value, 18);
        if (parsed < 0n) throw new Error();
      } catch {
        maxBalAmount.setError('Invalid amount');
        hasError = true;
        parsed = 0n;
      }
      if (hasError) return;

      showTransactionFlow({
        type: 'approve',
        title: 'Set Max Balance',
        details: [
          { label: 'Address', value: maxBalAddr.value },
          { label: 'Max Balance', value: maxBalAmount.value },
        ],
        execute: async () => {
          const contract = await getSignerContract();
          return contract.setMaxBalance(maxBalAddr.value, parsed);
        },
        onSuccess: () => {
          toast.success('Max balance updated');
          maxBalAddr.reset();
          maxBalAmount.reset();
        },
      });
    },
    [maxBalAddr, maxBalAmount, getSignerContract, showTransactionFlow],
  );

  // -- Freeze / Unfreeze
  const freezeAddr = useFormField('');
  const [freezeStatus, setFreezeStatus] = useState(true);

  const handleFreeze = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!ethers.isAddress(freezeAddr.value)) {
        freezeAddr.setError('Invalid address');
        return;
      }

      showTransactionFlow({
        type: 'approve',
        title: freezeStatus ? 'Freeze Address' : 'Unfreeze Address',
        details: [
          { label: 'Address', value: freezeAddr.value },
          { label: 'Action', value: freezeStatus ? 'Freeze' : 'Unfreeze' },
        ],
        execute: async () => {
          const contract = await getSignerContract();
          return contract.freeze(freezeAddr.value, freezeStatus);
        },
        onSuccess: () => {
          toast.success(`Address ${freezeStatus ? 'frozen' : 'unfrozen'}`);
          freezeAddr.reset();
        },
      });
    },
    [freezeAddr, freezeStatus, getSignerContract, showTransactionFlow],
  );

  // -- Batch Set Address Permissions
  const batchAddr = useFormField('');
  const batchGroupId = useFormField('0');
  const batchLockedUntil = useFormField('0');
  const batchMaxBalance = useFormField('');
  const [batchFrozen, setBatchFrozen] = useState(false);

  const handleBatchPermissions = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      let hasError = false;

      if (!ethers.isAddress(batchAddr.value)) {
        batchAddr.setError('Invalid address');
        hasError = true;
      }

      const gid = parseInt(batchGroupId.value, 10);
      if (isNaN(gid) || gid < 0) {
        batchGroupId.setError('Invalid group ID');
        hasError = true;
      }

      const lockedUntil = parseInt(batchLockedUntil.value, 10);
      if (isNaN(lockedUntil) || lockedUntil < 0) {
        batchLockedUntil.setError('Invalid timestamp');
        hasError = true;
      }

      let maxBal: bigint;
      try {
        maxBal = ethers.parseUnits(batchMaxBalance.value, 18);
      } catch {
        batchMaxBalance.setError('Invalid amount');
        hasError = true;
        maxBal = 0n;
      }

      if (hasError) return;

      showTransactionFlow({
        type: 'approve',
        title: 'Set Address Permissions',
        details: [
          { label: 'Address', value: batchAddr.value },
          { label: 'Group ID', value: batchGroupId.value },
          { label: 'Locked Until', value: batchLockedUntil.value },
          { label: 'Max Balance', value: batchMaxBalance.value },
          { label: 'Frozen', value: batchFrozen ? 'Yes' : 'No' },
        ],
        execute: async () => {
          const contract = await getSignerContract();
          return contract.setAddressPermissions(
            batchAddr.value,
            gid,
            lockedUntil,
            maxBal,
            batchFrozen,
          );
        },
        onSuccess: () => {
          toast.success('Address permissions updated');
          batchAddr.reset();
          batchGroupId.reset();
          batchLockedUntil.reset();
          batchMaxBalance.reset();
          setBatchFrozen(false);
        },
      });
    },
    [
      batchAddr,
      batchGroupId,
      batchLockedUntil,
      batchMaxBalance,
      batchFrozen,
      getSignerContract,
      showTransactionFlow,
    ],
  );

  return (
    <div className="space-y-8">
      {/* Row 1: Transfer Group + Max Balance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Set Transfer Group */}
        <div>
          <p className={SECTION_LABEL}>Set Transfer Group</p>
          <form onSubmit={handleSetGroup} className="space-y-3">
            <div>
              <FieldLabel htmlFor="group-addr" required>Address</FieldLabel>
              <input
                id="group-addr"
                type="text"
                placeholder="0x..."
                value={groupAddr.value}
                onChange={(e) => { groupAddr.setValue(e.target.value); groupAddr.setError(''); }}
                className={INPUT_STYLE}
              />
              <FieldError message={groupAddr.error} />
            </div>
            <div>
              <FieldLabel htmlFor="group-id" required>Group ID</FieldLabel>
              <input
                id="group-id"
                type="number"
                min="0"
                placeholder="1"
                value={groupId.value}
                onChange={(e) => { groupId.setValue(e.target.value); groupId.setError(''); }}
                className={INPUT_STYLE}
              />
              <FieldError message={groupId.error} />
            </div>
            <button type="submit" className={BUTTON_PRIMARY}>
              <Layers className="h-4 w-4" aria-hidden="true" />
              Set Group
            </button>
          </form>
        </div>

        {/* Set Max Balance */}
        <div>
          <p className={SECTION_LABEL}>Set Max Balance</p>
          <form onSubmit={handleSetMaxBalance} className="space-y-3">
            <div>
              <FieldLabel htmlFor="maxbal-addr" required>Address</FieldLabel>
              <input
                id="maxbal-addr"
                type="text"
                placeholder="0x..."
                value={maxBalAddr.value}
                onChange={(e) => { maxBalAddr.setValue(e.target.value); maxBalAddr.setError(''); }}
                className={INPUT_STYLE}
              />
              <FieldError message={maxBalAddr.error} />
            </div>
            <div>
              <FieldLabel htmlFor="maxbal-amount" required>Max Balance</FieldLabel>
              <input
                id="maxbal-amount"
                type="text"
                inputMode="decimal"
                placeholder="10000"
                value={maxBalAmount.value}
                onChange={(e) => { maxBalAmount.setValue(e.target.value); maxBalAmount.setError(''); }}
                className={INPUT_STYLE}
              />
              <FieldError message={maxBalAmount.error} />
            </div>
            <button type="submit" className={BUTTON_PRIMARY}>
              <Lock className="h-4 w-4" aria-hidden="true" />
              Set Max Balance
            </button>
          </form>
        </div>
      </div>

      {/* Row 2: Freeze */}
      <div>
        <p className={SECTION_LABEL}>Freeze / Unfreeze Address</p>
        <form onSubmit={handleFreeze} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="freeze-addr" required>Address</FieldLabel>
              <input
                id="freeze-addr"
                type="text"
                placeholder="0x..."
                value={freezeAddr.value}
                onChange={(e) => { freezeAddr.setValue(e.target.value); freezeAddr.setError(''); }}
                className={INPUT_STYLE}
              />
              <FieldError message={freezeAddr.error} />
            </div>
            <div>
              <FieldLabel htmlFor="freeze-status">Status</FieldLabel>
              <select
                id="freeze-status"
                value={freezeStatus ? 'true' : 'false'}
                onChange={(e) => setFreezeStatus(e.target.value === 'true')}
                className={INPUT_STYLE}
              >
                <option value="true">Freeze</option>
                <option value="false">Unfreeze</option>
              </select>
            </div>
          </div>
          <button type="submit" className={freezeStatus ? BUTTON_DANGER : BUTTON_PRIMARY}>
            <Snowflake className="h-4 w-4" aria-hidden="true" />
            {freezeStatus ? 'Freeze' : 'Unfreeze'}
          </button>
        </form>
      </div>

      {/* Row 3: Batch Permissions */}
      <div>
        <p className={SECTION_LABEL}>Batch Set Address Permissions</p>
        <form onSubmit={handleBatchPermissions} className="space-y-3">
          <div>
            <FieldLabel htmlFor="batch-addr" required>Address</FieldLabel>
            <input
              id="batch-addr"
              type="text"
              placeholder="0x..."
              value={batchAddr.value}
              onChange={(e) => { batchAddr.setValue(e.target.value); batchAddr.setError(''); }}
              className={INPUT_STYLE}
            />
            <FieldError message={batchAddr.error} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <FieldLabel htmlFor="batch-group">Group ID</FieldLabel>
              <input
                id="batch-group"
                type="number"
                min="0"
                value={batchGroupId.value}
                onChange={(e) => { batchGroupId.setValue(e.target.value); batchGroupId.setError(''); }}
                className={INPUT_STYLE}
              />
              <FieldError message={batchGroupId.error} />
            </div>
            <div>
              <FieldLabel htmlFor="batch-locked">Locked Until (unix)</FieldLabel>
              <input
                id="batch-locked"
                type="number"
                min="0"
                value={batchLockedUntil.value}
                onChange={(e) => { batchLockedUntil.setValue(e.target.value); batchLockedUntil.setError(''); }}
                className={INPUT_STYLE}
              />
              <FieldError message={batchLockedUntil.error} />
            </div>
            <div>
              <FieldLabel htmlFor="batch-maxbal">Max Balance</FieldLabel>
              <input
                id="batch-maxbal"
                type="text"
                inputMode="decimal"
                placeholder="10000"
                value={batchMaxBalance.value}
                onChange={(e) => { batchMaxBalance.setValue(e.target.value); batchMaxBalance.setError(''); }}
                className={INPUT_STYLE}
              />
              <FieldError message={batchMaxBalance.error} />
            </div>
            <div>
              <FieldLabel htmlFor="batch-frozen">Frozen</FieldLabel>
              <select
                id="batch-frozen"
                value={batchFrozen ? 'true' : 'false'}
                onChange={(e) => setBatchFrozen(e.target.value === 'true')}
                className={INPUT_STYLE}
              >
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </div>
          </div>

          <button type="submit" className={BUTTON_PRIMARY}>
            <Users className="h-4 w-4" aria-hidden="true" />
            Set Permissions
          </button>
        </form>
      </div>
    </div>
  );
}

// ===========================================================================
// TRANSFER ADMIN PANEL
// ===========================================================================

function TransferAdminPanel({
  tokenAddress,
  getSignerContract,
  showTransactionFlow,
}: {
  tokenAddress: string;
  getSignerContract: () => Promise<ethers.Contract>;
  showTransactionFlow: ReturnType<typeof useTransactionFlow>['showTransactionFlow'];
}) {
  // -- Set Allow Group Transfer
  const fromGroup = useFormField('');
  const toGroup = useFormField('');
  const [lockedUntilDate, setLockedUntilDate] = useState('');

  const handleSetGroupTransfer = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      let hasError = false;

      const from = parseInt(fromGroup.value, 10);
      if (isNaN(from) || from < 0) {
        fromGroup.setError('Invalid group ID');
        hasError = true;
      }

      const to = parseInt(toGroup.value, 10);
      if (isNaN(to) || to < 0) {
        toGroup.setError('Invalid group ID');
        hasError = true;
      }

      // Convert datetime-local to unix timestamp
      let lockedUntil = 0;
      if (lockedUntilDate) {
        const date = new Date(lockedUntilDate);
        if (isNaN(date.getTime())) {
          hasError = true;
        } else {
          lockedUntil = Math.floor(date.getTime() / 1000);
        }
      }

      if (hasError) return;
      fromGroup.setError('');
      toGroup.setError('');

      showTransactionFlow({
        type: 'approve',
        title: 'Set Allow Group Transfer',
        details: [
          { label: 'From Group', value: fromGroup.value },
          { label: 'To Group', value: toGroup.value },
          {
            label: 'Locked Until',
            value: lockedUntil > 0
              ? new Date(lockedUntil * 1000).toLocaleString()
              : 'Immediately',
          },
        ],
        execute: async () => {
          const contract = await getSignerContract();
          return contract.setAllowGroupTransfer(from, to, lockedUntil);
        },
        onSuccess: () => {
          toast.success('Group transfer rule updated');
          fromGroup.reset();
          toGroup.reset();
          setLockedUntilDate('');
        },
      });
    },
    [fromGroup, toGroup, lockedUntilDate, getSignerContract, showTransactionFlow],
  );

  // -- Group Transfer Matrix Viewer
  const [matrixFrom, setMatrixFrom] = useState('');
  const [matrixTo, setMatrixTo] = useState('');
  const [matrixResult, setMatrixResult] = useState<string | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);

  const handleCheckGroupTransfer = useCallback(async () => {
    const from = parseInt(matrixFrom, 10);
    const to = parseInt(matrixTo, 10);
    if (isNaN(from) || isNaN(to) || from < 0 || to < 0) {
      toast.error('Enter valid group IDs');
      return;
    }

    const { chainId } = useWalletStore.getState().wallet;
    if (!chainId) return;

    setMatrixLoading(true);
    try {
      const readProvider = getReadOnlyProvider(chainId);
      const contract = new ethers.Contract(tokenAddress, SecurityTokenABI, readProvider);
      const timestamp: bigint = await contract.getAllowGroupTransferTime(from, to);
      if (timestamp === 0n) {
        setMatrixResult('Not allowed');
      } else {
        const now = Math.floor(Date.now() / 1000);
        if (Number(timestamp) <= now) {
          setMatrixResult('Allowed (active)');
        } else {
          setMatrixResult(
            `Allowed after ${new Date(Number(timestamp) * 1000).toLocaleString()}`,
          );
        }
      }
    } catch (err) {
      toast.error(parseContractError(err));
    } finally {
      setMatrixLoading(false);
    }
  }, [tokenAddress, matrixFrom, matrixTo]);

  return (
    <div className="space-y-8">
      {/* Set Allow Group Transfer */}
      <div>
        <p className={SECTION_LABEL}>Set Allow Group Transfer</p>
        <form onSubmit={handleSetGroupTransfer} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <FieldLabel htmlFor="xfer-from" required>From Group</FieldLabel>
              <input
                id="xfer-from"
                type="number"
                min="0"
                placeholder="0"
                value={fromGroup.value}
                onChange={(e) => { fromGroup.setValue(e.target.value); fromGroup.setError(''); }}
                className={INPUT_STYLE}
              />
              <FieldError message={fromGroup.error} />
            </div>
            <div>
              <FieldLabel htmlFor="xfer-to" required>To Group</FieldLabel>
              <input
                id="xfer-to"
                type="number"
                min="0"
                placeholder="1"
                value={toGroup.value}
                onChange={(e) => { toGroup.setValue(e.target.value); toGroup.setError(''); }}
                className={INPUT_STYLE}
              />
              <FieldError message={toGroup.error} />
            </div>
            <div>
              <FieldLabel htmlFor="xfer-locked">Locked Until</FieldLabel>
              <input
                id="xfer-locked"
                type="datetime-local"
                value={lockedUntilDate}
                onChange={(e) => setLockedUntilDate(e.target.value)}
                className={INPUT_STYLE}
              />
            </div>
          </div>
          <button type="submit" className={BUTTON_PRIMARY}>
            <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
            Set Transfer Rule
          </button>
        </form>
      </div>

      {/* Transfer Group Matrix Viewer */}
      <div>
        <p className={SECTION_LABEL}>Check Group Transfer Permission</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <FieldLabel htmlFor="matrix-from">From Group</FieldLabel>
            <input
              id="matrix-from"
              type="number"
              min="0"
              placeholder="0"
              value={matrixFrom}
              onChange={(e) => setMatrixFrom(e.target.value)}
              className={INPUT_STYLE}
            />
          </div>
          <div>
            <FieldLabel htmlFor="matrix-to">To Group</FieldLabel>
            <input
              id="matrix-to"
              type="number"
              min="0"
              placeholder="1"
              value={matrixTo}
              onChange={(e) => setMatrixTo(e.target.value)}
              className={INPUT_STYLE}
            />
          </div>
          <button
            type="button"
            onClick={handleCheckGroupTransfer}
            disabled={matrixLoading}
            className={clsx(BUTTON_PRIMARY, 'w-full sm:w-auto')}
          >
            {matrixLoading ? (
              <Spinner size="xs" label="Checking" />
            ) : (
              'Check'
            )}
          </button>
        </div>
        {matrixResult !== null && (
          <div
            className={clsx(
              'mt-3 rounded-xl px-4 py-3 border',
              matrixResult.includes('Not allowed')
                ? 'bg-red-500/10 border-red-500/20'
                : matrixResult.includes('active')
                  ? 'bg-emerald-500/10 border-emerald-500/20'
                  : 'bg-amber-500/10 border-amber-500/20',
            )}
          >
            <div className="flex items-center gap-2">
              {matrixResult.includes('Not allowed') ? (
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0" aria-hidden="true" />
              ) : matrixResult.includes('active') ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
              ) : (
                <Clock className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
              )}
              <span
                className={clsx(
                  'text-sm font-medium',
                  matrixResult.includes('Not allowed')
                    ? 'text-red-300'
                    : matrixResult.includes('active')
                      ? 'text-emerald-300'
                      : 'text-amber-300',
                )}
              >
                {matrixResult}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

