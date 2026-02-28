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
  getWalletSwitchRpcUrls,
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

/**
 * Disabled by default because automatic wallet RPC reconfiguration can cause
 * wallet-session instability for some connectors. Enable explicitly only if
 * you want this behavior.
 */
const ENABLE_WALLET_RPC_RECONFIG = ['1', 'true', 'yes', 'on'].includes(
  String(import.meta.env.VITE_ENABLE_WALLET_RPC_RECONFIG ?? '')
    .trim()
    .toLowerCase(),
);

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

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const url of urls) {
    const normalized = url.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(url);
  }
  return deduped;
}

function makeProxyTxResponse(txHash: string): ethers.ContractTransactionResponse {
  return {
    hash: txHash,
    wait: () => Promise.reject(new Error('Network error: wallet RPC unavailable for confirmations')),
  } as unknown as ethers.ContractTransactionResponse;
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

  const walletSafeEndpoints = getWalletSwitchRpcUrls(chainId);
  const orderedEndpoints = getOrderedRpcEndpoints(chainId);
  const rpcUrls = dedupeUrls([
    healthyUrl,
    ...walletSafeEndpoints.filter((e) => e !== healthyUrl),
    ...orderedEndpoints.filter((e) => e !== healthyUrl),
  ]);

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

  if (ENABLE_WALLET_RPC_RECONFIG) {
    // Optional mode: attempt wallet-side RPC reconfiguration for custom chains.
    const reconfigured = await tryReconfigureWalletRpc(chainId, healthyUrl);
    if (reconfigured) {
      logger.info('[deploy] Wallet RPC reconfigured successfully');
      return null; // Wallet is now healthy — use normal deploy path
    }
    logger.warn(
      '[deploy] Wallet RPC reconfiguration was enabled but did not recover the wallet provider.',
    );
  }

  // Default path: avoid mutating wallet network configuration; use direct RPC.
  logger.info('[deploy] Using direct provider fallback for deploy pre-flight checks.');
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

async function sendDeploymentViaFallback(
  signer: ethers.Signer,
  deployTx: ethers.TransactionRequest,
  gasLimit: bigint,
  chainId: number,
  fallbackProvider: ethers.JsonRpcProvider,
): Promise<ethers.ContractTransactionResponse> {
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
    type: 2,
    maxFeePerGas: feeData.maxFeePerGas ?? feeData.gasPrice ?? undefined,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
  };

  const sendUnchecked = async () => {
    const jsonRpcSigner = signer as ethers.JsonRpcSigner;
    return jsonRpcSigner.sendUncheckedTransaction(fullTx);
  };

  try {
    const txHash = await sendUnchecked();
    logger.info(`[deploy] Transaction sent via fallback: ${txHash}`);
    return makeProxyTxResponse(txHash);
  } catch (err) {
    if (!isNetworkError(err)) {
      throw err;
    }

    const rpcUrl = fallbackProvider._getConnection?.().url ?? '';
    if (rpcUrl) {
      try {
        const reconfigured = await tryReconfigureWalletRpc(chainId, rpcUrl);
        if (reconfigured) {
          const txHash = await sendUnchecked();
          logger.info(`[deploy] Transaction sent after wallet RPC reconfiguration: ${txHash}`);
          return makeProxyTxResponse(txHash);
        }
      } catch (reconfigureErr) {
        logger.warn('[deploy] Wallet RPC reconfiguration retry failed', reconfigureErr);
      }
    }

    const chainName = getNetworkMetadata(chainId)?.name ?? `Chain ${chainId}`;
    const recommendedRpc = rpcUrl || 'a working RPC endpoint';
    throw new Error(
      `Your wallet's RPC endpoint for ${chainName} is down and could not be ` +
        `updated automatically.\n\n` +
        `To fix this, update the RPC URL in your wallet:\n` +
        `1. Open MetaMask → Settings → Networks → ${chainName}\n` +
        `2. Replace the RPC URL with:\n   ${recommendedRpc}\n` +
        `3. Save and try deploying again.`,
    );
  }
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
  if (!chainId) {
    throw new Error('No target chain selected. Please reconnect your wallet.');
  }

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
    try {
      // Normal path: wallet RPC is healthy, deploy via ContractFactory.
      const contract = await factory.deploy(...args, { gasLimit });
      const tx = contract.deploymentTransaction();
      if (!tx) throw new Error('Deployment transaction not available');
      logger.info(`[deploy] Transaction sent: ${tx.hash}`);
      return tx;
    } catch (err) {
      if (!isNetworkError(err)) {
        throw err;
      }

      logger.warn(
        '[deploy] Normal deploy path failed with network/RPC error; retrying via fallback provider',
        err,
      );

      const healthyUrl = await findHealthyEndpoint(chainId);
      if (!healthyUrl) {
        throw err;
      }

      const recoveryProvider = new ethers.JsonRpcProvider(healthyUrl, chainId);
      return sendDeploymentViaFallback(signer, deployTx, gasLimit, chainId, recoveryProvider);
    }
  }

  return sendDeploymentViaFallback(signer, deployTx, gasLimit, chainId, fallbackProvider);
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
