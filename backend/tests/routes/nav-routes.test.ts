import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError, isHttpError } from '../../src/lib/httpErrors';

const mocks = vi.hoisted(() => ({
  createNavDraft: vi.fn(),
  finalizePublishedNavAttestation: vi.fn(),
  getCurrentNav: vi.fn(),
  getHolderValue: vi.fn(),
  getNavAttestationByIndex: vi.fn(),
  getNavHistory: vi.fn(),
  getNavOracleRegistration: vi.fn(),
  getUserWalletAddress: vi.fn(),
  isOracleAdmin: vi.fn(),
  isOraclePublisher: vi.fn(),
  isSecurityTokenContractAdmin: vi.fn(),
  listNavPublishers: vi.fn(),
  registerNavOracle: vi.fn(),
  removeNavPublisher: vi.fn(),
  updateNavAttestationStatus: vi.fn(),
  upsertNavPublisher: vi.fn(),
  validateNavAttestationInput: vi.fn(),
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

vi.mock('../../src/services/nav', () => ({
  createNavDraft: mocks.createNavDraft,
  finalizePublishedNavAttestation: mocks.finalizePublishedNavAttestation,
  getCurrentNav: mocks.getCurrentNav,
  getHolderValue: mocks.getHolderValue,
  getNavAttestationByIndex: mocks.getNavAttestationByIndex,
  getNavHistory: mocks.getNavHistory,
  getNavOracleRegistration: mocks.getNavOracleRegistration,
  getUserWalletAddress: mocks.getUserWalletAddress,
  isOracleAdmin: mocks.isOracleAdmin,
  isOraclePublisher: mocks.isOraclePublisher,
  isSecurityTokenContractAdmin: mocks.isSecurityTokenContractAdmin,
  listNavPublishers: mocks.listNavPublishers,
  registerNavOracle: mocks.registerNavOracle,
  removeNavPublisher: mocks.removeNavPublisher,
  updateNavAttestationStatus: mocks.updateNavAttestationStatus,
  upsertNavPublisher: mocks.upsertNavPublisher,
  validateNavAttestationInput: mocks.validateNavAttestationInput,
}));

import navRoutes from '../../src/routes/nav';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/nav', navRoutes);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (isHttpError(error)) {
      res.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
          issues: error.issues,
        },
      });
      return;
    }

    if (error instanceof Error && error.name === 'ZodError') {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
        },
      });
      return;
    }

    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error instanceof Error ? error.message : 'Internal server error',
      },
    });
  });
  return app;
}

describe('NAV routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserWalletAddress.mockResolvedValue('0x1111111111111111111111111111111111111111');
    mocks.getNavOracleRegistration.mockResolvedValue({
      tokenAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      chainId: 421614,
      oracleAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      baseCurrency: 'USD',
      stalenessWarningDays: 90,
      stalenessCriticalDays: 180,
      minAttestationIntervalSeconds: 86400,
      maxNavChangeBps: 5000,
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:00:00.000Z',
    });
    mocks.isOraclePublisher.mockResolvedValue(true);
    mocks.isOracleAdmin.mockResolvedValue(false);
    mocks.validateNavAttestationInput.mockResolvedValue([]);
  });

  it('returns the current NAV payload for a token', async () => {
    mocks.getCurrentNav.mockResolvedValue({
      id: 'attestation-1',
      tokenAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      chainId: 421614,
      oracleAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      navPerToken: '5.000000',
      totalNAV: '5000000.000000',
      totalTokenSupply: '1000000',
      baseCurrency: 'USD',
      effectiveDate: '2026-03-01T00:00:00.000Z',
      publishedAt: '2026-03-02T00:00:00.000Z',
      publisher: {
        address: '0x1111111111111111111111111111111111111111',
        name: 'Appraiser LLC',
      },
      reportHash: '0x' + 'ab'.repeat(32),
      reportURI: 'ipfs://report',
      txHash: '0x' + 'cd'.repeat(32),
      attestationIndex: 0,
      status: 'PUBLISHED',
      assetBreakdown: [],
      daysSinceLastUpdate: 29,
      navChangeFromPrevious: null,
      stalenessWarningDays: 90,
      stalenessCriticalDays: 180,
    });

    const app = createApp();
    const response = await request(app)
      .get('/api/v1/nav/0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/421614/current')
      .expect(200);

    expect(mocks.getCurrentNav).toHaveBeenCalledWith(
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      421614,
    );
    expect(response.body).toMatchObject({
      navPerToken: '5.000000',
      baseCurrency: 'USD',
    });
  });

  it('returns NAV_NOT_FOUND when no current attestation exists', async () => {
    mocks.getCurrentNav.mockResolvedValue(null);

    const app = createApp();
    const response = await request(app)
      .get('/api/v1/nav/0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/421614/current')
      .expect(404);

    expect(response.body.error).toMatchObject({
      code: 'NAV_NOT_FOUND',
    });
  });

  it('creates a NAV draft with normalized addresses and validated payload', async () => {
    mocks.createNavDraft.mockResolvedValue({
      id: 'draft-1',
      tokenAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      chainId: 421614,
      oracleAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      navPerToken: '5.000000',
      totalNAV: '5000000.000000',
      totalTokenSupply: '1000000',
      baseCurrency: 'USD',
      effectiveDate: '2026-03-01T00:00:00.000Z',
      publishedAt: null,
      publisher: {
        address: '0x1111111111111111111111111111111111111111',
        name: 'Appraiser LLC',
      },
      reportHash: '0x' + 'ab'.repeat(32),
      reportURI: 'ipfs://report',
      txHash: null,
      attestationIndex: null,
      status: 'DRAFT',
      assetBreakdown: [],
    });

    const app = createApp();
    const response = await request(app)
      .post('/api/v1/nav/0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/421614/attestation/draft')
      .send({
        navPerToken: '5.000000',
        totalNAV: '5000000.000000',
        effectiveDate: '2026-03-01T00:00:00.000Z',
        reportHash: '0x' + 'ab'.repeat(32),
        reportURI: 'ipfs://report',
        publisherName: 'Appraiser LLC',
        assetBreakdown: [
          {
            assetName: 'Pandora Mine',
            assetType: 'mining_property',
            grossAssetValue: '5000000.000000',
            liabilities: '0',
            netAssetValue: '5000000.000000',
          },
        ],
      })
      .expect(201);

    expect(mocks.validateNavAttestationInput).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        chainId: 421614,
        publisherAddress: '0x1111111111111111111111111111111111111111',
      }),
    );
    expect(mocks.createNavDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        chainId: 421614,
        publisherAddress: '0x1111111111111111111111111111111111111111',
      }),
    );
    expect(response.body).toMatchObject({
      status: 'DRAFT',
      id: 'draft-1',
    });
  });

  it('returns backend validation failures before draft creation', async () => {
    mocks.validateNavAttestationInput.mockResolvedValue([
      'NAV per token must be greater than zero.',
    ]);

    const app = createApp();
    const response = await request(app)
      .post('/api/v1/nav/0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/421614/attestation/draft')
      .send({
        navPerToken: '5.000000',
        totalNAV: '5000000.000000',
        effectiveDate: '2026-03-01T00:00:00.000Z',
        reportHash: '0x' + 'ab'.repeat(32),
        reportURI: 'ipfs://report',
        assetBreakdown: [
          {
            assetName: 'Pandora Mine',
            assetType: 'mining_property',
            grossAssetValue: '5000000.000000',
            liabilities: '0',
            netAssetValue: '5000000.000000',
          },
        ],
      })
      .expect(400);

    expect(response.body.error).toMatchObject({
      code: 'INVALID_NAV_ATTESTATION',
    });
    expect(mocks.createNavDraft).not.toHaveBeenCalled();
  });

  it('still honors route-level zod validation before backend validation', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/v1/nav/0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/421614/attestation/draft')
      .send({
        navPerToken: '0',
        totalNAV: '0',
        effectiveDate: '2026-03-01T00:00:00.000Z',
        reportHash: '0x' + 'ab'.repeat(32),
        reportURI: 'ipfs://report',
        assetBreakdown: [
          {
            assetName: 'Pandora Mine',
            assetType: 'mining_property',
            grossAssetValue: '0',
            liabilities: '0',
            netAssetValue: '0',
          },
        ],
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(mocks.validateNavAttestationInput).not.toHaveBeenCalled();
  });

  it('surfaces service-level registration errors for invalid oracle/token pairs', async () => {
    mocks.registerNavOracle.mockRejectedValue(
      new HttpError(
        400,
        'NAV_ORACLE_TOKEN_MISMATCH',
        'The NAV oracle is configured for a different security token. Double-check that you entered the oracle deployed for this token.',
      ),
    );
    mocks.isSecurityTokenContractAdmin.mockResolvedValue(true);
    mocks.isOracleAdmin.mockResolvedValue(false);

    const app = createApp();
    const response = await request(app)
      .post('/api/v1/nav/0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/421614/oracle')
      .send({
        oracleAddress: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        baseCurrency: 'USD',
      })
      .expect(400);

    expect(response.body.error).toMatchObject({
      code: 'NAV_ORACLE_TOKEN_MISMATCH',
    });
  });
});
