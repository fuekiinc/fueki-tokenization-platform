import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL!,

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'fueki-access-secret-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'fueki-refresh-secret-change-in-production',
    accessExpiresIn: 15 * 60, // 15 minutes in seconds
    refreshExpiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
  },

  encryption: {
    key: process.env.ENCRYPTION_KEY || 'a'.repeat(64), // 32 bytes hex
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
