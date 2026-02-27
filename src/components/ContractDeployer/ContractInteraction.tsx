/**
 * ContractInteraction -- main interaction panel for a deployed contract.
 *
 * Parses the contract ABI into read (view/pure) and write (nonpayable/payable)
 * categories, then renders a tabbed interface where each function gets its own
 * collapsible accordion (ReadFunction or WriteFunction).
 */

import { useState, useMemo } from 'react';
import { parseABI } from '../../lib/contractDeployer/abiParser';
import { SUPPORTED_NETWORKS } from '../../contracts/addresses';
import { formatAddress } from '../../lib/utils/helpers';
import { CARD_CLASSES, BADGE_CLASSES } from '../../lib/designTokens';
import ReadFunction from './ReadFunction';
import WriteFunction from './WriteFunction';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  contractAddress: string;
  abi: readonly Record<string, unknown>[];
  chainId: number;
  templateName?: string;
}

// ---------------------------------------------------------------------------
// Tab type
// ---------------------------------------------------------------------------

type Tab = 'read' | 'write';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ContractInteraction({ contractAddress, abi, chainId, templateName }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('read');

  const parsed = useMemo(() => {
    try {
      return parseABI(abi);
    } catch {
      return { readFunctions: [], writeFunctions: [], events: [] };
    }
  }, [abi]);

  const network = SUPPORTED_NETWORKS[chainId];
  const networkName = network?.name ?? `Chain ${chainId}`;
  const explorerUrl = network?.blockExplorer
    ? `${network.blockExplorer}/address/${contractAddress}`
    : null;

  return (
    <div className="space-y-6">
      {/* Contract info header */}
      <div className={`${CARD_CLASSES.base} ${CARD_CLASSES.paddingSm} relative overflow-hidden`}>
        <div className={CARD_CLASSES.gradientAccent} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {templateName && (
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                {templateName}
              </p>
            )}
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-white truncate">
                {formatAddress(contractAddress)}
              </h2>
              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 text-[11px] font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  View on Explorer
                </a>
              )}
            </div>
            <p className="mt-1 font-mono text-xs text-gray-600 break-all sm:hidden">
              {contractAddress}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`${BADGE_CLASSES.base} ${BADGE_CLASSES.accent}`}>
              {networkName}
            </span>
            <span className={`${BADGE_CLASSES.base} ${BADGE_CLASSES.neutral}`}>
              {parsed.readFunctions.length}R / {parsed.writeFunctions.length}W
            </span>
          </div>
        </div>
      </div>

      {/* Tab buttons */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.04]">
        <TabButton
          label="Read"
          count={parsed.readFunctions.length}
          isActive={activeTab === 'read'}
          onClick={() => setActiveTab('read')}
        />
        <TabButton
          label="Write"
          count={parsed.writeFunctions.length}
          isActive={activeTab === 'write'}
          onClick={() => setActiveTab('write')}
        />
      </div>

      {/* Tab content */}
      {activeTab === 'read' && (
        <div className="space-y-3">
          {parsed.readFunctions.length === 0 ? (
            <EmptyState message="No read functions found in this contract ABI." />
          ) : (
            parsed.readFunctions.map((func) => (
              <ReadFunction
                key={func.name}
                func={func}
                contractAddress={contractAddress}
                abi={abi}
              />
            ))
          )}
        </div>
      )}

      {activeTab === 'write' && (
        <div className="space-y-3">
          {parsed.writeFunctions.length === 0 ? (
            <EmptyState message="No write functions found in this contract ABI." />
          ) : (
            parsed.writeFunctions.map((func) => (
              <WriteFunction
                key={func.name}
                func={func}
                contractAddress={contractAddress}
                abi={abi}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TabButton({
  label,
  count,
  isActive,
  onClick,
}: {
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
        isActive
          ? 'text-white'
          : 'text-gray-500 hover:text-gray-300'
      }`}
    >
      {isActive && (
        <span className="absolute inset-0 rounded-lg bg-indigo-500/20 border border-indigo-500/30" />
      )}
      <span className="relative flex items-center justify-center gap-2">
        {label}
        <span
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
            isActive
              ? 'bg-indigo-500/30 text-indigo-300'
              : 'bg-white/[0.06] text-gray-500'
          }`}
        >
          {count}
        </span>
      </span>
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-4">
        <svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9.75m3 0h3m-1.5-3h1.5m-4.5 0h1.5m-4.5 3H6m3 0H6m12-7.875v9.375c0 .621-.504 1.125-1.125 1.125H7.125A1.125 1.125 0 016 16.5V4.875c0-.621.504-1.125 1.125-1.125h5.25"
          />
        </svg>
      </div>
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}
