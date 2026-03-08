export function parseJwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = atob(padded);
    const parsed = JSON.parse(decoded) as { exp?: unknown };
    if (typeof parsed.exp !== 'number') return null;
    return parsed.exp * 1000;
  } catch {
    return null;
  }
}

export function isJwtExpired(token: string, skewMs = 30_000): boolean {
  const expiryMs = parseJwtExpiryMs(token);
  // Treat malformed tokens (no parseable exp) as expired to avoid
  // unnecessary authenticated calls with invalid credentials.
  if (!expiryMs) return true;
  return expiryMs <= Date.now() + skewMs;
}
