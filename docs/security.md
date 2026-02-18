# Fueki Tokenization Platform -- Security Audit Report

**Audit Date:** 2026-02-16
**Auditor:** Agent 2 (SecurityAuditor) -- Platform Audit
**Scope:** Full-stack security review covering frontend (React/Vite), backend (Express/Prisma), smart contracts (Solidity 0.8.20), and infrastructure configuration
**Overall Risk Rating:** CRITICAL

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Findings](#critical-findings)
3. [High Severity Findings](#high-severity-findings)
4. [Medium Severity Findings](#medium-severity-findings)
5. [Low Severity Findings](#low-severity-findings)
6. [Informational Findings](#informational-findings)
7. [Smart Contract Analysis](#smart-contract-analysis)
8. [Prioritized Remediation Roadmap](#prioritized-remediation-roadmap)

---

## Executive Summary

This audit examined the Fueki Tokenization Platform across its entire stack: React/TypeScript frontend, Express.js backend, Solidity smart contracts, and deployment infrastructure. The platform handles highly sensitive data (SSNs, identity documents, private keys) and manages real financial value through on-chain tokenization.

**The most critical finding is the exposure of production secrets -- including a deployer private key, JWT signing secrets, a database connection string with credentials, an encryption key protecting PII, and an Etherscan API key -- in plaintext `.env` files on the local filesystem.** While these files are listed in `.gitignore` and are not currently tracked by git, they represent an immediate, active risk to the deployed production system if this machine or repository is compromised.

### Finding Summary

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL | 3 | Exposed production secrets, insecure JWT fallback secrets, missing reentrancy guard in AssetBackedExchange |
| HIGH | 5 | JWT tokens in localStorage, SSN transmitted in plaintext over network, weak admin authorization, no account lockout, source maps in production |
| MEDIUM | 7 | CORS misconfiguration potential, missing CSP headers, no MIME type validation on upload, password policy gaps, unlimited token approvals, uninitialized reentrancy guard in AMM, refreshToken not sent on logout |
| LOW | 5 | Verbose error logging, file naming predictability, no password confirmation on sensitive actions, hardcoded fallback RPC URLs, no rate limit on KYC endpoints |
| INFORMATIONAL | 4 | Dependency versions, frontend validation only for certain checks, React strict mode considerations, Dockerfile improvements |

---

## Critical Findings

### C-01: Production Secrets Exposed in Plaintext .env Files

**CWE:** CWE-798 (Use of Hard-coded Credentials), CWE-312 (Cleartext Storage of Sensitive Information)
**Severity:** CRITICAL
**Affected Files:**
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/.env` (lines 2, 11, 14)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/backend/.env` (lines 4, 7-8, 11, 19, 28)

**Description:**
Both `.env` files contain production credentials in plaintext:

Root `.env`:
```
DEPLOYER_PRIVATE_KEY=c3374872bf85d68c295c2c593d38e2e3f1c8b9097efbfbaf044447f14b9db039
ETHERSCAN_API_KEY=2Y1H2ZB7DGNPIYSW24UJVEPTQ1MM8XNH47
VITE_API_URL=https://fueki-wallet-backend-production.up.railway.app
```

Backend `.env`:
```
DATABASE_URL=postgresql://fueki_user:M%40rk3771%24%21@localhost/fueki?host=/cloudsql/extreme-lodge-463919-d9:us-central1:fueki-db
JWT_ACCESS_SECRET=cc02bc972893ce1fa82304330691f86693b18dfa3a8c960a429ef865bfc115c0
JWT_REFRESH_SECRET=22c6643a99364d97728c56f9954c893823980a929d549da1efff72499099c45e
ENCRYPTION_KEY=ef5c58c32bec507818da30033f7edd400b795268236c5d03bb75dc6032ffbbd1
GCS_BUCKET=fueki-kyc-documents
ADMIN_EMAILS=mark@fueki-tech.com
```

While `.gitignore` correctly excludes `.env` files and they are not tracked by git, these secrets are on the developer's local machine. The deployer private key controls the wallet used to deploy mainnet contracts. If any backup, clone, or screen share exposes this file, all deployed contracts, user funds, and encrypted PII are compromised.

**Impact:**
- Deployer private key compromise: attacker can deploy malicious contracts impersonating the project, drain any ETH in the deployer wallet
- JWT secrets: attacker can forge arbitrary access/refresh tokens for any user
- Encryption key: attacker can decrypt all stored PII (SSNs, names, addresses, DOBs)
- Database URL: direct access to production PostgreSQL containing all user data
- GCS bucket name: targeted attack surface for cloud storage

**Proof of Concept:**
```javascript
// An attacker with the JWT_ACCESS_SECRET can forge tokens for any user:
const jwt = require('jsonwebtoken');
const forgedToken = jwt.sign(
  { userId: 'target-user-uuid' },
  'cc02bc972893ce1fa82304330691f86693b18dfa3a8c960a429ef865bfc115c0',
  { expiresIn: 900 }
);
// This token will pass authentication middleware
```

**Remediation:**
1. **IMMEDIATE:** Rotate ALL compromised secrets:
   - Generate a new deployer private key and transfer any assets
   - Generate new JWT access and refresh secrets
   - Generate a new encryption key and re-encrypt all stored PII
   - Change the database password
   - Regenerate the Etherscan API key
2. Use a secrets manager (GCP Secret Manager, HashiCorp Vault) in production
3. Never store production secrets on developer machines; use environment-specific configs
4. Add `.env` to a pre-commit hook that blocks commits containing secret-like patterns
5. Consider using `git-secrets` or `trufflehog` in CI/CD

---

### C-02: Hardcoded Insecure JWT Fallback Secrets

**CWE:** CWE-798 (Use of Hard-coded Credentials)
**Severity:** CRITICAL
**Affected File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/backend/src/config.ts` (lines 10-11)

**Description:**
The backend configuration uses hardcoded fallback values for JWT secrets when environment variables are not set:

```typescript
jwt: {
  accessSecret: process.env.JWT_ACCESS_SECRET || 'fueki-access-secret-change-in-production',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'fueki-refresh-secret-change-in-production',
  // ...
},
encryption: {
  key: process.env.ENCRYPTION_KEY || 'a'.repeat(64), // 32 bytes hex
  // ...
},
```

If the server starts without the `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` environment variables (e.g., misconfigured deployment, new environment, developer error), the application silently falls back to these publicly visible, trivially guessable secrets. The same applies to the encryption key, which defaults to `'aaa...a'` (64 `a` characters).

**Impact:**
- Any attacker who reads the source code can forge JWT tokens
- The encryption key fallback means all PII can be trivially decrypted if the env var is missing
- This is a silent failure -- no warning or startup check prevents the application from running with insecure defaults

**Remediation:**
```typescript
// backend/src/config.ts -- FAIL FAST if secrets are not configured
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `FATAL: Required environment variable ${name} is not set. ` +
      'Refusing to start with insecure defaults.'
    );
  }
  return value;
}

export const config = {
  // ...
  jwt: {
    accessSecret: requireEnv('JWT_ACCESS_SECRET'),
    refreshSecret: requireEnv('JWT_REFRESH_SECRET'),
    accessExpiresIn: 15 * 60,
    refreshExpiresIn: 7 * 24 * 60 * 60,
  },
  encryption: {
    key: requireEnv('ENCRYPTION_KEY'),
    algorithm: 'aes-256-gcm' as const,
  },
  databaseUrl: requireEnv('DATABASE_URL'),
  // ...
};
```

---

### C-03: Missing Reentrancy Guard on AssetBackedExchange

**CWE:** CWE-841 (Improper Enforcement of Behavioral Workflow)
**Severity:** CRITICAL
**Affected File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/contracts/AssetBackedExchange.sol` (lines 184, 221, 261)

**Description:**
Unlike `AssetExchange.sol` which implements a `nonReentrant` modifier, the `AssetBackedExchange.sol` contract has NO reentrancy protection on any of its functions: `fillOrder`, `fillOrderWithETH`, and `cancelOrder`. The `fillOrderWithETH` function (line 221) sends ETH to the maker via a low-level `call` (line 238) BEFORE completing its state changes:

```solidity
function fillOrderWithETH(uint256 orderId) external payable {
    // ... state updates (lines 234-235)
    order.filledBuy += fillAmountBuy;
    order.filledSell += fillAmountSell;

    // Send ETH to maker -- this enables reentrancy
    (bool sentToMaker,) = payable(order.maker).call{value: fillAmountBuy}("");
    if (!sentToMaker) revert TransferFailed();

    // Send sell tokens to taker
    bool ok = IERC20(order.tokenSell).transfer(msg.sender, fillAmountSell);
    if (!ok) revert TransferFailed();

    // Refund excess ETH to taker -- second external call
    if (msg.value > fillAmountBuy) {
        (bool refund,) = payable(msg.sender).call{value: msg.value - fillAmountBuy}("");
        // ...
    }
}
```

While the state updates happen before the external calls (checks-effects-interactions pattern is partially followed), the `fillOrder` function (line 184) makes an external call to `IERC20(order.tokenBuy).transferFrom()` followed by conditional ETH transfer or `IERC20(order.tokenSell).transfer()`. A malicious ERC-20 token's `transferFrom` or `transfer` callback could re-enter `fillOrder` or `cancelOrder`.

Similarly, `cancelOrder` (line 261) sends ERC-20 tokens to the maker without reentrancy protection. A malicious maker contract receiving tokens in `transfer()` could re-enter and cancel multiple orders.

**Impact:**
- A malicious maker contract could drain escrowed tokens through reentrancy on `fillOrderWithETH`
- A malicious ERC-20 token could exploit `fillOrder` callback to manipulate order state
- Potential loss of all funds held in escrow by the exchange contract

**Remediation:**
```solidity
// Add reentrancy guard (same pattern as AssetExchange.sol)
uint256 private constant _NOT_ENTERED = 1;
uint256 private constant _ENTERED = 2;
uint256 private _status = _NOT_ENTERED;

modifier nonReentrant() {
    require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
    _status = _ENTERED;
    _;
    _status = _NOT_ENTERED;
}

// Apply to all state-changing external functions:
function createOrder(...) external nonReentrant returns (uint256) { ... }
function createOrderSellETH(...) external payable nonReentrant returns (uint256) { ... }
function fillOrder(...) external nonReentrant { ... }
function fillOrderWithETH(...) external payable nonReentrant { ... }
function cancelOrder(...) external nonReentrant { ... }
function withdrawEth() external nonReentrant { ... }
```

---

## High Severity Findings

### H-01: JWT Tokens Stored in localStorage (XSS Token Theft)

**CWE:** CWE-922 (Insecure Storage of Sensitive Information)
**Severity:** HIGH
**Affected Files:**
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/store/authStore.ts` (lines 18-19, 27, 34-35, 138-139)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/lib/api/client.ts` (lines 4, 21, 80, 100)

**Description:**
Both the access token and refresh token are stored in `localStorage` under the key `fueki-auth-tokens`. `localStorage` is accessible to any JavaScript running on the same origin. If an XSS vulnerability exists anywhere in the application (or in any third-party dependency), an attacker can steal both tokens:

```typescript
// authStore.ts lines 138-139
saveToStorage(TOKENS_KEY, response.tokens);  // Stores to localStorage
saveToStorage(USER_KEY, response.user);
```

```typescript
// client.ts line 21
const raw = localStorage.getItem(AUTH_STORAGE_KEY);
```

While React's JSX escaping provides default XSS protection, any future use of `dangerouslySetInnerHTML`, a vulnerable dependency, or a stored XSS via API response could compromise all user sessions.

**Impact:**
- Any XSS vulnerability allows full account takeover
- Stolen refresh tokens allow persistent access (7 days) even after the user changes their password
- Tokens persist across browser sessions, increasing the window of exposure

**Remediation:**
1. Move refresh tokens to `httpOnly`, `Secure`, `SameSite=Strict` cookies set by the backend
2. Keep only the short-lived access token in memory (not `localStorage`)
3. On the backend, set the cookie in the login/refresh response:
```typescript
// Backend auth route
res.cookie('refreshToken', tokens.refreshToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/auth/refresh',
});
```
4. The frontend should read the access token from the login response (in memory) and let the refresh flow use the cookie automatically

---

### H-02: SSN Transmitted in Plaintext Over HTTPS (Sensitive Data in Request Body)

**CWE:** CWE-319 (Cleartext Transmission of Sensitive Information)
**Severity:** HIGH
**Affected Files:**
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/SignupPage.tsx` (line 468)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/lib/api/auth.ts` (line 50)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/backend/src/routes/kyc.ts` (line 26)

**Description:**
The SSN is collected on the frontend, sent as a plaintext JSON field in the request body to `/api/kyc/submit`, and only encrypted server-side. While HTTPS protects in transit, the SSN appears in:
- Browser developer tools (Network tab) in plaintext
- Any request logging middleware
- Server-side `console.error` on errors (line 46 of `kyc.ts`: `console.error('KYC submit error:', err)` which may include the request body in the error)
- Any reverse proxy or load balancer access logs that log request bodies
- Browser history (if the URL were to include it, though in this case it is POST body)

```typescript
// SignupPage.tsx line 468
await submitKYC({
  // ...
  ssn: identityValues.ssn,  // Raw SSN: "123-45-6789"
  // ...
});
```

The SSN is regex-validated on both frontend and backend (`/^\d{3}-?\d{2}-?\d{4}$/`), but is sent in the clear.

**Impact:**
- SSN visible in browser memory, dev tools, and potentially server logs
- Violates PCI DSS and SOC 2 requirements for handling PII
- Any intermediary (CDN, WAF, logging service) could capture the SSN

**Remediation:**
1. Encrypt the SSN client-side before transmission using a server-provided public key (RSA/ECDH key exchange)
2. Or implement client-side AES encryption with a session-derived key
3. At minimum, add middleware to scrub sensitive fields from server-side error logs:
```typescript
// Middleware to sanitize request bodies in logs
function sanitizeBody(body: any): any {
  if (!body) return body;
  const sanitized = { ...body };
  if (sanitized.ssn) sanitized.ssn = '***-**-' + sanitized.ssn.slice(-4);
  return sanitized;
}
```

---

### H-03: Weak Admin Authorization Model

**CWE:** CWE-863 (Incorrect Authorization)
**Severity:** HIGH
**Affected File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/backend/src/routes/admin.ts` (lines 9-20)

**Description:**
Admin access is determined by comparing the authenticated user's email against a comma-separated list in the `ADMIN_EMAILS` environment variable:

```typescript
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

async function requireAdmin(req: any, res: any, next: any) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    res.status(403).json({ error: { message: 'Admin access required', code: 'FORBIDDEN' } });
    return;
  }
  next();
}
```

Issues:
1. A new PrismaClient is instantiated on EVERY admin request (line 12-13), causing connection pool exhaustion
2. No `finally` block to disconnect the client
3. If `ADMIN_EMAILS` is empty (env var not set), the empty array check passes for ALL users since no email matches -- this is actually safe (denies all), but the inverse concern is:
4. Admin role is determined solely by email, which is user-controlled at registration. If an admin email is known, an attacker could register with that email before the legitimate admin does
5. No RBAC model -- the admin can approve/reject any KYC without audit trail beyond `reviewNotes`

**Impact:**
- Email-based authorization is fragile and bypassable
- Connection pool exhaustion under load
- No separation of duties or role hierarchy

**Remediation:**
```typescript
// 1. Use a shared Prisma client (singleton)
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// 2. Add a proper role column to the User model
// schema.prisma:
// model User {
//   role String @default("user") // user, admin, superadmin
// }

// 3. Check role from the database
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { role: true },
  });
  if (!user || user.role !== 'admin') {
    res.status(403).json({ error: { message: 'Admin access required', code: 'FORBIDDEN' } });
    return;
  }
  next();
}
```

---

### H-04: No Account Lockout or Brute-Force Protection on Login

**CWE:** CWE-307 (Improper Restriction of Excessive Authentication Attempts)
**Severity:** HIGH
**Affected File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/backend/src/index.ts` (lines 32-36)

**Description:**
While there is a rate limiter on auth endpoints (20 requests per 15 minutes), this is per-IP only. An attacker using distributed IPs (botnet, rotating proxies) can brute-force passwords indefinitely. There is no per-account lockout:

```typescript
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  // No keyGenerator -- defaults to IP-based limiting
});
```

20 attempts per 15 minutes per IP = approximately 1920 attempts per day per IP. With even a small botnet, millions of attempts are possible.

**Impact:**
- Password brute-force attacks against user accounts
- Credential stuffing attacks at scale
- No alerting or logging of failed attempts

**Remediation:**
1. Implement per-account rate limiting (track by email):
```typescript
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();

function checkAccountLockout(email: string): boolean {
  const record = loginAttempts.get(email);
  if (!record) return false;
  if (Date.now() - record.lastAttempt > 15 * 60 * 1000) {
    loginAttempts.delete(email);
    return false;
  }
  return record.count >= 5;
}
```
2. After 5 failed attempts, lock the account for 15 minutes
3. After 20 failed attempts, require email verification to unlock
4. Log all failed login attempts with timestamps for security monitoring
5. Consider implementing CAPTCHA after 3 failed attempts

---

### H-05: Source Maps Enabled in Production Build

**CWE:** CWE-615 (Inclusion of Sensitive Information in Source Code Comments), CWE-200 (Exposure of Sensitive Information)
**Severity:** HIGH
**Affected File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/vite.config.ts` (line 17)

**Description:**
The Vite configuration enables source maps for production builds:

```typescript
build: {
  target: 'es2020',
  sourcemap: true,  // Source maps shipped to production
},
```

Source maps expose the complete original TypeScript source code, including:
- Business logic and validation rules
- API endpoint URLs and structures
- Contract addresses and ABI references
- Authentication flow implementation details
- Internal comments and developer notes

**Impact:**
- Full source code disclosure to any user who opens browser dev tools
- Dramatically reduces the cost of finding vulnerabilities
- Exposes internal API structure, making targeted attacks easier

**Remediation:**
```typescript
// vite.config.ts
build: {
  target: 'es2020',
  sourcemap: process.env.NODE_ENV === 'development' ? true : 'hidden',
  // 'hidden' generates source maps for error reporting services
  // but does not include the //# sourceMappingURL comment
},
```

---

## Medium Severity Findings

### M-01: CORS Origin Not Validated for Production

**CWE:** CWE-346 (Origin Validation Error)
**Severity:** MEDIUM
**Affected File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/backend/src/config.ts` (line 22), `/Users/apple/Documents/GitHub/fueki-tokenization-platform/backend/src/index.ts` (lines 14-19)

**Description:**
The CORS origin defaults to `http://localhost:5173` in development, and the production `.env` has `CORS_ORIGIN=https://your-frontend-domain.web.app` -- a placeholder value that suggests the actual production domain may not be correctly configured.

Additionally, `withCredentials: false` is set on the frontend API client (line 12 of `client.ts`), which means cookies won't be sent cross-origin, but this also means the CORS configuration is partly redundant and may give false security assurance.

```typescript
cors: {
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
},
```

**Remediation:**
1. Use an allowlist of specific origins rather than a single wildcard-capable value
2. Validate the `CORS_ORIGIN` environment variable format at startup
3. Set `withCredentials: true` when migrating to cookie-based auth (per H-01)

---

### M-02: No Content Security Policy (CSP) Headers

**CWE:** CWE-1021 (Improper Restriction of Rendered UI Layers)
**Severity:** MEDIUM
**Affected Files:**
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/index.html` (no CSP meta tag)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/backend/src/index.ts` (line 13: `app.use(helmet())`)

**Description:**
While `helmet` is used on the backend (which sets various security headers), the frontend is a separate SPA served by a static file server (`serve` in Docker). The `serve` tool does not set CSP headers, and the `index.html` has no `<meta>` CSP tag. The backend's helmet CSP only applies to backend responses, not the frontend origin.

**Impact:**
- No defense against XSS attacks via injected scripts
- No restriction on which origins can load resources
- No frame-ancestors protection (clickjacking)

**Remediation:**
Add CSP to the frontend `index.html`:
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  connect-src 'self' https://fueki-wallet-backend-production.up.railway.app https://*.publicnode.com https://*.drpc.org;
  img-src 'self' data: blob:;
  font-src 'self';
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
">
```

---

### M-03: Missing Server-Side MIME Type Validation on Document Upload

**CWE:** CWE-434 (Unrestricted Upload of File with Dangerous Type)
**Severity:** MEDIUM
**Affected File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/backend/src/middleware/upload.ts` (lines 9-16)

**Description:**
The multer upload middleware only checks the `file.mimetype` field, which is client-provided and can be spoofed:

```typescript
fileFilter: (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, and PDF files are allowed'));
  }
},
```

An attacker can set `Content-Type: image/jpeg` on an arbitrary file (e.g., an executable, a polyglot file). The file is then encrypted and stored, so the immediate risk is limited, but if decrypted files are ever served to users or processed by server-side tools, this becomes exploitable.

**Remediation:**
```typescript
import { fileTypeFromBuffer } from 'file-type';

// After multer accepts the file, verify the magic bytes:
const type = await fileTypeFromBuffer(req.file.buffer);
const allowedMimes = ['image/jpeg', 'image/png', 'application/pdf'];
if (!type || !allowedMimes.includes(type.mime)) {
  return res.status(400).json({
    error: { message: 'Invalid file type detected', code: 'INVALID_TYPE' }
  });
}
```

---

### M-04: Password Policy Does Not Enforce Maximum Length or Complexity on Backend

**CWE:** CWE-521 (Weak Password Requirements)
**Severity:** MEDIUM
**Affected File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/backend/src/routes/auth.ts` (lines 12-14)

**Description:**
The backend validation only requires `min(8)`:
```typescript
const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
```

While the frontend enforces uppercase, lowercase, number, and special character requirements, these are trivially bypassed by calling the API directly. The backend accepts `aaaaaaaa` as a valid password.

Additionally, there is no maximum length check. Extremely long passwords (e.g., 1MB) could cause DoS through bcrypt's CPU-intensive hashing.

**Remediation:**
```typescript
const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be 128 characters or fewer')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[a-z]/, 'Must contain a lowercase letter')
    .regex(/[0-9]/, 'Must contain a number')
    .regex(/[^A-Za-z0-9]/, 'Must contain a special character'),
});
```

---

### M-05: Token Approval Patterns Allow Unlimited Approvals

**CWE:** CWE-863 (Incorrect Authorization)
**Severity:** MEDIUM
**Affected Files:**
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/lib/blockchain/contracts.ts` (lines 493-503, 822-831, 1054-1063)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/contracts/WrappedAsset.sol` (lines 148-153)

**Description:**
The `approveAsset`, `approveAssetBackedExchange`, and `approveAMM` methods accept an arbitrary `amount` parameter. If the UI passes `ethers.MaxUint256` (which is common in DeFi UIs for convenience), the user grants unlimited spending rights to the contract. The `WrappedAsset.sol` contract explicitly supports this pattern:

```solidity
if (currentAllowance != type(uint256).max) {
    if (currentAllowance < amount) revert InsufficientAllowance();
    unchecked {
        allowance[from][msg.sender] = currentAllowance - amount;
    }
}
```

If the exchange contract has a vulnerability, unlimited approvals mean the attacker can drain ALL of a user's tokens, not just the amount involved in the current trade.

**Impact:**
- Users may unknowingly grant unlimited token spending rights
- A single contract vulnerability can drain all approved tokens

**Remediation:**
1. Default to exact-amount approvals in the UI
2. Add a user-facing toggle for "exact" vs "unlimited" approval with clear warnings
3. After each trade, consider resetting the approval to 0

---

### M-06: LiquidityPoolAMM Reentrancy Guard Not Initialized in Storage Default

**CWE:** CWE-665 (Improper Initialization)
**Severity:** MEDIUM
**Affected File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/contracts/LiquidityPoolAMM.sol` (line 70)

**Description:**
The `_status` variable is declared but its default storage value is `0`, not `_NOT_ENTERED` (which is `1`):

```solidity
uint256 private _status;  // Default value: 0
uint256 private constant _NOT_ENTERED = 1;
uint256 private constant _ENTERED = 2;
```

The constructor sets it to `_NOT_ENTERED` (line 146), so this works correctly if constructed properly. However, if this contract were to be deployed as a proxy/implementation pattern without calling the constructor, `_status` would be `0`, and the `nonReentrant` modifier would always pass (since `0 != 2`). This is a latent risk for future upgrade patterns.

**Remediation:**
Initialize at declaration:
```solidity
uint256 private _status = 1; // _NOT_ENTERED
```

---

### M-07: Logout Does Not Send Refresh Token to Server

**CWE:** CWE-613 (Insufficient Session Expiration)
**Severity:** MEDIUM
**Affected Files:**
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/store/authStore.ts` (lines 172-176)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/lib/api/auth.ts` (lines 29-31)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/backend/src/routes/auth.ts` (lines 106-116)

**Description:**
On logout, the frontend calls `authApi.logout()` which sends a POST to `/api/auth/logout`, but the `auth.ts` API function does not include the refresh token in the request body:

```typescript
// Frontend: src/lib/api/auth.ts
export async function logout(): Promise<void> {
  await apiClient.post('/api/auth/logout');  // No body -- no refresh token sent
}
```

The backend expects `req.body.refreshToken` to invalidate the session:
```typescript
// Backend: routes/auth.ts
router.post('/logout', authenticate, async (req, res) => {
  const refreshToken = req.body.refreshToken;
  if (refreshToken) {
    await invalidateSession(refreshToken);
  }
  res.json({ success: true }); // Always succeeds even without token
});
```

Since no refresh token is sent, the session is never invalidated in the database. The refresh token remains valid for its full 7-day lifetime.

**Impact:**
- Stolen refresh tokens remain valid even after the user "logs out"
- The logout is purely cosmetic (client-side only)

**Remediation:**
```typescript
// Frontend: src/lib/api/auth.ts
export async function logout(): Promise<void> {
  const raw = localStorage.getItem('fueki-auth-tokens');
  const tokens = raw ? JSON.parse(raw) : {};
  await apiClient.post('/api/auth/logout', {
    refreshToken: tokens.refreshToken,
  });
}
```

---

## Low Severity Findings

### L-01: Verbose Server-Side Error Logging May Leak Sensitive Data

**CWE:** CWE-209 (Generation of Error Message Containing Sensitive Information)
**Severity:** LOW
**Affected Files:**
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/backend/src/routes/auth.ts` (lines 58, 100, 139)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/backend/src/routes/kyc.ts` (line 46)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/backend/src/index.ts` (line 54)

**Description:**
Multiple `console.error` calls log the full error object, which may contain request bodies with sensitive PII:

```typescript
console.error('Register error:', err);  // May include passwords in error context
console.error('KYC submit error:', err); // May include SSN, address, name
console.error('Unhandled error:', err);  // Catch-all may include anything
```

**Remediation:**
Use a structured logger that sanitizes sensitive fields:
```typescript
import { sanitize } from './utils/sanitize';
logger.error('Register failed', { error: err.message, stack: err.stack });
// Never log: req.body, passwords, SSNs, tokens
```

---

### L-02: Predictable File Naming for Encrypted KYC Documents

**CWE:** CWE-330 (Use of Insufficiently Random Values)
**Severity:** LOW
**Affected File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/backend/src/services/storage.ts` (line 38)

**Description:**
Encrypted document file names use `Date.now()` and the original filename:

```typescript
const fileName = `${Date.now()}-${file.originalname}.enc`;
const objectPath = `kyc-documents/${userId}/${fileName}`;
```

The original filename is preserved in the path, which may contain PII or identifying information (e.g., `john-doe-passport.jpg.enc`).

**Remediation:**
```typescript
const fileName = `${crypto.randomUUID()}.enc`;
```

---

### L-03: No Password Confirmation for Sensitive Account Actions

**CWE:** CWE-306 (Missing Authentication for Critical Function)
**Severity:** LOW
**Affected Files:** Backend admin routes

**Description:**
The admin KYC approval/rejection endpoints only require a valid JWT but do not require password re-confirmation. If an admin's session is hijacked, the attacker can approve fraudulent KYC applications without additional verification.

**Remediation:**
Require password re-entry for admin actions, or implement step-up authentication.

---

### L-04: Hardcoded Public RPC URLs as Fallbacks

**CWE:** CWE-798 (Use of Hard-coded Credentials)
**Severity:** LOW
**Affected Files:**
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/hardhat.config.cts` (lines 6-8)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/contracts/addresses.ts` (various)

**Description:**
Public RPC URLs are hardcoded as fallbacks. These endpoints have no SLA, may rate-limit aggressively, and could be replaced by malicious endpoints if DNS is compromised.

**Remediation:**
Use a dedicated RPC provider (Alchemy, Infura, QuickNode) with API keys stored as environment variables.

---

### L-05: No Rate Limiting on KYC Endpoints

**CWE:** CWE-770 (Allocation of Resources Without Limits)
**Severity:** LOW
**Affected File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/backend/src/index.ts` (line 49)

**Description:**
The KYC routes (`/api/kyc`) use the global rate limiter (100 req/15 min) but not the stricter auth limiter. Document upload is particularly expensive (memory storage, encryption, GCS upload) and could be abused for resource exhaustion.

```typescript
app.use('/api/auth', authLimiter, authRoutes);  // Stricter limit
app.use('/api/kyc', kycRoutes);                  // Only global limit
```

**Remediation:**
Apply a dedicated rate limiter to KYC endpoints:
```typescript
const kycLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
app.use('/api/kyc', kycLimiter, kycRoutes);
```

---

## Informational Findings

### I-01: React Frontend is Free of Common XSS Vectors

**Status:** PASS

The codebase was searched for `dangerouslySetInnerHTML`, `innerHTML`, `eval()`, `Function()`, and `document.write()` -- none were found. React's default JSX escaping provides strong XSS protection. All user inputs use controlled components with Zod validation. No URL parameters are rendered without sanitization.

---

### I-02: Encryption Implementation (AES-256-GCM) is Correctly Implemented

**Status:** PASS (with note)

The encryption service at `/Users/apple/Documents/GitHub/fueki-tokenization-platform/backend/src/services/encryption.ts` correctly:
- Uses AES-256-GCM (authenticated encryption)
- Generates random IVs for each operation (`crypto.randomBytes(16)`)
- Stores and validates the authentication tag
- Uses the `iv:authTag:ciphertext` format allowing proper decryption

**Note:** The 16-byte IV length is correct for GCM mode (12 bytes is recommended by NIST but 16 bytes is acceptable -- GCM internally converts to 12 bytes via GHASH). Consider using 12-byte IVs for alignment with NIST SP 800-38D recommendations.

---

### I-03: Smart Contract Follows Checks-Effects-Interactions Pattern

**Status:** PARTIAL PASS

`AssetExchange.sol` correctly implements:
- Reentrancy guard
- Checks-effects-interactions pattern (state updated before external calls)
- Safe token transfer wrappers handling both bool-returning and void-returning ERC-20s

`AssetBackedExchange.sol` follows checks-effects-interactions but LACKS a reentrancy guard (see C-03).

`LiquidityPoolAMM.sol` correctly implements reentrancy guards on all state-changing functions.

---

### I-04: Dockerfile Could Be Hardened

**Status:** INFORMATIONAL
**Affected File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/Dockerfile`

- The production stage runs as root (no `USER` directive)
- `npm install -g serve` runs as root and installs a package globally
- No health check is defined

**Remediation:**
```dockerfile
FROM node:22-slim
RUN addgroup --system app && adduser --system --ingroup app app
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
USER app
HEALTHCHECK --interval=30s CMD curl -f http://localhost:3000/ || exit 1
EXPOSE 3000
CMD ["sh", "-c", "serve -s dist -l tcp://0.0.0.0:${PORT:-3000}"]
```

---

## Smart Contract Analysis

### AssetExchange.sol
- **Reentrancy:** Protected via `nonReentrant` modifier. PASS.
- **Integer Overflow:** Solidity 0.8.20 has built-in overflow checks. Uses `unchecked` blocks only where underflow is mathematically impossible (post-check). PASS.
- **Access Control:** Only maker can cancel their own order. PASS.
- **Front-running:** Orders are vulnerable to front-running (standard for on-chain orderbooks). ACCEPTED RISK for this architecture.
- **Rounding:** `fillAmountSell = (fillAmountBuy * order.amountSell) / order.amountBuy` -- rounding favors the maker (rounds down the sell amount, so maker gives away less). Taker bears rounding loss. ACCEPTABLE.

### AssetBackedExchange.sol
- **Reentrancy:** NO protection. CRITICAL (see C-03).
- **ETH Handling:** Uses pull-pattern for cancelled ETH orders. GOOD.
- **Open `receive()`:** Contract accepts arbitrary ETH via `receive() external payable {}`. Any ETH sent directly (not through orderbook functions) is permanently locked. MEDIUM concern -- consider rejecting direct transfers or adding an admin withdrawal.

### WrappedAsset.sol / WrappedAssetFactory.sol
- **Access Control:** Only factory can mint. Immutable factory address. PASS.
- **Infinite Approval:** `type(uint256).max` approvals bypass allowance reduction. Standard ERC-20 pattern. ACCEPTABLE with UI warnings.
- **MintExceedsOriginalValue:** On-chain check prevents over-minting. PASS.

### LiquidityPoolAMM.sol
- **Reentrancy:** Protected. PASS.
- **First-deposit Attack:** Minimum liquidity of 1000 wei burned on first deposit prevents the classic inflation attack. PASS.
- **Price Manipulation:** Standard constant-product formula. Susceptible to sandwich attacks (inherent to AMM design). ACCEPTED RISK.
- **ETH Transfer in `_transferTokenOut`:** Direct ETH send to `msg.sender` via `call` inside `nonReentrant` function. Safe due to reentrancy guard.
- **kLast Update:** Updated after every operation. Used for informational purposes only (not for share calculation in this implementation). PASS.

---

## Prioritized Remediation Roadmap

### Phase 1: Immediate (0-48 hours) -- Critical

| Priority | Finding | Action |
|----------|---------|--------|
| 1 | C-01 | Rotate ALL production secrets (private key, JWT secrets, encryption key, DB password, API keys). Move to GCP Secret Manager. |
| 2 | C-02 | Remove fallback defaults from config.ts. Fail-fast on missing env vars. |
| 3 | C-03 | Deploy patched AssetBackedExchange with reentrancy guards. This requires a contract redeployment. |
| 4 | H-05 | Disable production source maps (`sourcemap: 'hidden'` or `false`). |

### Phase 2: Urgent (1 week) -- High

| Priority | Finding | Action |
|----------|---------|--------|
| 5 | H-01 | Migrate refresh tokens to httpOnly cookies. Keep access token in memory only. |
| 6 | H-04 | Implement per-account login rate limiting and lockout. |
| 7 | H-03 | Replace email-based admin auth with database role column + proper RBAC. |
| 8 | M-07 | Fix logout to send refresh token for server-side invalidation. |
| 9 | H-02 | Implement log sanitization for SSN and sensitive PII. Add client-side encryption for SSN. |

### Phase 3: Short-term (2-4 weeks) -- Medium

| Priority | Finding | Action |
|----------|---------|--------|
| 10 | M-02 | Implement Content Security Policy headers on the frontend. |
| 11 | M-04 | Mirror frontend password complexity rules on the backend validation schema. |
| 12 | M-03 | Add magic-byte MIME type verification for uploaded documents. |
| 13 | M-05 | Default to exact-amount token approvals in the UI with user toggle. |
| 14 | M-06 | Initialize `_status` at declaration in LiquidityPoolAMM. |
| 15 | M-01 | Validate and enforce CORS origin allowlist. |

### Phase 4: Ongoing -- Low / Hardening

| Priority | Finding | Action |
|----------|---------|--------|
| 16 | L-01 | Replace `console.error` with structured, sanitized logging (winston/pino). |
| 17 | L-02 | Use random UUIDs for encrypted document file names. |
| 18 | L-05 | Add dedicated rate limiter for KYC and upload endpoints. |
| 19 | L-03 | Implement step-up authentication for admin actions. |
| 20 | L-04 | Move to dedicated RPC provider with API keys. |
| 21 | I-04 | Harden Dockerfile (non-root user, healthcheck). |

---

*End of Security Audit Report*
*Generated by Agent 2 (SecurityAuditor) as part of the 15-agent Fueki Platform Audit*
