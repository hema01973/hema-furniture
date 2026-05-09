// src/app/api/v1/orders/[id]/retry-payment/route.ts — HemaV066
// V064 FIX-CRIT-03: Added rateMax:5/60s.
// V039: validateObjectId moved to first check (VULN-02, V38-03)
// V031: re-validates stock before charging
import { NextRequest } from 'next/server';
import { connectDB, Order, Product } from '@/lib/mongodb';
import { ok, err, withErrorHandler, validateObjectId } from '@/lib/api';
import { requirePermission, requireOwnership } from '@/lib/authz';

type Ctx = { params: { id: string } };

export const POST = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;
  // V039: validateObjectId first — consistent with all other order routes
  // Hema033 FIX [HIGH-01]: validate ObjectId format before hitting MongoDB
  const idErr = validateObjectId(params.id);
  if (idErr) return idErr;
  const auth = await requirePermission(req, 'read:order:own');
  if (!auth.ok) return auth.response;
  const session = auth.session;
  {
    await connectDB();
    const order = await (Order.findById as any)(params.id);
    if (!order) return err('Order not found', 404);
    const ownErr = requireOwnership(session, order.userId?.toString(), 'read:order:any');
    if (ownErr) return ownErr;
    if (order.paymentMethod === 'cod') return err('COD orders cannot retry online payment', 400);
    if (!['failed','pending'].includes(order.paymentStatus)) return err(`Payment already ${order.paymentStatus}`, 400);
    if (['delivered','cancelled'].includes(order.status)) return err('Cannot retry on completed/cancelled order', 400);

    // ✅ FIX: re-validate stock before allowing customer to pay again.
    // Stock may have dropped to 0 since the original order was placed.
    const productIds = (order.items as Array<{ productId: { toString(): string }; quantity: number; nameEn?: string }>)
      .map(i => i.productId.toString());
    const products = (await (Product.find as any)({ _id: { $in: productIds }, isActive: true }).lean()) as unknown as Array<{ _id: { toString(): string }; stock: number }>;
    for (const item of order.items as Array<{ productId: { toString(): string }; quantity: number; nameEn?: string }>) {
      const p = products.find(x => x._id.toString() === item.productId.toString());
      if (!p) return err(`"${item.nameEn ?? 'Item'}" is no longer available`, 409);
      if (p.stock < item.quantity) {
        return err(`"${item.nameEn ?? 'Item'}" only has ${p.stock} unit(s) in stock`, 409);
      }
    }

    try {
      const { createPaymobSession } = await import('@/lib/paymob');
      // V010 FIX (B3): SECURITY — all monetary values sent to Paymob MUST be integer
      // minor units (cents). Floating-point multiplication (e.g. 1.10 * 100 =
      // 110.00000000000001) produces non-integer values that Paymob rejects or rounds
      // unpredictably. Math.round() mirrors the fix already applied in order.service.ts
      // (V009). This path was missed during that sprint.
      const { iframeUrl, paymobOrderId } = await createPaymobSession(
        {
          amount: Math.round(order.total * 100),
          items:  order.items.map((i: { nameEn: string; price: number; quantity: number }) => ({
            name:         i.nameEn,
            amount_cents: Math.round(i.price * 100),
            description:  i.nameEn,
            quantity:     i.quantity,
          })),
        },
        { firstName: order.customer.firstName, lastName: order.customer.lastName, email: order.customer.email, phone: order.customer.phone, city: order.shippingAddress.city }
      );
      order.paymentStatus  = 'pending';
      order.paymobOrderId  = paymobOrderId.toString();
      await order.save();
      return ok({ iframeUrl, orderId: order._id });
    } catch {
      return err('Payment gateway unavailable. Please try again later.', 502);
    }
  }
}, { rateMax: 5, rateWindow: 60 }); // CRIT-03 FIX (V064)
