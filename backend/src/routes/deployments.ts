import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import {
  createDeployment,
  deleteDeployment,
  getDeployment,
  listDeployments,
} from '../services/deployments';

const router = Router();

const createSchema = z.object({
  templateId: z.string().trim().min(1).max(100),
  templateName: z.string().trim().min(1).max(200),
  contractAddress: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Must be a valid EVM address'),
  deployerAddress: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Must be a valid EVM address'),
  chainId: z.coerce.number().int().positive(),
  txHash: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{64}$/, 'Must be a valid transaction hash'),
  constructorArgs: z.record(z.unknown()).default({}),
  abi: z.array(z.unknown()).default([]),
  blockNumber: z.coerce.number().int().nonnegative().optional(),
  gasUsed: z.string().trim().max(100).optional(),
  deployedAt: z.string().datetime().optional(),
});

const listSchema = z.object({
  chainId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// POST /api/deployments
router.post('/', authenticate, async (req, res) => {
  try {
    const parsed = createSchema.parse(req.body);
    const deployment = await createDeployment(req.userId!, parsed);

    res.status(201).json({
      success: true,
      deployment: {
        id: deployment.id,
        templateId: deployment.templateId,
        templateName: deployment.templateName,
        contractAddress: deployment.contractAddress,
        deployerAddress: deployment.deployerAddress,
        chainId: deployment.chainId,
        txHash: deployment.txHash,
        constructorArgs: deployment.constructorArgs,
        blockNumber: deployment.blockNumber,
        gasUsed: deployment.gasUsed,
        deployedAt: deployment.deployedAt.toISOString(),
        createdAt: deployment.createdAt.toISOString(),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: err.errors[0]?.message ?? 'Invalid request payload',
          code: 'VALIDATION_ERROR',
        },
      });
      return;
    }
    // Handle unique constraint violation (duplicate chainId+contractAddress)
    if (
      err instanceof Error &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      res.status(409).json({
        error: {
          message: 'This contract is already registered',
          code: 'DUPLICATE_DEPLOYMENT',
        },
      });
      return;
    }
    console.error('Deployment create error:', err);
    res.status(500).json({
      error: {
        message: 'Unable to save deployment',
        code: 'DEPLOYMENT_CREATE_FAILED',
      },
    });
  }
});

// GET /api/deployments
router.get('/', authenticate, async (req, res) => {
  try {
    const parsed = listSchema.parse(req.query);
    const { deployments, total } = await listDeployments(req.userId!, parsed);

    res.json({
      deployments: deployments.map((d) => ({
        id: d.id,
        templateId: d.templateId,
        templateName: d.templateName,
        contractAddress: d.contractAddress,
        deployerAddress: d.deployerAddress,
        chainId: d.chainId,
        txHash: d.txHash,
        constructorArgs: d.constructorArgs,
        blockNumber: d.blockNumber,
        gasUsed: d.gasUsed,
        deployedAt: d.deployedAt.toISOString(),
        createdAt: d.createdAt.toISOString(),
      })),
      total,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: err.errors[0]?.message ?? 'Invalid query parameters',
          code: 'VALIDATION_ERROR',
        },
      });
      return;
    }
    console.error('Deployment list error:', err);
    res.status(500).json({
      error: {
        message: 'Unable to fetch deployments',
        code: 'DEPLOYMENT_LIST_FAILED',
      },
    });
  }
});

// GET /api/deployments/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const id = String(req.params.id);
    const deployment = await getDeployment(req.userId!, id);

    if (!deployment) {
      res.status(404).json({
        error: { message: 'Deployment not found', code: 'NOT_FOUND' },
      });
      return;
    }

    res.json({
      deployment: {
        id: deployment.id,
        templateId: deployment.templateId,
        templateName: deployment.templateName,
        contractAddress: deployment.contractAddress,
        deployerAddress: deployment.deployerAddress,
        chainId: deployment.chainId,
        txHash: deployment.txHash,
        constructorArgs: deployment.constructorArgs,
        abi: deployment.abi,
        blockNumber: deployment.blockNumber,
        gasUsed: deployment.gasUsed,
        deployedAt: deployment.deployedAt.toISOString(),
        createdAt: deployment.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('Deployment get error:', err);
    res.status(500).json({
      error: {
        message: 'Unable to fetch deployment',
        code: 'DEPLOYMENT_GET_FAILED',
      },
    });
  }
});

// DELETE /api/deployments/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const deleted = await deleteDeployment(req.userId!, String(req.params.id));

    if (!deleted) {
      res.status(404).json({
        error: { message: 'Deployment not found', code: 'NOT_FOUND' },
      });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Deployment delete error:', err);
    res.status(500).json({
      error: {
        message: 'Unable to delete deployment',
        code: 'DEPLOYMENT_DELETE_FAILED',
      },
    });
  }
});

export default router;
