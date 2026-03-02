/**
 * TokenOverview -- The "Overview" tab for a selected security token.
 *
 * Displays:
 *   - Token name, symbol, decimals
 *   - Total supply / max total supply with a progress bar
 *   - Document hash and type
 *   - Transfer rules address
 *   - Pause status with toggle (if Contract Admin)
 *   - Current snapshot ID
 *   - Creator address and creation timestamp
 *   - Quick role indicators for the connected wallet
 */

import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  Shield,
  Coins,
  FileText,
  Clock,
  Pause,
  Play,
  Camera,
  User,
  Link as LinkIcon,
  Copy,
  Check,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import {
  SecurityTokenABI,
  ALL_ROLES,
  ROLE_LABELS,
  ROLE_CONTRACT_ADMIN,
} from '../../contracts/abis/SecurityToken';
import { useWalletStore, getProvider } from '../../store/walletStore';
import { parseContractError, getReadOnlyProvider } from '../../lib/blockchain/contracts';
import { truncateAddress, formatWeiAmount, formatDateTime } from '../../lib/formatters';
import { copyToClipboard } from '../../lib/utils/helpers';
import Card from '../Common/Card';
import Badge from '../Common/Badge';
import Spinner from '../Common/Spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TokenOverviewProps {
  tokenAddress: string;
}

interface TokenData {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  maxTotalSupply: bigint;
  isPaused: boolean;
  snapshotId: bigint;
  transferRules: string;
  documentHash: string;
  documentType: string;
  creator: string;
  createdAt: bigint;
}

interface UserRoles {
  [role: number]: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function CopyableAddress({ address, label }: { address: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await copyToClipboard(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy address');
    }
  }, [address]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 text-sm font-mono text-gray-300 hover:text-white transition-colors group"
      title={`Copy ${label ?? 'address'}: ${address}`}
    >
      <span>{truncateAddress(address, 6)}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-gray-500 group-hover:text-gray-300 transition-colors" aria-hidden="true" />
      )}
    </button>
  );
}

function InfoRow({
  label,
  children,
  icon: Icon,
}: {
  label: string;
  children: React.ReactNode;
  icon?: React.ElementType;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-white/[0.04] last:border-b-0">
      <div className="flex items-center gap-2 text-sm text-gray-400 shrink-0">
        {Icon && <Icon className="h-4 w-4 text-gray-500" aria-hidden="true" />}
        {label}
      </div>
      <div className="text-sm text-right min-w-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TokenOverview({ tokenAddress }: TokenOverviewProps) {
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [userRoles, setUserRoles] = useState<UserRoles>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pausing, setPausing] = useState(false);

  const walletAddress = useWalletStore((s) => s.wallet.address);

  // -----------------------------------------------------------------------
  // Fetch token data
  // -----------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    const { chainId } = useWalletStore.getState().wallet;
    if (!chainId || !tokenAddress) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const readProvider = getReadOnlyProvider(chainId);
      const contract = new ethers.Contract(tokenAddress, SecurityTokenABI, readProvider);

      // Batch all read calls
      const [
        name,
        symbol,
        decimals,
        totalSupply,
        maxTotalSupply,
        isPaused,
        snapshotId,
        transferRules,
      ] = await Promise.all([
        contract.name() as Promise<string>,
        contract.symbol() as Promise<string>,
        contract.decimals() as Promise<bigint>,
        contract.totalSupply() as Promise<bigint>,
        contract.maxTotalSupply() as Promise<bigint>,
        contract.isPaused() as Promise<boolean>,
        contract.getCurrentSnapshotId() as Promise<bigint>,
        contract.transferRules() as Promise<string>,
      ]);

      // Document hash and type are stored in the factory, not the token itself.
      // We read creator / createdAt / documentHash / documentType from the factory.
      let documentHash = '';
      let documentType = '';
      let creator = ethers.ZeroAddress;
      let createdAt = 0n;

      try {
        const { getNetworkConfig: getConfig } = await import('../../contracts/addresses');
        const chainId = useWalletStore.getState().wallet.chainId;
        if (chainId) {
          const config = getConfig(chainId);
          if (config?.securityTokenFactoryAddress) {
            const { SecurityTokenFactoryABI: FactoryABI } = await import(
              '../../contracts/abis/SecurityTokenFactory'
            );
            const factory = new ethers.Contract(
              config.securityTokenFactoryAddress,
              FactoryABI,
              readProvider,
            );
            const details = await factory.getTokenDetails(tokenAddress);
            documentHash = details.documentHash ?? '';
            documentType = details.documentType ?? '';
            creator = details.creator ?? ethers.ZeroAddress;
            createdAt = BigInt(details.createdAt ?? 0);
          }
        }
      } catch {
        // Factory data is optional; the overview still shows on-chain token data.
      }

      setTokenData({
        name,
        symbol,
        decimals: Number(decimals),
        totalSupply,
        maxTotalSupply,
        isPaused,
        snapshotId,
        transferRules,
        documentHash,
        documentType,
        creator,
        createdAt,
      });

      // Fetch user roles
      if (walletAddress) {
        const roleChecks = await Promise.all(
          ALL_ROLES.map(async (role) => {
            try {
              const has = await contract.hasRole(walletAddress, role);
              return [role, has] as const;
            } catch {
              return [role, false] as const;
            }
          }),
        );
        const roles: UserRoles = {};
        for (const [role, has] of roleChecks) {
          roles[role] = has;
        }
        setUserRoles(roles);
      }
    } catch (err) {
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, walletAddress]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // -----------------------------------------------------------------------
  // Pause / Unpause
  // -----------------------------------------------------------------------

  const handleTogglePause = useCallback(async () => {
    if (!tokenData) return;
    const provider = getProvider();
    if (!provider) return;

    setPausing(true);
    try {
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(tokenAddress, SecurityTokenABI, signer);

      const tx = tokenData.isPaused
        ? await contract.unpause()
        : await contract.pause();
      await tx.wait();

      toast.success(
        tokenData.isPaused ? 'Token unpaused successfully' : 'Token paused successfully',
      );
      setTokenData((prev) =>
        prev ? { ...prev, isPaused: !prev.isPaused } : prev,
      );
    } catch (err) {
      toast.error(parseContractError(err));
    } finally {
      setPausing(false);
    }
  }, [tokenAddress, tokenData]);

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Spinner size="lg" label="Loading token overview" />
        <p className="text-sm text-gray-500">Loading token data...</p>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Error
  // -----------------------------------------------------------------------

  if (error || !tokenData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertCircle className="h-7 w-7 text-red-400" aria-hidden="true" />
        </div>
        <p className="text-sm text-red-300">{error ?? 'Failed to load token data'}</p>
        <button
          type="button"
          onClick={() => void fetchData()}
          className="text-xs text-indigo-400 hover:text-indigo-300 underline"
        >
          Try Again
        </button>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------

  const supplyPercent =
    tokenData.maxTotalSupply > 0n
      ? Number((tokenData.totalSupply * 10000n) / tokenData.maxTotalSupply) / 100
      : 0;

  const formattedTotalSupply = formatWeiAmount(
    tokenData.totalSupply,
    tokenData.decimals,
    4,
  );
  const formattedMaxSupply = formatWeiAmount(
    tokenData.maxTotalSupply,
    tokenData.decimals,
    4,
  );

  const isContractAdmin = userRoles[ROLE_CONTRACT_ADMIN] === true;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Token Identity + Supply Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Token Identity */}
        <Card title="Token Identity" subtitle="Core token details">
          <div className="space-y-0">
            <InfoRow label="Name" icon={Shield}>
              <span className="text-white font-medium">{tokenData.name}</span>
            </InfoRow>
            <InfoRow label="Symbol" icon={Coins}>
              <Badge variant="primary" size="sm">
                {tokenData.symbol}
              </Badge>
            </InfoRow>
            <InfoRow label="Decimals">
              <span className="text-white">{tokenData.decimals}</span>
            </InfoRow>
            <InfoRow label="Creator" icon={User}>
              <CopyableAddress address={tokenData.creator} label="creator address" />
            </InfoRow>
            {tokenData.createdAt > 0n && (
              <InfoRow label="Created" icon={Clock}>
                <span className="text-gray-300">
                  {formatDateTime(Number(tokenData.createdAt) * 1000)}
                </span>
              </InfoRow>
            )}
          </div>
        </Card>

        {/* Supply Stats */}
        <Card title="Supply" subtitle="Token supply statistics">
          <div className="space-y-5">
            {/* Supply progress bar */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
                  Total Supply
                </span>
                <span className="text-xs text-gray-400">
                  {supplyPercent.toFixed(1)}% of max
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
                  style={{ width: `${Math.min(supplyPercent, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm font-medium text-white tabular-nums">
                  {formattedTotalSupply}
                </span>
                <span className="text-sm text-gray-500 tabular-nums">
                  / {formattedMaxSupply}
                </span>
              </div>
            </div>

            {/* Snapshot ID */}
            <InfoRow label="Current Snapshot ID" icon={Camera}>
              <span className="text-white font-mono">
                {tokenData.snapshotId.toString()}
              </span>
            </InfoRow>
          </div>
        </Card>
      </div>

      {/* Pause Status + Document + Transfer Rules */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pause Status */}
        <Card title="Pause Status" subtitle="Transfer controls">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {tokenData.isPaused ? (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <Pause className="h-5 w-5 text-amber-400" aria-hidden="true" />
                </div>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <Play className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-white">
                  {tokenData.isPaused ? 'Paused' : 'Active'}
                </p>
                <p className="text-xs text-gray-500">
                  {tokenData.isPaused
                    ? 'All transfers are blocked'
                    : 'Transfers are permitted'}
                </p>
              </div>
            </div>

            {isContractAdmin && (
              <button
                type="button"
                onClick={handleTogglePause}
                disabled={pausing}
                className={clsx(
                  'rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  tokenData.isPaused
                    ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20',
                )}
              >
                {pausing ? (
                  <Spinner size="xs" label="Processing" />
                ) : tokenData.isPaused ? (
                  'Unpause'
                ) : (
                  'Pause'
                )}
              </button>
            )}
          </div>
        </Card>

        {/* Document */}
        <Card title="Document" subtitle="On-chain metadata">
          <div className="space-y-0">
            <InfoRow label="Type" icon={FileText}>
              <span className="text-gray-300">
                {tokenData.documentType || 'Not set'}
              </span>
            </InfoRow>
            <InfoRow label="Hash">
              {tokenData.documentHash ? (
                <CopyableAddress address={tokenData.documentHash} label="document hash" />
              ) : (
                <span className="text-gray-500">Not set</span>
              )}
            </InfoRow>
          </div>
        </Card>

        {/* Transfer Rules */}
        <Card title="Transfer Rules" subtitle="Compliance contract">
          <div className="space-y-0">
            <InfoRow label="Address" icon={LinkIcon}>
              <CopyableAddress
                address={tokenData.transferRules}
                label="transfer rules address"
              />
            </InfoRow>
          </div>
        </Card>
      </div>

      {/* Role Indicators */}
      {walletAddress && (
        <Card title="Your Roles" subtitle="Permissions for the connected wallet">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ALL_ROLES.map((role) => {
              const hasRole = userRoles[role] === true;
              return (
                <div
                  key={role}
                  className={clsx(
                    'flex items-center gap-2.5 rounded-xl px-4 py-3 border',
                    hasRole
                      ? 'bg-emerald-500/10 border-emerald-500/20'
                      : 'bg-white/[0.02] border-white/[0.04]',
                  )}
                >
                  <ShieldCheck
                    className={clsx(
                      'h-4 w-4 shrink-0',
                      hasRole ? 'text-emerald-400' : 'text-gray-600',
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p
                      className={clsx(
                        'text-xs font-medium truncate',
                        hasRole ? 'text-emerald-300' : 'text-gray-500',
                      )}
                    >
                      {ROLE_LABELS[role]}
                    </p>
                    <p className="text-[10px] text-gray-600">
                      {hasRole ? 'Granted' : 'Not granted'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
