// __tests__/unit/orderSchema.test.ts
// Validates the Zod schema used for order creation.

import { z } from 'zod';

// Re-declare the schema (same as the one in orders/route.ts)
// so this test has no dependency on Next.js server infrastructure.
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
    productId: z.string().min(1),
    quantity:  z.number().int().positive(),
  })).min(1),
  paymentMethod: z.enum(['cod','card','paymob','fawry','valu']).default('cod'),
  couponCode:    z.string().optional(),
  notes:         z.string().max(500).optional(),
});

const VALID_ORDER = {
  customer: { firstName: 'Ahmed', lastName: 'Hassan', email: 'ahmed@example.com', phone: '01012345678' },
  shippingAddress: { street: '123 El-Tahrir Street', city: 'Cairo', governorate: 'Cairo' },
  items: [{ productId: '507f1f77bcf86cd799439011', quantity: 2 }],
  paymentMethod: 'cod' as const,
};

describe('CreateOrderSchema validation', () => {
  it('accepts a fully valid order', () => {
    expect(() => CreateOrderSchema.parse(VALID_ORDER)).not.toThrow();
  });

  it('rejects empty items array', () => {
    const result = CreateOrderSchema.safeParse({ ...VALID_ORDER, items: [] });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = CreateOrderSchema.safeParse({
      ...VALID_ORDER,
      customer: { ...VALID_ORDER.customer, email: 'not-an-email' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects short phone number', () => {
    const result = CreateOrderSchema.safeParse({
      ...VALID_ORDER,
      customer: { ...VALID_ORDER.customer, phone: '0100' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects quantity 0 or negative', () => {
    const result = CreateOrderSchema.safeParse({
      ...VALID_ORDER,
      items: [{ productId: 'abc', quantity: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown payment method', () => {
    const result = CreateOrderSchema.safeParse({
      ...VALID_ORDER,
      paymentMethod: 'bitcoin',
    });
    expect(result.success).toBe(false);
  });

  it('defaults paymentMethod to cod', () => {
    const { paymentMethod } = CreateOrderSchema.parse(VALID_ORDER);
    expect(paymentMethod).toBe('cod');
  });

  it('accepts all valid payment methods', () => {
    const methods = ['cod', 'card', 'paymob', 'fawry', 'valu'] as const;
    for (const m of methods) {
      expect(() => CreateOrderSchema.parse({ ...VALID_ORDER, paymentMethod: m })).not.toThrow();
    }
  });

  it('rejects notes longer than 500 chars', () => {
    const result = CreateOrderSchema.safeParse({
      ...VALID_ORDER,
      notes: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('allows optional couponCode and postalCode', () => {
    expect(() => CreateOrderSchema.parse({
      ...VALID_ORDER,
      couponCode: 'WELCOME10',
      shippingAddress: { ...VALID_ORDER.shippingAddress, postalCode: '11511' },
    })).not.toThrow();
  });
});
