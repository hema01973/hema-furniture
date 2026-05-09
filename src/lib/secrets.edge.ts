// src/lib/secrets.edge.ts — HemaV071a
// Edge Runtime-safe subset of secrets.ts.
// middleware.ts runs on Edge Runtime which does NOT support:
//   - Node.js built-ins (async_hooks, crypto module, fs, etc.)
//   - CommonJS globals (module, require, __dirname)
//   - AWS SDK or any Node-only packages
// This file provides ONLY getSecretSync() reading from process.env,
// which is the only operation needed in middleware (JWT secret validation).

export type SecretName =
  | 'NEXTAUTH_SECRET'
  | 'MONGODB_URI'
  | 'REDIS_URL'
  | 'PAYMOB_API_KEY'
  | 'PAYMOB_HMAC_SECRET'
  | 'PAYMOB_INTEGRATION_ID'
  | 'PAYMOB_IFRAME_ID'
  | 'SMTP_USER'
  | 'SMTP_PASS'
  | 'CLOUDINARY_API_KEY'
  | 'CLOUDINARY_API_SECRET'
  | 'CLOUDINARY_CLOUD_NAME'
  | 'SENTRY_AUTH_TOKEN'
  | 'SLACK_WEBHOOK_URL'
  | 'CRON_SECRET'
  | 'METRICS_SECRET'
  | 'CSP_REPORT_URI'
  | 'MFA_ENCRYPTION_KEY'
  | 'AUDIT_HMAC_SECRET'
  | 'CLAIM_TOKEN_SECRET';

/**
 * Edge-safe synchronous secret reader.
 * Reads directly from process.env — no caching, no AWS SDK, no logger.
 * Safe for use in middleware Edge Runtime.
 */
export function getSecretSync(name: SecretName): string | undefined {
  return process.env[name];
}
