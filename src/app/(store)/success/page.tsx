'use client';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function SuccessPage() {
  const searchParams = useSearchParams();
  const orderNum = searchParams.get('order') ?? '';
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 bg-[#FAF8F5] dark:bg-[#0E0904]">
      <div className="max-w-lg w-full text-center">
        <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-5xl mx-auto mb-6 border-2 border-green-200 dark:border-green-800">✅</div>
        <h1 className="font-serif text-4xl text-[#1A1208] dark:text-[#F0EBE2] mb-3">Order Confirmed!</h1>
        {orderNum && <p className="text-sm text-[#B8935A] font-mono font-semibold mb-3">{orderNum}</p>}
        <p className="text-gray-400 mb-8 leading-relaxed">Thank you for your order! We&apos;ll contact you within 24 hours to confirm. Estimated delivery 5–7 working days.</p>
        {/* Order tracking steps */}
        <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6 mb-8 text-left">
          <h3 className="font-semibold text-sm text-[#1A1208] dark:text-[#F0EBE2] mb-4">Order Tracking</h3>
          {[
            { label: 'Order Received',  sub: 'Your order has been confirmed',        done: true  },
            { label: 'Processing',      sub: 'Our team is preparing your order',      done: false, cur: true },
            { label: 'Out for Delivery',sub: 'Your order is on its way',             done: false },
            { label: 'Delivered',       sub: 'Enjoy your new furniture!',            done: false },
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3 mb-4 last:mb-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${step.done ? 'bg-[#B8935A] text-white' : step.cur ? 'border-2 border-[#B8935A] text-[#B8935A]' : 'border-2 border-[#E8DDD0] dark:border-[#2A1F14] text-gray-300'}`}>
                {step.done ? '✓' : step.cur ? '⟳' : '○'}
              </div>
              <div>
                <div className={`text-sm font-medium ${step.done || step.cur ? 'text-[#1A1208] dark:text-[#F0EBE2]' : 'text-gray-400'}`}>{step.label}</div>
                <div className="text-xs text-gray-400">{step.sub}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/" className="bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold px-8 py-3 rounded-xl transition-colors">Back to Home</Link>
          <Link href="/orders" className="border border-[#E8DDD0] dark:border-[#2A1F14] text-[#1A1208] dark:text-[#F0EBE2] hover:border-[#B8935A] font-semibold px-8 py-3 rounded-xl transition-colors">View Orders</Link>
        </div>
      </div>
    </div>
  );
}
