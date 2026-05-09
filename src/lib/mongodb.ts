// src/lib/mongodb.ts — HemaV071
// V064 FIX-HIGH-05: AUDIT_HMAC_SECRET is now required in production — throws at startup if absent.
//   verifyAuditLogIntegrity() returns status:'degraded' when HMAC secret is missing.
// V061 FIX-B: Audit log integrity — hash chaining + HMAC signing.
//   - AuditLog entries now include chainHash (SHA-256 of previous entry) and
//     hmacSignature (HMAC-SHA-256 signed with AUDIT_HMAC_SECRET).
//   - verifyAuditLogIntegrity() utility exported for admin integrity checks.
//   - Any tampered or deleted entry breaks chain integrity detectably.
// V054: strictQuery, compound indexes, pre-save hooks
import mongoose from 'mongoose';
import { createHash, createHmac } from 'crypto';
// V054 FIX (H3): import structured logger so MongoDB connection events are shipped
// to BetterStack/Axiom with correlationId and PII scrubbing, instead of leaking
// raw text to stdout via console.log/console.error.
import { logger } from './logger';

// ── Strict Query Mode ─────────────────────────────────────────────
// Prevents Mongoose from silently ignoring unknown query fields.
// Must be set before the first connection attempt.
mongoose.set('strictQuery', true);

// ── LOW-01 FIX (V062): Global maxTimeMS plugin ───────────────────────────────
// Applies an 8-second maxTimeMS cap to all queries unless the caller sets a
// custom maxTimeMS. This prevents slow queries from holding connections in the
// pool and stalling the entire site. Per-query override is always respected —
// the plugin only sets maxTimeMS if it has not already been set by the caller.
// socketTimeoutMS=45000 controls the socket-level timeout; maxTimeMS controls
// the server-side query execution limit — these are complementary, not redundant.
mongoose.plugin((schema: mongoose.Schema) => {
  // LOW-01 FIX (V062): each operation registered individually — Mongoose's
  // overloaded schema.pre() signature only accepts specific literal strings,
  // not a union type via forEach. Splitting into individual calls satisfies
  // the TypeScript overload resolver without any casts. (HemaV086 fix)
  type MaxTimeable = { getOptions?: () => Record<string, unknown>; maxTimeMS: (ms: number) => void };

  function applyMaxTimeMS(this: unknown) {
    const ctx = this as MaxTimeable;
    if (typeof ctx.getOptions === 'function') {
      const opts = ctx.getOptions();
      if (!opts.maxTimeMS) ctx.maxTimeMS(8000);
    }
  }

  schema.pre('find',              applyMaxTimeMS);
  schema.pre('findOne',           applyMaxTimeMS);
  schema.pre('findOneAndUpdate',  applyMaxTimeMS);
  schema.pre('findOneAndDelete',  applyMaxTimeMS);
  schema.pre('countDocuments',    applyMaxTimeMS);
  schema.pre('aggregate',         applyMaxTimeMS);
  // LOW-007 FIX (V069): cron cleanup uses updateMany/deleteMany without time cap.
  // Mongoose pre() overloads don't include updateMany/deleteMany in the literal union —
  // cast through unknown then any to bypass the overload check safely. (HemaV087)
  (schema.pre as unknown as (m: string, fn: typeof applyMaxTimeMS) => void)('updateMany', applyMaxTimeMS);
  (schema.pre as unknown as (m: string, fn: typeof applyMaxTimeMS) => void)('deleteMany', applyMaxTimeMS);
});

// ✅ FIX: don't throw at module load — breaks `next build` and tests.
// Validate inside connectDB() instead.
// V054: lazy fetch via secrets adapter — preserves the "validate inside connectDB" contract.
import { getSecretSync } from './secrets';

// ── Connection cache (survives Next.js hot-reload in dev) ─────────
declare global {
  var _mongoose: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
}
let cached = global._mongoose ?? { conn: null, promise: null };
if (!global._mongoose) global._mongoose = cached;

// Pool size: env-configurable for Atlas M0 (max 500 connections shared)
const POOL_SIZE      = parseInt(process.env.MONGODB_POOL_SIZE      ?? '10');
// Atlas SRV lookups are slower; allow 10s before giving up
const SELECTION_MS   = parseInt(process.env.MONGODB_SELECTION_MS   ?? '10000');
// How long to wait for a socket before aborting a query
const SOCKET_MS      = parseInt(process.env.MONGODB_SOCKET_MS      ?? '45000');

export async function connectDB(): Promise<typeof mongoose> {
  const MONGODB_URI = getSecretSync('MONGODB_URI');
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not defined in environment variables');
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI as string, {
        bufferCommands:          false,
        maxPoolSize:             POOL_SIZE,
        serverSelectionTimeoutMS: SELECTION_MS,
        socketTimeoutMS:         SOCKET_MS,
        // Atlas SRV: retryWrites is on by default in the SRV string;
        // setting here ensures it works for both localhost & Atlas URIs
        retryWrites:             true,
        // Heartbeat every 10s so stale connections are detected early
        heartbeatFrequencyMS:    10_000,
      })
      .then(m => {
        // V054 FIX (H3): use structured logger (not console.log) so this event
        // carries correlationId and is shipped to BetterStack/Axiom.
        logger.info('[MongoDB] Connected successfully');
        return m;
      })
      .catch((err: unknown) => {
        // Reset cache so the next request retries instead of hanging forever
        cached.promise = null;
        // V054 FIX (H3): use structured logger (not console.error) so connection
        // failures appear in the observability stack with full context.
        logger.error('[MongoDB] Connection failed', { error: err instanceof Error ? err.message : String(err) });
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Allow retries on subsequent requests
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}

// ── ATOMIC COUNTER ────────────────────────────────────────────────
const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});
export const Counter = mongoose.models.Counter || mongoose.model('Counter', CounterSchema);

export async function nextSeq(name: string): Promise<number> {
  const doc = await (Counter.findByIdAndUpdate as any)(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc.seq;
}

// ── PRODUCT ───────────────────────────────────────────────────────
const ProductSchema = new mongoose.Schema({
  // V054 FIX: removed redundant `index: true` — `unique: true` already creates an index.
  // Having both produced "Duplicate schema index" warnings at boot.
  slug:         { type: String, required: true, unique: true },
  nameEn:       { type: String, required: true, trim: true },
  nameAr:       { type: String, required: true, trim: true },
  descEn:       { type: String, default: '' },
  descAr:       { type: String, default: '' },
  price:        { type: Number, required: true, min: 0 },
  oldPrice:     { type: Number, min: 0 },
  category: {
    main: { type: String, enum: ['living','bedroom','dining','office','outdoor'], required: true, index: true },
    // V054 FIX: sub-category now validated against known values instead of accepting any string.
    // Prevents inconsistent data (e.g. "Sofas" vs "sofas" vs "sofa") in the DB.
    sub:  { type: String, enum: [
      // living
      'sofas','armchairs','coffee-tables','tv-units','shelving',
      // bedroom
      'beds','wardrobes','nightstands','dressers','mirrors',
      // dining
      'dining-tables','dining-chairs','buffets','bar-stools',
      // office
      'desks','office-chairs','bookcases','filing-cabinets',
      // outdoor
      'garden-sets','sun-loungers','planters','outdoor-sofas',
    ], index: true },
  },
  images:       [{ type: String }],
  variants: [{
    sku:          { type: String, unique: true, sparse: true },
    name:         { type: String },
    price:        { type: Number },
    stock:        { type: Number, default: 0, min: 0 },
    attributes: {
      size:     String,
      color:    String,
      material: String,
    },
    images: [{ type: String }],
  }],
  stock:        { type: Number, default: 0, min: 0 },
  sku:          { type: String, unique: true, sparse: true },
  badge:        { type: String, enum: ['New','Sale','Best Seller','Limited', null] },
  rating:       { type: Number, default: 0, min: 0, max: 5 },
  reviewCount:  { type: Number, default: 0 },
  material:     { type: String },
  materialAr:   { type: String },
  colors:       [{ type: String }],
  relatedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product', validate: {
    validator: (v: mongoose.Types.ObjectId[]) => v.length <= 20,
    message: 'relatedProducts cannot exceed 20 items',
  } }],
  brand:        { type: String, index: true },
  dimensions: {
    width: Number, depth: Number, height: Number,
    unit: { type: String, enum: ['cm','inch'], default: 'cm' },
  },
  weight:        { type: Number },
  warrantyYears: { type: Number, default: 1 },
  tags:          [{ type: String }],
  isActive:      { type: Boolean, default: true, index: true },
  isFeatured:    { type: Boolean, default: false, index: true },
  metaTitle:     { type: String },
  metaDesc:      { type: String },
}, { timestamps: true });

// ARCH-007 FIX (V071): Text index for case-insensitive product search.
// Replaces $regex with $options:'i' (full scan) with indexed $text queries.
// Arabic and English content both indexed for bilingual search support.
// default_language:'none' prevents stemming issues with Arabic text.
ProductSchema.index({ nameEn: 'text', nameAr: 'text', descEn: 'text' }, {
  weights: { nameEn: 10, nameAr: 10, descEn: 1 },
  name: 'product_text_search',
  default_language: 'none', // support Arabic without stemming issues
});
ProductSchema.index({ price: 1 });
ProductSchema.index({ 'category.main': 1, price: 1 });
ProductSchema.index({ 'category.main': 1, rating: -1 });
ProductSchema.index({ rating: -1 });
ProductSchema.index({ createdAt: -1 });

// ── ORDER ─────────────────────────────────────────────────────────
const OrderSchema = new mongoose.Schema({
  orderNumber:  { type: String, unique: true },
  // CRIT-01 FIX (V067): Changed from ObjectId to Mixed to support '[deleted]' string value
  // during GDPR cascade anonymisation. Previously Mongoose silently stored null instead of
  // '[deleted]', breaking GDPR compliance and audit chain integrity.
  userId: {
    type: mongoose.Schema.Types.Mixed, // accepts ObjectId or '[deleted]'
    ref: 'User',
    index: true,
  },
  // MED-02 FIX (V065): Added sparse index on guestEmail.
  // Without this index, queries that filter by guestEmail (e.g. guest order lookup,
  // GDPR erasure by email) require a full collection scan — O(N) on every request.
  // sparse:true ensures null/undefined values (authenticated user orders) are
  // excluded from the index, keeping it small (only guest orders are indexed).
  guestEmail:   { type: String, index: true, sparse: true },
  customer: {
    firstName: { type: String, required: true },
    lastName:  { type: String, required: true },
    email:     { type: String, required: true },
    phone:     { type: String, required: true },
  },
  shippingAddress: {
    street:      { type: String, required: true },
    city:        { type: String, required: true },
    governorate: { type: String, required: true },
    postalCode:  { type: String },
  },
  items: [{
    productId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    nameEn:        String,
    nameAr:        String,
    price:         { type: Number, required: true },
    quantity:      { type: Number, required: true, min: 1 },
    image:         String,
    selectedColor: String,
  }],
  subtotal:              { type: Number, required: true },
  shipping:              { type: Number, default: 0 },
  discount:              { type: Number, default: 0 },
  total:                 { type: Number, required: true },
  paymentMethod:         { type: String, enum: ['cod','card','paymob','fawry','valu'], default: 'cod' },
  paymentStatus:         { type: String, enum: ['pending','paid','failed','refunded'], default: 'pending' },
  paymobOrderId:         String,
  paymobTransactionId:   String,
  refundedAt:            Date,
  refundedAmount:        Number,
  paymobRefundId:        String,
  status: {
    type: String,
    enum: ['pending','confirmed','processing','shipped','out_for_delivery','delivered','cancelled'],
    default: 'pending', index: true,
  },
  statusHistory: [{
    status:    String,
    note:      String,
    timestamp: { type: Date, default: Date.now },
  }],
  notes:             String,
  trackingNumber:    String,
  trackingUrl:       String,
  estimatedDelivery: Date,
  deliveredAt:       Date,
  paymentFailureNotified: { type: Boolean, default: false },
  // V054: client-supplied idempotency key — duplicate POSTs return the same order
  idempotencyKey:         { type: String, sparse: true },
  // HIGH-04 FIX (V064): SHA-256 hash of the guest order claim JWT.
  // The full token is returned to the guest in the POST response ONLY — never stored.
  // Guests use GET /api/v1/orders/claim/[token] to retrieve their order later.
  claimTokenHash:         { type: String, sparse: true, index: true },
}, { timestamps: true });

OrderSchema.pre('save', async function(next) {
  if (!this.orderNumber) {
    const seq = await nextSeq('orders');
    this.orderNumber = `HEM-${new Date().getFullYear()}-${String(seq).padStart(5,'0')}`;
  }
  if (this.isModified('status')) {
    if (!Array.isArray(this.statusHistory)) (this as any).statusHistory = [];
    (this.statusHistory as Array<{ status: string; timestamp: Date }>).push({
      status:    this.status as string,
      timestamp: new Date(),
    });
  }
  next();
});

// ── ORDER compound indexes ────────────────────────────────────────
// Powers: "my orders" sorted by date (most common customer query)
// HIGH-02 FIX (V067): sparse:true — after userId→Mixed (CRIT-01), standard compound
// indexes degrade when userId='[deleted]'. sparse:true excludes null/non-indexed values.
OrderSchema.index({ userId: 1, createdAt: -1 }, { sparse: true });
// Powers: admin dashboard filtered by status + sorted by date
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ 'customer.email': 1, createdAt: -1 });
// Powers: admin payment reconciliation queries
OrderSchema.index({ paymentStatus: 1, createdAt: -1 });
// Powers: cron job that cleans up stale pending orders
OrderSchema.index({ status: 1, updatedAt: 1 });
// V054 FIX: enforce uniqueness of paymobOrderId to prevent two orders ever
// being mapped to the same Paymob session (which would let one webhook
// confirm the wrong order). Sparse so COD orders without a paymobOrderId
// are not constrained.
OrderSchema.index({ paymobOrderId: 1 }, { unique: true, sparse: true });
// V054: idempotency key for create-order requests (prevents duplicate orders
// when the network retries between client and server).
// IMPROVE-ARCH-01 (V054): added explicit index name for easier monitoring in Atlas.
OrderSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true, name: 'unique_idempotency_key' });

// HIGH-02 FIX (V067): Partial index for anonymised orders — enables fast queries
// to find/audit all GDPR-erased orders without scanning the full index.
OrderSchema.index({ userId: 1 }, {
  partialFilterExpression: { userId: '[deleted]' },
  name: 'idx_orders_anonymised',
});

// ── USER ─────────────────────────────────────────────────────────
const AddressSchema = new mongoose.Schema({
  label:       { type: String, default: 'Home' },
  street:      String,
  city:        String,
  governorate: String,
  isDefault:   { type: Boolean, default: false },
}, { _id: true });

const UserSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  email:         { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:         { type: String },
  // V036: passwordHash now stores argon2id hashes ($argon2id$...).
  // Legacy bcrypt hashes ($2b$...) stored before V036 will fail verify —
  // affected users must reset their password via /forgot-password.
  // A seamless migration helper (detect $2b$ prefix → verify bcrypt → rehash
  // with argon2id on next successful login) can be added in a future version.
  passwordHash:  { type: String, required: true, select: false },
  // V005: enum extended for the new RBAC roles. `staff` kept as legacy alias.
  role:          { type: String, enum: ['customer','admin','staff','manager','support'], default: 'customer' },
  // LOW-04 FIX (V067): Synchronised enum with UserRole from @/types (was 'admin','moderator','user').
  // The legacy enum pre-dates V005 RBAC and was misaligned with the active role set.
  // Using satisfies for compile-time verification that values match the UserRole union.
  roles: {
    type: [String],
    enum: ['admin', 'manager', 'staff', 'support', 'customer'] satisfies string[],
    default: ['customer'],
  },
  avatar:        String,
  addresses:     [AddressSchema],
  wishlist:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  cart: [{
    productId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantity:      { type: Number, default: 1 },
    selectedColor: String,
  }],
  isEmailVerified:          { type: Boolean, default: false },
  // V054 FIX: indexed token fields. The verify-email and reset-password
  // routes look users up by these tokens — without an index every lookup
  // was a full collection scan (O(n) per click).
  emailVerificationToken:   { type: String, select: false, index: true, sparse: true },
  emailVerificationExpires: { type: Date, select: false },
  passwordResetToken:   { type: String, select: false, index: true, sparse: true },
  passwordResetExpires: { type: Date, select: false },
  mfaEnabled:     { type: Boolean, default: false },
  mfaSecret:      { type: String, select: false },
  mfaBackupCodes: { type: [String], select: false },
  // HemaV035 FIX [MED-02]: dedicated counter for MFA verification failures.
  // Separate from `failedLogins` (login-password failures) so the two
  // lock-out paths cannot interfere with each other.
  // 0 = no failures; reset to 0 on successful MFA or account unlock.
  mfaFailedAttempts: { type: Number, default: 0, select: false },
  isActive:     { type: Boolean, default: true },
  failedLogins: { type: Number, default: 0 },
  lockedUntil:  { type: Date },
  lastLoginAt:  Date,
  // V014 FIX: permission version — incremented every time the user's role
  // changes. The JWT carries this value (as `pv`); middleware compares it
  // to the DB value on every request and rejects stale tokens immediately.
  // This closes the window where a role-change only takes effect at JWT expiry.
  permissionVersion: { type: Number, default: 0 },
  // V042: bcrypt → argon2id migration flag.
  // Set to true by the migration script for any user whose passwordHash starts with
  // "$2b$" (bcrypt). These users cannot log in until they complete a password reset
  // via /forgot-password. Cleared automatically on successful password reset.
  // Also used if an admin triggers a force-reset for a specific user or role.
  mustResetPassword: { type: Boolean, default: false, index: true },
  mustResetReason:   { type: String, default: '' }, // Human-readable reason shown on login
}, { timestamps: true });

// ── REVIEW ────────────────────────────────────────────────────────
const ReviewSchema = new mongoose.Schema({
  productId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  // CRIT-01 FIX (V067): Changed from ObjectId to Mixed to support '[deleted]' string value
  // during GDPR cascade anonymisation (same fix as OrderSchema).
  userId: {
    type: mongoose.Schema.Types.Mixed, // accepts ObjectId or '[deleted]'
    ref: 'User',
    required: true,
  },
  userName:           { type: String, required: true },
  rating:             { type: Number, required: true, min: 1, max: 5 },
  title:              String,
  body:               { type: String, required: true },
  images:             [String],
  isVerifiedPurchase: { type: Boolean, default: false },
  isApproved:         { type: Boolean, default: false }, // FIND-003 FIX: default false — reviews require explicit admin approval
  helpful:            { type: Number, default: 0 },
}, { timestamps: true });
ReviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

// ── COUPON ────────────────────────────────────────────────────────
const CouponSchema = new mongoose.Schema({
  code:          { type: String, required: true, unique: true, uppercase: true },
  type:          { type: String, enum: ['percentage','fixed'], required: true },
  value:         { type: Number, required: true },
  minOrderValue: { type: Number, default: 0 },
  maxUses:       { type: Number },
  usedCount:     { type: Number, default: 0 },
  // V054 FIX: per-user coupon tracking.
  // Previously usedCount only tracked global usage — one user could exhaust
  // all maxUses by themselves. perUserLimit caps how many times a single
  // authenticated user can redeem the same coupon. usedBy stores the ObjectIds
  // of users who have redeemed it (sparse array — only written for auth orders).
  perUserLimit:  { type: Number, default: 1 },
  usedBy:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
  expiresAt:     Date,
  isActive:      { type: Boolean, default: true },
}, { timestamps: true });

// ── AUDIT LOG ─────────────────────────────────────────────────────
// V061 FIX-B: Hash chaining + HMAC signing for tamper-proof audit integrity.
//
// HIGH-05 FIX (V064): AUDIT_HMAC_SECRET is REQUIRED in production.
// Without it, HMAC signatures are skipped — audit entries can be tampered without detection.
// This check throws at process startup (module load) so a misconfigured deployment
// fails fast rather than silently running in degraded mode.
// V092 FIX: Also check NEXT_PHASE — during `next build`, NODE_ENV is 'production'
// but runtime secrets are intentionally absent. Skip the fatal throw at build time;
// it is enforced at actual server startup when the app runs.
if (
  process.env.NODE_ENV === 'production' &&
  !process.env.AUDIT_HMAC_SECRET &&
  process.env.NEXT_PHASE !== 'phase-production-build'
) {
  throw new Error(
    '[AuditLog] FATAL: AUDIT_HMAC_SECRET must be set in production. ' +
    'Without this secret, audit log entries cannot be HMAC-signed and integrity ' +
    'verification is degraded. Generate with: ' +
    'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" ' +
    'and add to your environment secrets. See .env.production.template.',
  );
}
//
// chainHash:      SHA-256(prevChainHash || action || userId || resourceId || timestamp)
//                 Chains each entry to the previous. Any deletion/modification breaks the chain.
// hmacSignature:  HMAC-SHA-256 of the entry content using AUDIT_HMAC_SECRET.
//                 Detects external DB modifications (requires server secret to verify).
// GENESIS_HASH:   First entry uses this as the "previous hash" seed.
//
// Integrity check: call verifyAuditLogIntegrity() to walk the chain and flag breaks.
const AUDIT_GENESIS_HASH = 'GENESIS:HEMA_AUDIT_CHAIN_V061';

/**
 * Compute the chain hash for an audit log entry.
 * Input: previousChainHash + action + userId + resourceId + createdAt (ISO)
 */
/**
 * LOW-004 FIX (V068): computeAuditChainHash now chains over the full canonical content
 * of the previous entry, not just its _id. Chaining over _id (a monotonically-increasing
 * ObjectId) only detected entry deletion (gaps in IDs), NOT content tampering — an attacker
 * with DB write access could silently modify action, details, or userId fields without
 * breaking the chain. Full-content chaining matches standard audit trail integrity patterns.
 *
 * Chain input: SHA-256(prevChainHash | prevAction | prevUserId | prevResourceId | prevDetails | prevCreatedAt)
 */
export function computeAuditChainHash(
  previousChainHash: string,
  entry: { action: string; userId?: string; resourceId?: string; createdAt: Date | string; details?: unknown }
): string {
  // Canonical serialization — deterministic regardless of JS object key ordering.
  // details is JSON-stringified so it's content-addressable (not reference-dependent).
  const payload = [
    previousChainHash,
    entry.action,
    entry.userId ?? '',
    entry.resourceId ?? '',
    JSON.stringify(entry.details ?? null),
    new Date(entry.createdAt).toISOString(),
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Compute the HMAC signature for an audit log entry (optional second layer).
 * Uses AUDIT_HMAC_SECRET env var. If not set, returns empty string (degraded mode).
 */
export function computeAuditHmac(
  entry: { action: string; userId?: string; resourceId?: string; details?: unknown; createdAt: Date | string }
): string {
  const secret = process.env.AUDIT_HMAC_SECRET;
  if (!secret) return '';
  const payload = JSON.stringify({
    action:     entry.action,
    userId:     entry.userId ?? null,
    resourceId: entry.resourceId ?? null,
    details:    entry.details ?? null,
    createdAt:  new Date(entry.createdAt).toISOString(),
  });
  return createHmac('sha256', secret).update(payload).digest('hex');
}

const AuditLogSchema = new mongoose.Schema({
  // CRIT-01 FIX (V067): Changed from ObjectId to Mixed to support '[deleted]' string value
  // during GDPR cascade anonymisation (same fix as OrderSchema).
  userId: {
    type: mongoose.Schema.Types.Mixed, // accepts ObjectId or '[deleted]'
    ref: 'User',
    index: true,
  },
  action:        { type: String, required: true, index: true },
  resource:      String,
  resourceId:    String,
  details:       mongoose.Schema.Types.Mixed,
  ip:            String,
  userAgent:     String,
  // V061 FIX-B: Integrity fields
  chainHash:     { type: String },  // SHA-256 chain linking this entry to the previous
  hmacSignature: { type: String },  // HMAC-SHA-256 of entry content (verifiable with AUDIT_HMAC_SECRET)
  // LOW-03 FIX (V062): Auto-incrementing sequence for monotonicity verification.
  // Populated atomically via nextSeq('auditlog') — gaps in seq indicate deleted entries.
  // Old entries without seq are skipped in the monotonicity check (backward compatible).
  seq:           { type: Number, index: true },
}, { timestamps: true });

// V054 FIX (H1): TTL index — automatically delete AuditLog documents after retention period.
// MED-03 FIX (V043): Default TTL raised from 90 to 365 days.
// PCI-DSS and most security compliance frameworks require at least 12 months of audit
// log retention for financial transaction events. A breach discovered 4+ months after
// the fact would have no queryable record under the old 90-day window.
// after creation. Without this, every permission denial, role change, block/unblock,
// and refund event accumulates forever. Under sustained attack (e.g. brute-force),
// this collection can grow by thousands of documents per minute and exhaust Atlas
// storage on M10 and below, causing the database to pause and taking down the store.
// 90 days satisfies typical security compliance retention requirements; adjust
// AUDIT_LOG_TTL_SECONDS env var to override without a code change.
// Hema033 FIX [MED-04]: enforce a minimum of 30 days for audit log TTL.
// Without a floor, setting AUDIT_LOG_TTL_SECONDS=1 would delete all audit
// records within seconds — an insider threat could erase their entire trail.
const _parsedTTL = parseInt(process.env.AUDIT_LOG_TTL_SECONDS ?? '');
const MIN_AUDIT_TTL = 30 * 24 * 3600; // 30 days in seconds
const AUDIT_TTL_S = (!isNaN(_parsedTTL) && _parsedTTL >= MIN_AUDIT_TTL)
  ? _parsedTTL
  : 365 * 24 * 3600; // MED-03 FIX (V043): default raised from 90 to 365 days (PCI-DSS compliance)
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: AUDIT_TTL_S });
// HIGH-02 FIX (V067): sparse:true — after userId→Mixed (CRIT-01), compound indexes
// need sparse to handle mixed ObjectId/'[deleted]' values without performance degradation.
AuditLogSchema.index({ userId: 1, action: 1 }, { sparse: true });

export const Product  = mongoose.models.Product  || mongoose.model('Product',  ProductSchema);
export const Order    = mongoose.models.Order    || mongoose.model('Order',    OrderSchema);
export const User     = mongoose.models.User     || mongoose.model('User',     UserSchema);
export const Review   = mongoose.models.Review   || mongoose.model('Review',   ReviewSchema);
export const Coupon   = mongoose.models.Coupon   || mongoose.model('Coupon',   CouponSchema);
export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);

/**
 * V061 FIX-B: createAuditLogEntry — integrity-aware audit log write helper.
 *
 * Automatically:
 *   1. Fetches the last audit log entry to get its chainHash (previous hash for chaining).
 *   2. Computes chainHash for the new entry.
 *   3. Computes hmacSignature if AUDIT_HMAC_SECRET is configured.
 *   4. Inserts the new entry with integrity fields populated.
 *
 * This is a drop-in helper — callers can still use (AuditLog.create as any)() directly for
 * backward compatibility (entries without chainHash are treated as pre-V061 entries
 * during integrity verification).
 *
 * IMPORTANT: This helper does NOT use a DB transaction for the fetch+insert pattern.
 * In high-concurrency scenarios, two concurrent writes may both read the same "last"
 * entry and produce duplicate prevHash values. This is acceptable for audit integrity
 * (chain break detected, not silent) — a transaction would require an unnecessary
 * replica set write concern escalation on every audit write.
 */
export async function createAuditLogEntry(data: {
  userId?:    string;
  action:     string;
  resource?:  string;
  resourceId?: string;
  details?:   unknown;
  ip?:        string;
  userAgent?: string;
}): Promise<void> {
  try {
    // Fetch last entry's chainHash for chaining
    const last = await (AuditLog.findOne as any)({})
      .sort({ createdAt: -1 })
      .select('chainHash')
      .lean() as { chainHash?: string } | null;

    const prevHash   = last?.chainHash ?? AUDIT_GENESIS_HASH;
    const now        = new Date();
    // LOW-004 FIX (V068): pass details so chainHash covers full entry content
    const chainHash  = computeAuditChainHash(prevHash, {
      action:     data.action,
      userId:     data.userId,
      resourceId: data.resourceId,
      details:    data.details,
      createdAt:  now,
    });
    const hmacSignature = computeAuditHmac({
      action:     data.action,
      userId:     data.userId,
      resourceId: data.resourceId,
      details:    data.details,
      createdAt:  now,
    });

    await (AuditLog.create as any)({
      ...data,
      createdAt:  now,
      chainHash,
      // LOW-03 FIX (V062): Populate seq atomically for monotonicity verification.
      // nextSeq() uses findOneAndUpdate with $inc and upsert — fully atomic.
      seq: await nextSeq('auditlog'),
      ...(hmacSignature ? { hmacSignature } : {}),
    });
  } catch (e) {
    // Audit writes must never crash the caller — log and continue.
    const { logger } = await import('./logger');
    logger.error('[AuditLog] createAuditLogEntry failed', { action: data.action, error: String(e) });
  }
}

/**
 * V062 LOW-03 FIX: verifyAuditLogIntegrity — walks the AuditLog chain and reports any breaks.
 *
 * How it works:
 *   1. Fetches audit log entries ordered by seq ASC (then createdAt ASC for pre-V062 entries).
 *   2. Re-computes each entry's chainHash using the previous entry's hash.
 *   3. LOW-03: Checks seq monotonicity — gaps indicate deleted/reordered entries.
 *   4. If AUDIT_HMAC_SECRET is set, also verifies each entry's hmacSignature.
 *
 * Returns:
 *   { valid: true, checked: N }           — all entries intact
 *   { valid: false, breaks: [...], ... }  — chain/HMAC/seq violations detected
 *
 * Usage: GET /api/v1/admin/audit-integrity (admin-only endpoint)
 */
export async function verifyAuditLogIntegrity(options?: { limit?: number; filter?: Record<string, unknown> }): Promise<{
  valid: boolean;
  status: 'ok' | 'degraded' | 'invalid';
  checked: number;
  breaks: Array<{ entryId: string; action: string; issue: string }>;
  hmacChecked: boolean;
  nextCursor: string | null;
}> {
  const limit = options?.limit ?? 10_000;
  // V063 FIX-HIGH-02: Merge optional cursor filter for paginated integrity checks.
  const baseFilter = options?.filter ?? {};
  const hmacSecret = process.env.AUDIT_HMAC_SECRET;
  const breaks: Array<{ entryId: string; action: string; issue: string }> = [];

  const entries = await (AuditLog.find as any)(baseFilter)
    .sort({ seq: 1, createdAt: 1 })
    .limit(limit)
    .select('_id action userId resourceId details createdAt chainHash hmacSignature seq')
    .lean() as Array<{
      _id: { toString(): string };
      action: string;
      userId?: string;
      resourceId?: string;
      details?: unknown;
      createdAt: Date;
      chainHash?: string;
      hmacSignature?: string;
      seq?: number;
    }>;

  let prevHash = AUDIT_GENESIS_HASH;
  let prevSeq: number | null = null;

  for (const entry of entries) {
    const entryId = entry._id.toString();
    // LOW-004 FIX (V068): pass details so chain verification covers full entry content
    const expectedChainHash = computeAuditChainHash(prevHash, {
      action:     entry.action,
      userId:     entry.userId?.toString(),
      resourceId: entry.resourceId,
      details:    entry.details,
      createdAt:  entry.createdAt,
    });

    // Check chain hash if present (entries created before V061 may not have it)
    if (entry.chainHash) {
      if (entry.chainHash !== expectedChainHash) {
        breaks.push({ entryId, action: entry.action, issue: 'chainHash_mismatch — entry tampered or chain broken' });
      }
    }

    // LOW-03 FIX (V062): Sequence monotonicity check.
    // Only check entries with a seq field (V062+). Pre-V062 entries without seq are skipped.
    // A gap (e.g. seq jumps from 5 to 7) means entries were deleted or sequence tampered.
    if (typeof entry.seq === 'number') {
      if (prevSeq !== null && entry.seq !== prevSeq + 1) {
        breaks.push({
          entryId,
          action: entry.action,
          issue: `sequence_gap — expected seq ${prevSeq + 1}, got ${entry.seq} (entries deleted or reordered)`,
        });
      }
      prevSeq = entry.seq;
    }

    // Check HMAC signature if secret is configured and signature is present
    if (hmacSecret && entry.hmacSignature) {
      const expectedHmac = computeAuditHmac({
        action:     entry.action,
        userId:     entry.userId?.toString(),
        resourceId: entry.resourceId,
        details:    entry.details,
        createdAt:  entry.createdAt,
      });
      if (entry.hmacSignature !== expectedHmac) {
        breaks.push({ entryId, action: entry.action, issue: 'hmac_mismatch — entry content modified after signing' });
      }
    }

    prevHash = entry.chainHash ?? expectedChainHash;
  }

  const lastEntry = entries.at(-1);
  const nextCursor = lastEntry ? lastEntry._id.toString() : null;

  return {
    valid:       breaks.length === 0,
    // HIGH-05 FIX (V064): Return 'degraded' (not 'ok') when HMAC secret is absent.
    // 'ok' implies full integrity verification — without HMAC, only chain hashes are
    // checked. An external DB modification that also recalculates chain hashes would
    // be undetectable. 'degraded' signals that full verification requires HMAC secret.
    status:      !hmacSecret ? 'degraded' : breaks.length === 0 ? 'ok' : 'invalid',
    checked:     entries.length,
    breaks,
    hmacChecked: Boolean(hmacSecret),
    nextCursor,
  };
}

// ── NEWSLETTER SUBSCRIBER ─────────────────────────────────────────
// V025: persists newsletter subscriptions collected from the homepage form.
const NewsletterSubscriberSchema = new mongoose.Schema(
  {
    email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    subscribedAt: { type: Date,   default: Date.now },
    isActive:     { type: Boolean, default: true },
    source:       { type: String,  default: 'website' },
    lang:         { type: String,  enum: ['en', 'ar'], default: 'en' },
  },
  { timestamps: true },
);
NewsletterSubscriberSchema.index({ email: 1 }, { unique: true });
NewsletterSubscriberSchema.index({ isActive: 1 });

export const NewsletterSubscriber =
  mongoose.models.NewsletterSubscriber ||
  mongoose.model('NewsletterSubscriber', NewsletterSubscriberSchema);

// ── V060 FIX-A: Secret Rotation Audit Log ────────────────────────────────────
// Append-only collection for persistent, tamper-resistant rotation audit events.
// - No update or delete operations are ever performed by application code.
// - TTL index: auto-purge after 1 year (compliance retention window).
// - capped: false — use TTL not capped collection so we keep full 1yr history.
// - Indexed on (name, rotatedAt) for fast admin queries by secret name & time.
const ROTATION_AUDIT_TTL_S = 365 * 24 * 60 * 60; // 1 year

const SecretRotationAuditLogSchema = new mongoose.Schema(
  {
    name:      { type: String,  required: true, index: true },
    version:   { type: Number,  required: true },
    rotatedAt: { type: Date,    required: true, index: true },
    initiator: { type: String,  required: true },
    success:   { type: Boolean, required: true },
    error:     { type: String },
  },
  {
    timestamps: false, // rotatedAt is explicit
    versionKey: false,
    // Disable all write operations except insertOne at the driver level is not
    // possible via schema; rely on no update/delete in app code (enforced by review).
  }
);

SecretRotationAuditLogSchema.index(
  { name: 1, rotatedAt: -1 },
  { name: 'secret_rotation_by_name_time' }
);
SecretRotationAuditLogSchema.index(
  { rotatedAt: 1 },
  { expireAfterSeconds: ROTATION_AUDIT_TTL_S, name: 'rotation_audit_ttl' }
);

export const SecretRotationAuditLog =
  mongoose.models.SecretRotationAuditLog ||
  mongoose.model('SecretRotationAuditLog', SecretRotationAuditLogSchema);

