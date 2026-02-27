/**
 * Contract Interaction Page -- `/contracts/:chainId/:address`
 *
 * Loads a previously deployed contract from localStorage (DeploymentRecord) or
 * allows the user to paste an ABI manually. Once an ABI is available, renders
 * the full ContractInteraction panel with read/write function tabs.
 */

import { useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { ethers } from 'ethers';

import { getDeployment } from '../lib/contractDeployer/deploymentHistory';
import { useWalletStore } from '../store/walletStore';
import { SUPPORTED_NETWORKS } from '../contracts/addresses';
import { formatAddress } from '../lib/utils/helpers';
import { CARD_CLASSES, INPUT_CLASSES, BADGE_CLASSES } from '../lib/designTokens';
import ContractInteraction from '../components/ContractDeployer/ContractInteraction';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ContractInteractPage() {
  const { chainId: chainIdParam, address: addressParam } = useParams<{
    chainId: string;
    address: string;
  }>();

  const walletChainId = useWalletStore((s) => s.wallet.chainId);

  // Parse route params
  const chainId = chainIdParam ? Number(chainIdParam) : 0;
  const contractAddress = addressParam ?? '';

  // Validate the address is a valid Ethereum address
  const isValidAddress = useMemo(() => {
    try {
      return ethers.isAddress(contractAddress);
    } catch {
      return false;
    }
  }, [contractAddress]);

  // Checksummed address for display and lookups
  const checksumAddress = useMemo(() => {
    if (!isValidAddress) return contractAddress;
    try {
      return ethers.getAddress(contractAddress);
    } catch {
      return contractAddress;
    }
  }, [contractAddress, isValidAddress]);

  // Look up deployment record from localStorage
  const deploymentRecord = useMemo(() => {
    if (!chainId || !isValidAddress) return undefined;
    return getDeployment(chainId, contractAddress);
  }, [chainId, contractAddress, isValidAddress]);

  // ABI state -- pre-filled from deployment record or entered manually
  const [manualAbiText, setManualAbiText] = useState('');
  const [manualAbi, setManualAbi] = useState<readonly Record<string, unknown>[] | null>(null);
  const [abiError, setAbiError] = useState<string | null>(null);

  // Determine which ABI to use
  const abi = deploymentRecord?.abi ?? manualAbi;
  const templateName = deploymentRecord?.templateName;

  // Network info
  const network = SUPPORTED_NETWORKS[chainId];
  const networkName = network?.name ?? `Chain ${chainId}`;
  const isWrongChain = walletChainId !== null && walletChainId !== chainId;

  // Load ABI from manual input
  const handleLoadAbi = useCallback(() => {
    setAbiError(null);
    setManualAbi(null);

    const trimmed = manualAbiText.trim();
    if (!trimmed) {
      setAbiError('Please paste a contract ABI (JSON array).');
      return;
    }

    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) {
        setAbiError('ABI must be a JSON array. Received a non-array value.');
        return;
      }
      if (parsed.length === 0) {
        setAbiError('ABI array is empty. Please paste a valid contract ABI.');
        return;
      }

      // Quick validation: try to parse it with ethers Interface
      new ethers.Interface(parsed as ethers.InterfaceAbi);

      setManualAbi(parsed as readonly Record<string, unknown>[]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid ABI format';
      setAbiError(`Failed to parse ABI: ${message}`);
    }
  }, [manualAbiText]);

  // ---------------------------------------------------------------------------
  // Invalid route params
  // ---------------------------------------------------------------------------

  if (!chainId || !isValidAddress) {
    return (
      <div className="w-full">
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20">
              <svg className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Invalid Contract URL</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              {!chainId && 'Missing or invalid chain ID in the URL.'}
              {chainId && !isValidAddress && 'The provided address is not a valid Ethereum address.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="w-full">
      {/* Page header */}
      <div className="mb-8 sm:mb-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {templateName && (
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400/60 mb-1.5">
                {templateName}
              </p>
            )}
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl flex items-center gap-3 flex-wrap">
              <span className="truncate">{formatAddress(checksumAddress)}</span>
              <span className={`${BADGE_CLASSES.base} ${BADGE_CLASSES.accent}`}>
                {networkName}
              </span>
            </h1>
            <p className="mt-2 font-mono text-xs text-gray-600 break-all">
              {checksumAddress}
            </p>
          </div>
        </div>
      </div>

      {/* Wrong chain warning */}
      {isWrongChain && (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-5 py-4 flex items-start gap-3">
          <svg className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-400">Wrong Network</p>
            <p className="mt-1 text-[13px] text-amber-400/70 leading-relaxed">
              This contract is on <strong>{networkName}</strong> but your wallet is connected to{' '}
              <strong>{SUPPORTED_NETWORKS[walletChainId!]?.name ?? `Chain ${walletChainId}`}</strong>.
              Switch your wallet to the correct network to interact with this contract.
            </p>
          </div>
        </div>
      )}

      {/* ABI section */}
      {abi ? (
        /* ABI loaded -- show interaction panel */
        <ContractInteraction
          contractAddress={checksumAddress}
          abi={abi}
          chainId={chainId}
          templateName={templateName}
        />
      ) : (
        /* No deployment record -- manual ABI entry */
        <div className={`${CARD_CLASSES.base} ${CARD_CLASSES.padding} relative overflow-hidden`}>
          <div className={CARD_CLASSES.gradientAccent} />

          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white mb-1">Load Contract ABI</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                No deployment record was found for this contract. Paste the contract ABI below to
                interact with it.
              </p>
            </div>

            <div>
              <label className={INPUT_CLASSES.label}>
                ABI (JSON Array)
              </label>
              <textarea
                value={manualAbiText}
                onChange={(e) => {
                  setManualAbiText(e.target.value);
                  setAbiError(null);
                }}
                placeholder='[{"inputs":[],"stateMutability":"nonpayable","type":"constructor"}, ...]'
                rows={10}
                className={`${INPUT_CLASSES.light} resize-y font-mono text-xs !py-3 leading-relaxed`}
              />
            </div>

            {/* Error */}
            {abiError && (
              <div className="rounded-lg bg-red-500/[0.06] border border-red-500/10 px-4 py-3">
                <p className="text-sm text-red-300/90">{abiError}</p>
              </div>
            )}

            {/* Load button */}
            <button
              type="button"
              onClick={handleLoadAbi}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-indigo-400 active:scale-[0.98]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Load ABI
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
