// POST /api/orders/:id/retry-payment
import { NextRequest } from 'next/server';
import { connectDB, Order } from '@/lib/mongodb';
import { ok, err, withErrorHandler, withAuth } from '@/lib/api';

type Ctx = { params: { id: string } };

export const POST = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;
  return withAuth(req, async (_req, session) => {
    await connectDB();
    const order = await Order.findById(params.id);
    if (!order) return err('Order not found', 404);
    if (session!.user.role === 'customer' && order.userId?.toString() !== session!.user.id) return err('Forbidden', 403);
    if (order.paymentMethod === 'cod') return err('COD orders cannot retry online payment', 400);
    if (!['failed','pending'].includes(order.paymentStatus)) return err(`Payment already ${order.paymentStatus}`, 400);
    if (['delivered','cancelled'].includes(order.status)) return err('Cannot retry on completed/cancelled order', 400);

    try {
      const { createPaymobSession } = await import('@/lib/paymob');
      const { iframeUrl, paymobOrderId } = await createPaymobSession(
        { amount: order.total * 100, items: order.items.map((i: { nameEn: string; price: number; quantity: number }) => ({ name: i.nameEn, amount_cents: i.price * 100, description: i.nameEn, quantity: i.quantity })) },
        { firstName: order.customer.firstName, lastName: order.customer.lastName, email: order.customer.email, phone: order.customer.phone, city: order.shippingAddress.city }
      );
      order.paymentStatus  = 'pending';
      order.paymobOrderId  = paymobOrderId.toString();
      await order.save();
      return ok({ iframeUrl, orderId: order._id });
    } catch (e) {
      return err('Payment gateway unavailable. Please try again later.', 502);
    }
  });
});
