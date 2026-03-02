import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowDown,
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Circle,
  Coins,
  Droplets,
  Focus,
  Gauge,
  Layers,
  Orbit,
  Percent,
  PlusCircle,
  ShieldCheck,
  Sigma,
  Sliders,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';
import { CARD_CLASSES } from '../lib/designTokens';

// ---------------------------------------------------------------------------
// Reusable sub-components
// ---------------------------------------------------------------------------

function SectionCard({
  step,
  icon: Icon,
  title,
  accentColor,
  children,
}: {
  step?: number;
  icon: React.ElementType;
  title: string;
  accentColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className={clsx(CARD_CLASSES.base, 'relative overflow-hidden p-7 sm:p-9')}>
      <div
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{
          background: `linear-gradient(to right, transparent, ${accentColor}88, transparent)`,
        }}
      />
      <div className="flex items-start gap-5">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${accentColor}18` }}
        >
          <Icon className="h-6 w-6" style={{ color: accentColor }} />
        </div>
        <div className="min-w-0 flex-1">
          {step !== undefined && (
            <p
              className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: accentColor }}
            >
              Step {step}
            </p>
          )}
          <h3 className="mb-3 text-lg font-semibold text-white">{title}</h3>
          <div className="space-y-3 text-sm leading-relaxed text-gray-400">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function TipCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-6 py-4',
        'flex items-start gap-3',
      )}
    >
      <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <p className="text-sm leading-relaxed text-amber-200/90">{children}</p>
    </div>
  );
}

function ConceptCard({
  icon: Icon,
  title,
  accentColor,
  children,
}: {
  icon: React.ElementType;
  title: string;
  accentColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className={clsx(CARD_CLASSES.base, 'p-6 sm:p-7')}>
      <div className="mb-3 flex items-center gap-3">
        <Icon className="h-5 w-5" style={{ color: accentColor }} />
        <h4 className="text-sm font-semibold text-white">{title}</h4>
      </div>
      <div className="text-sm leading-relaxed text-gray-400">{children}</div>
    </div>
  );
}

function FormulaBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3 rounded-lg border border-indigo-500/20 bg-indigo-500/[0.06] px-5 py-3.5">
      <code className="text-sm font-semibold text-indigo-300">{children}</code>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Concentration power table data
// ---------------------------------------------------------------------------

const CONCENTRATION_LEVELS = [
  { p: 2, label: 'Broad', bestFor: 'Volatile, uncorrelated pairs', color: '#3B82F6' },
  { p: 4, label: 'Standard', bestFor: 'Most general-purpose pools', color: '#8B5CF6' },
  { p: 8, label: 'Focused', bestFor: 'Correlated assets', color: '#06B6D4' },
  { p: 16, label: 'Tight', bestFor: 'Stable / pegged pairs', color: '#10B981' },
  { p: 32, label: 'Ultra-Tight', bestFor: 'Tightly pegged stablecoins', color: '#F59E0B' },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OrbitalAMMGuidePage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Back link */}
      <Link
        to="/advanced"
        className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-gray-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Orbital AMM
      </Link>

      {/* Hero */}
      <div className="mb-12">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/15">
            <BookOpen className="h-5 w-5 text-indigo-400" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Orbital AMM Guide
          </h1>
        </div>
        <p className="max-w-xl text-base leading-relaxed text-gray-400">
          The Orbital AMM is Fueki&apos;s next-generation automated market maker
          built on a <strong className="text-gray-300">superellipse
          (power-mean) invariant</strong>. Unlike traditional constant-product
          AMMs, Orbital lets you tune liquidity concentration with a single
          parameter, supports multi-token pools (up to 8 tokens), and settles
          trades instantly on-chain.
        </p>
      </div>

      {/* ================================================================== */}
      {/* How Orbital is Different */}
      {/* ================================================================== */}
      <div className="mb-10 space-y-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Orbit className="h-5 w-5 text-indigo-400" />
          How Orbital AMM Works
        </h2>

        <SectionCard icon={Sigma} title="The Superellipse Invariant" accentColor="#6366F1">
          <p>
            Traditional AMMs like Uniswap use a constant-product formula{' '}
            <code className="text-gray-300">x &times; y = k</code>. Orbital replaces this
            with a <strong className="text-gray-300">superellipse invariant</strong>:
          </p>
          <FormulaBlock>
            x₁<sup>p</sup> + x₂<sup>p</sup> + &hellip; + xₙ<sup>p</sup> = K
          </FormulaBlock>
          <p>
            Each <code className="text-gray-300">xᵢ</code> is a normalized
            reserve value, <code className="text-gray-300">p</code> is the{' '}
            <strong className="text-gray-300">concentration power</strong>, and{' '}
            <code className="text-gray-300">K</code> is the invariant constant
            that the pool preserves on every trade.
          </p>
          <p>
            The name &ldquo;Orbital&rdquo; comes from the way token reserves
            orbit around an equilibrium point on the superellipse surface. When
            all tokens are equally balanced, every normalized reserve sits at
            the equilibrium &mdash; the center of the orbit.
          </p>
        </SectionCard>

        <SectionCard icon={Focus} title="Concentration Power (p)" accentColor="#8B5CF6">
          <p>
            The exponent <code className="text-gray-300">p</code> controls how
            concentrated liquidity is around the equilibrium price. Higher
            values pack more liquidity near equal pricing but offer less
            depth as prices deviate.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="pb-2 pr-4 font-semibold text-gray-300">Power</th>
                  <th className="pb-2 pr-4 font-semibold text-gray-300">Label</th>
                  <th className="pb-2 font-semibold text-gray-300">Best For</th>
                </tr>
              </thead>
              <tbody>
                {CONCENTRATION_LEVELS.map(({ p, label, bestFor, color }) => (
                  <tr key={p} className="border-b border-white/[0.04]">
                    <td className="py-2 pr-4">
                      <span
                        className="inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-bold"
                        style={{ background: `${color}20`, color }}
                      >
                        p={p}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-300">{label}</td>
                    <td className="py-2 text-gray-400">{bestFor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            At <code className="text-gray-300">p=2</code>, the invariant
            describes an ellipse/sphere &mdash; liquidity is spread broadly,
            similar to a traditional AMM. At{' '}
            <code className="text-gray-300">p=32</code>, the curve flattens
            into nearly a hypercube, concentrating almost all liquidity right
            at the equilibrium price &mdash; ideal for stablecoin pairs.
          </p>
        </SectionCard>

        <SectionCard icon={Circle} title="Normalized Reserve Space" accentColor="#06B6D4">
          <p>
            Before every trade, Orbital normalizes the raw token reserves so
            that at equilibrium each value equals exactly{' '}
            <code className="text-gray-300">1.0</code> (1e18 in WAD precision).
            This normalization allows the superellipse math to work identically
            whether the pool holds 2 tokens or 8.
          </p>
          <p>
            The <strong className="text-gray-300">spot price</strong> between
            any two tokens A and B is derived directly from their normalized
            reserves:
          </p>
          <FormulaBlock>
            price(A/B) = (xB / xA)<sup>p&minus;1</sup>
          </FormulaBlock>
          <p>
            At <code className="text-gray-300">p=2</code> this simplifies to a
            simple ratio <code className="text-gray-300">xB/xA</code>. At
            higher powers, prices are more sensitive near equilibrium and change
            faster as reserves move away from balance.
          </p>
        </SectionCard>

        <SectionCard icon={Layers} title="Multi-Token Pools (2&ndash;8 Tokens)" accentColor="#10B981">
          <p>
            Unlike most AMMs that only support pairs, Orbital natively supports
            pools with <strong className="text-gray-300">2 to 8 different
            tokens</strong>. The superellipse invariant generalizes naturally
            to any number of dimensions &mdash; no special-casing needed.
          </p>
          <p>
            This means you can create a single pool for, say, 4 stablecoins at{' '}
            <code className="text-gray-300">p=32</code> and swap between any of
            them in a single transaction with deep concentrated liquidity.
          </p>
        </SectionCard>
      </div>

      {/* ================================================================== */}
      {/* Key concepts */}
      {/* ================================================================== */}
      <div className="mb-10 space-y-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Gauge className="h-5 w-5 text-cyan-400" />
          Key Concepts
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ConceptCard icon={Droplets} title="Liquidity Pool" accentColor="#8B5CF6">
            A smart contract holding reserves of multiple tokens on the
            superellipse surface. Traders swap against the pool&apos;s reserves
            and prices adjust automatically according to the invariant.
          </ConceptCard>
          <ConceptCard icon={Coins} title="OLP Tokens" accentColor="#06B6D4">
            <p>
              When you add liquidity, you receive{' '}
              <strong className="text-gray-300">OLP</strong> (Orbital Liquidity
              Provider) tokens proportional to the pool&apos;s{' '}
              <em>radius</em> &mdash;{' '}
              <code className="text-gray-300">K<sup>1/p</sup></code>. Redeem
              them later to withdraw your pro-rata share of all token reserves.
            </p>
          </ConceptCard>
          <ConceptCard icon={Percent} title="Slippage &amp; Price Impact" accentColor="#F59E0B">
            Larger trades relative to pool reserves cause greater price impact.
            Higher concentration powers amplify this near equilibrium but
            reduce it far from equilibrium. Set a slippage tolerance to protect
            against unfavorable execution.
          </ConceptCard>
          <ConceptCard icon={Sliders} title="Swap Fees" accentColor="#10B981">
            <p>
              Each pool charges a configurable fee (0.10%&ndash;1.00%) taken
              from the input token <em>before</em> the swap. Fees stay in the
              pool, increasing the invariant K over time and rewarding all LPs
              proportionally.
            </p>
          </ConceptCard>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Prerequisites */}
      {/* ================================================================== */}
      <div className="mb-10 space-y-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          Before You Start
        </h2>
        <SectionCard icon={Wallet} title="Connect Your Wallet" accentColor="#6366F1">
          <p>
            Ensure your wallet is connected and on a{' '}
            <strong className="text-gray-300">supported network</strong> with
            Orbital AMM contracts deployed (Ethereum Mainnet, Holesky, Arbitrum
            Sepolia).
          </p>
        </SectionCard>
        <SectionCard icon={Coins} title="Have Tokens Ready" accentColor="#8B5CF6">
          <p>
            You need tokens to swap or provide as liquidity. Mint tokens on the{' '}
            <Link to="/mint" className="text-indigo-400 underline underline-offset-2 hover:text-indigo-300">
              Mint page
            </Link>
            , or use tokens you already hold. You also need ETH for gas fees.
          </p>
        </SectionCard>
      </div>

      {/* ================================================================== */}
      {/* Swapping */}
      {/* ================================================================== */}
      <div className="mb-10 space-y-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <ArrowDown className="h-5 w-5 text-cyan-400" />
          How to Swap Tokens
        </h2>

        <SectionCard step={1} icon={Layers} title="Select the Swap Tab" accentColor="#3B82F6">
          <p>
            Navigate to the <strong className="text-gray-300">Orbital AMM</strong> page
            and click the <strong className="text-gray-300">&ldquo;Swap&rdquo;</strong> tab.
            You can also click any pool in the Pools tab to jump straight to
            swapping for that pair.
          </p>
        </SectionCard>

        <SectionCard step={2} icon={Coins} title="Choose Your Tokens" accentColor="#8B5CF6">
          <p>
            Select the token you want to <strong className="text-gray-300">sell</strong> (top
            field) and the token you want to <strong className="text-gray-300">receive</strong> (bottom
            field). An Orbital pool must exist for this pair and concentration
            level.
          </p>
          <p>
            Enter the amount you want to sell. The AMM solves the superellipse
            invariant to calculate the output amount in real time.
          </p>
        </SectionCard>

        <SectionCard step={3} icon={Percent} title="Review the Quote" accentColor="#F59E0B">
          <p>
            The swap form shows you:
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-gray-300">Exchange rate</strong> &mdash;
              how many output tokens you get per input token, derived from the
              superellipse spot price.
            </li>
            <li>
              <strong className="text-gray-300">Price impact</strong> &mdash;
              how much the trade shifts reserves away from equilibrium.
            </li>
            <li>
              <strong className="text-gray-300">Minimum received</strong> &mdash;
              the worst-case amount after your slippage tolerance.
            </li>
          </ul>
          <p className="mt-2">
            The default 0.5% slippage works for most trades. For pools with
            high concentration power (p=16, p=32), price impact near
            equilibrium is minimal but can spike quickly for large trades
            &mdash; review impact carefully.
          </p>
        </SectionCard>

        <SectionCard step={4} icon={Zap} title="Confirm the Swap" accentColor="#10B981">
          <p>
            If this is your first swap with this token, you will be asked to{' '}
            <strong className="text-gray-300">approve</strong> the Orbital
            Router contract to spend your tokens (one-time per token). Then
            confirm the swap transaction in your wallet.
          </p>
          <p>
            The swap settles instantly on-chain. The pool verifies that the
            invariant K did not decrease (it can only grow from collected fees),
            and your new tokens appear in your wallet immediately.
          </p>
        </SectionCard>

        <TipCard>
          <strong>Multi-hop routing:</strong> The Orbital Router supports up to
          4 hops through different pools in a single transaction. If a direct
          pool doesn&apos;t exist for your pair, the router can chain through
          intermediate pools automatically.
        </TipCard>

        <TipCard>
          <strong>ETH swaps:</strong> You can swap native ETH directly without
          wrapping it first. The router handles ETH wrapping and unwrapping
          behind the scenes.
        </TipCard>
      </div>

      {/* ================================================================== */}
      {/* Providing liquidity */}
      {/* ================================================================== */}
      <div className="mb-10 space-y-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Droplets className="h-5 w-5 text-violet-400" />
          How to Provide Liquidity
        </h2>

        <SectionCard step={1} icon={Layers} title="Go to the Liquidity Tab" accentColor="#3B82F6">
          <p>
            Click the <strong className="text-gray-300">&ldquo;Liquidity&rdquo;</strong> tab,
            then select <strong className="text-gray-300">&ldquo;Add&rdquo;</strong> to
            deposit tokens into an existing pool.
          </p>
        </SectionCard>

        <SectionCard step={2} icon={Coins} title="Choose a Pool" accentColor="#8B5CF6">
          <p>
            Select the tokens for the pool you want to join. Deposits must be{' '}
            <strong className="text-gray-300">proportional</strong> to the
            pool&apos;s current reserves &mdash; enter the amount for one
            token and the form calculates the matching amounts for all others.
          </p>
          <p>
            If you are the <strong className="text-gray-300">first depositor</strong>,
            the ratio you deposit sets the initial equilibrium prices. Your OLP
            mint amount equals the superellipse radius{' '}
            <code className="text-gray-300">K<sup>1/p</sup></code>, minus a
            small minimum-liquidity lock (1000 units burned to prevent share
            inflation attacks).
          </p>
        </SectionCard>

        <SectionCard step={3} icon={Zap} title="Approve and Deposit" accentColor="#06B6D4">
          <p>
            Approve each token for the Orbital Router (if not already approved),
            then confirm the{' '}
            <strong className="text-gray-300">&ldquo;Add Liquidity&rdquo;</strong>{' '}
            transaction. You will receive{' '}
            <strong className="text-gray-300">OLP tokens</strong> proportional
            to the pool&apos;s growth in radius.
          </p>
        </SectionCard>

        <SectionCard step={4} icon={TrendingUp} title="Earn Trading Fees" accentColor="#10B981">
          <p>
            Every swap deducts a fee from the input side{' '}
            <em>before</em> computing the output. This fee stays in the pool,
            growing the invariant K over time. Since your OLP tokens represent a
            fixed share of K, their redeemable value increases with every trade.
          </p>
          <p>
            Check the pool detail view for your current share, reserves, and
            accumulated fee growth.
          </p>
        </SectionCard>

        <TipCard>
          Withdraw liquidity at any time from the{' '}
          <strong>&ldquo;Remove&rdquo;</strong> sub-tab. Withdrawals are always
          proportional &mdash; you receive your pro-rata share of every token in
          the pool. Use the percentage slider for quick selection (25%, 50%,
          75%, 100%).
        </TipCard>
      </div>

      {/* ================================================================== */}
      {/* Creating pools */}
      {/* ================================================================== */}
      <div className="mb-10 space-y-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <PlusCircle className="h-5 w-5 text-emerald-400" />
          Creating a New Pool
        </h2>

        <SectionCard icon={PlusCircle} title="Launch Your Own Pool" accentColor="#10B981">
          <p>
            From the <strong className="text-gray-300">&ldquo;Create Pool&rdquo;</strong>{' '}
            tab you can deploy a brand-new Orbital pool.
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-gray-300">Select 2&ndash;8 tokens</strong>{' '}
              for the pool.
            </li>
            <li>
              <strong className="text-gray-300">Choose a concentration power</strong>{' '}
              (p=2 through p=32). Use Broad (p=2) for volatile pairs, Ultra-Tight
              (p=32) for stablecoins. The UI shows a liquidity curve preview so
              you can see how concentrated your pool will be.
            </li>
            <li>
              <strong className="text-gray-300">Pick a fee tier</strong>{' '}
              (0.10%, 0.30%, 0.50%, or 1.00%). Lower fees attract more volume
              but earn less per trade.
            </li>
            <li>
              Confirm the pool creation transaction.
            </li>
          </ul>
          <p className="mt-3">
            Pool uniqueness is determined by the{' '}
            <strong className="text-gray-300">sorted token set + concentration
            power</strong>. You can have multiple pools for the same tokens at
            different concentration levels (e.g., ETH-USDC at p=4 and p=16).
          </p>
        </SectionCard>

        <TipCard>
          The first liquidity deposit defines the initial exchange rates. For a
          2-token pool, the ratio of Token A to Token B you deposit becomes the
          starting price. Choose carefully &mdash; a significantly off-market
          ratio creates an arbitrage opportunity.
        </TipCard>

        <TipCard>
          As the pool creator, you are the first LP. Providing a healthy amount
          of initial liquidity reduces slippage for early traders and makes your
          pool more attractive for others to join.
        </TipCard>
      </div>

      {/* ================================================================== */}
      {/* Risks */}
      {/* ================================================================== */}
      <div className="mb-10 space-y-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <ShieldCheck className="h-5 w-5 text-amber-400" />
          Risks to Understand
        </h2>

        <SectionCard icon={ShieldCheck} title="Impermanent Loss &amp; Concentration Risk" accentColor="#F59E0B">
          <p>
            When you provide liquidity, the pool rebalances as prices change.
            If one token&apos;s price moves significantly relative to the
            others, you may end up with less total value than if you had simply
            held the tokens. This is called{' '}
            <strong className="text-gray-300">impermanent loss</strong>.
          </p>
          <p>
            <strong className="text-gray-300">Higher concentration powers
            amplify this risk.</strong> A pool at p=32 concentrates nearly all
            liquidity near equilibrium &mdash; great for tight-peg pairs, but
            if prices diverge, LPs experience more severe impermanent loss than
            they would at p=2. Choose a concentration level that matches the
            expected price volatility of your token pair.
          </p>
          <p>
            The loss is &ldquo;impermanent&rdquo; because it reverses if prices
            return to the original ratio. Trading fees earned may also offset
            the loss over time.
          </p>
        </SectionCard>

        <SectionCard icon={Gauge} title="TWAP Oracle" accentColor="#6366F1">
          <p>
            Each Orbital pool maintains a{' '}
            <strong className="text-gray-300">time-weighted average price
            (TWAP)</strong> oracle by accumulating reserve snapshots on every
            trade and liquidity event. This makes the pool resistant to
            single-block price manipulation and provides reliable on-chain
            price data for other protocols.
          </p>
        </SectionCard>

        <TipCard>
          On testnets (Holesky, Arbitrum Sepolia), tokens have no real
          value &mdash; so there is no real financial risk. Use testnet pools to
          learn the mechanics before using mainnet.
        </TipCard>
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-4 pb-8">
        <Link
          to="/advanced"
          className={clsx(
            'inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-sm font-semibold',
            'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white',
            'transition-all hover:from-indigo-500 hover:to-indigo-400 hover:shadow-lg hover:shadow-indigo-500/25',
          )}
        >
          Open Orbital AMM
          <ChevronRight className="h-4 w-4" />
        </Link>
        <p className="text-xs text-gray-500">
          Need more help?{' '}
          <Link to="/settings" className="text-indigo-400 hover:text-indigo-300">
            Contact support
          </Link>
        </p>
      </div>
    </div>
  );
}
