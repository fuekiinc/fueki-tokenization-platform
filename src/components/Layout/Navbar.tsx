import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Check, ChevronDown, LogOut, Menu, X } from 'lucide-react';
import clsx from 'clsx';
import { ConnectButton as ThirdwebConnectButton } from 'thirdweb/react';
import FuekiBrand from '../Brand/FuekiBrand';
import { useWallet } from '../../hooks/useWallet';
import { useWalletStore } from '../../store/walletStore.ts';
import { useAuthStore } from '../../store/authStore';
import { ComponentErrorBoundary } from '../ErrorBoundary';
import logger from '../../lib/logger';
import {
  THIRDWEB_DEFAULT_CHAIN,
  THIRDWEB_SUPPORTED_CHAINS,
  THIRDWEB_THEME,
  THIRDWEB_WALLETS,
  THIRDWEB_WALLETCONNECT_PROJECT_ID,
  getThirdwebAppMetadata,
  isThirdwebConfigured,
  thirdwebClient,
} from '../../lib/thirdweb';
import ThemeToggle from './ThemeToggle';
import PendingTransactions from './PendingTransactions';

// ---------------------------------------------------------------------------
// Supported networks
// ---------------------------------------------------------------------------

interface NetworkOption {
  chainId: number;
  name: string;
  shortName: string;
  explorerUrl: string;
  color: string;
  /** Whether this is a testnet (shown with a label in the UI). */
  isTestnet: boolean;
  /** Whether contracts are deployed on this network. */
  hasContracts: boolean;
}

const ALL_NETWORKS: NetworkOption[] = [
  {
    chainId: 1,
    name: 'Ethereum Mainnet',
    shortName: 'Ethereum',
    explorerUrl: 'https://etherscan.io',
    color: '#627EEA',
    isTestnet: false,
    hasContracts: true,
  },
  {
    chainId: 17000,
    name: 'Holesky Testnet',
    shortName: 'Holesky',
    explorerUrl: 'https://holesky.etherscan.io',
    color: '#E8B44A',
    isTestnet: true,
    hasContracts: true,
  },
  {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    shortName: 'Sepolia',
    explorerUrl: 'https://sepolia.etherscan.io',
    color: '#CFB5F0',
    isTestnet: true,
    hasContracts: false,
  },
  {
    chainId: 137,
    name: 'Polygon',
    shortName: 'Polygon',
    explorerUrl: 'https://polygonscan.com',
    color: '#8247E5',
    isTestnet: false,
    hasContracts: false,
  },
  {
    chainId: 42161,
    name: 'Arbitrum One',
    shortName: 'Arbitrum',
    explorerUrl: 'https://arbiscan.io',
    color: '#28A0F0',
    isTestnet: false,
    hasContracts: false,
  },
  {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    shortName: 'Arb Sepolia',
    explorerUrl: 'https://sepolia.arbiscan.io',
    color: '#28A0F0',
    isTestnet: true,
    hasContracts: false,
  },
  {
    chainId: 8453,
    name: 'Base',
    shortName: 'Base',
    explorerUrl: 'https://basescan.org',
    color: '#0052FF',
    isTestnet: false,
    hasContracts: false,
  },
  {
    chainId: 84532,
    name: 'Base Sepolia',
    shortName: 'Base Sepolia',
    explorerUrl: 'https://sepolia.basescan.org',
    color: '#4F46E5',
    isTestnet: true,
    hasContracts: false,
  },
  {
    chainId: 31337,
    name: 'Localhost',
    shortName: 'Localhost',
    explorerUrl: '',
    color: '#4ADE80',
    isTestnet: true,
    hasContracts: true,
  },
];

// Hide Localhost in production builds
const NETWORKS: NetworkOption[] = import.meta.env.DEV
  ? ALL_NETWORKS
  : ALL_NETWORKS.filter((n) => n.chainId !== 31337);

// ---------------------------------------------------------------------------
// Navigation items -- clean text, no icons
// ---------------------------------------------------------------------------

interface NavItem {
  label: string;
  to: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Mint', to: '/mint' },
  { label: 'Security Tokens', to: '/security-tokens' },
  { label: 'Portfolio', to: '/portfolio' },
  { label: 'Exchange', to: '/exchange' },
  { label: 'Orbital AMM', to: '/advanced' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Hook: close on outside click
// ---------------------------------------------------------------------------

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  handler: () => void,
) {
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handler();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, handler]);
}

// ---------------------------------------------------------------------------
// NetworkBadge -- small, subtle indicator for the current network
// ---------------------------------------------------------------------------

function NetworkBadge() {
  const wallet = useWalletStore((s) => s.wallet);
  const { isConnected } = useWallet();

  const currentNetwork = useMemo(
    () => NETWORKS.find((n) => n.chainId === wallet.chainId) ?? null,
    [wallet.chainId],
  );

  if (!isConnected || !currentNetwork) return null;

  return (
    <div
      className={clsx(
        'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium',
        'border border-white/[0.06] bg-white/[0.03] text-gray-400',
        currentNetwork.isTestnet && 'border-amber-500/15 bg-amber-500/[0.04]',
      )}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{
          backgroundColor: currentNetwork.color,
          boxShadow: `0 0 6px ${currentNetwork.color}50`,
        }}
      />
      <span className="hidden sm:inline">{currentNetwork.shortName}</span>
      {currentNetwork.isTestnet && (
        <span className="hidden sm:inline rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400">
          Testnet
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NetworkSelector -- dropdown for switching networks
// ---------------------------------------------------------------------------

function NetworkSelector({ compact = false }: { compact?: boolean }) {
  const wallet = useWalletStore((s) => s.wallet);
  const { switchNetwork, isConnected, isSwitchingNetwork } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);
  useClickOutside(dropdownRef, close);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Clear switchingTo when the chain actually changes or switching completes
  useEffect(() => {
    if (!isSwitchingNetwork && switchingTo !== null) {
      setSwitchingTo(null);
    }
  }, [isSwitchingNetwork, switchingTo]);

  const currentNetwork = useMemo(
    () => NETWORKS.find((n) => n.chainId === wallet.chainId) ?? null,
    [wallet.chainId],
  );

  // Separate mainnets and testnets for grouped display
  const mainnets = useMemo(() => NETWORKS.filter((n) => !n.isTestnet), []);
  const testnets = useMemo(() => NETWORKS.filter((n) => n.isTestnet), []);

  if (!isConnected) return null;

  const handleSwitchNetwork = async (chainId: number) => {
    if (chainId === wallet.chainId) {
      setIsOpen(false);
      return;
    }
    setSwitchingTo(chainId);
    await switchNetwork(chainId);
    setIsOpen(false);
  };

  const renderNetworkButton = (network: NetworkOption) => {
    const isActive = network.chainId === wallet.chainId;
    const isSwitching = switchingTo === network.chainId;

    return (
      <button
        key={network.chainId}
        type="button"
        disabled={isSwitching}
        onClick={() => void handleSwitchNetwork(network.chainId)}
        className={clsx(
          'flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm transition-all duration-150',
          isActive
            ? 'bg-white/[0.08] text-white'
            : 'text-gray-400 hover:bg-white/[0.04] hover:text-white',
          isSwitching && 'opacity-70',
        )}
      >
        <span
          className={clsx('h-3 w-3 shrink-0 rounded-full', isSwitching && 'animate-pulse')}
          style={{
            backgroundColor: network.color,
            boxShadow: isActive ? `0 0 10px ${network.color}50` : 'none',
          }}
        />
        <span className="flex-1 font-medium">
          {network.name}
          {!network.hasContracts && (
            <span className="ml-1.5 text-[10px] text-gray-500">(Coming Soon)</span>
          )}
        </span>
        {isSwitching ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-white" />
        ) : isActive ? (
          <Check className="h-4 w-4 text-cyan-300" />
        ) : null}
      </button>
    );
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={isSwitchingNetwork}
        className={clsx(
          'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium',
          'transition-all duration-200',
          'border-white/[0.06] bg-white/[0.03] text-gray-300',
          'hover:border-white/[0.1] hover:bg-white/[0.06] hover:text-white',
          isSwitchingNetwork && 'opacity-70 cursor-wait',
          compact && 'w-full',
        )}
      >
        {isSwitchingNetwork ? (
          <span className="h-2 w-2 shrink-0 animate-spin rounded-full border border-gray-500 border-t-white" />
        ) : (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              backgroundColor: currentNetwork?.color ?? '#FBBF24',
              boxShadow: `0 0 8px ${currentNetwork?.color ?? '#FBBF24'}40`,
            }}
          />
        )}
        <span className="truncate">
          {isSwitchingNetwork ? 'Switching...' : (currentNetwork?.shortName ?? 'Unknown')}
        </span>
        <ChevronDown
          className={clsx(
            'h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {isOpen && (
        <div
          className={clsx(
            'absolute z-50 mt-2 w-72 origin-top-right rounded-2xl p-1.5 shadow-2xl',
            'border border-white/[0.06] bg-[#0D0F14]/95 backdrop-blur-xl',
            'animate-scale-in',
            compact ? 'left-0 right-0 w-full' : 'right-0',
          )}
        >
          {/* Mainnets */}
          <div className="mb-1 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Mainnets
            </p>
          </div>
          {mainnets.map(renderNetworkButton)}

          {/* Testnets */}
          <div className="mb-1 mt-2 border-t border-white/[0.04] px-3 pt-3 pb-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-500/60">
              Testnets
            </p>
          </div>
          {testnets.map(renderNetworkButton)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WalletButton -- connect / connected state
// ---------------------------------------------------------------------------

function WalletButton({ compact = false }: { compact?: boolean }) {
  const { isConnecting, error: walletError } = useWallet();

  if (!thirdwebClient || !isThirdwebConfigured) {
    return (
      <button
        type="button"
        disabled
        className={clsx(
          'flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold',
          'border border-amber-500/30 bg-amber-500/10 text-amber-300',
          'cursor-not-allowed',
          compact && 'w-full',
        )}
        title="Set VITE_THIRDWEB_CLIENT_ID to enable wallet connectivity."
      >
        Wallet Config Required
      </button>
    );
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://fueki.io';

  return (
    <div className={clsx('wallet-connect-shell', compact && 'w-full')}>
      <ThirdwebConnectButton
        client={thirdwebClient}
        wallets={THIRDWEB_WALLETS}
        appMetadata={getThirdwebAppMetadata()}
        chain={THIRDWEB_DEFAULT_CHAIN}
        chains={THIRDWEB_SUPPORTED_CHAINS}
        theme={THIRDWEB_THEME}
        connectButton={{
          label: isConnecting ? 'Connecting...' : 'Connect Wallet',
          className: clsx('fueki-connect-button', compact && 'w-full'),
        }}
        detailsButton={{
          className: clsx('fueki-wallet-details-button', compact && 'w-full justify-between'),
        }}
        connectModal={{
          title: 'Connect to Fueki',
          titleIcon: '',
          size: 'wide',
          termsOfServiceUrl: `${origin}/terms`,
          privacyPolicyUrl: `${origin}/privacy`,
        }}
        showAllWallets={true}
        detailsModal={{
          showTestnetFaucet: true,
        }}
        walletConnect={
          THIRDWEB_WALLETCONNECT_PROJECT_ID
            ? { projectId: THIRDWEB_WALLETCONNECT_PROJECT_ID }
            : undefined
        }
      />
      {walletError && (
        <p className="mt-2 text-xs text-red-400">{walletError}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MobileSlideOver -- spacious, clean slide-over panel
// ---------------------------------------------------------------------------

function MobileSlideOver({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const location = useLocation();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close on route change
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Focus close button when panel opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to allow animation to start
      const timer = setTimeout(() => closeButtonRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
      {/* Overlay */}
      <div
        className="sidebar-overlay absolute inset-0 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={clsx(
          'absolute inset-y-0 right-0 w-[340px] max-w-[90vw]',
          'flex flex-col',
          'border-l border-white/[0.04] bg-[#0a0b0f]/98 backdrop-blur-2xl',
          'animate-slide-in-right',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-6">
          <FuekiBrand
            variant="full"
            imageClassName="h-8 w-auto drop-shadow-[0_8px_20px_rgba(8,24,38,0.45)]"
          />
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav links */}
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <nav className="space-y-1" aria-label="Mobile navigation">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 rounded-2xl px-5 py-3.5 text-[15px] font-medium transition-all duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60',
                    isActive
                      ? 'bg-white/[0.08] text-white'
                      : 'text-gray-400 hover:bg-white/[0.04] hover:text-white',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Active indicator bar */}
                    {isActive && (
                      <span
                        className="h-5 w-0.5 shrink-0 rounded-full bg-cyan-300"
                        aria-hidden="true"
                      />
                    )}
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Separator */}
          <div className="my-6 border-t border-white/[0.04]" />

          {/* Network + Wallet */}
          <div className="space-y-3">
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Wallet
            </p>
            <NetworkSelector compact />
            <WalletButton compact />
          </div>

          {/* Separator */}
          <div className="my-6 border-t border-white/[0.04]" />

          {/* Theme toggle (mobile) */}
          <div className="flex items-center justify-between px-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Theme
            </p>
            <ThemeToggle />
          </div>

          {/* Separator */}
          <div className="my-6 border-t border-white/[0.04]" />

          {/* Logout (mobile) */}
          <LogoutButton compact />
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.04] px-6 py-5">
          <FuekiBrand
            variant="full"
            className="justify-center"
            imageClassName="h-6 w-auto opacity-85"
          />
          <p className="mt-2 text-center text-[11px] text-gray-500">
            v1.0
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LogoutButton
// ---------------------------------------------------------------------------

function LogoutButton({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) return null;

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      logger.error('[LogoutButton] logout failed:', err);
      // Force navigate to login even if the API call fails so the
      // user is not stuck in an authenticated-but-broken state.
      navigate('/login');
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleLogout()}
      className={clsx(
        'flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium',
        'transition-all duration-150',
        'border-red-500/20 bg-red-500/[0.06] text-red-400',
        'hover:border-red-500/30 hover:bg-red-500/10',
        compact && 'w-full',
      )}
    >
      <LogOut className="h-4 w-4" />
      <span>Log Out</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Navbar
// ---------------------------------------------------------------------------

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on Escape
  useEffect(() => {
    if (!mobileMenuOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <>
      <nav
        aria-label="Primary navigation"
        className={clsx(
          'glass-navbar sticky top-0 z-50',
          'border-b border-white/[0.04]',
        )}
      >
        <div className="mx-auto max-w-[1920px] px-4 sm:px-8 md:px-12 lg:px-20 xl:px-32">
          <div className="flex h-20 items-center justify-between">

            {/* ---- Left: Logo + Nav Links ---- */}
            <div className="flex items-center gap-10">
              {/* Logo */}
              <Link
                to="/"
                className="group flex items-center transition-opacity duration-200 hover:opacity-90 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
              >
                <FuekiBrand
                  variant="full"
                  imageClassName="h-9 w-auto drop-shadow-[0_10px_24px_rgba(12,44,67,0.55)]"
                />
              </Link>

              {/* Desktop nav links -- NavLink auto-sets aria-current="page" when active */}
              <div className="hidden items-center gap-1 lg:flex" role="navigation" aria-label="Main navigation">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      clsx(
                        'relative rounded-full px-5 py-2.5 text-sm font-medium',
                        'transition-all duration-200',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent',
                        isActive
                          ? 'bg-white/[0.08] text-white'
                          : 'text-gray-400 hover:bg-white/[0.04] hover:text-white',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {item.label}
                        {/* Active route indicator dot */}
                        {isActive && (
                          <span
                            className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-cyan-300"
                            aria-hidden="true"
                          />
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>

            {/* ---- Right: Network Badge + Theme + Wallet + Hamburger ---- */}
            <div className="flex items-center gap-3">
              <NetworkBadge />

              {/* Theme toggle */}
              <ThemeToggle />

              {/* Pending transactions indicator -- isolated boundary so
                  a failure here does not take down the rest of the navbar. */}
              <div className="hidden sm:block">
                <ComponentErrorBoundary name="PendingTransactions" variant="inline">
                  <PendingTransactions />
                </ComponentErrorBoundary>
              </div>

              {/* Desktop wallet -- isolated boundary so wallet errors
                  (provider issues, disconnection race conditions) are
                  contained and do not break navigation. */}
              <div className="hidden sm:block">
                <ComponentErrorBoundary name="WalletButton" variant="inline">
                  <WalletButton />
                </ComponentErrorBoundary>
              </div>

              {/* Desktop logout */}
              <div className="hidden sm:block">
                <LogoutButton />
              </div>

              {/* Mobile hamburger */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                className={clsx(
                  'rounded-xl p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center transition-all duration-200 lg:hidden',
                  'text-gray-400 hover:bg-white/[0.06] hover:text-white',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60',
                )}
                aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile slide-over */}
      <MobileSlideOver
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />
    </>
  );
}
