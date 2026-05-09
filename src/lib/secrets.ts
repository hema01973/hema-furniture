// src/lib/secrets.ts — HemaV066
// MED-04 FIX (V066): Vault provider now throws in ALL environments (fail-closed). Removed vault/gcp
//   from accepted Provider type — ADV-01 and MED-04. Operators selecting these get an error,
//   not a silent fallback to env vars.
// V063 FIX-MED-02: CRON_SECRET and METRICS_SECRET are now required in production.
// V061 NOTE: getSecretForVersion() is now INTEGRATED in auth.ts JWT callbacks.
//   - auth.ts embeds secretVersion in every issued JWT at sign-in.
//   - auth.ts validates secretVersion on every JWT refresh using getSecretForVersion().
//   - Tokens with expired secretVersion are rejected (forced re-authentication).
//   - NO fallback to legacy getPreviousSecret() in auth.ts — version-bound only.
//
// V060 FIXES:
//   - FIX-A: Persistent audit log — in-memory ring buffer replaced with MongoDB append-only writes
//   - FIX-A: Version-bound validation — getSecretForVersion() API for token↔secret version binding
//
// V059 FIXES (preserved):
//   - Key versioning system (versions stored per secret)
//   - Dual-key validation (grace period during rotation — old key valid for GRACE_PERIOD_MS)
//   - Safe rollback mechanism for failed rotations
//   - Rotation audit logging (every rotation event logged with timestamp, name, initiator)
//
// SECRETS MANAGEMENT DECISION (FIND-002): AWS Secrets Manager chosen over Vault.
// See V058 for full rationale. ACTIVATION: set SECRETS_PROVIDER=aws, AWS_REGION.

import { logger } from './logger';

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
  | 'AUDIT_HMAC_SECRET'   // HIGH-005 FIX (V069): added — required for audit log integrity (HMAC chain)
  | 'CLAIM_TOKEN_SECRET'  // MED-02 FIX (V066): dedicated secret for guest order claim tokens
  | 'NEWSLETTER_UNSUBSCRIBE_SECRET' // VULN-002 FIX (V068): dedicated secret for newsletter unsubscribe tokens
  | 'QSTASH_CURRENT_SIGNING_KEY'    // QStash webhook verification
  | 'QSTASH_NEXT_SIGNING_KEY';       // QStash webhook verification (rotation)

// Secrets that MUST exist in production — fail-closed if missing.
// MED-01 FIX (V043): REDIS_URL added as required in production.
// CRIT-01 FIX (V062): MFA_ENCRYPTION_KEY added as required in production.
//   Without it, TOTP secrets are stored plaintext in MongoDB — a DB breach allows
//   total MFA bypass for all users. Reference: OWASP ASVS §2.8.7.
// V063 FIX-MED-02: CRON_SECRET and METRICS_SECRET are now required in production.
// Both are the sole authentication mechanism for their respective endpoints.
// Missing values mean those endpoints have no authentication.
const REQUIRED_IN_PRODUCTION: ReadonlySet<SecretName> = new Set([
  'NEXTAUTH_SECRET',
  'MONGODB_URI',
  'REDIS_URL',
  'MFA_ENCRYPTION_KEY',
  'CRON_SECRET',         // V063 FIX-MED-02
  'METRICS_SECRET',      // V063 FIX-MED-02
  'AUDIT_HMAC_SECRET',   // HIGH-005 FIX (V069): required for audit log HMAC integrity chain.
                         // Without this, the entire audit trail can be tampered with — PCI-DSS violation.
]);

// ── V059: Grace period for dual-key validation during rotation ────────────────
// During rotation, the previous key is retained for GRACE_PERIOD_MS so that
// in-flight JWTs/sessions signed with the old key remain valid until expiry.
// After GRACE_PERIOD_MS the previous key is cleared automatically.
// 5 minutes covers worst-case JWT check interval + clock skew.
const GRACE_PERIOD_MS = 5 * 60 * 1000;

// ── V059: Versioned secret cache entry ────────────────────────────────────────
interface VersionedSecret {
  current:     string;
  currentAt:   number;  // Unix ms when current value was set
  version:     number;  // monotonically increasing; advances on every rotate/rollback
  previous?:   string;  // old value retained during grace period
  previousAt?: number;  // when the previous value was last valid (for grace expiry)
}

// ── V059: Rotation audit log ──────────────────────────────────────────────────
export interface RotationAuditEntry {
  name:      SecretName;
  version:   number;    // version number after this event
  rotatedAt: number;    // Unix ms
  initiator: string;    // 'aws-sm-lambda' | 'manual' | 'rollback:<user>'
  success:   boolean;
  error?:    string;
}

// V060 FIX-A: Persistent audit log — append-only MongoDB writes replace the
// in-memory ring buffer. The ring buffer was lost on process restart and provided
// no durability guarantee. MongoDB AuditLog collection is the source of truth.
// In-memory buffer kept ONLY as a hot read-cache for the last 100 entries so
// that /api/secrets/rotate can return recent events without a DB round-trip.
// Writes are fire-and-forget; a DB failure is logged but never throws, ensuring
// rotation itself is never blocked by audit write failures.
const _rotationAuditCache: RotationAuditEntry[] = [];
const MAX_AUDIT_CACHE = 100;

function appendRotationAudit(entry: RotationAuditEntry): void {
  // 1) Update hot read-cache (bounded ring, append-only semantics preserved)
  _rotationAuditCache.push(entry);
  if (_rotationAuditCache.length > MAX_AUDIT_CACHE) {
    _rotationAuditCache.splice(0, _rotationAuditCache.length - MAX_AUDIT_CACHE);
  }

  // 2) Persist to MongoDB (fire-and-forget, tamper-resistant append-only write)
  // Lazy import avoids circular-dep at module load (secrets ← mongodb ← secrets).
  // We intentionally do NOT upsert or update — every call is a fresh insert so
  // the collection is strictly append-only. A compromised process cannot DELETE
  // old entries without direct DB admin access.
  void (async () => {
    try {
      const { connectDB, SecretRotationAuditLog } = await import('./mongodb');
      await connectDB();
      await (SecretRotationAuditLog.create as any)({
        name:      entry.name,
        version:   entry.version,
        rotatedAt: new Date(entry.rotatedAt),
        initiator: entry.initiator,
        success:   entry.success,
        ...(entry.error ? { error: entry.error } : {}),
      });
    } catch (e) {
      // Audit write failure MUST NOT propagate — rotation must still succeed.
      // The in-memory cache still captured the event for the current process lifetime.
      logger.error('[Secrets] Audit DB write failed (event captured in cache only)', {
        name: entry.name, version: entry.version, error: String(e),
      });
    }
  })();
}

/** Read rotation audit log (hot-cache, last 100 events for the current process).
 *  For full history across restarts, query the SecretRotationAuditLog collection. */
export function getRotationAuditLog(): Readonly<RotationAuditEntry[]> {
  return _rotationAuditCache;
}

// 5-minute TTL for external re-fetch — short enough to pick up rotations.
const SECRET_TTL_MS = 5 * 60 * 1000;

const _cache = new Map<SecretName, VersionedSecret>();

// ── Provider abstraction ──────────────────────────────────────────────────────
// MED-04 / ADV-01 FIX (V066): Only 'env' and 'aws' are implemented.
// 'vault' and 'gcp' are removed — selecting them now throws (fail-closed) rather than
// silently reading from process.env, which masked misconfiguration.
type Provider = 'env' | 'aws';

function activeProvider(): Provider {
  const p = (process.env.SECRETS_PROVIDER ?? 'env').toLowerCase();
  // MED-04 / ADV-01 FIX (V066): Reject unimplemented providers with a clear error (fail-closed).
  // Previously vault/gcp silently fell back to process.env, masking misconfiguration.
  if (p === 'vault') throw new Error(
    '[Secrets] SECRETS_PROVIDER=vault is not implemented. ' +
    'Use SECRETS_PROVIDER=aws or SECRETS_PROVIDER=env.'
  );
  if (p === 'gcp') throw new Error(
    '[Secrets] SECRETS_PROVIDER=gcp is not implemented. ' +
    'Use SECRETS_PROVIDER=aws or SECRETS_PROVIDER=env.'
  );
  if (p === 'aws') return 'aws';
  return 'env';
}

// ── AWS Secrets Manager ───────────────────────────────────────────────────────
async function _fetchFromAWS(name: SecretName): Promise<string | undefined> {
  let mod: typeof import('@aws-sdk/client-secrets-manager');
  try {
    mod = await import('@aws-sdk/client-secrets-manager');
  } catch {
    const msg = '[Secrets] @aws-sdk/client-secrets-manager not installed. Run: npm i @aws-sdk/client-secrets-manager';
    if (process.env.NODE_ENV === 'production') { logger.error(msg); throw new Error(msg); }
    logger.warn(msg + ' Falling back to process.env (non-production only).');
    return undefined;
  }

  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
  if (!region) {
    const msg = '[Secrets] AWS_REGION is not set.';
    if (process.env.NODE_ENV === 'production') throw new Error(msg);
    logger.warn(msg + ' Falling back to process.env.');
    return undefined;
  }

  const client   = new mod.SecretsManagerClient({ region });
  const secretId = `hema/${name}`;

  try {
    const r = await client.send(new mod.GetSecretValueCommand({ SecretId: secretId }));
    const raw = r.SecretString;
    if (!raw) { logger.warn('[Secrets] AWS SM returned empty value', { secretId }); return undefined; }
    try { const p = JSON.parse(raw) as Record<string, string>; return p.value ?? raw; }
    catch { return raw; }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ResourceNotFoundException')) {
      logger.warn('[Secrets] Secret not found in AWS SM — falling back to env', { secretId });
      return undefined;
    }
    logger.error('[Secrets] AWS SM fetch failed', { secretId, error: msg });
    if (process.env.NODE_ENV === 'production') throw err;
    return undefined;
  }
}

// ── HashiCorp Vault stub (future use) ─────────────────────────────────────────
// MED-04 FIX (V066): _fetchFromVault is kept only as a dead-code tombstone.
// It is unreachable because activeProvider() now throws before we get here.
async function _fetchFromVault(name: SecretName): Promise<string | undefined> {
  // Throw in ALL environments — fail-closed, never silently fall back to env.
  throw new Error(
    `[Secrets] Vault provider is not implemented (name=${name}). ` +
    'Set SECRETS_PROVIDER=aws or remove SECRETS_PROVIDER to use env vars.'
  );
}

async function _fetchExternal(name: SecretName): Promise<string | undefined> {
  // Provider type is 'env' | 'aws' — activeProvider() throws on 'vault'/'gcp' before reaching here.
  // _fetchFromVault is kept as a dead-code tombstone (MED-04 / ADV-01 fix V066).
  const provider = activeProvider();
  if (provider === 'aws') return _fetchFromAWS(name);
  return undefined;
}

// ── OPS-003: Secrets that must NEVER fall back to env in aws-mode production ──
const MUST_USE_SECRETS_MANAGER: ReadonlySet<SecretName> = new Set([
  'NEXTAUTH_SECRET',
  'MONGODB_URI',
  'PAYMOB_API_KEY',
  'PAYMOB_HMAC_SECRET',
  'SMTP_PASS',
  'CLOUDINARY_API_SECRET',
]);

// ── Public API ────────────────────────────────────────────────────────────────

/** Fetch a secret — caches per-name for 5 minutes. */
export async function getSecret(name: SecretName): Promise<string | undefined> {
  const cached = _cache.get(name);
  if (cached && Date.now() - cached.currentAt < SECRET_TTL_MS) return cached.current;

  const external = await _fetchExternal(name);

  const isProd    = process.env.NODE_ENV === 'production';
  const isAwsMode = activeProvider() === 'aws';
  if (isProd && isAwsMode && !external && MUST_USE_SECRETS_MANAGER.has(name)) {
    throw new Error(
      `[Secrets] OPS-003: Secret "${name}" must come from AWS Secrets Manager in production ` +
      `(SECRETS_PROVIDER=aws is set). Refusing to fall back to plaintext environment variable. ` +
      `Ensure the secret exists at path "hema/${name}" in AWS SM.`
    );
  }

  const value = external ?? process.env[name];

  if (!value) {
    if (isProd && REQUIRED_IN_PRODUCTION.has(name)) {
      throw new Error(`[Secrets] required secret "${name}" is not configured (provider=${activeProvider()})`);
    }
    return undefined;
  }

  if (!cached) {
    _cache.set(name, { current: value, currentAt: Date.now(), version: 1 });
  } else {
    _cache.set(name, { ...cached, current: value, currentAt: Date.now() });
  }
  logger.debug('[Secrets] read', { name, provider: external ? activeProvider() : 'env' });
  return value;
}

/**
 * V059: getPreviousSecret — returns the previous value during the grace period.
 * Used by JWT/session validation to accept tokens signed with the old key
 * during a rotation event. Returns undefined if outside the grace period.
 *
 * Usage in auth.ts:
 *   const secret = getSecretSync('NEXTAUTH_SECRET') ?? '';
 *   const previous = getPreviousSecret('NEXTAUTH_SECRET');
 *   // try verify with `secret`, fallback to `previous` if within grace period
 */
export function getPreviousSecret(name: SecretName): string | undefined {
  const cached = _cache.get(name);
  if (!cached?.previous || !cached.previousAt) return undefined;
  // Grace period is measured from when the PREVIOUS value was active,
  // which is the same as when the CURRENT value was set (currentAt).
  if (Date.now() - cached.currentAt > GRACE_PERIOD_MS) return undefined;
  return cached.previous;
}

/**
 * V059: getSecretVersion — returns the current version number for a secret.
 * Starts at 1, increments on every rotateSecret() or rollbackSecret() call.
 */
export function getSecretVersion(name: SecretName): number {
  return _cache.get(name)?.version ?? 0;
}

/**
 * V060 FIX-A: getSecretForVersion — version-bound secret retrieval.
 *
 * Replaces pure time-based grace period logic with explicit version checks.
 * Caller passes the `secretVersion` embedded in the JWT/session token at
 * signing time. This function returns the matching secret value so the
 * verifier can validate without relying solely on the 5-minute clock window.
 *
 * Rules:
 *   - tokenVersion === currentVersion  → return current secret
 *   - tokenVersion === currentVersion-1 AND within GRACE_PERIOD_MS → return previous secret
 *   - Otherwise → return undefined (token must be rejected)
 *
 * Usage in auth.ts:
 *   const secretValue = getSecretForVersion('NEXTAUTH_SECRET', token.secretVersion);
 *   if (!secretValue) return null; // reject — version mismatch outside grace window
 */
export function getSecretForVersion(name: SecretName, tokenVersion: number): string | undefined {
  const cached = _cache.get(name);
  if (!cached) return undefined;

  // Exact version match — current key
  if (tokenVersion === cached.version) return cached.current;

  // One version behind — previous key, only within grace period
  if (
    tokenVersion === cached.version - 1 &&
    cached.previous &&
    cached.currentAt &&
    Date.now() - cached.currentAt <= GRACE_PERIOD_MS
  ) {
    return cached.previous;
  }

  // Version too old or too far ahead — reject
  return undefined;
}

/**
 * Synchronous variant for edge runtime / hot paths.
 * Reads from cache or process.env — does NOT call external providers.
 * Ensure getSecret() has been called at startup to prime the cache.
 */
export function getSecretSync(name: SecretName): string | undefined {
  const cached = _cache.get(name);
  if (cached) return cached.current;
  const v = process.env[name];
  if (!v && process.env.NODE_ENV === 'production' && REQUIRED_IN_PRODUCTION.has(name)) {
    throw new Error(`[Secrets] required secret "${name}" is not configured (provider=${activeProvider()})`);
  }
  if (v) _cache.set(name, { current: v, currentAt: Date.now(), version: 1 });
  return v;
}

/**
 * V059: Hot-rotate a secret without restart.
 * Implements dual-key grace period: the previous key remains retrievable via
 * getPreviousSecret() for GRACE_PERIOD_MS (5 min) so that in-flight sessions
 * signed with the old key continue to validate until the grace period expires.
 *
 * Called by /api/secrets/rotate (AWS SM rotation Lambda webhook).
 * Every call emits a structured rotation audit log entry.
 *
 * This does NOT break MFA sessions or active tokens — auth.ts should consult
 * getPreviousSecret() for dual-key validation during the grace period.
 */
export function rotateSecret(
  name:      SecretName,
  newValue:  string,
  initiator  = 'aws-sm-lambda',
): void {
  try {
    const existing   = _cache.get(name);
    const newVersion = (existing?.version ?? 0) + 1;
    const versioned: VersionedSecret = {
      current:    newValue,
      currentAt:  Date.now(),
      version:    newVersion,
      previous:   existing?.current,   // retain old value for grace period
      previousAt: existing?.currentAt, // record when the old value was last current
    };
    _cache.set(name, versioned);

    appendRotationAudit({
      name,
      version:   newVersion,
      rotatedAt: Date.now(),
      initiator,
      success:   true,
    });

    logger.info('[Secrets] rotated', {
      name,
      version:        newVersion,
      initiator,
      gracePeriodMs:  GRACE_PERIOD_MS,
      hasPreviousKey: Boolean(versioned.previous),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    appendRotationAudit({
      name,
      version:   (_cache.get(name)?.version ?? 0),
      rotatedAt: Date.now(),
      initiator,
      success:   false,
      error,
    });
    logger.error('[Secrets] rotation failed', { name, initiator, error });
    throw err;
  }
}

/**
 * V059: rollbackSecret — revert to the previous value if a rotation caused failures.
 * Throws if no previous value is available in cache.
 * Logs a rollback audit entry.
 *
 * Typical usage: operator calls /api/secrets/rotate with action='rollback' after
 * detecting that a rotated secret is causing authentication failures.
 */
export function rollbackSecret(name: SecretName, initiator = 'operator'): void {
  const cached = _cache.get(name);
  if (!cached?.previous) {
    throw new Error(`[Secrets] Cannot rollback "${name}": no previous value is cached. ` +
      `Rollback is only possible within ${GRACE_PERIOD_MS / 1000}s of the last rotation.`);
  }
  const fromVersion = cached.version;
  const toVersion   = fromVersion + 1;

  // Swap current ↔ previous. We do NOT carry the old-previous forward —
  // rollback is a one-shot recovery action, not an undo stack.
  _cache.set(name, {
    current:    cached.previous,
    currentAt:  Date.now(),
    version:    toVersion,
    previous:   undefined,
    previousAt: undefined,
  });

  appendRotationAudit({
    name,
    version:   toVersion,
    rotatedAt: Date.now(),
    initiator: `rollback:${initiator}`,
    success:   true,
  });

  logger.warn('[Secrets] rolled back', {
    name,
    fromVersion,
    toVersion,
    initiator,
  });
}

/** Test-only — do NOT call from app code. */
export function setSecretForTest(name: SecretName, value: string): void {
  if (process.env.NODE_ENV === 'production') throw new Error('[Secrets] setSecretForTest is forbidden in production');
  _cache.set(name, { current: value, currentAt: Date.now(), version: 1 });
}

/** Clear all cached secrets (hot-reload + tests). */
export function clearSecretCache(): void { _cache.clear(); }

// Clear cache on Next.js hot-reload in development.
// NOTE: module.hot is CommonJS-only and not available in Edge Runtime.
// Hot-reload cache clearing is handled by process lifecycle in Edge environments.
if (process.env.NODE_ENV === 'development' && typeof module !== 'undefined') {
  const _mod = module as unknown as { hot?: { dispose: (fn: () => void) => void } };
  if (_mod.hot?.dispose) _mod.hot.dispose(() => { clearSecretCache(); });
}
