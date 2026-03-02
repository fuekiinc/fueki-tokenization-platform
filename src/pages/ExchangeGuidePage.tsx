import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowLeft,
  ArrowLeftRight,
  BookOpen,
  ChevronRight,
  CircleDollarSign,
  Coins,
  FileText,
  Layers,
  ListOrdered,
  ShieldCheck,
  Wallet,
  XCircle,
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ExchangeGuidePage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Back link */}
      <Link
        to="/exchange"
        className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-gray-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Exchange
      </Link>

      {/* Hero */}
      <div className="mb-12">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/15">
            <BookOpen className="h-5 w-5 text-indigo-400" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Exchange Guide
          </h1>
        </div>
        <p className="max-w-xl text-base leading-relaxed text-gray-400">
          Everything you need to know to trade tokenized assets on the Fueki
          peer-to-peer exchange. Follow the steps below to place your first
          order.
        </p>
      </div>

      {/* Prerequisites */}
      <div className="mb-10 space-y-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          Before You Start
        </h2>
        <SectionCard icon={Wallet} title="Connect Your Wallet" accentColor="#6366F1">
          <p>
            Make sure your wallet (MetaMask, Coinbase, etc.) is connected and on
            a <strong className="text-gray-300">supported network</strong> where
            the platform contracts are deployed (Ethereum Mainnet, Holesky,
            Arbitrum Sepolia).
          </p>
        </SectionCard>
        <SectionCard icon={Coins} title="Have Tokens to Trade" accentColor="#8B5CF6">
          <p>
            You need at least one tokenized asset in your wallet. Go to the{' '}
            <Link to="/mint" className="text-indigo-400 underline underline-offset-2 hover:text-indigo-300">
              Mint page
            </Link>{' '}
            to create your first asset, or receive tokens from another user.
          </p>
          <p>
            You also need a small amount of <strong className="text-gray-300">ETH</strong> to
            pay gas fees for each transaction.
          </p>
        </SectionCard>
      </div>

      {/* Core flow */}
      <div className="mb-10 space-y-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <ArrowLeftRight className="h-5 w-5 text-indigo-400" />
          How to Trade
        </h2>

        <SectionCard step={1} icon={ListOrdered} title="Create a Limit Order" accentColor="#3B82F6">
          <p>
            On the Exchange page, select the <strong className="text-gray-300">Limit</strong> tab
            in the trade form. A limit order lets you set an exact price at
            which you want to buy or sell.
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-gray-300">Sell side:</strong> Choose the
              token you want to sell and enter the amount.
            </li>
            <li>
              <strong className="text-gray-300">Buy side:</strong> Choose the
              token you want to receive and enter the amount you expect.
            </li>
          </ul>
          <p className="mt-2">
            The ratio of sell-to-buy amounts is your effective limit price. For
            example, selling 100 TOKEN_A for 50 TOKEN_B means your price is 0.5
            TOKEN_B per TOKEN_A.
          </p>
        </SectionCard>

        <SectionCard step={2} icon={FileText} title="Approve Token Spending" accentColor="#8B5CF6">
          <p>
            Before your first trade with a specific token, you will be prompted
            to <strong className="text-gray-300">approve</strong> the exchange
            contract to spend your tokens. This is a one-time on-chain
            transaction per token.
          </p>
          <p>
            Your wallet will pop up asking you to confirm the approval. After
            confirmation, the exchange can move tokens on your behalf when an
            order is matched.
          </p>
        </SectionCard>

        <SectionCard step={3} icon={Zap} title="Submit Your Order" accentColor="#06B6D4">
          <p>
            Click <strong className="text-gray-300">"Place Order"</strong> and
            confirm the transaction in your wallet. Your order is now live
            on-chain and visible in the order book.
          </p>
          <p>
            Your tokens are <strong className="text-gray-300">locked in the contract</strong> until
            the order is filled or you cancel it.
          </p>
        </SectionCard>

        <SectionCard step={4} icon={ArrowLeftRight} title="Wait for a Match" accentColor="#10B981">
          <p>
            When another user submits a counter-order that matches your price,
            the exchange automatically settles the trade. Both parties receive
            their tokens instantly on-chain.
          </p>
          <p>
            You can check the status of your orders in the{' '}
            <strong className="text-gray-300">"Your Orders"</strong> panel below
            the order book. Orders can be partially filled over multiple trades.
          </p>
        </SectionCard>
      </div>

      {/* ETH trading */}
      <div className="mb-10 space-y-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <CircleDollarSign className="h-5 w-5 text-cyan-400" />
          Trading with ETH
        </h2>
        <SectionCard icon={CircleDollarSign} title="Native ETH Support" accentColor="#06B6D4">
          <p>
            The exchange supports trading with <strong className="text-gray-300">native ETH</strong> directly
            &mdash; no need to wrap it into WETH first. When you select ETH as the
            sell token, your ETH is sent with the order transaction.
          </p>
          <p>
            If you cancel a sell-ETH order, you will be prompted to withdraw
            your ETH back from the exchange contract.
          </p>
        </SectionCard>
      </div>

      {/* AMM mode */}
      <div className="mb-10 space-y-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Layers className="h-5 w-5 text-violet-400" />
          AMM Swaps (Automated Market Maker)
        </h2>
        <SectionCard icon={Layers} title="Instant Token Swaps" accentColor="#A78BFA">
          <p>
            If an AMM liquidity pool exists for your token pair, you can switch
            to the <strong className="text-gray-300">AMM</strong> tab for
            instant swaps instead of placing limit orders.
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              Select the tokens and amount you want to swap.
            </li>
            <li>
              The AMM calculates a live quote based on pool reserves.
            </li>
            <li>
              Adjust <strong className="text-gray-300">slippage tolerance</strong> if needed (default is 0.5%).
            </li>
            <li>
              Confirm the swap in your wallet. Settlement is instant.
            </li>
          </ul>
        </SectionCard>
      </div>

      {/* Managing orders */}
      <div className="mb-10 space-y-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <XCircle className="h-5 w-5 text-red-400" />
          Managing Your Orders
        </h2>
        <SectionCard icon={XCircle} title="Cancel an Order" accentColor="#EF4444">
          <p>
            Open orders can be cancelled at any time. In the{' '}
            <strong className="text-gray-300">"Your Orders"</strong> panel, find
            the order and click <strong className="text-gray-300">"Cancel"</strong>.
            Your unsold tokens are returned to your wallet immediately.
          </p>
          <p>
            Partially-filled orders can also be cancelled — you keep the tokens
            you already received from partial fills, and the remaining unfilled
            tokens are returned.
          </p>
        </SectionCard>
      </div>

      {/* Tips */}
      <div className="mb-12 space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Zap className="h-5 w-5 text-amber-400" />
          Pro Tips
        </h2>
        <TipCard>
          Check the <strong>Order Book</strong> before placing your order to see
          what prices other traders are offering. Matching existing orders gets
          you faster fills.
        </TipCard>
        <TipCard>
          Start with a small test order to familiarize yourself with the flow
          before trading larger amounts.
        </TipCard>
        <TipCard>
          If you&apos;re on a testnet (Holesky, Arbitrum Sepolia), your tokens
          and ETH have no real value — feel free to experiment!
        </TipCard>
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-4 pb-8">
        <Link
          to="/exchange"
          className={clsx(
            'inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-sm font-semibold',
            'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white',
            'transition-all hover:from-indigo-500 hover:to-indigo-400 hover:shadow-lg hover:shadow-indigo-500/25',
          )}
        >
          Start Trading
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
