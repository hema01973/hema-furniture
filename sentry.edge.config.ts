// sentry.edge.config.ts — HemaV054: release aligned to package version, PII filter
// HemaV049: release reads NEXT_PUBLIC_APP_VERSION for consistent Sentry tracking
// NEXT_PUBLIC_APP_VERSION like sentry.client and sentry.server configs do.
// This caused edge-runtime events to appear under a synthetic stale release in
// the Sentry UI, making it impossible to correlate edge errors with the correct
// deployment. Now all three runtimes share the same release string.
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn:         process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // V013 FIX: was hardcoded '8.0.0' — now matches client + server configs
  release:     process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.npm_package_version ?? '54.0.0',
  tracesSampleRate: 0.05,

  // V013 FIX: add the same PII safety-net filter present in client + server
  // configs. Edge runtime does NOT run instrumentation.ts (which carries the
  // deep V010 PII walk), so without this, raw passwords / tokens in edge
  // route request bodies would reach Sentry unredacted.
  beforeSend(event) {
    if (event.request?.data) {
      const d = event.request.data as Record<string, unknown>;
      const SENSITIVE = [
        'password', 'currentPassword', 'newPassword', 'passwordConfirm',
        'passwordHash', 'cardNumber', 'cvv', 'cvc', 'cardExpiry',
        'mfaToken', 'token', 'refreshToken', 'apiKey', 'secret',
      ];
      for (const k of SENSITIVE) {
        if (k in d) d[k] = '[Filtered]';
      }
    }
    return event;
  },
});
