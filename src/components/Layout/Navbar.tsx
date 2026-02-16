import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown, ExternalLink, Copy, LogOut, Check } from 'lucide-react';
import clsx from 'clsx';
import { useWallet } from '../../hooks/useWallet';
import { useWalletStore } from '../../store/walletStore.ts';
import { formatTokenAmount } from '../../lib/formatters';
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
}

const NETWORKS: NetworkOption[] = [
  {
    chainId: 1,
    name: 'Ethereum Mainnet',
    shortName: 'Ethereum',
    explorerUrl: 'https://etherscan.io',
    color: '#627EEA',
  },
  {
    chainId: 17000,
    name: 'Holesky',
    shortName: 'Holesky',
    explorerUrl: 'https://holesky.etherscan.io',
    color: '#E8B44A',
  },
  {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    shortName: 'Sepolia',
    explorerUrl: 'https://sepolia.etherscan.io',
    color: '#CFB5F0',
  },
  {
    chainId: 137,
    name: 'Polygon',
    shortName: 'Polygon',
    explorerUrl: 'https://polygonscan.com',
    color: '#8247E5',
  },
  {
    chainId: 42161,
    name: 'Arbitrum One',
    shortName: 'Arbitrum',
    explorerUrl: 'https://arbiscan.io',
    color: '#28A0F0',
  },
  {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    shortName: 'Arb Sepolia',
    explorerUrl: 'https://sepolia.arbiscan.io',
    color: '#28A0F0',
  },
  {
    chainId: 8453,
    name: 'Base',
    shortName: 'Base',
    explorerUrl: 'https://basescan.org',
    color: '#0052FF',
  },
  {
    chainId: 31337,
    name: 'Localhost',
    shortName: 'Localhost',
    explorerUrl: '',
    color: '#4ADE80',
  },
];

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
  { label: 'Portfolio', to: '/portfolio' },
  { label: 'Exchange', to: '/exchange' },
  { label: 'Orbital AMM', to: '/advanced' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatNavBalance(balance: string): string {
  const num = parseFloat(balance);
  if (num === 0) return '0 ETH';
  if (num < 0.0001) return '<0.0001 ETH';
  return `${formatTokenAmount(num)} ETH`;
}

function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => {
    // Fallback silently
  });
}

function addressToColor(address: string): string {
  const hash = address.toLowerCase().slice(2, 8);
  const h = parseInt(hash, 16) % 360;
  return `hsl(${h}, 70%, 60%)`;
}

function addressToSecondaryColor(address: string): string {
  const hash = address.toLowerCase().slice(6, 12);
  const h = parseInt(hash, 16) % 360;
  return `hsl(${h}, 65%, 50%)`;
}

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
// AddressIdenticon
// ---------------------------------------------------------------------------

function AddressIdenticon({
  address,
  size = 24,
}: {
  address: string;
  size?: number;
}) {
  const primary = addressToColor(address);
  const secondary = addressToSecondaryColor(address);

  return (
    <div
      className="rounded-full shrink-0"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${primary}, ${secondary})`,
      }}
    />
  );
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
        'hidden items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium sm:flex',
        'border border-white/[0.06] bg-white/[0.03] text-gray-400',
      )}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: currentNetwork.color,
          boxShadow: `0 0 6px ${currentNetwork.color}50`,
        }}
      />
      <span>{currentNetwork.shortName}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NetworkSelector -- dropdown for switching networks
// ---------------------------------------------------------------------------

function NetworkSelector({ compact = false }: { compact?: boolean }) {
  const wallet = useWalletStore((s) => s.wallet);
  const { switchNetwork, isConnected } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
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

  const currentNetwork = useMemo(
    () => NETWORKS.find((n) => n.chainId === wallet.chainId) ?? null,
    [wallet.chainId],
  );

  if (!isConnected) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={clsx(
          'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium',
          'transition-all duration-200',
          'border-white/[0.06] bg-white/[0.03] text-gray-300',
          'hover:border-white/[0.1] hover:bg-white/[0.06] hover:text-white',
          compact && 'w-full',
        )}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{
            backgroundColor: currentNetwork?.color ?? '#FBBF24',
            boxShadow: `0 0 8px ${currentNetwork?.color ?? '#FBBF24'}40`,
          }}
        />
        <span className="truncate">{currentNetwork?.shortName ?? 'Unknown'}</span>
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
            'absolute z-50 mt-2 w-64 origin-top-right rounded-2xl p-1.5 shadow-2xl',
            'border border-white/[0.06] bg-[#0D0F14]/95 backdrop-blur-xl',
            'animate-scale-in',
            compact ? 'left-0 right-0 w-full' : 'right-0',
          )}
        >
          <div className="mb-1.5 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Select Network
            </p>
          </div>
          {NETWORKS.map((network) => (
            <button
              key={network.chainId}
              type="button"
              onClick={() => {
                void switchNetwork(network.chainId);
                setIsOpen(false);
              }}
              className={clsx(
                'flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm transition-all duration-150',
                network.chainId === wallet.chainId
                  ? 'bg-white/[0.08] text-white'
                  : 'text-gray-400 hover:bg-white/[0.04] hover:text-white',
              )}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{
                  backgroundColor: network.color,
                  boxShadow:
                    network.chainId === wallet.chainId
                      ? `0 0 10px ${network.color}50`
                      : 'none',
                }}
              />
              <span className="flex-1 font-medium">{network.name}</span>
              {network.chainId === wallet.chainId && (
                <Check className="h-4 w-4 text-indigo-400" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WalletButton -- connect / connected state
// ---------------------------------------------------------------------------

function WalletButton({ compact = false }: { compact?: boolean }) {
  const {
    address,
    balance,
    isConnected,
    isConnecting,
    connectWallet,
    disconnectWallet,
  } = useWallet();

  const wallet = useWalletStore((s) => s.wallet);
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => { clearTimeout(copyTimerRef.current); };
  }, []);

  const close = useCallback(() => setShowDetails(false), []);
  useClickOutside(detailsRef, close);

  const currentNetwork = useMemo(
    () => NETWORKS.find((n) => n.chainId === wallet.chainId) ?? null,
    [wallet.chainId],
  );

  const handleCopy = useCallback((text: string) => {
    copyToClipboard(text);
    setCopied(true);
    clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!showDetails) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowDetails(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showDetails]);

  // -- Disconnected: show connect button with gradient
  if (!isConnected || !address) {
    return (
      <button
        type="button"
        onClick={() => void connectWallet()}
        disabled={isConnecting}
        className={clsx(
          'connect-btn-gradient',
          'flex items-center justify-center rounded-xl px-6 py-2.5 text-sm font-semibold text-white',
          'transition-all duration-300',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
          compact && 'w-full',
        )}
      >
        <span className="relative z-10">
          {isConnecting ? 'Connecting...' : 'Connect Wallet'}
        </span>
      </button>
    );
  }

  // -- Connected: show truncated address
  return (
    <div className="relative" ref={detailsRef}>
      <button
        type="button"
        onClick={() => setShowDetails((prev) => !prev)}
        className={clsx(
          'flex items-center gap-2.5 rounded-xl border px-3.5 py-2 text-sm transition-all duration-200',
          'border-white/[0.06] bg-white/[0.03] text-gray-200',
          'hover:border-white/[0.1] hover:bg-white/[0.06]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
          compact && 'w-full',
        )}
      >
        <AddressIdenticon address={address} size={20} />
        <span className="font-medium">{truncateAddress(address)}</span>
        <ChevronDown
          className={clsx(
            'h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform duration-200',
            showDetails && 'rotate-180',
          )}
        />
      </button>

      {showDetails && (
        <div
          className={clsx(
            'absolute z-50 mt-2 w-80 origin-top-right rounded-2xl shadow-2xl',
            'border border-white/[0.06] bg-[#0D0F14]/95 backdrop-blur-xl',
            'animate-scale-in',
            compact ? 'left-0 right-0 w-full' : 'right-0',
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-white/[0.04] px-5 py-4">
            <AddressIdenticon address={address} size={36} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">
                {truncateAddress(address)}
              </p>
              {currentNetwork && (
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: currentNetwork.color }}
                  />
                  <p className="text-xs text-gray-500">{currentNetwork.name}</p>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Address */}
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Address
              </p>
              <div className="flex items-center gap-2 rounded-xl border border-white/[0.04] bg-white/[0.03] px-3 py-2">
                <code className="flex-1 truncate font-mono text-xs text-gray-300">
                  {address}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy(address)}
                  className={clsx(
                    'shrink-0 rounded-lg p-1.5 transition-all duration-150',
                    copied
                      ? 'bg-green-500/10 text-green-400'
                      : 'text-gray-500 hover:bg-white/[0.06] hover:text-white',
                  )}
                  title="Copy address"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                {currentNetwork?.explorerUrl && (
                  <a
                    href={`${currentNetwork.explorerUrl}/address/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-lg p-1.5 text-gray-500 transition-all duration-150 hover:bg-white/[0.06] hover:text-white"
                    title="View on explorer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* Balance */}
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Balance
              </p>
              <p className="text-xl font-bold tracking-tight text-white">
                {formatNavBalance(balance)}
              </p>
            </div>

            {/* Network info */}
            {currentNetwork && (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Network
                </p>
                <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.04] bg-white/[0.03] px-3 py-2.5">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{
                      backgroundColor: currentNetwork.color,
                      boxShadow: `0 0 8px ${currentNetwork.color}40`,
                    }}
                  />
                  <span className="text-sm font-medium text-gray-300">
                    {currentNetwork.name}
                  </span>
                </div>
              </div>
            )}

            {/* View on Explorer */}
            {currentNetwork?.explorerUrl && (
              <a
                href={`${currentNetwork.explorerUrl}/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className={clsx(
                  'flex items-center justify-center gap-2 rounded-xl border border-white/[0.06] px-3 py-2.5 text-sm font-medium',
                  'text-gray-400 transition-all duration-150',
                  'hover:border-white/[0.1] hover:bg-white/[0.03] hover:text-white',
                )}
              >
                <ExternalLink className="h-4 w-4" />
                View on Explorer
              </a>
            )}

            {/* Disconnect */}
            <button
              type="button"
              onClick={() => {
                disconnectWallet();
                setShowDetails(false);
              }}
              className={clsx(
                'flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium',
                'transition-all duration-150',
                'border-red-500/20 bg-red-500/[0.06] text-red-400',
                'hover:border-red-500/30 hover:bg-red-500/10',
              )}
            >
              <LogOut className="h-4 w-4" />
              Disconnect Wallet
            </button>
          </div>
        </div>
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
          <span
            className="text-xl font-bold tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Fueki
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
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
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
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
                        className="h-5 w-0.5 shrink-0 rounded-full bg-indigo-400"
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
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
              Wallet
            </p>
            <NetworkSelector compact />
            <WalletButton compact />
          </div>

          {/* Separator */}
          <div className="my-6 border-t border-white/[0.04]" />

          {/* Theme toggle (mobile) */}
          <div className="flex items-center justify-between px-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">
              Theme
            </p>
            <ThemeToggle />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.04] px-6 py-5">
          <p className="text-center text-[11px] text-gray-600">
            Fueki v1.0
          </p>
        </div>
      </div>
    </div>
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
        <div className="mx-auto max-w-[1920px] px-8 sm:px-12 lg:px-20 xl:px-32">
          <div className="flex h-20 items-center justify-between">

            {/* ---- Left: Logo + Nav Links ---- */}
            <div className="flex items-center gap-10">
              {/* Logo */}
              <Link
                to="/"
                className="group flex items-center transition-opacity duration-200 hover:opacity-90 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
              >
                <span
                  className="text-xl font-bold tracking-tight"
                  style={{
                    background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Fueki
                </span>
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
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent',
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
                            className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-indigo-400"
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

              {/* Pending transactions indicator */}
              <div className="hidden sm:block">
                <PendingTransactions />
              </div>

              {/* Desktop wallet */}
              <div className="hidden sm:block">
                <WalletButton />
              </div>

              {/* Mobile hamburger */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                className={clsx(
                  'rounded-xl p-2.5 transition-all duration-200 lg:hidden',
                  'text-gray-400 hover:bg-white/[0.06] hover:text-white',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
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
