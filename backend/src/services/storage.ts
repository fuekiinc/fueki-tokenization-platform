import { Storage } from '@google-cloud/storage';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';
import { encryptBuffer } from './encryption';

// ---------------------------------------------------------------------------
// Storage abstraction -- uses GCS in production, local filesystem in dev
// ---------------------------------------------------------------------------

const useGCS = !!config.gcs.bucket;

let gcsStorage: Storage | null = null;
if (useGCS) {
  gcsStorage = config.gcs.keyFile
    ? new Storage({ keyFilename: config.gcs.keyFile })
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

  const fileName = `${Date.now()}-${file.originalname}.enc`;
  const objectPath = `kyc-documents/${userId}/${fileName}`;

  if (useGCS && gcsStorage) {
    const bucket = gcsStorage.bucket(config.gcs.bucket);
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
