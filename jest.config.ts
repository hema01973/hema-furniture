// jest.config.ts — v15.0 (V039): TypeScript fully enforced — no @ts-nocheck (VULN-08)
// V037: removed @ts-nocheck; V072: fixed tsTransform type to Record<string,[string,Record<string,unknown>]>
//       to match ts-jest's expected tuple format.
import type { Config } from 'jest';

// V072 FIX: jest TransformerConfig requires [string, Record<string, unknown>].
// `object` was rejected by TS strict mode — lacks an index signature.
const tsTransform: Record<string, [string, Record<string, unknown>]> = {
  '^.+\\.tsx?$': ['ts-jest', {}],
};

const testGlobals = {
  'ts-jest': {
    tsconfig: { strict: true, esModuleInterop: true, paths: { '@/*': ['./src/*'] } },
    diagnostics: { ignoreCodes: ['TS151001'] },
  },
} as const;

const moduleMapper = { '^@/(.*)$': '<rootDir>/src/$1' };

const config: Config = {
  testTimeout: 30_000, // V074 FIX: not valid inside InitialProjectOptions

  projects: [
    // ── Node: lib, services, API routes, business logic ──────────
    {
      displayName:     'unit+integration',
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
      testMatch: [
        '**/__tests__/unit/**/*.test.ts',
        '**/__tests__/integration/**/*.test.ts',
      ],
      testPathIgnorePatterns: [
        '/__tests__/unit/hooks/',
        '/__tests__/unit/wishlistStore.test.ts',
        // WEAK-CODE-02 FIX (V049): the 3 files below were excluded with no comment
        // explaining why. Investigation shows they were excluded due to missing
        // mock setup for mongoose/Redis in the test runner. They are now re-enabled
        // and their dependencies are properly mocked in jest.setup.ts.
        // '/__tests__/unit/mongodb.test.ts',         -- re-enabled V049
        // '/__tests__/unit/user.service.test.ts',    -- re-enabled V049
        // '/__tests__/unit/validation/coupons-schema.test.ts', -- re-enabled V049
      ],
      transform:        tsTransform,
      moduleNameMapper: moduleMapper,
      globals:          testGlobals,
    },
    // ── JSDOM: React components ───────────────────────────────────
    {
      displayName:     'components',
      testEnvironment: 'jest-environment-jsdom',
      testMatch:       [
        '**/__tests__/components/**/*.test.tsx',
        '**/__tests__/unit/hooks/**/*.test.ts',
        '**/__tests__/unit/wishlistStore.test.ts',
      ],
      transform:        tsTransform,
      moduleNameMapper: moduleMapper,
      globals:          testGlobals,
      setupFilesAfterEnv: ['@testing-library/jest-dom'],
    },
  ],

  // ── Coverage configuration ─────────────────────────────────────
  collectCoverageFrom: [
    'src/lib/business.ts',      // Pure functions — target 95%+
    'src/lib/csrf.ts',
    'src/lib/sanitize.ts',
    'src/lib/api.ts',
    'src/lib/redis.ts',
    'src/lib/rate-limit.ts',
    'src/lib/audit.ts',
    'src/application/feature-flags/**/*.ts',
    'src/application/use-cases/**/*.ts', // TEST-GAP-01 FIX (V049): use-cases were missing from coverage
    'src/domain/shared/value-objects/**/*.ts', // TEST-GAP-02 FIX (V049): value objects missing
    'src/infrastructure/**/*.ts',
    'src/lib/env/**/*.ts',
    'src/lib/logger.ts',
    'src/lib/constants.ts',
    'src/lib/utils.ts',
    'src/lib/paymob.ts',
    'src/services/**/*.ts',
    'src/app/api/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],

  coverageThreshold: {
    // Global gate
    global: {
      lines:      90,
      functions:  90,
      branches:   80,
      statements: 90,
    },
    // Per-file gates on critical files
    './src/lib/business.ts': {
      lines: 95, functions: 95, branches: 90, statements: 95,
    },
    './src/lib/csrf.ts': {
      lines: 95, functions: 95, branches: 90, statements: 95,
    },
    './src/lib/sanitize.ts': {
      lines: 95, functions: 95, branches: 90, statements: 95,
    },
  },

  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageDirectory: 'coverage',
  maxWorkers:        '50%',
  bail:              0,         // Run all tests even if some fail
};

export default config;
