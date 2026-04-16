// jest.config.ts
import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transform: { '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: { jsx: 'react', esModuleInterop: true, allowSyntheticDefaultImports: true } }] },
  
  // ✅ التصحيح: غيّر setupFilesAfterFramework → setupFilesAfterEnv
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/lib/**/*.ts', 'src/app/api/**/*.ts', '!src/**/*.d.ts'],
  clearMocks: true,
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
};

export default createJestConfig(config);