'use client';
// src/... — HemaV050: refactored into sub-components
import { useState, useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useCartStore } from '@/store/cartStore';
import { formatEGP } from '@/lib/utils';
import { apiFetch } from '@/lib/fetchWithCsrf';

import ShippingForm, { type FormData } from './ShippingForm';
import PaymentMethodSelector, { type PaymentMethod } from './PaymentMethodSelector';
import OrderSummary from './OrderSummary';

type Step = 0 | 1 | 2;

const STEPS = [
  { label: 'Information', short: 'Info'    },
  { label: 'Payment',     short: 'Payment' },
  { label: 'Review',      short: 'Review'  },
];

export default function CheckoutPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { items, subtotal, shipping, total, clearCart } = useCartStore();

  const sub  = subtotal();
  const ship = shipping();
  const tot  = total();

  const [step,       setStep]       = useState<Step>(0);
  const [payMethod,  setPayMethod]  = useState<PaymentMethod>('cod');
  const [couponCode, setCoupon]     = useState('');
  const [couponDisc, setCouponDisc] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [iframeUrl,  setIframeUrl]  = useState<string | null>(null);

  // V027 FIX (Critical #3): persist a stable idempotency key for the lifetime
  // of this checkout session. Using useRef (not useState) ensures the key is
  // generated once per mount and never changes on re-renders. If the user
  // retries after a network failure, the same key is sent so the server returns
  // the existing order instead of creating a duplicate. The key is regenerated
  // when clearCart() triggers an unmount/remount of the checkout page.
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const [form, setForm] = useState<FormData>({
    firstName: (session?.user?.name?.split(' ') ?? [])[0] ?? session?.user?.name ?? '',
    lastName:  session?.user?.name?.split(' ').slice(1).join(' ') ?? '',
    email:     session?.user?.email ?? '',
    phone: '', street: '', city: 'Cairo', notes: '',
  });
  const [formErrors, setFormErrors] = useState<Partial<FormData>>({});

  useEffect(() => {
    if (session?.user) {
      setForm(prev => ({
        ...prev,
        firstName: prev.firstName || ((session.user.name?.split(' ') ?? [])[0] ?? session.user.name ?? ''),
        email:     prev.email     || session.user.email || '',
      }));
    }
  }, [session]);

  useEffect(() => {
    if (!items.length) router.replace('/cart');
  }, [items.length, router]);

  const finalTotal = tot - couponDisc;

  const validateInfo = useCallback((): boolean => {
    const errors: Partial<FormData> = {};
    if (!form.firstName.trim() || form.firstName.length < 2)        errors.firstName = 'At least 2 characters';
    if (!form.lastName.trim()  || form.lastName.length  < 2)        errors.lastName  = 'At least 2 characters';
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Valid email required';
    if (!form.phone || form.phone.replace(/\D/g, '').length < 11)   errors.phone  = 'Valid Egyptian phone required';
    if (!form.street || form.street.length < 5)                      errors.street = 'Full street address required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [form]);

  const applyCoupon = async () => {
    try {
      const res  = await apiFetch('/api/v1/coupons', {
        method: 'POST',
        body: JSON.stringify({ code: couponCode, subtotal: sub }),
      });
      const data = await res.json();
      if (data.success) {
        setCouponDisc(data.data.discount);
        toast.success(`Coupon applied! You save ${formatEGP(data.data.discount)}`);
      } else {
        toast.error(data.error ?? 'Invalid coupon code');
        setCouponDisc(0);
      }
    } catch {
      toast.error('Could not validate coupon. Please try again.');
    }
  };

  const removeCoupon = () => { setCoupon(''); setCouponDisc(0); toast.success('Coupon removed'); };

  const placeOrder = async () => {
    setSubmitting(true);
    try {
      const res  = await apiFetch('/api/v1/orders', {
        method: 'POST',
        // V027 FIX (Critical #3): send idempotency key so server returns the
        // existing order on retry instead of creating a duplicate charge.
        headers: { 'Idempotency-Key': idempotencyKeyRef.current },
        body: JSON.stringify({
          customer: {
            firstName: form.firstName.trim(), lastName: form.lastName.trim(),
            email:     form.email.trim(),     phone:     form.phone.trim(),
          },
          // In Egypt, city and governorate refer to the same administrative level
          shippingAddress: { street: form.street.trim(), city: form.city, governorate: form.city },
          items: items.map(i => ({ productId: i.productId, quantity: i.quantity, selectedColor: i.selectedColor })),
          paymentMethod: payMethod,
          couponCode:    couponCode || undefined,
          notes:         form.notes || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Order failed');
      if (data.data?.iframeUrl) {
        setIframeUrl(data.data.iframeUrl);
      } else {
        clearCart();
        router.replace(`/success?order=${data.data.order.orderNumber}`);
        toast.success('Order placed successfully!');
      }
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Order failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (iframeUrl) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904]">
        <div className="max-w-[800px] mx-auto px-6 py-10">
          <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl overflow-hidden shadow-lg">
            <div className="p-5 border-b border-[#E8DDD0] dark:border-[#2A1F14] flex items-center justify-between">
              <div>
                <h2 className="font-serif text-xl text-[#1A1208] dark:text-[#F0EBE2]">🔒 Secure Payment</h2>
                <p className="text-xs text-gray-400 mt-0.5">Powered by Paymob — PCI DSS Level 1</p>
              </div>
              <div className="flex gap-1.5">
                {['VISA','MC','Meeza','Fawry'].map(m => (
                  <span key={m} className="px-2 py-0.5 bg-[#F2EDE6] dark:bg-white/5 rounded text-[9px] font-bold text-gray-500">{m}</span>
                ))}
              </div>
            </div>
            <iframe src={iframeUrl} className="w-full h-[600px]" allow="payment" title="Paymob Secure Payment" />
          </div>
          <div className="text-center mt-4">
            <button onClick={() => setIframeUrl(null)} className="text-sm text-gray-400 hover:text-gray-600 underline">
              Cancel and go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-center px-4">
        <div>
          <div className="text-5xl mb-4">🛒</div>
          <h2 className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2] mb-3">Your cart is empty</h2>
          <Link href="/shop" className="text-[#B8935A] hover:underline">Browse the shop →</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904]">
      <div className="bg-gradient-to-r from-[#190F07] to-[#3A2010] py-12 px-6">
        <div className="max-w-[1100px] mx-auto">
          <h1 className="font-serif text-4xl text-[#FAF8F5] mb-4">Checkout</h1>
          <nav aria-label="Checkout steps">
            <ol className="flex max-w-xs gap-0">
              {STEPS.map((s, i) => (
                <li
                  key={s.label}
                  className={[
                    'flex-1 py-1.5 text-center text-xs font-semibold border-b-2 transition-colors',
                    step === i ? 'border-[#B8935A] text-[#D4B07A]'
                      : i < step ? 'border-green-500 text-green-400 cursor-pointer'
                      : 'border-white/20 text-white/40',
                  ].join(' ')}
                  aria-current={step === i ? 'step' : undefined}
                  onClick={() => { if (i < step) setStep(i as Step); }}
                >
                  {i < step ? `✓ ${s.short}` : `${i + 1}. ${s.short}`}
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
          <div>
            {step === 0 && (
              <ShippingForm
                form={form} formErrors={formErrors}
                onFieldChange={(field, value) => setForm(p => ({ ...p, [field]: value }))}
                onContinue={() => { if (validateInfo()) setStep(1); }}
              />
            )}
            {step === 1 && (
              <PaymentMethodSelector
                payMethod={payMethod} onMethodChange={setPayMethod}
                couponCode={couponCode} couponDisc={couponDisc} subtotal={sub}
                onCouponCodeChange={setCoupon} onCouponApply={applyCoupon}
                onCouponRemove={removeCoupon}
                onBack={() => setStep(0)} onNext={() => setStep(2)}
              />
            )}
            {step === 2 && (
              <section className="space-y-4" aria-labelledby="review-heading">
                <h2 id="review-heading" className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2]">
                  Review Your Order
                </h2>
                <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm text-[#1A1208] dark:text-[#F0EBE2]">📦 Delivery Address</h3>
                    <button onClick={() => setStep(0)} className="text-xs text-[#B8935A] hover:underline">Edit</button>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    <strong className="text-[#1A1208] dark:text-[#F0EBE2]">{form.firstName} {form.lastName}</strong>
                    <br />{form.street}<br />{form.city}, Egypt
                    <br /><span className="text-gray-400">{form.email} · {form.phone}</span>
                  </p>
                  {form.notes && <p className="mt-2 text-xs text-gray-400 italic">Note: {form.notes}</p>}
                </div>
                <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-[#1A1208] dark:text-[#F0EBE2]">💳 Payment</h3>
                    <button onClick={() => setStep(1)} className="text-xs text-[#B8935A] hover:underline">Edit</button>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    {payMethod === 'cod' ? '💵 Cash on Delivery' : '💳 Online Payment via Paymob'}
                  </p>
                </div>
                <button
                  onClick={placeOrder} disabled={submitting}
                  className="w-full bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold py-4 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base"
                  aria-live="polite"
                >
                  {submitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Placing order…
                    </>
                  ) : (
                    payMethod === 'cod' ? '✓ Place Order' : '🔒 Proceed to Secure Payment'
                  )}
                </button>
                <p className="text-center text-xs text-gray-400">
                  By placing your order you agree to our{' '}
                  <Link href="/terms" className="text-[#B8935A] hover:underline">Terms of Service</Link>
                  {' '}and{' '}
                  <Link href="/privacy" className="text-[#B8935A] hover:underline">Privacy Policy</Link>.
                </p>
                <button onClick={() => setStep(1)} className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                  ← Back to Payment
                </button>
              </section>
            )}
          </div>
          <OrderSummary
            items={items} subtotal={sub} shipping={ship}
            couponDisc={couponDisc} finalTotal={finalTotal}
          />
        </div>
      </div>
    </div>
  );
}
