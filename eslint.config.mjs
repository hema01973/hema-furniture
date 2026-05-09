// eslint.config.mjs — V072 FIX: proper Next.js ESLint v9 flat config
// Fixes:
//   - "Next.js plugin was not detected" warning
//   - "@typescript-eslint/no-explicit-any rule not found" errors
//   - "@typescript-eslint/no-unused-vars rule not found" errors
//   - "MODULE_TYPELESS_PACKAGE_JSON" warning (resolved by .mjs extension)
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

/** @type {import('eslint').Linter.Config[]} */
const config = [
  // Next.js recommended rules (includes React, JSX, accessibility)
  ...compat.extends('next/core-web-vitals'),

  {
    rules: {
      // ── React ─────────────────────────────────────────────────────
      'react/no-unescaped-entities': 'off',

      // ── TypeScript-eslint rules — defined inline so they work even
      //    when @typescript-eslint plugin is not explicitly installed.
      //    eslint-config-next bundles @typescript-eslint internally.
      //    Overriding them here prevents "rule not found" build errors.
      '@typescript-eslint/no-explicit-any':  'warn',
      '@typescript-eslint/no-unused-vars':   ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],

      // ── Next.js ───────────────────────────────────────────────────
      // Allow <img> in admin dashboard (external Cloudinary URLs,
      // no width/height known at build time — Image component requires them).
      '@next/next/no-img-element': 'warn',

      // ── Console ───────────────────────────────────────────────────
      // Allow console in server files — suppress "no-console" unused-directive warnings
      'no-console': 'off',

      // ── Variables ─────────────────────────────────────────────────
      'no-var': 'off',
    },
  },

  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '*.config.js',
      '*.config.cjs',
    ],
  },
];

export default config;
