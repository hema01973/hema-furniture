// src/application/use-cases/CreateOrderUseCase.ts — HemaV066
// V064 FIX-MED-02: All monetary arithmetic (discount, cappedDiscount, shipping, total)
//   replaced with the Money value object to prevent IEEE-754 floating-point drift.
//   All totals stored in MongoDB are rounded to 2 decimal places via Money.toEGP().
// Previously the phone was validated only by the Zod regex in the route schema,
// which was not synchronized with the domain's EgyptianPhone.PATTERN. Now the
// single source of truth for phone validation is EgyptianPhone.validate().

import mongoose from 'mongoose';
import { productRepository, couponRepository, orderRepository } from '@/infrastructure/repositories';
import { getAuthSession } from '@/lib/auth';
import { calculateSubtotal, calculateShipping } from '@/lib/business';
import { logger } from '@/lib/logger';
import { EgyptianPhone } from '@/domain/shared/value-objects/EgyptianPhone';
import { Money } from '@/domain/shared/value-objects/Money';
import type { PaymentMethod } from '@/types';

export interface CreateOrderInput {
  customer:        { firstName: string; lastName: string; email: string; phone: string };
  shippingAddress: { street: string; city: string; governorate: string; postalCode?: string };
  items:           Array<{ productId: string; quantity: number; selectedColor?: string }>;
  paymentMethod:   PaymentMethod;
  couponCode?:     string;
  notes?:          string;
  idempotencyKey?: string;
}

export interface OrderItemResolved {
  productId:     string;
  nameEn:        string;
  nameAr:        string;
  price:         number;
  quantity:      number;
  image:         string;
  selectedColor?: string;
}

export interface CreateOrderResult {
  orderId:         string;
  orderNumber:     string;
  userId?:         string;
  guestEmail?:     string;
  customer:        CreateOrderInput['customer'];
  shippingAddress: CreateOrderInput['shippingAddress'];
  items:           OrderItemResolved[];
  subtotal:        number;
  discount:        number;
  shipping:        number;
  total:           number;
  paymentMethod:   PaymentMethod;
  notes?:          string;
  idempotencyKey?: string;
  isOnline:        boolean;
  warning?:        string;
}

export async function createOrderUseCase(input: CreateOrderInput): Promise<CreateOrderResult> {
  // ── Phone validation via domain Value Object (WEAK-ARCH-02) ──────
  // EgyptianPhone is the single source of truth for phone format validation.
  // This catches invalid numbers before any DB access.
  if (!EgyptianPhone.validate(input.customer.phone)) {
    throw Object.assign(
      new Error(`Invalid Egyptian phone number: ${input.customer.phone}. Must be in format 010XXXXXXXX, 011XXXXXXXX, 012XXXXXXXX, or 015XXXXXXXX`),
      { status: 400 },
    );
  }
  // Normalize to +20XXXXXXXXXX for consistent storage
  const normalizedPhone = EgyptianPhone.normalize(input.customer.phone);
  const normalizedInput = {
    ...input,
    customer: { ...input.customer, phone: normalizedPhone },
  };

  // ── Idempotency check ─────────────────────────────────────────────
  if (normalizedInput.idempotencyKey) {
    const existing = await orderRepository.findByIdempotencyKey(normalizedInput.idempotencyKey);
    if (existing) {
      logger.info('[CreateOrderUseCase] Idempotent replay', { idempotencyKey: input.idempotencyKey });
      const isOnline = existing.paymentMethod === 'paymob' || existing.paymentMethod === 'card';
      return {
        orderId:         existing.id,
        orderNumber:     existing.orderNumber,
        userId:          existing.userId,
        guestEmail:      existing.guestEmail,
        customer:        existing.customer,
        shippingAddress: existing.shippingAddress,
        items:           existing.items as OrderItemResolved[],
        subtotal:        existing.subtotal,
        discount:        existing.discount,
        shipping:        existing.shipping,
        total:           existing.total,
        paymentMethod:   existing.paymentMethod as PaymentMethod,
        notes:           existing.notes,
        idempotencyKey:  input.idempotencyKey,
        isOnline,
      };
    }
  }

  const session = await mongoose.startSession();
  // V059: Explicit transaction options — snapshot read concern prevents dirty reads
  // and phantom reads during concurrent order creation (stock contention).
  // writeConcern majority ensures durability before committing.
  session.startTransaction({
    readConcern:  { level: 'snapshot' },
    writeConcern: { w: 'majority' },
    readPreference: 'primary',
  });

  try {
    // ── Resolve products ────────────────────────────────────────────
    const productIds = normalizedInput.items.map(i => i.productId);
    const products   = await productRepository.findByIds(productIds, session);

    if (products.length !== productIds.length) {
      throw Object.assign(new Error('One or more products are unavailable'), { status: 404 });
    }

    // ── Build order items (price/name resolution only — stock NOT checked here) ──
    // ARCH-001 FIX (HemaV051): Removed read-then-validate stock check from this
    // loop. The previous pattern read stock, validated in memory, then decremented
    // later — two concurrent requests could both pass validation with stock=1 before
    // either decremented (TOCTOU race). Stock enforcement is now 100% in the atomic
    // findOneAndUpdate ($gte + $inc) call below. The only thing we do here is resolve
    // price/name from the already-fetched product documents (no extra DB reads).
    const cartItems: Array<{ price: number; quantity: number }> = [];
    const orderItems: OrderItemResolved[] = normalizedInput.items.map(item => {
      const product = products.find(p => p.id === item.productId);
      if (!product) throw Object.assign(new Error(`Product ${item.productId} not found`), { status: 404 });
      // Note: intentionally NOT checking product.stock here — that check was
      // the race condition. The atomic decrement below is the authoritative check.
      cartItems.push({ price: product.price, quantity: item.quantity });
      return {
        productId:     product.id,
        nameEn:        product.nameEn,
        nameAr:        product.nameAr,
        price:         product.price,
        quantity:      item.quantity,
        image:         product.images?.[0] ?? '',
        selectedColor: item.selectedColor,
      };
    });

    const subtotal = calculateSubtotal(cartItems);
    const authSession = await getAuthSession();
    const currentUserId = authSession?.user?.id;

    // ── Coupon resolution ────────────────────────────────────────────
    // MED-02 FIX (V064): All monetary arithmetic uses the Money value object
    // to prevent IEEE-754 floating-point drift on price/discount/total fields.
    let discountMoney = Money.zero();
    if (normalizedInput.couponCode) {
      const candidate = await couponRepository.findActiveByCode(normalizedInput.couponCode);
      if (candidate) {
        const now = new Date();
        const expiresOk   = !candidate.expiresAt || candidate.expiresAt > now;
        const usesOk      = candidate.maxUses == null || candidate.usedCount < candidate.maxUses;
        const minOrderOk  = subtotal >= candidate.minOrderValue;
        const userUsedCount = currentUserId
          ? candidate.usedBy.filter(id => id === currentUserId).length
          : 0;
        const perUserOk = !currentUserId || userUsedCount < candidate.perUserLimit;

        if (expiresOk && usesOk && minOrderOk && perUserOk) {
          const claimed = await couponRepository.claimCoupon(candidate.id, currentUserId, session);
          if (claimed) {
            const subtotalMoney = Money.fromEGP(subtotal);
            discountMoney = claimed.type === 'percentage'
              ? subtotalMoney.multiply(claimed.value / 100)
              : Money.fromEGP(claimed.value);
          }
        }
      }
    }

    // MED-02 FIX (V064): Cap discount, compute shipping and total via Money.
    // Money.subtract() is already capped at zero; explicit min cap for clarity.
    const subtotalMoney  = Money.fromEGP(subtotal);
    const cappedDiscount = discountMoney.greaterThan(subtotalMoney) ? subtotalMoney : discountMoney;
    const shippingRaw    = calculateShipping(subtotalMoney.toEGP(), cappedDiscount.toEGP());
    const shippingMoney  = Money.fromEGP(shippingRaw);
    const totalMoney     = subtotalMoney.subtract(cappedDiscount).add(shippingMoney);

    // All monetary values stored in MongoDB are rounded to 2 decimal places via .toEGP()
    const cappedDiscountNum = cappedDiscount.toEGP();
    const shippingNum       = shippingMoney.toEGP();
    const totalNum          = totalMoney.toEGP();

    // ── Effective payment method ──────────────────────────────────────
    const requestedIsOnline = normalizedInput.paymentMethod === 'paymob' || normalizedInput.paymentMethod === 'card';
    const effectiveMethod   = (requestedIsOnline && totalNum === 0) ? 'cod' : normalizedInput.paymentMethod;
    const isOnline          = effectiveMethod === 'paymob' || effectiveMethod === 'card';

    if (effectiveMethod === 'fawry' || effectiveMethod === 'valu') {
      throw Object.assign(
        new Error(`Payment method "${effectiveMethod}" is not yet available. Please choose Cash on Delivery or Card.`),
        { status: 501 },
      );
    }

    // ── ARCH-001 FIX: Atomic stock decrement BEFORE order save ────────────────
    // We decrement stock FIRST inside the transaction. If any item is sold out,
    // we abort before creating any order document — keeping the DB clean.
    // The findOneAndUpdate uses { stock: { $gte: quantity } } + { $inc: { stock: -quantity } }
    // which is atomic and prevents overselling even under high concurrency.
    for (const item of normalizedInput.items) {
      const success = await productRepository.decrementStock(item.productId, item.quantity, session);
      if (!success) {
        const product = products.find(p => p.id === item.productId);
        throw Object.assign(
          new Error(`"${product?.nameEn ?? 'Item'}" sold out — insufficient stock for your order`),
          { status: 409 },
        );
      }
    }

    // ── Persist order ─────────────────────────────────────────────────
    // MED-02 FIX (V064): All monetary fields use Money.toEGP() — stored as 2dp numbers.
    const savedOrder = await orderRepository.save({
      id:              '',
      orderNumber:     '',
      userId:          currentUserId ?? undefined,
      guestEmail:      authSession ? undefined : normalizedInput.customer.email,
      customer:        normalizedInput.customer,
      shippingAddress: normalizedInput.shippingAddress,
      items:           orderItems,
      subtotal,
      shipping:        shippingNum,
      discount:        cappedDiscountNum,
      total:           totalNum,
      paymentMethod:   effectiveMethod,
      notes:           normalizedInput.notes,
      status:          isOnline ? 'pending' : 'confirmed',
      paymentStatus:   'pending',
      idempotencyKey:  normalizedInput.idempotencyKey,
      createdAt:       new Date(),
      updatedAt:       new Date(),
    });

    // ARCH-001 FIX: Stock was already decremented atomically BEFORE order save.
    // The old loop here is removed to prevent double-decrement.

    await session.commitTransaction();
    session.endSession();

    logger.info('[CreateOrderUseCase] Order created', {
      orderNumber:   savedOrder.orderNumber,
      total:         totalNum,
      paymentMethod: effectiveMethod,
    });

    return {
      orderId:         savedOrder.id,
      orderNumber:     savedOrder.orderNumber,
      userId:          savedOrder.userId,
      guestEmail:      savedOrder.guestEmail,
      customer:        normalizedInput.customer,
      shippingAddress: normalizedInput.shippingAddress,
      items:           orderItems,
      subtotal,
      discount:        cappedDiscountNum,
      shipping:        shippingNum,
      total:           totalNum,
      paymentMethod:   effectiveMethod as PaymentMethod,
      notes:           normalizedInput.notes,
      idempotencyKey:  normalizedInput.idempotencyKey,
      isOnline,
    };

  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    throw error;
  }
}
