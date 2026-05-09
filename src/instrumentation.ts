// src/instrumentation.ts — HemaV066
// HIGH-04 FIX (V066): Eagerly warm the secrets cache at startup so getSecretSync() never
//   falls back to pre-rotation process.env values in cold-start Edge instances.
// Previously: src/instrumentation.ts — Next.js instrumentation hook for Sentry init
// Loaded once at server startup before any requests are handled

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // ✅ FIX: actually run env validation at startup (was defined but never invoked)
    try {
      const { env } = await import('./lib/env');
      env();
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      // In production refuse to start with invalid config
      if (process.env.NODE_ENV === 'production') process.exit(1);
    }

    // V059: LOW-03: Advisory log when ROTATION_WEBHOOK_SECRET is absent.
    // The V057 report accepted LOW-03 with the recommendation to add a general advisory
    // log at startup when the secret is absent (regardless of SECRETS_PROVIDER).
    // Without this warning, operators who expose /api/secrets/rotate without setting
    // the secret will silently have an unauthenticated (fail-closed but unprottected)
    // endpoint — no error is raised, only a 401 on every call. This advisory makes
    // the omission visible in the startup log before any request is served.
    if (process.env.NODE_ENV === 'production' && !process.env.ROTATION_WEBHOOK_SECRET) {
      console.warn(
        '[V058] ROTATION_WEBHOOK_SECRET is not set. ' +
        'The /api/secrets/rotate endpoint will refuse all rotation calls (fail-closed). ' +
        'If you do not use /api/secrets/rotate, this is safe. ' +
        'If you use AWS Secrets Manager hot-rotation, set ROTATION_WEBHOOK_SECRET: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }

    // HIGH-04 FIX (V066): Warm the secrets cache at startup so that getSecretSync() never
    // falls back to potentially-stale process.env values in a cold-start Edge instance.
    // Without this, a rolling deployment after a key rotation could mix old/new secrets
    // across instances, causing transient JWT verification failures.
    try {
      const { getSecret } = await import('./lib/secrets');
      await Promise.all([
        getSecret('NEXTAUTH_SECRET'),
        getSecret('MONGODB_URI'),
        getSecret('REDIS_URL'),
        getSecret('MFA_ENCRYPTION_KEY'),
        getSecret('CRON_SECRET'),
        getSecret('METRICS_SECRET'),
        getSecret('CLAIM_TOKEN_SECRET'), // MED-02 FIX (V066): warm claim token secret
      ]);
    } catch (e) {
      // Log but never block startup — missing optional secrets are handled per-route.
      console.warn('[Secrets] Startup cache warm-up encountered an error:', e instanceof Error ? e.message : String(e));
    }

    // Server-side Sentry init
    const { init, replayIntegration } = await import('@sentry/nextjs');

    init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      release: process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.npm_package_version ?? '0.66.0',

      // Performance monitoring
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

      // Filter out noise
      ignoreErrors: [
        'NEXT_NOT_FOUND',
        'NEXT_REDIRECT',
        /^cancelled$/i,
      ],

      // V010 (W7): comprehensive PII scrubber + alert-burst de-duplication.
      // Catalogue-driven: any matching key (case-insensitive) at any nesting
      // depth is replaced with `[Filtered]`. JWTs and bearer tokens are
      // detected by shape, not name.
      beforeSend(event) {
        const PII_KEYS = new Set([
          'password', 'currentpassword', 'newpassword', 'passwordhash',
          'cardnumber', 'cvv', 'cvc', 'pan',
          'ssn', 'sin', 'taxid',
          'authorization', 'cookie', 'set-cookie',
          'token', 'accesstoken', 'refreshtoken', 'sessiontoken',
          'apikey', 'api_key', 'secret', 'hmac',
          'phone', 'mobile', 'whatsapp',
          'email', // PII under GDPR — keep hashed in extra context if needed
          'address', 'street', 'postalcode', 'zip',
        ]);
        const TOKEN_RX = /(eyJ[A-Za-z0-9_-]{10,}|sk_live_[A-Za-z0-9]+|Bearer\s+[A-Za-z0-9._-]+)/g;
        const scrub = (obj: unknown, depth = 0): unknown => {
          if (depth > 6 || obj == null) return obj;
          if (typeof obj === 'string') return obj.replace(TOKEN_RX, '[Filtered]');
          if (Array.isArray(obj)) return obj.map(v => scrub(v, depth + 1));
          if (typeof obj === 'object') {
            const out: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(obj)) {
              out[k] = PII_KEYS.has(k.toLowerCase()) ? '[Filtered]' : scrub(v, depth + 1);
            }
            return out;
          }
          return obj;
        };
        if (event.request?.data)    event.request.data    = scrub(event.request.data) as typeof event.request.data;
        if (event.request?.headers) event.request.headers = scrub(event.request.headers) as typeof event.request.headers;
        if (event.extra)            event.extra           = scrub(event.extra) as typeof event.extra;
        if (event.contexts)         event.contexts        = scrub(event.contexts) as typeof event.contexts;

        // V010 (W7b): alert-burst suppression. If the same fingerprint fires
        // more than 10 times in 60 s, drop subsequent events for that minute.
        // Uses an in-process counter (per-instance) — good enough to prevent
        // a single hot loop from costing thousands of Sentry events.
        const fp = (event.fingerprint?.join('|')) ?? event.exception?.values?.[0]?.value ?? event.message ?? 'unknown';
        const now = Date.now();
        const burst = (globalThis as { __sentryBurst?: Map<string, { n: number; resetAt: number }> }).__sentryBurst
                  ??= new Map();
        const slot = burst.get(fp);
        if (!slot || slot.resetAt < now) {
          burst.set(fp, { n: 1, resetAt: now + 60_000 });
        } else {
          slot.n += 1;
          if (slot.n > 10) return null; // drop
        }
        return event;
      },
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    const { init } = await import('@sentry/nextjs');
    init({
      dsn:              process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment:      process.env.NODE_ENV,
      // FIX (V054): added release to edge runtime init — was missing, causing
      // edge errors to appear without version context in Sentry dashboard.
      release:          process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.npm_package_version ?? '0.66.0',
      tracesSampleRate: 0.05,
    });
  }
}
