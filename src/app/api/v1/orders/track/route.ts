// src/... — HemaV066: Guest order tracking
// V064 FIX-MED-04: Tightened rate limit to rateMax:3/60s. Added fixed 200ms delay on
//   failed lookups to prevent timing-based enumeration. Always returns same generic 404.
// ──────────────────────────────────────────────────────────────────
// V015 WEAKNESS: Guest orders had no way to be tracked after placement.
// The schema stored `guestEmail` but every order lookup endpoint required
// authentication — guests who never registered were left with no recourse.
//
// V016 FIX: This unauthenticated endpoint lets a guest look up their order
// by providing both the order number AND their email address.
//
// Security measures:
// • Requires BOTH orderId/orderNumber AND guestEmail — neither alone is enough.
// • guestEmail is compared case-insensitively after normalisation.
// • Rate-limited (10 requests / 10 minutes per IP) to prevent enumeration.
// • Never reveals whether the order number exists without a matching email.
// • Only exposes fields appropriate for a guest (no internal IDs, no pv, etc.).
// • Does NOT expose authenticated user orders (userId must be absent / null).

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectDB, Order } from '@/lib/mongodb';
import { ok, err, withErrorHandler, validateBody } from '@/lib/api';

const Schema = z.object({
  /** Order number in display format e.g. "HEM-2026-00042" */
  // V039 FIX [MED-03]: enforce HEM-YYYY-NNNNN format to prevent arbitrary string
  // enumeration probing and wasted DB queries on malformed input.
  orderNumber: z.string()
    .regex(/^HEM-\d{4}-\d{5}$/, 'Invalid order number format (expected: HEM-YYYY-NNNNN)')
    .toUpperCase(),
  /** Email the guest used at checkout */
  email: z.string().email().toLowerCase(),
});

// Fields safe to expose to an unauthenticated guest.
// V040 FIX [MED-02]: removed shippingAddress, customer.name, and notes.
// HIGH-004 FIX (V068): removed items and paymentMethod. The full items array
// (names, prices, quantities, colors) exposed detailed purchase history to any
// unauthenticated party who knows order number + email — a narrow but real brute-force
// surface. A guest only needs status, total, and timestamp to verify their order.
const GUEST_PROJECTION = {
  orderNumber:   1,
  status:        1,
  paymentStatus: 1,
  total:         1,
  createdAt:     1,
} as const;

export const POST = withErrorHandler(async (req: NextRequest) => {
  const v = await validateBody(req, Schema);
  if ('error' in v) return v.error;

  const { orderNumber, email } = v.data;

  await connectDB();

  // Hema033 FIX [MED-01]: use exact match (lowercase-normalised) instead of
  // case-insensitive $regex. $regex with 'i' flag prevents MongoDB from using
  // the index on guestEmail, causing a full collection scan on every request —
  // a DoS vector on this unauthenticated endpoint. Email is already .toLowerCase()
  // from the Zod schema transform, so an exact match is both safe and indexed.
  const order = await (Order.findOne as any)({
    orderNumber,
    guestEmail: email, // exact match — email is already lowercased by Schema
    userId:     { $exists: false },
  }, GUEST_PROJECTION).lean();

  // Always return the same error for not-found AND email mismatch —
  // prevents an attacker from confirming that an order number exists.
  // MED-04 FIX (V064): Wait fixed 200ms before responding on failure to prevent
  // timing-based enumeration (attacker cannot distinguish "not found" from "wrong email"
  // via response time differences).
  if (!order) {
    await new Promise(r => setTimeout(r, 200));
    return err('No order found with that order number and email address.', 404, 'ORDER_NOT_FOUND');
  }

  return ok({ order });
}, { rateMax: 3, rateWindow: 60, failClosed: false });
