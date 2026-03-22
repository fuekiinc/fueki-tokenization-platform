import { Storage } from '@google-cloud/storage';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';
import { decryptBuffer, encryptBuffer } from './encryption';

// ---------------------------------------------------------------------------
// Storage abstraction -- uses GCS in production, local filesystem in dev
// ---------------------------------------------------------------------------

const gcsConfig = config.gcs ?? { bucket: '', keyFile: '' };
const useGCS = !!gcsConfig.bucket;

let gcsStorage: Storage | null = null;
if (useGCS) {
  gcsStorage = gcsConfig.keyFile
    ? new Storage({ keyFilename: gcsConfig.keyFile })
    : new Storage(); // Uses Application Default Credentials on GCP
}

/**
 * Save an encrypted document and return its storage path/URI.
 * - In production (GCS): uploads to the configured bucket.
 * - In development (no bucket): saves to local disk.
 */
export async function saveEncryptedDocument(
  file: { buffer: Buffer; originalname: string },
  userId: string,
): Promise<string> {
  // Encrypt the file
  const { encrypted, iv, authTag } = encryptBuffer(file.buffer);

  // Prepend IV + authTag header so we can decrypt later
  const header = Buffer.from(JSON.stringify({ iv, authTag }));
  const headerLength = Buffer.alloc(4);
  headerLength.writeUInt32BE(header.length);
  const payload = Buffer.concat([headerLength, header, encrypted]);

  // Sanitize filename: strip path traversal chars, limit length, use safe characters only.
  const safeName = file.originalname
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(0, 100);
  const fileName = `${Date.now()}-${safeName}.enc`;
  const objectPath = `kyc-documents/${userId}/${fileName}`;

  if (useGCS && gcsStorage) {
    const bucket = gcsStorage.bucket(gcsConfig.bucket);
    const blob = bucket.file(objectPath);

    await blob.save(payload, {
      resumable: false,
      contentType: 'application/octet-stream',
      metadata: {
        cacheControl: 'private, max-age=0, no-store',
      },
    });

    return `gs://${config.gcs.bucket}/${objectPath}`;
  }

  // Fallback: local filesystem (development only)
  const uploadDir = path.join(config.upload.dir, userId);
  await fs.mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, fileName);
  await fs.writeFile(filePath, payload);
  return filePath;
}

function isPathWithin(basePath: string, targetPath: string): boolean {
  const relativePath = path.relative(basePath, targetPath);
  return relativePath.length > 0
    && !relativePath.startsWith('..')
    && !path.isAbsolute(relativePath);
}

function parseEncryptedDocumentPayload(payload: Buffer): Buffer {
  if (payload.length < 5) {
    throw new Error('Encrypted document payload is truncated');
  }

  const headerLength = payload.readUInt32BE(0);
  const headerStart = 4;
  const headerEnd = headerStart + headerLength;

  if (headerLength <= 0 || headerEnd >= payload.length) {
    throw new Error('Encrypted document payload header is invalid');
  }

  const headerRaw = payload.subarray(headerStart, headerEnd).toString('utf8');
  const parsedHeader = JSON.parse(headerRaw) as {
    iv?: string;
    authTag?: string;
  };

  if (
    typeof parsedHeader.iv !== 'string'
    || typeof parsedHeader.authTag !== 'string'
  ) {
    throw new Error('Encrypted document payload metadata is invalid');
  }

  const encryptedBody = payload.subarray(headerEnd);
  if (encryptedBody.length === 0) {
    throw new Error('Encrypted document payload body is empty');
  }

  return decryptBuffer(encryptedBody, parsedHeader.iv, parsedHeader.authTag);
}

async function readEncryptedPayloadFromStorage(
  storagePath: string,
  userId: string,
): Promise<Buffer> {
  if (storagePath.startsWith('gs://')) {
    if (!gcsStorage) {
      throw new Error('Google Cloud Storage is not configured');
    }

    const storageUri = new URL(storagePath);
    const bucketName = storageUri.hostname;
    const objectPath = storageUri.pathname.replace(/^\/+/, '');

    if (!objectPath.startsWith(`kyc-documents/${userId}/`)) {
      throw new Error('KYC document path is outside the allowed user scope');
    }

    const [payload] = await gcsStorage.bucket(bucketName).file(objectPath).download();
    return payload;
  }

  const expectedBaseDir = path.resolve(config.upload.dir, userId);
  const resolvedPath = path.resolve(storagePath);

  if (!isPathWithin(expectedBaseDir, resolvedPath)) {
    throw new Error('KYC document path is outside the allowed user scope');
  }

  return fs.readFile(resolvedPath);
}

export async function readEncryptedDocument(
  storagePath: string,
  userId: string,
): Promise<Buffer> {
  const payload = await readEncryptedPayloadFromStorage(storagePath, userId);
  return parseEncryptedDocumentPayload(payload);
}
