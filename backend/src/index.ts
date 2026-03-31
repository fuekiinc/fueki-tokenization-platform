import './tracer';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { apiEnvelope } from './lib/apiResponse';
import { errorHandler } from './middleware/errorHandler';
import { prisma } from './prisma';
import authRoutes from './routes/auth';
import kycRoutes from './routes/kyc';
import adminRoutes from './routes/admin';
import supportRoutes from './routes/support';
import mintRequestRoutes from './routes/mintRequests';
import securityTokenRequestRoutes from './routes/securityTokenRequests';
import deploymentRoutes from './routes/deployments';
import marketDataRoutes from './routes/marketData';
import navRoutes from './routes/nav';

const app = express();

// Trust proxy (required for Cloud Run / load balancers)
app.set('trust proxy', 1);

// Security
app.use(helmet());
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Cookie parsing (for httpOnly refresh token cookies)
app.use(cookieParser());

// Standardize JSON API envelopes while preserving legacy top-level fields.
app.use(apiEnvelope);

// ---------------------------------------------------------------------------
// Rate limiting
//
// Cloud Run can funnel multiple users through the same instance, and the
// default express-rate-limit store is in-memory (per-process).  The limits
// below are per-instance, so they need to be generous enough to avoid
// blocking legitimate traffic while still protecting against abuse.
// ---------------------------------------------------------------------------

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => req.headers.authorization?.startsWith('Bearer ') ? 200 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many requests, please try again later', code: 'RATE_LIMIT' } },
});

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,                   // was 20 -- too aggressive; silent token refreshes count toward this
  message: { error: { message: 'Too many authentication attempts', code: 'RATE_LIMIT' } },
});

const supportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: { message: 'Too many support requests, please try again later', code: 'RATE_LIMIT' } },
});

// Body parsing
app.use(express.json({ limit: process.env.API_JSON_LIMIT || '1mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.API_URLENCODED_LIMIT || '1mb' }));

// Health check (exempt from rate limiting -- Cloud Run sends frequent probes)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api', limiter);
app.use('/api/kyc', kycRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportLimiter, supportRoutes);
app.use('/api/mint-requests', mintRequestRoutes);
app.use('/api/security-token-requests', securityTokenRequestRoutes);
app.use('/api/deployments', deploymentRoutes);
app.use('/api/v1/contracts/deployments', deploymentRoutes);
app.use('/api/market-data', marketDataRoutes);
app.use('/api/v1/nav', navRoutes);

// Global error handler
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Graceful shutdown -- close PrismaClient pool so connections are not leaked
// ---------------------------------------------------------------------------

function gracefulShutdown(signal: string) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  prisma.$disconnect().then(() => {
    console.log('Prisma disconnected.');
    process.exit(0);
  }).catch((err) => {
    console.error('Error disconnecting Prisma:', err);
    process.exit(1);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start -- bind to 0.0.0.0 (required for Cloud Run / GCP)
app.listen(config.port, config.host, () => {
  console.log(`Fueki Backend running on ${config.host}:${config.port} [${config.nodeEnv}]`);
});

export default app;
