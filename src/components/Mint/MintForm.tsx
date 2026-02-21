import { useState, useEffect, useCallback, useMemo } from 'react';
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
  RotateCcw,
  User,
  Check,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ContractService } from '../../lib/blockchain/contracts';
import logger from '../../lib/logger';
import HelpTooltip from '../Common/HelpTooltip';
import { FormField } from '../Common/FormField';
import { useWallet } from '../../hooks/useWallet';
import { useTradeStore } from '../../store/tradeStore.ts';
import { useAssetStore } from '../../store/assetStore.ts';
import { getProvider } from '../../store/walletStore.ts';
import { formatAddress, generateId, copyToClipboard } from '../../lib/utils/helpers';
import { txSubmittedToast, txConfirmedToast, txFailedToast } from '../../lib/utils/txToast';
import { formatTokenAmount } from '../../lib/formatters';
import { getNetworkConfig, getNetworkMetadata } from '../../contracts/addresses';
import { sanitizePastedAddress, validateTokenSymbol, validatePositiveAmount } from '../../lib/utils/validation';
import { INPUT_CLASSES } from '../../lib/designTokens';
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
  return formatTokenAmount(cleaned);
}

// ---------------------------------------------------------------------------
// Shared input styles (from design system)
// ---------------------------------------------------------------------------

const inputClasses = INPUT_CLASSES.base;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MintForm({ document }: MintFormProps) {
  const { address, chainId, isConnected, connectWallet, switchNetwork } = useWallet();
  const addTrade = useTradeStore((s) => s.addTrade);
  const addAsset = useAssetStore((s) => s.addAsset);

  // ---- Form state ---------------------------------------------------------

  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [mintAmount, setMintAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [recipientManuallyEdited, setRecipientManuallyEdited] = useState(false);
  const [symbolManuallyEdited, setSymbolManuallyEdited] = useState(false);

  // ---- Double-submission guard -------------------------------------------

  const [isSubmitting, setIsSubmitting] = useState(false);

  // ---- Touched tracking for real-time validation -------------------------

  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const markTouched = useCallback((field: string) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  // ---- Address paste validation state ------------------------------------

  const [recipientPasteStatus, setRecipientPasteStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');

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

  // ---- Real-time inline field errors --------------------------------------

  const fieldErrors = useMemo(() => {
    const errors: Record<string, string | undefined> = {};

    // Token name
    if (touched.tokenName && !tokenName.trim()) {
      errors.tokenName = 'Token name is required';
    }

    // Token symbol
    if (touched.tokenSymbol) {
      const symbolErr = validateTokenSymbol(tokenSymbol);
      if (symbolErr) errors.tokenSymbol = symbolErr;
    }

    // Mint amount
    if (touched.mintAmount) {
      const sanitized = mintAmount.replace(/[,\s]/g, '');
      const amtErr = validatePositiveAmount(sanitized, 'Mint amount');
      if (amtErr) {
        errors.mintAmount = amtErr;
      } else if (
        document &&
        !isNaN(Number(sanitized)) &&
        Number(sanitized) > document.totalValue
      ) {
        errors.mintAmount = `Cannot exceed document value (${document.totalValue} ${document.currency})`;
      }
    }

    // Recipient
    if (touched.recipient) {
      if (!recipient) {
        errors.recipient = 'Recipient address is required';
      } else if (!ethers.isAddress(recipient)) {
        errors.recipient = 'Must be a valid Ethereum address (0x...)';
      } else if (recipient === ethers.ZeroAddress) {
        errors.recipient = 'Cannot be the zero address';
      }
    }

    return errors;
  }, [tokenName, tokenSymbol, mintAmount, recipient, touched, document]);

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
    if (isSubmitting) return;

    const validationError = validate();
    if (validationError) {
      // Mark all fields as touched to show inline errors
      setTouched({ tokenName: true, tokenSymbol: true, mintAmount: true, recipient: true });
      toast.error(validationError);
      return;
    }

    setIsSubmitting(true);
    const provider = getProvider();
    if (!provider || !chainId) {
      toast.error('Please connect your wallet before minting.');
      return;
    }

    const networkConfig = getNetworkConfig(chainId);
    if (!networkConfig) {
      toast.error(`This network (chain ID ${chainId}) is not supported. Please switch to a supported network.`);
      return;
    }
    if (!networkConfig.factoryAddress) {
      toast.error(`Contracts are not deployed on ${networkConfig.name}. Please switch to a supported network.`);
      return;
    }

    setTxState('pending');
    setTxHash(null);
    setTxError(null);

    let submittedMintHash: string | null = null;

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

      submittedMintHash = tx.hash;
      setTxHash(tx.hash);
      txSubmittedToast(tx.hash, chainId, 'Minting token... Waiting for confirmation');

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
      // use the tx hash as a fallback identifier so the asset record is
      // still traceable back to the transaction.
      if (!assetAddress) {
        logger.warn(
          'Could not extract token address from AssetCreated event. Using tx hash as fallback identifier.',
        );
        assetAddress = receipt.hash;
      }

      txConfirmedToast(tx.hash, 'Wrapped asset minted successfully!');
      setTxState('confirmed');

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
      let message = 'Minting transaction failed';
      if (err instanceof Error) {
        // Provide user-friendly messages for common contract errors
        if (err.message.includes('user rejected') || err.message.includes('ACTION_REJECTED')) {
          message = 'You rejected the transaction in your wallet. No tokens were minted.';
        } else if (err.message.includes('insufficient funds')) {
          message = 'Insufficient ETH to cover gas fees. Please add funds to your wallet.';
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
      if (submittedMintHash) {
        txFailedToast(submittedMintHash, message);
      } else {
        toast.error(message);
      }
    } finally {
      setIsSubmitting(false);
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
      <section aria-label="Wallet connection required" className="flex flex-col items-center justify-center py-12 sm:py-20 text-center px-4">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-white/[0.06]">
          <Wallet className="h-7 w-7 text-indigo-400" aria-hidden="true" />
        </div>
        <h3 className="text-base font-semibold text-gray-200">
          Wallet not connected
        </h3>
        <p className="mt-3 mb-8 max-w-xs text-sm text-gray-500 leading-relaxed">
          Connect your wallet to start minting tokenized assets from your uploaded documents
        </p>
        <button
          type="button"
          onClick={() => { void connectWallet(); }}
          className="group relative inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-8 py-4 min-h-[44px] text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 hover:shadow-indigo-500/30 hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070A]"
        >
          <Wallet className="h-4 w-4" aria-hidden="true" />
          Connect Wallet
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
        </button>
      </section>
    );
  }

  // ---- No document loaded -------------------------------------------------

  if (!document) {
    return (
      <section aria-label="Document required" className="flex flex-col items-center justify-center py-12 sm:py-20 text-center px-4">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-500/10 to-gray-600/10 border border-white/[0.06]">
          <FileText className="h-7 w-7 text-gray-500" aria-hidden="true" />
        </div>
        <h3 className="text-base font-semibold text-gray-200">
          No document loaded
        </h3>
        <p className="mt-3 max-w-xs text-sm text-gray-500 leading-relaxed">
          Upload and parse a document first to mint a wrapped asset backed by its contents
        </p>
      </section>
    );
  }

  // ---- Pending state (full-screen overlay within card) ---------------------

  if (txState === 'pending') {
    return (
      <section aria-label="Transaction pending" aria-live="polite" className="space-y-6">
        {/* Shimmer progress bar */}
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]" role="progressbar" aria-label="Transaction in progress">
          <div className="absolute inset-0 h-full w-full rounded-full bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent motion-reduce:hidden" style={{ animation: 'mint-shimmer 2s ease-in-out infinite' }} />
          <style>{`@keyframes mint-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>
        </div>

        <div className="flex flex-col items-center justify-center py-10 sm:py-14 text-center px-4">
          <div className="relative mb-7">
            <div className="absolute -inset-3 rounded-full bg-indigo-500/10 animate-ping motion-reduce:animate-none" aria-hidden="true" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20">
              <Loader2 className="h-7 w-7 animate-spin motion-reduce:animate-none text-indigo-400" aria-hidden="true" />
            </div>
          </div>

          <h3 className="text-lg font-semibold text-white">
            Confirm in your wallet...
          </h3>
          <p className="mt-3 max-w-sm text-sm text-gray-500 leading-relaxed">
            Your wallet will prompt you to sign the transaction. Please confirm to proceed with minting.
          </p>

          {txHash && (
            <div className="mt-8 inline-flex items-center gap-2.5 rounded-2xl bg-amber-500/[0.06] border border-amber-500/10 px-5 py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none text-amber-400" aria-hidden="true" />
              <span className="text-sm text-amber-300/90">
                Tx submitted:{' '}
                {blockExplorer ? (
                  <a
                    href={`${blockExplorer}/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono underline underline-offset-2 decoration-amber-500/30 hover:decoration-amber-400/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 rounded"
                    aria-label={`View transaction ${formatAddress(txHash)} on block explorer (opens in new tab)`}
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
      </section>
    );
  }

  // ---- Success state -------------------------------------------------------

  if (txState === 'confirmed' && txHash) {
    return (
      <section aria-label="Minting successful" className="space-y-6">
        {/* Success card */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.05] to-emerald-600/[0.02] p-6 sm:p-10 text-center" role="status" aria-live="polite">

          {/* Subtle background glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-40 w-72 bg-emerald-500/[0.06] blur-[100px] rounded-full pointer-events-none" aria-hidden="true" />

          <div className="relative">
            {/* Checkmark */}
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/20 shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" aria-hidden="true" />
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
              <div className="mt-7 inline-flex flex-wrap items-center justify-center gap-3">
                {blockExplorer ? (
                  <a
                    href={`${blockExplorer}/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/[0.06] px-5 py-2.5 min-h-[44px] text-sm font-medium text-indigo-400 transition-all hover:bg-white/[0.06] hover:border-indigo-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    aria-label={`View transaction ${formatAddress(txHash)} on block explorer (opens in new tab)`}
                  >
                    <span className="font-mono text-xs">{formatAddress(txHash)}</span>
                    <ExternalLink className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                  </a>
                ) : (
                  <span className="font-mono text-xs text-gray-500 break-all">
                    Tx: {txHash}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => { void copyToClipboard(txHash); toast.success('Copied!'); }}
                  className="flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.06] text-gray-500 transition-all hover:bg-white/[0.06] hover:text-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  aria-label="Copy transaction hash to clipboard"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mint another button */}
        <button
          type="button"
          onClick={handleReset}
          className="group flex w-full items-center justify-center gap-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-4 min-h-[44px] text-sm font-semibold text-gray-300 transition-all duration-200 hover:bg-white/[0.04] hover:border-white/[0.1] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <RotateCcw className="h-4 w-4 transition-transform group-hover:-rotate-45 motion-reduce:transition-none" aria-hidden="true" />
          Mint Another Asset
        </button>
      </section>
    );
  }

  // ---- Failed state -------------------------------------------------------

  if (txState === 'failed' && txError) {
    return (
      <section aria-label="Transaction failed" className="space-y-6">
        <div className="relative overflow-hidden rounded-2xl border border-red-500/15 bg-gradient-to-br from-red-500/[0.05] to-red-600/[0.02] p-6 sm:p-10 text-center" role="alert">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-40 w-72 bg-red-500/[0.06] blur-[100px] rounded-full pointer-events-none" aria-hidden="true" />

          <div className="relative">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-red-500/20 to-red-600/10 border border-red-500/20 shadow-lg shadow-red-500/10">
              <AlertCircle className="h-8 w-8 text-red-400" aria-hidden="true" />
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
          className="group flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-4 min-h-[44px] text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 hover:shadow-indigo-500/30 hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070A]"
        >
          <RotateCcw className="h-4 w-4 transition-transform group-hover:-rotate-45 motion-reduce:transition-none" aria-hidden="true" />
          Try Again
        </button>
      </section>
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
    <form
      className="space-y-6"
      onSubmit={(e) => { e.preventDefault(); void handleMint(); }}
      aria-label="Mint wrapped asset token"
      noValidate
    >

      {/* ---- Unsupported network banner ---- */}
      {isConnected && chainId && !networkSupported && (
        <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] p-4 sm:p-6" role="alert">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20">
              <AlertTriangle className="h-5 w-5 text-amber-400" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-300">Unsupported Network</p>
              <p className="mt-1.5 text-sm leading-relaxed text-amber-400/60">
                Contracts are not deployed on {networkName}. Switch to a supported network to mint tokens.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void switchNetwork(1)}
                  className="rounded-xl bg-indigo-500/15 border border-indigo-500/25 px-4 py-2 min-h-[44px] text-xs font-semibold text-indigo-300 transition-all hover:bg-indigo-500/25 hover:text-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  Switch to Ethereum
                </button>
                <button
                  type="button"
                  onClick={() => void switchNetwork(31337)}
                  className="rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2 min-h-[44px] text-xs font-medium text-gray-400 transition-all hover:bg-white/[0.08] hover:text-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
        <FormField
          label="Token Name"
          htmlFor="tokenName"
          error={fieldErrors.tokenName}
          required
        >
          <input
            id="tokenName"
            type="text"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            onBlur={() => markTouched('tokenName')}
            placeholder="e.g., Wrapped Invoice Q4-2024"
            className={`${inputClasses}${fieldErrors.tokenName ? ' border-red-500/50 focus:border-red-500/70 focus:ring-red-500/20' : ''}`}
            aria-invalid={!!fieldErrors.tokenName}
          />
        </FormField>

        {/* Token Symbol */}
        <FormField
          label="Token Symbol"
          htmlFor="tokenSymbol"
          error={fieldErrors.tokenSymbol}
          hint={!fieldErrors.tokenSymbol && tokenSymbol ? `${tokenSymbol.length}/11 characters` : undefined}
          required
        >
          <div className="relative">
            <input
              id="tokenSymbol"
              type="text"
              value={tokenSymbol}
              onChange={(e) => {
                setTokenSymbol(e.target.value.toUpperCase());
                setSymbolManuallyEdited(true);
              }}
              onBlur={() => markTouched('tokenSymbol')}
              placeholder="e.g., wINV24"
              maxLength={11}
              className={`${inputClasses} uppercase pr-16${fieldErrors.tokenSymbol ? ' border-red-500/50 focus:border-red-500/70 focus:ring-red-500/20' : ''}`}
              aria-invalid={!!fieldErrors.tokenSymbol}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-600 tabular-nums">
              {tokenSymbol.length}/11
            </span>
          </div>
        </FormField>
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
        <FormField
          label="Mint Amount"
          htmlFor="mintAmount"
          tooltipId="mint.mintAmount"
          tooltipFlow="mint"
          tooltipComponent="MintForm"
          error={fieldErrors.mintAmount}
          hint={
            !fieldErrors.mintAmount && mintAmount && !isNaN(Number(mintAmount.replace(/[,\s]/g, '')))
              ? `${formatNumberDisplay(mintAmount)} of ${formatNumberDisplay(String(document.totalValue))} ${document.currency} max`
              : undefined
          }
          required
        >
          <div className="relative">
            <input
              id="mintAmount"
              type="text"
              inputMode="decimal"
              value={mintAmount}
              onChange={(e) => setMintAmount(e.target.value)}
              onBlur={() => markTouched('mintAmount')}
              placeholder="0.00"
              className={`${inputClasses} pr-32${
                fieldErrors.mintAmount || amountExceedsDocValue
                  ? ' border-red-500/50 focus:border-red-500/70 focus:ring-red-500/20'
                  : ''
              }`}
              aria-invalid={!!fieldErrors.mintAmount}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {/* Max button -- fills the input with the document's total value */}
              {String(mintAmount).replace(/[,\s]/g, '') !== String(document.totalValue) && (
                <button
                  type="button"
                  onClick={() => setMintAmount(String(document.totalValue))}
                  className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 min-h-[44px] text-[10px] font-semibold uppercase tracking-wide text-indigo-400 transition-all hover:bg-indigo-500/20 hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  aria-label={`Set maximum amount: ${document.totalValue} ${document.currency}`}
                >
                  Max
                </button>
              )}
              <span className="text-xs font-medium text-gray-500">
                {document.currency}
              </span>
            </div>
          </div>
        </FormField>

        {/* Recipient */}
        <FormField
          label="Recipient Address"
          htmlFor="recipient"
          tooltipId="mint.mintAuthority"
          tooltipFlow="mint"
          tooltipComponent="MintForm"
          error={fieldErrors.recipient}
          hint={
            !fieldErrors.recipient && address && recipient === address
              ? `Your connected wallet (${formatAddress(address)})`
              : undefined
          }
          required
        >
          <div className="relative">
            <input
              id="recipient"
              type="text"
              value={recipient}
              onChange={(e) => {
                setRecipient(e.target.value);
                setRecipientManuallyEdited(true);
                setRecipientPasteStatus('idle');
              }}
              onBlur={() => markTouched('recipient')}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                const { value, valid } = sanitizePastedAddress(pasted);
                e.preventDefault();
                setRecipient(value);
                setRecipientManuallyEdited(true);
                setRecipientPasteStatus(valid ? 'valid' : 'invalid');
                markTouched('recipient');
              }}
              placeholder="0x..."
              className={`${inputClasses} font-mono text-xs pr-32${fieldErrors.recipient ? ' border-red-500/50 focus:border-red-500/70 focus:ring-red-500/20' : ''}`}
              aria-invalid={!!fieldErrors.recipient}
            />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {/* Paste validation indicator */}
              {recipientPasteStatus === 'valid' && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15" title="Valid Ethereum address">
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                </span>
              )}
              {recipientPasteStatus === 'invalid' && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/15" title="Invalid Ethereum address">
                  <X className="h-3.5 w-3.5 text-red-400" />
                </span>
              )}
              {address && recipient !== address && (
                <button
                  type="button"
                  onClick={() => { setRecipient(address); setRecipientManuallyEdited(false); setRecipientPasteStatus('idle'); }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 min-h-[44px] text-xs font-medium text-indigo-400 transition-all hover:bg-indigo-500/15 hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  aria-label={`Use connected wallet address: ${formatAddress(address)}`}
                >
                  <User className="h-3 w-3" aria-hidden="true" />
                  Use my address
                </button>
              )}
            </div>
          </div>
        </FormField>
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
            <span className="flex items-center gap-1.5 text-sm text-gray-400">
              Hash
              <HelpTooltip
                tooltipId="mint.documentHash"
                flow="mint"
                component="MintForm.DocumentSummary"
              />
            </span>
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
              {formatTokenAmount(document.totalValue, 2)}{' '}
              <span className="text-xs font-medium text-gray-500">{document.currency}</span>
            </span>
          </div>
        </div>
      </div>

      {/* ---- Submit Button ---- */}
      {(() => {
        // Determine the button label with a clear reason when disabled
        let buttonLabel = 'Mint Token';
        let buttonDisabledReason = '';
        if (isSubmitting) {
          buttonLabel = 'Submitting...';
        } else if (!tokenName.trim()) {
          buttonDisabledReason = 'Enter a token name';
        } else if (!tokenSymbol.trim()) {
          buttonDisabledReason = 'Enter a token symbol';
        } else if (!mintAmount || isNaN(parsedMintAmount) || parsedMintAmount <= 0) {
          buttonDisabledReason = 'Enter a mint amount';
        } else if (amountExceedsDocValue) {
          buttonDisabledReason = `Exceeds document value (${formatNumberDisplay(String(document.totalValue))} ${document.currency})`;
        } else if (!recipient) {
          buttonDisabledReason = 'Enter a recipient address';
        } else if (!ethers.isAddress(recipient)) {
          buttonDisabledReason = 'Invalid recipient address';
        }

        const isDisabled = !canSubmit || isSubmitting;

        return (
          <>
            <button
              type="submit"
              disabled={isDisabled}
              aria-disabled={isDisabled}
              aria-label={isDisabled ? buttonDisabledReason : 'Mint token'}
              className="group relative flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 px-6 py-4 min-h-[44px] text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 hover:shadow-indigo-500/30 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none disabled:hover:brightness-100 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070A]"
            >
              {/* Button shimmer effect */}
              <div className="absolute inset-0 overflow-hidden rounded-2xl motion-reduce:hidden" aria-hidden="true">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              </div>

              {isSubmitting ? (
                <>
                  <Loader2 className="relative h-4.5 w-4.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  <span className="relative">Submitting...</span>
                </>
              ) : (
                <>
                  <Sparkles className="relative h-4.5 w-4.5" aria-hidden="true" />
                  <span className="relative">{buttonDisabledReason || buttonLabel}</span>
                </>
              )}
            </button>

            {!canSubmit && !isSubmitting && buttonDisabledReason && (
              <p
                className={`text-center text-xs ${amountExceedsDocValue ? 'text-red-400' : 'text-gray-600'}`}
                role={amountExceedsDocValue ? 'alert' : undefined}
              >
                {buttonDisabledReason}
              </p>
            )}
          </>
        );
      })()}
    </form>
  );
}
