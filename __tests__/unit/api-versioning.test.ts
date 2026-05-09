// __tests__/unit/api-versioning.test.ts — V031: verify all API routes exist under /api/v1/
import * as fs from 'fs';
import * as path from 'path';

const API_ROOT    = path.resolve(__dirname, '../../src/app/api');
const V1_ROOT     = path.join(API_ROOT, 'v1');

// Routes that should exist under /api/v1/
const EXPECTED_V1_ROUTES = [
  'products',
  'orders',
  'coupons',
  'users',
  'reviews',
  'analytics',
  'upload',
];

// System/auth routes that intentionally stay at root (NOT versioned)
const SYSTEM_ROUTES = [
  'auth',
  'healthz',
  'paymob',
  'cron',
];

function routeFileExists(routeDir: string): boolean {
  const routeFile = path.join(routeDir, 'route.ts');
  return fs.existsSync(routeFile);
}

function dirExists(dirPath: string): boolean {
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

describe('API Versioning — /api/v1/ routes', () => {
  it('v1 directory exists under src/app/api/', () => {
    expect(dirExists(V1_ROOT)).toBe(true);
  });

  EXPECTED_V1_ROUTES.forEach(route => {
    it(`/api/v1/${route}/ has a route.ts file`, () => {
      const routeDir = path.join(V1_ROOT, route);
      expect(dirExists(routeDir)).toBe(true);
      expect(routeFileExists(routeDir)).toBe(true);
    });
  });

  it('/api/v1/orders/[id]/ has a route.ts file', () => {
    const routeDir = path.join(V1_ROOT, 'orders', '[id]');
    expect(dirExists(routeDir)).toBe(true);
    expect(routeFileExists(routeDir)).toBe(true);
  });

  it('/api/v1/products/[id]/ has a route.ts file', () => {
    const routeDir = path.join(V1_ROOT, 'products', '[id]');
    expect(dirExists(routeDir)).toBe(true);
    expect(routeFileExists(routeDir)).toBe(true);
  });

  it('/api/v1/users/[id]/ has a route.ts file', () => {
    const routeDir = path.join(V1_ROOT, 'users', '[id]');
    expect(dirExists(routeDir)).toBe(true);
    expect(routeFileExists(routeDir)).toBe(true);
  });

  // ── System routes should remain at root ────────────────────────
  SYSTEM_ROUTES.forEach(route => {
    it(`system route /api/${route}/ stays at root (not versioned)`, () => {
      const rootRouteDir = path.join(API_ROOT, route);
      expect(dirExists(rootRouteDir)).toBe(true);
    });
  });
});

describe('API Versioning — Frontend fetch calls use /api/v1/', () => {
  const SRC_ROOT = path.resolve(__dirname, '../../src');
  const EXCLUDED = ['api/auth', 'api/healthz', 'api/paymob', 'api/cron'];

  function getAllTsFiles(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules') {
        results.push(...getAllTsFiles(fullPath));
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        results.push(fullPath);
      }
    }
    return results;
  }

  it('no frontend fetch calls use old /api/ paths (only /api/v1/ or system routes)', () => {
    const files = getAllTsFiles(path.join(SRC_ROOT, 'components'))
      .concat(getAllTsFiles(path.join(SRC_ROOT, 'hooks')))
      .concat(getAllTsFiles(path.join(SRC_ROOT, 'app')).filter(f => !f.includes('/app/api/')));

    const violations: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines   = content.split('\n');

      lines.forEach((line, idx) => {
        // Match patterns like '/api/products', `/api/orders`, etc.
        const OLD_API_PATTERN = /['"`]\/api\/(?!v1\/|auth|healthz|paymob|cron)/g;
        if (OLD_API_PATTERN.test(line) && !line.trimStart().startsWith('//')) {
          violations.push(`${path.relative(SRC_ROOT, file)}:${idx + 1} — ${line.trim()}`);
        }
      });
    }

    if (violations.length > 0) {
      console.error('Old /api/ paths found in frontend code:\n' + violations.join('\n'));
    }
    expect(violations).toHaveLength(0);
  });
});
