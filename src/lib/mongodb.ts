// src/lib/mongodb.ts — Production: atomic counters, MFA, verification expiry, order tracking
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI!;
if (!MONGODB_URI) throw new Error('MONGODB_URI is not defined in environment');

declare global { var _mongoose: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }; }
let cached = global._mongoose;
if (!cached) cached = global._mongoose = { conn: null, promise: null };

export async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    }).then(m => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

// ── ATOMIC COUNTER (fixes countDocuments race condition) ─────────
const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});
export const Counter = mongoose.models.Counter || mongoose.model('Counter', CounterSchema);

export async function nextSeq(name: string): Promise<number> {
  const doc = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc.seq;
}

// ── PRODUCT ───────────────────────────────────────────────────────
const ProductSchema = new mongoose.Schema({
  slug:         { type: String, required: true, unique: true, index: true },
  nameEn:       { type: String, required: true, trim: true },
  nameAr:       { type: String, required: true, trim: true },
  descEn:       { type: String, default: '' },
  descAr:       { type: String, default: '' },
  price:        { type: Number, required: true, min: 0 },
  oldPrice:     { type: Number, min: 0 },
  category:     { type: String, enum: ['living','bedroom','dining','office','outdoor'], required: true, index: true },
  subcategory:  { type: String },
  images:       [{ type: String }],
  stock:        { type: Number, default: 0, min: 0 },
  sku:          { type: String, unique: true, sparse: true },
  badge:        { type: String, enum: ['New','Sale','Best Seller','Limited', null] },
  rating:       { type: Number, default: 0, min: 0, max: 5 },
  reviewCount:  { type: Number, default: 0 },
  material:     { type: String },
  materialAr:   { type: String },
  colors:       [{ type: String }],
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

ProductSchema.index({ nameEn: 'text', nameAr: 'text', tags: 'text', brand: 'text' });
ProductSchema.index({ price: 1 });
ProductSchema.index({ rating: -1 });
ProductSchema.index({ createdAt: -1 });

// ── ORDER ─────────────────────────────────────────────────────────
const OrderSchema = new mongoose.Schema({
  orderNumber:  { type: String, unique: true },
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  guestEmail:   { type: String },
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
  status: {
    type: String,
    enum: ['pending','confirmed','processing','shipped','out_for_delivery','delivered','cancelled'],
    default: 'pending', index: true,
  },
  // Order tracking timeline
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
}, { timestamps: true });

// Use atomic counter — no race condition
OrderSchema.pre('save', async function(next) {
  if (!this.orderNumber) {
    const seq = await nextSeq('orders');
    this.orderNumber = `HEM-${new Date().getFullYear()}-${String(seq).padStart(5,'0')}`;
  }
  if (this.isModified('status')) {
    if (!Array.isArray(this.statusHistory)) this.statusHistory = [];
    (this.statusHistory as Array<{ status: string; timestamp: Date }>).push({
      status:    this.status as string,
      timestamp: new Date(),
    });
  }
  next();
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
  passwordHash:  { type: String, required: true, select: false },
  role:          { type: String, enum: ['customer','admin','staff'], default: 'customer' },
  avatar:        String,
  addresses:     [AddressSchema],
  wishlist:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  // Email verification
  isEmailVerified:          { type: Boolean, default: false },
  emailVerificationToken:   { type: String, select: false },
  emailVerificationExpires: { type: Date, select: false },
  // Password reset
  passwordResetToken:   { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },
  // MFA / TOTP
  mfaEnabled:     { type: Boolean, default: false },
  mfaSecret:      { type: String, select: false },
  mfaBackupCodes: { type: [String], select: false },
  // Account state
  isActive:     { type: Boolean, default: true },
  failedLogins: { type: Number, default: 0 },
  lockedUntil:  { type: Date },
  lastLoginAt:  Date,
}, { timestamps: true });

// ── REVIEW ────────────────────────────────────────────────────────
const ReviewSchema = new mongoose.Schema({
  productId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  userId:             { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName:           { type: String, required: true },
  rating:             { type: Number, required: true, min: 1, max: 5 },
  title:              String,
  body:               { type: String, required: true },
  images:             [String],
  isVerifiedPurchase: { type: Boolean, default: false },
  isApproved:         { type: Boolean, default: true },
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
  expiresAt:     Date,
  isActive:      { type: Boolean, default: true },
}, { timestamps: true });

export const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);
export const Order   = mongoose.models.Order   || mongoose.model('Order',   OrderSchema);
export const User    = mongoose.models.User    || mongoose.model('User',    UserSchema);
export const Review  = mongoose.models.Review  || mongoose.model('Review',  ReviewSchema);
export const Coupon  = mongoose.models.Coupon  || mongoose.model('Coupon',  CouponSchema);
