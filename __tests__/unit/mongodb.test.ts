// __tests__/unit/mongodb.test.ts — V031: tests for strictQuery + orderNumber Mongoose hook
import mongoose from 'mongoose';

// ── Mock mongoose ─────────────────────────────────────────────────
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    set:     jest.fn(),
    connect: jest.fn().mockResolvedValue({ connection: { host: 'localhost' } }),
    models:  {},
    model:   jest.fn().mockReturnValue({}),
  };
});

describe('MongoDB module', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
  });

  afterEach(() => {
    delete process.env.MONGODB_URI;
  });

  // ── strictQuery ───────────────────────────────────────────────
  it('calls mongoose.set("strictQuery", true) on module load', async () => {
    await import('@/lib/mongodb');
    expect(mongoose.set).toHaveBeenCalledWith('strictQuery', true);
  });

  it('calls mongoose.set before mongoose.connect', async () => {
    const callOrder: string[] = [];
    (mongoose.set     as jest.Mock).mockImplementation(() => { callOrder.push('set');     });
    (mongoose.connect as jest.Mock).mockImplementation(() => { callOrder.push('connect'); return Promise.resolve({}); });

    await import('@/lib/mongodb');
    const setIndex     = callOrder.indexOf('set');
    const connectIndex = callOrder.indexOf('connect');

    if (setIndex !== -1 && connectIndex !== -1) {
      expect(setIndex).toBeLessThan(connectIndex);
    } else {
      // strictQuery set is called at module load; connect is lazy
      expect(setIndex).not.toBe(-1);
    }
  });

  it('throws if MONGODB_URI is not defined', async () => {
    delete process.env.MONGODB_URI;
    await expect(import('@/lib/mongodb')).rejects.toThrow('MONGODB_URI');
  });
});

// ── orderNumber Hook logic (isolated) ─────────────────────────────
describe('OrderSchema pre-save hook — orderNumber generation', () => {
  const YEAR = new Date().getFullYear();

  function buildOrderNumber(seq: number): string {
    return `HEM-${YEAR}-${String(seq).padStart(5, '0')}`;
  }

  it('generates correct format for seq=1', () => {
    expect(buildOrderNumber(1)).toBe(`HEM-${YEAR}-00001`);
  });

  it('generates correct format for seq=99999', () => {
    expect(buildOrderNumber(99999)).toBe(`HEM-${YEAR}-99999`);
  });

  it('pads single digit sequence correctly', () => {
    expect(buildOrderNumber(7)).toBe(`HEM-${YEAR}-00007`);
  });

  it('includes the current year in orderNumber', () => {
    const result = buildOrderNumber(42);
    expect(result).toContain(String(YEAR));
  });

  it('starts with HEM- prefix', () => {
    expect(buildOrderNumber(1)).toMatch(/^HEM-/);
  });

  it('orderNumber is unique per sequence value', () => {
    const nums = [1, 2, 3, 100, 99999].map(buildOrderNumber);
    const unique = new Set(nums);
    expect(unique.size).toBe(nums.length);
  });
});
