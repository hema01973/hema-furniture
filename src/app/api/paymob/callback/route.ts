// src/app/api/paymob/callback/route.ts

// ✅ أضفنا NextResponse هنا
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Order } from '@/lib/mongodb';
import { verifyPaymobWebhook } from '@/lib/paymob';
import { ok, err, withErrorHandler } from '@/lib/api';
import { enqueueEmail } from '@/lib/queue';

// POST /api/paymob/callback — webhook from Paymob
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await req.json();
  const { obj, hmac } = body;

  if (!verifyPaymobWebhook(obj, hmac)) return err('Invalid HMAC signature', 401);

  await connectDB();
  const paymobOrderId = obj.order?.id?.toString();
  const success       = obj.success === true || obj.success === 'true';

  const order = await Order.findOne({ paymobOrderId });
  if (!order) return ok({ received: true }); // idempotent

  if (success) {
    order.paymentStatus = 'paid';
    order.status        = 'confirmed';
  } else {
    order.paymentStatus = 'failed';
  }
  await order.save();

  if (success) {
    enqueueEmail({ type: 'orderConfirmation', order: order.toObject() }).catch(() => {});
  }

  return ok({ received: true });
});

// GET — browser redirect after Paymob iframe
// ✅ أضفنا ', ctx: unknown' وغيّرنا Response → NextResponse
export const GET = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const url     = new URL(req.url);
  const success = url.searchParams.get('success') === 'true';
  const orderId = url.searchParams.get('order');
  const dest    = success ? `/success?order=${orderId}` : `/checkout?payment_failed=1`;
  
  // ✅ غيّرنا من Response.redirect إلى NextResponse.redirect
  return NextResponse.redirect(new URL(dest, process.env.NEXT_PUBLIC_APP_URL!));
});