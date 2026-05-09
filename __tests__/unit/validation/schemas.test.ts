// __tests__/unit/validation/schemas.test.ts — Zod schema validation
import { z } from 'zod';

// ── Reproduce the exact schemas used in API routes ────────────────
const RegisterSchema = z.object({
  name:     z.string().min(2).max(100),
  email:    z.string().email(),
  password: z.string()
               .min(8)
               .max(128)
               .regex(/[A-Z]/, 'Must contain uppercase')
               .regex(/[0-9]/, 'Must contain a number')
               .regex(/[^A-Za-z0-9]/, 'Must contain a special character'),
  phone:    z.string().max(20).optional(),
});

const CreateOrderSchema = z.object({
  customer: z.object({
    firstName: z.string().min(2),
    lastName:  z.string().min(2),
    email:     z.string().email(),
    phone:     z.string().min(11),
  }),
  shippingAddress: z.object({
    street:      z.string().min(5),
    city:        z.string().min(2),
    governorate: z.string().min(2),
    postalCode:  z.string().optional(),
  }),
  items: z.array(z.object({
    productId:     z.string().min(1),
    quantity:      z.number().int().positive(),
    selectedColor: z.string().optional(),
  })).min(1),
  paymentMethod: z.enum(['cod', 'card', 'paymob', 'fawry', 'valu']).default('cod'),
  couponCode:    z.string().optional(),
  notes:         z.string().max(500).optional(),
});

const MfaVerifySchema = z.object({
  userId: z.string().min(1),
  token:  z.string().min(1),
});

// ── RegisterSchema ────────────────────────────────────────────────
describe('RegisterSchema', () => {
  const VALID = { name: 'Ahmed Hassan', email: 'a@b.com', password: 'Strong@1' };

  it('passes with valid data',               () => expect(RegisterSchema.safeParse(VALID).success).toBe(true));
  it('fails — name too short',               () => expect(RegisterSchema.safeParse({ ...VALID, name: 'A' }).success).toBe(false));
  it('fails — invalid email format',         () => expect(RegisterSchema.safeParse({ ...VALID, email: 'not-an-email' }).success).toBe(false));
  it('fails — password too short (<8)',      () => expect(RegisterSchema.safeParse({ ...VALID, password: 'Sh@1' }).success).toBe(false));
  it('fails — no uppercase letter',          () => expect(RegisterSchema.safeParse({ ...VALID, password: 'nouppercase1!' }).success).toBe(false));
  it('fails — no number',                    () => expect(RegisterSchema.safeParse({ ...VALID, password: 'NoNumber!' }).success).toBe(false));
  it('fails — no special character',         () => expect(RegisterSchema.safeParse({ ...VALID, password: 'NoSpecial1' }).success).toBe(false));
  it('passes — phone is optional',           () => expect(RegisterSchema.safeParse(VALID).success).toBe(true));
  it('passes — with valid phone',            () => expect(RegisterSchema.safeParse({ ...VALID, phone: '01234567890' }).success).toBe(true));
  it('fails — empty name',                   () => expect(RegisterSchema.safeParse({ ...VALID, name: '' }).success).toBe(false));
  it('fails — missing email',               () => expect(RegisterSchema.safeParse({ name: 'A', password: 'X' }).success).toBe(false));
  it('fails — password too long (>128)',     () => {
    const long = 'A1!' + 'a'.repeat(130);
    expect(RegisterSchema.safeParse({ ...VALID, password: long }).success).toBe(false);
  });
});

// ── CreateOrderSchema ─────────────────────────────────────────────
describe('CreateOrderSchema', () => {
  const VALID_ORDER = {
    customer: { firstName: 'Ahmed', lastName: 'Hassan', email: 'a@b.com', phone: '01234567890' },
    shippingAddress: { street: '123 Nile St', city: 'Cairo', governorate: 'Cairo' },
    items: [{ productId: 'prod-abc', quantity: 2 }],
    paymentMethod: 'cod',
  };

  it('passes with valid COD order',              () => expect(CreateOrderSchema.safeParse(VALID_ORDER).success).toBe(true));
  it('fails — empty items array',                () => expect(CreateOrderSchema.safeParse({ ...VALID_ORDER, items: [] }).success).toBe(false));
  it('fails — invalid payment method',           () => expect(CreateOrderSchema.safeParse({ ...VALID_ORDER, paymentMethod: 'bitcoin' }).success).toBe(false));
  it('fails — quantity 0',                       () => expect(CreateOrderSchema.safeParse({ ...VALID_ORDER, items: [{ productId: 'x', quantity: 0 }] }).success).toBe(false));
  it('fails — negative quantity',                () => expect(CreateOrderSchema.safeParse({ ...VALID_ORDER, items: [{ productId: 'x', quantity: -1 }] }).success).toBe(false));
  it('fails — invalid customer email',           () => expect(CreateOrderSchema.safeParse({ ...VALID_ORDER, customer: { ...VALID_ORDER.customer, email: 'bad' } }).success).toBe(false));
  it('fails — phone too short',                  () => expect(CreateOrderSchema.safeParse({ ...VALID_ORDER, customer: { ...VALID_ORDER.customer, phone: '123' } }).success).toBe(false));
  it('fails — street too short (<5)',            () => expect(CreateOrderSchema.safeParse({ ...VALID_ORDER, shippingAddress: { ...VALID_ORDER.shippingAddress, street: '123' } }).success).toBe(false));
  it('defaults paymentMethod to cod',            () => {
    const { paymentMethod, ...noMethod } = VALID_ORDER;
    const r = CreateOrderSchema.safeParse(noMethod);
    expect(r.success && r.data.paymentMethod).toBe('cod');
  });
  it('passes — notes max 500 chars',             () => {
    expect(CreateOrderSchema.safeParse({ ...VALID_ORDER, notes: 'x'.repeat(500) }).success).toBe(true);
  });
  it('fails — notes over 500 chars',             () => {
    expect(CreateOrderSchema.safeParse({ ...VALID_ORDER, notes: 'x'.repeat(501) }).success).toBe(false);
  });
  it('accepts optional selectedColor',           () => {
    const r = CreateOrderSchema.safeParse({ ...VALID_ORDER, items: [{ productId: 'x', quantity: 1, selectedColor: 'Beige' }] });
    expect(r.success).toBe(true);
  });
  it('fails — missing customer firstName',        () => {
    const bad = { ...VALID_ORDER, customer: { lastName: 'H', email: 'a@b.com', phone: '01234567890' } };
    expect(CreateOrderSchema.safeParse(bad).success).toBe(false);
  });
  it('accepts all valid payment methods',        () => {
    const methods = ['cod', 'card', 'paymob', 'fawry', 'valu'];
    methods.forEach(m => {
      expect(CreateOrderSchema.safeParse({ ...VALID_ORDER, paymentMethod: m }).success).toBe(true);
    });
  });
});

// ── MfaVerifySchema ───────────────────────────────────────────────
describe('MfaVerifySchema', () => {
  it('passes with valid data',        () => expect(MfaVerifySchema.safeParse({ userId: 'abc', token: '123456' }).success).toBe(true));
  it('fails — empty userId',          () => expect(MfaVerifySchema.safeParse({ userId: '',    token: '123456' }).success).toBe(false));
  it('fails — empty token',           () => expect(MfaVerifySchema.safeParse({ userId: 'abc', token: '' }).success).toBe(false));
  it('fails — missing both fields',   () => expect(MfaVerifySchema.safeParse({}).success).toBe(false));
});
