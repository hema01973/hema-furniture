/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ['image/avif','image/webp'],
    remotePatterns: [
      { protocol:'https', hostname:'res.cloudinary.com'  },
      { protocol:'https', hostname:'images.unsplash.com' },
      { protocol:'https', hostname:'*.cloudfront.net'    },
    ],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  async headers() {
    return [{
      source: '/api/:path*',
      headers: [
        { key: 'Access-Control-Allow-Credentials', value: 'true' },
        { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,PATCH,OPTIONS' },
        { key: 'Access-Control-Allow-Headers', value: 'Content-Type,Authorization' },
      ],
    }];
  },
  poweredByHeader: false,
  compress: true,
  // Remove console.log in production; keep error/warn
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error','warn'] } : false,
  },
};

module.exports = nextConfig;
