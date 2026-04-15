// src/lib/email.ts — Complete email suite: order, verification, reset, MFA, payment alerts
import nodemailer from 'nodemailer';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import type { IOrder } from '@/types';

const { window } = new JSDOM('');
const DOMPurify  = createDOMPurify(window as unknown as Window);
const s          = (v: string | number) => DOMPurify.sanitize(String(v));

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   ?? 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT ?? '587'),
  secure: process.env.SMTP_PORT   === '465',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const APP_URL  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://hemafurniture.com';
const FROM     = process.env.EMAIL_FROM ?? '"Hema Furniture" <no-reply@hemafurniture.com>';
const ADMIN_TO = process.env.ADMIN_ALERT_EMAIL ?? '';

function base(body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{margin:0;padding:0;background:#F2EDE6;font-family:Arial,sans-serif}
.w{max-width:600px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
.h{background:linear-gradient(135deg,#1A0F08,#3A2010);padding:36px;text-align:center}
.h h1{font-family:Georgia,serif;font-size:26px;color:#FAF8F5;margin:0 0 6px}
.h p{font-size:12px;color:#B8935A;letter-spacing:2px;margin:0}
.b{padding:36px}.btn{display:inline-block;background:#B8935A;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin:20px 0}
.warn{background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:14px;margin:12px 0}
.danger{background:#FEE2E2;border:1px solid #EF4444;border-radius:8px;padding:14px;margin:12px 0}
.foot{background:#0E0904;padding:18px;text-align:center;font-size:12px;color:#6A5A48}
</style></head><body><div class="w">
<div class="h"><h1>Hema Modern Furniture</h1><p>هيما للأثاث العصري</p></div>
<div class="b">${body}</div>
<div class="foot">© ${new Date().getFullYear()} Hema Modern Furniture · New Cairo, Egypt<br>hello@hemafurniture.com · +20 100 000 0000</div>
</div></body></html>`;
}

async function send(to: string, subject: string, html: string) {
  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('[Email send error]', e);
    throw e;
  }
}

export async function sendOrderConfirmation(order: IOrder) {
  const rows = order.items.map(i =>
    `<tr><td style="padding:10px 0;font-size:14px">${s(i.nameEn)}</td>
     <td style="padding:10px 0;text-align:center;font-size:14px">×${s(i.quantity)}</td>
     <td style="padding:10px 0;text-align:right;font-size:14px;color:#B8935A">EGP ${s((i.price*i.quantity).toLocaleString())}</td></tr>`
  ).join('');

  await send(
    order.customer.email,
    `Order Confirmed — ${order.orderNumber} | Hema Furniture`,
    base(`
      <h2 style="color:#1A1208">Order Confirmed! ✅</h2>
      <p style="color:#8A7F75">Order <strong>${s(order.orderNumber)}</strong></p>
      <p><strong>${s(order.customer.firstName)} ${s(order.customer.lastName)}</strong><br>
      ${s(order.shippingAddress.street)}, ${s(order.shippingAddress.city)}</p>
      <table style="width:100%;border-collapse:collapse;border-top:2px solid #E8DDD0">
        <tr style="border-bottom:1px solid #E8DDD0"><th style="text-align:left;padding:8px 0;font-size:12px;color:#8A7F75">ITEM</th>
        <th style="font-size:12px;color:#8A7F75">QTY</th><th style="text-align:right;font-size:12px;color:#8A7F75">TOTAL</th></tr>
        ${rows}
      </table>
      <div style="border-top:1px solid #E8DDD0;padding-top:12px;margin-top:8px">
        <p style="margin:4px 0;font-size:14px;display:flex;justify-content:space-between"><span>Shipping</span><span>${order.shipping===0?'Free':'EGP '+s(order.shipping)}</span></p>
        <p style="font-size:18px;font-weight:bold;display:flex;justify-content:space-between"><span>Total</span><span style="color:#B8935A">EGP ${s(order.total.toLocaleString())}</span></p>
      </div>
      <div style="text-align:center"><a class="btn" href="${APP_URL}/orders">Track Your Order</a></div>
    `)
  );
}

export async function sendVerificationEmail(email: string, token: string, name: string) {
  const link = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  await send(
    email, 'Verify Your Email — Hema Furniture',
    base(`
      <h2 style="color:#1A1208">Verify Your Email 📧</h2>
      <p>Hi <strong>${s(name)}</strong>! Click below to confirm your email and activate your account.</p>
      <div style="text-align:center"><a class="btn" href="${link}">Verify Email Address</a></div>
      <p style="color:#8A7F75;font-size:13px">Link expires in <strong>24 hours</strong>. If you didn't register, ignore this.</p>
    `)
  );
}

export async function sendPasswordReset(email: string, token: string) {
  const link = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await send(
    email, 'Reset Your Password — Hema Furniture',
    base(`
      <h2 style="color:#1A1208">Reset Your Password 🔐</h2>
      <p>We received a request to reset your password.</p>
      <div style="text-align:center"><a class="btn" href="${link}">Reset Password</a></div>
      <p style="color:#8A7F75;font-size:13px">This link expires in <strong>1 hour</strong>. If you didn't request this, your account is safe.</p>
    `)
  );
}

export async function sendWelcomeEmail(name: string, email: string) {
  await send(
    email, 'Welcome to Hema Furniture! 🛋️',
    base(`
      <h2 style="color:#1A1208">Welcome, ${s(name)}! 🎉</h2>
      <p>Thank you for joining Hema Modern Furniture. Discover our premium collection.</p>
      <div style="text-align:center"><a class="btn" href="${APP_URL}/shop">Browse Collection</a></div>
      <div class="warn"><strong>🎁 New member offer:</strong> Use code <strong>WELCOME10</strong> for 10% off!</div>
    `)
  );
}

export async function sendPaymentFailedEmail(order: IOrder) {
  await send(
    order.customer.email,
    `Payment Issue — Order ${order.orderNumber} | Hema Furniture`,
    base(`
      <h2 style="color:#1A1208">Payment Issue ⚠️</h2>
      <div class="danger"><strong>Your payment for order ${s(order.orderNumber)} was not completed.</strong></div>
      <p>Don't worry — your order is saved. You can retry payment from your orders page.</p>
      <div style="text-align:center"><a class="btn" href="${APP_URL}/orders">Retry Payment</a></div>
      <p style="color:#8A7F75;font-size:13px">Total: <strong>EGP ${s(order.total.toLocaleString())}</strong></p>
    `)
  );
}

export async function sendAdminPaymentAlert(order: IOrder, reason: string) {
  if (!ADMIN_TO) return;
  await send(
    ADMIN_TO, `🚨 Payment Failed — ${order.orderNumber}`,
    base(`
      <h2 style="color:#1A1208">🚨 Payment Failure Alert</h2>
      <div class="danger"><strong>Order ${s(order.orderNumber)} — payment failed</strong><br>Reason: ${s(reason)}</div>
      <table style="width:100%;font-size:14px;margin:16px 0">
        <tr><td style="color:#8A7F75">Customer</td><td>${s(order.customer.firstName)} ${s(order.customer.lastName)}</td></tr>
        <tr><td style="color:#8A7F75">Email</td><td>${s(order.customer.email)}</td></tr>
        <tr><td style="color:#8A7F75">Total</td><td>EGP ${s(order.total.toLocaleString())}</td></tr>
      </table>
      <div style="text-align:center"><a class="btn" href="${APP_URL}/admin/orders">View in Admin</a></div>
    `)
  );
}
