import type { TradeHistory } from '../../types';
import ActivityFeed from './ActivityFeed';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecentActivityProps {
  trades: TradeHistory[];
  maxItems?: number;
  chainId?: number | null;
}

// ---------------------------------------------------------------------------
// Component
//
// Thin wrapper around the existing ActivityFeed that can be used as a
// self-contained sub-component in the Dashboard layout. This keeps the
// orchestrator (DashboardPage) clean and allows the RecentActivity
// section to be independently lazy-loaded or skeleton-gated in the future.
// ---------------------------------------------------------------------------

export default function RecentActivity({ trades, maxItems, chainId }: RecentActivityProps) {
  return <ActivityFeed trades={trades} maxItems={maxItems} chainId={chainId} />;
}
