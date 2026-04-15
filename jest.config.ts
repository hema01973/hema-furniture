import type { Config } from 'jest';
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/__tests__/unit/**/*.test.ts','**/__tests__/integration/**/*.test.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transform: { '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: { jsx:'react', esModuleInterop:true, allowSyntheticDefaultImports:true } }] },
  setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/lib/**/*.ts','src/app/api/**/*.ts','!src/**/*.d.ts'],
  clearMocks: true,
  testTimeout: 30_000,
};
export default config;
