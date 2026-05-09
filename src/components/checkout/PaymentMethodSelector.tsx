'use client';
// src/... — HemaV050: extracted from CheckoutPage
import toast from 'react-hot-toast';
import { useState } from 'react';
import { formatEGP } from '@/lib/utils';

export type PaymentMethod = 'cod' | 'paymob';

interface PaymentMethodSelectorProps {
  payMethod: PaymentMethod;
  onMethodChange: (method: PaymentMethod) => void;
  couponCode: string;
  couponDisc: number;
  onCouponCodeChange: (code: string) => void;
  onCouponApply: () => Promise<void>;
  onCouponRemove: () => void;
  subtotal: number;
  onBack: () => void;
  onNext: () => void;
}

export default function PaymentMethodSelector({
  payMethod, onMethodChange,
  couponCode, couponDisc,
  onCouponCodeChange, onCouponApply, onCouponRemove,
  onBack, onNext,
}: PaymentMethodSelectorProps) {
  const [couponLoading, setCouponLoading] = useState(false);

  const handleApply = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    try {
      await onCouponApply();
    } finally {
      setCouponLoading(false);
    }
  };

  const PAYMENT_OPTIONS: Array<{ value: PaymentMethod; icon: string; title: string; desc: string; badges?: string[] }> = [
    {
      value: 'cod',
      icon: '💵',
      title: 'Cash on Delivery',
      desc: 'Pay when your order arrives at your door',
    },
    {
      value: 'paymob',
      icon: '💳',
      title: 'Online Payment — Paymob',
      desc: 'Visa, Mastercard, Meeza, Fawry, Valu — Secure checkout',
      badges: ['VISA', 'MC', 'Meeza', 'Fawry', 'Valu'],
    },
  ];

  return (
    <section
      className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6 mb-5"
      aria-labelledby="payment-heading"
    >
      <h2 id="payment-heading" className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2] mb-5">
        Payment Method
      </h2>

      {PAYMENT_OPTIONS.map(opt => (
        <label
          key={opt.value}
          className={[
            'flex items-start gap-4 p-4 rounded-xl border-2 mb-3 cursor-pointer transition-all',
            payMethod === opt.value
              ? 'border-[#B8935A] bg-[#B8935A]/5'
              : 'border-[#E8DDD0] dark:border-[#2A1F14] hover:border-[#D4B07A]',
          ].join(' ')}
        >
          <input
            type="radio" name="payMethod" value={opt.value}
            checked={payMethod === opt.value}
            onChange={() => onMethodChange(opt.value)}
            className="mt-0.5 accent-[#B8935A]"
            aria-label={opt.title}
          />
          <div className="flex-1">
            <div className="font-semibold text-sm text-[#1A1208] dark:text-[#F0EBE2]">
              {opt.icon} {opt.title}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
            {opt.badges && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {opt.badges.map(b => (
                  <span key={b} className="px-2 py-0.5 bg-[#F2EDE6] dark:bg-white/5 rounded text-[10px] font-bold text-gray-500">
                    {b}
                  </span>
                ))}
              </div>
            )}
          </div>
        </label>
      ))}

      {/* Coupon */}
      <div className="mt-5 pt-5 border-t border-[#E8DDD0] dark:border-[#2A1F14]">
        <label htmlFor="coupon" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Coupon Code
        </label>

        {couponDisc > 0 ? (
          <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="text-green-600 dark:text-green-400 text-sm font-semibold">✓ {couponCode}</span>
              <span className="text-green-600 dark:text-green-400 text-sm">−{formatEGP(couponDisc)} saved</span>
            </div>
            <button
              onClick={onCouponRemove}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              aria-label="Remove coupon"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              id="coupon" type="text"
              value={couponCode}
              onChange={e => onCouponCodeChange(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') handleApply(); }}
              placeholder="WELCOME10"
              className="flex-1 rounded-xl border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-2.5 text-sm bg-[#FAF8F5] dark:bg-[#0E0904] text-[#1A1208] dark:text-[#F0EBE2] focus:outline-none focus:border-[#B8935A] focus:ring-2 focus:ring-[#B8935A]/10 font-mono tracking-wider transition-all"
              aria-label="Coupon code"
            />
            <button
              onClick={handleApply}
              disabled={couponLoading || !couponCode.trim()}
              className="px-4 py-2.5 bg-[#F2EDE6] dark:bg-white/10 border border-[#E8DDD0] dark:border-[#2A1F14] rounded-xl text-sm font-medium hover:bg-[#E8DDD0] dark:hover:bg-white/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[72px]"
            >
              {couponLoading
                ? <div className="w-4 h-4 border-2 border-[#B8935A] border-t-transparent rounded-full animate-spin mx-auto" />
                : 'Apply'}
            </button>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 mt-6">
        <button
          onClick={onBack}
          className="flex-1 py-3.5 rounded-xl border border-[#E8DDD0] dark:border-[#2A1F14] text-sm font-medium text-gray-500 hover:bg-[#F2EDE6] dark:hover:bg-white/5 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          className="flex-[2] bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold py-3.5 rounded-xl transition-colors"
        >
          Review Order →
        </button>
      </div>
    </section>
  );
}
