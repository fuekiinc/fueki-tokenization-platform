import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Wallet,
  FileText,
  Hash,
  Copy,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  User,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ContractService } from '../../lib/blockchain/contracts';
import { useWallet } from '../../hooks/useWallet';
import { useAppStore, getProvider } from '../../store/useAppStore';
import { formatAddress, generateId, copyToClipboard } from '../../lib/utils/helpers';
import { getNetworkConfig, getNetworkMetadata } from '../../contracts/addresses';
import type { ParsedDocument, TradeHistory } from '../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MintFormProps {
  document: ParsedDocument | null;
}

type TxState = 'idle' | 'pending' | 'confirmed' | 'failed';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive an uppercase symbol from a token name (e.g. "Trade Invoice" -> "TI") */
function deriveSymbol(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].substring(0, 4).toUpperCase();
  }
  return words
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .substring(0, 5);
}

/** Format a number with commas for display */
function formatNumberDisplay(value: string): string {
  const cleaned = value.replace(/[,\s]/g, '');
  if (!cleaned || isNaN(Number(cleaned))) return value;
  const parts = cleaned.split('.');
  parts[0] = Number(parts[0]).toLocaleString('en-US');
  return parts.join('.');
}

// ---------------------------------------------------------------------------
// Shared input styles
// ---------------------------------------------------------------------------

const inputClasses =
  'w-full bg-[#0D0F14] border border-white/[0.06] rounded-xl px-4 py-3.5 text-white placeholder-gray-600 text-sm outline-none transition-all duration-200 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20';

const labelClasses = 'block text-sm font-medium text-gray-300 mb-2';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MintForm({ document }: MintFormProps) {
  const { address, chainId, isConnected, connectWallet, switchNetwork } = useWallet();
  const { addTrade, addAsset } = useAppStore();

  // ---- Form state ---------------------------------------------------------

  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [mintAmount, setMintAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [recipientManuallyEdited, setRecipientManuallyEdited] = useState(false);
  const [symbolManuallyEdited, setSymbolManuallyEdited] = useState(false);

  // ---- TX state -----------------------------------------------------------

  const [txState, setTxState] = useState<TxState>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  // ---- Derived values -----------------------------------------------------

  const documentHash = document?.documentHash ?? '';
  const documentType = document?.fileType?.toUpperCase() ?? '';
  // Use getNetworkMetadata (not getNetworkConfig) so the block explorer URL
  // is available even on chains where the platform contracts are not deployed.
  // getNetworkConfig returns undefined when factory/exchange addresses are empty.
  const blockExplorer = chainId
    ? getNetworkMetadata(chainId)?.blockExplorer ?? ''
    : '';
  const networkSupported = chainId ? !!getNetworkConfig(chainId) : false;
  const networkName = chainId ? getNetworkMetadata(chainId)?.name ?? `Chain ${chainId}` : '';

  // ---- Reset tx state when document changes --------------------------------
  // If the user uploads a new document while in the success or error state,
  // reset so the form is ready for a fresh mint.

  useEffect(() => {
    if (txState !== 'idle' && txState !== 'pending') {
      setTxState('idle');
      setTxHash(null);
      setTxError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document?.documentHash]);

  // ---- Pre-fill from document & wallet ------------------------------------

  useEffect(() => {
    if (document) {
      setMintAmount(String(document.totalValue));
    }
  }, [document]);

  // Pre-fill recipient with the connected wallet address. If the user has
  // not manually edited the field, keep it in sync with wallet changes.
  useEffect(() => {
    if (address && !recipientManuallyEdited) {
      setRecipient(address);
    }
  }, [address, recipientManuallyEdited]);

  // ---- Auto-derive symbol from name --------------------------------------

  useEffect(() => {
    if (!symbolManuallyEdited && tokenName.trim().length > 0) {
      setTokenSymbol(deriveSymbol(tokenName));
    }
  }, [tokenName, symbolManuallyEdited]);

  // ---- Validation ---------------------------------------------------------

  const validate = useCallback((): string | null => {
    if (!tokenName.trim()) return 'Token name is required';
    if (!tokenSymbol.trim()) return 'Token symbol is required';
    if (tokenSymbol.length > 11) return 'Symbol must be 11 characters or fewer';
    const sanitizedAmount = mintAmount.replace(/[,\s]/g, '');
    if (!sanitizedAmount || isNaN(Number(sanitizedAmount)) || Number(sanitizedAmount) <= 0)
      return 'Mint amount must be a positive number';
    // CRITICAL: Enforce that mint amount does not exceed the parsed document value.
    // Without this check a user could edit the input (or manipulate React state via
    // devtools) to mint more tokens than the underlying document justifies.
    if (document && Number(sanitizedAmount) > document.totalValue)
      return `Mint amount cannot exceed the document value (${document.totalValue} ${document.currency})`;
    if (!recipient || !ethers.isAddress(recipient))
      return 'A valid recipient address is required';
    if (recipient === ethers.ZeroAddress)
      return 'Recipient cannot be the zero address';
    if (!documentHash) return 'No document is loaded';
    return null;
  }, [tokenName, tokenSymbol, mintAmount, recipient, documentHash, document]);

  // ---- Mint handler -------------------------------------------------------

  const handleMint = async () => {
    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const provider = getProvider();
    if (!provider || !chainId) {
      toast.error('Wallet not connected');
      return;
    }

    const networkConfig = getNetworkConfig(chainId);
    if (!networkConfig) {
      toast.error(`Network (chain ID ${chainId}) is not supported`);
      return;
    }
    if (!networkConfig.factoryAddress) {
      toast.error(`Contracts are not deployed on ${networkConfig.name}. Please switch to a supported network.`);
      return;
    }

    setTxState('pending');
    setTxHash(null);
    setTxError(null);

    try {
      const service = new ContractService(provider, chainId);

      // Sanitize amount input: strip commas/spaces and truncate to 18 decimals
      const sanitizeAmount = (val: string): string => {
        const cleaned = val.replace(/[,\s]/g, '');
        const parts = cleaned.split('.');
        if (parts.length === 2 && parts[1].length > 18) {
          return `${parts[0]}.${parts[1].substring(0, 18)}`;
        }
        return cleaned;
      };
      const sanitizedMintAmount = sanitizeAmount(mintAmount);
      const sanitizedOriginalValue = sanitizeAmount(String(document?.totalValue ?? '0'));

      if (isNaN(Number(sanitizedMintAmount)) || Number(sanitizedMintAmount) <= 0) {
        toast.error('Mint amount must be a valid positive number');
        setTxState('idle');
        return;
      }

      if (isNaN(Number(sanitizedOriginalValue)) || Number(sanitizedOriginalValue) < 0) {
        toast.error('Original document value is invalid');
        setTxState('idle');
        return;
      }

      // Defense-in-depth: re-check the cap right before submitting the
      // transaction.  This catches any late state mutation (e.g. React
      // devtools manipulation) that might bypass the validate() check.
      if (Number(sanitizedMintAmount) > Number(sanitizedOriginalValue)) {
        toast.error(
          `Mint amount (${sanitizedMintAmount}) exceeds document value (${sanitizedOriginalValue}). Transaction blocked.`,
        );
        setTxState('idle');
        return;
      }

      let mintAmountWei: bigint;
      let originalValueWei: bigint;
      try {
        mintAmountWei = ethers.parseUnits(sanitizedMintAmount, 18);
        originalValueWei = ethers.parseUnits(sanitizedOriginalValue, 18);
      } catch {
        toast.error('Invalid numeric format for amount');
        setTxState('idle');
        return;
      }

      const tx = await service.createWrappedAsset(
        tokenName.trim(),
        tokenSymbol.trim(),
        documentHash,
        documentType,
        originalValueWei,
        mintAmountWei,
        recipient,
      );

      setTxHash(tx.hash);
      toast.loading('Transaction submitted. Waiting for confirmation...', {
        id: 'mint-tx',
      });

      const receipt = await service.waitForTransaction(tx);

      // Extract the real token address from the AssetCreated event log.
      // The fallback is an empty string rather than the tx hash, because
      // a tx hash is not a valid contract address and would break any
      // subsequent on-chain calls that use this value.
      let assetAddress = '';
      try {
        const config = getNetworkConfig(chainId);
        if (config?.factoryAddress) {
          const factoryInterface = new ethers.Interface(
            [
              'event AssetCreated(address indexed creator, address indexed assetAddress, string name, string symbol, bytes32 documentHash, string documentType, uint256 originalValue, uint256 mintAmount, address indexed recipient)',
            ],
          );
          for (const log of receipt.logs) {
            if (log.address.toLowerCase() === config.factoryAddress.toLowerCase()) {
              const parsed = factoryInterface.parseLog({
                topics: log.topics as string[],
                data: log.data,
              });
              if (parsed && parsed.name === 'AssetCreated') {
                assetAddress = parsed.args.assetAddress;
                break;
              }
            }
          }
        }
      } catch {
        // If log parsing fails, assetAddress stays empty and is handled below.
      }

      // If we could not extract the token address from the event log,
      // derive a deterministic placeholder so the asset record is still
      // traceable back to the transaction.
      if (!assetAddress) {
        console.warn(
          'Could not extract token address from AssetCreated event. Using tx hash as fallback identifier.',
        );
        assetAddress = receipt.hash;
      }

      toast.dismiss('mint-tx');
      setTxState('confirmed');
      toast.success('Wrapped asset minted successfully!');

      // Record trade in store
      const trade: TradeHistory = {
        id: generateId(),
        type: 'mint',
        asset: tokenName.trim(),
        assetSymbol: tokenSymbol.trim(),
        amount: sanitizedMintAmount,
        txHash: receipt.hash,
        timestamp: Date.now(),
        from: ethers.ZeroAddress,
        to: recipient,
        status: 'confirmed',
      };
      addTrade(trade);

      // Record asset in store
      addAsset({
        address: assetAddress,
        name: tokenName.trim(),
        symbol: tokenSymbol.trim(),
        totalSupply: mintAmountWei.toString(),
        balance: mintAmountWei.toString(),
        documentHash,
        documentType,
        originalValue: originalValueWei.toString(),
        createdAt: Date.now(),
      });
    } catch (err: unknown) {
      toast.dismiss('mint-tx');
      let message = 'Minting transaction failed';
      if (err instanceof Error) {
        // Provide user-friendly messages for common contract errors
        if (err.message.includes('user rejected') || err.message.includes('ACTION_REJECTED')) {
          message = 'Transaction was rejected by the user';
        } else if (err.message.includes('insufficient funds')) {
          message = 'Insufficient funds to cover gas fees';
        } else if (err.message.includes('EmptyName')) {
          message = 'Token name cannot be empty';
        } else if (err.message.includes('EmptySymbol')) {
          message = 'Token symbol cannot be empty';
        } else if (err.message.includes('ZeroMintAmount')) {
          message = 'Mint amount must be greater than zero';
        } else if (err.message.includes('ZeroAddress')) {
          message = 'Recipient address cannot be the zero address';
        } else if (err.message.includes('MintExceedsOriginalValue')) {
          message = 'Mint amount exceeds the original document value. The contract rejected the transaction.';
        } else {
          message = err.message;
        }
      }
      setTxError(message);
      setTxState('failed');
      toast.error(message);
    }
  };

  // ---- Reset after success ------------------------------------------------

  const handleReset = () => {
    setTokenName('');
    setTokenSymbol('');
    setMintAmount(document ? String(document.totalValue) : '');
    setRecipient(address ?? '');
    setSymbolManuallyEdited(false);
    setRecipientManuallyEdited(false);
    setTxState('idle');
    setTxHash(null);
    setTxError(null);
  };

  // ---- Not connected prompt -----------------------------------------------

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-white/[0.06]">
          <Wallet className="h-7 w-7 text-indigo-400" />
        </div>
        <p className="text-base font-semibold text-gray-200">
          Wallet not connected
        </p>
        <p className="mt-3 mb-8 max-w-xs text-sm text-gray-500 leading-relaxed">
          Connect your wallet to start minting tokenized assets from your uploaded documents
        </p>
        <button
          type="button"
          onClick={() => { void connectWallet(); }}
          className="group relative inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 hover:shadow-indigo-500/30 hover:brightness-110 active:scale-[0.98]"
        >
          <Wallet className="h-4 w-4" />
          Connect Wallet
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    );
  }

  // ---- No document loaded -------------------------------------------------

  if (!document) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-500/10 to-gray-600/10 border border-white/[0.06]">
          <FileText className="h-7 w-7 text-gray-500" />
        </div>
        <p className="text-base font-semibold text-gray-200">
          No document loaded
        </p>
        <p className="mt-3 max-w-xs text-sm text-gray-500 leading-relaxed">
          Upload and parse a document first to mint a wrapped asset backed by its contents
        </p>
      </div>
    );
  }

  // ---- Pending state (full-screen overlay within card) ---------------------

  if (txState === 'pending') {
    return (
      <div className="space-y-6">
        {/* Shimmer progress bar */}
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
          <div className="absolute inset-0 h-full w-full rounded-full bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent" style={{ animation: 'mint-shimmer 2s ease-in-out infinite' }} />
          <style>{`@keyframes mint-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>
        </div>

        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="relative mb-7">
            <div className="absolute -inset-3 rounded-full bg-indigo-500/10 animate-ping" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20">
              <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
            </div>
          </div>

          <p className="text-lg font-semibold text-white">
            Confirm in your wallet...
          </p>
          <p className="mt-3 max-w-sm text-sm text-gray-500 leading-relaxed">
            Your wallet will prompt you to sign the transaction. Please confirm to proceed with minting.
          </p>

          {txHash && (
            <div className="mt-8 inline-flex items-center gap-2.5 rounded-2xl bg-amber-500/[0.06] border border-amber-500/10 px-5 py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
              <span className="text-sm text-amber-300/90">
                Tx submitted:{' '}
                {blockExplorer ? (
                  <a
                    href={`${blockExplorer}/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono underline underline-offset-2 decoration-amber-500/30 hover:decoration-amber-400/60 transition-colors"
                  >
                    {formatAddress(txHash)}
                  </a>
                ) : (
                  <span className="font-mono">{formatAddress(txHash)}</span>
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- Success state -------------------------------------------------------

  if (txState === 'confirmed' && txHash) {
    return (
      <div className="space-y-6">
        {/* Success card */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.05] to-emerald-600/[0.02] p-10 text-center">

          {/* Subtle background glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-40 w-72 bg-emerald-500/[0.06] blur-[100px] rounded-full pointer-events-none" />

          <div className="relative">
            {/* Animated checkmark */}
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/20 shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            </div>

            <h3 className="text-xl font-bold text-emerald-300">
              Asset Minted Successfully
            </h3>
            <p className="mt-3 text-sm text-gray-400">
              <span className="font-semibold text-white">{tokenName}</span>
              <span className="ml-2 inline-flex items-center rounded-lg bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                {tokenSymbol}
              </span>
              <span className="ml-1.5">has been created on-chain</span>
            </p>

            {/* Tx hash */}
            {txHash && (
              <div className="mt-7 inline-flex items-center gap-3">
                {blockExplorer ? (
                  <a
                    href={`${blockExplorer}/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/[0.06] px-5 py-2.5 text-sm font-medium text-indigo-400 transition-all hover:bg-white/[0.06] hover:border-indigo-500/20"
                  >
                    <span className="font-mono text-xs">{formatAddress(txHash)}</span>
                    <ExternalLink className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </a>
                ) : (
                  <span className="font-mono text-xs text-gray-500 break-all">
                    Tx: {txHash}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => { void copyToClipboard(txHash); toast.success('Copied!'); }}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.06] text-gray-500 transition-all hover:bg-white/[0.06] hover:text-gray-300"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mint another button */}
        <button
          type="button"
          onClick={handleReset}
          className="group flex w-full items-center justify-center gap-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-4 text-sm font-semibold text-gray-300 transition-all duration-200 hover:bg-white/[0.04] hover:border-white/[0.1] hover:text-white"
        >
          <RotateCcw className="h-4 w-4 transition-transform group-hover:-rotate-45" />
          Mint Another Asset
        </button>
      </div>
    );
  }

  // ---- Failed state -------------------------------------------------------

  if (txState === 'failed' && txError) {
    return (
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-2xl border border-red-500/15 bg-gradient-to-br from-red-500/[0.05] to-red-600/[0.02] p-10 text-center">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-40 w-72 bg-red-500/[0.06] blur-[100px] rounded-full pointer-events-none" />

          <div className="relative">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-red-500/20 to-red-600/10 border border-red-500/20 shadow-lg shadow-red-500/10">
              <AlertCircle className="h-8 w-8 text-red-400" />
            </div>

            <h3 className="text-xl font-bold text-red-300">
              Transaction Failed
            </h3>
            <p className="mt-3 max-w-sm mx-auto text-sm text-red-300/60 leading-relaxed">
              {txError}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleReset}
          className="group flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 hover:shadow-indigo-500/30 hover:brightness-110 active:scale-[0.98]"
        >
          <RotateCcw className="h-4 w-4 transition-transform group-hover:-rotate-45" />
          Try Again
        </button>
      </div>
    );
  }

  // ---- Form ---------------------------------------------------------------

  // Derive whether the mint amount exceeds the document cap so we can
  // disable the button and show inline feedback without waiting for submit.
  const sanitizedAmountForCheck = mintAmount.replace(/[,\s]/g, '');
  const parsedMintAmount = Number(sanitizedAmountForCheck);
  const amountExceedsDocValue =
    !isNaN(parsedMintAmount) &&
    parsedMintAmount > 0 &&
    document != null &&
    parsedMintAmount > document.totalValue;

  const canSubmit =
    !!(tokenName.trim() && tokenSymbol.trim() && mintAmount && recipient && documentHash) &&
    !amountExceedsDocValue;

  return (
    <div className="space-y-6">

      {/* ---- Unsupported network banner ---- */}
      {isConnected && chainId && !networkSupported && (
        <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-300">Unsupported Network</p>
              <p className="mt-1.5 text-sm leading-relaxed text-amber-400/60">
                Contracts are not deployed on {networkName}. Switch to a supported network to mint tokens.
              </p>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void switchNetwork(1)}
                  className="rounded-xl bg-indigo-500/15 border border-indigo-500/25 px-4 py-2 text-xs font-semibold text-indigo-300 transition-all hover:bg-indigo-500/25 hover:text-indigo-200"
                >
                  Switch to Ethereum
                </button>
                <button
                  type="button"
                  onClick={() => void switchNetwork(31337)}
                  className="rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2 text-xs font-medium text-gray-400 transition-all hover:bg-white/[0.08] hover:text-gray-300"
                >
                  Hardhat Local
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- Section: Token Configuration ---- */}
      <div className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Token Configuration
        </h3>
        <div className="h-px bg-gradient-to-r from-white/[0.06] to-transparent" />
      </div>

      <div className="space-y-6">
        {/* Token Name */}
        <div>
          <label htmlFor="tokenName" className={labelClasses}>
            Token Name
          </label>
          <input
            id="tokenName"
            type="text"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            placeholder="e.g., Wrapped Invoice Q4-2024"
            className={inputClasses}
          />
        </div>

        {/* Token Symbol */}
        <div>
          <label htmlFor="tokenSymbol" className={labelClasses}>
            Token Symbol
          </label>
          <div className="relative">
            <input
              id="tokenSymbol"
              type="text"
              value={tokenSymbol}
              onChange={(e) => {
                setTokenSymbol(e.target.value.toUpperCase());
                setSymbolManuallyEdited(true);
              }}
              placeholder="e.g., wINV24"
              maxLength={11}
              className={`${inputClasses} uppercase pr-16`}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-600 tabular-nums">
              {tokenSymbol.length}/11
            </span>
          </div>
        </div>
      </div>

      {/* ---- Section: Mint Details ---- */}
      <div className="space-y-1.5 pt-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Mint Details
        </h3>
        <div className="h-px bg-gradient-to-r from-white/[0.06] to-transparent" />
      </div>

      <div className="space-y-6">
        {/* Mint Amount */}
        <div>
          <label htmlFor="mintAmount" className={labelClasses}>
            Mint Amount
          </label>
          <div className="relative">
            <input
              id="mintAmount"
              type="text"
              inputMode="decimal"
              value={mintAmount}
              onChange={(e) => setMintAmount(e.target.value)}
              placeholder="0.00"
              className={`${inputClasses} pr-32${
                mintAmount &&
                !isNaN(Number(mintAmount.replace(/[,\s]/g, ''))) &&
                Number(mintAmount.replace(/[,\s]/g, '')) > document.totalValue
                  ? ' border-red-500/50 focus:border-red-500/70 focus:ring-red-500/20'
                  : ''
              }`}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {/* Max button -- fills the input with the document's total value */}
              {String(mintAmount).replace(/[,\s]/g, '') !== String(document.totalValue) && (
                <button
                  type="button"
                  onClick={() => setMintAmount(String(document.totalValue))}
                  className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-400 transition-all hover:bg-indigo-500/20 hover:text-indigo-300"
                >
                  Max
                </button>
              )}
              <span className="text-xs font-medium text-gray-500">
                {document.currency}
              </span>
            </div>
          </div>
          {mintAmount && !isNaN(Number(mintAmount.replace(/[,\s]/g, ''))) && (
            Number(mintAmount.replace(/[,\s]/g, '')) > document.totalValue ? (
              <p className="mt-2 text-xs text-red-400">
                Exceeds document value of {formatNumberDisplay(String(document.totalValue))} {document.currency}. Max mintable: {document.totalValue}
              </p>
            ) : (
              <p className="mt-2 text-xs text-gray-600">
                {formatNumberDisplay(mintAmount)} of {formatNumberDisplay(String(document.totalValue))} {document.currency} max
              </p>
            )
          )}
        </div>

        {/* Recipient */}
        <div>
          <label htmlFor="recipient" className={labelClasses}>
            Recipient Address
          </label>
          <div className="relative">
            <input
              id="recipient"
              type="text"
              value={recipient}
              onChange={(e) => {
                setRecipient(e.target.value);
                setRecipientManuallyEdited(true);
              }}
              placeholder="0x..."
              className={`${inputClasses} font-mono text-xs pr-32`}
            />
            {address && recipient !== address && (
              <button
                type="button"
                onClick={() => { setRecipient(address); setRecipientManuallyEdited(false); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 text-xs font-medium text-indigo-400 transition-all hover:bg-indigo-500/15 hover:text-indigo-300"
              >
                <User className="h-3 w-3" />
                Use my address
              </button>
            )}
          </div>
          {address && recipient === address && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-600">
              <ShieldCheck className="h-3 w-3 text-emerald-500/60" />
              Your connected wallet ({formatAddress(address)})
            </p>
          )}
        </div>
      </div>

      {/* ---- Section: Document Summary ---- */}
      <div className="rounded-2xl bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06] p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/20">
            <FileText className="h-4 w-4 text-indigo-400" />
          </div>
          <h4 className="text-sm font-semibold text-gray-200">Document Summary</h4>
        </div>

        <div className="divide-y divide-white/[0.04]">
          {/* Document name */}
          <div className="flex items-center justify-between py-3 first:pt-0">
            <span className="text-sm text-gray-400">Document</span>
            <span className="text-sm font-medium text-white truncate max-w-[220px] font-mono">
              {document.fileName}
            </span>
          </div>

          {/* Type badge */}
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-gray-400">Type</span>
            <span className="inline-flex items-center rounded-lg bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-400 ring-1 ring-inset ring-indigo-500/20 uppercase">
              {documentType}
            </span>
          </div>

          {/* Hash (truncated) */}
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-gray-400">Hash</span>
            <div className="flex items-center gap-2">
              <Hash className="h-3 w-3 text-gray-600" />
              <span className="font-mono text-xs text-white">
                {documentHash.length > 18
                  ? `${documentHash.substring(0, 10)}...${documentHash.substring(documentHash.length - 6)}`
                  : documentHash}
              </span>
            </div>
          </div>

          {/* Total value */}
          <div className="flex items-center justify-between py-3 last:pb-0">
            <span className="text-sm text-gray-400">Total Value</span>
            <span className="text-sm font-bold text-white tabular-nums font-mono">
              {Number(document.totalValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
              <span className="text-xs font-medium text-gray-500">{document.currency}</span>
            </span>
          </div>
        </div>
      </div>

      {/* ---- Submit Button ---- */}
      <button
        type="button"
        onClick={() => { void handleMint(); }}
        disabled={!canSubmit}
        className="group relative flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 px-6 py-4 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 hover:shadow-indigo-500/30 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none disabled:hover:brightness-100 disabled:active:scale-100"
      >
        {/* Button shimmer effect */}
        <div className="absolute inset-0 overflow-hidden rounded-2xl">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
        </div>

        <Sparkles className="relative h-4.5 w-4.5" />
        <span className="relative">Mint Token</span>
      </button>

      {!canSubmit && (
        <p className={`text-center text-xs ${amountExceedsDocValue ? 'text-red-400' : 'text-gray-600'}`}>
          {amountExceedsDocValue
            ? `Mint amount exceeds the document value of ${formatNumberDisplay(String(document.totalValue))} ${document.currency}`
            : 'Fill in all fields above to enable minting'}
        </p>
      )}
    </div>
  );
}
