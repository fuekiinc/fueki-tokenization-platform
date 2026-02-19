/**
 * ComplianceMonitor -- ERC-1404 compliance monitoring dashboard.
 *
 * Sections:
 *   A) Transfer Restriction Checker
 *   B) Transfer Group Matrix (group-to-group allowance grid)
 *   C) Frozen Address Checker (with recent freeze/unfreeze events)
 *   D) Pause Status (with pause/unpause history)
 *   E) Max Balance Utilization (balance vs max balance progress)
 */

import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  SecurityTokenABI,
  TRANSFER_RESTRICTION_CODES,
} from '../../contracts/abis/SecurityToken';
import { useWalletStore, getProvider } from '../../store/walletStore';
import { parseContractError } from '../../lib/blockchain/contracts';
import { formatWeiAmount, truncateAddress, formatDateTime } from '../../lib/formatters';
import Card from '../Common/Card';
import Spinner from '../Common/Spinner';
import Badge from '../Common/Badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComplianceMonitorProps {
  tokenAddress: string;
}

interface RestrictionResult {
  code: number;
  message: string;
}

interface FreezeEvent {
  admin: string;
  addr: string;
  status: boolean;
  blockNumber: number;
  timestamp: number | null;
}

interface PauseEvent {
  admin: string;
  status: boolean;
  blockNumber: number;
  timestamp: number | null;
}

interface GroupTransferTime {
  fromGroup: number;
  toGroup: number;
  timestamp: bigint;
}

// ---------------------------------------------------------------------------
// Shared style constants
// ---------------------------------------------------------------------------

const INPUT_CLASS =
  'bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors w-full text-sm';

const BUTTON_CLASS =
  'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl px-6 py-3 font-medium transition-colors';

const SECTION_LABEL = 'text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getContract(tokenAddress: string): ethers.Contract | null {
  const provider = getProvider();
  if (!provider) return null;
  return new ethers.Contract(tokenAddress, SecurityTokenABI, provider);
}

async function resolveBlockTimestamp(
  provider: ethers.BrowserProvider,
  blockNumber: number,
): Promise<number | null> {
  try {
    const block = await provider.getBlock(blockNumber);
    return block ? block.timestamp : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A) Transfer Restriction Checker */
function TransferRestrictionChecker({
  tokenAddress,
}: {
  tokenAddress: string;
}) {
  const [fromAddr, setFromAddr] = useState('');
  const [toAddr, setToAddr] = useState('');
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState<RestrictionResult | null>(null);
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
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError('Enter a valid amount greater than zero.');
      return;
    }

    const contract = getContract(tokenAddress);
    if (!contract) {
      setError('Wallet not connected.');
      return;
    }

    setLoading(true);
    try {
      const weiAmount = ethers.parseUnits(amount, 18);
      const code: bigint = await contract.detectTransferRestriction(fromAddr, toAddr, weiAmount);
      const codeNum = Number(code);
      const message: string = await contract.messageForTransferRestriction(codeNum);
      setResult({ code: codeNum, message });
    } catch (err) {
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, fromAddr, toAddr, amount]);

  return (
    <Card title="Transfer Restriction Checker" compact>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">From Address</label>
            <input
              className={INPUT_CLASS}
              placeholder="0x..."
              value={fromAddr}
              onChange={(e) => setFromAddr(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">To Address</label>
            <input
              className={INPUT_CLASS}
              placeholder="0x..."
              value={toAddr}
              onChange={(e) => setToAddr(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Amount</label>
          <input
            className={INPUT_CLASS}
            placeholder="1000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            min="0"
            step="any"
          />
        </div>
        <button
          className={BUTTON_CLASS}
          onClick={handleCheck}
          disabled={loading}
        >
          {loading ? <Spinner size="xs" /> : 'Check Restriction'}
        </button>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {result !== null && (
          <div
            className={`rounded-xl px-4 py-4 border ${
              result.code === 0
                ? 'bg-emerald-500/10 border-emerald-500/20'
                : 'bg-red-500/10 border-red-500/20'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <Badge
                variant={result.code === 0 ? 'success' : 'danger'}
                dot
              >
                Code {result.code}
              </Badge>
              <span className="text-xs text-gray-500">
                {TRANSFER_RESTRICTION_CODES[result.code] ?? 'UNKNOWN'}
              </span>
            </div>
            <p
              className={`text-sm font-medium ${
                result.code === 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {result.message}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

/** B) Transfer Group Matrix */
function TransferGroupMatrix({
  tokenAddress,
}: {
  tokenAddress: string;
}) {
  const [maxGroup, setMaxGroup] = useState(5);
  const [matrix, setMatrix] = useState<GroupTransferTime[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadMatrix = useCallback(async () => {
    const contract = getContract(tokenAddress);
    if (!contract) {
      setError('Wallet not connected.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const results: GroupTransferTime[] = [];
      const promises: Promise<void>[] = [];

      for (let from = 0; from <= maxGroup; from++) {
        for (let to = 0; to <= maxGroup; to++) {
          const f = from;
          const t = to;
          promises.push(
            contract.getAllowGroupTransferTime(f, t).then((ts: bigint) => {
              results.push({ fromGroup: f, toGroup: t, timestamp: ts });
            }),
          );
        }
      }

      await Promise.all(promises);
      setMatrix(results);
    } catch (err) {
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, maxGroup]);

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  const getCell = (from: number, to: number): bigint => {
    const entry = matrix.find(
      (m) => m.fromGroup === from && m.toGroup === to,
    );
    return entry?.timestamp ?? 0n;
  };

  const getCellStyle = (ts: bigint): string => {
    if (ts === 0n) return 'bg-red-500/20 text-red-400';
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (ts <= now) return 'bg-emerald-500/20 text-emerald-400';
    return 'bg-amber-500/20 text-amber-400';
  };

  const getCellLabel = (ts: bigint): string => {
    if (ts === 0n) return 'Never';
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (ts <= now) return 'Allowed';
    const date = new Date(Number(ts) * 1000);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  };

  const groups = Array.from({ length: maxGroup + 1 }, (_, i) => i);

  return (
    <Card
      title="Transfer Group Matrix"
      subtitle="Group-to-group transfer allowance times"
      action={
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Max Group:</label>
          <input
            className="bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-1.5 text-white text-xs w-16 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            type="number"
            min={1}
            max={20}
            value={maxGroup}
            onChange={(e) => setMaxGroup(Math.min(20, Math.max(1, parseInt(e.target.value) || 5)))}
          />
        </div>
      }
      compact
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" label="Loading group matrix" />
        </div>
      ) : error ? (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      ) : (
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="px-2 py-2 text-gray-500 text-left font-medium">From \ To</th>
                {groups.map((g) => (
                  <th key={g} className="px-2 py-2 text-gray-400 text-center font-medium">
                    G{g}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((from) => (
                <tr key={from}>
                  <td className="px-2 py-1.5 text-gray-400 font-medium">G{from}</td>
                  {groups.map((to) => {
                    const ts = getCell(from, to);
                    return (
                      <td key={to} className="px-1 py-1">
                        <div
                          className={`rounded-lg px-2 py-1.5 text-center text-[10px] font-medium ${getCellStyle(ts)}`}
                          title={ts > 0n ? new Date(Number(ts) * 1000).toISOString() : 'Not allowed'}
                        >
                          {getCellLabel(ts)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-4 mt-4 text-[10px]">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-emerald-500/30" />
              <span className="text-gray-500">Allowed now</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-amber-500/30" />
              <span className="text-gray-500">Future date</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-red-500/30" />
              <span className="text-gray-500">Never</span>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/** C) Frozen Address Checker */
function FrozenAddressChecker({
  tokenAddress,
}: {
  tokenAddress: string;
}) {
  const [checkAddr, setCheckAddr] = useState('');
  const [frozenStatus, setFrozenStatus] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [events, setEvents] = useState<FreezeEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  // Load recent AddressFrozen events
  useEffect(() => {
    const loadEvents = async () => {
      const contract = getContract(tokenAddress);
      const provider = getProvider();
      if (!contract || !provider) {
        setEventsLoading(false);
        return;
      }

      try {
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 50_000);
        const filter = contract.filters.AddressFrozen();
        const logs = await contract.queryFilter(filter, fromBlock);

        const parsed: FreezeEvent[] = [];
        for (const log of logs.slice(-20)) {
          const eventLog = log as ethers.EventLog;
          const ts = await resolveBlockTimestamp(provider, eventLog.blockNumber);
          parsed.push({
            admin: eventLog.args[0] as string,
            addr: eventLog.args[1] as string,
            status: eventLog.args[2] as boolean,
            blockNumber: eventLog.blockNumber,
            timestamp: ts,
          });
        }

        setEvents(parsed.reverse());
      } catch {
        // Silently fail for events -- not critical
      } finally {
        setEventsLoading(false);
      }
    };

    loadEvents();
  }, [tokenAddress]);

  const handleCheck = useCallback(async () => {
    setError('');
    setFrozenStatus(null);

    if (!ethers.isAddress(checkAddr)) {
      setError('Enter a valid Ethereum address.');
      return;
    }

    const contract = getContract(tokenAddress);
    if (!contract) {
      setError('Wallet not connected.');
      return;
    }

    setChecking(true);
    try {
      const status: boolean = await contract.getFrozenStatus(checkAddr);
      setFrozenStatus(status);
    } catch (err) {
      setError(parseContractError(err));
    } finally {
      setChecking(false);
    }
  }, [tokenAddress, checkAddr]);

  return (
    <Card title="Frozen Address Checker" compact>
      <div className="space-y-4">
        <div className="flex gap-3">
          <input
            className={INPUT_CLASS}
            placeholder="Enter address to check..."
            value={checkAddr}
            onChange={(e) => setCheckAddr(e.target.value)}
          />
          <button
            className={`${BUTTON_CLASS} shrink-0`}
            onClick={handleCheck}
            disabled={checking}
          >
            {checking ? <Spinner size="xs" /> : 'Check'}
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {frozenStatus !== null && (
          <div
            className={`rounded-xl px-4 py-3 border flex items-center gap-3 ${
              frozenStatus
                ? 'bg-red-500/10 border-red-500/20'
                : 'bg-emerald-500/10 border-emerald-500/20'
            }`}
          >
            <Badge variant={frozenStatus ? 'danger' : 'success'} dot>
              {frozenStatus ? 'FROZEN' : 'NOT FROZEN'}
            </Badge>
            <span className="text-xs text-gray-400 font-mono">
              {truncateAddress(checkAddr)}
            </span>
          </div>
        )}

        {/* Recent freeze/unfreeze events */}
        <div>
          <p className={SECTION_LABEL}>Recent Freeze Events</p>
          {eventsLoading ? (
            <div className="flex justify-center py-6">
              <Spinner size="sm" />
            </div>
          ) : events.length === 0 ? (
            <p className="text-xs text-gray-600 py-4 text-center">
              No recent freeze events found.
            </p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {events.map((evt, idx) => (
                <div
                  key={`${evt.blockNumber}-${idx}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] border border-white/[0.04] px-3 py-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={evt.status ? 'danger' : 'success'} size="sm">
                      {evt.status ? 'Frozen' : 'Unfrozen'}
                    </Badge>
                    <span className="text-xs text-gray-300 font-mono truncate">
                      {truncateAddress(evt.addr)}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500 shrink-0">
                    {evt.timestamp
                      ? formatDateTime(new Date(evt.timestamp * 1000))
                      : `Block ${evt.blockNumber}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/** D) Pause Status */
function PauseStatus({ tokenAddress }: { tokenAddress: string }) {
  const [paused, setPaused] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<PauseEvent[]>([]);

  useEffect(() => {
    const load = async () => {
      const contract = getContract(tokenAddress);
      const provider = getProvider();
      if (!contract || !provider) {
        setLoading(false);
        return;
      }

      try {
        const isPaused: boolean = await contract.isPaused();
        setPaused(isPaused);

        // Load pause events
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 50_000);
        const filter = contract.filters.Pause();
        const logs = await contract.queryFilter(filter, fromBlock);

        const parsed: PauseEvent[] = [];
        for (const log of logs.slice(-10)) {
          const eventLog = log as ethers.EventLog;
          const ts = await resolveBlockTimestamp(provider, eventLog.blockNumber);
          parsed.push({
            admin: eventLog.args[0] as string,
            status: eventLog.args[1] as boolean,
            blockNumber: eventLog.blockNumber,
            timestamp: ts,
          });
        }
        setEvents(parsed.reverse());
      } catch {
        // Status will remain null
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [tokenAddress]);

  return (
    <Card title="Pause Status" compact>
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Large status indicator */}
          <div
            className={`rounded-xl px-6 py-6 border text-center ${
              paused
                ? 'bg-red-500/10 border-red-500/20'
                : 'bg-emerald-500/10 border-emerald-500/20'
            }`}
          >
            <div
              className={`text-3xl font-bold mb-2 ${
                paused ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              {paused === null ? 'Unknown' : paused ? 'PAUSED' : 'ACTIVE'}
            </div>
            <p className="text-xs text-gray-500">
              {paused
                ? 'All transfers are currently paused'
                : 'Transfers are operating normally'}
            </p>
          </div>

          {/* Event history */}
          {events.length > 0 && (
            <div>
              <p className={SECTION_LABEL}>Pause History</p>
              <div className="space-y-2">
                {events.map((evt, idx) => (
                  <div
                    key={`${evt.blockNumber}-${idx}`}
                    className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] border border-white/[0.04] px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant={evt.status ? 'danger' : 'success'} size="sm">
                        {evt.status ? 'Paused' : 'Unpaused'}
                      </Badge>
                      <span className="text-xs text-gray-400 font-mono">
                        by {truncateAddress(evt.admin)}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-500 shrink-0">
                      {evt.timestamp
                        ? formatDateTime(new Date(evt.timestamp * 1000))
                        : `Block ${evt.blockNumber}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** E) Max Balance Utilization */
function MaxBalanceUtilization({
  tokenAddress,
}: {
  tokenAddress: string;
}) {
  const { wallet } = useWalletStore();
  const [queryAddr, setQueryAddr] = useState('');
  const [balance, setBalance] = useState<bigint | null>(null);
  const [maxBalance, setMaxBalance] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const effectiveAddr = queryAddr || wallet.address;

  const handleCheck = useCallback(async () => {
    const addr = effectiveAddr;
    if (!addr || !ethers.isAddress(addr)) {
      setError('Enter a valid Ethereum address or connect your wallet.');
      return;
    }

    const contract = getContract(tokenAddress);
    if (!contract) {
      setError('Wallet not connected.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [bal, max] = await Promise.all([
        contract.balanceOf(addr) as Promise<bigint>,
        contract.getMaxBalance(addr) as Promise<bigint>,
      ]);
      setBalance(bal);
      setMaxBalance(max);
    } catch (err) {
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, effectiveAddr]);

  // Auto-check connected wallet
  useEffect(() => {
    if (wallet.address && !queryAddr) {
      handleCheck();
    }
  }, [wallet.address]); // eslint-disable-line react-hooks/exhaustive-deps

  const utilization =
    balance !== null && maxBalance !== null && maxBalance > 0n
      ? Number((balance * 10000n) / maxBalance) / 100
      : 0;

  const isWarning = utilization >= 80;
  const isDanger = utilization >= 95;

  return (
    <Card title="Max Balance Utilization" compact>
      <div className="space-y-4">
        <div className="flex gap-3">
          <input
            className={INPUT_CLASS}
            placeholder={wallet.address ? `Default: ${truncateAddress(wallet.address)}` : '0x...'}
            value={queryAddr}
            onChange={(e) => setQueryAddr(e.target.value)}
          />
          <button
            className={`${BUTTON_CLASS} shrink-0`}
            onClick={handleCheck}
            disabled={loading}
          >
            {loading ? <Spinner size="xs" /> : 'Check'}
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {balance !== null && maxBalance !== null && (
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.04] p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Current Balance</span>
              <span className="text-white font-medium">{formatWeiAmount(balance)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Max Balance</span>
              <span className="text-white font-medium">
                {maxBalance === 0n ? 'Unlimited' : formatWeiAmount(maxBalance)}
              </span>
            </div>

            {maxBalance > 0n && (
              <>
                {/* Progress bar */}
                <div className="relative h-3 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                      isDanger
                        ? 'bg-gradient-to-r from-red-500 to-red-400'
                        : isWarning
                          ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                          : 'bg-gradient-to-r from-indigo-500 to-violet-500'
                    }`}
                    style={{ width: `${Math.min(100, utilization)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs">
                  <span
                    className={
                      isDanger
                        ? 'text-red-400 font-semibold'
                        : isWarning
                          ? 'text-amber-400 font-semibold'
                          : 'text-gray-400'
                    }
                  >
                    {utilization.toFixed(1)}% utilized
                  </span>
                  <span className="text-gray-500">
                    {formatWeiAmount(maxBalance - balance)} remaining
                  </span>
                </div>

                {isWarning && (
                  <div
                    className={`rounded-lg px-3 py-2 text-xs font-medium ${
                      isDanger
                        ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                        : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
                    }`}
                  >
                    {isDanger
                      ? 'Critical: Balance is at or near the maximum limit.'
                      : 'Warning: Balance is approaching the maximum limit.'}
                  </div>
                )}
              </>
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

export default function ComplianceMonitor({ tokenAddress }: ComplianceMonitorProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TransferRestrictionChecker tokenAddress={tokenAddress} />
        <FrozenAddressChecker tokenAddress={tokenAddress} />
      </div>

      <TransferGroupMatrix tokenAddress={tokenAddress} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PauseStatus tokenAddress={tokenAddress} />
        <MaxBalanceUtilization tokenAddress={tokenAddress} />
      </div>
    </div>
  );
}
