// src/... — HemaV050: extracted from CheckoutPage (Server-safe, no hooks)
import Image from 'next/image';
import { formatEGP } from '@/lib/utils';

interface CartItem {
  productId: string;
  quantity: number;
  product: { nameEn: string; images?: string[]; price: number };
}

interface OrderSummaryProps {
  items: CartItem[];
  subtotal: number;
  shipping: number;
  couponDisc: number;
  finalTotal: number;
}

export default function OrderSummary({
  items, subtotal, shipping, couponDisc, finalTotal,
}: OrderSummaryProps) {
  return (
    <aside className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6 h-fit sticky top-24">
      <h2 className="font-serif text-xl text-[#1A1208] dark:text-[#F0EBE2] mb-4">
        Order Summary
      </h2>

      {/* Items */}
      <div className="space-y-3 mb-4 max-h-56 overflow-y-auto pr-1">
        {items.map(item => (
          <div key={item.productId} className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#F2EDE6] dark:bg-[#221710] flex-shrink-0">
              {item.product.images?.[0] ? (
                <Image
                  src={item.product.images[0]}
                  alt={item.product.nameEn}
                  width={48} height={48}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xl">🛋️</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#1A1208] dark:text-[#F0EBE2] truncate">
                {item.product.nameEn}
              </div>
              <div className="text-xs text-gray-400">×{item.quantity}</div>
            </div>
            <div className="text-sm font-semibold text-[#B8935A] flex-shrink-0 tabular-nums">
              {formatEGP(item.product.price * item.quantity)}
            </div>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="border-t border-[#E8DDD0] dark:border-[#2A1F14] pt-4 space-y-2.5">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Subtotal</span>
          <span className="text-[#1A1208] dark:text-[#F0EBE2] tabular-nums">{formatEGP(subtotal)}</span>
        </div>
        {couponDisc > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-green-600 dark:text-green-400">Discount</span>
            <span className="text-green-600 dark:text-green-400 tabular-nums">−{formatEGP(couponDisc)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Shipping</span>
          <span className={shipping === 0 ? 'text-green-600 dark:text-green-400 font-medium' : 'text-[#1A1208] dark:text-[#F0EBE2] tabular-nums'}>
            {shipping === 0 ? '✓ Free' : formatEGP(shipping)}
          </span>
        </div>
        <div className="flex justify-between font-bold border-t border-[#E8DDD0] dark:border-[#2A1F14] pt-3 mt-1">
          <span className="text-[#1A1208] dark:text-[#F0EBE2]">Total</span>
          <span className="font-serif text-2xl text-[#B8935A] tabular-nums">
            {formatEGP(finalTotal)}
          </span>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 mt-4">
        🔒 256-bit SSL · PCI DSS compliant
      </p>
    </aside>
  );
}
