// next.config.js — Hardened Production Configuration (V073)

const { withSentryConfig } = (() => {
  try {
    return require('@sentry/nextjs');
  } catch {
    return {
      withSentryConfig: (config) => config,
    };
  }
})();

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : '');

if (process.env.NODE_ENV === 'production' && !APP_URL) {
  console.warn(
    '[next.config.js] NEXT_PUBLIC_APP_URL is missing in production.'
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],

    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'placehold.co',
      },
    ],

    minimumCacheTTL: 60 * 60 * 24 * 30,

    deviceSizes: [640, 750, 828, 1080, 1200, 1920],

    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],

    dangerouslyAllowSVG: false,

    contentDispositionType: 'attachment',
  },

  async headers() {
    const globalHeaders = [
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
      },
      {
        key: 'X-DNS-Prefetch-Control',
        value: 'off',
      },
    ];

    if (process.env.NODE_ENV === 'production') {
      globalHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      });
    }

    if (process.env.CSP_REPORT_URI) {
      globalHeaders.push({
        key: 'Report-To',
        value: JSON.stringify({
          group: 'csp-endpoint',
          max_age: 10886400,
          endpoints: [
            {
              url: process.env.CSP_REPORT_URI,
            },
          ],
        }),
      });

      globalHeaders.push({
        key: 'Reporting-Endpoints',
        value: `csp-endpoint="${process.env.CSP_REPORT_URI}"`,
      });
    }

    return [
      {
        source: '/(.*)',
        headers: globalHeaders,
      },

      {
        source: '/api/:path*',

        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: APP_URL || 'http://localhost:3000',
          },

          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          },

          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET,POST,PUT,PATCH,DELETE',
          },

          {
            key: 'Access-Control-Allow-Headers',
            value:
              'Content-Type,Authorization,X-CSRF-Token,X-Correlation-Id,X-Request-Id',
          },

          {
            key: 'Cache-Control',
            value: 'no-store, max-age=0',
          },
        ],
      },

      {
        source: '/_next/static/:path*',

        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },

      {
        source: '/images/:path*',

        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  async redirects() {
    return [
      {
        source: '/admin/login',
        destination: '/login',
        permanent: true,
      },

      {
        source: '/products/:slug',
        destination: '/product/:slug',
        permanent: true,
      },
    ];
  },

  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? {
            exclude: ['error', 'warn'],
          }
        : false,
  },

  poweredByHeader: false,

  compress: true,

  experimental: {
    serverActions: {
      allowedOrigins: APP_URL
        ? [APP_URL.replace(/^https?:\/\//, '')]
        : [],
    },

    optimizePackageImports: [
      'date-fns',
      'lodash',
      'lucide-react',
    ],
  },

  webpack(config, { isServer }) {
    if (!isServer) {
      config.resolve = config.resolve || {};

      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),

        async_hooks: false,
        fs: false,
        net: false,
        tls: false,
        dns: false,
        child_process: false,
      };
    }

    if (process.env.ANALYZE === 'true') {
      const {
        BundleAnalyzerPlugin,
      } = require('webpack-bundle-analyzer');

      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',

          reportFilename: isServer
            ? '../analyze/server.html'
            : './analyze/client.html',
        })
      );
    }

    return config;
  },
};

const sentryOptions = {
  org: process.env.SENTRY_ORG,

  project: process.env.SENTRY_PROJECT,

  authToken: process.env.SENTRY_AUTH_TOKEN,

  silent: process.env.CI === 'true',

  hideSourceMaps: true,

  disableServerWebpackPlugin:
    !process.env.NEXT_PUBLIC_SENTRY_DSN,

  disableClientWebpackPlugin:
    !process.env.NEXT_PUBLIC_SENTRY_DSN,
};

module.exports = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryOptions)
  : nextConfig;