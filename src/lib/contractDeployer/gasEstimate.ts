/**
 * Gas estimation for the Fueki Smart Contract Deployer.
 *
 * Provides a best-effort gas cost preview before the user confirms deployment.
 * Estimation failures are non-blocking -- the function returns null so the UI
 * can gracefully hide the cost preview rather than preventing deployment.
 *
 * When the wallet's RPC is down, estimation uses a direct JsonRpcProvider
 * obtained from `ensureWalletRpcHealthy()` so the cost preview still works.
 */

import { ethers } from 'ethers';
import type { ContractTemplate, GasEstimate } from '../../types/contractDeployer';
import { encodeConstructorArgs } from './constructorEncoder';
import { getProvider, getSigner } from '../../store/walletStore';
import { ensureWalletRpcHealthy } from './deploy';
import logger from '../logger';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Estimate the gas cost for deploying a template with the given constructor
 * values.
 *
 * @param template - The contract template containing ABI, bytecode, and
 *   constructor parameter definitions.
 * @param constructorValues - String-form values from the deployment wizard,
 *   keyed by parameter name.
 * @returns A `GasEstimate` object, or `null` if estimation fails. A null
 *   return should not block deployment -- it simply means the UI cannot
 *   display a cost preview.
 */
export async function estimateDeployGas(
  template: ContractTemplate,
  constructorValues: Record<string, string>,
): Promise<GasEstimate | null> {
  try {
    const signer = getSigner();
    const walletProvider = getProvider();

    if (!signer || !walletProvider) {
      return null;
    }

    // Ensure the wallet's RPC is reachable before estimating. If it's down,
    // we get back a direct JsonRpcProvider to use instead.
    const fallbackProvider = await ensureWalletRpcHealthy();
    const provider = fallbackProvider ?? walletProvider;

    const args = encodeConstructorArgs(template, constructorValues);

    const factory = new ethers.ContractFactory(
      template.abi as ethers.InterfaceAbi,
      template.bytecode,
      signer,
    );

    // Build the deployment transaction and estimate gas
    const deployTx = await factory.getDeployTransaction(...args);
    const gasUnits = await provider.estimateGas({
      ...deployTx,
      from: await signer.getAddress(),
    });

    // Fetch current fee data for cost calculation
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
    const totalCostWei = gasUnits * gasPrice;
    const gasCostNative = ethers.formatEther(totalCostWei);

    return {
      gasUnits: gasUnits.toString(),
      gasCostNative,
      gasCostUsd: null, // No USD price oracle available in V1
    };
  } catch (err) {
    logger.warn('[gasEstimate] Failed to estimate gas', err);
    return null;
  }
}
