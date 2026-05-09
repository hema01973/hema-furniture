// sentry.server.config.ts — HemaV054
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn:         process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release:     process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.npm_package_version ?? '54.0.0', // ✅ aligned to V054

  // Performance monitoring — 10% in prod to control costs
  tracesSampleRate:   process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 0,

  ignoreErrors: [
    'NEXT_NOT_FOUND',
    'NEXT_REDIRECT',
    /^cancelled$/i,
    /^AbortError$/,
  ],

  // Alerts are configured in Sentry dashboard → Alerts → Create Alert Rule:
  //   • Error rate > 5% in 5min  → Slack #incidents
  //   • New issue severity=fatal  → PagerDuty / email
  //   • P95 latency > 3000ms      → Slack #performance
  // These settings wire the SDK side:
  beforeSend(event, hint) {
    // V011: P2-03 — the comprehensive PII filter lives in src/instrumentation.ts
    // (V010 W7) and walks the event tree to depth 6 across request.data,
    // request.headers, extra, and contexts. The filter below was a redundant
    // shallow safety net that only covered four top-level keys (password,
    // cardNumber, cvv, passwordHash), missing currentPassword / newPassword /
    // passwordConfirm / mfaToken / Authorization headers / nested bodies.
    // Extend the allow-list to a fuller set of common sensitive keys and
    // explicitly defer all deep work to instrumentation.ts.
    if (event.request?.data) {
      const d = event.request.data as Record<string, unknown>;
      const SENSITIVE_TOP_KEYS = [
        'password', 'currentPassword', 'newPassword', 'passwordConfirm',
        'passwordHash', 'cardNumber', 'cvv', 'cvc', 'cardExpiry',
        'mfaToken', 'token', 'refreshToken', 'apiKey', 'secret',
      ];
      for (const k of SENSITIVE_TOP_KEYS) {
        if (k in d) d[k] = '[Filtered]';
      }
    }
    // Tag critical payment errors for Slack routing
    const err = hint?.originalException;
    if (err instanceof Error && err.message.includes('Paymob')) {
      event.tags = { ...event.tags, domain: 'payment', priority: 'critical' };
    }
    return event;
  },

  // Attach user context (non-PII only)
  initialScope: {
    tags: { service: 'ehema-furniture', region: 'eg' },
  },
});
