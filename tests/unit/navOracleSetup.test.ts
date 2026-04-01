import { describe, expect, it, vi } from 'vitest';
import type { NavOracleRegistration } from '../../src/types/nav';
import {
  buildDefaultNavPublisherName,
  NAV_ORACLE_AUTOMATION_DEFAULTS,
  type NavAutoSetupDependencies,
  setupNavOracleForToken,
} from '../../src/lib/blockchain/navOracleSetup';

function createRegistration(oracleAddress: string): NavOracleRegistration {
  return {
    tokenAddress: '0x00000000000000000000000000000000000000aa',
    chainId: 42161,
    oracleAddress,
    baseCurrency: 'USD',
    stalenessWarningDays: NAV_ORACLE_AUTOMATION_DEFAULTS.stalenessWarningDays,
    stalenessCriticalDays: NAV_ORACLE_AUTOMATION_DEFAULTS.stalenessCriticalDays,
    minAttestationIntervalSeconds:
      NAV_ORACLE_AUTOMATION_DEFAULTS.minAttestationIntervalSeconds,
    maxNavChangeBps: NAV_ORACLE_AUTOMATION_DEFAULTS.maxNavChangeBps,
    createdAt: '2026-03-31T00:00:00.000Z',
    updatedAt: '2026-03-31T00:00:00.000Z',
  };
}

function createDependencies(overrides: Partial<NavAutoSetupDependencies> = {}) {
  const deployPreparedContract = vi.fn().mockResolvedValue({
    hash: '0xdeploy',
  });
  const waitForDeployment = vi.fn().mockResolvedValue({
    contractAddress: '0x00000000000000000000000000000000000000bb',
    blockNumber: 123,
    gasUsed: '21000',
  });
  const registerNavOracle = vi
    .fn()
    .mockResolvedValue(createRegistration('0x00000000000000000000000000000000000000bb'));
  const upsertNavPublisher = vi.fn().mockResolvedValue({
    walletAddress: '0x00000000000000000000000000000000000000cc',
  });
  const grantRole = vi.fn().mockResolvedValue({
    hash: '0xgrant',
  });
  const createOracleContract = vi.fn().mockReturnValue({
    NAV_PUBLISHER_ROLE: vi.fn().mockResolvedValue('0xpublisher-role'),
    grantRole,
  });
  const getSigner = vi.fn().mockResolvedValue({
    signer: true,
  });
  const getProvider = vi.fn().mockReturnValue({
    getSigner,
  });
  const sendTransactionWithRetry = vi.fn(
    async (send: () => Promise<unknown>) => send(),
  );
  const waitForTransactionReceipt = vi.fn().mockResolvedValue({
    hash: '0xgrant',
    status: 1,
  });

  return {
    deployPreparedContract,
    waitForDeployment,
    registerNavOracle,
    upsertNavPublisher,
    getProvider,
    sendTransactionWithRetry,
    waitForTransactionReceipt,
    createOracleContract,
    ...overrides,
  };
}

describe('navOracleSetup', () => {
  it('falls back to a wallet-based publisher label when no preferred name is provided', () => {
    expect(
      buildDefaultNavPublisherName(
        undefined,
        '0x00000000000000000000000000000000000000cc',
      ),
    ).toBe('Wallet 0x0000...00cc');
  });

  it('deploys, registers, and authorizes the first NAV publisher', async () => {
    const dependencies = createDependencies();

    const result = await setupNavOracleForToken(
      {
        tokenAddress: '0x00000000000000000000000000000000000000aa',
        chainId: 42161,
        adminAddress: '0x00000000000000000000000000000000000000cc',
        baseCurrency: 'usd',
        publisherName: 'Issuer Admin',
      },
      dependencies,
    );

    expect(result.status).toBe('configured');
    expect(result.baseCurrency).toBe('USD');
    expect(result.oracleAddress).toBe('0x00000000000000000000000000000000000000bb');
    expect(dependencies.deployPreparedContract).toHaveBeenCalledTimes(1);
    expect(dependencies.registerNavOracle).toHaveBeenCalledWith(
      '0x00000000000000000000000000000000000000aa',
      42161,
      expect.objectContaining({
        oracleAddress: '0x00000000000000000000000000000000000000bb',
        baseCurrency: 'USD',
        minAttestationIntervalSeconds:
          NAV_ORACLE_AUTOMATION_DEFAULTS.minAttestationIntervalSeconds,
        maxNavChangeBps: NAV_ORACLE_AUTOMATION_DEFAULTS.maxNavChangeBps,
      }),
    );
    expect(dependencies.sendTransactionWithRetry).toHaveBeenCalledTimes(1);
    expect(dependencies.upsertNavPublisher).toHaveBeenCalledWith(
      '0x00000000000000000000000000000000000000aa',
      42161,
      {
        walletAddress: '0x00000000000000000000000000000000000000cc',
        name: 'Issuer Admin',
      },
    );
  });

  it('surfaces a partial result when platform registration fails after deployment', async () => {
    const dependencies = createDependencies({
      registerNavOracle: vi.fn().mockRejectedValue(new Error('403 forbidden')),
    });

    const result = await setupNavOracleForToken(
      {
        tokenAddress: '0x00000000000000000000000000000000000000aa',
        chainId: 42161,
        adminAddress: '0x00000000000000000000000000000000000000cc',
      },
      dependencies,
    );

    expect(result.status).toBe('partial');
    expect(result.oracleAddress).toBe('0x00000000000000000000000000000000000000bb');
    expect(result.message).toContain('platform registration failed');
    expect(dependencies.sendTransactionWithRetry).not.toHaveBeenCalled();
  });

  it('surfaces a partial result when publisher authorization fails', async () => {
    const dependencies = createDependencies({
      sendTransactionWithRetry: vi.fn().mockRejectedValue(new Error('wallet rejected')),
    });

    const result = await setupNavOracleForToken(
      {
        tokenAddress: '0x00000000000000000000000000000000000000aa',
        chainId: 42161,
        adminAddress: '0x00000000000000000000000000000000000000cc',
      },
      dependencies,
    );

    expect(result.status).toBe('partial');
    expect(result.oracleAddress).toBe('0x00000000000000000000000000000000000000bb');
    expect(result.message).toContain('publisher authorization failed');
    expect(dependencies.upsertNavPublisher).not.toHaveBeenCalled();
  });
});
