// src/lib/paymob.ts
/**
 * Paymob Payment Gateway Integration (Egypt)
 * Docs: https://docs.paymob.com/
 *
 * Flow:
 * 1. Authenticate → get auth_token
 * 2. Create order → get order ID
 * 3. Create payment key → get payment_key
 * 4. Redirect to iframe
 */

const PAYMOB_BASE = 'https://accept.paymob.com/api';

export interface PaymobOrder {
  amount: number;          // in cents (EGP × 100)
  currency?: string;
  items: Array<{
    name: string;
    amount_cents: number;
    description: string;
    quantity: number;
  }>;
}

export interface PaymobCustomer {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  country?: string;
  street?: string;
  building?: string;
  floor?: string;
}

// ─── Step 1: Get auth token ──────────────────────────────────
async function getAuthToken(): Promise<string> {
  const res = await fetch(`${PAYMOB_BASE}/auth/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: process.env.PAYMOB_API_KEY }),
  });
  if (!res.ok) throw new Error('Paymob auth failed');
  const data = await res.json();
  return data.token;
}

// ─── Step 2: Register order ──────────────────────────────────
async function registerOrder(authToken: string, order: PaymobOrder): Promise<number> {
  const res = await fetch(`${PAYMOB_BASE}/ecommerce/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_token:        authToken,
      delivery_needed:   false,
      amount_cents:      order.amount,
      currency:          order.currency ?? 'EGP',
      merchant_order_id: `HEMA-${Date.now()}`,
      items:             order.items,
    }),
  });
  if (!res.ok) throw new Error('Paymob order registration failed');
  const data = await res.json();
  return data.id;
}

// ─── Step 3: Get payment key ─────────────────────────────────
async function getPaymentKey(
  authToken: string,
  paymobOrderId: number,
  amount: number,
  customer: PaymobCustomer
): Promise<string> {
  const res = await fetch(`${PAYMOB_BASE}/acceptance/payment_keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_token:     authToken,
      amount_cents:   amount,
      expiration:     3600,
      order_id:       paymobOrderId,
      currency:       'EGP',
      integration_id: parseInt(process.env.PAYMOB_INTEGRATION_ID!),
      billing_data: {
        first_name:   customer.firstName,
        last_name:    customer.lastName,
        email:        customer.email,
        phone_number: customer.phone,
        city:         customer.city,
        country:      customer.country ?? 'EG',
        street:       customer.street ?? 'N/A',
        building:     customer.building ?? 'N/A',
        floor:        customer.floor ?? 'N/A',
        apartment:    'N/A',
        shipping_method: 'PKG',
        postal_code:  'N/A',
        state:        'N/A',
      },
    }),
  });
  if (!res.ok) throw new Error('Paymob payment key failed');
  const data = await res.json();
  return data.token;
}

// ─── Main: Create full payment session ───────────────────────
export async function createPaymobSession(
  order: PaymobOrder,
  customer: PaymobCustomer
): Promise<{ iframeUrl: string; paymobOrderId: number }> {
  const authToken = await getAuthToken();
  const paymobOrderId = await registerOrder(authToken, order);
  const paymentKey = await getPaymentKey(authToken, paymobOrderId, order.amount, customer);
  const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID}?payment_token=${paymentKey}`;
  return { iframeUrl, paymobOrderId };
}

// ─── Verify webhook HMAC ─────────────────────────────────────
import crypto from 'crypto';

export function verifyPaymobWebhook(
  data: Record<string, string>,
  receivedHmac: string
): boolean {
  const keys = [
    'amount_cents','created_at','currency','error_occured','has_parent_transaction',
    'id','integration_id','is_3d_secure','is_auth','is_capture','is_refunded',
    'is_standalone_payment','is_voided','order','owner','pending','source_data.pan',
    'source_data.sub_type','source_data.type','success',
  ];
  const concatenated = keys.map(k => data[k] ?? '').join('');
  const hmac = crypto
    .createHmac('sha512', process.env.PAYMOB_HMAC_SECRET!)
    .update(concatenated)
    .digest('hex');
  return hmac === receivedHmac;
}
