import type { ContractTemplateType } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/httpErrors';
import {
  abiArraySchema,
  evmAddressSchema,
  supportedChainIdSchema,
  txHashSchema,
} from '../lib/validation';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  createDeployment,
  deleteDeployment,
  getDeployment,
  getDeploymentByAddress,
  listDeployments,
  toApiDeployment,
} from '../services/deployments';

const router = Router();

const templateTypeSchema = z.enum([
  'ERC20',
  'ERC721',
  'ERC1155',
  'ERC1404',
  'STAKING',
  'AUCTION',
  'ESCROW',
  'SPLITTER',
  'LOTTERY',
  'CUSTOM',
]);

const createSchema = z.object({
  templateId: z.string().trim().min(1).max(100),
  templateName: z.string().trim().min(1).max(200),
  contractName: z.string().trim().min(1).max(200).optional(),
  templateType: templateTypeSchema.default('CUSTOM'),
  contractAddress: evmAddressSchema.transform((value) => value.toLowerCase()),
  deployerAddress: evmAddressSchema.transform((value) => value.toLowerCase()).optional(),
  walletAddress: evmAddressSchema.transform((value) => value.toLowerCase()).optional(),
  chainId: supportedChainIdSchema,
  txHash: txHashSchema.transform((value) => value.toLowerCase()),
  constructorArgs: z.record(z.unknown()).nullable().optional(),
  abi: abiArraySchema.default([]),
  sourceCode: z.string().max(1_000_000).nullable().optional(),
  compilationWarnings: z.array(z.string().trim().max(2_000)).nullable().optional(),
  blockNumber: z.coerce.number().int().nonnegative().optional(),
  gasUsed: z.string().trim().max(100).nullable().optional(),
  deployedAt: z.string().datetime().optional(),
}).superRefine((value, ctx) => {
  if (!value.walletAddress && !value.deployerAddress) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'walletAddress or deployerAddress is required',
      path: ['walletAddress'],
    });
  }
}).transform((value) => {
  const walletAddress = value.walletAddress ?? value.deployerAddress!;
  return {
    ...value,
    walletAddress,
    deployerAddress: value.deployerAddress ?? walletAddress,
    contractName: value.contractName ?? value.templateName,
  };
});

const listSchema = z.object({
  chainId: supportedChainIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  page: z.coerce.number().int().min(1).default(1),
  cursor: z.string().trim().min(1).max(512).optional(),
  walletAddress: evmAddressSchema.transform((value) => value.toLowerCase()).optional(),
  deployerAddress: evmAddressSchema.transform((value) => value.toLowerCase()).optional(),
  templateType: templateTypeSchema.optional(),
});

const accessSchema = z.object({
  walletAddress: evmAddressSchema.transform((value) => value.toLowerCase()).optional(),
  deployerAddress: evmAddressSchema.transform((value) => value.toLowerCase()).optional(),
  chainId: supportedChainIdSchema.optional(),
});

const idParamSchema = z.object({
  id: z.string().trim().uuid('Deployment id must be a valid UUID'),
});

const contractAddressParamSchema = z.object({
  contractAddress: evmAddressSchema.transform((value) => value.toLowerCase()),
});

function resolveWalletFilter(
  access: { walletAddress?: string; deployerAddress?: string },
): string | undefined {
  return access.walletAddress ?? access.deployerAddress;
}

function getKnownRequestError(error: unknown): HttpError | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  ) {
    const target = Array.isArray((error as { meta?: { target?: unknown } }).meta?.target)
      ? ((error as { meta?: { target?: string[] } }).meta?.target ?? []).join(',')
      : String((error as { meta?: { target?: unknown } }).meta?.target ?? '');
    if (target.includes('txHash')) {
      return new HttpError(409, 'DUPLICATE_TX_HASH', 'A deployment for this transaction hash already exists');
    }
    return new HttpError(409, 'DUPLICATE_DEPLOYMENT', 'This contract deployment is already registered');
  }

  return null;
}

// POST /api/deployments
router.post('/', authenticate, asyncHandler(async (req, res) => {
  try {
    const parsed = createSchema.parse(req.body);
    const deployment = await createDeployment(req.userId!, {
      ...parsed,
      templateType: parsed.templateType as ContractTemplateType,
    });
    const payload = toApiDeployment(deployment);

    res.status(201).json({
      success: true,
      data: { deployment: payload },
      deployment: payload,
    });
  } catch (error) {
    const knownError = getKnownRequestError(error);
    if (knownError) {
      res.status(knownError.statusCode).json({
        success: false,
        error: {
          code: knownError.code,
          message: knownError.message,
        },
      });
      return;
    }
    throw error;
  }
}));

// GET /api/deployments
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const parsed = listSchema.parse(req.query);
  const walletAddress = resolveWalletFilter(parsed);
  const { deployments, total, nextCursor, page, limit } = await listDeployments(req.userId!, {
    chainId: parsed.chainId,
    limit: parsed.limit,
    page: parsed.page,
    cursor: parsed.cursor,
    walletAddress,
    templateType: parsed.templateType as ContractTemplateType | undefined,
  });

  res.json({
    deployments: deployments.map(toApiDeployment),
    total,
    nextCursor,
    page,
    limit,
  });
}));

// GET /api/deployments/by-address/:contractAddress
router.get('/by-address/:contractAddress', authenticate, asyncHandler(async (req, res) => {
  const { contractAddress } = contractAddressParamSchema.parse(req.params);
  const access = accessSchema.parse(req.query);
  const deployment = await getDeploymentByAddress(req.userId!, contractAddress, {
    walletAddress: resolveWalletFilter(access),
    chainId: access.chainId,
  });

  if (!deployment) {
    throw new HttpError(404, 'NOT_FOUND', 'Deployment not found');
  }

  res.json({
    deployment: toApiDeployment(deployment),
  });
}));

// GET /api/deployments/:id
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const access = accessSchema.parse(req.query);
  const deployment = await getDeployment(
    req.userId!,
    id,
    resolveWalletFilter(access),
  );

  if (!deployment) {
    throw new HttpError(404, 'NOT_FOUND', 'Deployment not found');
  }

  res.json({
    deployment: toApiDeployment(deployment),
  });
}));

// DELETE /api/deployments/:id
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const access = accessSchema.parse(req.query);
  const deleted = await deleteDeployment(
    req.userId!,
    id,
    resolveWalletFilter(access),
  );

  if (!deleted) {
    throw new HttpError(404, 'NOT_FOUND', 'Deployment not found');
  }

  res.json({ success: true });
}));

export default router;
