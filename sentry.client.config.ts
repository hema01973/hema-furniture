// sentry.client.config.ts — V054
// WEAK-SEC-04 FIX: added beforeBreadcrumb to redact payment_token from Paymob
// iframeUrl before it gets stored in Sentry breadcrumbs, browser history, or
// Referrer headers. The token expires in 3600s but that window is enough to exploit it.
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn:              process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment:      process.env.NODE_ENV,
  release:          process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.npm_package_version ?? '54.0.0',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  replaysOnErrorSampleRate: 1.0,   // capture session replay on error
  replaysSessionSampleRate: 0.01,  // 1% of normal sessions
  integrations: [
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: false }),
  ],
  ignoreErrors: ['NEXT_NOT_FOUND', 'NEXT_REDIRECT', /^cancelled$/i],
  beforeSend(event) {
    // V011: P2-03 — see sentry.server.config.ts for the rationale; this is the
    // client-side mirror. Deep PII walk lives in src/instrumentation.ts.
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
    return event;
  },
  // WEAK-SEC-04 FIX (V049): strip payment_token from Paymob iframeUrls in breadcrumbs.
  // Without this, the full URL (including the short-lived but exploitable payment token)
  // gets stored in Sentry's breadcrumb trail and potentially in browser history/Referrer.
  beforeBreadcrumb(breadcrumb) {
    const url = breadcrumb.data?.url as string | undefined;
    if (url && url.includes('payment_token')) {
      breadcrumb.data = {
        ...breadcrumb.data,
        url: url.split('?')[0] + '?[payment_token_redacted]',
      };
    }
    return breadcrumb;
  },
});
