import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    deployedContract: {
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/prisma', () => ({
  prisma: mocks.prisma,
}));

import {
  createDeployment,
  deleteDeployment,
  getDeployment,
  getDeploymentByAddress,
  listDeployments,
} from '../../src/services/deployments';

const USER_WALLET = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SECONDARY_WALLET = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function makeDeployment(id: string, createdAt: string) {
  return {
    id,
    templateId: 'simple-token',
    templateName: 'Fixed Token',
    contractName: 'Fixed Token',
    templateType: 'ERC20',
    contractAddress: `0x${id.padEnd(40, '0').slice(0, 40)}`,
    deployerAddress: SECONDARY_WALLET,
    walletAddress: SECONDARY_WALLET,
    chainId: 421614,
    txHash: `0x${id.padEnd(64, '1').slice(0, 64)}`,
    constructorArgs: {},
    abi: [],
    sourceCode: null,
    compilationWarnings: [],
    blockNumber: 123n,
    gasUsed: '210000',
    deployedAt: new Date(createdAt),
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
  };
}

describe('deployment service history queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.user.findUnique.mockResolvedValue({ walletAddress: USER_WALLET });
  });

  it('normalizes deployment records before persistence', async () => {
    mocks.prisma.deployedContract.create.mockResolvedValue(makeDeployment('dep-1', '2026-03-21T06:00:00.000Z'));

    await createDeployment('user-1', {
      templateId: 'simple-token',
      templateName: 'Fixed Token',
      contractName: 'Fixed Token',
      templateType: 'ERC20',
      contractAddress: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
      deployerAddress: SECONDARY_WALLET.toUpperCase(),
      walletAddress: SECONDARY_WALLET.toUpperCase(),
      chainId: 421614,
      txHash: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
      constructorArgs: { name: 'Fueki' },
      abi: [],
      sourceCode: 'contract Example {}',
      compilationWarnings: ['warning'],
      blockNumber: 123,
      gasUsed: '210000',
      deployedAt: '2026-03-21T06:00:00.000Z',
    });

    expect(mocks.prisma.deployedContract.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        deployerAddress: SECONDARY_WALLET,
        walletAddress: SECONDARY_WALLET,
        txHash: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        blockNumber: 123n,
      }),
    });
  });

  it('filters history by the requested wallet address and returns a cursor for additional pages', async () => {
    mocks.prisma.deployedContract.findMany.mockResolvedValue([
      makeDeployment('dep-3', '2026-03-21T06:00:00.000Z'),
      makeDeployment('dep-2', '2026-03-21T05:00:00.000Z'),
      makeDeployment('dep-1', '2026-03-21T04:00:00.000Z'),
    ]);
    mocks.prisma.deployedContract.count.mockResolvedValue(3);

    const result = await listDeployments('user-1', {
      chainId: 421614,
      limit: 2,
      walletAddress: SECONDARY_WALLET.toUpperCase(),
      templateType: 'ERC20',
    });

    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { walletAddress: true },
    });
    expect(mocks.prisma.deployedContract.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            OR: [
              { userId: 'user-1' },
              { walletAddress: USER_WALLET },
            ],
          },
          { walletAddress: SECONDARY_WALLET },
          { chainId: 421614 },
          { templateType: 'ERC20' },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 3,
    });
    expect(result.deployments).toHaveLength(2);
    expect(result.total).toBe(3);
    expect(result.nextCursor).toEqual(expect.any(String));
  });

  it('uses offset pagination when page is provided without a cursor', async () => {
    mocks.prisma.deployedContract.findMany.mockResolvedValue([]);
    mocks.prisma.deployedContract.count.mockResolvedValue(0);

    await listDeployments('user-1', { limit: 10, page: 3 });

    expect(mocks.prisma.deployedContract.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 11,
      }),
    );
  });

  it('falls back to user ownership plus the stored wallet address when no wallet filter is provided', async () => {
    mocks.prisma.deployedContract.findMany.mockResolvedValue([]);
    mocks.prisma.deployedContract.count.mockResolvedValue(0);

    await listDeployments('user-1', { limit: 20 });

    expect(mocks.prisma.deployedContract.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                { userId: 'user-1' },
                { walletAddress: USER_WALLET },
              ],
            },
          ],
        },
      }),
    );
  });

  it('applies wallet-scoped access checks for individual fetches, by-address lookup, and deletes', async () => {
    const record = makeDeployment('dep-7', '2026-03-21T07:00:00.000Z');
    mocks.prisma.deployedContract.findFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce(record);
    mocks.prisma.deployedContract.delete.mockResolvedValue({ id: 'dep-7' });

    await expect(getDeployment('user-1', 'dep-7', SECONDARY_WALLET)).resolves.toEqual(record);
    await expect(getDeploymentByAddress('user-1', record.contractAddress, {
      walletAddress: SECONDARY_WALLET,
      chainId: 421614,
    })).resolves.toEqual(record);
    await expect(deleteDeployment('user-1', 'dep-7', SECONDARY_WALLET)).resolves.toEqual(record);

    expect(mocks.prisma.deployedContract.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        AND: [
          { id: 'dep-7' },
          {
            AND: [
              {
                OR: [
                  { userId: 'user-1' },
                  { walletAddress: USER_WALLET },
                ],
              },
              { walletAddress: SECONDARY_WALLET },
            ],
          },
        ],
      },
    });
    expect(mocks.prisma.deployedContract.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        AND: [
          { contractAddress: record.contractAddress },
          {
            AND: [
              {
                OR: [
                  { userId: 'user-1' },
                  { walletAddress: USER_WALLET },
                ],
              },
              { walletAddress: SECONDARY_WALLET },
              { chainId: 421614 },
            ],
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(mocks.prisma.deployedContract.delete).toHaveBeenCalledWith({
      where: { id: 'dep-7' },
    });
  });
});
