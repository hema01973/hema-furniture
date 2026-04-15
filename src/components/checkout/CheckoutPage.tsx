'use client';
// src/components/checkout/CheckoutPage.tsx
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/store/cartStore';
import toast from 'react-hot-toast';

const GOVS = ['Cairo','Giza','Alexandria','Sheikh Zayed','New Cairo','Maadi','Heliopolis','6th of October','Mansoura','Tanta','Assiut','Luxor','Aswan'];

type Step = 'info' | 'payment' | 'confirm';

export default function CheckoutPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { items, subtotal, shipping, total, clearCart } = useCartStore();
  const sub = subtotal(); const ship = shipping(); const tot = total();

  const [step, setStep]         = useState<Step>('info');
  const [payMethod, setPayM]    = useState<'cod'|'card'|'paymob'>('cod');
  const [couponCode, setCoupon] = useState('');
  const [couponDisc, setCouponDisc] = useState(0);
  const [checkingCoupon, setChkCoupon] = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [iframeUrl, setIframeUrl]     = useState('');

  const [form, setForm] = useState({
    firstName: session?.user?.name?.split(' ')[0] ?? '',
    lastName:  session?.user?.name?.split(' ')[1] ?? '',
    email:     session?.user?.email ?? '',
    phone: '', street: '', city: 'Cairo', notes: '',
  });
  const [errs, setErrs] = useState<Record<string,string>>({});

  if (!items.length) {
    if (typeof window !== 'undefined') router.replace('/cart');
    return null;
  }

  const validateInfo = () => {
    const e: Record<string,string> = {};
    if (!form.firstName.trim() || form.firstName.length < 2) e.firstName = 'Required';
    if (!form.lastName.trim()  || form.lastName.length  < 2) e.lastName  = 'Required';
    if (!form.email || !/\S+@\S+\.\S+/.test(form.email))    e.email     = 'Valid email required';
    if (!form.phone || form.phone.length < 11)               e.phone     = 'Valid phone required';
    if (!form.street || form.street.length < 5)             e.street    = 'Full address required';
    setErrs(e);
    return !Object.keys(e).length;
  };

  const validateCoupon = async () => {
    if (!couponCode.trim()) return;
    setChkCoupon(true);
    try {
      const res  = await fetch('/api/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: couponCode, subtotal: sub }) });
      const data = await res.json();
      if (data.success) { setCouponDisc(data.data.discount); toast.success(`Coupon applied! -EGP ${data.data.discount}`); }
      else              { toast.error(data.error); setCouponDisc(0); }
    } catch { toast.error('Failed to validate coupon'); }
    setChkCoupon(false);
  };

  const placeOrder = async () => {
    setSubmitting(true);
    try {
      const body = {
        customer: { firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone },
        shippingAddress: { street: form.street, city: form.city, governorate: form.city },
        items: items.map(i => ({ productId: i.productId, quantity: i.quantity, selectedColor: i.selectedColor })),
        paymentMethod: payMethod,
        couponCode: couponCode || undefined,
        notes: form.notes || undefined,
      };
      const res  = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      if (data.data.iframeUrl) {
        setIframeUrl(data.data.iframeUrl);
        setStep('confirm');
      } else {
        clearCart();
        router.replace(`/success?order=${data.data.order.orderNumber}`);
      }
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Order failed. Please try again.');
    }
    setSubmitting(false);
  };

  const finalTotal = tot - couponDisc;

  const field = (key: keyof typeof form, label: string, type = 'text', ph = '') => (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} placeholder={ph} autoComplete={key}
        className={`w-full rounded-xl border px-4 py-3 text-sm bg-[#FAF8F5] dark:bg-[#0E0904] text-[#1A1208] dark:text-[#F0EBE2] focus:outline-none focus:border-[#B8935A] focus:ring-2 focus:ring-[#B8935A]/10 transition-all ${errs[key] ? 'border-red-400' : 'border-[#D0C4B4] dark:border-[#3A2D20]'}`}/>
      {errs[key] && <p className="text-xs text-red-500 mt-1">{errs[key]}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904]">
      <div className="bg-gradient-to-r from-[#190F07] to-[#3A2010] py-12 px-6">
        <div className="max-w-[1100px] mx-auto">
          <h1 className="font-serif text-4xl text-[#FAF8F5] mb-4">Checkout</h1>
          {/* Step indicator */}
          <div className="flex gap-0 max-w-xs">
            {(['info','payment','confirm'] as Step[]).map((s, i) => (
              <div key={s} className={`flex-1 py-1.5 text-center text-xs font-semibold capitalize border-b-2 transition-colors ${step === s ? 'border-[#B8935A] text-[#D4B07A]' : i < ['info','payment','confirm'].indexOf(step) ? 'border-green-500 text-green-400' : 'border-white/20 text-white/40'}`}>
                {i < ['info','payment','confirm'].indexOf(step) ? '✓ ' : `${i+1}. `}{s}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-6 py-10">
        {iframeUrl ? (
          <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-[#E8DDD0] dark:border-[#2A1F14]">
              <h2 className="font-serif text-xl text-[#1A1208] dark:text-[#F0EBE2]">🔒 Secure Payment — Paymob</h2>
              <p className="text-sm text-gray-400 mt-1">You will be redirected to Paymob&apos;s secure payment page</p>
            </div>
            <iframe src={iframeUrl} className="w-full h-[600px]" allow="payment" title="Paymob Payment" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
            {/* Left */}
            <div>
              {step === 'info' && (
                <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6 mb-5">
                  <h2 className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2] mb-5">Billing Information</h2>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {field('firstName','First Name','text','Mohamed')}
                    {field('lastName','Last Name','text','Ahmed')}
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {field('email','Email','email','you@example.com')}
                    {field('phone','Phone','tel','+20 1XX XXX XXXX')}
                  </div>
                  {field('street','Street Address','text','12 El-Tahrir Street, Apartment 3')}
                  <div className="mt-4">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">City / Governorate</label>
                    <select value={form.city} onChange={e => setForm(p=>({...p,city:e.target.value}))}
                      className="w-full rounded-xl border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-3 text-sm bg-[#FAF8F5] dark:bg-[#0E0904] text-[#1A1208] dark:text-[#F0EBE2] focus:outline-none focus:border-[#B8935A]">
                      {GOVS.map(g => <option key={g}>{g}</option>)}
                    </select>
                  </div>
                  <div className="mt-4">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Order Notes (optional)</label>
                    <textarea value={form.notes} onChange={e => setForm(p=>({...p,notes:e.target.value}))} rows={2} placeholder="Any special instructions..."
                      className="w-full rounded-xl border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-3 text-sm bg-[#FAF8F5] dark:bg-[#0E0904] text-[#1A1208] dark:text-[#F0EBE2] focus:outline-none focus:border-[#B8935A] resize-none"/>
                  </div>
                  <button onClick={() => { if (validateInfo()) setStep('payment'); }}
                    className="mt-6 w-full bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold py-3.5 rounded-xl transition-colors">
                    Continue to Payment →
                  </button>
                </div>
              )}

              {step === 'payment' && (
                <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6 mb-5">
                  <h2 className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2] mb-5">Payment Method</h2>
                  {[
                    { key: 'cod',    icon: '💵', title: 'Cash on Delivery', sub: 'Pay when your order arrives at your door' },
                    { key: 'paymob', icon: '💳', title: 'Online Payment (Paymob)', sub: 'Visa, Mastercard, Meeza, Fawry, Valu — Secure checkout' },
                  ].map(opt => (
                    <label key={opt.key}
                      className={`flex items-start gap-4 p-4 rounded-xl border-2 mb-3 cursor-pointer transition-all ${payMethod === opt.key ? 'border-[#B8935A] bg-[#B8935A]/5' : 'border-[#E8DDD0] dark:border-[#2A1F14] hover:border-[#D4B07A]'}`}>
                      <input type="radio" name="pay" value={opt.key} checked={payMethod === opt.key as 'cod'|'card'|'paymob'} onChange={() => setPayM(opt.key as 'cod'|'card'|'paymob')} className="mt-0.5 accent-[#B8935A]"/>
                      <div className="flex-1">
                        <div className="font-semibold text-sm text-[#1A1208] dark:text-[#F0EBE2]">{opt.icon} {opt.title}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{opt.sub}</div>
                        {opt.key === 'paymob' && (
                          <div className="flex gap-1.5 mt-2 flex-wrap">
                            {['VISA','MC','Meeza','Fawry','Valu'].map(m => <span key={m} className="px-2 py-0.5 bg-[#F2EDE6] dark:bg-white/5 rounded text-[10px] font-bold text-gray-500">{m}</span>)}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}

                  {/* Coupon */}
                  <div className="mt-5 pt-5 border-t border-[#E8DDD0] dark:border-[#2A1F14]">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Coupon Code</label>
                    <div className="flex gap-2">
                      <input type="text" value={couponCode} onChange={e => setCoupon(e.target.value.toUpperCase())} placeholder="WELCOME10"
                        className="flex-1 rounded-xl border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-2.5 text-sm bg-[#FAF8F5] dark:bg-[#0E0904] text-[#1A1208] dark:text-[#F0EBE2] focus:outline-none focus:border-[#B8935A] font-mono tracking-wider"/>
                      <button onClick={validateCoupon} disabled={checkingCoupon || !couponCode}
                        className="px-4 py-2.5 bg-[#F2EDE6] dark:bg-white/10 border border-[#E8DDD0] dark:border-[#2A1F14] rounded-xl text-sm font-medium hover:bg-[#E8DDD0] transition-colors disabled:opacity-50">
                        {checkingCoupon ? '...' : 'Apply'}
                      </button>
                    </div>
                    {couponDisc > 0 && <p className="text-xs text-green-600 mt-1.5 font-medium">✓ Discount applied: -EGP {couponDisc}</p>}
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button onClick={() => setStep('info')} className="flex-1 py-3.5 rounded-xl border border-[#E8DDD0] dark:border-[#2A1F14] text-sm font-medium text-gray-500 hover:bg-[#F2EDE6] transition-colors">← Back</button>
                    <button onClick={placeOrder} disabled={submitting}
                      className="flex-[2] bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold py-3.5 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                      {submitting ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Placing order...</> : 'Place Order →'}
                    </button>
                  </div>
                  <p className="text-center text-xs text-gray-400 mt-3">🔒 Secure 256-bit SSL encryption · PCI DSS compliant</p>
                </div>
              )}
            </div>

            {/* Order Summary */}
            <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6 h-fit sticky top-24">
              <h2 className="font-serif text-xl text-[#1A1208] dark:text-[#F0EBE2] mb-4">Order Summary</h2>
              <div className="space-y-3 mb-4 max-h-52 overflow-y-auto">
                {items.map(item => (
                  <div key={item.productId} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#F2EDE6] dark:bg-[#221710] flex items-center justify-center text-lg flex-shrink-0">🛋️</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#1A1208] dark:text-[#F0EBE2] truncate">{item.product.nameEn}</div>
                      <div className="text-xs text-gray-400">×{item.quantity}</div>
                    </div>
                    <div className="text-sm font-semibold text-[#B8935A] flex-shrink-0">EGP {(item.product.price * item.quantity).toLocaleString()}</div>
                  </div>
                ))}
              </div>
              <div className="border-t border-[#E8DDD0] dark:border-[#2A1F14] pt-4 space-y-2.5">
                <div className="flex justify-between text-sm text-[#1A1208] dark:text-[#F0EBE2]"><span className="text-gray-400">Subtotal</span><span>EGP {sub.toLocaleString()}</span></div>
                {couponDisc > 0 && <div className="flex justify-between text-sm text-green-600"><span>Discount</span><span>-EGP {couponDisc}</span></div>}
                <div className="flex justify-between text-sm text-[#1A1208] dark:text-[#F0EBE2]"><span className="text-gray-400">Shipping</span><span className={ship===0?'text-green-600 font-medium':''}>{ship===0?'Free':`EGP ${ship}`}</span></div>
                <div className="flex justify-between font-bold border-t border-[#E8DDD0] dark:border-[#2A1F14] pt-3 mt-1">
                  <span className="text-[#1A1208] dark:text-[#F0EBE2]">Total</span>
                  <span className="font-serif text-2xl text-[#B8935A]">EGP {finalTotal.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
