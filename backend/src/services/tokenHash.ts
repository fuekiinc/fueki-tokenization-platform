import crypto from 'node:crypto';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function buildTokenLookupCandidates(token: string): string[] {
  return [...new Set([hashToken(token), token])];
}
