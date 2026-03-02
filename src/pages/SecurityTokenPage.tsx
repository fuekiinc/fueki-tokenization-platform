/**
 * SecurityTokenPage -- Main hub for managing ERC-1404 security tokens.
 *
 * Provides a token selector for wallets that have deployed multiple tokens,
 * a header with the selected token's identity and quick stats, and a tabbed
 * interface for Overview, Admin, Investors, Vesting, Dividends, Swaps,
 * Compliance, and Analytics.
 */

import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import clsx from 'clsx';
import {
  Shield,
  LayoutDashboard,
  Settings,
  Users,
  CalendarClock,
  Banknote,
  ArrowRightLeft,
  ShieldAlert,
  BarChart3,
  Wallet,
  Pause,
} from 'lucide-react';
import { SecurityTokenABI } from '../contracts/abis/SecurityToken';
import { useWalletStore, getProvider } from '../store/walletStore';
import { useAuthStore } from '../store/authStore';
import { useDemoWalletStore } from '../components/DemoMode/DemoWalletProvider';
import { formatWeiAmount, truncateAddress } from '../lib/formatters';
import { retryAsync } from '../lib/utils/retry';
import Spinner from '../components/Common/Spinner';
import Badge from '../components/Common/Badge';

// ---------------------------------------------------------------------------
// Lazy-loaded tab components
// ---------------------------------------------------------------------------

import TokenSelector from '../components/SecurityToken/TokenSelector';
import TokenOverview from '../components/SecurityToken/TokenOverview';
import AdminDashboard from '../components/SecurityToken/AdminDashboard';
import InvestorManager from '../components/SecurityToken/InvestorManager';
import VestingManager from '../components/SecurityToken/VestingManager';
import DividendManager from '../components/SecurityToken/DividendManager';
import SwapCenter from '../components/SecurityToken/SwapCenter';
import ComplianceMonitor from '../components/SecurityToken/ComplianceMonitor';
import TokenAnalytics from '../components/SecurityToken/TokenAnalytics';
import HolderPortfolio from '../components/SecurityToken/HolderPortfolio';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

interface TabDef {
  id: string;
  label: string;
  icon: React.ElementType;
}

const TABS: TabDef[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'admin', label: 'Admin', icon: Settings },
  { id: 'investors', label: 'Investors', icon: Users },
  { id: 'vesting', label: 'Vesting', icon: CalendarClock },
  { id: 'dividends', label: 'Dividends', icon: Banknote },
  { id: 'swaps', label: 'Swaps', icon: ArrowRightLeft },
  { id: 'compliance', label: 'Compliance', icon: ShieldAlert },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'portfolio', label: 'My Portfolio', icon: Wallet },
];

// ---------------------------------------------------------------------------
// Quick Stats (shown in the page header)
// ---------------------------------------------------------------------------

interface QuickStats {
  name: string;
  symbol: string;
  totalSupply: bigint;
  decimals: number;
  isPaused: boolean;
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function SecurityTokenPage() {
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const isConnected = useWalletStore((s) => s.wallet.isConnected);
  const isDemoActive = useAuthStore((s) => s.user?.demoActive === true);
  const demoWalletSettingUp = useDemoWalletStore((s) => s.isSettingUp);
  const demoWalletReady = useDemoWalletStore((s) => s.isReady);

  // -----------------------------------------------------------------------
  // Fetch quick stats for header
  // -----------------------------------------------------------------------

  const fetchQuickStats = useCallback(async () => {
    if (!selectedToken) {
      setQuickStats(null);
      return;
    }

    const provider = getProvider();
    if (!provider) return;

    setStatsLoading(true);
    try {
      const contract = new ethers.Contract(selectedToken, SecurityTokenABI, provider);
      const [name, symbol, totalSupply, decimals, isPaused] = await retryAsync(
        () =>
          Promise.all([
            contract.name() as Promise<string>,
            contract.symbol() as Promise<string>,
            contract.totalSupply() as Promise<bigint>,
            contract.decimals() as Promise<bigint>,
            contract.isPaused() as Promise<boolean>,
          ]),
        { maxAttempts: 3, baseDelayMs: 1_500, label: 'securityToken:quickStats' },
      );
      setQuickStats({
        name,
        symbol,
        totalSupply,
        decimals: Number(decimals),
        isPaused,
      });
    } catch (err) {
      // Non-fatal: header stats are supplementary
      setQuickStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [selectedToken]);

  useEffect(() => {
    void fetchQuickStats();
  }, [fetchQuickStats]);

  // -----------------------------------------------------------------------
  // Demo wallet loading
  // -----------------------------------------------------------------------

  if (isDemoActive && !isConnected && (demoWalletSettingUp || !demoWalletReady)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-gray-400">Setting up demo wallet…</p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Not connected
  // -----------------------------------------------------------------------

  if (!isConnected) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 px-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/[0.08]">
          <Wallet className="h-8 w-8 text-indigo-400" aria-hidden="true" />
        </div>
        <div className="text-center">
          <h1 className="text-xl font-semibold text-white">Connect Your Wallet</h1>
          <p className="text-sm text-gray-500 mt-2 max-w-sm">
            Connect your wallet to view and manage your security tokens.
          </p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render active tab content
  // -----------------------------------------------------------------------

  function renderTabContent() {
    if (!selectedToken) {
      return null;
    }

    switch (activeTab) {
      case 'overview':
        return <TokenOverview tokenAddress={selectedToken} />;
      case 'admin':
        return <AdminDashboard tokenAddress={selectedToken} />;
      case 'investors':
        return <InvestorManager tokenAddress={selectedToken} />;
      case 'vesting':
        return <VestingManager tokenAddress={selectedToken} />;
      case 'dividends':
        return <DividendManager tokenAddress={selectedToken} />;
      case 'swaps':
        return <SwapCenter tokenAddress={selectedToken} />;
      case 'compliance':
        return <ComplianceMonitor tokenAddress={selectedToken} />;
      case 'analytics':
        return <TokenAnalytics tokenAddress={selectedToken} />;
      case 'portfolio':
        return <HolderPortfolio tokenAddress={selectedToken} />;
      default:
        return null;
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          Security Tokens
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your ERC-1404 compliant security tokens.
        </p>
      </div>

      {/* Token Selector */}
      <TokenSelector
        selectedToken={selectedToken}
        onSelectToken={setSelectedToken}
      />

      {/* Header with Quick Stats */}
      {selectedToken && quickStats && (
        <div
          className={clsx(
            'relative overflow-hidden rounded-2xl',
            'bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06]',
            'shadow-[0_4px_24px_-4px_rgba(0,0,0,0.3)]',
          )}
        >
          {/* Gradient top border */}
          <div
            className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500"
            aria-hidden="true"
          />

          <div className="px-7 py-6 sm:px-9 sm:py-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              {/* Token identity */}
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20">
                  <Shield className="h-6 w-6 text-indigo-400" aria-hidden="true" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg sm:text-xl font-semibold text-white">
                      {quickStats.name}
                    </h2>
                    <Badge variant="primary" size="sm">
                      {quickStats.symbol}
                    </Badge>
                    {quickStats.isPaused && (
                      <Badge variant="warning" size="sm" dot>
                        Paused
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">
                    {truncateAddress(selectedToken, 8)}
                  </p>
                </div>
              </div>

              {/* Quick stats pills */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="text-right">
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
                    Total Supply
                  </p>
                  <p className="text-sm font-medium text-white tabular-nums mt-0.5">
                    {formatWeiAmount(quickStats.totalSupply, quickStats.decimals, 2)}
                  </p>
                </div>
                <div
                  className="h-8 w-px bg-white/[0.06]"
                  aria-hidden="true"
                />
                <div className="text-right">
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
                    Status
                  </p>
                  <div className="mt-0.5">
                    {quickStats.isPaused ? (
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-400">
                        <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                        Paused
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Active
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats loading indicator */}
      {selectedToken && statsLoading && !quickStats && (
        <div className="flex items-center gap-3 rounded-2xl bg-[#0D0F14]/80 border border-white/[0.06] px-7 py-6">
          <Spinner size="sm" label="Loading stats" />
          <span className="text-sm text-gray-400">Loading token details...</span>
        </div>
      )}

      {/* Tab Bar */}
      {selectedToken && (
        <div className="relative">
          {/* Scrollable tab container */}
          <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
            <nav
              className={clsx(
                'inline-flex items-center gap-1 p-1',
                'rounded-xl bg-white/[0.03] border border-white/[0.04]',
                'min-w-max',
              )}
              role="tablist"
              aria-label="Security token management sections"
            >
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`tabpanel-${tab.id}`}
                    onClick={() => setActiveTab(tab.id)}
                    className={clsx(
                      'relative flex items-center gap-2 rounded-lg px-3.5 py-2',
                      'text-[13px] font-medium whitespace-nowrap',
                      'transition-all duration-200',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60',
                      isActive
                        ? 'text-white'
                        : 'text-gray-500 hover:text-gray-300',
                    )}
                  >
                    {/* Active background */}
                    {isActive && (
                      <span
                        className="absolute inset-0 rounded-lg bg-indigo-500/20 border border-indigo-500/30"
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative flex items-center gap-2">
                      <Icon
                        className={clsx(
                          'h-4 w-4',
                          isActive ? 'text-indigo-400' : 'text-gray-600',
                        )}
                        aria-hidden="true"
                      />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {selectedToken && (
        <div
          id={`tabpanel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
        >
          {renderTabContent()}
        </div>
      )}
    </div>
  );
}
