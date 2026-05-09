// scripts/seed.ts — HemaV064
// V064 FIX-MED-07: ALLOW_SEED=true is now required before any DB operations.
// V063 FIX-LOW-05: Prevent seed script from running in production.
// Run: npm run seed
//
// V011: this file received four fixes — see AUDIT_V011_REFACTOR.md
//   - P0-03 destructive-guard: refuse to wipe collections in production
//   - P0-04 hashing engine:    use the project's standard @node-rs/bcrypt
//                              instead of bcryptjs (which is not even in
//                              package.json — the previous import broke
//                              `npm run seed` at module-load time).
//   - P1-07 schema mismatch:   product.category must be `{ main, sub }`,
//                              not a top-level string. The runtime queries
//                              filter['category.main'] = ... so a fresh DB
//                              seeded with the old shape returned ZERO
//                              products on every category page.
//   - P3-04 weak default pwd:  default admin password now satisfies the
//                              policy enforced in /api/auth/register
//                              (uppercase + digit + symbol).

import mongoose from 'mongoose';
// V039 SECURITY FIX [BLOCKER-01]: replaced bcrypt with argon2id to match the
// authentication engine in src/lib/auth.ts. bcrypt hashes ($2b$) cannot be
// verified by argon2Verify(), causing permanent admin lockout after seeding.
import { hash as argon2Hash } from '@node-rs/argon2';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// MED-07 FIX (V064): Hard guard — must set ALLOW_SEED=true to run this script.
// This runs BEFORE any imports that might open DB connections.
// Never set ALLOW_SEED=true in production environment files.
if (process.env.ALLOW_SEED !== 'true') {
  throw new Error('[seed] Set ALLOW_SEED=true to run this script. Never set this in production.');
}

// V063 FIX-LOW-05: Prevent seed script from running in production.
// Passwords must be supplied via environment variables — no hardcoded defaults.
if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_SEED_IN_PRODUCTION) {
  console.error('[Seed] Refusing to seed in production. Set ALLOW_SEED_IN_PRODUCTION=1 to override.');
  process.exit(1);
}

const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
if (!SEED_ADMIN_PASSWORD) {
  console.error('[Seed] SEED_ADMIN_PASSWORD environment variable is required.');
  process.exit(1);
}

const URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/hema-furniture';

// ─── Schemas (simplified for seed script) ───────────────────
// V011: P1-07 — category is a sub-document {main, sub}, mirroring the runtime
// schema in src/lib/mongodb.ts. Seeding category as a top-level string used
// to make category-filtered shop pages render an empty grid.
const productSchema = new mongoose.Schema({
  slug: String, nameEn: String, nameAr: String, descEn: String, descAr: String,
  price: Number, oldPrice: Number,
  category: { main: String, sub: String },
  images: [String], stock: Number, sku: String, badge: String,
  rating: Number, reviewCount: Number, material: String, materialAr: String,
  colors: [String], dimensions: Object, weight: Number, warrantyYears: Number,
  tags: [String], isActive: Boolean, isFeatured: Boolean,
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  name: String, email: String, passwordHash: String, role: String,
  phone: String, isEmailVerified: Boolean, isActive: Boolean,
}, { timestamps: true });

const couponSchema = new mongoose.Schema({
  code: String, type: String, value: Number, minOrderValue: Number,
  maxUses: Number, usedCount: Number, expiresAt: Date, isActive: Boolean,
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);
const User    = mongoose.model('User',    userSchema);
const Coupon  = mongoose.model('Coupon',  couponSchema);

// ─── Seed Data ───────────────────────────────────────────────
// V011: P1-07 — every category field is now `{ main: '...' }`.
const products = [
  { slug: 'oslo-sofa', nameEn: 'Oslo Sofa', nameAr: 'أريكة أوسلو', descEn: 'Premium 3-seater sofa with solid walnut frame and high-density foam cushions covered in premium Italian linen. Available in Ivory, Sage, and Charcoal.', descAr: 'أريكة ثلاثية المقاعد بإطار من خشب الجوز الصلب ووسائد إسفنجية عالية الكثافة مكسوة بالكتان الإيطالي الفاخر.', price: 8500, oldPrice: 10000, category: { main: 'living' }, images: ['https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80'], stock: 15, sku: 'HEM-LIV-0001', badge: 'Best Seller', rating: 4.8, reviewCount: 124, material: 'Walnut Wood, Italian Linen', materialAr: 'خشب الجوز، كتان إيطالي', colors: ['#E8DDD0','#6B7F6A','#3A3A3A'], dimensions: { width: 220, depth: 90, height: 82, unit: 'cm' }, weight: 48, warrantyYears: 5, tags: ['sofa','living','walnut','bestseller'], isActive: true, isFeatured: true },
  { slug: 'zen-platform-bed', nameEn: 'Zen Platform Bed', nameAr: 'سرير زن', descEn: 'Minimalist platform bed with integrated LED lighting and solid oak slats. Available in King and Queen sizes.', descAr: 'سرير بمنصة بسيطة مع إضاءة LED مدمجة وقوائم من خشب البلوط الصلب.', price: 6200, category: { main: 'bedroom' }, images: ['https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=800&q=80'], stock: 8, sku: 'HEM-BED-0001', badge: 'New', rating: 4.9, reviewCount: 87, material: 'Solid Oak', materialAr: 'خشب البلوط الصلب', colors: ['#C4A870','#8B6B3A','#F2EDE6'], dimensions: { width: 220, depth: 220, height: 35, unit: 'cm' }, weight: 65, warrantyYears: 10, tags: ['bed','bedroom','oak','minimalist'], isActive: true, isFeatured: true },
  { slug: 'atlas-dining-table', nameEn: 'Atlas Dining Table', nameAr: 'طاولة أطلس', descEn: 'Extendable solid acacia wood dining table with brushed steel legs. Seats 6 to 10.', descAr: 'طاولة طعام قابلة للتمديد من خشب الأكاسيا الصلب مع أرجل فولاذية مصقولة.', price: 4800, oldPrice: 5500, category: { main: 'dining' }, images: ['https://images.unsplash.com/photo-1617806118233-18e1de247200?w=800&q=80'], stock: 12, sku: 'HEM-DIN-0001', badge: 'Sale', rating: 4.7, reviewCount: 63, material: 'Solid Acacia, Brushed Steel', materialAr: 'خشب الأكاسيا، فولاذ مصقول', colors: ['#B09070','#8B6040'], dimensions: { width: 200, depth: 90, height: 76, unit: 'cm' }, weight: 40, warrantyYears: 5, tags: ['dining','table','acacia','extendable'], isActive: true, isFeatured: true },
  { slug: 'loft-executive-desk', nameEn: 'Loft Executive Desk', nameAr: 'مكتب لوفت', descEn: 'L-shaped executive desk with integrated cable management and premium oak veneer.', descAr: 'مكتب تنفيذي على شكل L مع نظام إدارة الكابلات المدمج وقشرة البلوط الفاخرة.', price: 3200, category: { main: 'office' }, images: ['https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=800&q=80'], stock: 20, sku: 'HEM-OFF-0001', rating: 4.6, reviewCount: 45, material: 'Oak Veneer, Steel', materialAr: 'قشرة بلوط، فولاذ', colors: ['#C4A870','#3A3A3A'], dimensions: { width: 160, depth: 120, height: 75, unit: 'cm' }, weight: 38, warrantyYears: 3, tags: ['desk','office','oak','L-shape'], isActive: true, isFeatured: false },
  { slug: 'mila-armchair', nameEn: 'Mila Armchair', nameAr: 'كرسي ميلا', descEn: 'Luxurious accent chair with full-grain leather and solid walnut legs.', descAr: 'كرسي فاخر بتنجيد جلد طبيعي كامل الحبوب وأرجل من خشب الجوز الصلب.', price: 2900, oldPrice: 3400, category: { main: 'living' }, images: ['https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80'], stock: 30, sku: 'HEM-LIV-0002', badge: 'Sale', rating: 4.9, reviewCount: 156, material: 'Full-Grain Leather, Walnut', materialAr: 'جلد طبيعي، خشب الجوز', colors: ['#8B6040','#1A1208','#C8A880'], dimensions: { width: 80, depth: 82, height: 90, unit: 'cm' }, weight: 22, warrantyYears: 5, tags: ['chair','leather','walnut','accent'], isActive: true, isFeatured: true },
  { slug: 'terra-coffee-table', nameEn: 'Terra Coffee Table', nameAr: 'طاولة قهوة تيرا', descEn: 'Travertine marble top with brushed gold metal base. Each top is unique.', descAr: 'سطح من رخام التراورتين الطبيعي على قاعدة فولاذية ذهبية مصقولة.', price: 2100, oldPrice: 2600, category: { main: 'living' }, images: ['https://images.unsplash.com/photo-1549187774-b4e9b0445b41?w=800&q=80'], stock: 10, sku: 'HEM-LIV-0003', badge: 'Sale', rating: 4.8, reviewCount: 71, material: 'Travertine Marble, Gold Steel', materialAr: 'رخام تراورتين، فولاذ ذهبي', colors: ['#C8B898','#C4A870'], dimensions: { width: 100, depth: 60, height: 42, unit: 'cm' }, weight: 18, warrantyYears: 2, tags: ['table','marble','gold','travertine'], isActive: true, isFeatured: false },
  { slug: 'nordic-bookshelf', nameEn: 'Nordic Bookshelf', nameAr: 'رف كتب نوردك', descEn: 'Scandinavian open bookshelf with 5 adjustable shelves and solid pine frame.', descAr: 'رف كتب مفتوح اسكندنافي بـ ٥ رفوف قابلة للتعديل.', price: 1800, category: { main: 'living' }, images: ['https://images.unsplash.com/photo-1594620302200-9a762244a156?w=800&q=80'], stock: 25, sku: 'HEM-LIV-0004', rating: 4.5, reviewCount: 92, material: 'Solid Pine', materialAr: 'خشب الصنوبر الصلب', colors: ['#D4C4A0'], dimensions: { width: 90, depth: 30, height: 200, unit: 'cm' }, weight: 25, warrantyYears: 3, tags: ['shelf','pine','nordic','scandinavian'], isActive: true, isFeatured: false },
  { slug: 'petra-wardrobe', nameEn: 'Petra Sliding Wardrobe', nameAr: 'خزانة بيترا', descEn: 'Sliding door wardrobe with soft-close mechanism and customizable interior organizers.', descAr: 'خزانة بأبواب منزلقة بآلية إغلاق ناعم ومنظمات داخلية قابلة للتخصيص.', price: 7400, category: { main: 'bedroom' }, images: ['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80'], stock: 5, sku: 'HEM-BED-0002', rating: 4.7, reviewCount: 38, material: 'MDF, Tempered Glass', materialAr: 'MDF، زجاج مقسى', colors: ['#FAF8F5','#3A3A3A'], dimensions: { width: 240, depth: 60, height: 240, unit: 'cm' }, weight: 120, warrantyYears: 5, tags: ['wardrobe','sliding','storage','bedroom'], isActive: true, isFeatured: false },
  { slug: 'porto-outdoor-set', nameEn: 'Porto Outdoor Set', nameAr: 'طقم بورتو الخارجي', descEn: '4-piece outdoor lounge set in weather-resistant PE rattan with Sunbrella cushions.', descAr: 'طقم جلوس خارجي من ٤ قطع من الروطان المقاوم للطقس مع وسائد سانبريلا.', price: 9800, category: { main: 'outdoor' }, images: ['https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80'], stock: 7, sku: 'HEM-OUT-0001', badge: 'New', rating: 4.7, reviewCount: 29, material: 'PE Rattan, Sunbrella', materialAr: 'روطان PE، قماش سانبريلا', colors: ['#C8C8B8','#8A9E7A'], warrantyYears: 3, tags: ['outdoor','rattan','garden','lounge'], isActive: true, isFeatured: false },
  { slug: 'aria-dining-chairs', nameEn: 'Aria Dining Chairs ×4', nameAr: 'كراسي أريا ×٤', descEn: 'Set of 4 upholstered dining chairs with solid beech frame and velvet cushions.', descAr: 'طقم ٤ كراسي طعام مُنجَّدة بإطار من خشب الزان الصلب ووسائد مخملية.', price: 3600, oldPrice: 4200, category: { main: 'dining' }, images: ['https://images.unsplash.com/photo-1533090161767-e6ffed986c88?w=800&q=80'], stock: 18, sku: 'HEM-DIN-0002', badge: 'Sale', rating: 4.6, reviewCount: 54, material: 'Solid Beech, Velvet', materialAr: 'خشب الزان، مخمل', colors: ['#4A6741','#C4788A','#2C3E50'], warrantyYears: 3, tags: ['chair','dining','velvet','set'], isActive: true, isFeatured: false },
];

const coupons = [
  { code: 'WELCOME10', type: 'percentage', value: 10, minOrderValue: 2000, maxUses: 500, usedCount: 0, expiresAt: new Date('2026-12-31'), isActive: true },
  { code: 'SUMMER25',  type: 'percentage', value: 25, minOrderValue: 5000, maxUses: 100, usedCount: 0, expiresAt: new Date('2026-08-31'), isActive: true },
  { code: 'FLAT500',   type: 'fixed',      value: 500, minOrderValue: 3000, maxUses: 200, usedCount: 0, isActive: true },
];

async function seed() {
  // V011: P0-03 — destructive-guard. Refuse to wipe collections in production
  // unless the operator has explicitly opted-in. Print the DB host so the
  // operator can sanity-check the URI before pressing Enter.
  let dbHost = '(unknown)';
  try { dbHost = new URL(URI.replace(/^mongodb(\+srv)?:/, 'http:')).host || dbHost; } catch { /* ignore */ }
  if (process.env.NODE_ENV === 'production' && process.env.SEED_CONFIRM !== 'yes') {
    console.error(`❌ Refusing to seed in production. Set SEED_CONFIRM=yes to override. Host=${dbHost}`);
    process.exit(1);
  }
  console.log(`⚠️  Seeding will WIPE products/users/coupons. Host=${dbHost}`);

  console.log('🌱 Connecting to MongoDB...');
  await mongoose.connect(URI);

  console.log('🗑️  Clearing collections...');
  await Promise.all([Product.deleteMany({}), User.deleteMany({}), Coupon.deleteMany({})]);

  console.log('📦 Seeding products...');
  await Product.insertMany(products);

  console.log('👤 Seeding admin user...');
  // V011: P3-04 — default password strengthened to satisfy the policy enforced
  // in /api/auth/register (≥1 uppercase, ≥1 digit, ≥1 symbol). The operator
  // can still override via ADMIN_PASSWORD.
  // V039 SECURITY FIX [BLOCKER-01]: argon2id with OWASP-recommended parameters,
  // matching ARGON2_OPTIONS in src/lib/auth.ts so argon2Verify() can verify this hash.
  const adminHash = await argon2Hash(
    SEED_ADMIN_PASSWORD!,
    { algorithm: 2, memoryCost: 65536, timeCost: 3, parallelism: 4 }, // 2 = Argon2id
  );
  await (User.create as any)({
    name: 'Hema Admin',
    email: process.env.ADMIN_EMAIL ?? 'admin@hemafurniture.com',
    passwordHash: adminHash,
    role: 'admin',
    isEmailVerified: true,
    isActive: true,
  });

  console.log('🎟️  Seeding coupons...');
  await Coupon.insertMany(coupons);

  console.log(`\n✅ Seeded successfully!`);
  console.log(`   📦 ${products.length} products`);
  console.log(`   👤 1 admin user`);
  console.log(`   🎟️  ${coupons.length} coupons`);
  console.log(`\n🚀 Run: npm run dev`);
  console.log(`   Admin: ${process.env.ADMIN_EMAIL ?? 'admin@hemafurniture.com'}`);

  await mongoose.disconnect();
}

seed().catch((err: unknown) => { console.error('❌ Seed failed:', err); process.exit(1); });
