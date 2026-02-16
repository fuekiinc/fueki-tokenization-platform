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

const isProduction = process.env.NODE_ENV === 'production';

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
      : (process.env.ENCRYPTION_KEY ?? 'a]1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b'),
    algorithm: 'aes-256-gcm' as const,
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },

  // Google Cloud Storage for KYC document uploads
  gcs: {
    bucket: process.env.GCS_BUCKET || '', // empty = use local filesystem
    keyFile: process.env.GCS_KEY_FILE || '', // empty = use Application Default Credentials
  },

  // Local upload fallback (dev only, not used on Cloud Run)
  upload: {
    dir: process.env.UPLOAD_DIR || './uploads',
    maxSize: 10 * 1024 * 1024, // 10MB
  },
};
