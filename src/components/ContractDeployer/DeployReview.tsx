/**
 * DeployReview -- summary panel shown in the "review" step of the deploy wizard.
 *
 * Displays the selected template, connected network, every constructor
 * parameter value, and a gas estimation section. The layout mirrors the
 * review step in DeployTokenPage.tsx (summary table with divide-y rows,
 * gas estimate bar, glassmorphism card styling).
 */

import { useMemo } from 'react';
import clsx from 'clsx';
import {
  Loader2,
  AlertTriangle,
  Fuel,
  Globe,
  FileCode2,
} from 'lucide-react';

import type {
  ContractTemplate,
  GasEstimate,
  TemplateCategory,
} from '../../types/contractDeployer';
import { BADGE_CLASSES } from '../../lib/designTokens';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DeployReviewProps {
  /** Template being deployed. */
  template: ContractTemplate;
  /** Current form values keyed by parameter name. */
  values: Record<string, string>;
  /** Gas estimation result (null if not yet estimated). */
  gasEstimate: GasEstimate | null;
  /** Whether gas estimation is currently in progress. */
  isEstimating: boolean;
  /** Connected chain ID, or null if not connected. */
  chainId: number | null;
  /** Human-readable network name. */
  chainName: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Category label and badge colour mapping. */
const CATEGORY_STYLES: Record<
  TemplateCategory,
  { label: string; badge: string }
> = {
  tokens: { label: 'Token', badge: BADGE_CLASSES.accent },
  nfts: { label: 'NFT', badge: BADGE_CLASSES.info },
  staking: { label: 'Staking', badge: BADGE_CLASSES.success },
  trading: { label: 'Trading', badge: BADGE_CLASSES.warning },
  utility: { label: 'Utility', badge: BADGE_CLASSES.neutral },
};

/**
 * Format a parameter value for display.
 * Truncates addresses / hex strings while keeping them readable.
 */
function formatValue(value: string, type: string): string {
  if (!value) return '\u2014'; // em dash

  // Addresses: show checksummed short form
  if (type === 'address' && /^0x[0-9a-fA-F]{40}$/.test(value.trim())) {
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
  }

  // Bytes: truncate long hex
  if (type === 'bytes32' && value.length > 18) {
    return `${value.slice(0, 10)}...${value.slice(-8)}`;
  }

  // Bool
  if (type === 'bool') {
    return value === 'true' ? 'True' : 'False';
  }

  // Arrays: show item count + truncated preview
  if (type === 'address[]' || type === 'uint256[]') {
    const items = value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    if (items.length === 0) return '\u2014';
    if (items.length === 1) return items[0].length > 18 ? `${items[0].slice(0, 10)}...${items[0].slice(-6)}` : items[0];
    return `${items.length} items`;
  }

  // Fixed array
  if (type === 'uint256[5]') {
    const items = value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    return `[${items.join(', ')}]`;
  }

  // Strings / numbers: return as-is (truncate if extremely long)
  if (value.length > 60) {
    return `${value.slice(0, 30)}...${value.slice(-10)}`;
  }

  return value;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DeployReview({
  template,
  values,
  gasEstimate,
  isEstimating,
  chainId,
  chainName,
}: DeployReviewProps) {
  const categoryStyle = CATEGORY_STYLES[template.category] ?? CATEGORY_STYLES.utility;

  /** Build a list of label/value items for the summary table. */
  const summaryItems = useMemo(() => {
    return template.constructorParams.map((param) => ({
      label: param.label,
      value: formatValue(values[param.name] ?? '', param.type),
      fullValue: values[param.name] ?? '',
      type: param.type,
    }));
  }, [template.constructorParams, values]);

  return (
    <div className="space-y-6">
      {/* Section heading */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">
          Review &amp; Deploy
        </h2>
        <p className="text-sm text-gray-500">
          Verify your configuration before deploying to the blockchain.
        </p>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Template identity */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex items-center gap-4 rounded-xl bg-white/[0.03] border border-white/[0.06] px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/[0.08] shrink-0">
          <FileCode2
            className="h-[18px] w-[18px] text-indigo-400"
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-white tracking-tight truncate">
            {template.name}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {template.description}
          </p>
        </div>
        <span
          className={clsx(BADGE_CLASSES.base, categoryStyle.badge, 'shrink-0')}
        >
          {categoryStyle.label}
        </span>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Network */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/[0.06] px-5 py-3.5">
        <Globe
          className="h-4 w-4 text-gray-500 shrink-0"
          aria-hidden="true"
        />
        <span className="text-sm text-gray-500">Network</span>
        <span className="ml-auto text-sm text-white font-medium">
          {chainName}
          {chainId !== null && (
            <span className="ml-1.5 text-xs text-gray-600">
              (Chain {chainId})
            </span>
          )}
        </span>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Constructor parameter summary */}
      {/* ---------------------------------------------------------------- */}
      {summaryItems.length > 0 && (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] divide-y divide-white/[0.04] overflow-hidden">
          <div className="px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Constructor Parameters
            </span>
          </div>
          <dl className="divide-y divide-white/[0.04]">
            {summaryItems.map((item) => (
              <div
                key={item.label}
                className="flex items-start justify-between gap-4 px-4 py-3"
              >
                <dt className="text-sm text-gray-500 shrink-0">
                  {item.label}
                </dt>
                <dd
                  className={clsx(
                    'text-sm text-white text-right font-medium break-all',
                    (item.type === 'address' ||
                      item.type === 'bytes32' ||
                      item.type === 'address[]') &&
                      'font-mono text-[13px]',
                  )}
                  title={item.fullValue}
                >
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* No-params notice */}
      {summaryItems.length === 0 && (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-5 py-4">
          <p className="text-sm text-gray-400">
            This contract has no constructor parameters.
          </p>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Gas estimation */}
      {/* ---------------------------------------------------------------- */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0D0F14] px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Fuel
            className="h-4 w-4 text-gray-500 shrink-0"
            aria-hidden="true"
          />
          <h3 className="text-sm font-semibold text-gray-200">
            Estimated Cost
          </h3>
        </div>

        {isEstimating && (
          <div className="flex items-center gap-2.5 text-sm text-gray-400">
            <Loader2
              className="h-4 w-4 animate-spin text-indigo-400"
              aria-hidden="true"
            />
            <span>Estimating deployment gas cost...</span>
          </div>
        )}

        {!isEstimating && gasEstimate && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Estimated cost</span>
              <span className="text-white font-mono tabular-nums">
                {gasEstimate.gasCostNative} ETH
              </span>
            </div>
            {gasEstimate.gasCostUsd && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">USD estimate</span>
                <span className="text-white tabular-nums">
                  ${gasEstimate.gasCostUsd}
                </span>
              </div>
            )}
          </div>
        )}

        {!isEstimating && !gasEstimate && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <AlertTriangle
              className="h-4 w-4 shrink-0 text-gray-600"
              aria-hidden="true"
            />
            <span>
              Unable to estimate gas. The estimate will be attempted once
              your wallet is connected to the target network.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
