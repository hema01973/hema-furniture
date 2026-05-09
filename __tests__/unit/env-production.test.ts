// __tests__/unit/env-production.test.ts — V031
// Validates that .env.production template is complete and well-formed
import * as fs from 'fs';
import * as path from 'path';

const ENV_PATH = path.resolve(__dirname, '../../.env.production');
const src      = fs.readFileSync(ENV_PATH, 'utf-8');
const lines    = src.split('\n');

// Parse KEY=VALUE pairs (ignore comments and blank lines)
function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key   = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    result[key] = value;
  }
  return result;
}

const ENV = parseEnv(src);

describe('.env.production — Required keys present', () => {
  const REQUIRED_KEYS = [
    'NODE_ENV',
    'NEXT_PUBLIC_APP_URL',
    'MONGODB_URI',
    'MONGODB_POOL_SIZE',
    'NEXTAUTH_SECRET',
    'NEXTAUTH_URL',
    'REDIS_URL',
    'RATE_LIMIT_MAX',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'EMAIL_FROM',
    'ADMIN_ALERT_EMAIL',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'PAYMOB_API_KEY',
    'PAYMOB_INTEGRATION_ID',
    'PAYMOB_IFRAME_ID',
    'PAYMOB_HMAC_SECRET',
    'CRON_SECRET',
    'NEXT_PUBLIC_SENTRY_DSN',
    'LOG_LEVEL',
  ];

  REQUIRED_KEYS.forEach(key => {
    it(`contains key: ${key}`, () => {
      expect(ENV).toHaveProperty(key);
    });
  });
});

describe('.env.production — Values are placeholders (not real secrets)', () => {
  it('NODE_ENV is set to production', () => {
    expect(ENV['NODE_ENV']).toBe('production');
  });

  it('NEXT_PUBLIC_APP_URL points to hemafurniture.com', () => {
    expect(ENV['NEXT_PUBLIC_APP_URL']).toContain('hemafurniture.com');
  });

  it('MONGODB_URI contains Atlas connection string format', () => {
    expect(ENV['MONGODB_URI']).toMatch(/mongodb(\+srv)?:\/\//);
  });

  it('NEXTAUTH_URL points to production domain', () => {
    expect(ENV['NEXTAUTH_URL']).toContain('hemafurniture.com');
  });

  it('REDIS_URL uses secure rediss:// protocol for Upstash', () => {
    expect(ENV['REDIS_URL']).toMatch(/^rediss:\/\//);
  });

  it('SMTP_PORT is 587 (STARTTLS) not 25 (plain)', () => {
    expect(ENV['SMTP_PORT']).toBe('587');
  });

  it('LOG_LEVEL is info (not debug) in production', () => {
    expect(ENV['LOG_LEVEL']).toBe('info');
  });

  it('RATE_LIMIT_MAX is a valid positive number', () => {
    expect(parseInt(ENV['RATE_LIMIT_MAX'])).toBeGreaterThan(0);
  });
});

describe('.env.production — Security checks', () => {
  it('file does not contain localhost URLs in production values', () => {
    // MONGODB_URI and NEXTAUTH_URL must point to real hosts
    expect(ENV['MONGODB_URI']).not.toContain('localhost');
    expect(ENV['NEXTAUTH_URL']).not.toContain('localhost');
  });

  it('file is not committing real API keys (all are REPLACE_ placeholders)', () => {
    const sensitiveKeys = [
      'NEXTAUTH_SECRET', 'PAYMOB_API_KEY', 'PAYMOB_HMAC_SECRET',
      'CLOUDINARY_API_SECRET', 'CRON_SECRET', 'SMTP_PASS',
    ];
    for (const key of sensitiveKeys) {
      const val = ENV[key] ?? '';
      // Value must be a placeholder — not an actual key (which would be long random strings)
      expect(val).toMatch(/REPLACE|your-|SG\.|sk_|rk_/i);
    }
  });

  it('contains generation instructions for secrets', () => {
    expect(src).toContain('openssl rand');
  });

  it('warns not to commit the file', () => {
    expect(src).toMatch(/NEVER commit/i);
  });
});

describe('.env.production — Documentation quality', () => {
  it('has section headers with dashes', () => {
    const headerLines = lines.filter(l => l.startsWith('# ──'));
    expect(headerLines.length).toBeGreaterThanOrEqual(5);
  });

  it('has comments explaining Paymob setup steps', () => {
    expect(src).toContain('Step-by-step');
  });

  it('documents where to get each major key', () => {
    expect(src).toContain('cloud.mongodb.com');
    expect(src).toContain('accept.paymob.com');
    expect(src).toContain('cloudinary.com');
  });

  it('mentions staging vs production distinction for Paymob', () => {
    expect(src).toMatch(/STAGING|staging/);
  });
});
