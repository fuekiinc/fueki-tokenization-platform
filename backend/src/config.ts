import 'dotenv/config';

// ---------------------------------------------------------------------------
// Required environment variable validation
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`FATAL: Required environment variable ${name} is not set.`);
    process.exit(1);
  }
  return value;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

const isProduction = process.env.NODE_ENV === 'production';
const kycUploadMaxSizeMb = parsePositiveInt(process.env.KYC_UPLOAD_MAX_SIZE_MB, 20);
type CookieSameSite = 'strict' | 'lax' | 'none';

function resolveRefreshCookieSameSite(): CookieSameSite {
  const raw = (process.env.AUTH_COOKIE_SAMESITE || '').trim().toLowerCase();
  if (raw === 'strict' || raw === 'lax' || raw === 'none') {
    return raw;
  }
  // Cross-domain frontend/backend deployments need SameSite=None for refresh cookies.
  return isProduction ? 'none' : 'lax';
}

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: requireEnv('DATABASE_URL'),

  jwt: {
    accessSecret: isProduction
      ? requireEnv('JWT_ACCESS_SECRET')
      : (process.env.JWT_ACCESS_SECRET ?? 'dev-only-access-secret-not-for-production'),
    refreshSecret: isProduction
      ? requireEnv('JWT_REFRESH_SECRET')
      : (process.env.JWT_REFRESH_SECRET ?? 'dev-only-refresh-secret-not-for-production'),
    accessExpiresIn: 15 * 60, // 15 minutes in seconds
    refreshExpiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
  },

  encryption: {
    key: isProduction
      ? requireEnv('ENCRYPTION_KEY')
      : (process.env.ENCRYPTION_KEY ?? 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'),
    algorithm: 'aes-256-gcm' as const,
  },

  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  },

  auth: {
    refreshCookieSameSite: resolveRefreshCookieSameSite(),
  },

  // Google Cloud Storage for KYC document uploads
  gcs: {
    bucket: process.env.GCS_BUCKET || '', // empty = use local filesystem
    keyFile: process.env.GCS_KEY_FILE || '', // empty = use Application Default Credentials
  },

  // SMTP settings for transactional emails (password reset, etc.)
  smtp: {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'noreply@fueki.io',
  },

  // Frontend URL (used for building links in emails)
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Admin email addresses (comma-separated) for KYC review notifications
  adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim()).filter(Boolean),

  // Backend URL (used for building action links in admin emails)
  backendUrl: process.env.BACKEND_URL || 'http://localhost:8080',

  // Support inbox destination for in-app support requests
  support: {
    requestRecipient: process.env.SUPPORT_EMAIL_TO || 'mark@fueki-tech.com',
  },

  // Mint approval workflow inbox and action-link TTL
  mintApproval: {
    requestRecipient: process.env.MINT_APPROVAL_EMAIL_TO || 'mark@fueki-tech.com',
    actionTokenTtlHours: parseInt(process.env.MINT_APPROVAL_TOKEN_TTL_HOURS || '168', 10), // 7 days
  },

  securityTokenApproval: {
    requestRecipient:
      process.env.SECURITY_TOKEN_APPROVAL_EMAIL_TO ||
      process.env.MINT_APPROVAL_EMAIL_TO ||
      'mark@fueki-tech.com',
    actionTokenTtlHours: parseInt(
      process.env.SECURITY_TOKEN_APPROVAL_TOKEN_TTL_HOURS ||
        process.env.MINT_APPROVAL_TOKEN_TTL_HOURS ||
        '168',
      10,
    ),
  },

  // Local upload fallback (dev only, not used on Cloud Run)
  upload: {
    dir: process.env.UPLOAD_DIR || './uploads',
    // Generic upload limit used for non-KYC uploads (mint requests, etc).
    maxSize: 10 * 1024 * 1024,
    // KYC capture payload can include a short live video clip, so allow a
    // higher file-size ceiling than generic document uploads.
    kycMaxSizeMb: kycUploadMaxSizeMb,
    kycMaxSize: kycUploadMaxSizeMb * 1024 * 1024,
  },
};
