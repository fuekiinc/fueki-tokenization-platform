import { ethers } from 'ethers';
import { z } from 'zod';
import { getSupportedChainId } from '../services/rpcRegistry';

export const supportedChainIdSchema = z.coerce.number().int().refine(
  (value) => getSupportedChainId(value) !== null,
  { message: 'Unsupported chain id' },
);

export const evmAddressSchema = z.string().trim().refine(
  (value) => ethers.isAddress(value),
  { message: 'Must be a valid EVM address' },
);

export const txHashSchema = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'Must be a valid transaction hash');

export const abiArraySchema = z.array(z.unknown());

export const positiveDecimalStringSchema = z
  .string()
  .trim()
  .refine((value) => /^\d+(\.\d+)?$/.test(value), {
    message: 'Amount must be a valid positive decimal number',
  })
  .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, {
    message: 'Amount must be greater than zero',
  });

/** Accepts a positive decimal string OR an empty/blank string (coerced to undefined). */
export const optionalDecimalStringSchema = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .pipe(positiveDecimalStringSchema.optional());

