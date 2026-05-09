// LOW-007 NOTE (V068): The CSP header with per-request nonces is injected by middleware.ts.
// Static assets under /_next/static/ are excluded from the middleware matcher by design —
// these assets (JS chunks, CSS) do not need CSP. All HTML page responses receive the nonce-based
// CSP from middleware. Audit header presence with: curl -I https://yourdomain.com | grep -i csp
// next.config.js — V072: Report-To header for CSP violation monitoring (VULN-05)
// V031: FIX #5 (CloudFront wildcard SSRF), FIX #6 (DNS prefetch, CORS methods)
const { withSentryConfig } = (() => {
  try { return require('@sentry/nextjs'); }
  catch { return { withSentryConfig: (c) => c }; }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output for Docker (set via DOCKER_BUILD env)
    output: undefined,

  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com'  },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // FIX #5 (V031): Removed '*.cloudfront.net' wildcard — it permitted ANY
      // CloudFront distribution (including attacker-controlled ones) to serve
      // images through Next.js image optimizer, enabling potential SSRF and
      // content injection. Add specific CloudFront hostnames here if needed:
      // { protocol: 'https', hostname: 'your-id.cloudfront.net' },
      { protocol: 'https', hostname: 'placehold.co'        },
    ],
    minimumCacheTTL:        60 * 60 * 24 * 30,
    deviceSizes:            [640, 750, 828, 1080, 1200, 1920],
    imageSizes:             [16, 32, 48, 64, 96, 128, 256, 384],
    dangerouslyAllowSVG:    false,
    contentDispositionType: 'attachment',
  },

  async headers() {
    return [
      // ── FIX #3: Global security headers for all page routes ───────────────
      // Previously only /api/* had security headers — HTML pages were missing
      // X-Frame-Options, X-Content-Type-Options, and Referrer-Policy, leaving
      // them vulnerable to clickjacking and MIME-sniffing attacks.
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'X-Content-Type-Options',     value: 'nosniff' },
          { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',         value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-DNS-Prefetch-Control',     value: 'off' },
          // V039 FIX [LOW-03]: HSTS now only set in production. Setting it in
          // development (HTTP) causes browsers to refuse HTTP connections to
          // localhost for the next 2 years — breaking every developer's env.
          // The middleware already does this correctly; next.config.js now matches.
          ...(process.env.NODE_ENV === 'production' ? [{
            key:   'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          }] : []),
          // VULN-05 FIX: Report-To header for CSP violation reporting (Reporting API v1)
          ...(process.env.CSP_REPORT_URI ? [{
            key: 'Report-To',
            value: JSON.stringify({
              group: 'csp-endpoint',
              max_age: 10886400,
              endpoints: [{ url: process.env.CSP_REPORT_URI }],
            }),
          }] : []),
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          // Restrict CORS to the app's own origin — prevents cross-origin API abuse.
          // Wildcards ('*') are intentionally NOT used: they would allow any site to
          // call our API with user credentials (CSRF-bypass via CORS loophole).
          // CODE-QUALITY FIX (HemaV052): NEXT_PUBLIC_APP_URL must be explicitly set.
          // Falling back to a hardcoded domain is a misconfiguration that would
          // silently break CORS in a different deployment environment.
          { key: 'Access-Control-Allow-Origin', value: (() => {
            const url = process.env.NEXT_PUBLIC_APP_URL;
            if (!url && process.env.NODE_ENV === 'production') {
              throw new Error('[next.config.js] NEXT_PUBLIC_APP_URL must be set in production for CORS headers.');
            }
            return url ?? 'http://localhost:3000';
          })() },
          { key: 'Access-Control-Allow-Credentials', value: 'true'  },
          // V036 FIX: PATCH added — several endpoints (users, orders, reviews)
          // use PATCH and were silently rejected by preflight in strict CORS
          // clients. OPTIONS is intentionally excluded (browser-handled preflight).
          { key: 'Access-Control-Allow-Methods',     value: 'GET,POST,PUT,PATCH,DELETE' },
          { key: 'Access-Control-Allow-Headers',     value: 'Content-Type,Authorization,X-CSRF-Token,X-Correlation-Id,X-Request-Id' },
          { key: 'Cache-Control',                    value: 'no-store, max-age=0' },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/images/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },

  async redirects() {
    return [
      { source: '/admin/login',    destination: '/login',         permanent: true },
      { source: '/products/:slug', destination: '/product/:slug', permanent: true },
    ];
  },

  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },

  poweredByHeader: false,
  compress:        true,

  experimental: {
    serverActions: {
      allowedOrigins: [
        (process.env.NEXT_PUBLIC_APP_URL || 'https://hemafurniture.com')
          .replace(/^https?:\/\//, ''),
      ],
    },
    optimizePackageImports: ['date-fns', 'lodash', 'lucide-react'],
    // ppr: true,  // Enable when upgrading to Next.js 15.1+
  },

  // V072 FIX: Turbopack config mirrors webpack config to suppress the
  // "Webpack is configured while Turbopack is not" warning when running
  // `next dev --turbopack`. The bundle analyzer only applies to webpack builds
  // (npm run analyze), so Turbopack config is kept minimal.
  turbopack: {},

  webpack(config, { isServer }) {
    // V072 FIX: Prevent Node.js built-in modules (async_hooks, etc.) from being
    // bundled into the client-side bundle. These are server-only and should never
    // appear in browser code. If webpack encounters them in the client bundle,
    // marking them as external causes a clear error instead of a silent failure.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        async_hooks: false,
        fs:          false,
        net:         false,
        tls:         false,
        dns:         false,
        child_process: false,
      };
    }

    // Bundle analyzer (npm run analyze)
    if (process.env.ANALYZE === 'true') {
      const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
      config.plugins.push(new BundleAnalyzerPlugin({
        analyzerMode: 'static',
        reportFilename: isServer ? '../analyze/server.html' : './analyze/client.html',
      }));
    }
    return config;
  },
};

const sentryOptions = {
  org:            process.env.SENTRY_ORG,
  project:        process.env.SENTRY_PROJECT,
  authToken:      process.env.SENTRY_AUTH_TOKEN,
  silent:         process.env.CI === 'true',
  hideSourceMaps: true,
  disableServerWebpackPlugin: !process.env.NEXT_PUBLIC_SENTRY_DSN,
  disableClientWebpackPlugin: !process.env.NEXT_PUBLIC_SENTRY_DSN,
};

module.exports = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryOptions)
  : nextConfig;
