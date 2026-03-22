import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockReq,
  createMockRes,
  getRouteHandlers,
  invokeHandler,
} from '../helpers/routeHarness';

const mocks = vi.hoisted(() => ({
  createDeployment: vi.fn(),
  deleteDeployment: vi.fn(),
  getDeployment: vi.fn(),
  getDeploymentByAddress: vi.fn(),
  listDeployments: vi.fn(),
  toApiDeployment: vi.fn((deployment: Record<string, unknown>) => deployment),
}));

vi.mock('../../src/middleware/auth', () => ({
  authenticate: (
    req: Record<string, unknown>,
    _res: Record<string, unknown>,
    next: (err?: unknown) => void,
  ) => {
    req.userId = 'user-1';
    next();
  },
}));

vi.mock('../../src/services/deployments', () => ({
  createDeployment: mocks.createDeployment,
  deleteDeployment: mocks.deleteDeployment,
  getDeployment: mocks.getDeployment,
  getDeploymentByAddress: mocks.getDeploymentByAddress,
  listDeployments: mocks.listDeployments,
  toApiDeployment: mocks.toApiDeployment,
}));

import deploymentRoutes from '../../src/routes/deployments';

const [, createHandler] = getRouteHandlers(deploymentRoutes, 'post', '/');
const [, listHandler] = getRouteHandlers(deploymentRoutes, 'get', '/');
const [, lookupByAddressHandler] = getRouteHandlers(
  deploymentRoutes,
  'get',
  '/by-address/:contractAddress',
);

describe('deployment routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a normalized deployment record', async () => {
    mocks.createDeployment.mockResolvedValue({
      id: 'dep-1',
      templateId: 'simple-token',
      templateName: 'Fixed Token',
      contractName: 'Fixed Token',
      templateType: 'ERC20',
      contractAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      deployerAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      walletAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      chainId: 421614,
      txHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      constructorArgs: {},
      abi: [],
      sourceCode: null,
      compilationWarnings: [],
      blockNumber: 123n,
      gasUsed: '210000',
      deployedAt: new Date('2026-03-21T06:00:00.000Z'),
      createdAt: new Date('2026-03-21T06:00:00.000Z'),
      updatedAt: new Date('2026-03-21T06:00:00.000Z'),
    });

    const req = createMockReq({
      body: {
        templateId: 'simple-token',
        templateName: 'Fixed Token',
        contractAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        deployerAddress: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        chainId: 421614,
        txHash: '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
        abi: [],
      },
      userId: 'user-1',
    });
    const res = createMockRes();

    await invokeHandler(createHandler, req, res);

    expect(mocks.createDeployment).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        contractName: 'Fixed Token',
        contractAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        deployerAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        walletAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        txHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      }),
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as { deployment: { walletAddress: string } }).deployment.walletAddress).toBe(
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    );
  });

  it('returns 409 for duplicate transaction hashes', async () => {
    mocks.createDeployment.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['txHash'] },
    });

    const req = createMockReq({
      body: {
        templateId: 'simple-token',
        templateName: 'Fixed Token',
        walletAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        contractAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        chainId: 421614,
        txHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        abi: [],
      },
      userId: 'user-1',
    });
    const res = createMockRes();

    await invokeHandler(createHandler, req, res);

    expect(res.statusCode).toBe(409);
    expect((res.body as { error: { code: string } }).error.code).toBe('DUPLICATE_TX_HASH');
  });

  it('lists deployments with wallet filtering and supports lookup by contract address', async () => {
    mocks.listDeployments.mockResolvedValue({
      deployments: [
        {
          id: 'dep-1',
          templateId: 'simple-token',
          templateName: 'Fixed Token',
          contractName: 'Fixed Token',
          templateType: 'ERC20',
          contractAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          deployerAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          walletAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          chainId: 421614,
          txHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
          constructorArgs: {},
          abi: [],
          sourceCode: null,
          compilationWarnings: [],
          blockNumber: 123n,
          gasUsed: '210000',
          deployedAt: new Date('2026-03-21T06:00:00.000Z'),
          createdAt: new Date('2026-03-21T06:00:00.000Z'),
          updatedAt: new Date('2026-03-21T06:00:00.000Z'),
        },
      ],
      total: 1,
      nextCursor: null,
      page: 1,
      limit: 20,
    });
    mocks.getDeploymentByAddress.mockResolvedValue({
      id: 'dep-1',
      templateId: 'simple-token',
      templateName: 'Fixed Token',
      contractName: 'Fixed Token',
      templateType: 'ERC20',
      contractAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      deployerAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      walletAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      chainId: 421614,
      txHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      constructorArgs: {},
      abi: [],
      sourceCode: null,
      compilationWarnings: [],
      blockNumber: 123n,
      gasUsed: '210000',
      deployedAt: new Date('2026-03-21T06:00:00.000Z'),
      createdAt: new Date('2026-03-21T06:00:00.000Z'),
      updatedAt: new Date('2026-03-21T06:00:00.000Z'),
    });

    const listReq = createMockReq({
      query: {
        walletAddress: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        chainId: '421614',
        templateType: 'ERC20',
      },
      userId: 'user-1',
    });
    const listRes = createMockRes();

    await invokeHandler(listHandler, listReq, listRes);

    expect(mocks.listDeployments).toHaveBeenCalledWith('user-1', {
      chainId: 421614,
      limit: 20,
      page: 1,
      cursor: undefined,
      walletAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      templateType: 'ERC20',
    });
    expect((listRes.body as { total: number }).total).toBe(1);

    const lookupReq = createMockReq({
      params: { contractAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
      query: { chainId: '421614' },
      userId: 'user-1',
    });
    const lookupRes = createMockRes();

    await invokeHandler(lookupByAddressHandler, lookupReq, lookupRes);

    expect(mocks.getDeploymentByAddress).toHaveBeenCalledWith(
      'user-1',
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      { walletAddress: undefined, chainId: 421614 },
    );
    expect((lookupRes.body as { deployment: { id: string } }).deployment.id).toBe('dep-1');
  });
});
