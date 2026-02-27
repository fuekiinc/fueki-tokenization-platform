/**
 * Core deployment logic for the Fueki Smart Contract Deployer.
 *
 * Uses ethers.js ContractFactory to deploy compiled contract templates to the
 * connected chain. Gas estimation includes a 20% safety buffer to reduce the
 * likelihood of out-of-gas failures on fluctuating networks.
 *
 * Includes:
 *   - Retry logic for transient RPC failures during gas estimation
 *   - Automatic wallet RPC failover: when MetaMask's configured endpoint is
 *     down, the deployer locates a healthy public RPC, pre-populates the
 *     transaction (nonce, gas, fees) via a direct JsonRpcProvider, and sends
 *     through MetaMask. If MetaMask still can't broadcast, a clear error with
 *     the working RPC URL is shown so the user can update their wallet.
 */

import { ethers } from 'ethers';
import type { ContractTemplate } from '../../types/contractDeployer';
import { encodeConstructorArgs } from './constructorEncoder';
import { getProvider, getSigner, useWalletStore } from '../../store/walletStore';
import { getNetworkMetadata } from '../../contracts/addresses';
import {
  findHealthyEndpoint,
  getOrderedRpcEndpoints,
} from '../rpc/endpoints';
import logger from '../logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of gas estimation attempts before falling back. */
const GAS_ESTIMATE_RETRIES = 3;

/** Delay between retries in ms. */
const RETRY_DELAY_MS = 1500;

/**
 * Generous fallback gas limit used when all estimation attempts fail.
 * 3 000 000 covers most template deployments with plenty of headroom.
 * Unused gas is refunded, so over-estimating is safe.
 */
const FALLBACK_GAS_LIMIT = 3_000_000n;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sleep helper for retry back-off. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Check whether an error looks like a network / RPC failure. */
function isNetworkError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : '';
  return /failed to fetch|network|timeout|econnrefused|enotfound|fetch failed|socket/i.test(
    msg,
  );
}

// ---------------------------------------------------------------------------
// Wallet RPC health check
// ---------------------------------------------------------------------------

/**
 * Check whether the wallet's RPC is responsive. Returns `true` if healthy.
 */
async function isWalletRpcHealthy(): Promise<boolean> {
  const provider = getProvider();
  if (!provider) return false;
  try {
    await provider.getBlockNumber();
    return true;
  } catch {
    return false;
  }
}

/**
 * Attempt to reconfigure the wallet (MetaMask) to use a different RPC URL.
 *
 * NOTE: `wallet_addEthereumChain` does NOT update the RPC for chains that are
 * already registered in MetaMask. This function is best-effort — it will work
 * when the chain was previously added via the same API call, but not for
 * built-in chains or chains the user manually configured.
 */
async function tryReconfigureWalletRpc(
  chainId: number,
  healthyUrl: string,
): Promise<boolean> {
  const browserProvider = getProvider();
  if (!browserProvider) return false;

  const metadata = getNetworkMetadata(chainId);
  if (!metadata) return false;

  const orderedEndpoints = getOrderedRpcEndpoints(chainId);
  const rpcUrls = [
    healthyUrl,
    ...orderedEndpoints.filter((e) => e !== healthyUrl),
  ];

  const params = {
    chainId: ethers.toQuantity(chainId),
    chainName: metadata.name,
    nativeCurrency: metadata.nativeCurrency,
    rpcUrls,
    ...(metadata.blockExplorer
      ? { blockExplorerUrls: [metadata.blockExplorer] }
      : {}),
  };

  try {
    await browserProvider.send('wallet_addEthereumChain', [params]);
    logger.info(`[deploy] Reconfigured wallet RPC to ${healthyUrl}`);
  } catch (err) {
    logger.warn('[deploy] wallet_addEthereumChain failed', err);
  }

  try {
    await browserProvider.send('wallet_switchEthereumChain', [
      { chainId: params.chainId },
    ]);
  } catch (err) {
    logger.warn('[deploy] wallet_switchEthereumChain failed', err);
  }

  return isWalletRpcHealthy();
}

/**
 * Exported so `gasEstimate.ts` can also run the pre-flight check.
 * Returns a direct `JsonRpcProvider` for the healthy endpoint when the wallet
 * RPC is down, or `null` when the wallet RPC is fine (i.e. use default path).
 */
export async function ensureWalletRpcHealthy(): Promise<ethers.JsonRpcProvider | null> {
  const chainId = useWalletStore.getState().wallet.chainId;
  if (!chainId) return null;

  // Quick probe: try eth_blockNumber through the wallet
  if (await isWalletRpcHealthy()) {
    return null; // Wallet RPC is fine — use normal deploy path
  }

  logger.warn(
    `[deploy] Wallet RPC is unresponsive on chain ${chainId}, searching for healthy endpoint…`,
  );

  // Probe all endpoints in parallel via direct fetch (bypasses MetaMask)
  const healthyUrl = await findHealthyEndpoint(chainId);
  if (!healthyUrl) {
    throw new Error(
      `All RPC endpoints for chain ${chainId} are currently unreachable. ` +
        'Please try again later or configure a custom RPC in your wallet settings.',
    );
  }

  logger.info(`[deploy] Found healthy RPC: ${healthyUrl}`);

  // Try to reconfigure the wallet — works for custom-added chains
  const reconfigured = await tryReconfigureWalletRpc(chainId, healthyUrl);
  if (reconfigured) {
    logger.info('[deploy] Wallet RPC reconfigured successfully');
    return null; // Wallet is now healthy — use normal deploy path
  }

  // Wallet still broken (built-in chain, can't update RPC).
  // Return a direct provider so the caller can use it for pre-flight operations.
  logger.warn(
    '[deploy] Could not reconfigure wallet RPC. Using direct provider for pre-flight.',
  );
  return new ethers.JsonRpcProvider(healthyUrl, chainId);
}

// ---------------------------------------------------------------------------
// Gas estimation
// ---------------------------------------------------------------------------

/**
 * Attempt gas estimation with retries. Returns the estimated gas units, or
 * `null` if all attempts fail (caller should use fallback).
 */
async function estimateGasWithRetry(
  provider: ethers.Provider,
  deployTx: ethers.TransactionLike,
): Promise<bigint | null> {
  for (let attempt = 1; attempt <= GAS_ESTIMATE_RETRIES; attempt++) {
    try {
      return await provider.estimateGas(deployTx);
    } catch (err) {
      logger.warn(
        `[deploy] Gas estimation attempt ${attempt}/${GAS_ESTIMATE_RETRIES} failed`,
        err,
      );
      if (attempt < GAS_ESTIMATE_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt); // linear back-off
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

/**
 * Deploy a contract template to the connected chain.
 *
 * @param template - The contract template containing ABI, bytecode, and
 *   constructor parameter definitions.
 * @param constructorValues - String-form values from the deployment wizard,
 *   keyed by parameter name.
 * @returns The deployment transaction response from ethers.js.
 * @throws {Error} If no wallet is connected or the deployment transaction fails.
 */
export async function deployTemplate(
  template: ContractTemplate,
  constructorValues: Record<string, string>,
): Promise<ethers.ContractTransactionResponse> {
  const signer = getSigner();
  if (!signer) {
    throw new Error('Wallet not connected');
  }

  const chainId = useWalletStore.getState().wallet.chainId;

  // Pre-flight: ensure the wallet's RPC is reachable. If the current endpoint
  // is down, this returns a direct JsonRpcProvider we can use for gas / nonce.
  const fallbackProvider = await ensureWalletRpcHealthy();

  const args = encodeConstructorArgs(template, constructorValues);

  const factory = new ethers.ContractFactory(
    template.abi as ethers.InterfaceAbi,
    template.bytecode,
    signer,
  );

  logger.info(`[deploy] Deploying ${template.name} with ${args.length} args`);

  // Build the deployment transaction
  const deployTx = await factory.getDeployTransaction(...args);

  // --- Estimate gas (use fallback provider if wallet RPC is dead) -----------
  const estimationProvider: ethers.Provider =
    fallbackProvider ?? (signer.provider as ethers.Provider);
  const gasEstimate = await estimateGasWithRetry(estimationProvider, {
    ...deployTx,
    from: await signer.getAddress(),
  });

  let gasLimit: bigint;
  if (gasEstimate !== null) {
    gasLimit = (gasEstimate * 120n) / 100n;
    logger.info(
      `[deploy] Gas estimate: ${gasEstimate.toString()}, limit: ${gasLimit.toString()}`,
    );
  } else {
    gasLimit = FALLBACK_GAS_LIMIT;
    logger.warn(
      `[deploy] Gas estimation failed after ${GAS_ESTIMATE_RETRIES} attempts. ` +
        `Using fallback gas limit: ${gasLimit.toString()}`,
    );
  }

  // --- Deploy (with fallback pre-population when wallet RPC is down) -------

  if (!fallbackProvider) {
    // Normal path: wallet RPC is healthy, deploy via ContractFactory
    const contract = await factory.deploy(...args, { gasLimit });
    const tx = contract.deploymentTransaction();
    if (!tx) throw new Error('Deployment transaction not available');
    logger.info(`[deploy] Transaction sent: ${tx.hash}`);
    return tx;
  }

  // Fallback path: wallet RPC is dead — pre-populate ALL tx fields so
  // MetaMask doesn't need to make any RPC calls of its own.
  logger.info('[deploy] Using fallback deploy path with pre-populated tx');

  const signerAddress = await signer.getAddress();

  const [nonce, feeData] = await Promise.all([
    fallbackProvider.getTransactionCount(signerAddress, 'pending'),
    fallbackProvider.getFeeData(),
  ]);

  const fullTx: ethers.TransactionRequest = {
    ...deployTx,
    from: signerAddress,
    nonce,
    gasLimit,
    chainId,
    type: 2, // EIP-1559
    maxFeePerGas: feeData.maxFeePerGas ?? feeData.gasPrice ?? undefined,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
  };

  try {
    const txResponse = await signer.sendTransaction(fullTx);
    logger.info(`[deploy] Transaction sent via fallback: ${txResponse.hash}`);
    return txResponse as ethers.ContractTransactionResponse;
  } catch (err) {
    // If MetaMask still can't broadcast, give actionable instructions
    if (isNetworkError(err)) {
      const rpcUrl = (fallbackProvider as ethers.JsonRpcProvider)._getConnection?.().url
        ?? 'a working RPC endpoint';
      const chainName = getNetworkMetadata(chainId ?? 0)?.name ?? `Chain ${chainId}`;

      throw new Error(
        `Your wallet's RPC endpoint for ${chainName} is down and could not be ` +
          `updated automatically.\n\n` +
          `To fix this, update the RPC URL in your wallet:\n` +
          `1. Open MetaMask → Settings → Networks → ${chainName}\n` +
          `2. Replace the RPC URL with:\n   ${rpcUrl}\n` +
          `3. Save and try deploying again.`,
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Confirmation
// ---------------------------------------------------------------------------

/**
 * Wait for a deployment transaction to be confirmed and return the resulting
 * contract address along with receipt metadata.
 *
 * When the wallet's RPC is unreliable, this uses a direct provider to poll for
 * the receipt so confirmations don't hang indefinitely.
 *
 * @param tx - The deployment transaction response returned by `deployTemplate`.
 * @returns An object containing the contract address, block number, and gas used.
 * @throws {Error} If the receipt is unavailable or does not contain a contract address.
 */
export async function waitForDeployment(
  tx: ethers.ContractTransactionResponse,
): Promise<{ contractAddress: string; blockNumber: number; gasUsed: string }> {
  logger.info(`[deploy] Waiting for confirmation of ${tx.hash}`);

  let receipt: ethers.TransactionReceipt | null = null;

  try {
    receipt = await tx.wait();
  } catch (err) {
    // If the wallet provider failed to get the receipt (dead RPC), try a
    // direct provider as fallback.
    if (isNetworkError(err)) {
      logger.warn('[deploy] Wallet RPC failed during confirmation, trying fallback');
      const chainId = useWalletStore.getState().wallet.chainId;
      if (chainId) {
        const healthyUrl = await findHealthyEndpoint(chainId);
        if (healthyUrl) {
          const directProvider = new ethers.JsonRpcProvider(healthyUrl, chainId);
          receipt = await directProvider.waitForTransaction(tx.hash, 1, 120_000);
        }
      }
    }
    if (!receipt) throw err;
  }

  if (!receipt) {
    throw new Error('Transaction receipt not available');
  }

  if (!receipt.contractAddress) {
    throw new Error(
      'Contract address not found in receipt -- deployment may have failed',
    );
  }

  logger.info(
    `[deploy] Confirmed at block ${receipt.blockNumber}, contract: ${receipt.contractAddress}`,
  );

  return {
    contractAddress: receipt.contractAddress,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
  };
}
