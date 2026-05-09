# 🛋️ Hema Modern Furniture — v15.0

> Enterprise-grade Next.js 15 e-commerce platform for Egyptian furniture retail.
> Built for high-traffic, real-money transactions, and zero tolerance for failure.

[![CI/CD](https://github.com/hema01973/hema-furniture/actions/workflows/ci.yml/badge.svg)](https://github.com/hema01973/hema-furniture/actions/workflows/ci.yml)
[![Security](https://img.shields.io/badge/OWASP%20Top%2010-covered-green)](./SECURITY.md)
[![Version](https://img.shields.io/badge/version-15.0.0-blue)](./CHANGELOG.md)

> **V015 Security Release** — All critical vulnerabilities from the audit resolved.
> See [CHANGELOG.md](./CHANGELOG.md) for the full list of fixes.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js 15 App Router                 │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  App (RSC)    │  │  API Routes  │  │  Middleware   │  │
│  │  /app         │  │  /api/v1     │  │  CSP, Auth   │  │
│  └───────┬───────┘  └──────┬───────┘  └──────────────┘  │
│          │                 │                              │
│  ┌───────▼─────────────────▼──────────────────────────┐  │
│  │              Service Layer                          │  │
│  │  product.service  order.service  (future: user..)  │  │
│  └───────────────────────┬────────────────────────────┘  │
│                           │                              │
│  ┌────────────────────────▼───────────────────────────┐  │
│  │              Infrastructure Layer                   │  │
│  │  mongodb.ts  redis.ts  logger.ts  circuit-breaker  │  │
│  └────────────────────────┬───────────────────────────┘  │
│                           │                              │
│  ┌────────────────────────▼───────────────────────────┐  │
│  │              External Services                      │  │
│  │  MongoDB Atlas  Redis  Paymob  Cloudinary  SMTP    │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

Circuit Breakers wrap: Paymob, Cloudinary, Email (SMTP)
Rate Limiting:         Redis sliding window (fail-closed on auth routes)
Logging:               Structured JSON → Axiom (production)
Correlation IDs:       Every request tagged via AsyncLocalStorage
```

---

## Quick Start

### Prerequisites
- Node.js 22+
- MongoDB (local or Atlas)
- Redis (local or Upstash)

### 1. Clone & Install

```bash
git clone https://github.com/hema01973/hema-furniture.git
cd hema-furniture
npm ci
```

### 2. Configure Environment

```bash
cp .env.example .env.local
# Edit .env.local with your values
# At minimum: MONGODB_URI, NEXTAUTH_SECRET
```

### 3. Seed Database

```bash
npm run seed
```

### 4. Run Development Server

```bash
npm run dev          # Turbopack (Next.js 15)
npm run worker       # Email queue worker (separate terminal)
```

---

## Production Deployment

### Option A — Vercel + Worker Host (Recommended for production)

> **⚠️ Important — Email Worker:** The BullMQ email worker (`npm run worker`) is a
> long-running Node.js process. Vercel Serverless Functions terminate after 10–30 s
> and **cannot** host it. You must deploy the worker separately.

**Vercel (Next.js app):**
```bash
# 1. Set all environment variables in Vercel dashboard (see .env.example)
# 2. Deploy
git push origin main  # CI/CD auto-deploys on merge to main
```

Key Vercel settings:
- Framework: Next.js
- Node.js: 22.x
- Build Command: `npm run build`
- Install Command: `npm ci`

**Worker — Option 1: Railway.app (simplest)**
```bash
# In Railway dashboard: New Project → Deploy from GitHub
# Set Start Command: npm run worker
# Add all env vars (same as Vercel, especially REDIS_URL and MONGODB_URI)
```

**Worker — Option 2: Fly.io**
```bash
fly launch --name hema-worker
# Edit fly.toml: set [processes] worker = "npm run worker"
fly deploy
```

**Worker — Option 3: Docker on your own VPS**
```bash
docker run -d   --name hema-worker   --env-file .env.production   hema-furniture:v023   sh -c "npm run worker"
```

> If the worker is not running, emails are queued in Redis and delivered when
> the worker restarts — no emails are lost as long as Redis has persistence.

### Option B — Docker

```bash
# Build
docker build -t hema-furniture:v023 .

# Run
docker run -d \
  --name hema \
  -p 3000:3000 \
  --env-file .env.production \
  hema-furniture:v023

# Health check
curl http://localhost:3000/api/healthz
```

### Option C — Docker Compose

```yaml
# docker-compose.yml (add to project root)
version: '3.9'  # docker-compose schema version (unchanged)
services:
  app:
    build: .
    ports: ['3000:3000']
    env_file: .env.production
    depends_on: [mongo, redis]
  mongo:
    image: mongo:7
    volumes: ['mongo_data:/data/db']
  redis:
    image: redis:7-alpine
    volumes: ['redis_data:/data']
volumes:
  mongo_data:
  redis_data:
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run lint` | ESLint v9 |
| `npm run typecheck` | TypeScript strict check |
| `npm test` | Unit + integration tests |
| `npm run test:cov` | Tests with coverage report |
| `npm run test:e2e` | Playwright E2E tests |
| `npm run seed` | Seed database |
| `npm run worker` | BullMQ email worker |
| `npm run analyze` | Bundle analyzer |

---

## API Reference

### Base URL
- Development: `http://localhost:3000/api`
- Production: `https://hemafurniture.com/api`

### Authentication
All protected endpoints require a valid NextAuth session cookie.

### Core Endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/api/products` | — | List products with filters |
| `GET` | `/api/products/:id` | — | Single product |
| `POST` | `/api/products` | admin/staff | Create product |
| `PUT` | `/api/products/:id` | admin/staff | Update product |
| `DELETE` | `/api/products/:id` | admin | Soft-delete product |
| `GET` | `/api/orders` | user | List user orders |
| `POST` | `/api/orders` | — | Create order |
| `GET` | `/api/orders/:id` | user | Single order |
| `POST` | `/api/auth/register` | — | Register user |
| `POST` | `/api/auth/forgot-password` | — | Request reset |
| `POST` | `/api/auth/reset-password` | — | Reset password |
| `POST` | `/api/auth/mfa/setup` | user | Setup TOTP MFA |
| `POST` | `/api/auth/mfa/verify` | — | Verify MFA code |
| `POST` | `/api/upload` | admin/staff | Upload images |
| `GET` | `/api/analytics` | admin/staff | Dashboard stats |
| `GET` | `/api/healthz` | — | Health check |
| `GET` | `/api/cron/cleanup` | cron | Daily cleanup |

### Standard Response Format

```json
{
  "success": true,
  "data": { ... },
  "pagination": {
    "page": 1,
    "limit": 12,
    "total": 150,
    "pages": 13
  }
}
```

Error response:
```json
{
  "success": false,
  "error": "Descriptive error message"
}
```

---

## Security

### Implemented Controls

| Control | Implementation |
|---------|---------------|
| Password hashing | `@node-rs/bcrypt` (cost 12) |
| MFA | TOTP via `otplib` |
| MFA backup codes | bcrypt-hashed (upgraded from SHA-256) |
| Session tokens | NextAuth JWT in HttpOnly cookies |
| Rate limiting | Redis sliding window, fail-closed on auth |
| HMAC verification | `crypto.timingSafeEqual` (timing-attack safe) |
| Input validation | Zod schemas on all API inputs |
| XSS protection | DOMPurify on all email content |
| CSP | strict-dynamic nonce-based (middleware) |
| CORS | Configured in next.config.js |
| Circuit breakers | Paymob, Cloudinary, Email |
| Env validation | Zod schema at startup |

### OWASP Top 10 Coverage

| # | Vulnerability | Status |
|---|--------------|--------|
| A01 | Broken Access Control | ✅ Role-based (`withAuth`) |
| A02 | Cryptographic Failures | ✅ bcrypt, timingSafeEqual |
| A03 | Injection | ✅ Mongoose + Zod validation |
| A04 | Insecure Design | ✅ Fail-closed rate limiting |
| A05 | Security Misconfiguration | ✅ Env validation, security headers |
| A06 | Vulnerable Components | ✅ npm audit in CI |
| A07 | Auth Failures | ✅ MFA, account lockout, bcrypt |
| A08 | Integrity Failures | ✅ HMAC webhook verification |
| A09 | Logging Failures | ✅ Structured JSON + Axiom |
| A10 | SSRF | ✅ allowedOrigins + CSP |

---

## Monitoring

### Health Check

```bash
curl https://hemafurniture.com/api/healthz
```

```json
{
  "status": "healthy",
  "version": "13.0.0",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "uptime": 3600,
  "checks": {
    "mongodb": { "status": "healthy", "latencyMs": 2 },
    "redis":   { "status": "healthy", "latencyMs": 1 },
    "circuits": {
      "paymob":     { "state": "CLOSED", "failures": 0 },
      "cloudinary": { "state": "CLOSED", "failures": 0 },
      "email":      { "state": "CLOSED", "failures": 0 }
    }
  }
}
```

### Logs
Production logs ship to **Axiom** in structured JSON with:
- `correlationId` — unique per request
- `level`, `time`, `service`, `version`
- `method`, `route`, `status`, `ip`

Set `AXIOM_TOKEN` and `AXIOM_DATASET` to enable.

---

## GitHub Secrets Required

Set these in `Settings → Secrets → Actions`:

```
MONGODB_URI_TEST     mongodb+srv://...  (test database)
NEXTAUTH_SECRET      <32+ char secret>
CODECOV_TOKEN        <from codecov.io>  (optional)
```

---

## Changelog

### v13.0.0
- ✅ Unified all file version headers to v13.0 across the entire codebase
- ✅ `tsconfig.json`: ES2017 → ES2022 (matches Node 22 runtime)
- ✅ `playwright.config.ts`: explicit PORT propagation — fixes silent E2E failures when port 3000 is occupied
- ✅ `sentry.edge.config.ts`: release tag aligned with client/server configs + PII filter added for Edge Runtime
- ✅ `admin/products/page.tsx`: added server-side pagination (was hardcoded limit=50 with no controls)
- ✅ `paymob/callback/route.ts`: replay-attack guard — rejects callbacks older than 7 days
- ✅ `package.json`: name/version corrected to `hema-v013` / `13.0.0`
- ✅ Secrets adapter (`secrets.ts`): hot-rotation support, Vault/AWS SM stubs
- ✅ Unified cache layer (`cache.ts`): Redis + LRU fallback with tag invalidation
- ✅ Dead Letter Queue: `listDeadLetters` / `replayDeadLetter` for failed emails
- ✅ Authz burst detection: admin alert on repeated denial attempts
- ✅ All P0–P1 issues from V011 refactor applied (see AUDIT_V011_REFACTOR.md)

### v3.8.0 — v12.x (historical)
- ✅ Next.js 15 + React 19 + TypeScript 5.7
- ✅ `nodemailer` 7.x
- ✅ `bcryptjs` → `@node-rs/bcrypt`
- ✅ `speakeasy` → `otplib`
- ✅ ESLint v9 flat config
- ✅ Hooks split into separate files
- ✅ Cron cleanup route

