// src/lib/constants.ts — Single source of truth for shared UI constants
import type { OrderStatus } from '@/types';

// ── Order status badge colours ────────────────────────────────────
export const STATUS_COLOR: Record<OrderStatus, string> = {
  pending:          'bg-amber-100  text-amber-800  dark:bg-amber-900/30  dark:text-amber-300',
  confirmed:        'bg-blue-100   text-blue-800   dark:bg-blue-900/30   dark:text-blue-300',
  processing:       'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  shipped:          'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  out_for_delivery: 'bg-sky-100    text-sky-800    dark:bg-sky-900/30    dark:text-sky-300',
  delivered:        'bg-green-100  text-green-800  dark:bg-green-900/30  dark:text-green-300',
  cancelled:        'bg-red-100    text-red-800    dark:bg-red-900/30    dark:text-red-300',
};

export const PAYMENT_STATUS_COLOR: Record<string, string> = {
  pending:  'text-amber-600 dark:text-amber-400',
  paid:     'text-green-600 dark:text-green-400',
  failed:   'text-red-600   dark:text-red-400',
  refunded: 'text-gray-500  dark:text-gray-400',
};

// ── Order tracking steps ──────────────────────────────────────────
export interface TrackingStep {
  key:   string;
  label: string;
  icon:  string;
}

export const TRACKING_STEPS: TrackingStep[] = [
  { key: 'pending',          label: 'Order Placed',     icon: '🧾' },
  { key: 'confirmed',        label: 'Confirmed',        icon: '✅' },
  { key: 'processing',       label: 'Processing',       icon: '⚙️' },
  { key: 'shipped',          label: 'Shipped',          icon: '🚚' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: '🏠' },
  { key: 'delivered',        label: 'Delivered',        icon: '🎉' },
];

export function getTrackingStepIndex(status: string): number {
  if (status === 'cancelled') return -1;
  return TRACKING_STEPS.findIndex(s => s.key === status);
}

// ── Egyptian governorates ─────────────────────────────────────────
export const GOVERNORATES = [
  'Cairo', 'Giza', 'Alexandria', 'Sheikh Zayed', 'New Cairo',
  'Maadi', 'Heliopolis', '6th of October', 'Mansoura', 'Tanta',
  'Assiut', 'Luxor', 'Aswan', 'Port Said', 'Ismailia', 'Suez',
  'Damietta', 'Qalyubia', 'Sharqia', 'Dakahlia', 'Beheira',
  'Monufia', 'Gharbia', 'Kafr el-Sheikh', 'Beni Suef', 'Minya',
  'Sohag', 'Qena', 'Red Sea', 'New Valley', 'Matrouh', 'North Sinai', 'South Sinai',
];

// ── Product categories ────────────────────────────────────────────
export const PRODUCT_CATEGORIES = [
  { key: 'living',  labelEn: 'Living Room', labelAr: 'غرفة المعيشة', icon: '🛋️' },
  { key: 'bedroom', labelEn: 'Bedroom',     labelAr: 'غرفة النوم',   icon: '🛏️' },
  { key: 'dining',  labelEn: 'Dining Room', labelAr: 'غرفة الطعام',  icon: '🍽️' },
  { key: 'office',  labelEn: 'Office',      labelAr: 'المكتب',       icon: '💼' },
  { key: 'outdoor', labelEn: 'Outdoor',     labelAr: 'الخارج',       icon: '🌿' },
] as const;

// ── Free shipping threshold ───────────────────────────────────────
export const FREE_SHIPPING_THRESHOLD = 5000; // EGP
export const SHIPPING_COST           = 299;  // EGP

// ── Admin role set ────────────────────────────────────────────────
// V036 FIX: Single source of truth for "which roles are admin-level".
// Previously defined independently in 3 files: auth.ts, middleware.ts,
// admin/layout.tsx — a divergence risk that already caused a V009 bug.
// Adding a new privileged role now requires changing ONLY this line.
export const ADMIN_ROLES: ReadonlySet<string> = new Set(['admin', 'manager', 'staff']);

// ── Brand colours ─────────────────────────────────────────────────
export const BRAND = {
  gold:      '#B8935A',
  goldLight: '#D4B07A',
  goldDark:  '#8B6B3A',
  espresso:  '#1A1208',
  cream:     '#FAF8F5',
} as const;
