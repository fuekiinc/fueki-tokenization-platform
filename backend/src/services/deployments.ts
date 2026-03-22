import type { ContractTemplateType, Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export interface CreateDeploymentInput {
  templateId: string;
  templateName: string;
  contractName: string;
  templateType: ContractTemplateType;
  contractAddress: string;
  deployerAddress: string;
  walletAddress: string;
  chainId: number;
  txHash: string;
  constructorArgs?: Record<string, unknown> | null;
  abi: unknown[];
  sourceCode?: string | null;
  compilationWarnings?: string[] | null;
  blockNumber?: number;
  gasUsed?: string | null;
  deployedAt?: string;
}

interface DeploymentListOptions {
  chainId?: number;
  limit?: number;
  page?: number;
  cursor?: string;
  walletAddress?: string;
  templateType?: ContractTemplateType;
}

interface DeploymentLookupOptions {
  walletAddress?: string;
  chainId?: number;
}

interface DecodedCursor {
  createdAt: Date;
  id: string;
}

function normalizeAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(trimmed) ? trimmed : null;
}

function normalizeTxHash(value: string): string {
  return value.trim().toLowerCase();
}

async function buildAuthorizedWhere(userId: string): Promise<Prisma.DeployedContractWhereInput> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { walletAddress: true },
  });
  const normalizedUserWalletAddress = normalizeAddress(user?.walletAddress);

  if (normalizedUserWalletAddress) {
    return {
      OR: [
        { userId },
        { walletAddress: normalizedUserWalletAddress },
      ],
    };
  }

  return { userId };
}

function buildScopedWhere(
  authorizedWhere: Prisma.DeployedContractWhereInput,
  options: {
    walletAddress?: string;
    chainId?: number;
    templateType?: ContractTemplateType;
    cursor?: DecodedCursor | null;
  },
): Prisma.DeployedContractWhereInput {
  const requestedWalletAddress = normalizeAddress(options.walletAddress);

  return {
    AND: [
      authorizedWhere,
      ...(requestedWalletAddress ? [{ walletAddress: requestedWalletAddress }] : []),
      ...(options.chainId ? [{ chainId: options.chainId }] : []),
      ...(options.templateType ? [{ templateType: options.templateType }] : []),
      ...(options.cursor
        ? [{
            OR: [
              { createdAt: { lt: options.cursor.createdAt } },
              {
                AND: [
                  { createdAt: options.cursor.createdAt },
                  { id: { lt: options.cursor.id } },
                ],
              },
            ],
          }]
        : []),
    ],
  };
}

function encodeDeploymentCursor(record: { createdAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: record.createdAt.toISOString(),
      id: record.id,
    }),
    'utf8',
  ).toString('base64url');
}

function decodeDeploymentCursor(cursor: string | undefined): DecodedCursor | null {
  if (!cursor) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      createdAt?: string;
      id?: string;
    };

    if (typeof decoded.createdAt !== 'string' || typeof decoded.id !== 'string') {
      return null;
    }

    const createdAt = new Date(decoded.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }

    return { createdAt, id: decoded.id };
  } catch {
    return null;
  }
}

export function toApiDeployment(deployment: {
  id: string;
  templateId: string;
  templateName: string;
  contractName: string;
  templateType: ContractTemplateType;
  contractAddress: string;
  deployerAddress: string;
  walletAddress: string;
  chainId: number;
  txHash: string;
  constructorArgs: Prisma.JsonValue;
  abi: Prisma.JsonValue;
  sourceCode: string | null;
  compilationWarnings: string[];
  blockNumber: bigint | null;
  gasUsed: string | null;
  deployedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: deployment.id,
    templateId: deployment.templateId,
    templateName: deployment.templateName,
    contractName: deployment.contractName,
    templateType: deployment.templateType,
    contractAddress: deployment.contractAddress,
    deployerAddress: deployment.deployerAddress,
    walletAddress: deployment.walletAddress,
    chainId: deployment.chainId,
    txHash: deployment.txHash,
    constructorArgs: deployment.constructorArgs,
    abi: deployment.abi,
    sourceCode: deployment.sourceCode,
    compilationWarnings: deployment.compilationWarnings,
    blockNumber: deployment.blockNumber === null ? null : Number(deployment.blockNumber),
    gasUsed: deployment.gasUsed,
    deployedAt: deployment.deployedAt.toISOString(),
    createdAt: deployment.createdAt.toISOString(),
    updatedAt: deployment.updatedAt.toISOString(),
  };
}

export async function createDeployment(userId: string, data: CreateDeploymentInput) {
  return prisma.deployedContract.create({
    data: {
      userId,
      templateId: data.templateId,
      templateName: data.templateName,
      contractName: data.contractName,
      templateType: data.templateType,
      contractAddress: data.contractAddress.toLowerCase(),
      deployerAddress: data.deployerAddress.toLowerCase(),
      walletAddress: data.walletAddress.toLowerCase(),
      chainId: data.chainId,
      txHash: normalizeTxHash(data.txHash),
      constructorArgs: (data.constructorArgs ?? null) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
      abi: data.abi as Prisma.InputJsonValue,
      sourceCode: data.sourceCode ?? null,
      compilationWarnings: data.compilationWarnings ?? [],
      blockNumber: data.blockNumber === undefined ? null : BigInt(data.blockNumber),
      gasUsed: data.gasUsed ?? null,
      deployedAt: data.deployedAt ? new Date(data.deployedAt) : new Date(),
    },
  });
}

export async function listDeployments(
  userId: string,
  options: DeploymentListOptions = {},
) {
  const {
    chainId,
    limit = 20,
    page = 1,
    cursor,
    walletAddress,
    templateType,
  } = options;
  const authorizedWhere = await buildAuthorizedWhere(userId);
  const decodedCursor = decodeDeploymentCursor(cursor);
  const where = buildScopedWhere(authorizedWhere, {
    walletAddress,
    chainId,
    templateType,
    cursor: decodedCursor,
  });

  const take = limit + 1;
  const deployments = await prisma.deployedContract.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(decodedCursor ? { take } : { take, skip: Math.max(page - 1, 0) * limit }),
  });

  const totalWhere = buildScopedWhere(authorizedWhere, {
    walletAddress,
    chainId,
    templateType,
    cursor: null,
  });
  const total = await prisma.deployedContract.count({ where: totalWhere });
  const hasMore = deployments.length > limit;
  const pageRecords = hasMore ? deployments.slice(0, limit) : deployments;
  const nextCursor = hasMore
    ? encodeDeploymentCursor({
        createdAt: pageRecords[pageRecords.length - 1]!.createdAt,
        id: pageRecords[pageRecords.length - 1]!.id,
      })
    : null;

  return {
    deployments: pageRecords,
    total,
    nextCursor,
    page,
    limit,
  };
}

export async function getDeployment(
  userId: string,
  id: string,
  walletAddress?: string,
) {
  const authorizedWhere = await buildAuthorizedWhere(userId);
  return prisma.deployedContract.findFirst({
    where: {
      AND: [
        { id },
        buildScopedWhere(authorizedWhere, { walletAddress, cursor: null }),
      ],
    },
  });
}

export async function getDeploymentByAddress(
  userId: string,
  contractAddress: string,
  options: DeploymentLookupOptions = {},
) {
  const authorizedWhere = await buildAuthorizedWhere(userId);
  return prisma.deployedContract.findFirst({
    where: {
      AND: [
        { contractAddress: contractAddress.toLowerCase() },
        buildScopedWhere(authorizedWhere, {
          walletAddress: options.walletAddress,
          chainId: options.chainId,
          cursor: null,
        }),
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

export async function deleteDeployment(userId: string, id: string, walletAddress?: string) {
  const record = await getDeployment(userId, id, walletAddress);

  if (!record) {
    return null;
  }

  await prisma.deployedContract.delete({ where: { id } });
  return record;
}
