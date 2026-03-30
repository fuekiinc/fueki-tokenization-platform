import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { ContractService } from '../../src/lib/blockchain/contracts';

const MODERN_SIGNATURE =
  'createSecurityToken(bytes,bytes,string,string,uint8,uint256,uint256,bytes32,string,uint256,uint256,uint256)';
const LEGACY_SIGNATURE =
  'createSecurityToken(string,string,uint8,uint256,uint256,bytes32,string,uint256,uint256,uint256)';
const MODERN_SELECTOR = ethers.id(MODERN_SIGNATURE).slice(2, 10).toLowerCase();
const LEGACY_SELECTOR = ethers.id(LEGACY_SIGNATURE).slice(2, 10).toLowerCase();

function createServiceHarness(chainId: number, selector: string) {
  const service = new ContractService({} as ethers.BrowserProvider, chainId) as ContractService & {
    withReadProvider: ReturnType<typeof vi.fn>;
    executeWrite: ReturnType<typeof vi.fn>;
    estimateGasWithFallback: ReturnType<typeof vi.fn>;
    getSecurityTokenFactoryContract: ReturnType<typeof vi.fn>;
    getSigner: ReturnType<typeof vi.fn>;
  };

  const mockContract = {
    target: '0x1111111111111111111111111111111111111111',
  } as unknown as ethers.Contract;

  service.getSigner = vi.fn().mockResolvedValue({
    getAddress: vi.fn().mockResolvedValue(
      '0x2222222222222222222222222222222222222222',
    ),
  });
  service.getSecurityTokenFactoryContract = vi.fn().mockReturnValue(mockContract);
  service.withReadProvider = vi.fn(async (callback) =>
    callback({
      getCode: vi.fn().mockResolvedValue(`0x60006000${selector}6000`),
      getFeeData: vi.fn().mockResolvedValue({ maxFeePerGas: 5n, gasPrice: 3n }),
    }),
  );
  service.executeWrite = vi.fn().mockResolvedValue({ hash: '0xabc' });
  service.estimateGasWithFallback = vi.fn().mockResolvedValue(21000n);

  return { service, mockContract };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SecurityTokenFactory compatibility routing', () => {
  it('uses the legacy createSecurityToken selector when the deployed factory bytecode is legacy', async () => {
    const { service, mockContract } = createServiceHarness(42161, LEGACY_SELECTOR);

    const tx = await service.createSecurityToken(
      '0x1234',
      '0x5678',
      'Fueki Legacy Token',
      'FLT',
      18,
      10n,
      20n,
      ethers.ZeroHash,
      'PPM',
      1n,
      1n,
      60n,
    );

    assert.equal(tx.hash, '0xabc');
    assert.equal(service.executeWrite.mock.calls.length, 1);
    assert.deepEqual(service.executeWrite.mock.calls[0], [
      mockContract,
      LEGACY_SIGNATURE,
      [
        'Fueki Legacy Token',
        'FLT',
        18,
        10n,
        20n,
        ethers.ZeroHash,
        'PPM',
        1n,
        1n,
        60n,
      ],
    ]);
  });

  it('uses the modern createSecurityToken selector for gas estimation when the deployed factory bytecode is modern', async () => {
    const { service, mockContract } = createServiceHarness(17000, MODERN_SELECTOR);

    const quote = await service.estimateCreateSecurityTokenGas(
      '0x1234',
      '0x5678',
      'Fueki Modern Token',
      'FMT',
      18,
      10n,
      20n,
      ethers.ZeroHash,
      'PPM',
      1n,
      1n,
      60n,
    );

    assert.deepEqual(service.estimateGasWithFallback.mock.calls[0], [
      mockContract,
      MODERN_SIGNATURE,
      [
        '0x1234',
        '0x5678',
        'Fueki Modern Token',
        'FMT',
        18,
        10n,
        20n,
        ethers.ZeroHash,
        'PPM',
        1n,
        1n,
        60n,
      ],
      '0x2222222222222222222222222222222222222222',
    ]);
    assert.equal(quote.gasUnits, 21000n);
    assert.equal(quote.gasPriceWei, 5n);
    assert.equal(quote.estimatedCostWei, 105000n);
  });
});
