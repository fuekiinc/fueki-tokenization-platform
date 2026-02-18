import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Fingerprint,
  Coins,
  ArrowLeftRight,
  PieChart,
  ShieldCheck,
  ArrowRight,
  TrendingUp,
  BarChart3,
  Globe,
  Search,
  Filter,
  Building2,
  Landmark,
  Gem,
  FileText,
  Wallet,
  ExternalLink,
} from 'lucide-react';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Feature card data
// ---------------------------------------------------------------------------

interface FeatureCard {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FEATURES: FeatureCard[] = [
  {
    icon: <Coins className="h-6 w-6" />,
    title: 'Asset Tokenization',
    description:
      'Transform real-world assets into blockchain tokens with full regulatory compliance and transparent ownership records.',
  },
  {
    icon: <ArrowLeftRight className="h-6 w-6" />,
    title: 'Decentralized Exchange',
    description:
      'Trade tokenized assets on our Orbital AMM with deep liquidity pools, low fees, and instant settlement.',
  },
  {
    icon: <PieChart className="h-6 w-6" />,
    title: 'Portfolio Management',
    description:
      'Track, manage, and optimize your tokenized asset portfolio with real-time analytics and performance insights.',
  },
  {
    icon: <ShieldCheck className="h-6 w-6" />,
    title: 'KYC Compliance',
    description:
      'Built-in identity verification and compliance workflows ensure every participant meets regulatory standards.',
  },
];

// ---------------------------------------------------------------------------
// Market overview items with display values
// ---------------------------------------------------------------------------

interface MarketItem {
  label: string;
  value: string;
  icon: React.ReactNode;
}

const MARKET_ITEMS: MarketItem[] = [
  { label: 'Total Value Locked', value: '$12.4M', icon: <TrendingUp className="h-5 w-5" /> },
  { label: 'Active Assets', value: '847', icon: <BarChart3 className="h-5 w-5" /> },
  { label: 'Global Participants', value: '2,340', icon: <Globe className="h-5 w-5" /> },
];

// ---------------------------------------------------------------------------
// Sample tokenized assets for the public explorer
// ---------------------------------------------------------------------------

type AssetCategory = 'all' | 'real_estate' | 'equity' | 'commodity' | 'debt';

interface ExploreAsset {
  id: string;
  name: string;
  symbol: string;
  category: AssetCategory;
  totalSupply: string;
  holders: number;
  documentType: string;
  description: string;
}

const CATEGORY_CONFIG: Record<
  AssetCategory,
  { label: string; icon: React.ElementType; color: string }
> = {
  all: { label: 'All Assets', icon: Coins, color: 'text-indigo-400' },
  real_estate: { label: 'Real Estate', icon: Building2, color: 'text-blue-400' },
  equity: { label: 'Equity', icon: Landmark, color: 'text-violet-400' },
  commodity: { label: 'Commodity', icon: Gem, color: 'text-amber-400' },
  debt: { label: 'Debt', icon: FileText, color: 'text-emerald-400' },
};

const SAMPLE_ASSETS: ExploreAsset[] = [
  {
    id: '1',
    name: 'Manhattan Office Complex',
    symbol: 'MNHT',
    category: 'real_estate',
    totalSupply: '1,000,000',
    holders: 142,
    documentType: 'JSON',
    description: 'Tokenized commercial office space in Manhattan, NY.',
  },
  {
    id: '2',
    name: 'TechVenture Series A',
    symbol: 'TVSA',
    category: 'equity',
    totalSupply: '500,000',
    holders: 87,
    documentType: 'CSV',
    description: 'Series A equity tokens for TechVenture Inc.',
  },
  {
    id: '3',
    name: 'Gold Reserve Token',
    symbol: 'GLDR',
    category: 'commodity',
    totalSupply: '10,000',
    holders: 312,
    documentType: 'JSON',
    description: 'Each token backed by 1g of LBMA-certified gold.',
  },
  {
    id: '4',
    name: 'US Treasury Bond 2030',
    symbol: 'UST30',
    category: 'debt',
    totalSupply: '2,000,000',
    holders: 204,
    documentType: 'XML',
    description: 'Tokenized US Treasury bond maturing in 2030.',
  },
  {
    id: '5',
    name: 'SF Residential Portfolio',
    symbol: 'SFRP',
    category: 'real_estate',
    totalSupply: '750,000',
    holders: 98,
    documentType: 'JSON',
    description: 'Multi-unit residential property portfolio in San Francisco.',
  },
  {
    id: '6',
    name: 'Silver Bullion Reserve',
    symbol: 'SLVR',
    category: 'commodity',
    totalSupply: '50,000',
    holders: 176,
    documentType: 'CSV',
    description: 'Each token backed by 10g of audited silver bullion.',
  },
];

// ---------------------------------------------------------------------------
// Asset card sub-component
// ---------------------------------------------------------------------------

function AssetExploreCard({ asset }: { asset: ExploreAsset }) {
  const categoryConfig = CATEGORY_CONFIG[asset.category];
  const CategoryIcon = categoryConfig.icon;

  return (
    <div
      className={clsx(
        'bg-[var(--bg-secondary)]/80 backdrop-blur-2xl',
        'border border-[var(--border-primary)]',
        'rounded-2xl p-6 sm:p-7',
        'transition-all duration-200',
        'hover:border-[var(--border-hover)]',
        'hover:shadow-lg hover:shadow-black/10',
        'hover:-translate-y-0.5',
        'group',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div
            className={clsx(
              'flex h-10 w-10 items-center justify-center rounded-xl',
              'bg-gradient-to-br from-indigo-600/10 to-purple-600/10',
              categoryConfig.color,
            )}
          >
            <CategoryIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[var(--text-primary)] truncate">
              {asset.name}
            </h3>
            <p className="text-sm text-[var(--text-muted)]">{asset.symbol}</p>
          </div>
        </div>
        <span
          className={clsx(
            'inline-flex items-center rounded-full px-2.5 py-1',
            'text-[10px] font-semibold uppercase tracking-wide border',
            'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
          )}
        >
          {asset.documentType}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-5">
        {asset.description}
      </p>

      {/* Metrics */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--text-muted)]">Total Supply</span>
          <span className="font-medium text-[var(--text-primary)]">{asset.totalSupply}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--text-muted)]">Holders</span>
          <span className="font-medium text-[var(--text-primary)]">{asset.holders}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--text-muted)]">Category</span>
          <span className={clsx('font-medium', categoryConfig.color)}>
            {categoryConfig.label}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Link
          to="/login"
          className={clsx(
            'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5',
            'border border-indigo-500/10 bg-indigo-500/[0.06] text-sm font-medium text-indigo-400',
            'transition-all duration-200 hover:border-indigo-500/25 hover:bg-indigo-500/[0.12]',
          )}
        >
          <Wallet className="h-3.5 w-3.5" />
          Connect to Trade
        </Link>
        <button
          className={clsx(
            'flex items-center justify-center rounded-xl px-3 py-2.5',
            'border border-[var(--border-primary)] bg-[var(--bg-tertiary)]',
            'text-[var(--text-muted)]',
            'transition-all duration-200 hover:border-[var(--border-hover)] hover:text-[var(--text-secondary)]',
          )}
          aria-label={`View ${asset.name} details`}
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExplorePage
// ---------------------------------------------------------------------------

export default function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<AssetCategory>('all');

  const filteredAssets = useMemo(() => {
    let result = [...SAMPLE_ASSETS];

    if (activeCategory !== 'all') {
      result = result.filter((a) => a.category === activeCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.symbol.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q),
      );
    }

    return result;
  }, [searchQuery, activeCategory]);

  return (
    <div className="gradient-bg-subtle min-h-screen flex flex-col overflow-x-hidden">
      <main className="flex-1">
        {/* ---------------------------------------------------------------- */}
        {/* Hero Section                                                      */}
        {/* ---------------------------------------------------------------- */}
        <section className="px-4 pt-16 pb-12 sm:pt-24 sm:pb-16 max-w-5xl mx-auto text-center">
          {/* Branding */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 shadow-xl shadow-indigo-500/25 mb-8">
            <Fingerprint className="h-8 w-8 text-white" />
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight">
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-300 bg-clip-text text-transparent">
              Explore the Fueki
            </span>
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-300 bg-clip-text text-transparent">
              Tokenization Platform
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-[var(--text-secondary)] leading-relaxed max-w-2xl mx-auto">
            A next-generation platform for tokenizing real-world assets,
            enabling seamless trading, and managing digital portfolios
            -- all built on secure blockchain infrastructure.
          </p>

          {/* CTA buttons */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/signup"
              className={clsx(
                'flex items-center justify-center gap-2.5',
                'bg-gradient-to-r from-indigo-600 to-purple-600',
                'hover:from-indigo-500 hover:to-purple-500',
                'text-white font-semibold text-[15px]',
                'rounded-xl px-8 py-3.5',
                'transition-all duration-200',
                'shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30',
                'active:scale-[0.98]',
                'w-full sm:w-auto',
              )}
            >
              Create an Account
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/login"
              className={clsx(
                'flex items-center justify-center gap-2',
                'bg-[var(--bg-secondary)]/80 backdrop-blur-xl',
                'border border-[var(--border-primary)]',
                'hover:border-[var(--border-hover)] hover:bg-[var(--bg-secondary)]',
                'text-[var(--text-primary)] font-semibold text-[15px]',
                'rounded-xl px-8 py-3.5',
                'transition-all duration-200',
                'w-full sm:w-auto',
              )}
            >
              Sign In
            </Link>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Market Overview                                                    */}
        {/* ---------------------------------------------------------------- */}
        <section className="px-4 py-12 sm:py-16 max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] text-center mb-4">
            Platform Metrics
          </h2>
          <p className="text-[15px] text-[var(--text-muted)] text-center mb-12 max-w-md mx-auto">
            Real-time metrics from the Fueki tokenization network.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {MARKET_ITEMS.map((item) => (
              <div
                key={item.label}
                className={clsx(
                  'bg-[var(--bg-secondary)]/80 backdrop-blur-2xl',
                  'border border-[var(--border-primary)]',
                  'rounded-2xl p-6 text-center',
                  'transition-all duration-200',
                  'hover:border-[var(--border-hover)]',
                  'hover:shadow-lg hover:shadow-black/10',
                )}
              >
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-600/10 to-purple-600/10 text-indigo-400 mb-4">
                  {item.icon}
                </div>
                <p className="text-2xl font-bold text-[var(--text-primary)] mb-1">
                  {item.value}
                </p>
                <p className="text-sm font-medium text-[var(--text-muted)]">
                  {item.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Asset Explorer with Search and Filter                             */}
        {/* ---------------------------------------------------------------- */}
        <section className="px-4 py-12 sm:py-16 max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] text-center mb-4">
            Tokenized Assets
          </h2>
          <p className="text-[15px] text-[var(--text-muted)] text-center mb-10 max-w-lg mx-auto">
            Browse publicly listed tokenized assets. Connect your wallet to start trading.
          </p>

          {/* Search + Filter bar */}
          <div
            className={clsx(
              'rounded-2xl border border-[var(--border-primary)]',
              'bg-[var(--bg-secondary)]/80 backdrop-blur-xl',
              'p-4 sm:p-6 mb-8',
            )}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {/* Search input */}
              <div className="relative flex-1">
                <label htmlFor="explore-search" className="sr-only">Search tokenized assets</label>
                <Search
                  className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                  aria-hidden="true"
                />
                <input
                  id="explore-search"
                  type="search"
                  placeholder="Search by name, symbol, or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={clsx(
                    'w-full rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-primary)]',
                    'py-3 pl-12 pr-4',
                    'text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]',
                    'transition-all duration-200',
                    'focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20',
                  )}
                />
              </div>

              {/* Category filter pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                <Filter
                  className="hidden h-4 w-4 text-[var(--text-muted)] sm:block shrink-0"
                  aria-hidden="true"
                />
                {(Object.keys(CATEGORY_CONFIG) as AssetCategory[]).map((cat) => {
                  const config = CATEGORY_CONFIG[cat];
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      aria-pressed={activeCategory === cat}
                      className={clsx(
                        'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2',
                        'text-xs font-medium whitespace-nowrap transition-all duration-200',
                        activeCategory === cat
                          ? 'bg-gradient-to-r from-indigo-500/20 to-violet-500/20 text-indigo-400 shadow-sm shadow-indigo-500/10'
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]/80 hover:text-[var(--text-secondary)]',
                      )}
                    >
                      {config.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Asset grid */}
          {filteredAssets.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredAssets.map((asset) => (
                <AssetExploreCard key={asset.id} asset={asset} />
              ))}
            </div>
          ) : (
            <div
              className={clsx(
                'bg-[var(--bg-secondary)]/80 backdrop-blur-2xl',
                'border border-[var(--border-primary)]',
                'rounded-2xl p-12 text-center',
              )}
            >
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-500/10 mb-5">
                <Search className="h-7 w-7 text-indigo-400" />
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                No assets found
              </h3>
              <p className="text-sm text-[var(--text-muted)] max-w-sm mx-auto">
                Try adjusting your search query or selecting a different category filter.
              </p>
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Feature Cards                                                     */}
        {/* ---------------------------------------------------------------- */}
        <section className="px-4 py-12 sm:py-16 max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] text-center mb-12">
            What You Can Do
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className={clsx(
                  'bg-[var(--bg-secondary)]/80 backdrop-blur-2xl',
                  'border border-[var(--border-primary)]',
                  'rounded-2xl p-6 sm:p-8',
                  'transition-all duration-200',
                  'hover:border-[var(--border-hover)]',
                  'hover:shadow-lg hover:shadow-black/10',
                  'group',
                )}
              >
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600/10 to-purple-600/10 text-indigo-400 mb-5 transition-transform duration-200 group-hover:scale-110">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">
                  {feature.title}
                </h3>
                <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Bottom CTA                                                        */}
        {/* ---------------------------------------------------------------- */}
        <section className="px-4 py-12 sm:py-16 max-w-3xl mx-auto text-center">
          <div
            className={clsx(
              'bg-[var(--bg-secondary)]/80 backdrop-blur-2xl',
              'border border-[var(--border-primary)]',
              'rounded-3xl p-8 sm:p-12',
              'shadow-2xl shadow-black/10',
            )}
          >
            <h2 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] mb-4">
              Ready to Get Started?
            </h2>
            <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed max-w-md mx-auto mb-8">
              Join the next generation of asset tokenization. Create your
              account and start exploring in minutes.
            </p>
            <Link
              to="/signup"
              className={clsx(
                'inline-flex items-center justify-center gap-2.5',
                'bg-gradient-to-r from-indigo-600 to-purple-600',
                'hover:from-indigo-500 hover:to-purple-500',
                'text-white font-semibold text-[15px]',
                'rounded-xl px-8 py-3.5',
                'transition-all duration-200',
                'shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30',
                'active:scale-[0.98]',
              )}
            >
              Create an Account
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full py-6 px-4 text-center">
        <p className="text-xs text-[var(--text-muted)]">
          &copy; {new Date().getFullYear()} Fueki Technologies. All rights
          reserved.
        </p>
      </footer>
    </div>
  );
}
