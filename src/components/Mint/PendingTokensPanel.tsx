import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { useWallet } from '../../hooks/useWallet';
import { listMintApprovalRequests } from '../../lib/api/mintRequests';
import { getNetworkMetadata } from '../../contracts/addresses';
import { formatAddress } from '../../lib/utils/helpers';
import { formatTokenAmount } from '../../lib/formatters';
import type { MintApprovalRequestItem } from '../../types/mintApproval';

interface PendingTokensPanelProps {
  selectedRequestId?: string | null;
  onSelectRequest: (request: MintApprovalRequestItem) => void;
}

function extractApiErrorMessage(err: unknown, fallback: string): string {
  const candidate = err as {
    response?: { data?: { error?: { message?: string } } };
    message?: string;
  };
  const apiMessage = candidate?.response?.data?.error?.message;
  if (typeof apiMessage === 'string' && apiMessage.trim()) {
    return apiMessage.trim();
  }
  if (typeof candidate?.message === 'string' && candidate.message.trim()) {
    return candidate.message.trim();
  }
  return fallback;
}

export default function PendingTokensPanel({
  selectedRequestId = null,
  onSelectRequest,
}: PendingTokensPanelProps) {
  const { isConnected, chainId, switchNetwork } = useWallet();
  const [requests, setRequests] = useState<MintApprovalRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = useCallback(
    async (refresh = false) => {
      if (!isConnected) {
        setRequests([]);
        setError(null);
        return;
      }

      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const response = await listMintApprovalRequests({ limit: 30 });
        setRequests(response.requests);
        setError(null);
      } catch (err) {
        setError(
          extractApiErrorMessage(err, 'Unable to load pending token requests.'),
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [isConnected],
  );

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    if (!isConnected) return undefined;
    const timer = setInterval(() => {
      void fetchRequests(true);
    }, 20_000);
    return () => clearInterval(timer);
  }, [fetchRequests, isConnected]);

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Pending Tokens
        </p>
        <p className="mt-2 text-sm text-gray-400">
          Connect your wallet to view pending and approved mint requests.
        </p>
      </div>
    );
  }

  const approvedCount = requests.filter((r) => r.status === 'approved').length;
  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <section aria-label="Pending tokens" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Pending Tokens
          </p>
          <p className="mt-1 text-sm text-gray-400">
            {approvedCount} approved, {pendingCount} awaiting banker review.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void fetchRequests(true);
          }}
          disabled={isRefreshing}
          className={clsx(
            'inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/[0.08]',
            'bg-white/[0.03] px-3.5 py-2 text-xs font-semibold text-gray-300',
            'transition-all hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <RefreshCw
            className={clsx('h-3.5 w-3.5', isRefreshing && 'animate-spin')}
          />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.08] p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-5 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading pending requests...
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-5 text-sm text-gray-400">
          No mint requests found yet. Submit a mint request to banker from the form below.
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const isApproved = request.status === 'approved';
            const isPending = request.status === 'pending';
            const network = getNetworkMetadata(request.chainId);
            const chainLabel = network?.name ?? `Chain ${request.chainId}`;
            const onCurrentChain = chainId === request.chainId;
            const isSelected = selectedRequestId === request.id;

            return (
              <article
                key={request.id}
                className={clsx(
                  'rounded-2xl border bg-[#0D0F14]/70 p-4 transition-all',
                  isSelected
                    ? 'border-indigo-500/35 shadow-[0_0_0_1px_rgba(99,102,241,0.25)]'
                    : 'border-white/[0.06]',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">
                      {request.tokenName}{' '}
                      <span className="text-indigo-300">({request.tokenSymbol})</span>
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {formatTokenAmount(request.mintAmount)} {request.currency} to{' '}
                      <span className="font-mono">{formatAddress(request.recipient)}</span>
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {chainLabel}
                    </p>
                  </div>

                  {isApproved ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/[0.12] px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" />
                      Approved
                    </span>
                  ) : isPending ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/[0.12] px-2.5 py-1 text-[11px] font-semibold text-amber-300">
                      <Clock className="h-3 w-3" />
                      Pending
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/[0.12] px-2.5 py-1 text-[11px] font-semibold text-red-300">
                      <AlertCircle className="h-3 w-3" />
                      Rejected
                    </span>
                  )}
                </div>

                {request.reviewNotes && (
                  <p className="mt-3 text-xs text-gray-400">
                    {request.reviewNotes}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {isApproved ? (
                    onCurrentChain ? (
                      <button
                        type="button"
                        onClick={() => onSelectRequest(request)}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 py-2 text-xs font-semibold text-white transition-all hover:brightness-110"
                      >
                        <Wallet className="h-3.5 w-3.5" />
                        Mint Approved Token
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          void switchNetwork(request.chainId);
                        }}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/[0.12] px-4 py-2 text-xs font-semibold text-cyan-200 transition-all hover:bg-cyan-500/[0.18]"
                      >
                        Switch to {chainLabel}
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectRequest(request)}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.04] px-4 py-2 text-xs font-semibold text-gray-300 transition-all hover:bg-white/[0.08]"
                    >
                      Use in Form
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
