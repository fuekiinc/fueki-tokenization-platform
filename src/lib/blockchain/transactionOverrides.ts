import { ethers } from 'ethers';

const GAS_LIMIT_BUFFER_BPS = 13_000n;
const EIP1559_MAX_FEE_BUFFER_BPS = 15_000n;
const LEGACY_GAS_PRICE_BUFFER_BPS = 12_500n;
const BPS_DENOMINATOR = 10_000n;
const DEFAULT_PRIORITY_FEE_WEI = 1_500_000_000n;

export function applyGasLimitBuffer(
  gasEstimate: bigint,
  bufferBps: bigint = GAS_LIMIT_BUFFER_BPS,
): bigint {
  return (gasEstimate * bufferBps) / BPS_DENOMINATOR;
}

export async function buildBufferedTransactionOverrides(
  provider: ethers.Provider | null | undefined,
  gasEstimate: bigint,
): Promise<ethers.Overrides> {
  const overrides: ethers.Overrides = {
    gasLimit: applyGasLimitBuffer(gasEstimate),
  };

  if (!provider) {
    return overrides;
  }

  try {
    const feeData = await provider.getFeeData();

    if (feeData.maxFeePerGas != null) {
      overrides.maxFeePerGas =
        (feeData.maxFeePerGas * EIP1559_MAX_FEE_BUFFER_BPS) / BPS_DENOMINATOR;
      overrides.maxPriorityFeePerGas =
        feeData.maxPriorityFeePerGas ?? DEFAULT_PRIORITY_FEE_WEI;
      return overrides;
    }

    if (feeData.gasPrice != null) {
      overrides.gasPrice =
        (feeData.gasPrice * LEGACY_GAS_PRICE_BUFFER_BPS) / BPS_DENOMINATOR;
    }
  } catch {
    // Fee override population is best-effort. Callers can still submit with
    // a buffered gas limit and let the wallet/provider fill the fee fields.
  }

  return overrides;
}
