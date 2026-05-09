// src/services/order.service.ts — HemaV066
// ADV-02 FIX (V066): Removed `as unknown as IOrder` unsafe type cast. The email queue
//   now accepts EmailOrderPayload directly. enqueueEmail type updated to accept union.
// HemaV050 preserved below:
// WEAK-ARCH-01 FIX: replaced `as unknown as IOrder` double type cast with explicit
// typed result object. The cast was unsafe because CreateOrderResult has a different
// shape than IOrder (orderId vs _id, missing createdAt/status/paymentStatus).
// Passing a structurally-wrong object to enqueueEmail caused silent failures when
// the email template accessed missing fields. Now we pass only the fields we have.

import { enqueueEmail }           from '@/lib/queue';
import { logger }                 from '@/lib/logger';
import { createOrderUseCase }     from '@/application/use-cases/CreateOrderUseCase';
import { initiatePaymentUseCase } from '@/application/use-cases/InitiatePaymentUseCase';
import type { IOrder, PaymentMethod } from '@/types';

export interface CreateOrderInput {
  customer:        { firstName: string; lastName: string; email: string; phone: string };
  shippingAddress: { street: string; city: string; governorate: string; postalCode?: string };
  items:           Array<{ productId: string; quantity: number; selectedColor?: string }>;
  paymentMethod:   PaymentMethod;
  couponCode?:     string;
  notes?:          string;
  idempotencyKey?: string;
}

// WEAK-ARCH-01 FIX: CreateOrderResult now explicitly carries all fields needed
// by the email queue so we avoid the unsafe `as unknown as IOrder` cast.
// The email system receives a typed EmailOrderPayload instead of a misshapen IOrder.
export interface EmailOrderPayload {
  orderId:         string;
  orderNumber:     string;
  customer:        CreateOrderInput['customer'];
  shippingAddress: CreateOrderInput['shippingAddress'];
  items:           Array<{ nameEn: string; price: number; quantity: number; image: string }>;
  subtotal:        number;
  discount:        number;
  shipping:        number;
  total:           number;
  paymentMethod:   PaymentMethod;
  notes?:          string;
}

export interface CreateOrderResult {
  order:     EmailOrderPayload;
  iframeUrl: string | null;
  warning?:  string;
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  // Step 1: Create and persist the order (handles stock + coupon atomically)
  const orderResult = await createOrderUseCase(input);

  // Build the typed email payload — no unsafe type cast needed
  const emailPayload: EmailOrderPayload = {
    orderId:         orderResult.orderId,
    orderNumber:     orderResult.orderNumber,
    customer:        orderResult.customer,
    shippingAddress: orderResult.shippingAddress,
    items:           orderResult.items.map(i => ({
      nameEn:   i.nameEn,
      price:    i.price,
      quantity: i.quantity,
      image:    i.image,
    })),
    subtotal:      orderResult.subtotal,
    discount:      orderResult.discount,
    shipping:      orderResult.shipping,
    total:         orderResult.total,
    paymentMethod: orderResult.paymentMethod,
    notes:         orderResult.notes,
  };

  // Step 2: Send COD confirmation email immediately
  if (!orderResult.isOnline) {
    enqueueEmail({
      type:  'orderConfirmation',
      // ADV-02 FIX (V066): EmailOrderPayload passed directly — no unsafe type cast.
      // The email template only uses fields available in EmailOrderPayload.
      order: emailPayload,
    }).catch(() => {});
  }

  // Step 3: Initiate online payment session if needed
  let iframeUrl: string | null = null;
  let warning:   string | undefined;

  if (orderResult.isOnline) {
    const paymentResult = await initiatePaymentUseCase({
      orderId:     orderResult.orderId,
      orderNumber: orderResult.orderNumber,
      total:       orderResult.total,
      items:       orderResult.items.map(i => ({
        nameEn:    i.nameEn,
        price:     i.price,
        quantity:  i.quantity,
        productId: i.productId,
      })),
      customer: {
        firstName: orderResult.customer.firstName,
        lastName:  orderResult.customer.lastName,
        email:     orderResult.customer.email,
        phone:     orderResult.customer.phone,
        city:      orderResult.shippingAddress.city,
      },
    });

    iframeUrl = paymentResult.iframeUrl;
    warning   = paymentResult.warning;
  }

  logger.info('[OrderService] createOrder complete', {
    orderNumber: orderResult.orderNumber,
    total:       orderResult.total,
    isOnline:    orderResult.isOnline,
  });

  return { order: emailPayload, iframeUrl, warning };
}
