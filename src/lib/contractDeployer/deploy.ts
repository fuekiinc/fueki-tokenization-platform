/**
 * Core deployment logic for the Fueki Smart Contract Deployer.
 *
 * Uses ethers.js ContractFactory to deploy compiled contract templates to the
 * connected chain. Gas estimation includes a 20% safety buffer to reduce the
 * likelihood of out-of-gas failures on fluctuating networks.
 *
 * Includes retry logic for transient RPC failures during gas estimation, with
 * a fallback gas limit when estimation is unavailable.
 */

import { ethers } from 'ethers';
import type { ContractTemplate } from '../../types/contractDeployer';
import { encodeConstructorArgs } from './constructorEncoder';
import { getSigner } from '../../store/walletStore';
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

/**
 * Attempt gas estimation with retries. Returns the estimated gas units, or
 * `null` if all attempts fail (caller should use fallback).
 */
async function estimateGasWithRetry(
  signer: ethers.Signer,
  deployTx: ethers.TransactionLike,
): Promise<bigint | null> {
  for (let attempt = 1; attempt <= GAS_ESTIMATE_RETRIES; attempt++) {
    try {
      return await signer.estimateGas(deployTx);
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

  const args = encodeConstructorArgs(template, constructorValues);

  const factory = new ethers.ContractFactory(
    template.abi as ethers.InterfaceAbi,
    template.bytecode,
    signer,
  );

  logger.info(`[deploy] Deploying ${template.name} with ${args.length} args`);

  // Build the deployment transaction to estimate gas before sending
  const deployTx = await factory.getDeployTransaction(...args);
  const gasEstimate = await estimateGasWithRetry(signer, deployTx);

  let gasLimit: bigint;

  if (gasEstimate !== null) {
    // Apply 20% buffer to avoid out-of-gas on minor fluctuations
    gasLimit = (gasEstimate * 120n) / 100n;
    logger.info(`[deploy] Gas estimate: ${gasEstimate.toString()}, limit: ${gasLimit.toString()}`);
  } else {
    // All estimation attempts failed -- use a generous fallback.
    // This handles transient RPC errors (node timeouts, rate limits, etc.).
    // Unused gas is refunded so over-estimating is safe; the wallet will
    // still show the user the actual cost before they sign.
    gasLimit = FALLBACK_GAS_LIMIT;
    logger.warn(
      `[deploy] Gas estimation failed after ${GAS_ESTIMATE_RETRIES} attempts. ` +
        `Using fallback gas limit: ${gasLimit.toString()}`,
    );
  }

  const contract = await factory.deploy(...args, { gasLimit });
  const tx = contract.deploymentTransaction();

  if (!tx) {
    throw new Error('Deployment transaction not available');
  }

  logger.info(`[deploy] Transaction sent: ${tx.hash}`);
  return tx;
}

// ---------------------------------------------------------------------------
// Confirmation
// ---------------------------------------------------------------------------

/**
 * Wait for a deployment transaction to be confirmed and return the resulting
 * contract address along with receipt metadata.
 *
 * @param tx - The deployment transaction response returned by `deployTemplate`.
 * @returns An object containing the contract address, block number, and gas used.
 * @throws {Error} If the receipt is unavailable or does not contain a contract address.
 */
export async function waitForDeployment(
  tx: ethers.ContractTransactionResponse,
): Promise<{ contractAddress: string; blockNumber: number; gasUsed: string }> {
  logger.info(`[deploy] Waiting for confirmation of ${tx.hash}`);

  const receipt = await tx.wait();

  if (!receipt) {
    throw new Error('Transaction receipt not available');
  }

  if (!receipt.contractAddress) {
    throw new Error('Contract address not found in receipt -- deployment may have failed');
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
