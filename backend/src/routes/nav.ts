import type { NavAttestationStatus } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/httpErrors';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticate } from '../middleware/auth';
import { evmAddressSchema, positiveDecimalStringSchema, supportedChainIdSchema, txHashSchema } from '../lib/validation';
import {
  createNavDraft,
  finalizePublishedNavAttestation,
  getCurrentNav,
  getHolderValue,
  getNavAttestationByIndex,
  getNavHistory,
  getNavOracleRegistration,
  getUserWalletAddress,
  isOracleAdmin,
  isOraclePublisher,
  isSecurityTokenContractAdmin,
  listNavPublishers,
  registerNavOracle,
  removeNavPublisher,
  updateNavAttestationStatus,
  upsertNavPublisher,
  validateNavAttestationInput,
} from '../services/nav';

const router = Router();

const paramsSchema = z.object({
  tokenAddress: evmAddressSchema.transform((value) => value.toLowerCase()),
  chainId: supportedChainIdSchema,
});

const attestationParamsSchema = paramsSchema.extend({
  index: z.coerce.number().int().min(0),
});

const holderParamsSchema = paramsSchema.extend({
  holderAddress: evmAddressSchema.transform((value) => value.toLowerCase()),
});

const assetBreakdownSchema = z.object({
  assetName: z.string().trim().min(1).max(200),
  assetType: z.string().trim().min(1).max(120),
  grossAssetValue: positiveDecimalStringSchema,
  liabilities: positiveDecimalStringSchema.or(z.literal('0')).default('0'),
  netAssetValue: positiveDecimalStringSchema,
  provenReservesOz: positiveDecimalStringSchema.optional(),
  probableReservesOz: positiveDecimalStringSchema.optional(),
  spotPricePerOz: positiveDecimalStringSchema.optional(),
  productionRateTpd: positiveDecimalStringSchema.optional(),
  notes: z.string().trim().max(10_000).optional(),
});

const registerOracleSchema = z.object({
  oracleAddress: evmAddressSchema.transform((value) => value.toLowerCase()),
  baseCurrency: z.string().trim().min(1).max(10).default('USD'),
  stalenessWarningDays: z.coerce.number().int().min(1).max(3650).optional(),
  stalenessCriticalDays: z.coerce.number().int().min(1).max(3650).optional(),
  minAttestationIntervalSeconds: z.coerce.number().int().min(0).max(31_536_000).optional(),
  maxNavChangeBps: z.coerce.number().int().min(1).max(10_000).optional(),
});

const draftSchema = z.object({
  navPerToken: positiveDecimalStringSchema,
  totalNAV: positiveDecimalStringSchema,
  effectiveDate: z.string().datetime(),
  reportHash: z.string().trim().regex(/^0x[a-fA-F0-9]{64}$/),
  reportURI: z.string().trim().min(1).max(2048),
  publisherName: z.string().trim().max(200).optional(),
  assetBreakdown: z.array(assetBreakdownSchema).min(1),
});

const finalizeSchema = draftSchema.extend({
  txHash: txHashSchema.transform((value) => value.toLowerCase()),
  draftId: z.string().trim().uuid().optional(),
});

const publisherSchema = z.object({
  walletAddress: evmAddressSchema.transform((value) => value.toLowerCase()),
  name: z.string().trim().min(1).max(200),
  licenseNumber: z.string().trim().max(120).optional(),
  licenseType: z.string().trim().max(120).optional(),
  contactEmail: z.string().trim().email().max(320).optional(),
});

const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const statusSchema = z.object({
  status: z.enum(['DRAFT', 'PENDING_TX', 'PUBLISHED', 'SUPERSEDED', 'DISPUTED']),
});

async function requireAuthenticatedWallet(userId: string | undefined): Promise<string> {
  if (!userId) {
    throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
  }

  const walletAddress = await getUserWalletAddress(userId);
  if (!walletAddress) {
    throw new HttpError(400, 'WALLET_REQUIRED', 'Authenticated user does not have a wallet address on file');
  }

  return walletAddress;
}

async function requireNavWriteAccess(
  tokenAddress: string,
  chainId: number,
  userId: string | undefined,
): Promise<{ walletAddress: string; oracleAddress: string }> {
  const walletAddress = await requireAuthenticatedWallet(userId);
  const registration = await getNavOracleRegistration(tokenAddress, chainId);

  if (!registration) {
    throw new HttpError(404, 'NAV_ORACLE_NOT_REGISTERED', 'NAV oracle is not registered for this token');
  }

  const [publisher, admin] = await Promise.all([
    isOraclePublisher(registration.oracleAddress, chainId, walletAddress),
    isOracleAdmin(registration.oracleAddress, chainId, walletAddress),
  ]);

  if (!publisher && !admin) {
    throw new HttpError(403, 'FORBIDDEN', 'Wallet does not have NAV publisher permissions for this oracle');
  }

  return { walletAddress, oracleAddress: registration.oracleAddress };
}

async function requireNavAdminAccess(
  tokenAddress: string,
  chainId: number,
  userId: string | undefined,
): Promise<{ walletAddress: string; oracleAddress: string | null }> {
  const walletAddress = await requireAuthenticatedWallet(userId);
  const registration = await getNavOracleRegistration(tokenAddress, chainId);

  const [tokenAdmin, oracleAdmin] = await Promise.all([
    isSecurityTokenContractAdmin(tokenAddress, chainId, walletAddress),
    registration ? isOracleAdmin(registration.oracleAddress, chainId, walletAddress) : Promise.resolve(false),
  ]);

  if (!tokenAdmin && !oracleAdmin) {
    throw new HttpError(403, 'FORBIDDEN', 'Wallet does not have token-admin or NAV-admin permissions');
  }

  return {
    walletAddress,
    oracleAddress: registration?.oracleAddress ?? null,
  };
}

router.get('/:tokenAddress/:chainId/oracle', asyncHandler(async (req, res) => {
  const { tokenAddress, chainId } = paramsSchema.parse(req.params);
  const registration = await getNavOracleRegistration(tokenAddress, chainId);

  if (!registration) {
    throw new HttpError(404, 'NAV_ORACLE_NOT_REGISTERED', 'NAV oracle is not registered for this token');
  }

  res.json(registration);
}));

router.post('/:tokenAddress/:chainId/oracle', authenticate, asyncHandler(async (req, res) => {
  const { tokenAddress, chainId } = paramsSchema.parse(req.params);
  const body = registerOracleSchema.parse(req.body);
  await requireNavAdminAccess(tokenAddress, chainId, req.userId);

  const registration = await registerNavOracle({
    tokenAddress,
    chainId,
    oracleAddress: body.oracleAddress,
    baseCurrency: body.baseCurrency,
    stalenessWarningDays: body.stalenessWarningDays,
    stalenessCriticalDays: body.stalenessCriticalDays,
    minAttestationIntervalSeconds: body.minAttestationIntervalSeconds,
    maxNavChangeBps: body.maxNavChangeBps,
    createdBy: req.userId!,
  });

  res.status(201).json(registration);
}));

router.get('/:tokenAddress/:chainId/current', asyncHandler(async (req, res) => {
  const { tokenAddress, chainId } = paramsSchema.parse(req.params);
  const current = await getCurrentNav(tokenAddress, chainId);

  if (!current) {
    throw new HttpError(404, 'NAV_NOT_FOUND', 'No NAV attestations found for this token');
  }

  res.json(current);
}));

router.get('/:tokenAddress/:chainId/history', asyncHandler(async (req, res) => {
  const { tokenAddress, chainId } = paramsSchema.parse(req.params);
  const query = historyQuerySchema.parse(req.query);
  const history = await getNavHistory(tokenAddress, chainId, query);
  res.json(history);
}));

router.get('/:tokenAddress/:chainId/attestation/:index', asyncHandler(async (req, res) => {
  const { tokenAddress, chainId, index } = attestationParamsSchema.parse(req.params);
  const attestation = await getNavAttestationByIndex(tokenAddress, chainId, index);

  if (!attestation) {
    throw new HttpError(404, 'NAV_ATTESTATION_NOT_FOUND', 'Requested attestation was not found');
  }

  res.json(attestation);
}));

router.get('/:tokenAddress/:chainId/holder-value/:holderAddress', asyncHandler(async (req, res) => {
  const { tokenAddress, chainId, holderAddress } = holderParamsSchema.parse(req.params);
  const holderValue = await getHolderValue(tokenAddress, chainId, holderAddress);

  if (!holderValue) {
    throw new HttpError(404, 'NAV_NOT_FOUND', 'No NAV attestations found for this token');
  }

  res.json(holderValue);
}));

router.get('/:tokenAddress/:chainId/publishers', asyncHandler(async (req, res) => {
  const { tokenAddress, chainId } = paramsSchema.parse(req.params);
  const publishers = await listNavPublishers(tokenAddress, chainId);
  res.json({ publishers });
}));

router.post('/:tokenAddress/:chainId/publishers', authenticate, asyncHandler(async (req, res) => {
  const { tokenAddress, chainId } = paramsSchema.parse(req.params);
  const body = publisherSchema.parse(req.body);
  await requireNavAdminAccess(tokenAddress, chainId, req.userId);

  const publisher = await upsertNavPublisher({
    tokenAddress,
    chainId,
    walletAddress: body.walletAddress,
    name: body.name,
    licenseNumber: body.licenseNumber,
    licenseType: body.licenseType,
    contactEmail: body.contactEmail,
    addedBy: req.userId!,
  });

  res.status(201).json(publisher);
}));

router.delete('/:tokenAddress/:chainId/publishers/:walletAddress', authenticate, asyncHandler(async (req, res) => {
  const { tokenAddress, chainId } = paramsSchema.parse(req.params);
  const { walletAddress } = z.object({
    walletAddress: evmAddressSchema.transform((value) => value.toLowerCase()),
  }).parse(req.params);
  await requireNavAdminAccess(tokenAddress, chainId, req.userId);
  await removeNavPublisher(tokenAddress, chainId, walletAddress, req.userId!);
  res.json({ success: true });
}));

router.post('/:tokenAddress/:chainId/attestation/draft', authenticate, asyncHandler(async (req, res) => {
  const { tokenAddress, chainId } = paramsSchema.parse(req.params);
  const body = draftSchema.parse(req.body);
  const { walletAddress } = await requireNavWriteAccess(tokenAddress, chainId, req.userId);

  const errors = await validateNavAttestationInput({
    tokenAddress,
    chainId,
    navPerToken: body.navPerToken,
    totalNAV: body.totalNAV,
    effectiveDate: new Date(body.effectiveDate),
    reportHash: body.reportHash,
    reportURI: body.reportURI,
    publisherAddress: walletAddress,
    publisherName: body.publisherName,
    assetBreakdown: body.assetBreakdown,
  });

  if (errors.length > 0) {
    throw new HttpError(400, 'INVALID_NAV_ATTESTATION', 'NAV attestation validation failed', { errors });
  }

  const draft = await createNavDraft({
    tokenAddress,
    chainId,
    navPerToken: body.navPerToken,
    totalNAV: body.totalNAV,
    effectiveDate: new Date(body.effectiveDate),
    reportHash: body.reportHash,
    reportURI: body.reportURI,
    publisherAddress: walletAddress,
    publisherName: body.publisherName,
    assetBreakdown: body.assetBreakdown,
  });

  res.status(201).json(draft);
}));

router.post('/:tokenAddress/:chainId/attestation', authenticate, asyncHandler(async (req, res) => {
  const { tokenAddress, chainId } = paramsSchema.parse(req.params);
  const body = finalizeSchema.parse(req.body);
  const { walletAddress } = await requireNavWriteAccess(tokenAddress, chainId, req.userId);

  const errors = await validateNavAttestationInput({
    tokenAddress,
    chainId,
    navPerToken: body.navPerToken,
    totalNAV: body.totalNAV,
    effectiveDate: new Date(body.effectiveDate),
    reportHash: body.reportHash,
    reportURI: body.reportURI,
    publisherAddress: walletAddress,
    publisherName: body.publisherName,
    assetBreakdown: body.assetBreakdown,
  });

  if (errors.length > 0) {
    throw new HttpError(400, 'INVALID_NAV_ATTESTATION', 'NAV attestation validation failed', { errors });
  }

  const published = await finalizePublishedNavAttestation({
    tokenAddress,
    chainId,
    navPerToken: body.navPerToken,
    totalNAV: body.totalNAV,
    effectiveDate: new Date(body.effectiveDate),
    reportHash: body.reportHash,
    reportURI: body.reportURI,
    publisherAddress: walletAddress,
    publisherName: body.publisherName,
    assetBreakdown: body.assetBreakdown,
    txHash: body.txHash,
    draftId: body.draftId,
  });

  res.status(201).json(published);
}));

router.patch('/:tokenAddress/:chainId/attestation/:index/status', authenticate, asyncHandler(async (req, res) => {
  const { tokenAddress, chainId, index } = attestationParamsSchema.parse(req.params);
  const body = statusSchema.parse(req.body);
  await requireNavAdminAccess(tokenAddress, chainId, req.userId);

  const attestation = await getNavAttestationByIndex(tokenAddress, chainId, index);
  if (!attestation) {
    throw new HttpError(404, 'NAV_ATTESTATION_NOT_FOUND', 'Requested attestation was not found');
  }

  const updated = await updateNavAttestationStatus(attestation.id, body.status as NavAttestationStatus);
  res.json(updated);
}));

export default router;
