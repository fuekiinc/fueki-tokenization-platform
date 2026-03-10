import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MintRequestVerificationError,
  verifyMintRequestOnChain,
} from '../../src/services/mintRequestVerification';

const txHash = `0x${'aa'.repeat(32)}`;
const creator = '0x3333333333333333333333333333333333333333';
const recipient = '0x1111111111111111111111111111111111111111';
const assetAddress = '0x2222222222222222222222222222222222222222';
const chainId = 17000;
const factoryAddress = '0xcc00d84b5d2448552a238465c4c05a82ac5ab411';
const assetCreatedTopic0 =
  '0x01dca289c0f18a127f1c03e2c9bae0b2223e81a20cf61bc0a1dff0f0468d4c6b';

function encodeUint256(value: bigint): string {
  return value.toString(16).padStart(64, '0');
}

function encodeAddressTopic(address: string): string {
  return `0x${address.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
}

function encodeDynamicString(value: string): string {
  const hex = Buffer.from(value, 'utf8').toString('hex');
  const paddedLength = Math.ceil(hex.length / 64) * 64;
  return `${encodeUint256(BigInt(hex.length / 2))}${hex.padEnd(paddedLength, '0')}`;
}

function encodeAssetCreatedData(input: {
  name: string;
  symbol: string;
  documentHash: string;
  documentType: string;
  originalValue: bigint;
  mintAmount: bigint;
}): string {
  const nameTail = encodeDynamicString(input.name);
  const symbolTail = encodeDynamicString(input.symbol);
  const documentTypeTail = encodeDynamicString(input.documentType);

  let nextOffset = 32 * 6;
  const nameOffset = nextOffset;
  nextOffset += nameTail.length / 2;
  const symbolOffset = nextOffset;
  nextOffset += symbolTail.length / 2;
  const documentTypeOffset = nextOffset;

  return `0x${[
    encodeUint256(BigInt(nameOffset)),
    encodeUint256(BigInt(symbolOffset)),
    input.documentHash.toLowerCase().replace(/^0x/, ''),
    encodeUint256(BigInt(documentTypeOffset)),
    encodeUint256(input.originalValue),
    encodeUint256(input.mintAmount),
    nameTail,
    symbolTail,
    documentTypeTail,
  ].join('')}`;
}

function jsonRpcResult(result: unknown) {
  return {
    ok: true,
    json: async () => ({
      jsonrpc: '2.0',
      id: 1,
      result,
    }),
  } as Response;
}

function makeFetchMock(results: unknown[]) {
  return vi.fn(async () => jsonRpcResult(results.shift()));
}

describe('verifyMintRequestOnChain', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts a tx only when chain, receipt, and AssetCreated payload all match', async () => {
    const originalValue = BigInt('100250000000000000000');
    const mintAmount = BigInt('10500000000000000000');

    vi.stubGlobal(
      'fetch',
      makeFetchMock([
        '0x4268',
        {
          from: creator,
          to: factoryAddress,
        },
        {
          status: '0x1',
          blockNumber: '0x10e1',
          logs: [
            {
              address: factoryAddress,
              topics: [
                assetCreatedTopic0,
                encodeAddressTopic(creator),
                encodeAddressTopic(assetAddress),
                encodeAddressTopic(recipient),
              ],
              data: encodeAssetCreatedData({
                name: 'Invoice Asset',
                symbol: 'INV',
                documentHash: `0x${'11'.repeat(32)}`,
                documentType: 'invoice',
                originalValue,
                mintAmount,
              }),
            },
          ],
        },
        '0x60006000',
      ]),
    );

    const result = await verifyMintRequestOnChain({
      chainId,
      txHash,
      tokenName: 'Invoice Asset',
      tokenSymbol: 'INV',
      mintAmount: '10.5',
      recipient,
      documentHash: `0x${'11'.repeat(32)}`,
      documentType: 'invoice',
      originalValue: '100.25',
      expectedCreatorAddress: creator,
    });

    expect(result).toEqual({
      assetAddress,
      blockNumber: 4321,
    });
  });

  it('rejects endpoints that return the wrong chain id', async () => {
    vi.stubGlobal('fetch', makeFetchMock(['0x1', '0x1']));

    await expect(
      verifyMintRequestOnChain({
        chainId,
        txHash,
        tokenName: 'Invoice Asset',
        tokenSymbol: 'INV',
        mintAmount: '10.5',
        recipient,
        documentHash: `0x${'11'.repeat(32)}`,
        documentType: 'invoice',
        originalValue: '100.25',
      }),
    ).rejects.toMatchObject({
      code: 'CHAIN_ID_MISMATCH',
    } satisfies Partial<MintRequestVerificationError>);
  });

  it('rejects receipts that do not succeed on-chain', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetchMock([
        '0x7a69',
        {
          from: creator,
          to: '0x5fbdb2315678afecb367f032d93f642f64180aa3',
        },
        {
          status: '0x0',
          blockNumber: '0x2',
          logs: [],
        },
      ]),
    );

    await expect(
      verifyMintRequestOnChain({
        chainId: 31337,
        txHash,
        tokenName: 'Invoice Asset',
        tokenSymbol: 'INV',
        mintAmount: '10.5',
        recipient,
        documentHash: `0x${'11'.repeat(32)}`,
        documentType: 'invoice',
        originalValue: '100.25',
      }),
    ).rejects.toMatchObject({
      code: 'TX_FAILED',
    } satisfies Partial<MintRequestVerificationError>);
  });

  it('rejects AssetCreated payloads that do not match the approved request', async () => {
    const originalValue = BigInt('100250000000000000000');
    const mintAmount = BigInt('10500000000000000000');
    const wrongRecipient = '0x4444444444444444444444444444444444444444';

    vi.stubGlobal(
      'fetch',
      makeFetchMock([
        '0x4268',
        {
          from: creator,
          to: factoryAddress,
        },
        {
          status: '0x1',
          blockNumber: '0x10e1',
          logs: [
            {
              address: factoryAddress,
              topics: [
                assetCreatedTopic0,
                encodeAddressTopic(creator),
                encodeAddressTopic(assetAddress),
                encodeAddressTopic(wrongRecipient),
              ],
              data: encodeAssetCreatedData({
                name: 'Invoice Asset',
                symbol: 'INV',
                documentHash: `0x${'11'.repeat(32)}`,
                documentType: 'invoice',
                originalValue,
                mintAmount,
              }),
            },
          ],
        },
      ]),
    );

    await expect(
      verifyMintRequestOnChain({
        chainId,
        txHash,
        tokenName: 'Invoice Asset',
        tokenSymbol: 'INV',
        mintAmount: '10.5',
        recipient,
        documentHash: `0x${'11'.repeat(32)}`,
        documentType: 'invoice',
        originalValue: '100.25',
        expectedCreatorAddress: creator,
      }),
    ).rejects.toMatchObject({
      code: 'EVENT_MISMATCH',
    } satisfies Partial<MintRequestVerificationError>);
  });
});
