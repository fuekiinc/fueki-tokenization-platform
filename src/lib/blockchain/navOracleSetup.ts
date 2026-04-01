import { ethers } from 'ethers';
import { NAVOracleABI } from '../../contracts/abis/NAVOracle';
import { NAV_ORACLE_BYTECODE } from '../../contracts/navOracleBytecode';
import { getProvider } from '../../store/walletStore';
import type { NavOracleRegistration } from '../../types/nav';
import { registerNavOracle, upsertNavPublisher } from '../api/nav';
import { deployPreparedContract, waitForDeployment } from '../contractDeployer/deploy';
import { parseContractError } from './contracts';
import { sendTransactionWithRetry, waitForTransactionReceipt } from './txExecution';

export const NAV_ORACLE_AUTOMATION_DEFAULTS = {
  baseCurrency: 'USD',
  minAttestationIntervalSeconds: 86_400,
  maxNavChangeBps: 5_000,
  stalenessWarningDays: 90,
  stalenessCriticalDays: 180,
} as const;

export type NavAutoSetupStatus = 'configured' | 'partial' | 'skipped';

export interface NavAutoSetupResult {
  status: NavAutoSetupStatus;
  baseCurrency: string;
  oracleAddress: string | null;
  deployTxHash: string | null;
  publisherGrantTxHash: string | null;
  message: string | null;
  registration: NavOracleRegistration | null;
}

export interface NavAutoSetupInput {
  tokenAddress: string;
  chainId: number;
  adminAddress: string;
  baseCurrency?: string;
  publisherName?: string | null;
}

export interface NavAutoSetupDependencies {
  deployPreparedContract: typeof deployPreparedContract;
  waitForDeployment: typeof waitForDeployment;
  registerNavOracle: typeof registerNavOracle;
  upsertNavPublisher: typeof upsertNavPublisher;
  getProvider: typeof getProvider;
  sendTransactionWithRetry: typeof sendTransactionWithRetry;
  waitForTransactionReceipt: typeof waitForTransactionReceipt;
  createOracleContract: (
    oracleAddress: string,
    signer: ethers.Signer,
  ) => {
    NAV_PUBLISHER_ROLE: () => Promise<string>;
    grantRole: (
      role: string,
      account: string,
    ) => Promise<ethers.ContractTransactionResponse>;
  };
}

const defaultDependencies: NavAutoSetupDependencies = {
  deployPreparedContract,
  waitForDeployment,
  registerNavOracle,
  upsertNavPublisher,
  getProvider,
  sendTransactionWithRetry,
  waitForTransactionReceipt,
  createOracleContract: (oracleAddress, signer) =>
    new ethers.Contract(
      oracleAddress,
      NAVOracleABI,
      signer,
    ) as unknown as {
      NAV_PUBLISHER_ROLE: () => Promise<string>;
      grantRole: (
        role: string,
        account: string,
      ) => Promise<ethers.ContractTransactionResponse>;
    },
};

function normalizeBaseCurrency(baseCurrency?: string): string {
  const trimmed = baseCurrency?.trim().toUpperCase();
  return trimmed || NAV_ORACLE_AUTOMATION_DEFAULTS.baseCurrency;
}

export function buildDefaultNavPublisherName(
  preferredName: string | null | undefined,
  walletAddress: string,
): string {
  const trimmed = preferredName?.trim();
  if (trimmed) {
    return trimmed;
  }

  return `Wallet ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
}

function buildPartialResult(
  status: Exclude<NavAutoSetupStatus, 'configured'>,
  baseCurrency: string,
  message: string,
  oracleAddress: string | null,
  deployTxHash: string | null,
  publisherGrantTxHash: string | null,
  registration: NavOracleRegistration | null,
): NavAutoSetupResult {
  return {
    status,
    baseCurrency,
    message,
    oracleAddress,
    deployTxHash,
    publisherGrantTxHash,
    registration,
  };
}

export async function setupNavOracleForToken(
  input: NavAutoSetupInput,
  dependencies: NavAutoSetupDependencies = defaultDependencies,
): Promise<NavAutoSetupResult> {
  const baseCurrency = normalizeBaseCurrency(input.baseCurrency);
  const publisherName = buildDefaultNavPublisherName(
    input.publisherName,
    input.adminAddress,
  );

  let oracleAddress: string | null = null;
  let deployTxHash: string | null = null;
  let publisherGrantTxHash: string | null = null;
  let registration: NavOracleRegistration | null = null;

  try {
    const deployTx = await dependencies.deployPreparedContract({
      abi: NAVOracleABI as ethers.InterfaceAbi,
      bytecode: NAV_ORACLE_BYTECODE,
      constructorArgs: [
        input.tokenAddress,
        baseCurrency,
        BigInt(NAV_ORACLE_AUTOMATION_DEFAULTS.minAttestationIntervalSeconds),
        BigInt(NAV_ORACLE_AUTOMATION_DEFAULTS.maxNavChangeBps),
        input.adminAddress,
      ],
      contractLabel: 'NAVOracle',
    });
    deployTxHash = deployTx.hash;

    const deployment = await dependencies.waitForDeployment(deployTx);
    oracleAddress = deployment.contractAddress;
  } catch (error) {
    return buildPartialResult(
      'partial',
      baseCurrency,
      `Automatic NAV setup could not deploy the oracle: ${parseContractError(error)}`,
      oracleAddress,
      deployTxHash,
      publisherGrantTxHash,
      registration,
    );
  }

  try {
    registration = await dependencies.registerNavOracle(input.tokenAddress, input.chainId, {
      oracleAddress,
      baseCurrency,
      stalenessWarningDays: NAV_ORACLE_AUTOMATION_DEFAULTS.stalenessWarningDays,
      stalenessCriticalDays: NAV_ORACLE_AUTOMATION_DEFAULTS.stalenessCriticalDays,
      minAttestationIntervalSeconds:
        NAV_ORACLE_AUTOMATION_DEFAULTS.minAttestationIntervalSeconds,
      maxNavChangeBps: NAV_ORACLE_AUTOMATION_DEFAULTS.maxNavChangeBps,
    });
  } catch (error) {
    return buildPartialResult(
      'partial',
      baseCurrency,
      `NAV oracle deployed at ${oracleAddress}, but platform registration failed: ${parseContractError(error)}`,
      oracleAddress,
      deployTxHash,
      publisherGrantTxHash,
      registration,
    );
  }

  const provider = dependencies.getProvider();
  if (!provider) {
    return buildPartialResult(
      'partial',
      baseCurrency,
      'NAV oracle deployed and registered, but the wallet disconnected before publisher authorization. Reconnect and authorize a publisher from the Valuation tab.',
      oracleAddress,
      deployTxHash,
      publisherGrantTxHash,
      registration,
    );
  }

  try {
    const signer = await provider.getSigner();
    const oracle = dependencies.createOracleContract(oracleAddress, signer);
    const publisherRole = await oracle.NAV_PUBLISHER_ROLE() as string;

    const grantTx = await dependencies.sendTransactionWithRetry(
      () => oracle.grantRole(publisherRole, input.adminAddress),
      { label: 'navOracleSetup.grantPublisherRole' },
    );
    publisherGrantTxHash = grantTx.hash;
    await dependencies.waitForTransactionReceipt(grantTx, {
      label: 'navOracleSetup.grantPublisherRole',
    });
  } catch (error) {
    return buildPartialResult(
      'partial',
      baseCurrency,
      `NAV oracle deployed and registered, but publisher authorization failed: ${parseContractError(error)}. Authorize a publisher from the Valuation tab.`,
      oracleAddress,
      deployTxHash,
      publisherGrantTxHash,
      registration,
    );
  }

  try {
    await dependencies.upsertNavPublisher(input.tokenAddress, input.chainId, {
      walletAddress: input.adminAddress,
      name: publisherName,
    });
  } catch (error) {
    return buildPartialResult(
      'partial',
      baseCurrency,
      `NAV oracle is live on-chain, but publisher metadata could not be saved: ${parseContractError(error)}.`,
      oracleAddress,
      deployTxHash,
      publisherGrantTxHash,
      registration,
    );
  }

  return {
    status: 'configured',
    baseCurrency,
    oracleAddress,
    deployTxHash,
    publisherGrantTxHash,
    message: 'NAV oracle deployed, registered, and first publisher access assigned.',
    registration,
  };
}
