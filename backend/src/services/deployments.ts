import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export interface CreateDeploymentInput {
  templateId: string;
  templateName: string;
  contractAddress: string;
  deployerAddress: string;
  chainId: number;
  txHash: string;
  constructorArgs: Record<string, unknown>;
  abi: unknown[];
  blockNumber?: number;
  gasUsed?: string;
  deployedAt?: string;
}

export async function createDeployment(userId: string, data: CreateDeploymentInput) {
  return prisma.deployedContract.create({
    data: {
      userId,
      templateId: data.templateId,
      templateName: data.templateName,
      contractAddress: data.contractAddress.toLowerCase(),
      deployerAddress: data.deployerAddress.toLowerCase(),
      chainId: data.chainId,
      txHash: data.txHash.toLowerCase(),
      constructorArgs: data.constructorArgs as Prisma.InputJsonValue,
      abi: data.abi as Prisma.InputJsonValue,
      blockNumber: data.blockNumber ?? null,
      gasUsed: data.gasUsed ?? null,
      deployedAt: data.deployedAt ? new Date(data.deployedAt) : new Date(),
    },
  });
}

export async function listDeployments(
  userId: string,
  options: { chainId?: number; limit?: number; offset?: number } = {},
) {
  const { chainId, limit = 50, offset = 0 } = options;
  const where = { userId, ...(chainId ? { chainId } : {}) };

  const deployments = await prisma.deployedContract.findMany({
    where,
    orderBy: { deployedAt: 'desc' },
    take: limit,
    skip: offset,
    select: {
      id: true,
      templateId: true,
      templateName: true,
      contractAddress: true,
      deployerAddress: true,
      chainId: true,
      txHash: true,
      constructorArgs: true,
      abi: true,
      blockNumber: true,
      gasUsed: true,
      deployedAt: true,
      createdAt: true,
    },
  });

  const total = await prisma.deployedContract.count({ where });

  return { deployments, total };
}

export async function getDeployment(userId: string, id: string) {
  return prisma.deployedContract.findFirst({
    where: { id, userId },
  });
}

export async function deleteDeployment(userId: string, id: string) {
  const record = await prisma.deployedContract.findFirst({
    where: { id, userId },
  });

  if (!record) return null;

  await prisma.deployedContract.delete({ where: { id } });
  return record;
}
