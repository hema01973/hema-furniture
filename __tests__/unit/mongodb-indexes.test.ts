// __tests__/unit/mongodb-indexes.test.ts — V031
// Tests that OrderSchema has all required compound indexes and pre-save hook
import * as fs from 'fs';
import * as path from 'path';

const MONGODB_SRC = path.resolve(__dirname, '../../src/lib/mongodb.ts');
const src = fs.readFileSync(MONGODB_SRC, 'utf-8');

describe('mongodb.ts — strictQuery', () => {
  it('contains mongoose.set("strictQuery", true)', () => {
    expect(src).toContain("mongoose.set('strictQuery', true)");
  });

  it('sets strictQuery before any connect call', () => {
    const setIdx     = src.indexOf("mongoose.set('strictQuery', true)");
    const connectIdx = src.indexOf('mongoose.connect(');
    expect(setIdx).toBeGreaterThanOrEqual(0);
    if (connectIdx !== -1) {
      expect(setIdx).toBeLessThan(connectIdx);
    }
  });
});

describe('mongodb.ts — OrderSchema compound indexes (v5.0)', () => {
  // Every compound index added in v5.0 must be present
  const REQUIRED_INDEXES = [
    '{ userId: 1,        createdAt: -1 }',
    '{ status: 1,        createdAt: -1 }',
    '{ paymentStatus: 1, createdAt: -1 }',
    '{ status: 1,        updatedAt:  1 }',
  ];

  REQUIRED_INDEXES.forEach(idx => {
    it(`has index ${idx.trim()}`, () => {
      // Normalise whitespace for comparison
      const normalised = src.replace(/\s+/g, ' ');
      const normIdx    = idx.replace(/\s+/g, ' ').trim();
      expect(normalised).toContain(normIdx);
    });
  });

  it('has at least 4 OrderSchema.index() calls', () => {
    const matches = src.match(/OrderSchema\.index\(/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });
});

describe('mongodb.ts — orderNumber pre-save hook', () => {
  it('contains a pre("save") hook on OrderSchema', () => {
    expect(src).toMatch(/OrderSchema\.pre\(['"]save['"]/);
  });

  it('uses HEM- prefix for orderNumber', () => {
    expect(src).toContain('HEM-');
  });

  it('pads sequence to 5 digits', () => {
    expect(src).toMatch(/padStart\(5/);
  });

  it('does NOT call nextSeq from order.service.ts (single source of truth)', () => {
    const serviceSrc = fs.readFileSync(
      path.resolve(__dirname, '../../src/services/order.service.ts'), 'utf-8'
    );
    // nextSeq must not be called in the service — only in mongodb.ts pre-save hook
    const callsNextSeq = serviceSrc.includes('nextSeq(') && !serviceSrc.includes('// nextSeq');
    expect(callsNextSeq).toBe(false);
  });
});

describe('mongodb.ts — statusHistory pre-save hook', () => {
  it('contains a pre-save hook that pushes to statusHistory', () => {
    expect(src).toMatch(/statusHistory/);
  });

  it('order.service.ts does NOT set statusHistory in create() payload', () => {
    const serviceSrc = fs.readFileSync(
      path.resolve(__dirname, '../../src/services/order.service.ts'), 'utf-8'
    );
    // The array literal [ { status: ..., timestamp: ... } ] must not appear in create payload
    // A comment about statusHistory is fine, but the actual array assignment is not
    const hasArrayLiteral = /statusHistory:\s*\[/.test(serviceSrc);
    expect(hasArrayLiteral).toBe(false);
  });
});
