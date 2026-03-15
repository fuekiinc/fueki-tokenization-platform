/**
 * React hook for ERC-1404 security token contract interactions.
 *
 * Wraps all read and write operations for the SecurityToken contract
 * (RestrictedLockupToken + Dividends + RestrictedSwap + EasyAccessControl).
 *
 * Key design decisions:
 *   - State is managed exclusively in useSecurityTokenStore; this hook
 *     is stateless and only dispatches side effects.
 *   - All write methods follow the gas-estimation pattern from ContractService:
 *     estimate gas first (dry-run), add a 20% buffer, then submit.
 *   - Transaction lifecycle is surfaced via txToast (pending -> success/error).
 *   - Every method is wrapped in useCallback for referential stability.
 *   - Errors are parsed through parseContractError for user-friendly messages.
 */

import { useCallback, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import logger from '../lib/logger';
import { getProvider, useWalletStore } from '../store/walletStore';
import { useSecurityTokenStore } from '../store/securityTokenStore';
import { ALL_ROLES, SecurityTokenABI } from '../contracts/abis/SecurityToken';
import { parseContractError } from '../lib/blockchain/contracts';
import type { SecurityTokenDetails } from '../lib/blockchain/contracts';
import { ContractService } from '../lib/blockchain/contracts';
import { multicallSameTarget } from '../lib/blockchain/multicall';
import {
  findHealthyEndpoint,
} from '../lib/rpc/endpoints';
import {
  getCached,
  invalidateCacheForAsset,
  makeChainCacheKey,
  setCache,
  TTL_BALANCE,
  TTL_METADATA,
} from '../lib/blockchain/rpcCache';
import {
  sendTransactionWithRetry,
  waitForTransactionReceipt,
} from '../lib/blockchain/txExecution';
import { txToast } from '../lib/utils/txToast';

// ---------------------------------------------------------------------------
// Scoped logger
// ---------------------------------------------------------------------------

const log = logger.child('useSecurityToken');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Balance breakdown for a security token holder. */
export interface SecurityTokenBalances {
  /** tokensBalanceOf -- total tokens (locked + unlocked). */
  tokens: bigint;
  /** unlockedBalanceOf -- freely transferable tokens. */
  unlocked: bigint;
  /** lockedAmountOf -- tokens held in lockups. */
  locked: bigint;
  /** balanceOf -- standard ERC-20 balance. */
  balance: bigint;
}

/** On-chain release schedule definition. */
export interface ReleaseSchedule {
  releaseCount: bigint;
  delayUntilFirstReleaseInSeconds: bigint;
  initialReleasePortionInBips: bigint;
  periodBetweenReleasesInSeconds: bigint;
}

/** On-chain timelock entry for a holder. */
export interface TimelockEntry {
  scheduleId: bigint;
  commencementTimestamp: bigint;
  tokensTransferred: bigint;
  totalAmount: bigint;
  cancelableBy: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a read-only ethers Contract instance for a security token.
 * Uses the provider from the wallet store; throws if unavailable.
 */
function getReadContract(tokenAddress: string): ethers.Contract {
  const provider = getProvider();
  if (!provider) {
    throw new Error('Wallet not connected. Please connect your wallet first.');
  }
  return new ethers.Contract(tokenAddress, SecurityTokenABI, provider);
}

/**
 * Build a signer-connected ethers Contract instance for write operations.
 */
async function getWriteContract(tokenAddress: string): Promise<{
  contract: ethers.Contract;
  signer: ethers.Signer;
}> {
  const provider = getProvider();
  if (!provider) {
    throw new Error('Wallet not connected. Please connect your wallet first.');
  }
  const signer = await provider.getSigner();
  const contract = new ethers.Contract(tokenAddress, SecurityTokenABI, signer);
  return { contract, signer };
}

/**
 * Execute a write transaction with upfront gas estimation.
 *
 * Gas estimation serves as a dry-run: if the transaction would revert,
 * the estimateGas call fails first with a descriptive Solidity error.
 * A 20% buffer is added on top of the estimate.
 */
async function executeWrite(
  contract: ethers.Contract,
  method: string,
  args: unknown[],
  overrides?: ethers.Overrides,
): Promise<ethers.ContractTransactionResponse> {
  const methodFn = contract.getFunction(method);
  if (!methodFn) {
    throw new Error(`Contract method unavailable: ${method}`);
  }

  // Pre-estimate gas via a healthy read RPC to avoid depending on the
  // wallet's potentially broken/rate-limited thirdweb RPC.
  const mergedOverrides: ethers.Overrides = { ...(overrides ?? {}) };
  const chainId = useWalletStore.getState().wallet.chainId;

  if (mergedOverrides.gasLimit == null && chainId) {
    try {
      const healthyRpc = await findHealthyEndpoint(chainId, 3000);
      if (healthyRpc) {
        const signer = contract.runner as ethers.Signer | null;
        const signerAddress = signer ? await signer.getAddress() : undefined;
        const populated = await methodFn.populateTransaction(...args, overrides ?? {});
        const readProvider = new ethers.JsonRpcProvider(healthyRpc, chainId);
        try {
          const gasEst = await readProvider.estimateGas({
            from: signerAddress,
            to: typeof populated.to === 'string' ? populated.to : undefined,
            data: populated.data,
            value: populated.value,
          });
          mergedOverrides.gasLimit = (gasEst * 125n) / 100n;
        } finally {
          readProvider.destroy();
        }
      }
    } catch {
      // Non-fatal — wallet will estimate gas itself.
    }
  }

  // Pre-populate EIP-1559 fee data from our own healthy RPC endpoints
  // instead of relying on the wallet's potentially stale thirdweb proxy.
  // 50% buffer prevents "maxFeePerGas less than block base fee" on L2s.
  const populateFeeOverrides = async () => {
    if (mergedOverrides.gasPrice != null || !chainId) return;
    try {
      const healthyRpc = await findHealthyEndpoint(chainId, 3000);
      if (healthyRpc) {
        const readProvider = new ethers.JsonRpcProvider(healthyRpc, chainId);
        try {
          const feeData = await readProvider.getFeeData();
          if (feeData.maxFeePerGas != null) {
            mergedOverrides.maxFeePerGas =
              (feeData.maxFeePerGas * 150n) / 100n;
            mergedOverrides.maxPriorityFeePerGas =
              feeData.maxPriorityFeePerGas ?? 1_500_000_000n;
          }
        } finally {
          readProvider.destroy();
        }
      }
    } catch {
      // Non-fatal: the wallet will handle fee estimation as fallback.
    }
  };

  await populateFeeOverrides();

  // Pre-populate nonce from our healthy read RPC so ethers doesn't
  // need to call eth_getTransactionCount through the wallet's
  // potentially rate-limited thirdweb proxy.
  if (mergedOverrides.nonce == null && chainId) {
    try {
      const signer = contract.runner as ethers.Signer | null;
      const signerAddress = signer ? await signer.getAddress() : undefined;
      if (signerAddress) {
        const healthyRpc = await findHealthyEndpoint(chainId, 3000);
        if (healthyRpc) {
          const readProvider = new ethers.JsonRpcProvider(healthyRpc, chainId);
          try {
            mergedOverrides.nonce = await readProvider.getTransactionCount(
              signerAddress,
              'pending',
            );
          } finally {
            readProvider.destroy();
          }
        }
      }
    } catch {
      // Non-fatal: ethers will fetch nonce via the wallet provider.
    }
  }

  let activeContract = contract;
  return sendTransactionWithRetry(
    () =>
      activeContract.getFunction(method)(
        ...args,
        mergedOverrides,
      ) as Promise<ethers.ContractTransactionResponse>,
    {
      label: `useSecurityToken.${method}`,
      onRetry: async (_attempt, error) => {
        // Re-fetch fee data on base-fee errors so the retry uses fresh pricing.
        const errMsg = error instanceof Error ? error.message : String(error);
        if (/max fee per gas less than block base fee/i.test(errMsg)) {
          await populateFeeOverrides();
        }

        // Re-fetch nonce for the retry attempt.
        if (chainId) {
          try {
            const signer = activeContract.runner as ethers.Signer | null;
            const addr = signer ? await signer.getAddress() : undefined;
            if (addr) {
              const healthyRpc = await findHealthyEndpoint(chainId, 3000);
              if (healthyRpc) {
                const rp = new ethers.JsonRpcProvider(healthyRpc, chainId);
                try {
                  mergedOverrides.nonce = await rp.getTransactionCount(addr, 'pending');
                } finally {
                  rp.destroy();
                }
              }
            }
          } catch { /* non-fatal */ }
        }

        const provider = getProvider();
        if (!provider) return;
        try {
          const freshSigner = await provider.getSigner();
          activeContract = contract.connect(freshSigner) as ethers.Contract;
        } catch {
          // Keep last connected signer and continue to next retry.
        }
      },
    },
  );
}

function chainScopedKey(chainId: number | null, key: string): string {
  if (!chainId) return key;
  return makeChainCacheKey(chainId, key);
}

function invalidateTokenCache(tokenAddress: string): void {
  const activeChainId = useWalletStore.getState().wallet.chainId;
  invalidateCacheForAsset(tokenAddress, activeChainId ?? undefined);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSecurityToken() {
  const address = useWalletStore((s) => s.wallet.address);
  const chainId = useWalletStore((s) => s.wallet.chainId);
  const isConnected = useWalletStore((s) => s.wallet.isConnected);

  const store = useSecurityTokenStore;
  const isLoading = useSecurityTokenStore((s) => s.isLoading);
  const isTransacting = useSecurityTokenStore((s) => s.isTransacting);
  const error = useSecurityTokenStore((s) => s.error);
  const selectedTokenAddress = useSecurityTokenStore((s) => s.selectedTokenAddress);
  const tokenList = useSecurityTokenStore((s) => s.tokenList);
  const tokenDetails = useSecurityTokenStore((s) => s.tokenDetails);
  const userRoles = useSecurityTokenStore((s) => s.userRoles);

  const securityScopeRef = useRef<{ address: string | null; chainId: number | null }>({
    address: address?.toLowerCase() ?? null,
    chainId: chainId ?? null,
  });

  useEffect(() => {
    securityScopeRef.current = {
      address: address?.toLowerCase() ?? null,
      chainId: chainId ?? null,
    };
  }, [address, chainId]);

  // -----------------------------------------------------------------------
  // Validation helpers
  // -----------------------------------------------------------------------

  const requireConnected = useCallback(() => {
    if (!isConnected || !address) {
      throw new Error('Wallet not connected. Please connect your wallet first.');
    }
  }, [isConnected, address]);

  const validateAddress = useCallback((addr: string, label: string) => {
    if (!ethers.isAddress(addr)) {
      throw new Error(`Invalid ${label} address: ${addr}`);
    }
  }, []);

  const isStaleSecurityScope = useCallback(
    (scopedAddress: string | null, scopedChainId: number | null, tokenAddress?: string) => {
      const scope = securityScopeRef.current;
      if (scope.address !== scopedAddress || scope.chainId !== scopedChainId) {
        return true;
      }

      if (!tokenAddress) {
        return false;
      }

      const selected = store.getState().selectedTokenAddress;
      return selected !== null && selected.toLowerCase() !== tokenAddress.toLowerCase();
    },
    [store],
  );

  // -----------------------------------------------------------------------
  // READ OPERATIONS
  // -----------------------------------------------------------------------

  /**
   * Load the list of security tokens deployed by the connected wallet
   * from the SecurityTokenFactory, then fetch details for each.
   */
  const loadTokenList = useCallback(async () => {
    requireConnected();
    const provider = getProvider();
    if (!provider || !chainId) return;
    const scopedAddress = address?.toLowerCase() ?? null;
    const scopedChainId = chainId;

    store.getState().setLoading(true);
    store.getState().setError(null);

    try {
      const service = new ContractService(provider, chainId);
      const tokens = await service.getUserSecurityTokens(address!);
      if (isStaleSecurityScope(scopedAddress, scopedChainId)) return;
      store.getState().setTokenList(tokens);

      // Auto-select first token if none is selected.
      if (tokens.length > 0 && !store.getState().selectedTokenAddress) {
        store.getState().setSelectedToken(tokens[0]);
      }

      store.getState().setLoading(false);
    } catch (err: unknown) {
      if (isStaleSecurityScope(scopedAddress, scopedChainId)) return;
      const msg = parseContractError(err);
      log.error('Failed to load token list', err);
      store.getState().setError(msg);
    }
  }, [address, chainId, isStaleSecurityScope, requireConnected, store]);

  /**
   * Load full on-chain details for a security token from the factory
   * and cache them in the store.
   */
  const loadTokenDetails = useCallback(async (tokenAddress: string) => {
    validateAddress(tokenAddress, 'token');
    const provider = getProvider();
    if (!provider || !chainId) return;
    const scopedAddress = address?.toLowerCase() ?? null;
    const scopedChainId = chainId;

    const cacheKey = chainScopedKey(chainId, `sectoken:${tokenAddress}:details`);
    const cached = getCached<SecurityTokenDetails>(cacheKey);
    if (cached) {
      if (isStaleSecurityScope(scopedAddress, scopedChainId)) return cached;
      store.getState().setTokenDetails(tokenAddress, cached);
      return cached;
    }

    try {
      const service = new ContractService(provider, chainId);
      const details = await service.getSecurityTokenDetails(tokenAddress);
      if (isStaleSecurityScope(scopedAddress, scopedChainId)) return details;
      store.getState().setTokenDetails(tokenAddress, details);
      setCache(cacheKey, details, TTL_METADATA);
      return details;
    } catch (err: unknown) {
      if (isStaleSecurityScope(scopedAddress, scopedChainId)) {
        throw err;
      }
      const msg = parseContractError(err);
      log.error('Failed to load token details', err);
      toast.error(`Failed to load token details: ${msg}`);
      throw err;
    }
  }, [address, chainId, isStaleSecurityScope, validateAddress, store]);

  /**
   * Check all 4 admin roles for the connected wallet on a given token.
   */
  const loadUserRoles = useCallback(async (tokenAddress: string) => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    const provider = getProvider();
    if (!provider) return;
    const scopedAddress = address?.toLowerCase() ?? null;
    const scopedChainId = chainId ?? null;

    try {
      const results = await multicallSameTarget(
        provider,
        tokenAddress,
        SecurityTokenABI,
        ALL_ROLES.map((role) => ({
          functionName: 'hasRole',
          args: [address!, role],
        })),
      );
      if (isStaleSecurityScope(scopedAddress, scopedChainId, tokenAddress)) return;

      const roles: Record<number, boolean> = {};
      ALL_ROLES.forEach((role, index) => {
        roles[role] = results[index].success ? (results[index].data as boolean) : false;
      });

      store.getState().setUserRoles(roles);
      return roles;
    } catch (err: unknown) {
      if (isStaleSecurityScope(scopedAddress, scopedChainId, tokenAddress)) {
        throw err;
      }
      log.error('Failed to load user roles', err);
      toast.error(`Failed to check roles: ${parseContractError(err)}`);
      throw err;
    }
  }, [address, chainId, isStaleSecurityScope, requireConnected, validateAddress, store]);

  /**
   * Get the full balance breakdown for a holder on a security token.
   */
  const getBalances = useCallback(async (
    tokenAddress: string,
    userAddress: string,
  ): Promise<SecurityTokenBalances> => {
    validateAddress(tokenAddress, 'token');
    validateAddress(userAddress, 'user');
    const provider = getProvider();
    if (!provider) throw new Error('Provider not available');

    const cacheKey = chainScopedKey(chainId, `sectoken:${tokenAddress}:balances:${userAddress}`);
    const cached = getCached<SecurityTokenBalances>(cacheKey);
    if (cached) return cached;

    try {
      const results = await multicallSameTarget(
        provider,
        tokenAddress,
        SecurityTokenABI,
        [
          { functionName: 'tokensBalanceOf', args: [userAddress] },
          { functionName: 'unlockedBalanceOf', args: [userAddress] },
          { functionName: 'lockedAmountOf', args: [userAddress] },
          { functionName: 'balanceOf', args: [userAddress] },
        ],
      );

      const balances: SecurityTokenBalances = {
        tokens: results[0].success ? BigInt(results[0].data as bigint) : 0n,
        unlocked: results[1].success ? BigInt(results[1].data as bigint) : 0n,
        locked: results[2].success ? BigInt(results[2].data as bigint) : 0n,
        balance: results[3].success ? BigInt(results[3].data as bigint) : 0n,
      };

      setCache(cacheKey, balances, TTL_BALANCE);
      return balances;
    } catch (err: unknown) {
      throw new Error(`Failed to fetch balances: ${parseContractError(err)}`);
    }
  }, [chainId, validateAddress]);

  /**
   * Get the transfer group ID for an address.
   */
  const getTransferGroup = useCallback(async (
    tokenAddress: string,
    addr: string,
  ): Promise<bigint> => {
    validateAddress(tokenAddress, 'token');
    validateAddress(addr, 'address');
    const contract = getReadContract(tokenAddress);
    try {
      return await contract.getTransferGroup(addr);
    } catch (err: unknown) {
      throw new Error(`Failed to get transfer group: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  /**
   * Check if an address is frozen.
   */
  const getFrozenStatus = useCallback(async (
    tokenAddress: string,
    addr: string,
  ): Promise<boolean> => {
    validateAddress(tokenAddress, 'token');
    validateAddress(addr, 'address');
    const contract = getReadContract(tokenAddress);
    try {
      return await contract.getFrozenStatus(addr);
    } catch (err: unknown) {
      throw new Error(`Failed to get frozen status: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  /**
   * Get the maximum balance allowed for an address.
   */
  const getMaxBalance = useCallback(async (
    tokenAddress: string,
    addr: string,
  ): Promise<bigint> => {
    validateAddress(tokenAddress, 'token');
    validateAddress(addr, 'address');
    const contract = getReadContract(tokenAddress);
    try {
      return await contract.getMaxBalance(addr);
    } catch (err: unknown) {
      throw new Error(`Failed to get max balance: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  /**
   * Get the earliest allowed transfer time between two addresses.
   */
  const getAllowTransferTime = useCallback(async (
    tokenAddress: string,
    from: string,
    to: string,
  ): Promise<bigint> => {
    validateAddress(tokenAddress, 'token');
    validateAddress(from, 'from');
    validateAddress(to, 'to');
    const contract = getReadContract(tokenAddress);
    try {
      return await contract.getAllowTransferTime(from, to);
    } catch (err: unknown) {
      throw new Error(`Failed to get allow transfer time: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  /**
   * Get the earliest allowed transfer time between two groups.
   */
  const getAllowGroupTransferTime = useCallback(async (
    tokenAddress: string,
    fromGroup: bigint | number,
    toGroup: bigint | number,
  ): Promise<bigint> => {
    validateAddress(tokenAddress, 'token');
    const contract = getReadContract(tokenAddress);
    try {
      return await contract.getAllowGroupTransferTime(fromGroup, toGroup);
    } catch (err: unknown) {
      throw new Error(`Failed to get group transfer time: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  /**
   * Detect transfer restriction code for a potential transfer.
   * Returns a uint8 code; 0 = SUCCESS.
   */
  const detectTransferRestriction = useCallback(async (
    tokenAddress: string,
    from: string,
    to: string,
    value: bigint,
  ): Promise<number> => {
    validateAddress(tokenAddress, 'token');
    validateAddress(from, 'from');
    validateAddress(to, 'to');
    const contract = getReadContract(tokenAddress);
    try {
      return Number(await contract.detectTransferRestriction(from, to, value));
    } catch (err: unknown) {
      throw new Error(`Failed to detect restriction: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  /**
   * Get the human-readable message for a transfer restriction code.
   */
  const messageForTransferRestriction = useCallback(async (
    tokenAddress: string,
    code: number,
  ): Promise<string> => {
    validateAddress(tokenAddress, 'token');
    const contract = getReadContract(tokenAddress);
    try {
      return await contract.messageForTransferRestriction(code);
    } catch (err: unknown) {
      throw new Error(`Failed to get restriction message: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  // ---- Release Schedules ------------------------------------------------

  /**
   * Get a release schedule definition by index.
   */
  const getReleaseSchedule = useCallback(async (
    tokenAddress: string,
    scheduleId: bigint | number,
  ): Promise<ReleaseSchedule> => {
    validateAddress(tokenAddress, 'token');
    const contract = getReadContract(tokenAddress);
    try {
      const raw = await contract.releaseSchedules(scheduleId);
      return {
        releaseCount: BigInt(raw.releaseCount),
        delayUntilFirstReleaseInSeconds: BigInt(raw.delayUntilFirstReleaseInSeconds),
        initialReleasePortionInBips: BigInt(raw.initialReleasePortionInBips),
        periodBetweenReleasesInSeconds: BigInt(raw.periodBetweenReleasesInSeconds),
      };
    } catch (err: unknown) {
      throw new Error(`Failed to get release schedule: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  /**
   * Get the total number of release schedules.
   */
  const getScheduleCount = useCallback(async (
    tokenAddress: string,
  ): Promise<bigint> => {
    validateAddress(tokenAddress, 'token');
    const contract = getReadContract(tokenAddress);
    try {
      return await contract.scheduleCount();
    } catch (err: unknown) {
      throw new Error(`Failed to get schedule count: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  // ---- Timelocks --------------------------------------------------------

  /**
   * Get a specific timelock entry for a holder.
   */
  const getTimelockOf = useCallback(async (
    tokenAddress: string,
    who: string,
    index: bigint | number,
  ): Promise<TimelockEntry> => {
    validateAddress(tokenAddress, 'token');
    validateAddress(who, 'who');
    const contract = getReadContract(tokenAddress);
    try {
      const raw = await contract.timelockOf(who, index);
      return {
        scheduleId: BigInt(raw.scheduleId),
        commencementTimestamp: BigInt(raw.commencementTimestamp),
        tokensTransferred: BigInt(raw.tokensTransferred),
        totalAmount: BigInt(raw.totalAmount),
        cancelableBy: raw.cancelableBy as string[],
      };
    } catch (err: unknown) {
      throw new Error(`Failed to get timelock: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  /**
   * Get the number of timelocks for a holder.
   */
  const getTimelockCount = useCallback(async (
    tokenAddress: string,
    who: string,
  ): Promise<bigint> => {
    validateAddress(tokenAddress, 'token');
    validateAddress(who, 'who');
    const contract = getReadContract(tokenAddress);
    try {
      return await contract.timelockCountOf(who);
    } catch (err: unknown) {
      throw new Error(`Failed to get timelock count: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  /**
   * Get the locked amount of a specific timelock.
   */
  const getLockedAmountOfTimelock = useCallback(async (
    tokenAddress: string,
    who: string,
    timelockIndex: bigint | number,
  ): Promise<bigint> => {
    validateAddress(tokenAddress, 'token');
    validateAddress(who, 'who');
    const contract = getReadContract(tokenAddress);
    try {
      return await contract.lockedAmountOfTimelock(who, timelockIndex);
    } catch (err: unknown) {
      throw new Error(`Failed to get locked timelock amount: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  /**
   * Get the unlocked amount of a specific timelock.
   */
  const getUnlockedAmountOfTimelock = useCallback(async (
    tokenAddress: string,
    who: string,
    timelockIndex: bigint | number,
  ): Promise<bigint> => {
    validateAddress(tokenAddress, 'token');
    validateAddress(who, 'who');
    const contract = getReadContract(tokenAddress);
    try {
      return await contract.unlockedAmountOfTimelock(who, timelockIndex);
    } catch (err: unknown) {
      throw new Error(`Failed to get unlocked timelock amount: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  // ---- Swap (OTC) -------------------------------------------------------

  /**
   * Get the current swap counter.
   */
  const getSwapNumber = useCallback(async (
    tokenAddress: string,
  ): Promise<bigint> => {
    validateAddress(tokenAddress, 'token');
    const contract = getReadContract(tokenAddress);
    try {
      return await contract.swapNumber();
    } catch (err: unknown) {
      throw new Error(`Failed to get swap number: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  /**
   * Get the status of a specific swap.
   */
  const getSwapStatus = useCallback(async (
    tokenAddress: string,
    swapNum: bigint | number,
  ): Promise<number> => {
    validateAddress(tokenAddress, 'token');
    const contract = getReadContract(tokenAddress);
    try {
      return Number(await contract.swapStatus(swapNum));
    } catch (err: unknown) {
      throw new Error(`Failed to get swap status: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  // ---- Snapshots & Dividends --------------------------------------------

  /**
   * Get the current snapshot ID.
   */
  const getCurrentSnapshotId = useCallback(async (
    tokenAddress: string,
  ): Promise<bigint> => {
    validateAddress(tokenAddress, 'token');
    const contract = getReadContract(tokenAddress);
    try {
      return await contract.getCurrentSnapshotId();
    } catch (err: unknown) {
      throw new Error(`Failed to get snapshot ID: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  /**
   * Get the total funds deposited for a dividend at a snapshot.
   */
  const getFundsAt = useCallback(async (
    tokenAddress: string,
    paymentToken: string,
    snapshotId: bigint | number,
  ): Promise<bigint> => {
    validateAddress(tokenAddress, 'token');
    validateAddress(paymentToken, 'paymentToken');
    const contract = getReadContract(tokenAddress);
    try {
      return await contract.fundsAt(paymentToken, snapshotId);
    } catch (err: unknown) {
      throw new Error(`Failed to get funds at snapshot: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  /**
   * Get the total token supply recorded at a snapshot for dividend calculations.
   */
  const getTokensAt = useCallback(async (
    tokenAddress: string,
    paymentToken: string,
    snapshotId: bigint | number,
  ): Promise<bigint> => {
    validateAddress(tokenAddress, 'token');
    validateAddress(paymentToken, 'paymentToken');
    const contract = getReadContract(tokenAddress);
    try {
      return await contract.tokensAt(paymentToken, snapshotId);
    } catch (err: unknown) {
      throw new Error(`Failed to get tokens at snapshot: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  /**
   * Get the total dividend amount awarded to a receiver at a snapshot.
   */
  const getTotalAwardedBalanceAt = useCallback(async (
    tokenAddress: string,
    paymentToken: string,
    receiver: string,
    snapshotId: bigint | number,
  ): Promise<bigint> => {
    validateAddress(tokenAddress, 'token');
    validateAddress(paymentToken, 'paymentToken');
    validateAddress(receiver, 'receiver');
    const contract = getReadContract(tokenAddress);
    try {
      return await contract.totalAwardedBalanceAt(paymentToken, receiver, snapshotId);
    } catch (err: unknown) {
      throw new Error(`Failed to get awarded balance: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  /**
   * Get the already-claimed dividend balance for a receiver at a snapshot.
   */
  const getClaimedBalanceAt = useCallback(async (
    tokenAddress: string,
    paymentToken: string,
    receiver: string,
    snapshotId: bigint | number,
  ): Promise<bigint> => {
    validateAddress(tokenAddress, 'token');
    validateAddress(paymentToken, 'paymentToken');
    validateAddress(receiver, 'receiver');
    const contract = getReadContract(tokenAddress);
    try {
      return await contract.claimedBalanceAt(paymentToken, receiver, snapshotId);
    } catch (err: unknown) {
      throw new Error(`Failed to get claimed balance: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  /**
   * Get the unclaimed dividend balance for a receiver at a snapshot.
   */
  const getUnclaimedBalanceAt = useCallback(async (
    tokenAddress: string,
    paymentToken: string,
    receiver: string,
    snapshotId: bigint | number,
  ): Promise<bigint> => {
    validateAddress(tokenAddress, 'token');
    validateAddress(paymentToken, 'paymentToken');
    validateAddress(receiver, 'receiver');
    const contract = getReadContract(tokenAddress);
    try {
      return await contract.unclaimedBalanceAt(paymentToken, receiver, snapshotId);
    } catch (err: unknown) {
      throw new Error(`Failed to get unclaimed balance: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  /**
   * Get the token balance of an account at a specific snapshot.
   */
  const getBalanceOfAt = useCallback(async (
    tokenAddress: string,
    account: string,
    snapshotId: bigint | number,
  ): Promise<bigint> => {
    validateAddress(tokenAddress, 'token');
    validateAddress(account, 'account');
    const contract = getReadContract(tokenAddress);
    try {
      return await contract.balanceOfAt(account, snapshotId);
    } catch (err: unknown) {
      throw new Error(`Failed to get balance at snapshot: ${parseContractError(err)}`);
    }
  }, [validateAddress]);

  // -----------------------------------------------------------------------
  // WRITE OPERATIONS
  // -----------------------------------------------------------------------

  // ---- Token Supply & State ---------------------------------------------

  /**
   * Mint new tokens to an address. Requires RESERVE_ADMIN role.
   */
  const mint = useCallback(async (
    tokenAddress: string,
    to: string,
    value: bigint,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    validateAddress(to, 'recipient');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'mint', [to, value]);

      txToast.pending(tx.hash, chainId!, 'Minting tokens...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Mint transaction reverted');
      }

      txToast.success(tx.hash, chainId!, 'Tokens minted successfully');
      invalidateTokenCache(tokenAddress);
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('Mint failed', err);
      txToast.error('', err, 'Mint');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  /**
   * Burn tokens from an address. Requires RESERVE_ADMIN role.
   */
  const burn = useCallback(async (
    tokenAddress: string,
    from: string,
    value: bigint,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    validateAddress(from, 'from');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'burn', [from, value]);

      txToast.pending(tx.hash, chainId!, 'Burning tokens...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Burn transaction reverted');
      }

      txToast.success(tx.hash, chainId!, 'Tokens burned successfully');
      invalidateTokenCache(tokenAddress);
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('Burn failed', err);
      txToast.error('', err, 'Burn');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  /**
   * Pause all transfers on the token. Requires CONTRACT_ADMIN role.
   */
  const pause = useCallback(async (
    tokenAddress: string,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'pause', []);

      txToast.pending(tx.hash, chainId!, 'Pausing token...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Pause transaction reverted');
      }

      txToast.success(tx.hash, chainId!, 'Token paused');
      invalidateTokenCache(tokenAddress);
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('Pause failed', err);
      txToast.error('', err, 'Pause');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  /**
   * Unpause all transfers on the token. Requires CONTRACT_ADMIN role.
   */
  const unpause = useCallback(async (
    tokenAddress: string,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'unpause', []);

      txToast.pending(tx.hash, chainId!, 'Unpausing token...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Unpause transaction reverted');
      }

      txToast.success(tx.hash, chainId!, 'Token unpaused');
      invalidateTokenCache(tokenAddress);
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('Unpause failed', err);
      txToast.error('', err, 'Unpause');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  /**
   * Freeze or unfreeze an address. Requires WALLETS_ADMIN role.
   */
  const freeze = useCallback(async (
    tokenAddress: string,
    addr: string,
    status: boolean,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    validateAddress(addr, 'address');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'freeze', [addr, status]);

      const label = status ? 'Freezing' : 'Unfreezing';
      txToast.pending(tx.hash, chainId!, `${label} address...`);
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error(`${label} transaction reverted`);
      }

      txToast.success(tx.hash, chainId!, `Address ${status ? 'frozen' : 'unfrozen'}`);
      invalidateTokenCache(tokenAddress);
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('Freeze failed', err);
      txToast.error('', err, 'Freeze');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  /**
   * Take a snapshot of all balances. Requires CONTRACT_ADMIN role.
   */
  const snapshot = useCallback(async (
    tokenAddress: string,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'snapshot', []);

      txToast.pending(tx.hash, chainId!, 'Creating snapshot...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Snapshot transaction reverted');
      }

      txToast.success(tx.hash, chainId!, 'Snapshot created');
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('Snapshot failed', err);
      txToast.error('', err, 'Snapshot');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  // ---- Transfer Restrictions --------------------------------------------

  /**
   * Set the transfer group for an address. Requires WALLETS_ADMIN role.
   */
  const setTransferGroup = useCallback(async (
    tokenAddress: string,
    addr: string,
    groupID: bigint | number,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    validateAddress(addr, 'address');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'setTransferGroup', [addr, groupID]);

      txToast.pending(tx.hash, chainId!, 'Setting transfer group...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Set transfer group reverted');
      }

      txToast.success(tx.hash, chainId!, 'Transfer group updated');
      invalidateTokenCache(tokenAddress);
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('setTransferGroup failed', err);
      txToast.error('', err, 'Set Transfer Group');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  /**
   * Set the maximum balance for an address. Requires WALLETS_ADMIN role.
   */
  const setMaxBalance = useCallback(async (
    tokenAddress: string,
    addr: string,
    updatedValue: bigint,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    validateAddress(addr, 'address');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'setMaxBalance', [addr, updatedValue]);

      txToast.pending(tx.hash, chainId!, 'Setting max balance...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Set max balance reverted');
      }

      txToast.success(tx.hash, chainId!, 'Max balance updated');
      invalidateTokenCache(tokenAddress);
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('setMaxBalance failed', err);
      txToast.error('', err, 'Set Max Balance');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  /**
   * Set allowed transfer time between two groups. Requires TRANSFER_ADMIN role.
   */
  const setAllowGroupTransfer = useCallback(async (
    tokenAddress: string,
    fromGroup: bigint | number,
    toGroup: bigint | number,
    lockedUntil: bigint | number,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'setAllowGroupTransfer', [
        fromGroup, toGroup, lockedUntil,
      ]);

      txToast.pending(tx.hash, chainId!, 'Setting group transfer rule...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Set group transfer reverted');
      }

      txToast.success(tx.hash, chainId!, 'Group transfer rule updated');
      invalidateTokenCache(tokenAddress);
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('setAllowGroupTransfer failed', err);
      txToast.error('', err, 'Set Group Transfer');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  /**
   * Set all address permissions in one call. Requires WALLETS_ADMIN role.
   */
  const setAddressPermissions = useCallback(async (
    tokenAddress: string,
    addr: string,
    groupID: bigint | number,
    lockedBalanceUntil: bigint | number,
    maxBal: bigint,
    frozenStatus: boolean,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    validateAddress(addr, 'address');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'setAddressPermissions', [
        addr, groupID, lockedBalanceUntil, maxBal, frozenStatus,
      ]);

      txToast.pending(tx.hash, chainId!, 'Setting address permissions...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Set address permissions reverted');
      }

      txToast.success(tx.hash, chainId!, 'Address permissions updated');
      invalidateTokenCache(tokenAddress);
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('setAddressPermissions failed', err);
      txToast.error('', err, 'Set Address Permissions');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  // ---- Release Schedules & Timelocks ------------------------------------

  /**
   * Create a new release schedule. Requires RESERVE_ADMIN role.
   */
  const createReleaseSchedule = useCallback(async (
    tokenAddress: string,
    releaseCount: bigint | number,
    delayUntilFirstReleaseInSeconds: bigint | number,
    initialReleasePortionInBips: bigint | number,
    periodBetweenReleasesInSeconds: bigint | number,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'createReleaseSchedule', [
        releaseCount,
        delayUntilFirstReleaseInSeconds,
        initialReleasePortionInBips,
        periodBetweenReleasesInSeconds,
      ]);

      txToast.pending(tx.hash, chainId!, 'Creating release schedule...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Create release schedule reverted');
      }

      txToast.success(tx.hash, chainId!, 'Release schedule created');
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('createReleaseSchedule failed', err);
      txToast.error('', err, 'Create Release Schedule');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  /**
   * Fund a release schedule (create a timelock). Requires RESERVE_ADMIN role.
   */
  const fundReleaseSchedule = useCallback(async (
    tokenAddress: string,
    to: string,
    amount: bigint,
    commencementTimestamp: bigint | number,
    scheduleId: bigint | number,
    cancelableBy: string[],
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    validateAddress(to, 'recipient');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'fundReleaseSchedule', [
        to, amount, commencementTimestamp, scheduleId, cancelableBy,
      ]);

      txToast.pending(tx.hash, chainId!, 'Funding release schedule...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Fund release schedule reverted');
      }

      txToast.success(tx.hash, chainId!, 'Release schedule funded');
      invalidateTokenCache(tokenAddress);
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('fundReleaseSchedule failed', err);
      txToast.error('', err, 'Fund Release Schedule');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  /**
   * Batch fund release schedules for multiple recipients.
   */
  const batchFundReleaseSchedule = useCallback(async (
    tokenAddress: string,
    recipients: string[],
    amounts: bigint[],
    commencementTimestamps: (bigint | number)[],
    scheduleIds: (bigint | number)[],
    cancelableBy: string[],
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'batchFundReleaseSchedule', [
        recipients, amounts, commencementTimestamps, scheduleIds, cancelableBy,
      ]);

      txToast.pending(tx.hash, chainId!, 'Batch funding release schedules...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Batch fund release schedule reverted');
      }

      txToast.success(tx.hash, chainId!, 'Batch funding complete');
      invalidateTokenCache(tokenAddress);
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('batchFundReleaseSchedule failed', err);
      txToast.error('', err, 'Batch Fund Release Schedule');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  /**
   * Cancel a timelock and reclaim tokens.
   */
  const cancelTimelock = useCallback(async (
    tokenAddress: string,
    target: string,
    timelockIndex: bigint | number,
    scheduleId: bigint | number,
    commencementTimestamp: bigint | number,
    totalAmount: bigint,
    reclaimTokenTo: string,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    validateAddress(target, 'target');
    validateAddress(reclaimTokenTo, 'reclaimTokenTo');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'cancelTimelock', [
        target, timelockIndex, scheduleId, commencementTimestamp, totalAmount, reclaimTokenTo,
      ]);

      txToast.pending(tx.hash, chainId!, 'Cancelling timelock...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Cancel timelock reverted');
      }

      txToast.success(tx.hash, chainId!, 'Timelock cancelled');
      invalidateTokenCache(tokenAddress);
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('cancelTimelock failed', err);
      txToast.error('', err, 'Cancel Timelock');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  // ---- Role Management --------------------------------------------------

  /**
   * Grant a role to an address. Requires CONTRACT_ADMIN role.
   */
  const grantRole = useCallback(async (
    tokenAddress: string,
    addr: string,
    role: number,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    validateAddress(addr, 'address');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'grantRole', [addr, role]);

      txToast.pending(tx.hash, chainId!, 'Granting role...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Grant role reverted');
      }

      txToast.success(tx.hash, chainId!, 'Role granted');
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('grantRole failed', err);
      txToast.error('', err, 'Grant Role');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  /**
   * Revoke a role from an address. Requires CONTRACT_ADMIN role.
   */
  const revokeRole = useCallback(async (
    tokenAddress: string,
    addr: string,
    role: number,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    validateAddress(addr, 'address');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'revokeRole', [addr, role]);

      txToast.pending(tx.hash, chainId!, 'Revoking role...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Revoke role reverted');
      }

      txToast.success(tx.hash, chainId!, 'Role revoked');
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('revokeRole failed', err);
      txToast.error('', err, 'Revoke Role');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  /**
   * Upgrade the transfer rules contract. Requires CONTRACT_ADMIN role.
   */
  const upgradeTransferRules = useCallback(async (
    tokenAddress: string,
    newTransferRules: string,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    validateAddress(newTransferRules, 'newTransferRules');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'upgradeTransferRules', [newTransferRules]);

      txToast.pending(tx.hash, chainId!, 'Upgrading transfer rules...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Upgrade transfer rules reverted');
      }

      txToast.success(tx.hash, chainId!, 'Transfer rules upgraded');
      invalidateTokenCache(tokenAddress);
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('upgradeTransferRules failed', err);
      txToast.error('', err, 'Upgrade Transfer Rules');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  // ---- Dividends --------------------------------------------------------

  /**
   * Fund a dividend distribution at a snapshot. Requires CONTRACT_ADMIN role.
   * The payment token must be pre-approved for the security token contract.
   */
  const fundDividend = useCallback(async (
    tokenAddress: string,
    paymentToken: string,
    amount: bigint,
    snapshotId: bigint | number,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    validateAddress(paymentToken, 'paymentToken');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'fundDividend', [
        paymentToken, amount, snapshotId,
      ]);

      txToast.pending(tx.hash, chainId!, 'Funding dividend...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Fund dividend reverted');
      }

      txToast.success(tx.hash, chainId!, 'Dividend funded');
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('fundDividend failed', err);
      txToast.error('', err, 'Fund Dividend');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  /**
   * Claim a dividend distribution for a specific snapshot.
   */
  const claimDividend = useCallback(async (
    tokenAddress: string,
    paymentToken: string,
    snapshotId: bigint | number,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    validateAddress(paymentToken, 'paymentToken');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'claimDividend', [paymentToken, snapshotId]);

      txToast.pending(tx.hash, chainId!, 'Claiming dividend...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Claim dividend reverted');
      }

      txToast.success(tx.hash, chainId!, 'Dividend claimed');
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('claimDividend failed', err);
      txToast.error('', err, 'Claim Dividend');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  /**
   * Withdraw remaining unclaimed dividend funds. Requires CONTRACT_ADMIN role.
   */
  const withdrawalRemains = useCallback(async (
    tokenAddress: string,
    paymentToken: string,
    snapshotId: bigint | number,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    validateAddress(paymentToken, 'paymentToken');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'withdrawalRemains', [paymentToken, snapshotId]);

      txToast.pending(tx.hash, chainId!, 'Withdrawing remaining funds...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Withdrawal remains reverted');
      }

      txToast.success(tx.hash, chainId!, 'Remaining funds withdrawn');
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('withdrawalRemains failed', err);
      txToast.error('', err, 'Withdraw Remains');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  // ---- RestrictedSwap (OTC) ---------------------------------------------

  /**
   * Configure a sell-side swap. The caller offers restricted tokens.
   */
  const configureSell = useCallback(async (
    tokenAddress: string,
    restrictedTokenAmount: bigint,
    quoteToken: string,
    quoteTokenSender: string,
    quoteTokenAmount: bigint,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    validateAddress(quoteToken, 'quoteToken');
    validateAddress(quoteTokenSender, 'quoteTokenSender');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'configureSell', [
        restrictedTokenAmount, quoteToken, quoteTokenSender, quoteTokenAmount,
      ]);

      txToast.pending(tx.hash, chainId!, 'Configuring sell swap...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Configure sell reverted');
      }

      txToast.success(tx.hash, chainId!, 'Sell swap configured');
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('configureSell failed', err);
      txToast.error('', err, 'Configure Sell');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  /**
   * Configure a buy-side swap. The caller offers a quote token for restricted tokens.
   */
  const configureBuy = useCallback(async (
    tokenAddress: string,
    restrictedTokenAmount: bigint,
    restrictedTokenSender: string,
    quoteToken: string,
    quoteTokenAmount: bigint,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    validateAddress(restrictedTokenSender, 'restrictedTokenSender');
    validateAddress(quoteToken, 'quoteToken');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'configureBuy', [
        restrictedTokenAmount, restrictedTokenSender, quoteToken, quoteTokenAmount,
      ]);

      txToast.pending(tx.hash, chainId!, 'Configuring buy swap...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Configure buy reverted');
      }

      txToast.success(tx.hash, chainId!, 'Buy swap configured');
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('configureBuy failed', err);
      txToast.error('', err, 'Configure Buy');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  /**
   * Complete a swap by providing the payment token.
   */
  const completeSwapWithPaymentToken = useCallback(async (
    tokenAddress: string,
    swapNum: bigint | number,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'completeSwapWithPaymentToken', [swapNum]);

      txToast.pending(tx.hash, chainId!, 'Completing swap with payment token...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Complete swap with payment token reverted');
      }

      txToast.success(tx.hash, chainId!, 'Swap completed');
      invalidateTokenCache(tokenAddress);
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('completeSwapWithPaymentToken failed', err);
      txToast.error('', err, 'Complete Swap');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  /**
   * Complete a swap by providing the restricted token.
   */
  const completeSwapWithRestrictedToken = useCallback(async (
    tokenAddress: string,
    swapNum: bigint | number,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'completeSwapWithRestrictedToken', [swapNum]);

      txToast.pending(tx.hash, chainId!, 'Completing swap with restricted token...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Complete swap with restricted token reverted');
      }

      txToast.success(tx.hash, chainId!, 'Swap completed');
      invalidateTokenCache(tokenAddress);
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('completeSwapWithRestrictedToken failed', err);
      txToast.error('', err, 'Complete Swap');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  /**
   * Cancel a configured sell swap.
   */
  const cancelSell = useCallback(async (
    tokenAddress: string,
    swapNum: bigint | number,
  ): Promise<ethers.ContractTransactionResponse> => {
    requireConnected();
    validateAddress(tokenAddress, 'token');
    store.getState().setTransacting(true);

    try {
      const { contract } = await getWriteContract(tokenAddress);
      const tx = await executeWrite(contract, 'cancelSell', [swapNum]);

      txToast.pending(tx.hash, chainId!, 'Cancelling swap...');
      const receipt = await waitForTransactionReceipt(tx, { chainId, label: 'useSecurityToken.write' });
      if (!receipt || receipt.status === 0) {
        throw new Error('Cancel sell reverted');
      }

      txToast.success(tx.hash, chainId!, 'Swap cancelled');
      store.getState().setTransacting(false);
      return tx;
    } catch (err: unknown) {
      const msg = parseContractError(err);
      log.error('cancelSell failed', err);
      txToast.error('', err, 'Cancel Swap');
      store.getState().setError(msg);
      throw err;
    }
  }, [chainId, requireConnected, validateAddress, store]);

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  return {
    // State (from store)
    isLoading,
    isTransacting,
    error,
    selectedTokenAddress,
    tokenList,
    tokenDetails,
    userRoles,

    // Store actions
    setSelectedToken: store.getState().setSelectedToken,
    reset: store.getState().reset,

    // Read operations
    loadTokenList,
    loadTokenDetails,
    loadUserRoles,
    getBalances,
    getTransferGroup,
    getFrozenStatus,
    getMaxBalance,
    getAllowTransferTime,
    getAllowGroupTransferTime,
    detectTransferRestriction,
    messageForTransferRestriction,
    getReleaseSchedule,
    getScheduleCount,
    getTimelockOf,
    getTimelockCount,
    getLockedAmountOfTimelock,
    getUnlockedAmountOfTimelock,
    getSwapNumber,
    getSwapStatus,
    getCurrentSnapshotId,
    getFundsAt,
    getTokensAt,
    getTotalAwardedBalanceAt,
    getClaimedBalanceAt,
    getUnclaimedBalanceAt,
    getBalanceOfAt,

    // Write operations
    mint,
    burn,
    pause,
    unpause,
    freeze,
    snapshot,
    setTransferGroup,
    setMaxBalance,
    setAllowGroupTransfer,
    setAddressPermissions,
    createReleaseSchedule,
    fundReleaseSchedule,
    batchFundReleaseSchedule,
    cancelTimelock,
    grantRole,
    revokeRole,
    upgradeTransferRules,
    fundDividend,
    claimDividend,
    withdrawalRemains,
    configureSell,
    configureBuy,
    completeSwapWithPaymentToken,
    completeSwapWithRestrictedToken,
    cancelSell,
  };
}
