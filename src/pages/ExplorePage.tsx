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
// Market overview items
// ---------------------------------------------------------------------------

interface MarketItem {
  label: string;
  icon: React.ReactNode;
}

const MARKET_ITEMS: MarketItem[] = [
  { label: 'Total Value Locked', icon: <TrendingUp className="h-5 w-5" /> },
  { label: 'Active Assets', icon: <BarChart3 className="h-5 w-5" /> },
  { label: 'Global Participants', icon: <Globe className="h-5 w-5" /> },
];

// ---------------------------------------------------------------------------
// ExplorePage
// ---------------------------------------------------------------------------

export default function ExplorePage() {
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
            — all built on secure blockchain infrastructure.
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
        {/* Market Overview                                                    */}
        {/* ---------------------------------------------------------------- */}
        <section className="px-4 py-12 sm:py-16 max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] text-center mb-4">
            Market Overview
          </h2>
          <p className="text-[15px] text-[var(--text-muted)] text-center mb-12 max-w-md mx-auto">
            Live platform metrics will appear here once connected to the
            network.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {MARKET_ITEMS.map((item) => (
              <div
                key={item.label}
                className={clsx(
                  'bg-[var(--bg-secondary)]/80 backdrop-blur-2xl',
                  'border border-[var(--border-primary)]',
                  'rounded-2xl p-6 text-center',
                )}
              >
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-600/10 to-purple-600/10 text-indigo-400 mb-4">
                  {item.icon}
                </div>
                <div className="h-8 w-24 mx-auto rounded-lg bg-[var(--bg-tertiary)] animate-pulse mb-2" />
                <p className="text-sm font-medium text-[var(--text-muted)]">
                  {item.label}
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
