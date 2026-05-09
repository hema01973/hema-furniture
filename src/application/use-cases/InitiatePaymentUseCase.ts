// src/application/use-cases/InitiatePaymentUseCase.ts — HemaV050
// Launches a Paymob payment session for a confirmed order.
// No Mongoose model imports — all persistence via orderRepository.

import { orderRepository, productRepository } from '@/infrastructure/repositories';
import { logger } from '@/lib/logger';
import { enqueueEmail } from '@/lib/queue';
import type { IOrder } from '@/types';

export interface InitiatePaymentInput {
  orderId:     string;
  orderNumber: string;
  total:       number;
  items: Array<{
    nameEn:    string;
    price:     number;
    quantity:  number;
    productId: string;
  }>;
  customer: {
    firstName: string;
    lastName:  string;
    email:     string;
    phone:     string;
    city:      string;
  };
}

export interface InitiatePaymentResult {
  iframeUrl: string | null;
  warning?:  string;
}

export async function initiatePaymentUseCase(
  input: InitiatePaymentInput,
): Promise<InitiatePaymentResult> {
  try {
    const { createPaymobSession } = await import('@/lib/paymob');
    const paymobResult = await createPaymobSession(
      {
        amount: Math.round(input.total * 100),
        items:  input.items.map(i => ({
          name:         i.nameEn,
          amount_cents: Math.round(i.price * 100),
          description:  i.nameEn,
          quantity:     i.quantity,
        })),
      },
      {
        firstName: input.customer.firstName,
        lastName:  input.customer.lastName,
        email:     input.customer.email,
        phone:     input.customer.phone,
        city:      input.customer.city,
      },
    );

    await orderRepository.updatePaymentStatus(input.orderId, 'pending', {
      paymobOrderId: paymobResult.paymobOrderId.toString(),
    });

    return { iframeUrl: paymobResult.iframeUrl };

  } catch (e) {
    const reason = e instanceof Error ? e.message : 'Unknown error';
    logger.error('[InitiatePaymentUseCase] Paymob session failed', {
      orderNumber: input.orderNumber,
      reason,
    });

    // Restore stock for all items
    try {
      for (const item of input.items) {
        await productRepository.incrementStock(item.productId, item.quantity);
      }
    } catch (restoreErr) {
      logger.error('[InitiatePaymentUseCase] Stock restoration FAILED — needs manual reconcile', {
        orderNumber: input.orderNumber,
        error: restoreErr instanceof Error ? restoreErr.message : String(restoreErr),
      });
    }

    await orderRepository.updatePaymentStatus(input.orderId, 'failed');

    // Enqueue failure notifications (fire-and-forget)
    const orderStub = { orderNumber: input.orderNumber, _id: input.orderId } as unknown as IOrder;
    enqueueEmail({ type: 'paymentFailed',    order: orderStub }).catch(() => {});
    enqueueEmail({ type: 'adminPaymentAlert', order: orderStub, reason }).catch(() => {});

    return {
      iframeUrl: null,
      warning:   'Payment session could not be created. Retry from your orders page.',
    };
  }
}
