// src/... — HemaV050: FIX #10 — raised PAYMOB_HMAC_SECRET & METRICS_SECRET minimum to 32 chars
// FIX #1: Added blocklist of known-insecure placeholder values.
//         Any secret matching a placeholder causes process.exit(1) at startup.
// FIX #10: MongoDB URI in production must include credentials.
// FIX #7: TRUST_PROXY validated as boolean string.
import { z } from 'zod';

// ── Known-insecure placeholder blocklist ──────────────────────────────────────
const BANNED_SECRETS = new Set([
  'replace-with-32-char-random-string-aaaaaaaa',
  'replace-with-32-char-random-string-bbbbbbbb',
  'replace-with-32-char-random-string',
  'your-secret-here',
  'changeme',
  'secret',
  'password',
  'nextauth_secret',
  'session_secret',
  'example',
  'test',
  '12345678901234567890123456789012',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
]);

function strongSecret(label: string) {
  return z
    .string({ required_error: `${label} is required — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` })
    .min(32, `${label} must be ≥ 32 characters`)
    .refine(
      (v) => !BANNED_SECRETS.has(v.toLowerCase().trim()),
      `${label} matches a known-insecure placeholder. Generate a new value:\n  node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
    );
}

// ── Schema ────────────────────────────────────────────────────────────────────
const schema = z.object({
  // ── Runtime
  NODE_ENV:             z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_URL:  z.string().url('NEXT_PUBLIC_APP_URL must be a valid URL')
                          .default('http://localhost:3000'),

  // ── Database (REQUIRED) — FIX #10: credentials enforced in production
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required')
    .refine(v => v.startsWith('mongodb'), 'Must be a MongoDB URI')
    .refine(
      (v) => {
        if (process.env.NODE_ENV !== 'production') return true;
        // Production: must include user:pass@host
        return /mongodb(\+srv)?:\/\/[^:]+:[^@]+@/.test(v);
      },
      'MONGODB_URI must include credentials (user:password@host) in production. ' +
      'Example: mongodb://hema_user:STRONG_PASS@mongo:27017/hema?authSource=admin'
    ),
  MONGODB_POOL_SIZE:    z.coerce.number().int().min(1).max(200).default(10),
  MONGODB_SELECTION_MS: z.coerce.number().int().min(1000).default(10_000),
  MONGODB_SOCKET_MS:    z.coerce.number().int().min(5000).default(45_000),

  // ── Auth (REQUIRED) — FIX #1: strong secret enforcement
  NEXTAUTH_SECRET: strongSecret('NEXTAUTH_SECRET'),
  // Hema033 FIX [HIGH-02]: NEXTAUTH_URL must be set in production to prevent
  // Host Header Injection attacks on auth emails (password reset links etc.)
  NEXTAUTH_URL:    z.string().url().optional(),

  // ── Redis
  REDIS_URL:                 z.string().url().optional(),
  RATE_LIMIT_MAX:            z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(10).default(60),
  // MED-04 FIX (V067): Validate PV_CACHE_TTL_SEC as a proper integer — previously
  // accepted non-numeric strings like "abc" without rejection.
  PV_CACHE_TTL_SEC: z.coerce
    .number({ invalid_type_error: 'PV_CACHE_TTL_SEC must be a valid integer' })
    .int('PV_CACHE_TTL_SEC must be an integer')
    .positive('PV_CACHE_TTL_SEC must be positive')
    .default(30),

  // ── Auth secrets
  // MED-06 FIX (V067): Separate CSRF_SECRET for independent rotation from NEXTAUTH_SECRET.
  // Fallback to NEXTAUTH_SECRET for backward compat (see csrf.ts).
  CSRF_SECRET: z.string().min(32, 'CSRF_SECRET must be at least 32 characters').optional(),

  // ── Email
  SMTP_HOST:         z.string().min(1).default('smtp.gmail.com'),
  SMTP_PORT:         z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER:         z.string().email().optional(),
  SMTP_PASS:         z.string().min(1).optional(),
  EMAIL_FROM:        z.string().default('"Hema Furniture" <no-reply@hemafurniture.com>'),
  ADMIN_ALERT_EMAIL: z.string().email().optional(),

  // ── Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY:    z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),

  // ── Paymob
  PAYMOB_API_KEY:        z.string().min(1).optional(),
  PAYMOB_INTEGRATION_ID: z.coerce.number().int().optional(),
  PAYMOB_IFRAME_ID:      z.string().min(1).optional(),
  PAYMOB_HMAC_SECRET:    z.string().min(32, 'PAYMOB_HMAC_SECRET must be ≥ 32 chars for adequate HMAC security').optional(),

  // ── Sentry
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  SENTRY_ORG:             z.string().optional(),
  SENTRY_PROJECT:         z.string().optional(),
  SENTRY_AUTH_TOKEN:      z.string().optional(),

  // ── Cron
  CRON_SECRET: z.string().min(32, 'CRON_SECRET must be ≥ 32 chars').optional(),

  // ── Logging
  LOG_LEVEL:                z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  BETTERSTACK_SOURCE_TOKEN: z.string().optional(),
  AXIOM_TOKEN:              z.string().optional(),
  AXIOM_DATASET:            z.string().optional(),
  // V039 SECURITY FIX [LOW-02]: enforce 30-day minimum at schema validation time so
  // operators cannot silently set a short TTL and be surprised by the 90-day fallback.
  AUDIT_LOG_TTL_SECONDS: z.coerce.number().int()
    .min(30 * 24 * 3600, 'AUDIT_LOG_TTL_SECONDS must be at least 30 days (2592000 seconds)')
    .optional(),

  // ── Alerting
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  METRICS_SECRET:    z.string().min(32, 'METRICS_SECRET must be ≥ 32 chars').optional(),
  BACKUP_S3_BUCKET:  z.string().optional(),

  // ── Google
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: z.string().optional(),
  GOOGLE_CLIENT_ID:     z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // ── Proxy — FIX #7
  TRUST_PROXY: z.string().default('false').transform(v => v === 'true'),

  // ── MFA Encryption (CRIT-01 FIX V062) ──────────────────────────────────────
  // AES-256-GCM key for TOTP secret at-rest encryption. REQUIRED in production.
  // Without it, MFA secrets are stored plaintext — a DB breach allows full MFA bypass.
  // Reference: OWASP ASVS §2.8.7
  // Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  MFA_ENCRYPTION_KEY: process.env.NODE_ENV === 'production'
    ? z.string()
        .min(1, 'MFA_ENCRYPTION_KEY is REQUIRED in production (OWASP ASVS §2.8.7)')
        .regex(/^[0-9a-fA-F]{64}$/, 'MFA_ENCRYPTION_KEY must be exactly 64 hex characters (256-bit key)')
    : z.string()
        .regex(/^[0-9a-fA-F]{64}$/, 'MFA_ENCRYPTION_KEY must be exactly 64 hex characters if set')
        .optional(),

  // ── QStash (CRIT-02 FIX V062) ───────────────────────────────────────────────
  // REQUIRED in production: in-process queue loses all queued emails on restart/deploy.
  // On Vercel, cold starts and restarts are frequent — use QStash for durability.
  // Without QSTASH_TOKEN, password-reset and order-confirmation emails may be silently lost.
  QSTASH_TOKEN: process.env.NODE_ENV === 'production'
    ? z.string().min(1, 'QSTASH_TOKEN is REQUIRED in production — durable email queue. ' +
        'Without it, queued emails (order confirmations, password resets) are lost on restart/deploy. ' +
        'Get a token at https://upstash.com/docs/qstash')
    : z.string().optional(),

  // ── Secrets rotation webhook ─────────────────────────────────────────────────
  // Required when SECRETS_PROVIDER=aws and AWS SM rotation is active.
  // Without this, /api/secrets/rotate is unprotected (it refuses all calls,
  // but the endpoint exists and returns 401 for every request — a potential
  // info-leak and brute-force surface in production).
  ROTATION_WEBHOOK_SECRET: z.string().min(32, 'ROTATION_WEBHOOK_SECRET must be ≥ 32 chars').optional(),
  QSTASH_URL:   z.string().url().default('https://qstash.upstash.io/v2/publish/'),
  EMAIL_WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(5),

}).superRefine((data, ctx) => {
  // Hema033 FIX [HIGH-02]: NEXTAUTH_URL is required in production to prevent
  // Host Header Injection — without it NextAuth infers the base URL from the
  // incoming request's Host header, which an attacker can spoof.
  if (data.NODE_ENV === 'production' && !data.NEXTAUTH_URL) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['NEXTAUTH_URL'],
      message: 'NEXTAUTH_URL must be set in production — missing it allows Host Header Injection in auth emails.' });
  }

  // Cloudinary: all-or-nothing
  const cloudKeys = [data.CLOUDINARY_CLOUD_NAME, data.CLOUDINARY_API_KEY, data.CLOUDINARY_API_SECRET];
  const cloudSet  = cloudKeys.filter(Boolean).length;
  if (cloudSet > 0 && cloudSet < 3) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Cloudinary requires all three: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET' });
  }

  // Paymob: all-or-nothing
  const paymobKeys = [data.PAYMOB_API_KEY, data.PAYMOB_INTEGRATION_ID, data.PAYMOB_IFRAME_ID, data.PAYMOB_HMAC_SECRET];
  const paymobSet  = paymobKeys.filter(v => v !== undefined && v !== null).length;
  if (paymobSet > 0 && paymobSet < 4) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Paymob requires all four: PAYMOB_API_KEY, PAYMOB_INTEGRATION_ID, PAYMOB_IFRAME_ID, PAYMOB_HMAC_SECRET' });
  }

  // Paymob HMAC mandatory in production
  if (data.NODE_ENV === 'production' && data.PAYMOB_API_KEY && !data.PAYMOB_HMAC_SECRET) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['PAYMOB_HMAC_SECRET'], message: 'PAYMOB_HMAC_SECRET is REQUIRED in production. Without it, all payment webhooks fail HMAC verification.' });
  }

  // MED-01 FIX (V043): Redis is now REQUIRED in production (upgraded from warning to error).
  // Without Redis, rate limiting falls back to per-instance in-memory counters.
  // On multi-instance deployments (Vercel), each instance has an independent counter,
  // allowing N × rateMax attempts before lockout — completely bypassing brute-force protection.
  // Set REDIS_URL to a Redis or Upstash connection string.
  if (data.NODE_ENV === 'production' && !data.REDIS_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['REDIS_URL'],
      message:
        'REDIS_URL is required in production. Without Redis, rate limiting is per-instance ' +
        'and ineffective on multi-instance deployments (Vercel). ' +
        'Set REDIS_URL to a Redis or Upstash connection string.',
    });
  }

  // FIX #9 (V030): warn loudly when security-critical secrets are absent in production.
  // Without CRON_SECRET, the cron cleanup endpoint is wide open to anyone.
  // Without METRICS_SECRET, the Prometheus metrics endpoint (uptime, memory, version)
  // is readable by anyone who can reach the server.
  if (data.NODE_ENV === 'production' && !data.CRON_SECRET) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['CRON_SECRET'], message: 'CRON_SECRET is not set in production — the /api/cron/cleanup endpoint is unprotected and can be triggered by anyone.' });
  }
  if (data.NODE_ENV === 'production' && !data.METRICS_SECRET) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['METRICS_SECRET'], message: 'METRICS_SECRET is not set in production — the /api/metrics endpoint exposes version, memory, and circuit-breaker data without authentication.' });
  }
  // V057 FIX: ROTATION_WEBHOOK_SECRET is required in production when SECRETS_PROVIDER=aws.
  // Without it, the /api/secrets/rotate endpoint silently refuses all rotation calls
  // (isAuthorized() returns false when secret is undefined), meaning AWS SM rotations
  // fail silently and secrets become stale. Operators must know this endpoint needs a secret.
  if (data.NODE_ENV === 'production' && (process.env.SECRETS_PROVIDER ?? 'env') === 'aws' && !data.ROTATION_WEBHOOK_SECRET) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ROTATION_WEBHOOK_SECRET'],
      message: 'ROTATION_WEBHOOK_SECRET is required in production when SECRETS_PROVIDER=aws. ' +
               'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"' });
  }


  // ADV-02 FIX (V067): Warn on ALL production deployments when ROTATION_WEBHOOK_SECRET
  // is absent — regardless of SECRETS_PROVIDER.
  if (data.NODE_ENV === 'production' && !data.ROTATION_WEBHOOK_SECRET) {
    console.warn(
      '[SECURITY WARNING] ROTATION_WEBHOOK_SECRET is not set. ' +
      'The /api/secrets/rotate endpoint will silently reject all requests.',
    );
  }
  // V046: QStash is OPTIONAL. When QSTASH_TOKEN is absent the system falls
  // back to the in-process retry queue (exponential backoff, up to 5 attempts).
  // Set QSTASH_TOKEN to enable durable serverless queuing via Upstash QStash.
  // No Upstash account is required to run the application.

  // V045: AUDIT_LOG_TTL_SECONDS mandatory in production
  if (data.NODE_ENV === 'production' && !data.AUDIT_LOG_TTL_SECONDS) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['AUDIT_LOG_TTL_SECONDS'], message: 'AUDIT_LOG_TTL_SECONDS is REQUIRED in production. Defaulting to 30 days is not allowed for compliance.' });
  }
});

export type Env = z.infer<typeof schema>;

// ── Singleton with fail-fast validation ───────────────────────────────────────
let _validated: Env | null = null;

export function env(): Env {
  if (_validated) return _validated;

  const result = schema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors
      .map(e => `  ❌  ${e.path.join('.')}: ${e.message}`)
      .join('\n');

    const message =
      `\n\n🚨  Environment validation FAILED — the server cannot start safely:\n\n${errors}\n\n` +
      `Fix the above variables in your .env.local file.\n` +
      `Generate secrets with: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"\n`;

    // In production: crash immediately so no request is served with bad config
    if (process.env.NODE_ENV === 'production') {
      console.error(message);
      process.exit(1);
    }

    throw new Error(message);
  }

  _validated = result.data;
  return _validated;
}

// ── Feature flags ─────────────────────────────────────────────────────────────
export const features = {
  get redis()      { return Boolean(process.env.REDIS_URL); },
  get cloudinary() { return Boolean(process.env.CLOUDINARY_API_KEY); },
  get paymob()     { return Boolean(process.env.PAYMOB_API_KEY); },
  get sentry()     { return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN); },
  get betterstack(){ return Boolean(process.env.BETTERSTACK_SOURCE_TOKEN); },
  get axiom()      { return Boolean(process.env.AXIOM_TOKEN && process.env.AXIOM_DATASET); },
};
