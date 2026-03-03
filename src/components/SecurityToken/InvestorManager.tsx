/**
 * InvestorManager -- Admin panel for managing ERC-1404 investor permissions.
 *
 * Sections:
 *   A) Investor Registry (search & view investor details)
 *   B) Transfer Group Assignment
 *   C) Max Balance Configuration
 *   D) Freeze Toggle
 *   E) Batch Onboarding (CSV or multi-row form)
 *   F) Transfer Check (getAllowTransferTime)
 */

import { useCallback, useState } from 'react';
import { ethers } from 'ethers';
import { SecurityTokenABI } from '../../contracts/abis/SecurityToken';
import { getSigner, useWalletStore } from '../../store/walletStore';
import { getReadOnlyProvider, parseContractError } from '../../lib/blockchain/contracts';
import {
  sendTransactionWithRetry,
  waitForTransactionReceipt,
} from '../../lib/blockchain/txExecution';
import {
  formatDateTime,
  formatWeiAmount,
  truncateAddress,
} from '../../lib/formatters';
import Card from '../Common/Card';
import Spinner from '../Common/Spinner';
import Badge from '../Common/Badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvestorManagerProps {
  tokenAddress: string;
}

interface InvestorDetails {
  address: string;
  transferGroup: bigint;
  maxBalance: bigint;
  frozenStatus: boolean;
  balance: bigint;
  lockedAmount: bigint;
  unlockedAmount: bigint;
}

interface BatchRow {
  address: string;
  groupID: string;
  lockedBalanceUntil: string;
  maxBalance: string;
  frozenStatus: boolean;
}

// ---------------------------------------------------------------------------
// Shared style constants
// ---------------------------------------------------------------------------

const INPUT_CLASS =
  'bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors w-full text-sm';

const INPUT_SM =
  'bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors w-full text-xs';

const BUTTON_CLASS =
  'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl px-6 py-3 font-medium transition-colors';

const LABEL = 'block text-sm text-gray-400 mb-1.5';

const SECTION_LABEL = 'text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getContract(tokenAddress: string): ethers.Contract | null {
  const { chainId } = useWalletStore.getState().wallet;
  if (!chainId) return null;
  const readProvider = getReadOnlyProvider(chainId);
  return new ethers.Contract(tokenAddress, SecurityTokenABI, readProvider);
}

function getSignedContract(tokenAddress: string): ethers.Contract | null {
  const signer = getSigner();
  if (!signer) return null;
  return new ethers.Contract(tokenAddress, SecurityTokenABI, signer);
}

const GROUP_PRESETS = [
  { label: 'Reg D', id: 1 },
  { label: 'Reg CF', id: 2 },
  { label: 'Reg S', id: 3 },
] as const;

const ROLE_WALLETS_ADMIN = 4;

function emptyBatchRow(): BatchRow {
  return {
    address: '',
    groupID: '1',
    lockedBalanceUntil: '0',
    maxBalance: '0',
    frozenStatus: false,
  };
}

// ---------------------------------------------------------------------------
// A) Investor Registry
// ---------------------------------------------------------------------------

function InvestorRegistry({ tokenAddress }: { tokenAddress: string }) {
  const [searchAddr, setSearchAddr] = useState('');
  const [investor, setInvestor] = useState<InvestorDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = useCallback(async () => {
    setError('');
    setInvestor(null);

    if (!ethers.isAddress(searchAddr)) {
      setError('Enter a valid Ethereum address.');
      return;
    }

    const contract = getContract(tokenAddress);
    if (!contract) {
      setError('Wallet not connected.');
      return;
    }

    setLoading(true);
    try {
      const [transferGroup, maxBalance, frozenStatus, balance, lockedAmount, unlockedAmount] =
        await Promise.all([
          contract.getTransferGroup(searchAddr) as Promise<bigint>,
          contract.getMaxBalance(searchAddr) as Promise<bigint>,
          contract.getFrozenStatus(searchAddr) as Promise<boolean>,
          contract.balanceOf(searchAddr) as Promise<bigint>,
          contract.lockedAmountOf(searchAddr) as Promise<bigint>,
          contract.unlockedAmountOf(searchAddr) as Promise<bigint>,
        ]);

      setInvestor({
        address: searchAddr,
        transferGroup,
        maxBalance,
        frozenStatus,
        balance,
        lockedAmount,
        unlockedAmount,
      });
    } catch (err) {
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, searchAddr]);

  return (
    <Card title="Investor Registry" subtitle="Search and view investor details" compact>
      <div className="space-y-4">
        <div className="flex gap-3">
          <input
            className={INPUT_CLASS}
            placeholder="Search by address (0x...)"
            value={searchAddr}
            onChange={(e) => setSearchAddr(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            className={`${BUTTON_CLASS} shrink-0`}
            onClick={handleSearch}
            disabled={loading}
          >
            {loading ? <Spinner size="xs" /> : 'Search'}
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {investor && (
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.04] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white font-mono">
                {truncateAddress(investor.address, 8)}
              </span>
              <Badge
                variant={investor.frozenStatus ? 'danger' : 'success'}
                dot
              >
                {investor.frozenStatus ? 'Frozen' : 'Active'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500">Transfer Group</p>
                <p className="text-sm text-white font-semibold mt-1">
                  Group {investor.transferGroup.toString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Max Balance</p>
                <p className="text-sm text-white font-semibold mt-1">
                  {investor.maxBalance === 0n
                    ? 'Unlimited'
                    : formatWeiAmount(investor.maxBalance)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Current Balance</p>
                <p className="text-sm text-white font-semibold mt-1">
                  {formatWeiAmount(investor.balance)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Locked Amount</p>
                <p className="text-sm text-amber-400 font-semibold mt-1">
                  {formatWeiAmount(investor.lockedAmount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Unlocked Amount</p>
                <p className="text-sm text-emerald-400 font-semibold mt-1">
                  {formatWeiAmount(investor.unlockedAmount)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// B) Transfer Group Assignment
// ---------------------------------------------------------------------------

function TransferGroupAssignment({ tokenAddress }: { tokenAddress: string }) {
  const walletAddress = useWalletStore((s) => s.wallet.address);
  const [addr, setAddr] = useState('');
  const [groupId, setGroupId] = useState('1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = useCallback(async () => {
    setError('');
    setSuccess('');

    if (!ethers.isAddress(addr)) {
      setError('Enter a valid Ethereum address.');
      return;
    }

    const gid = parseInt(groupId);
    if (isNaN(gid) || gid < 0) {
      setError('Enter a valid group ID (non-negative integer).');
      return;
    }

    const contract = getSignedContract(tokenAddress);
    if (!contract) {
      setError('Wallet not connected or signer unavailable.');
      return;
    }

    const signer = getSigner();
    if (!signer) {
      setError('Wallet signer unavailable. Please reconnect your wallet.');
      return;
    }

    const normalizedAddr = ethers.getAddress(addr);

    setLoading(true);
    try {
      const caller = await signer.getAddress();
      const hasWalletsAdmin: boolean = await contract.hasRole(caller, ROLE_WALLETS_ADMIN);
      if (!hasWalletsAdmin) {
        setError(
          `Connected wallet ${truncateAddress(caller)} is missing Wallets Admin role (4). Ask a Contract Admin to grant it before assigning transfer groups.`,
        );
        return;
      }

      const currentGroup = Number(await contract.getTransferGroup(normalizedAddr));
      if (currentGroup === gid) {
        setSuccess(
          `${truncateAddress(normalizedAddr)} is already in Group ${gid}. No update needed.`,
        );
        return;
      }

      // Preflight estimation provides clearer revert diagnostics before wallet prompt.
      await contract.setTransferGroup.estimateGas(normalizedAddr, gid);

      const tx = await sendTransactionWithRetry(
        () => contract.setTransferGroup(normalizedAddr, gid),
        { label: 'InvestorManager.setTransferGroup' },
      );
      await waitForTransactionReceipt(tx, { label: 'InvestorManager.setTransferGroup' });
      setSuccess(`Group assignment updated to Group ${gid} for ${truncateAddress(normalizedAddr)}.`);
      setAddr('');
    } catch (err) {
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, addr, groupId]);

  return (
    <Card title="Transfer Group Assignment" compact>
      <div className="space-y-4">
        <div>
          <label className={LABEL}>Investor Address</label>
          <input
            className={INPUT_CLASS}
            placeholder="0x..."
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
          />
        </div>

        <div>
          <label className={LABEL}>Group ID</label>
          <div className="flex gap-3">
            <input
              className={INPUT_CLASS}
              type="number"
              min="0"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            />
          </div>
          <div className="flex gap-2 mt-2">
            {GROUP_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  groupId === String(p.id)
                    ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
                    : 'bg-white/[0.03] border-white/[0.06] text-gray-400 hover:text-white hover:border-white/[0.12]'
                }`}
                onClick={() => setGroupId(String(p.id))}
              >
                {p.label} (G{p.id})
              </button>
            ))}
          </div>
        </div>

        <button
          className={BUTTON_CLASS}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? <Spinner size="xs" /> : 'Set Transfer Group'}
        </button>

        <p className="text-[10px] text-gray-600">
          Requires Wallets Admin role on this token. Connected wallet: {walletAddress ? truncateAddress(walletAddress) : 'not connected'}.
        </p>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400">
            {success}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// C) Max Balance Configuration
// ---------------------------------------------------------------------------

function MaxBalanceConfig({ tokenAddress }: { tokenAddress: string }) {
  const [addr, setAddr] = useState('');
  const [maxBal, setMaxBal] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = useCallback(async () => {
    setError('');
    setSuccess('');

    if (!ethers.isAddress(addr)) {
      setError('Enter a valid Ethereum address.');
      return;
    }
    if (!maxBal || isNaN(Number(maxBal)) || Number(maxBal) < 0) {
      setError('Enter a valid max balance amount.');
      return;
    }

    const contract = getSignedContract(tokenAddress);
    if (!contract) {
      setError('Wallet not connected or signer unavailable.');
      return;
    }

    setLoading(true);
    try {
      const weiAmount = ethers.parseUnits(maxBal, 18);
      const tx = await sendTransactionWithRetry(
        () => contract.setMaxBalance(addr, weiAmount),
        { label: 'InvestorManager.setMaxBalance' },
      );
      await waitForTransactionReceipt(tx, { label: 'InvestorManager.setMaxBalance' });
      setSuccess(`Max balance set to ${maxBal} for ${truncateAddress(addr)}.`);
      setAddr('');
      setMaxBal('');
    } catch (err) {
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, addr, maxBal]);

  return (
    <Card title="Max Balance Configuration" compact>
      <div className="space-y-4">
        <div>
          <label className={LABEL}>Investor Address</label>
          <input
            className={INPUT_CLASS}
            placeholder="0x..."
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
          />
        </div>
        <div>
          <label className={LABEL}>Max Balance Amount</label>
          <input
            className={INPUT_CLASS}
            placeholder="e.g. 100000"
            type="number"
            min="0"
            step="any"
            value={maxBal}
            onChange={(e) => setMaxBal(e.target.value)}
          />
          <p className="text-[10px] text-gray-600 mt-1">
            Set to 0 for unlimited balance.
          </p>
        </div>

        <button
          className={BUTTON_CLASS}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? <Spinner size="xs" /> : 'Set Max Balance'}
        </button>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400">
            {success}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// D) Freeze Toggle
// ---------------------------------------------------------------------------

function FreezeToggle({ tokenAddress }: { tokenAddress: string }) {
  const [addr, setAddr] = useState('');
  const [freezeAction, setFreezeAction] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Check current status when address is entered
  const [currentStatus, setCurrentStatus] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!ethers.isAddress(addr)) return;

    const contract = getContract(tokenAddress);
    if (!contract) return;

    setChecking(true);
    try {
      const status = await contract.getFrozenStatus(addr) as boolean;
      setCurrentStatus(status);
      setFreezeAction(!status); // Default action is the opposite
    } catch {
      setCurrentStatus(null);
    } finally {
      setChecking(false);
    }
  }, [tokenAddress, addr]);

  const handleSubmit = useCallback(async () => {
    setError('');
    setSuccess('');

    if (!ethers.isAddress(addr)) {
      setError('Enter a valid Ethereum address.');
      return;
    }

    const contract = getSignedContract(tokenAddress);
    if (!contract) {
      setError('Wallet not connected or signer unavailable.');
      return;
    }

    setLoading(true);
    try {
      const tx = await sendTransactionWithRetry(
        () => contract.freeze(addr, freezeAction),
        { label: 'InvestorManager.freeze' },
      );
      await waitForTransactionReceipt(tx, { label: 'InvestorManager.freeze' });
      setSuccess(
        `Address ${truncateAddress(addr)} has been ${freezeAction ? 'frozen' : 'unfrozen'}.`,
      );
      setCurrentStatus(freezeAction);
      setAddr('');
    } catch (err) {
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, addr, freezeAction]);

  return (
    <Card title="Freeze / Unfreeze" compact>
      <div className="space-y-4">
        <div>
          <label className={LABEL}>Investor Address</label>
          <div className="flex gap-3">
            <input
              className={INPUT_CLASS}
              placeholder="0x..."
              value={addr}
              onChange={(e) => {
                setAddr(e.target.value);
                setCurrentStatus(null);
              }}
              onBlur={checkStatus}
            />
            {checking && (
              <div className="flex items-center">
                <Spinner size="xs" />
              </div>
            )}
          </div>
        </div>

        {currentStatus !== null && (
          <div
            className={`rounded-xl px-4 py-3 border text-sm ${
              currentStatus
                ? 'bg-red-500/10 border-red-500/20 text-red-400'
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            }`}
          >
            Current status: {currentStatus ? 'Frozen' : 'Not Frozen'}
          </div>
        )}

        {/* Toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium border transition-colors ${
              freezeAction
                ? 'bg-red-500/20 border-red-500/30 text-red-400'
                : 'bg-white/[0.03] border-white/[0.06] text-gray-400 hover:text-white'
            }`}
            onClick={() => setFreezeAction(true)}
          >
            Freeze
          </button>
          <button
            type="button"
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium border transition-colors ${
              !freezeAction
                ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                : 'bg-white/[0.03] border-white/[0.06] text-gray-400 hover:text-white'
            }`}
            onClick={() => setFreezeAction(false)}
          >
            Unfreeze
          </button>
        </div>

        <button
          className={BUTTON_CLASS}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <Spinner size="xs" />
          ) : (
            `${freezeAction ? 'Freeze' : 'Unfreeze'} Address`
          )}
        </button>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400">
            {success}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// E) Batch Onboarding
// ---------------------------------------------------------------------------

function BatchOnboarding({ tokenAddress }: { tokenAddress: string }) {
  const [rows, setRows] = useState<BatchRow[]>([emptyBatchRow()]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [results, setResults] = useState<
    { address: string; success: boolean; error?: string }[]
  >([]);
  const [csvMode, setCsvMode] = useState(false);
  const [csvText, setCsvText] = useState('');

  const updateRow = (index: number, field: keyof BatchRow, value: string | boolean) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
    );
  };

  const addRow = () => {
    setRows((prev) => [...prev, emptyBatchRow()]);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const parseCSV = useCallback((): BatchRow[] => {
    const lines = csvText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));

    return lines.map((line) => {
      const parts = line.split(',').map((p) => p.trim());
      return {
        address: parts[0] || '',
        groupID: parts[1] || '1',
        lockedBalanceUntil: parts[2] || '0',
        maxBalance: parts[3] || '0',
        frozenStatus: parts[4]?.toLowerCase() === 'true',
      };
    });
  }, [csvText]);

  const handleSubmit = useCallback(async () => {
    setError('');
    setResults([]);

    const batchRows = csvMode ? parseCSV() : rows;

    if (batchRows.length === 0) {
      setError('Add at least one row.');
      return;
    }

    // Validate all rows
    for (let i = 0; i < batchRows.length; i++) {
      const row = batchRows[i];
      if (!ethers.isAddress(row.address)) {
        setError(`Row ${i + 1}: Invalid address "${row.address}".`);
        return;
      }
      if (isNaN(parseInt(row.groupID)) || parseInt(row.groupID) < 0) {
        setError(`Row ${i + 1}: Invalid group ID.`);
        return;
      }
    }

    const contract = getSignedContract(tokenAddress);
    if (!contract) {
      setError('Wallet not connected or signer unavailable.');
      return;
    }

    setLoading(true);
    setProgress({ current: 0, total: batchRows.length });
    const txResults: { address: string; success: boolean; error?: string }[] = [];

    for (let i = 0; i < batchRows.length; i++) {
      const row = batchRows[i];
      setProgress({ current: i + 1, total: batchRows.length });

      try {
        const maxBal = row.maxBalance && row.maxBalance !== '0'
          ? ethers.parseUnits(row.maxBalance, 18)
          : 0n;
        const lockedUntil = BigInt(row.lockedBalanceUntil || '0');

        const tx = await sendTransactionWithRetry(
          () =>
            contract.setAddressPermissions(
              row.address,
              parseInt(row.groupID),
              lockedUntil,
              maxBal,
              row.frozenStatus,
            ),
          { label: 'InvestorManager.setAddressPermissions' },
        );
        await waitForTransactionReceipt(tx, { label: 'InvestorManager.setAddressPermissions' });
        txResults.push({ address: row.address, success: true });
      } catch (err) {
        txResults.push({
          address: row.address,
          success: false,
          error: parseContractError(err),
        });
      }
    }

    setResults(txResults);
    setProgress(null);
    setLoading(false);
  }, [tokenAddress, rows, csvMode, parseCSV]);

  return (
    <Card title="Batch Onboarding" subtitle="Set address permissions in bulk" compact>
      <div className="space-y-4">
        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-xs font-medium border transition-colors ${
              !csvMode
                ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
                : 'bg-white/[0.03] border-white/[0.06] text-gray-400 hover:text-white'
            }`}
            onClick={() => setCsvMode(false)}
          >
            Form Mode
          </button>
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-xs font-medium border transition-colors ${
              csvMode
                ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
                : 'bg-white/[0.03] border-white/[0.06] text-gray-400 hover:text-white'
            }`}
            onClick={() => setCsvMode(true)}
          >
            CSV Mode
          </button>
        </div>

        {csvMode ? (
          <div>
            <label className={LABEL}>
              CSV Data (address, groupID, lockedBalanceUntil, maxBalance, frozen)
            </label>
            <textarea
              className={`${INPUT_CLASS} min-h-[120px] font-mono text-xs`}
              placeholder={`# address, groupID, lockedBalanceUntil, maxBalance, frozen\n0x1234...abcd, 1, 0, 100000, false\n0x5678...efgh, 2, 0, 50000, false`}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
            <p className="text-[10px] text-gray-600 mt-1">
              One entry per line. Lines starting with # are ignored.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row, idx) => (
              <div
                key={idx}
                className="rounded-xl bg-white/[0.03] border border-white/[0.04] p-3 space-y-2"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500 font-medium">
                    Entry #{idx + 1}
                  </span>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-red-400 hover:text-red-300 transition-colors"
                      onClick={() => removeRow(idx)}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-500 mb-0.5 block">Address</label>
                    <input
                      className={INPUT_SM}
                      placeholder="0x..."
                      value={row.address}
                      onChange={(e) => updateRow(idx, 'address', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-0.5 block">Group ID</label>
                    <input
                      className={INPUT_SM}
                      type="number"
                      min="0"
                      value={row.groupID}
                      onChange={(e) => updateRow(idx, 'groupID', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-0.5 block">
                      Locked Balance Until (timestamp)
                    </label>
                    <input
                      className={INPUT_SM}
                      type="number"
                      min="0"
                      value={row.lockedBalanceUntil}
                      onChange={(e) => updateRow(idx, 'lockedBalanceUntil', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-0.5 block">Max Balance</label>
                    <input
                      className={INPUT_SM}
                      type="number"
                      min="0"
                      step="any"
                      value={row.maxBalance}
                      onChange={(e) => updateRow(idx, 'maxBalance', e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-gray-500">Frozen:</label>
                  <button
                    type="button"
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      row.frozenStatus ? 'bg-red-500' : 'bg-white/[0.12]'
                    }`}
                    onClick={() => updateRow(idx, 'frozenStatus', !row.frozenStatus)}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                        row.frozenStatus ? 'left-5' : 'left-0.5'
                      }`}
                    />
                  </button>
                  <span className="text-[10px] text-gray-400">
                    {row.frozenStatus ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="w-full rounded-xl border border-dashed border-white/[0.08] px-4 py-3 text-sm text-gray-500 hover:text-white hover:border-white/[0.16] transition-colors"
              onClick={addRow}
            >
              + Add Row
            </button>
          </div>
        )}

        {/* Progress */}
        {progress && (
          <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-indigo-400">Processing...</span>
              <span className="text-xs text-gray-400">
                {progress.current} / {progress.total}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        <button
          className={BUTTON_CLASS}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? <Spinner size="xs" /> : 'Process Batch'}
        </button>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div>
            <p className={SECTION_LABEL}>Results</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {results.map((r, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 border ${
                    r.success
                      ? 'bg-emerald-500/10 border-emerald-500/20'
                      : 'bg-red-500/10 border-red-500/20'
                  }`}
                >
                  <span className="text-xs font-mono text-gray-300">
                    {truncateAddress(r.address)}
                  </span>
                  {r.success ? (
                    <Badge variant="success" size="sm">OK</Badge>
                  ) : (
                    <span className="text-[10px] text-red-400 max-w-[200px] truncate">
                      {r.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// F) Transfer Check
// ---------------------------------------------------------------------------

function TransferCheck({ tokenAddress }: { tokenAddress: string }) {
  const [fromAddr, setFromAddr] = useState('');
  const [toAddr, setToAddr] = useState('');
  const [result, setResult] = useState<{ timestamp: bigint } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCheck = useCallback(async () => {
    setError('');
    setResult(null);

    if (!ethers.isAddress(fromAddr)) {
      setError('Invalid sender address.');
      return;
    }
    if (!ethers.isAddress(toAddr)) {
      setError('Invalid recipient address.');
      return;
    }

    const contract = getContract(tokenAddress);
    if (!contract) {
      setError('Wallet not connected.');
      return;
    }

    setLoading(true);
    try {
      const timestamp = (await contract.getAllowTransferTime(fromAddr, toAddr)) as bigint;
      setResult({ timestamp });
    } catch (err) {
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, fromAddr, toAddr]);

  const getStatusInfo = () => {
    if (!result) return null;
    const ts = result.timestamp;
    if (ts === 0n) {
      return { label: 'Not Allowed', variant: 'danger' as const, detail: 'Transfer is not permitted between these addresses.' };
    }
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (ts <= now) {
      return { label: 'Allowed Now', variant: 'success' as const, detail: 'Transfers are currently permitted.' };
    }
    return {
      label: 'Allowed After',
      variant: 'warning' as const,
      detail: `Transfers allowed after ${formatDateTime(new Date(Number(ts) * 1000))}.`,
    };
  };

  const status = getStatusInfo();

  return (
    <Card title="Transfer Check" subtitle="Check when transfers are allowed between two addresses" compact>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>From Address</label>
            <input
              className={INPUT_CLASS}
              placeholder="0x..."
              value={fromAddr}
              onChange={(e) => setFromAddr(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>To Address</label>
            <input
              className={INPUT_CLASS}
              placeholder="0x..."
              value={toAddr}
              onChange={(e) => setToAddr(e.target.value)}
            />
          </div>
        </div>

        <button
          className={BUTTON_CLASS}
          onClick={handleCheck}
          disabled={loading}
        >
          {loading ? <Spinner size="xs" /> : 'Check Transfer Time'}
        </button>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {status && (
          <div
            className={`rounded-xl px-4 py-4 border ${
              status.variant === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20'
                : status.variant === 'warning'
                  ? 'bg-amber-500/10 border-amber-500/20'
                  : 'bg-red-500/10 border-red-500/20'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <Badge variant={status.variant} dot>
                {status.label}
              </Badge>
            </div>
            <p
              className={`text-sm ${
                status.variant === 'success'
                  ? 'text-emerald-400'
                  : status.variant === 'warning'
                    ? 'text-amber-400'
                    : 'text-red-400'
              }`}
            >
              {status.detail}
            </p>
            {result && result.timestamp > 0n && (
              <p className="text-xs text-gray-500 mt-2 font-mono">
                Timestamp: {result.timestamp.toString()}
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function InvestorManager({ tokenAddress }: InvestorManagerProps) {
  return (
    <div className="space-y-6">
      {/* Registry -- full width */}
      <InvestorRegistry tokenAddress={tokenAddress} />

      {/* Group Assignment + Max Balance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TransferGroupAssignment tokenAddress={tokenAddress} />
        <MaxBalanceConfig tokenAddress={tokenAddress} />
      </div>

      {/* Freeze + Transfer Check */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FreezeToggle tokenAddress={tokenAddress} />
        <TransferCheck tokenAddress={tokenAddress} />
      </div>

      {/* Batch Onboarding -- full width */}
      <BatchOnboarding tokenAddress={tokenAddress} />
    </div>
  );
}
