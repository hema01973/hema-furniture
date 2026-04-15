// src/types/index.ts
export type Locale = 'en' | 'ar';

export interface IProduct {
  _id: string; slug: string; nameEn: string; nameAr: string;
  descEn: string; descAr: string; price: number; oldPrice?: number;
  category: ProductCategory; subcategory?: string; images: string[];
  stock: number; sku: string; badge?: ProductBadge; rating: number;
  reviewCount: number; material?: string; materialAr?: string; colors: string[];
  brand?: string;
  dimensions?: { width: number; depth: number; height: number; unit: 'cm'|'inch' };
  weight?: number; warrantyYears?: number; tags: string[];
  isActive: boolean; isFeatured: boolean;
  metaTitle?: string; metaDesc?: string;
  createdAt: Date; updatedAt: Date;
}
export type ProductCategory = 'living'|'bedroom'|'dining'|'office'|'outdoor';
export type ProductBadge    = 'New'|'Sale'|'Best Seller'|'Limited';

export interface CartItem {
  productId: string; product: IProduct; quantity: number; selectedColor?: string;
}

export interface StatusHistoryEntry {
  status: string; note?: string; timestamp: Date;
}

export interface IOrder {
  _id: string; orderNumber: string;
  userId?: string; guestEmail?: string;
  customer: { firstName: string; lastName: string; email: string; phone: string };
  shippingAddress: { street: string; city: string; governorate: string; postalCode?: string };
  items: Array<{ productId: string; nameEn: string; nameAr: string; price: number; quantity: number; image: string; selectedColor?: string }>;
  subtotal: number; shipping: number; discount: number; total: number;
  paymentMethod: PaymentMethod; paymentStatus: PaymentStatus; paymobOrderId?: string;
  status: OrderStatus;
  statusHistory: StatusHistoryEntry[];
  notes?: string; trackingNumber?: string; trackingUrl?: string;
  estimatedDelivery?: Date; deliveredAt?: Date;
  paymentFailureNotified: boolean;
  createdAt: Date; updatedAt: Date;
}
export type PaymentMethod = 'cod'|'card'|'paymob'|'fawry'|'valu';
export type PaymentStatus = 'pending'|'paid'|'failed'|'refunded';
export type OrderStatus   = 'pending'|'confirmed'|'processing'|'shipped'|'out_for_delivery'|'delivered'|'cancelled';

export interface IUser {
  _id: string; name: string; email: string; phone?: string;
  role: UserRole; avatar?: string;
  addresses: Array<{ _id: string; label: string; street: string; city: string; governorate: string; isDefault: boolean }>;
  wishlist: string[];
  isEmailVerified: boolean; isActive: boolean;
  mfaEnabled: boolean; failedLogins: number; lockedUntil?: Date; lastLoginAt?: Date;
  createdAt: Date;
}
export type UserRole = 'customer'|'admin'|'staff';

export interface IReview {
  _id: string; productId: string; userId: string; userName: string;
  rating: number; title?: string; body: string; images?: string[];
  isVerifiedPurchase: boolean; isApproved: boolean; helpful: number; createdAt: Date;
}

export interface ApiResponse<T = unknown> {
  success: boolean; data?: T; message?: string; error?: string;
  pagination?: { page: number; limit: number; total: number; pages: number };
}

export interface DashboardStats {
  revenue:   { total: number; change: number };
  orders:    { total: number; change: number };
  customers: { total: number; change: number };
  products:  { total: number; active: number };
  recentOrders:  IOrder[];
  topProducts:   Array<{ product: IProduct; sold: number; revenue: number }>;
  revenueChart:  Array<{ date: string; revenue: number; orders: number }>;
  ordersByStatus:Record<OrderStatus, number>;
}
