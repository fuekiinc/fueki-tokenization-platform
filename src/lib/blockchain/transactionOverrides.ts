import { ethers } from 'ethers';

const GAS_LIMIT_BUFFER_BPS = 13_000n;
const EIP1559_MAX_FEE_BUFFER_BPS = 15_000n;
const LEGACY_GAS_PRICE_BUFFER_BPS = 12_500n;
const BPS_DENOMINATOR = 10_000n;
const DEFAULT_PRIORITY_FEE_WEI = 1_500_000_000n;

export type FeeOverrides = Pick<
  ethers.Overrides,
  'gasPrice' | 'maxFeePerGas' | 'maxPriorityFeePerGas'
>;

function applyBuffer(value: bigint, bufferBps: bigint): bigint {
  return (value * bufferBps) / BPS_DENOMINATOR;
}

export function applyGasLimitBuffer(
  gasEstimate: bigint,
  bufferBps: bigint = GAS_LIMIT_BUFFER_BPS,
): bigint {
  return applyBuffer(gasEstimate, bufferBps);
}

export function buildBufferedFeeOverridesFromFeeData(
  feeData: Pick<ethers.FeeData, 'gasPrice' | 'maxFeePerGas' | 'maxPriorityFeePerGas'>,
  latestBaseFeePerGas: bigint | null = null,
): FeeOverrides {
  if (feeData.maxFeePerGas != null) {
    const bufferedMaxFee = applyBuffer(
      feeData.maxFeePerGas,
      EIP1559_MAX_FEE_BUFFER_BPS,
    );

    if (bufferedMaxFee <= 0n) {
      return {};
    }

    const priorityFee = feeData.maxPriorityFeePerGas ?? DEFAULT_PRIORITY_FEE_WEI;
    if (priorityFee <= 0n) {
      return {};
    }

    // Ensure maxFeePerGas always covers baseFee + priorityFee so the
    // transaction is never rejected with "max fee per gas less than block
    // base fee".  When the buffered fee is too low (e.g. the base fee
    // spiked since the provider returned fee data), raise it.
    let effectiveMaxFee = bufferedMaxFee;
    const minRequired = latestBaseFeePerGas != null
      ? latestBaseFeePerGas + priorityFee
      : priorityFee;

    if (effectiveMaxFee < minRequired) {
      effectiveMaxFee = minRequired;
    }

    return {
      maxFeePerGas: effectiveMaxFee,
      maxPriorityFeePerGas: priorityFee,
    };
  }

  if (feeData.gasPrice != null && feeData.gasPrice > 0n) {
    return {
      gasPrice: applyBuffer(feeData.gasPrice, LEGACY_GAS_PRICE_BUFFER_BPS),
    };
  }

  return {};
}

export async function buildBufferedFeeOverrides(
  provider: ethers.Provider | null | undefined,
): Promise<FeeOverrides> {
  if (!provider) {
    return {};
  }

  try {
    const [feeData, latestBlock] = await Promise.all([
      provider.getFeeData(),
      provider.getBlock('latest'),
    ]);

    return buildBufferedFeeOverridesFromFeeData(
      feeData,
      latestBlock?.baseFeePerGas ?? null,
    );
  } catch {
    return {};
  }
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
    Object.assign(overrides, await buildBufferedFeeOverrides(provider));
  } catch {
    // Fee override population is best-effort. Callers can still submit with
    // a buffered gas limit and let the wallet/provider fill the fee fields.
  }

  return overrides;
}
