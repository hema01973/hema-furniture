// src/... — HemaV050: pure business logic functions (testable, no side effects)
// These are extracted from services to be 100% unit-testable without DB or external deps

import { FREE_SHIPPING_THRESHOLD, SHIPPING_COST } from './constants';

// ── Pricing ───────────────────────────────────────────────────────

export interface CartItem {
  price:    number;
  quantity: number;
}

export interface CouponData {
  type:          'percentage' | 'fixed';
  value:         number;
  minOrderValue: number;
  maxUses?:      number;
  usedCount?:    number;
  expiresAt?:    Date | null;
  isActive:      boolean;
}

/** Calculate raw subtotal from cart items */
export function calculateSubtotal(items: CartItem[]): number {
  if (!items.length) return 0;
  // V010 FIX (Financial): accumulate in integer piastres to prevent IEEE-754 drift.
  // Naive float addition (sum + price * qty) produces artifacts like
  // 1.10 * 3 = 3.3000000000000003 that cascade into wrong totals, false
  // zero-total guards, and incorrect Paymob cent conversions.
  // Strategy: convert each unit price to integer piastres with Math.round FIRST,
  // multiply by the (always-integer) quantity, then divide back to EGP only at
  // the very end. This keeps the entire accumulation in integer arithmetic.
  const totalPiastres = items.reduce((piastres, item) => {
    if (item.price < 0 || item.quantity < 0) throw new Error('Price and quantity must be non-negative');
    return piastres + Math.round(item.price * 100) * item.quantity;
  }, 0);
  return totalPiastres / 100;
}

/** Calculate shipping cost based on subtotal after discount */
export function calculateShipping(subtotal: number, discount = 0): number {
  const subtotalAfterDiscount = Math.max(0, subtotal - discount);
  return subtotalAfterDiscount >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
}

/** Validate and apply a coupon — returns discount amount (0 if invalid) */
function applyCouponAmount(subtotal: number, coupon: CouponData): number {
  if (!coupon.isActive)                                       return 0;
  if (coupon.expiresAt && coupon.expiresAt < new Date())      return 0;
  if (coupon.maxUses && (coupon.usedCount ?? 0) >= coupon.maxUses) return 0;
  if (subtotal < coupon.minOrderValue)                        return 0;

  if (coupon.type === 'percentage') {
    if (coupon.value <= 0 || coupon.value > 100) return 0;
    return Math.round((subtotal * coupon.value) / 100);
  }

  if (coupon.type === 'fixed') {
    return Math.min(coupon.value, subtotal); // discount can't exceed subtotal
  }

  return 0;
}

export function applyCoupon(subtotal: number, coupon: CouponData): number;
export function applyCoupon(coupon: { type: 'percentage' | 'fixed'; value: number }, subtotal: number): { discount: number };
export function applyCoupon(a: number | { type: 'percentage' | 'fixed'; value: number }, b: CouponData | number): number | { discount: number } {
  if (typeof a === 'number' && typeof b !== 'number') {
    return applyCouponAmount(a, b);
  }
  const coupon = { ...(a as { type: 'percentage' | 'fixed'; value: number }), minOrderValue: 0, isActive: true } as CouponData;
  const subtotal = b as number;
  return { discount: applyCouponAmount(subtotal, coupon) };
}

/** Calculate final order total */
export interface OrderTotals {
  subtotal: number;
  discount: number;
  shipping: number;
  total:    number;
}

export function calculateOrderTotals(
  items:   CartItem[],
  coupon?: CouponData | null,
): OrderTotals {
  const subtotal = calculateSubtotal(items);
  if (items.length > 0 && subtotal <= 0 && !coupon) {
    throw new Error('Order total must be greater than zero');
  }
  const discount = coupon ? (applyCoupon(subtotal, coupon) as number) : 0;
  const shipping = (subtotal > 0 && discount >= subtotal) ? 0 : calculateShipping(subtotal - discount);
  // V010 FIX (Financial): round final total to 2 decimal places.
  // Even with piastre-level accumulation in calculateSubtotal, the
  // discount (Math.round) / 100 and shipping (integer constant) arithmetic
  // can still produce sub-piaster float residue. A single Math.round at the
  // total level is the definitive fix — and matches what Paymob requires.
  const total    = Math.round(Math.max(0, subtotal - discount + shipping) * 100) / 100;

  // V010 (W14): refuse a $0 total unless the only legitimate reason is a
  // 100%-off coupon that explicitly opted into a $0 charge. Without this
  // guard, a stock-zero/edge-case cart could slip past the order pipeline
  // and create a paid-but-unbilled order.
  if (items.length > 0 && total <= 0) {
    const couponCoversAll = !!coupon
      && coupon.isActive
      && discount >= subtotal
      && shipping === 0;
    if (!couponCoversAll) {
      throw new Error('Order total must be greater than zero');
    }
  }

  return { subtotal, discount, shipping, total };
}

// ── Order validation ──────────────────────────────────────────────

export interface StockCheckItem {
  productId: string;
  available: number;
  requested: number;
  nameEn:    string;
}

export interface StockCheckResult {
  valid:   boolean;
  errors:  string[];
}

/** Check stock availability for all items in the cart */
export function checkStockAvailability(items: StockCheckItem[]): StockCheckResult {
  const errors: string[] = [];
  for (const item of items) {
    if (item.requested <= 0) {
      errors.push(`${item.nameEn}: quantity must be at least 1`);
    } else if (item.available < item.requested) {
      errors.push(`"${item.nameEn}" only has ${item.available} unit${item.available !== 1 ? 's' : ''} in stock`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// ── Order number generation ───────────────────────────────────────

/** Generate a formatted order number from a sequence integer */
export function formatOrderNumber(seq: number, year = new Date().getFullYear()): string {
  if (seq <= 0) throw new Error('Sequence must be a positive integer');
  return `HEM-${year}-${String(seq).padStart(5, '0')}`;
}

// ── Payment ───────────────────────────────────────────────────────

/** Convert EGP to Paymob cents */
export function egpToCents(egp: number): number {
  if (egp < 0) throw new Error('Amount cannot be negative');
  return Math.round(egp * 100);
}

/** Check if a payment method requires an online payment session */
export function requiresOnlinePayment(method: string): boolean {
  return method === 'paymob' || method === 'card';
}

// ── Password validation ───────────────────────────────────────────

export interface PasswordValidationResult {
  valid:  boolean;
  errors: string[];
}

/** Validate password strength without hashing */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];
  if (password.length < 8)         errors.push('Must be at least 8 characters');
  if (password.length > 128)       errors.push('Must be at most 128 characters');
  if (!/[A-Z]/.test(password))     errors.push('Must contain at least one uppercase letter');
  if (!/[0-9]/.test(password))     errors.push('Must contain at least one number');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Must contain at least one special character');
  return { valid: errors.length === 0, errors };
}

// ── Product ───────────────────────────────────────────────────────

/** Determine badge label from pricing */
export function computeBadge(
  price:    number,
  oldPrice: number | undefined,
  stock:    number,
): string | null {
  if (stock <= 0)           return null;
  if (stock <= 5)           return 'Limited';
  if (oldPrice && oldPrice > price) return 'Sale';
  return null;
}

/** Build a URL-safe slug from a product name */
export function buildSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 100);
}
