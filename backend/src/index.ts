import './tracer';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { prisma } from './prisma';
import authRoutes from './routes/auth';
import kycRoutes from './routes/kyc';
import adminRoutes from './routes/admin';
import supportRoutes from './routes/support';
import mintRequestRoutes from './routes/mintRequests';
import deploymentRoutes from './routes/deployments';

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
  max: 500,                  // was 100 -- too low for a Cloud Run instance handling many users
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many requests, please try again later', code: 'RATE_LIMIT' } },
});
app.use(limiter);

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

const mintRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,                   // was 20
  message: {
    error: {
      message: 'Too many mint approval submissions, please try again later',
      code: 'RATE_LIMIT',
    },
  },
});

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health check (exempt from rate limiting -- Cloud Run sends frequent probes)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportLimiter, supportRoutes);
app.use('/api/mint-requests', mintRequestLimiter, mintRequestRoutes);
app.use('/api/deployments', limiter, deploymentRoutes);

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
});

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
