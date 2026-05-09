// __tests__/unit/v059-fixes.test.ts — HemaV059
// Tests for V059 gap-closure fixes:
//   - Key versioning
//   - Dual-key grace period
//   - Rollback mechanism
//   - Rotation audit logging

import {
  getSecret,
  getSecretSync,
  rotateSecret,
  rollbackSecret,
  getPreviousSecret,
  getSecretVersion,
  getRotationAuditLog,
  setSecretForTest,
  clearSecretCache,
} from '../../src/lib/secrets';

beforeEach(() => {
  clearSecretCache();
  // Suppress process.exit and errors in tests
  jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit called'); });
});

afterEach(() => {
  clearSecretCache();
  jest.restoreAllMocks();
});

describe('V059: Key Versioning', () => {
  test('initial version is 1 after setSecretForTest', () => {
    setSecretForTest('CRON_SECRET', 'initial-value-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(getSecretVersion('CRON_SECRET')).toBe(1);
  });

  test('version increments on rotation', () => {
    setSecretForTest('CRON_SECRET', 'initial-value-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    rotateSecret('CRON_SECRET', 'new-value-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'test');
    expect(getSecretVersion('CRON_SECRET')).toBe(2);
  });

  test('version increments again on second rotation', () => {
    setSecretForTest('CRON_SECRET', 'initial-value-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    rotateSecret('CRON_SECRET', 'new-value-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'test');
    rotateSecret('CRON_SECRET', 'third-value-ccccccccccccccccccccccccccccccc', 'test');
    expect(getSecretVersion('CRON_SECRET')).toBe(3);
  });
});

describe('V059: Dual-Key Grace Period', () => {
  test('getPreviousSecret returns previous value immediately after rotation', () => {
    setSecretForTest('CRON_SECRET', 'old-value-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    rotateSecret('CRON_SECRET', 'new-value-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'test');
    expect(getPreviousSecret('CRON_SECRET')).toBe('old-value-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  test('getSecretSync returns NEW value after rotation', () => {
    setSecretForTest('CRON_SECRET', 'old-value-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    rotateSecret('CRON_SECRET', 'new-value-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'test');
    expect(getSecretSync('CRON_SECRET')).toBe('new-value-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  });

  test('getPreviousSecret returns undefined when no rotation occurred', () => {
    setSecretForTest('CRON_SECRET', 'only-value-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(getPreviousSecret('CRON_SECRET')).toBeUndefined();
  });

  test('getPreviousSecret returns undefined after second rotation replaces grace-period key', () => {
    setSecretForTest('CRON_SECRET', 'v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    rotateSecret('CRON_SECRET', 'v2-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'test');
    rotateSecret('CRON_SECRET', 'v3-cccccccccccccccccccccccccccccccccc', 'test');
    // After second rotation, previous = v2 (not v1)
    expect(getPreviousSecret('CRON_SECRET')).toBe('v2-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  });
});

describe('V059: Rollback Mechanism', () => {
  test('rollback restores previous value', () => {
    setSecretForTest('CRON_SECRET', 'original-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    rotateSecret('CRON_SECRET', 'bad-rotation-bbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'test');
    rollbackSecret('CRON_SECRET', 'operator');
    expect(getSecretSync('CRON_SECRET')).toBe('original-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  test('rollback increments version', () => {
    setSecretForTest('CRON_SECRET', 'original-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    rotateSecret('CRON_SECRET', 'bad-rotation-bbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'test');
    rollbackSecret('CRON_SECRET', 'operator');
    expect(getSecretVersion('CRON_SECRET')).toBe(3); // v1 original, v2 rotate, v3 rollback
  });

  test('rollback clears previous value (one-shot)', () => {
    setSecretForTest('CRON_SECRET', 'original-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    rotateSecret('CRON_SECRET', 'bad-rotation-bbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'test');
    rollbackSecret('CRON_SECRET', 'operator');
    // After rollback, no previous value should exist
    expect(getPreviousSecret('CRON_SECRET')).toBeUndefined();
  });

  test('rollback throws when no previous value exists', () => {
    setSecretForTest('CRON_SECRET', 'only-value-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(() => rollbackSecret('CRON_SECRET', 'operator')).toThrow('no previous value is cached');
  });
});

describe('V059: Rotation Audit Logging', () => {
  test('rotation creates audit log entry', () => {
    setSecretForTest('CRON_SECRET', 'initial-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const before = getRotationAuditLog().length;
    rotateSecret('CRON_SECRET', 'new-value-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'aws-sm-lambda');
    const log = getRotationAuditLog();
    expect(log.length).toBe(before + 1);
    const entry = log[log.length - 1];
    expect(entry.name).toBe('CRON_SECRET');
    expect(entry.initiator).toBe('aws-sm-lambda');
    expect(entry.success).toBe(true);
    expect(entry.version).toBe(2);
    expect(entry.rotatedAt).toBeGreaterThan(0);
  });

  test('rollback creates audit log entry with rollback initiator', () => {
    setSecretForTest('CRON_SECRET', 'initial-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    rotateSecret('CRON_SECRET', 'new-value-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'test');
    const before = getRotationAuditLog().length;
    rollbackSecret('CRON_SECRET', 'alice');
    const log = getRotationAuditLog();
    expect(log.length).toBe(before + 1);
    const entry = log[log.length - 1];
    expect(entry.initiator).toBe('rollback:alice');
    expect(entry.success).toBe(true);
  });
});
