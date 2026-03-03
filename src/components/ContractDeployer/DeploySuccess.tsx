/**
 * Deployment success screen for the Smart Contract Deployer.
 *
 * Displays the deployed contract address, transaction hash, block number,
 * gas used, and explorer links. Provides CTAs to interact with the newly
 * deployed contract or start a fresh deployment.
 */

import { useCallback, useState } from 'react';
import {
  ArrowRight,
  Blocks,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Fuel,
  Rocket,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  getExplorerAddressUrl,
  getExplorerTxUrl,
  SUPPORTED_NETWORKS,
} from '../../contracts/addresses';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DeploySuccessProps {
  templateName: string;
  contractAddress: string;
  txHash: string;
  chainId: number;
  blockNumber: number;
  gasUsed: string;
  onInteract: () => void;
  onDeployAnother: () => void;
}

// ---------------------------------------------------------------------------
// Copy button (matches DeployTokenPage pattern)
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-gray-400" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Explorer link button
// ---------------------------------------------------------------------------

function ExplorerButton({ href }: { href: string }) {
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] transition-colors"
      title="View on explorer"
    >
      <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
    </a>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeploySuccess({
  templateName,
  contractAddress,
  txHash,
  chainId,
  blockNumber,
  gasUsed,
  onInteract,
  onDeployAnother,
}: DeploySuccessProps) {
  const networkName =
    SUPPORTED_NETWORKS[chainId]?.name ?? `Chain ${chainId}`;
  const explorerAddressUrl = getExplorerAddressUrl(chainId, contractAddress);
  const explorerTxUrl = getExplorerTxUrl(chainId, txHash);

  return (
    <div className="space-y-6">
      {/* Success icon + heading */}
      <div className="text-center">
        <div className="flex items-center justify-center mb-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 ring-4 ring-emerald-500/20">
            <CheckCircle2
              className="h-8 w-8 text-emerald-400"
              aria-hidden="true"
            />
          </div>
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">
          Contract Deployed
        </h2>
        <p className="text-sm text-gray-500">
          Your <span className="text-gray-400 font-medium">{templateName}</span>{' '}
          contract has been deployed to{' '}
          <span className="text-gray-400 font-medium">{networkName}</span>.
        </p>
      </div>

      {/* Address + TX cards */}
      <div className="space-y-3">
        {/* Contract address */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1.5">Contract Address</p>
          <div className="flex items-center gap-2">
            <code className="text-sm text-emerald-300 font-mono break-all flex-1">
              {contractAddress}
            </code>
            <CopyButton text={contractAddress} />
            <ExplorerButton href={explorerAddressUrl} />
          </div>
        </div>

        {/* Transaction hash */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1.5">Transaction Hash</p>
          <div className="flex items-center gap-2">
            <code className="text-sm text-gray-300 font-mono break-all flex-1">
              {txHash}
            </code>
            <CopyButton text={txHash} />
            <ExplorerButton href={explorerTxUrl} />
          </div>
        </div>

        {/* Block number + gas used stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Blocks className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
              <p className="text-xs text-gray-500">Block Number</p>
            </div>
            <p className="text-sm text-white font-mono font-medium">
              {blockNumber.toLocaleString()}
            </p>
          </div>

          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Fuel className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
              <p className="text-xs text-gray-500">Gas Used</p>
            </div>
            <p className="text-sm text-white font-mono font-medium">
              {Number(gasUsed).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* CTA buttons */}
      <div className="flex flex-col gap-3 pt-2">
        <button
          type="button"
          onClick={onInteract}
          className={clsx(
            'w-full flex items-center justify-center gap-2',
            'bg-indigo-600 hover:bg-indigo-500',
            'text-white rounded-xl px-6 py-3.5 font-medium transition-colors',
          )}
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
          Interact with Contract
        </button>

        <button
          type="button"
          onClick={onDeployAnother}
          className="w-full flex items-center justify-center gap-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-white rounded-xl px-6 py-3 font-medium transition-colors"
        >
          <Rocket className="h-4 w-4" aria-hidden="true" />
          Deploy Another
        </button>
      </div>
    </div>
  );
}
